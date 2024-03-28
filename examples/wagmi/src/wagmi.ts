import { defineChain } from 'viem';
import { createConfig } from 'wagmi';
import { sapphireTestnet } from 'wagmi/chains';
import { injectedWithSapphire, sapphireTransport } from '@oasisprotocol/sapphire-wagmi';

const sapphireLocalnet = defineChain({
  id: 0x5afd,
  name: 'Oasis Sapphire Localnet',
  network: 'sapphire-localnet',
  nativeCurrency: { name: 'Sapphire Local Rose', symbol: 'TEST', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['http://localhost:8545'],
      webSocket: ['ws://localhost:8546/ws'],
    },
  },
  testnet: true,
});

export const config = createConfig({
  multiInjectedProviderDiscovery: false,
  chains: [
    sapphireTestnet,
    sapphireLocalnet
  ],
  connectors: [
    injectedWithSapphire()
  ],
  transports: {
    [sapphireTestnet.id]: sapphireTransport(),
    [sapphireLocalnet.id]: sapphireTransport()
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
