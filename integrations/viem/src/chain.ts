import type { Chain } from "viem";

export const sapphireLocalnet = {
  id: 23293,
  name: "Oasis Sapphire Localnet",
  //network: "sapphire-localnet",
  nativeCurrency: {
    decimals: 18,
    name: "Test Rose",
    symbol: "TEST",
  },
  rpcUrls: {
    public: {
      http: ["http://localhost:8545"],
      webSocket: ["wss://localhost:8545/ws"],
    },
    default: {
      http: ["https://localhost:8545"],
      webSocket: ["wss://localhost:8545/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Oasis Foundation",
      url: "https://explorer.sapphire.oasis.io/",
    },
  },
} as const satisfies Chain;

export const sapphire = {
  id: 23294,
  name: "Oasis Sapphire",
  //network: "sapphire",
  nativeCurrency: {
    decimals: 18,
    name: "Rose",
    symbol: "ROSE",
  },
  rpcUrls: {
    public: {
      http: ["https://sapphire.oasis.io"],
      webSocket: ["wss://sapphire.oasis.io/ws"],
    },
    default: {
      http: ["https://sapphire.oasis.io"],
      webSocket: ["wss://sapphire.oasis.io/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Oasis Foundation",
      url: "https://explorer.sapphire.oasis.io/",
    },
  },
} as const satisfies Chain;

export const sapphireTestnet = {
  id: 23295,
  name: "Oasis Sapphire Testnet",
  //network: "sapphireTest",
  nativeCurrency: {
    decimals: 18,
    name: "Rose",
    symbol: "ROSE",
  },
  rpcUrls: {
    public: {
      http: ["https://testnet.sapphire.oasis.dev"],
      webSocket: ["wss://testnet.sapphire.oasis.dev/ws"],
    },
    default: {
      http: ["https://testnet.sapphire.oasis.dev"],
      webSocket: ["wss://testnet.sapphire.oasis.dev/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Oasis Foundation",
      url: "https://testnet.explorer.sapphire.oasis.dev/",
    },
  },
} as const satisfies Chain;

export const getChain = (chainId?: string): Chain => {
  switch (chainId) {
    case "23294":
      return sapphire;
    case "23295":
      return sapphireTestnet;
    case "23293":
        return sapphireLocalnet;
    default:
      return sapphire;
  }
};
