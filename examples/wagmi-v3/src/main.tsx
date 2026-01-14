import ReactDOM from "react-dom/client";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import type { wagmiConfig } from "./wagmi-multichain";
import type { config } from "./wagmi";
import type { wagmiConfig as wagmiInjectedConfig } from "./wagmi-injected";
import { lazy } from "react";
const WagmiRoute = lazy(() => import("./routes/wagmiDefaultRoute"));
const WagmiInjectedRoute = lazy(() => import("./routes/wagmiInjectedRoute"));
const WagmiMultichainRoute = lazy(
	() => import("./routes/wagmiMultichainRoute"),
);

import "./index.css";

// Avoid WalletConnect(isGlobalCoreDisabled) collisions by avoiding the shared core
if (typeof window !== "undefined") {
	(window as any).process = { env: { DISABLE_GLOBAL_CORE: "true" } };
}

declare module "wagmi" {
	interface Register {
		config:
		| typeof wagmiConfig
		| typeof config
		| typeof wagmiInjectedConfig;
	}
}

const router = createHashRouter([
	{
		path: "/wagmi",
		element: <WagmiRoute />,
	},
	{
		path: "/wagmi-multichain",
		element: <WagmiMultichainRoute />,
	},
	{
		path: "/wagmi-injected",
		element: <WagmiInjectedRoute />,
	},
	{
		path: "*",
		element: <Navigate to="/wagmi" replace />,
	},
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
	<RouterProvider router={router} />,
);
