import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";

import App from "./App.tsx";
import { rainbowkitConfig } from './wagmi.ts';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<WagmiProvider config={rainbowkitConfig}>
			<QueryClientProvider client={queryClient}>
				<RainbowKitProvider>
				<App />
				</RainbowKitProvider>
			</QueryClientProvider>
		</WagmiProvider>
	</React.StrictMode>,
);
