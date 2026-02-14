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
  const { pushChainClient: uiKitClient } = usePushChainClient();
  const pushClient = uiKitClient; // Alias for backward compatibility if needed, but we'll use uiKitClient explicitly

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

    // Helper to sanitize address (remove CAIP namespaces if present)
    const sanitizeAccount = (addr) => {
      if (!addr) return null;
      if (typeof addr !== 'string') return null;
      // Split by ':' and take the last part (usually the address)
      const parts = addr.split(':');
      return parts[parts.length - 1];
    };

    let rawAccount = null;

    if (pushWallet?.universalAccount?.address) {
      console.log("DEBUG: Selected Account from pushWallet.universalAccount.address");
      rawAccount = pushWallet.universalAccount.address;
    } else if (pushWallet?.universalAccount?.account) {
      console.log("DEBUG: Selected Account from pushWallet.universalAccount.account");
      rawAccount = pushWallet.universalAccount.account;
    } else if (pushWallet?.universalAccount && typeof pushWallet.universalAccount === 'string') {
      console.log("DEBUG: Selected Account from pushWallet.universalAccount (string)");
      rawAccount = pushWallet.universalAccount;
    } else if (pushChainContext?.account && pushChainContext?.isUniversal) {
      console.log("DEBUG: Selected Account from pushChainContext.account (isUniversal)");
      rawAccount = pushChainContext.account;
    } else if (pushWallet?.account?.address) {
      console.log("DEBUG: Selected Account from pushWallet.account.address");
      rawAccount = pushWallet.account.address;
    } else if (pushWallet?.account && typeof pushWallet.account === 'string') {
      console.log("DEBUG: Selected Account from pushWallet.account (string)");
      rawAccount = pushWallet.account;
    } else if (web3Api.provider?.selectedAddress) {
      console.log("DEBUG: Selected Account from web3Api.provider.selectedAddress");
      rawAccount = web3Api.provider.selectedAddress;
    }

    newAccount = sanitizeAccount(rawAccount);

    if (newAccount !== connectedAccountState) {
      console.log("Connect Account Changed:", { raw: rawAccount, sanitized: newAccount });
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

  // Centralized Transaction Sender - Push Chain Wallet Kit Exclusive
  const sendTransaction = async (method, fromAddress) => {
    const data = method.encodeABI();
    const to = method._parent._address;

    if (!to) {
      console.error("❌ Transaction Error: 'to' address is missing", { method, to });
      throw new Error(`Invalid 'to' address. Contract address is undefined.`);
    }

    console.log('🚀 Sending transaction via Push Chain Wallet Kit', { from: fromAddress, to, data });

    // PRIORITIZE the client from UI KIT (Official) over our custom one
    const client = uiKitClient || pushChainContext?.pushClient || pushClient;

    console.log('🚀 Transaction Client Source:', {
      from: fromAddress,
      usingUIKit: !!uiKitClient,
      usingCustom: !!pushChainContext?.pushClient,
      clientReady: !!client
    });

    // 1. Try Push Client (Universal / Wallet Kit)
    if (client?.universal) {
      // Clean Hex Address
      const cleanTo = to.trim().toLowerCase();
      console.log("🚀 Sending transaction via SDK to:", cleanTo);

      const txParams = {
        to: cleanTo,
        data: data,
        value: 0n, // Viem/SDK expects BigInt
      };

      console.log("🚀 DEBUG: Push SDK Tx Payload:", {
        to: cleanTo,
        dataLen: data ? data.length : 0,
        dataShort: data ? data.substring(0, 50) + '...' : 'NONE',
        value: '0n'
      });

      try {
        // Now that PushChainProvider is fixed with correct rpcUrls map, this should work!
        const txResponse = await client.universal.sendTransaction(txParams);
        console.log("✅ SDK Transaction Response:", txResponse);

        // CRITICAL: Wait for transaction to be mined!
        // The SDK returns a response object with a .wait() method (ethers-like)
        if (txResponse.wait) {
          console.log("⏳ Waiting for transaction confirmation...");
          const receipt = await txResponse.wait();
          console.log("✅ Transaction Mined:", receipt);
          return receipt;
        }

        // Fallback if no .wait() (shouldn't happen with standard SDK)
        return { transactionHash: txResponse.hash };
      } catch (error) {
        console.error("Push SDK Transaction Failed:", error);
        throw error;
      }
    }

    // 2. Fallback: If pushClient is not ready, we cannot sign.
    console.error("Push Client state:", { client, isUniversal: client?.universal });
    throw new Error("Push Chain Wallet Kit is not fully initialized. Please refresh or reconnect.");
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
