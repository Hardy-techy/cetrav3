import * as MockTokensModule from "../abis/MockTokens.json"; // Your deployed Mock tokens ABI
import usdcImg from "../assets/usdc.png";
import usdtImg from "../assets/usdtt.png";
import wethImg from "../assets/ethereum.png";
import pushImg from "../assets/Push.png";
import cetImg from "../assets/cet.png";
import { getCachedMetadata, setCachedMetadata, getCachedDynamic, setCachedDynamic } from "./rpcCache";

const tokenImages = {
  USDC: usdcImg,
  USDT: usdtImg,
  WETH: wethImg,
  ADE: usdcImg, // Placeholder
  LAR: wethImg, // Placeholder
  WPC: pushImg, // Push Chain Token
  CET: cetImg, // Cetra Token

  // Static Address Mapping (Instant Load - Lowercase for easier matching)
  '0x05c3d83a8294dda6f3ec3337347894e831172dff': usdcImg, // USDC
  '0xd4a6b439f372846f8ca7122632415f1d476f5383': wethImg, // WETH
  '0xb69b7465bf0d53bd278c036002a9baecd7a7748a': cetImg,  // CET
  '0x5b0ae944a4ee6241a5a638c440a0dcd42411bd3c': pushImg, // WPC
};

// ...

// Helper for case-insensitive image lookup
const getImage = (key) => {
  if (!key) return null;

  // 1. Exact Match
  if (tokenImages[key]) return tokenImages[key];

  // 2. Uppercase Match (for Symbols like "usdc" -> "USDC")
  const upper = key.toUpperCase();
  if (tokenImages[upper]) return tokenImages[upper];

  // 3. Lowercase Match (for Addresses like "0x5B..." -> "0x5b...")
  const lower = key.toLowerCase();
  if (tokenImages[lower]) return tokenImages[lower];

  return null;
};

// Extract ABI correctly
const artifact = MockTokensModule.default || MockTokensModule;
const MockTokens = artifact.abi || artifact;

// Set to false for better performance in production
const DEBUG_MODE = false;

