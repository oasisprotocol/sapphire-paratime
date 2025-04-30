This is a [Vite](https://vitejs.dev) project bootstrapped with [create-wagmi].

[create-wagmi]: https://github.com/wevm/wagmi/tree/main/packages/create-wagmi

This project demonstrates different usage of `@oasisprotocol/sapphire-wagmi-v2`
library. It uses the Sapphire wrapper to encrypt contract deployments,
transactions, view calls & gas estimations.

Choose one of the following approaches, that best suits your needs.

### [EIP-6963] Multi Injected Provider Discovery

#### Single chain - Sapphire

https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2/src/eip-6963/single-chain-config.ts

For basic example of how to use this library, please refer to
our [@oasisprotocol/sapphire-wagmi-v2][@oasisprotocol/sapphire-wagmi-v2-eip-6963-single-chain] package.

#### Multichain

https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2/src/eip-6963/multi-chain-config.ts

For basic example of how to use this library, please refer to
our [@oasisprotocol/sapphire-wagmi-v2][@oasisprotocol/sapphire-wagmi-v2-eip-6963-multichain] package.

[EIP-6963]: https://eips.ethereum.org/EIPS/eip-6963
[@oasisprotocol/sapphire-wagmi-v2-eip-6963-single-chain]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/integrations/wagmi-v2#single-chain---sapphire
[@oasisprotocol/sapphire-wagmi-v2-eip-6963-multichain]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/integrations/wagmi-v2#multichain

### [EIP-1193] Injected provider

https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2/src/eip-1193/config.ts

For basic example of how to use this library, please refer to
our [@oasisprotocol/sapphire-wagmi-v2][@oasisprotocol/sapphire-wagmi-v2-eip-1193] package.

[EIP-1193]: https://eips.ethereum.org/EIPS/eip-1193
[@oasisprotocol/sapphire-wagmi-v2-eip-1193]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/integrations/wagmi-v2#eip-1193-injected-provider
