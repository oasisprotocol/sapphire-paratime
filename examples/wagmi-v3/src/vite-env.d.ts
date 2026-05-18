/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_WALLET_CONNECT_PROJECT_ID: string;
    readonly VITE_ANVIL_RPC_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

interface Window {
    ethereum?: {
        isMetaMask?: boolean;
        request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
}
