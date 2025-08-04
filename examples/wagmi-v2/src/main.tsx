import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";
import { useConnect, useConnectors, WagmiProvider } from "wagmi";
import {
	createBrowserRouter,
	Navigate,
	RouterProvider,
} from "react-router-dom";
import { ConnectButton, RainbowKitProvider } from "@rainbow-me/rainbowkit";

import App from "./App.tsx";
import { config } from "./wagmi.ts";
import { rainbowKitConfig } from "./rainbowkit.ts";

import "./index.css";
import "@rainbow-me/rainbowkit/styles.css";

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

const router = createBrowserRouter([
	{
		path: "/wagmi",
		element: (
			<WagmiProvider config={config}>
				<QueryClientProvider client={new QueryClient()}>
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
				<QueryClientProvider client={new QueryClient()}>
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
