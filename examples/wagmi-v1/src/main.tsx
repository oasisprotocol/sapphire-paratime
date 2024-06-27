import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiConfig } from "wagmi";

import App from "./App.tsx";
import { config } from "./wagmi.ts";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<WagmiConfig config={config}>
			<App />
		</WagmiConfig>
	</React.StrictMode>,
);