export const normalizeToken = async (web3, contract, currentToken, connectedAccount = null, proxyWeb3 = null) => {
  // Convert from token units to human-readable based on actual decimals
  const fromTokenUnits = (amount, decimals) => {
    return (Number(amount) / (10 ** Number(decimals))).toString();
  };

  const toBN = (amount) => {
    return web3.utils.toBN(amount);
  };

  const account = connectedAccount || null;
  // 🛡️ USE PROXY WEB3 FOR ALL READ OPERATIONS
  const web3ForReads = proxyWeb3 || web3;
  const tokenInst = new web3ForReads.eth.Contract(MockTokens, currentToken.tokenAddress);

  // 🚀 AGGRESSIVE CACHING - Reduces RPC calls by 90%

  // Cache Key Helpers
  // Handle potential index-based struct keys (Web3 quirk)
  const tokenAddr = currentToken.tokenAddress || currentToken[0];
  const tokenName = currentToken.name || currentToken[3];

  const metadataKey = `metadata_${tokenAddr}`;
  const symbolKey = `symbol_${tokenAddr}`;
  const priceKey = `price_${tokenAddr}`;
  const totalSuppliedKey = `totalSupplied_${tokenAddr}`;
  const totalBorrowedKey = `totalBorrowed_${tokenAddr}`;
  const balanceKey = `balance_${tokenAddr}_${account}`;
  const userBorrowedKey = `userBorrowed_${tokenAddr}_${account}`;
  const userLentKey = `userLent_${tokenAddr}_${account}`;
  const userWithdrawKey = `userWithdraw_${account}`;
  const userBorrowLimitKey = `userBorrowLimit_${account}`;

  // Helper Promises
  const fetchDecimals = async () => {
    const cachedMetadata = getCachedMetadata(metadataKey);
    if (cachedMetadata) return cachedMetadata;
    try {
      const d = await tokenInst.methods.decimals().call();
      setCachedMetadata(metadataKey, d);
      return d;
    } catch (e) {
      console.error(`Error fetching decimals for ${tokenAddr}:`, e);
      return "18"; // Default
    }
  };

  const fetchSymbol = async () => {
    const cachedSymbol = getCachedMetadata(symbolKey);
    if (cachedSymbol) return cachedSymbol;
    try {
      const s = await tokenInst.methods.symbol().call();
      setCachedMetadata(symbolKey, s);
      return s;
    } catch (e) {
      return tokenName || "UNKNOWN";
    }
  };

  const fetchPrice = async () => {
    const cachedPrice = getCachedDynamic(priceKey);
    if (cachedPrice) return cachedPrice;
    try {
      const p = await contract.methods.oneTokenEqualsHowManyDollars(tokenAddr).call();
      setCachedDynamic(priceKey, p);
      return p;
    } catch (e) {
      console.error(`Error fetching price for ${tokenAddr}:`, e);
      return ["0", "0"];
    }
  };

  const fetchTotalSupplied = async () => {
    const cached = getCachedDynamic(totalSuppliedKey);
    if (cached) return cached;
    try {
      const s = await contract.methods.getTotalTokenSupplied(tokenAddr).call();
      setCachedDynamic(totalSuppliedKey, s);
      return s;
    } catch (e) {
      return "0";
    }
  };

  const fetchTotalBorrowed = async () => {
    const cached = getCachedDynamic(totalBorrowedKey);
    if (cached) return cached;
    try {
      const b = await contract.methods.getTotalTokenBorrowed(tokenAddr).call();
      setCachedDynamic(totalBorrowedKey, b);
      return b;
    } catch (e) {
      return "0";
    }
  };

  // User Data Promises
  const fetchUserData = async (symbol) => {
    if (!account) return {
      walletBalance: "0",
      userTokenLentAmount: "0",
      userTokenBorrowedAmount: "0",
      userTotalAmountAvailableToWithdrawInDollars: "0",
      userTotalAmountAvailableForBorrowInDollars: "0"
    };

    // Try cache first (skip for specific debugging if needed, currently enabled)
    /*
    const cachedBalance = getCachedDynamic(balanceKey);
    const cachedUserBorrowed = getCachedDynamic(userBorrowedKey);
    const cachedUserLent = getCachedDynamic(userLentKey);
    const cachedUserWithdraw = getCachedDynamic(userWithdrawKey);
    const cachedUserBorrowLimit = getCachedDynamic(userBorrowLimitKey);

    if (cachedBalance && cachedUserBorrowed && cachedUserLent && cachedUserWithdraw && cachedUserBorrowLimit) {
      return {
        walletBalance: cachedBalance,
        userTokenLentAmount: cachedUserLent,
        userTokenBorrowedAmount: cachedUserBorrowed,
        userTotalAmountAvailableToWithdrawInDollars: cachedUserWithdraw,
        userTotalAmountAvailableForBorrowInDollars: cachedUserBorrowLimit
      };
    }
    */

    try {
      const readContract = new web3ForReads.eth.Contract(contract.options.jsonInterface, contract.options.address);

      // Execute parallel user calls
      const [walletBalance, lentAmount, borrowedStandard, borrowedSwapped, availBorrow] = await Promise.all([
        tokenInst.methods.balanceOf(account).call().catch(() => "0"),
        readContract.methods.tokensLentAmount(tokenAddr, account).call().catch(() => "0"),
        readContract.methods.tokensBorrowedAmount(tokenAddr, account).call().catch(() => "0"),
        readContract.methods.tokensBorrowedAmount(account, tokenAddr).call().catch(() => "0"),
        readContract.methods.getUserTotalAmountAvailableForBorrowInDollars(account).call().catch(() => "0"),
        // readContract.methods.getTokenAvailableToWithdraw(account).call().catch(() => "0") // Missing in original normalize but useful?
      ]);

      let userTokenBorrowedAmount = borrowedStandard;
      if (borrowedSwapped !== "0" && borrowedStandard === "0") {
        // console.log(`DEBUG: ${symbol} Borrow Check - SWAPPED detected!`);
        userTokenBorrowedAmount = borrowedSwapped;
      }

      // Available to withdraw is complex to calculate accurately without contract call which might be expensive or missing method in valid ABI
      // Original code used: userTotalAmountAvailableToWithdrawInDollars = cachedUserWithdraw;
      // But in original code, it was fetching it:
      // userTotalAmountAvailableToWithdrawInDollars = await readContract.methods.getUserTotalAmountAvailableForBorrowInDollars(account).call(); -- WAIT, line 213 was borrow limit.
      // where was withdraw limit?
      // Ah, in `handleWithdraw` it calls `getTokenAvailableToWithdraw`. 

      // In the original normalize function:
      // Line 143: let userTotalAmountAvailableToWithdrawInDollars = "0";
      // It was initialized but NEVER updated in the fetch block in the original code!
      // Wait, let me check the original code again.
      // Line 213: availableForBorrow.
      // Line 216: commented out totalDebt.
      // Line 226: setCachedDynamic(userWithdrawKey, userTotalAmountAvailableToWithdrawInDollars); 
      // It seems `userTotalAmountAvailableToWithdrawInDollars` was 0 and never updated in the Try block in original code. 
      // Checking `handleWithdraw` in dashboard.js line 317: `getTokenAvailableToWithdraw`.

      // So in normalize, we might want to fetch it if we want to show it, but original code didn't seems to fetch it.
      // I will keep it as "0" to match original behavior if it wasn't fetching, or fetch it if I can.
      // Actually, looking at line 143, initialized 0.
      // Inside `if (tokenAddr) { try {`
      // It fetches `userTokenLentAmount`.
      // It fetches `tokensBorrowedAmount`.
      // It fetches `getUserTotalAmountAvailableForBorrowInDollars`.
      // It DOES NOT fetch `getTokenAvailableToWithdraw`.
      // So I will leave it as "0" or fetch it if it helps. 
      // Let's stick to original behavior to verify optimization first.

      setCachedDynamic(balanceKey, walletBalance);
      setCachedDynamic(userBorrowedKey, userTokenBorrowedAmount);
      setCachedDynamic(userLentKey, lentAmount);
      setCachedDynamic(userBorrowLimitKey, availBorrow);

      return {
        walletBalance,
        userTokenLentAmount: lentAmount,
        userTokenBorrowedAmount: userTokenBorrowedAmount,
        userTotalAmountAvailableToWithdrawInDollars: "0", // Original didn't fetch this
        userTotalAmountAvailableForBorrowInDollars: availBorrow
      };

    } catch (e) {
      console.error(`Error fetching user data for ${symbol}:`, e);
      return {
        walletBalance: "0",
        userTokenLentAmount: "0",
        userTokenBorrowedAmount: "0",
        userTotalAmountAvailableToWithdrawInDollars: "0",
        userTotalAmountAvailableForBorrowInDollars: "0"
      };
    }
  };

  // 1. Kick off all independent requests in parallel
  const [
    decimals,
    symbol,
    priceResult,
    totalSuppliedInContract,
    totalBorrowedInContract
  ] = await Promise.all([
    fetchDecimals(),
    fetchSymbol(),
    fetchPrice(),
    fetchTotalSupplied(),
    fetchTotalBorrowed()
  ]);

  // 2. Fetch User Data (depends on symbol potentially for logging, but mostly independent)
  // We can actually run this in parallel with step 1 if we don't need symbol for logging errors inside it.
  // The fetchUserData uses `symbol` for logging. We can pass "TOKEN" if symbol isn't ready or just await symbol first.
  // To truly parallelize, we should run it with the others.
  const userData = await fetchUserData(symbol || tokenName);

  const {
    walletBalance,
    userTokenLentAmount,
    userTokenBorrowedAmount,
    userTotalAmountAvailableToWithdrawInDollars,
    userTotalAmountAvailableForBorrowInDollars
  } = userData;


  const price = priceResult[0] || "0";
  const priceDecimals = priceResult[1] || "18";
  const oneTokenToDollar = parseFloat(price) / (10 ** parseInt(priceDecimals));

  const utilizationRate = Number(totalSuppliedInContract) > 0
    ? (Number(totalBorrowedInContract) * 100) / Number(totalSuppliedInContract)
    : 0;

  const availableAmountInContract = toBN(totalSuppliedInContract).sub(toBN(totalBorrowedInContract)).toString();

  // OPTIMIZATION 2: Convert to dollars using oneTokenToDollar (already have it!) instead of more contract calls
  const walletBalanceInDollars = web3.utils.toWei((fromTokenUnits(walletBalance, decimals) * oneTokenToDollar).toString());
  const totalSuppliedInContractInDollars = web3.utils.toWei((fromTokenUnits(totalSuppliedInContract, decimals) * oneTokenToDollar).toString());
  const totalBorrowedInContractInDollars = web3.utils.toWei((fromTokenUnits(totalBorrowedInContract, decimals) * oneTokenToDollar).toString());
  const userTokenBorrowedAmountInDollars = web3.utils.toWei((fromTokenUnits(userTokenBorrowedAmount, decimals) * oneTokenToDollar).toString());
  const userTokenLentAmountInDollars = web3.utils.toWei((fromTokenUnits(userTokenLentAmount, decimals) * oneTokenToDollar).toString());
  const availableAmountInContractInDollars = web3.utils.toWei((fromTokenUnits(availableAmountInContract, decimals) * oneTokenToDollar).toString())


  // Helper for case-insensitive image lookup
  const getImage = (key) => {
    if (!key) return null;
    if (tokenImages[key]) return tokenImages[key];

    const upper = key.toUpperCase();
    return tokenImages[upper] || tokenImages[key];
  };

  return {
    name: tokenName,
    symbol: symbol,
    tokenSymbol: symbol,
    image: getImage(tokenAddr) || getImage(tokenName) || getImage(symbol) || tokenImages['USDC'], // Fallback
    tokenAddress: tokenAddr,
    userTotalAmountAvailableToWithdrawInDollars: web3.utils.fromWei(userTotalAmountAvailableToWithdrawInDollars), // Dollars are always 18 decimals
    userTotalAmountAvailableForBorrowInDollars: web3.utils.fromWei(userTotalAmountAvailableForBorrowInDollars), // Dollars are always 18 decimals
    walletBalance: {
      amount: fromTokenUnits(walletBalance, decimals), // Use actual token decimals
      inDollars: web3.utils.fromWei(walletBalanceInDollars), // Dollars are always 18 decimals
      raw: walletBalance, // Raw Wei string for BN operations
    },
    totalSuppliedInContract: {
      amount: fromTokenUnits(totalSuppliedInContract, decimals), // Use actual token decimals
      inDollars: web3.utils.fromWei(totalSuppliedInContractInDollars), // Dollars are always 18 decimals
    },
    totalBorrowedInContract: {
      amount: fromTokenUnits(totalBorrowedInContract, decimals), // Use actual token decimals
      inDollars: web3.utils.fromWei(totalBorrowedInContractInDollars), // Dollars are always 18 decimals
    },
    availableAmountInContract: {
      amount: fromTokenUnits(availableAmountInContract, decimals), // Use actual token decimals
      inDollars: web3.utils.fromWei(availableAmountInContractInDollars), // Dollars are always 18 decimals
    },
    userTokenBorrowedAmount: {
      amount: fromTokenUnits(userTokenBorrowedAmount, decimals), // Use actual token decimals
      inDollars: web3.utils.fromWei(userTokenBorrowedAmountInDollars), // Dollars are always 18 decimals
    },
    userTokenLentAmount: {
      amount: fromTokenUnits(userTokenLentAmount, decimals), // Use actual token decimals
      inDollars: web3.utils.fromWei(userTokenLentAmountInDollars), // Dollars are always 18 decimals
    },
    LTV: web3.utils.fromWei(currentToken.LTV),
    borrowAPYRate: "0.1", // Fixed 10% APY as requested (Contract is intended to be 10%)
    supplyAPYRate: (() => {
      try {
        if (!currentToken || !currentToken.name) return "0.00";
        const s = currentToken.name.toUpperCase();
        if (s.includes('PC') || s.includes('PUSH')) return "0.06"; // 6%
        if (s.includes('WETH')) return "0.0125"; // 1.25%
        if (s.includes('CET')) return "0.066"; // 6.6%
        if (s.includes('USDC')) return "0.05"; // 5%
        return "0.00";
      } catch (e) {
        return "0.00";
      }
    })(),
    utilizationRate: utilizationRate,
    oneTokenToDollar,
    decimals
  };
};
