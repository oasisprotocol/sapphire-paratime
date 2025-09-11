import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';
import { WagmiConnectors } from '../WagmiConnectors';
import { rainbowKitConfig } from '../rainbowkit';
import { WagmiProvider } from 'wagmi';
import { ConnectButton, RainbowKitProvider } from '@rainbow-me/rainbowkit';

export const WagmiMultichainRoute = () => {
  return (
    <WagmiProvider config={rainbowKitConfig}>
      <QueryClientProvider client={new QueryClient()}>
        <RainbowKitProvider>
          <App>
            {/* To simplify the process of testing */}
            <WagmiConnectors />
            <ConnectButton />
          </App>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>);
};

export default WagmiMultichainRoute;
