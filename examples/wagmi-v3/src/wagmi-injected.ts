import { createConfig } from "wagmi";
import {
    sapphire,
    sapphireTestnet,
    sapphireLocalnet,
    injectedWithSapphire,
    sapphireHttpTransport,
} from "@oasisprotocol/sapphire-wagmi-v3";

export const wagmiConfig = createConfig({
    chains: [sapphire, sapphireTestnet, sapphireLocalnet],
    connectors: [injectedWithSapphire()],
    transports: {
        [sapphire.id]: sapphireHttpTransport(),
        [sapphireTestnet.id]: sapphireHttpTransport(),
        [sapphireLocalnet.id]: sapphireHttpTransport(),
    },
    multiInjectedProviderDiscovery: false,
});
