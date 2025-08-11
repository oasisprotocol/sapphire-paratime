/// <reference types="vite/client" />

interface ImportMetaEnv {
	VITE_WALLET_CONNECT_PROJECT_ID: string;
	VITE_WALLET_CONNECT_RAINBOWKIT_PROJECT_ID: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
