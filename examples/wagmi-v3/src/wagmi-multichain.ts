import {
    sapphire,
    sapphireTestnet,
    sapphireLocalnet,
    wrapConnectorWithSapphire,
    sapphireHttpTransport,
} from "@oasisprotocol/sapphire-wagmi-v3";
import { createConfig, http } from "wagmi";
import { metaMask } from "wagmi/connectors";

const anvilLocalChain = {
    id: 31337,
    name: "Anvil",
    nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: ["http://127.0.0.1:9545"] },
    },
} as const;

const sapphireMetamask = () => {
    return wrapConnectorWithSapphire(metaMask(), {
        id: "metamask-sapphire",
        name: "MetaMask (Sapphire)",
    }) as unknown as ReturnType<typeof metaMask>;
};

export const wagmiConfig = createConfig({
    chains: [sapphire, sapphireTestnet, sapphireLocalnet, anvilLocalChain],
    connectors: [
        // Sapphire-wrapped aware MetaMask for Sapphire chains, unwrapped for other chains
        sapphireMetamask(),
    ],
    transports: {
        [sapphire.id]: sapphireHttpTransport(),
        [sapphireTestnet.id]: sapphireHttpTransport(),
        [sapphireLocalnet.id]: sapphireHttpTransport(),
        [anvilLocalChain.id]: http(),
    },
});
