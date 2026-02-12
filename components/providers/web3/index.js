import { createContext, useContext, useState, useEffect, useMemo } from "react";
import detectEthereumProvider from "@metamask/detect-provider";
import Web3 from "web3";
import { setupHooks } from "./hooks/setupHooks";
import { loadContract } from "../../../utils/loadContract";
import { usePushWalletContext, usePushChainClient } from '@pushchain/ui-kit';
import { usePushChain } from "../PushChainProvider";

const Web3Context = createContext(null);

const setListeners = (provider) => {
  provider.on("chainChanged", (_) => window.location.reload());
};

export default function Web3Provider({ children }) {
  // Get Push Chain context (TRUE universal functionality)
  const pushChainContext = usePushChain();

  // Get Push Chain wallet from UI-kit (for UI display)
  const pushWallet = usePushWalletContext();
  const pushClient = usePushChainClient();

  // Initialize with empty hooks to prevent null errors
  const [web3Api, setWeb3Api] = useState(() => ({
    web3: null,
    provider: null,
    contract: null,
    isLoading: true,
    hooks: setupHooks({ web3: null, provider: null, contract: null, connectedAccount: null }),
  }));

  // Track connected account separately to control hook recreation
  const [connectedAccountState, setConnectedAccountState] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadProvider = async () => {
      if (!mounted) return;

      if (!mounted) return;

      // Use Local Proxy to avoid CORS
      const PUSH_CHAIN_RPC = '/api/rpc';

      // No absolute URL calculation needed
      const absoluteRpc = PUSH_CHAIN_RPC;

      const web3 = new Web3(new Web3.providers.HttpProvider(absoluteRpc));
      const contract = await loadContract("LendingAndBorrowing", web3);

      if (!mounted) return;

      // Get MetaMask for transactions (optional)
      const metamaskProvider = await detectEthereumProvider();

      if (metamaskProvider) {
        setWeb3Api({
          web3,
          provider: metamaskProvider,
          contract,
          isLoading: false,
          hooks: null, // Will be set in useMemo
        });
        setListeners(metamaskProvider);
      } else {
        setWeb3Api({
          web3,
          provider: null,
          contract,
          isLoading: false,
          hooks: null, // Will be set in useMemo
        });
      }
    };

    loadProvider();

    return () => {
      mounted = false;
    };
  }, []); // Run ONCE on mount

  // Update connected account when wallet context changes
  useEffect(() => {
    let newAccount = null;

    if (pushChainContext?.account && pushChainContext?.isUniversal) {
      newAccount = pushChainContext.account;
    } else if (pushWallet?.universalAccount?.address) {
      newAccount = pushWallet.universalAccount.address;
    } else if (pushWallet?.universalAccount?.account) {
      newAccount = pushWallet.universalAccount.account;
    } else if (pushWallet?.universalAccount && typeof pushWallet.universalAccount === 'string') {
      newAccount = pushWallet.universalAccount;
    } else if (pushWallet?.account?.address) {
      newAccount = pushWallet.account.address;
    } else if (pushWallet?.account && typeof pushWallet.account === 'string') {
      newAccount = pushWallet.account;
    } else if (web3Api.provider?.selectedAddress) {
      newAccount = web3Api.provider.selectedAddress;
    }

    if (newAccount !== connectedAccountState) {
      setConnectedAccountState(newAccount);
    }
  }, [
    pushChainContext?.account,
    pushChainContext?.isUniversal,
    pushWallet?.universalAccount,
    pushWallet?.account,
    web3Api.provider?.selectedAddress
  ]);

  const _web3Api = useMemo(() => {
    const { web3, provider, isLoading, contract } = web3Api;

    // Use the tracked connected account
    const connectedAccount = connectedAccountState;
    let isUniversal = false;

    // Determine if using universal signer
    if (pushChainContext?.account && pushChainContext?.isUniversal) {
      isUniversal = true;
    }

    // CRITICAL: Always create hooks, even when web3 is null
    // The hooks themselves check for web3/contract before fetching
    const hooks = setupHooks({ web3, provider, contract, connectedAccount });

    return {
      web3,
      provider,
      contract,
      isLoading,
      hooks,
      pushWallet, // Expose Push wallet context (UI-kit)
      pushClient, // Expose Push client (UI-kit)
      pushChainContext, // Expose Push Chain context (SDK)
      connectedAccount, // The actual connected address
      isUniversal, // TRUE if using universal signer
      chainId: pushChainContext?.chainId, // User's current chain
      universalSigner: pushChainContext?.universalSigner, // For universal transactions
      requireInstall: !isLoading && !web3,
      connect: provider
        ? async () => {
          try {
            await provider.request({
              method: "eth_requestAccounts",
            });
          } catch {
            location.reload();
          }
        }
        : () => { },
    };
  }, [
    web3Api,
    web3Api.web3, // CRITICAL: Track web3 changes
    web3Api.contract, // CRITICAL: Track contract changes
    connectedAccountState,
    pushClient,
    pushChainContext?.chainId,
    pushChainContext?.isUniversal,
    pushChainContext?.universalSigner,
  ]);

  // Return another instance of _web3Api if web3Api changes

  const { web3, provider, isLoading, contract } = web3Api;

  // Centralized Transaction Sender
  const sendTransaction = async (method, fromAddress) => {
    const chainId = pushChainContext?.chainId;
    const isPushChain = chainId === '0xa475' || (chainId && parseInt(chainId, 16) === 42101);

    // Create a proxy web3 for read operations / gas estimation to avoid rate limits
    // We create this on demand to ensure we always have a fresh provider
    const proxyWeb3 = new Web3(new Web3.providers.HttpProvider('/api/rpc'));

    if (isPushChain) {
      const data = method.encodeABI();
      const to = method._parent._address;

      console.log('Sending transaction on PushChain:', {
        from: fromAddress,
        to: to,
        data: data.substring(0, 50) + '...',
        chainId: chainId
      });

      try {
        // 🛡️ GAS & PRICE ESTIMATION VIA PROXY (Bypasses Wallet Rate Limits)
        let gasLimitHex = '0x5B8D80'; // Default 6M fallback
        let gasPriceHex = undefined; // Let wallet decide if fetch fails

        try {
          // Use PROXY for estimatedGas and getGasPrice to avoid 429s
          const [estimatedGas, currentGasPrice] = await Promise.all([
            proxyWeb3.eth.estimateGas({
              from: fromAddress,
              to: to,
              data: data
            }),
            proxyWeb3.eth.getGasPrice()
          ]);

          console.log('🔍 Proxy Gas Estimate:', estimatedGas);
          console.log('🔍 Proxy Gas Price:', currentGasPrice);

          // Add 200% buffer (2x) and Enforce Minimum 1M Gas
          const gasWithBuffer = Math.max(Math.floor(Number(estimatedGas) * 2), 1000000);
          gasLimitHex = '0x' + gasWithBuffer.toString(16);

          // Add 10% tip to gas price for speed
          const adjustedPrice = proxyWeb3.utils.toBN(currentGasPrice).mul(proxyWeb3.utils.toBN(110)).div(proxyWeb3.utils.toBN(100));
          gasPriceHex = '0x' + adjustedPrice.toString(16);

          console.log('✅ Using Proxy-calc params:', { gas: gasLimitHex, gasPrice: gasPriceHex });

        } catch (gasError) {
          console.warn('⚠️ Proxy gas estimation failed, falling back to safe defaults:', gasError);
        }

        const txParams = {
          from: fromAddress,
          to: to,
          data: data,
          gas: gasLimitHex,
        };

        if (gasPriceHex) {
          txParams.gasPrice = gasPriceHex;
        }

        // Send 'blind' transaction to wallet - it just signs
        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [txParams],
        });

        console.log('Transaction sent, hash:', txHash);

        // Wait for transaction to be mined using PROXY WEB3 (Reliable)
        let receipt = null;
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds max

        while (!receipt && attempts < maxAttempts) {
          receipt = await proxyWeb3.eth.getTransactionReceipt(txHash);
          if (!receipt) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
          }
        }

        if (!receipt) {
          throw new Error('Transaction not mined after 60 seconds (checked via Proxy)');
        }

        // Wait additional 2 seconds for blockchain state to propagate
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Transaction receipt:', receipt);
        return { transactionHash: txHash, ...receipt };
      } catch (error) {
        console.error('PushChain transaction error:', error);
        throw error;
      }
    }

    // Universal / Standard Web3 Logic
    const isUniversal = pushChainContext?.account && pushChainContext?.isUniversal;

    // Helper to get gas price and nonce safely via our proxy
    let gasPrice = undefined;
    let nonce = undefined;

    try {
      // Use PROXY WEB3 for these checks to ensure they succeed
      const [price, txCount] = await Promise.all([
        proxyWeb3.eth.getGasPrice(),
        proxyWeb3.eth.getTransactionCount(fromAddress)
      ]);

      // Gas Price: Add small buffer (10%)
      const gasPriceBN = proxyWeb3.utils.toBN(price);
      gasPrice = gasPriceBN.mul(proxyWeb3.utils.toBN(110)).div(proxyWeb3.utils.toBN(100)).toString();

      // Nonce
      nonce = txCount;

      console.log('⛽ Pre-fetched Data (via Proxy):', { gasPrice, nonce });
    } catch (e) {
      console.warn('Failed to pre-fetch tx data via proxy:', e);
    }

    if (isUniversal && pushClient) {
      console.log("🔐 Signing via PushChain Universal Kit (Gasless/Universal Mode)");
      const data = method.encodeABI();

      const txOptions = {
        to: method._parent._address,
        data: data,
        value: BigInt(0),
        gasLimit: BigInt(2000000), // Increased from 500k
      };

      if (gasPrice) {
        txOptions.gasPrice = BigInt(gasPrice);
        txOptions.maxFeePerGas = BigInt(gasPrice);
        txOptions.maxPriorityFeePerGas = BigInt(gasPrice);
      }

      if (nonce !== undefined) {
        txOptions.nonce = BigInt(nonce);
      }

      const result = await pushClient.universal.sendTransaction(txOptions);

      // Wait for blockchain state to update
      await new Promise(resolve => setTimeout(resolve, 3000));

      return result;
    }

    // Standard Web3 / MetaMask Fallback
    // Since 'contract' is read-only, we MUST use provider.request() to sign
    const data = method.encodeABI();
    const to = method._parent._address;

    const txParams = {
      from: fromAddress,
      to: to,
      data: data,
    };

    if (gasPrice) txParams.gasPrice = parseInt(gasPrice).toString(16); // Convert to Hex for RPC
    if (nonce !== undefined) txParams.nonce = parseInt(nonce).toString(16);

    console.log('Sending standard transaction via Wallet:', txParams);

    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    });

    console.log('Standard Transaction sent, hash:', txHash);

    // Wait for transaction to be mined using PROXY WEB3 (Reliable)
    let receipt = null;
    let attempts = 0;
    const maxAttempts = 60;

    while (!receipt && attempts < maxAttempts) {
      receipt = await proxyWeb3.eth.getTransactionReceipt(txHash);
      if (!receipt) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
    }

    if (!receipt) {
      throw new Error('Transaction not mined after 60 seconds (checked via Proxy)');
    }

    // Wait additional 2 seconds for blockchain state to propagate
    await new Promise(resolve => setTimeout(resolve, 2000));

    return { transactionHash: txHash, ...receipt };
  };

  // Memoize the context value to prevent unnecessary re-renders
  const memoizedContextValue = useMemo(() => {
    return {
      ..._web3Api,
      sendTransaction,
    };
  }, [_web3Api]); // _web3Api already has dependencies, so this is safe

  return (
    <Web3Context.Provider value={memoizedContextValue}>{children}</Web3Context.Provider>
  );
}

export function useWeb3() {
  return useContext(Web3Context);
}

export function useHooks(callback) {
  const { hooks } = useWeb3();
  return callback(hooks);
}

/*

getHooks() method returns a dictionary containing name of the hook (key) and the handler to the hook (value)
That dictionary will be accessible anywhere useHooks() method is called because the dictionary is passed as an argument to the callback.

*/
