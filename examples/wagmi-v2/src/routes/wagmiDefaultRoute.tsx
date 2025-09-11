import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';
import { WagmiConnectors } from '../WagmiConnectors';
import { config } from '../wagmi';
import { WagmiProvider } from 'wagmi';

export const WagmiDefaultRoute = () => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={new QueryClient()}>
        <App>
          <WagmiConnectors />
        </App>
      </QueryClientProvider>
    </WagmiProvider>);
};

export default WagmiDefaultRoute;
