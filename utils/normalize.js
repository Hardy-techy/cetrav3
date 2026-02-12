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
  const metadataKey = `metadata_${currentToken.tokenAddress}`;
  const priceKey = `price_${currentToken.tokenAddress}`;
  const totalSuppliedKey = `totalSupplied_${currentToken.tokenAddress}`;
  const totalBorrowedKey = `totalBorrowed_${currentToken.tokenAddress}`;
  const balanceKey = `balance_${currentToken.tokenAddress}_${account}`;
  const userBorrowedKey = `userBorrowed_${currentToken.tokenAddress}_${account}`;
  const userLentKey = `userLent_${currentToken.tokenAddress}_${account}`;
  const userWithdrawKey = `userWithdraw_${account}`;
  const userBorrowLimitKey = `userBorrowLimit_${account}`;

  // 1. METADATA (Never changes - cache forever)
  let decimals;
  const cachedMetadata = getCachedMetadata(metadataKey);
  if (cachedMetadata) {
    decimals = cachedMetadata;
  } else {
    decimals = await tokenInst.methods.decimals().call();
    setCachedMetadata(metadataKey, decimals);
  }

  // 2. PRICE (Changes slowly - cache 30s)
  let priceResult;
  const cachedPrice = getCachedDynamic(priceKey);
  if (cachedPrice) {
    priceResult = cachedPrice;
  } else {
    priceResult = await contract.methods.oneTokenEqualsHowManyDollars(currentToken.tokenAddress).call();
    setCachedDynamic(priceKey, priceResult);
  }

  // 3. TOTAL SUPPLIED/BORROWED (Changes slowly - cache 30s)
  let totalSuppliedInContract, totalBorrowedInContract;
  const cachedTotalSupplied = getCachedDynamic(totalSuppliedKey);
  const cachedTotalBorrowed = getCachedDynamic(totalBorrowedKey);

  if (cachedTotalSupplied && cachedTotalBorrowed) {
    totalSuppliedInContract = cachedTotalSupplied;
    totalBorrowedInContract = cachedTotalBorrowed;
  } else {
    totalSuppliedInContract = await contract.methods.getTotalTokenSupplied(currentToken.tokenAddress).call();
    totalBorrowedInContract = await contract.methods.getTotalTokenBorrowed(currentToken.tokenAddress).call();
    setCachedDynamic(totalSuppliedKey, totalSuppliedInContract);
    setCachedDynamic(totalBorrowedKey, totalBorrowedInContract);
  }

  // 4. USER DATA (Changes frequently - cache 30s)
  let walletBalance = "0";
  let userTokenBorrowedAmount = "0";
  let userTokenLentAmount = "0";
  let userTotalAmountAvailableToWithdrawInDollars = "0";
  let userTotalAmountAvailableForBorrowInDollars = "0";

  if (account) {
    // Try cache first
    const cachedBalance = getCachedDynamic(balanceKey);
    const cachedUserBorrowed = getCachedDynamic(userBorrowedKey);
    const cachedUserLent = getCachedDynamic(userLentKey);
    const cachedUserWithdraw = getCachedDynamic(userWithdrawKey);
    const cachedUserBorrowLimit = getCachedDynamic(userBorrowLimitKey);

    if (cachedBalance && cachedUserBorrowed && cachedUserLent && cachedUserWithdraw && cachedUserBorrowLimit) {
      // All cached!
      walletBalance = cachedBalance;
      userTokenBorrowedAmount = cachedUserBorrowed;
      userTokenLentAmount = cachedUserLent;
      userTotalAmountAvailableToWithdrawInDollars = cachedUserWithdraw;
      userTotalAmountAvailableForBorrowInDollars = cachedUserBorrowLimit;
    } else {
      // Fetch and cache
      walletBalance = await tokenInst.methods.balanceOf(account).call().catch(() => "0");
      userTokenBorrowedAmount = await contract.methods.tokensBorrowedAmount(currentToken.tokenAddress, account).call();
      userTokenLentAmount = await contract.methods.tokensLentAmount(currentToken.tokenAddress, account).call();
      userTotalAmountAvailableToWithdrawInDollars = await contract.methods.getTokenAvailableToWithdraw(account).call();
      userTotalAmountAvailableForBorrowInDollars = await contract.methods.getUserTotalAmountAvailableForBorrowInDollars(account).call();

      setCachedDynamic(balanceKey, walletBalance);
      setCachedDynamic(userBorrowedKey, userTokenBorrowedAmount);
      setCachedDynamic(userLentKey, userTokenLentAmount);
      setCachedDynamic(userWithdrawKey, userTotalAmountAvailableToWithdrawInDollars);
      setCachedDynamic(userBorrowLimitKey, userTotalAmountAvailableForBorrowInDollars);
    }
  }

  const price = priceResult[0];
  const priceDecimals = priceResult[1];
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


  return {
    name: currentToken.name,
    symbol: currentToken.name,
    tokenSymbol: currentToken.name,
    image: tokenImages[currentToken.name],
    tokenAddress: currentToken.tokenAddress,
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
