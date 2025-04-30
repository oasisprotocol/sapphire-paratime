import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import {
	createBrowserRouter,
	Navigate,
	RouterProvider,
} from "react-router-dom";
import { config as eip6963SingleChainConfig } from "./eip-6963/single-chain-config";
import { config as eip6963MultiChainConfig } from "./eip-6963/multi-chain-config";
import { config as eip1193Config } from "./eip-1193/config";

import App from "./App.tsx";

import "./index.css";

const router = createBrowserRouter([
	{
		path: "/eip-6963-single-chain",
		element: (
			<WagmiProvider config={eip6963SingleChainConfig}>
				<QueryClientProvider client={new QueryClient()}>
					<App />
				</QueryClientProvider>
			</WagmiProvider>
		),
	},
	{
		path: "/eip-6963-multi-chain",
		element: (
			<WagmiProvider config={eip6963MultiChainConfig}>
				<QueryClientProvider client={new QueryClient()}>
					<App />
				</QueryClientProvider>
			</WagmiProvider>
		),
	},
	{
		path: "/eip-1193",
		element: (
			<WagmiProvider config={eip1193Config}>
				<QueryClientProvider client={new QueryClient()}>
					<App />
				</QueryClientProvider>
			</WagmiProvider>
		),
	},
	{
		path: "*",
		element: <Navigate to="/" replace />,
	},
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
	<RouterProvider router={router} />,
);
