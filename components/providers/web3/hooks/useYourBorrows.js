import useSWR from "swr";
import { normalizeToken } from "../../../../utils/normalize";
import Web3 from 'web3';

const NETWORKS = {
  1: "Ethereum Main Network",
  3: "Ropsten Test Network",
  4: "Rinkeby Test Network",
  5: "Goerli Test Network",
  42: "Kovan Test Network",
  11155111: "Sepolia Test Network",
  56: "Binance Smart Chain",
  1337: "Ganache",
};


export const handler = (web3, contract, connectedAccount) => () => {
  // connectedAccount is passed as a parameter from setupHooks

  const { data, error, mutate, isValidating, ...rest } = useSWR(
    // ALWAYS return a key, even if web3 is null - this ensures the hook is ready
    `web3/your_borrows/${web3 && contract ? (connectedAccount || 'no-account') : 'loading'}`,
    async () => {
      // Don't fetch if web3/contract not ready
      if (!web3 || !contract) {
        return null;
      }

      const account = connectedAccount;

      const yourBorrows = [];
      let yourBalance = 0;

      try {
        // 🛡️ CREATE PROXY WEB3 FOR SAFE READ OPERATIONS
        const proxyWeb3 = new Web3(new Web3.providers.HttpProvider('/api/rpc'));

        // Start immediately

        const tokens = await contract.methods.getTokensForBorrowingArray().call()

        // OLD token addresses to filter out (6 decimal versions)
        const OLD_TOKENS = [
          '0x63A02A958e9803a92b849d802f2A452922733F56', // OLD USDC (6 decimals)
          '0x51BD80d3102cFC1F22dD7024C99A6E163aA672fF'  // OLD USDT (6 decimals)
        ];

        // 🚀 BALANCED LOADING - Process 3 tokens at a time
        const filteredTokens = tokens
          .filter(currentToken =>
            !OLD_TOKENS.includes(currentToken.tokenAddress.toLowerCase()) &&
            !OLD_TOKENS.includes(currentToken.tokenAddress)
          );

        const BATCH_SIZE = 3;
        const results = [];

        for (let i = 0; i < filteredTokens.length; i += BATCH_SIZE) {
          const batch = filteredTokens.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(async (currentToken) => {
              try {
                return await normalizeToken(web3, contract, currentToken, connectedAccount, proxyWeb3);
              } catch (e) {
                return null;
              }
            })
          );

          batchResults.forEach(normalized => {
            if (normalized && parseFloat(normalized.userTokenBorrowedAmount.amount) > 0) {
              yourBorrows.push(normalized);
              yourBalance += parseFloat(normalized.userTokenBorrowedAmount.inDollars);
            }
          });
        }

        return { yourBorrows, yourBalance };
      } catch (error) {
        throw error;
      }
    },
    {
      refreshInterval: 0, // Disable auto-refresh (only manual refresh)
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 0, // Allow immediate refresh after transactions
      keepPreviousData: true, // Keep data visible during refresh for smooth UX
    }
  );

  const targetNetwork = NETWORKS["11155111"];


  return {
    data,
    error,
    mutate, // Expose mutate for manual refresh
    isValidating,
    ...rest,
    target: targetNetwork,
    isSupported: data === targetNetwork,
  };
};

/**

web3.eth.net.getId() will return the network id on ganache itself
web3.eth.getChainId() will return the chainId of ganache in metamask.

chainChanged event listens with web3.eth.getChainId()


 */
