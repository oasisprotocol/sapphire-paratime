import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";
import { WagmiConnectors } from "../WagmiConnectors";
import { wagmiConfig } from "../wagmi-multichain";
import { WagmiProvider } from "wagmi";

export const WagmiMultichainRoute = () => {
    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={new QueryClient()}>
                <App>
                    <WagmiConnectors />
                </App>
            </QueryClientProvider>
        </WagmiProvider>
    );
};

export default WagmiMultichainRoute;
