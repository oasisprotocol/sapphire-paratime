# Wagmi v3 Sapphire Example

This is a [Vite](https://vitejs.dev) project bootstrapped with [create-wagmi].

[create-wagmi]: https://github.com/wevm/wagmi/tree/main/packages/create-wagmi

This is a project that demonstrates how to integrate the
`@oasisprotocol/sapphire-wagmi-v3` library with [Wagmi v3](https://wagmi.sh/).
It uses the Sapphire wrapper to encrypt contract deployments, transactions, view
calls & gas estimations.

## Usage

Feel free to copy the code from the following examples in your project:

### Wagmi v3

The following configuration is used in this example:

https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v3/src/wagmi.ts

### Wagmi v3 - multichain

In case you want to use multiple chains besides Sapphire, you can use the following configuration:

https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v3/src/wagmi-multichain.ts

### Wagmi v3 - injected provider

In case you want to use injected provider, you can use the following configuration:

https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v3/src/wagmi-injected.ts

> [!NOTE]
> Example uses WalletConnect on mobile for MetaMask connector, as deep-linking
> is not reliable on mobile. This makes the example a bit more complicated as it
> needs to be. In case you want to use a simpler version, feel free to remove the
> mobile WalletConnect logic.

### RainbowKit (Coming Soon)

> [!NOTE]
> RainbowKit integration is not yet available for wagmi v3. RainbowKit 2.x
> requires wagmi ^2.9.0. Once RainbowKit releases v3 with wagmi 3.x support,
> it will be added to this example.

For more examples of how to use this library, please refer to
our [@oasisprotocol/sapphire-wagmi-v3][@oasisprotocol/sapphire-wagmi-v3] package.

[@oasisprotocol/sapphire-wagmi-v3]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/integrations/wagmi-v3
