import ReactDOM from "react-dom/client";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import "@rainbow-me/rainbowkit/styles.css";
import type { wagmiConfig } from './wagmi-multichain';
import type { config } from './wagmi';
import type { wagmiConfig as wagmiInjectedConfig } from './wagmi-injected';
import type { rainbowKitConfig } from './rainbowkit';
import { lazy } from 'react';
const WagmiRoute = lazy(() => import("./routes/wagmiDefaultRoute"));
const WagmiInjectedRoute = lazy(() => import("./routes/wagmiInjectedRoute"));
const WagmiMultichainRoute = lazy(() => import("./routes/wagmiMultichainRoute"));
const WagmiRainbowkitRoute = lazy(() => import("./routes/wagmiRainbowkitRoute"));

import "./index.css";

// Avoid WalletConnect(isGlobalCoreDisabled) collisions by avoiding the shared core
if (typeof window !== "undefined") {
	(window as any).process = { env: { DISABLE_GLOBAL_CORE: "true" } };
}

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig | typeof config | typeof wagmiInjectedConfig | typeof rainbowKitConfig;
  }
}

const router = createHashRouter([
	{
		path: "/wagmi",
		element: <WagmiRoute />,
  },
  {
    path: '/wagmi-multichain',
    element: <WagmiMultichainRoute />,
  },
  {
    path: '/wagmi-injected',
    element: <WagmiInjectedRoute />,
  },
  {
		path: "/rainbowkit",
		element: <WagmiRainbowkitRoute />,
	},
	{
		path: "*",
		element: <Navigate to="/wagmi" replace />,
	},
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
	<RouterProvider router={router} />,
);
