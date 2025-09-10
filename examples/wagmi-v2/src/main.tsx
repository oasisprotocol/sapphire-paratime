import { QueryClientProvider } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";
import { useConnect, useConnectors, WagmiProvider } from "wagmi";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import { ConnectButton, RainbowKitProvider } from "@rainbow-me/rainbowkit";

import App from "./App";
import { config } from "./wagmi";
import { wagmiConfig as wagmiMultichainConfig } from "./wagmi-multichain";
import { rainbowKitConfig } from "./rainbowkit";

import "./index.css";
import "@rainbow-me/rainbowkit/styles.css";
import { queryClient } from "./query-client";
import { wagmiConfig } from './wagmi-multichain.ts';

// Avoid WalletConnect(isGlobalCoreDisabled) collisions by avoiding the shared core
if (typeof window !== "undefined") {
	(window as any).process = { env: { DISABLE_GLOBAL_CORE: "true" } };
}

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig | typeof config;
  }
}

const WagmiConnectors = () => {
	const { connect } = useConnect();
	const connectors = useConnectors();

	return (
		<>
			{connectors.map((connector) => (
				<button
					key={connector.id}
					onClick={() => connect({ connector })}
					type="button"
					data-testid={connector.id}
				>
					{connector.name}
				</button>
			))}
		</>
	);
};

const router = createHashRouter([
	{
		path: "/wagmi",
		element: (
			<WagmiProvider config={config}>
				<QueryClientProvider client={queryClient}>
					<App>
						<WagmiConnectors />
					</App>
				</QueryClientProvider>
			</WagmiProvider>
		),
  },
  {
    path: '/wagmi-multichain',
    element: (
      <WagmiProvider config={wagmiMultichainConfig}>
        <QueryClientProvider client={queryClient}>
          <App>
            <WagmiConnectors />
          </App>
        </QueryClientProvider>
      </WagmiProvider>
    ),
  },
  {
		path: "/rainbowkit",
		element: (
			<WagmiProvider config={rainbowKitConfig as unknown as typeof config}>
				<QueryClientProvider client={queryClient}>
					<RainbowKitProvider>
						<App>
							{/* To simplify the process of testing */}
							<WagmiConnectors />
							<ConnectButton />
						</App>
					</RainbowKitProvider>
				</QueryClientProvider>
			</WagmiProvider>
		),
	},
	{
		path: "*",
		element: <Navigate to="/wagmi" replace />,
	},
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
	<RouterProvider router={router} />,
);
