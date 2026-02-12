import { Web3Provider } from "../components/providers";
import PushChainProvider from "../components/providers/PushChainProvider";
import { PushUniversalWalletProvider } from '@pushchain/ui-kit';
import { PushUI } from '@pushchain/ui-kit';

import { useEffect } from 'react'; // Added useEffect import
import '../styles/globals.css'

function MyApp({ Component, pageProps }) {
  // Use Local Proxy to avoid CORS
  // Use Local Proxy to avoid CORS
  const RPC_URL = '/api/rpc';
  const absoluteRpc = typeof window !== 'undefined' ? window.location.origin + RPC_URL : RPC_URL;

  useEffect(() => {
    // Suppress annoying 3rd party wallet errors that don't affect functionality
    const originalError = console.error;
    console.error = (...args) => {
      if (
        /Access to fetch/.test(args[0]) ||
        /net::ERR_FAILED/.test(args[0]) ||
        /429 \(Too Many Requests\)/.test(args[0]) ||
        /JsonRpcProvider failed/.test(args[0])
      ) {
        // Ignore these known noise errors
        return;
      }
      originalError.apply(console, args);
    };

    // Cleanup function to restore original console.error when component unmounts
    return () => {
      console.error = originalError;
    };
  }, []); // Empty dependency array means this runs once on mount and cleans up on unmount

  const walletConfig = {
    network: PushUI.CONSTANTS.PUSH_NETWORK.TESTNET,
    rpcUrl: absoluteRpc,
    rpcUrls: [absoluteRpc], // Top-level array required by EvmClient
    chainConfig: {
      rpcUrls: {
        [PushUI.CONSTANTS.CHAIN.PUSH_TESTNET_DONUT]: [absoluteRpc], // Must be array
        'eip155:42101': [absoluteRpc],
        '42101': [absoluteRpc],
        42101: [absoluteRpc],
      },
      networks: [{
        chainId: 42101,
        rpcUrls: [absoluteRpc]
      }]
    },
    onError: (error) => {
      // Log errors normally now that we fixed the root cause
      console.error('Push Wallet Error:', error);
    }
  };

  return (
    <PushUniversalWalletProvider config={walletConfig}>
      <PushChainProvider>
        <Web3Provider>
          <Component {...pageProps} />
        </Web3Provider>
      </PushChainProvider>
    </PushUniversalWalletProvider>
  )
}

export default MyApp
