import { mainnet, sapphire, sapphireTestnet } from 'wagmi/chains';
import {
  wrapConnectorWithSapphire,
  sapphireHttpTransport,
  sapphireLocalnet,
} from '@oasisprotocol/sapphire-wagmi-v2';
import { createConfig, http } from 'wagmi';
import { metaMask } from "wagmi/connectors";

const sapphireMetamask = () => {
  return wrapConnectorWithSapphire(
    metaMask(),
    {
      id: 'metamask-sapphire',
      name: 'MetaMask (Sapphire)',
    }
  ) as unknown as ReturnType<typeof metaMask>;
}

export const wagmiConfig = createConfig({
  chains: [sapphire, sapphireTestnet, sapphireLocalnet, mainnet],
  connectors: [
    // Sapphire-wrapped MetaMask for Sapphire chains
    sapphireMetamask(),
    // Regular MetaMask for non-Sapphire chains
    metaMask(),
  ],
  transports: {
    [sapphire.id]: sapphireHttpTransport(),
    [sapphireTestnet.id]: sapphireHttpTransport(),
    [sapphireLocalnet.id]: sapphireHttpTransport(),
    [mainnet.id]: http(),
  },
});
