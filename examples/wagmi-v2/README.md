# Wagmi v2 Sapphire Example

This is a [Vite](https://vitejs.dev) project bootstrapped with [create-wagmi].

[create-wagmi]: https://github.com/wevm/wagmi/tree/main/packages/create-wagmi

This is a project that demonstrates how to integrate the
`@oasisprotocol/sapphire-wagmi-v2` library with [Wagmi v2](https://wagmi.sh/).
It uses the Sapphire wrapper to encrypt contract deployments, transactions, view
calls & gas estimations.

## Usage

Feel free to copy the code from the following examples in your project:

### Wagmi v2

The following configuration is used in this example:

https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2/src/wagmi.ts

### Wagmi v2 - multichain

In case you want to use multiple chains besides Sapphire, you can use the following configuration:

https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2/src/wagmi-multichain.ts

### Wagmi v2 - injected provider

In case you want to use injected provider, you can use the following configuration:

https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2/src/wagmi-injected.ts

### RainbowKit

The configuration demonstrates usage by 3rd party library. It is based on the
following example:

https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2/src/rainbowkit.ts

Similar configuration can be used with other 3rd party libraries that are built 
upon Wagmi v2.

> [!NOTE]
> Example uses WalletConnect on mobile for MetaMask connector, as deep-linking
> is not reliable on mobile. This makes the example a bit more complicated as it
> needs to be. In case you want to use a simpler version, feel free to remove the
> mobile WalletConnect logic.

For more examples of how to use this library, please refer to
our [@oasisprotocol/sapphire-wagmi-v2][@oasisprotocol/sapphire-wagmi-v2] package.

[@oasisprotocol/sapphire-wagmi-v2]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/integrations/wagmi-v2
