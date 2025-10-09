---
description: Integrating Sapphire in your web dApp
---

# Browser Support

This page provides guidance for developers looking to build confidential dApps
on Sapphire that work across different web browsers and integrate with
wallets, including Metamask. It covers supported libraries, best practices for
secure transactions, and quick steps for using the libraries.

## Supported Libraries

| Library                                       | Package                                           | API Reference     | Source                  |
| --------------------------------------------- | ------------------------------------------------- | ----------------- | ----------------------- |
| **[Sapphire TypeScript Wrapper][s-p-github]** | [@oasisprotocol/sapphire-paratime][s-p-npmjs]     | [API][s-p-api]    | [GitHub][s-p-github]    |
| **[Ethers v6][ethers]**                       | [@oasisprotocol/sapphire-ethers-v6][ethers-npmjs] | [API][ethers-api] | [GitHub][ethers-github] |
| **[Viem][viem]**                              | [@oasisprotocol/sapphire-viem-v2][viem-npmjs]     | [API][viem-api]   | [GitHub][viem-github]   |
| **[Wagmi][wagmi]**                            | [@oasisprotocol/sapphire-wagmi-v2][wagmi-npmjs]   | [API][wagmi-api]  | [GitHub][wagmi-github]  |

[s-p-npmjs]: https://www.npmjs.com/package/@oasisprotocol/sapphire-paratime
[s-p-api]: https://api.docs.oasis.io/js/sapphire-paratime/
[s-p-github]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/clients/js
[ethers]: https://docs.ethers.org/v6/
[ethers-npmjs]: https://www.npmjs.com/package/@oasisprotocol/sapphire-ethers-v6
[ethers-api]: https://api.docs.oasis.io/js/sapphire-ethers-v6
[ethers-github]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/integrations/ethers-v6
[viem]: https://viem.sh/
[viem-npmjs]: https://www.npmjs.com/package/@oasisprotocol/sapphire-viem-v2
[viem-api]: https://api.docs.oasis.io/js/sapphire-viem-v2
[viem-github]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/integrations/viem-v2
[wagmi]: https://wagmi.sh/
[wagmi-npmjs]: https://www.npmjs.com/package/@oasisprotocol/sapphire-wagmi-v2
[wagmi-api]: https://api.docs.oasis.io/js/sapphire-wagmi-v2
[wagmi-github]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/integrations/wagmi-v2

## Choosing the Right Library

Many browser-based dApps can use the lightweight
[Sapphire TypeScript wrapper][s-p] if they rely entirely on the
injected EIP-1193 wallet provider (e.g. window.ethereum) to communicate with
and sign transactions on Sapphire. If you already use an EVM-frontend library,
use our library-specific packages for [Ethers][ethers-quick],
[Viem][viem-quick] or [Wagmi][wagmi-quick].

[s-p]: ./browser.md#lightweight-sapphire-typescript-wrapper
[ethers-quick]: ./browser.md#ethers-v6
[viem-quick]: ./browser.md#viem
[wagmi-quick]: ./browser.md#wagmi

:::info Example: Starter project

If your project includes both a smart contract backend and a web frontend, you
can explore our **[demo-starter]** repository. It provides a working example using
React as well as a [Vue branch].

:::

[demo-starter]: https://github.com/oasisprotocol/demo-starter
[Vue branch]: https://github.com/oasisprotocol/demo-starter/tree/vue

## Transaction encryption

When using the supported libraries, ensure that all transactions containing
sensitive information **are encrypted**. Encryption is essential to safeguard user
data and ensure privacy. To verify that a transaction is encrypted, you can
check the transaction details on the Oasis Block Explorer for the corresponding
network ([Localnet], [Testnet], or [Mainnet]). Look for a green lock icon next
to the transaction, which indicates that it is securely encrypted.

:::tip Check Calldata Encryption Programmatically

You can check programmatically if calldata is encrypted by using
[`isCalldataEnveloped()`], which is part of `@oasisprotocol/sapphire-paratime`.

:::

:::tip View-Call Authentication

For authenticated view calls, make sure to visit the [View-Call Authentication]
chapter to learn about the proper authentication procedures.

:::

[Localnet]: http://localhost:8548
[Testnet]: https://explorer.oasis.io/testnet/sapphire
[Mainnet]: https://explorer.oasis.io/mainnet/sapphire
[`isCalldataEnveloped()`]: https://api.docs.oasis.io/js/sapphire-paratime/functions/isCalldataEnveloped.html
[View-Call Authentication]: ./authentication.md

## Lightweight Sapphire TypeScript Wrapper

This shows a quick way to use **Sapphire TypeScript Wrapper** to encrypt
transactions, for more info see
[`@oasisprotocol/sapphire-paratime`][s-p-github].

### Usage

Install the library with your favorite package manager

```shell npm2yarn
npm install @oasisprotocol/sapphire-paratime
```

After installing the library, find your Ethereum provider and wrap it using
`wrapEthereumProvider`.

```js
import { wrapEthereumProvider } from '@oasisprotocol/sapphire-paratime';

const provider = wrapEthereumProvider(window.ethereum);
```

:::info Example: Hardhat boilerplate

Our maintained Hardhat boilerplate uses the Sapphire TypeScript Wrapper to
enable confidential transactions in development. Find the code in the
[Sapphire ParaTime examples] repository.

:::

[Sapphire ParaTime examples]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/hardhat-boilerplate

## Ethers v6

This shows a quick way to use **Ethers v6** to encrypt transactions, for more info
see [@oasisprotocol/sapphire-ethers-v6][ethers-github].

### Usage

Install the library with your favorite package manager

```shell npm2yarn
npm install 'ethers@6.x' '@oasisprotocol/sapphire-ethers-v6'
```

After installing the library, find your Ethereum provider and wrap it using
`wrapEthersSigner`.

```typescript
import { BrowserProvider } from 'ethers';
import { wrapEthersSigner } from '@oasisprotocol/sapphire-ethers-v6';

const signer = wrapEthersSigner(
  new BrowserProvider(window.ethereum).getSigner()
);
```

## Viem

This shows a quick way to use **Viem** to encrypt transactions, for more info
see [@oasisprotocol/sapphire-viem-v2][viem-github].

### Usage

Install the library with your favorite package manager

```shell npm2yarn
npm install @oasisprotocol/sapphire-viem-v2 viem@2.x
```

After installing the library, wrap the WalletClient with `wrapWalletClient`.

```typescript
import { createWalletClient } from 'viem'
import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts';
import { sapphireLocalnet, sapphireHttpTransport, wrapWalletClient } from '@oasisprotocol/sapphire-viem-v2';

const account = mnemonicToAccount(generateMnemonic(english));

const walletClient = await wrapWalletClient(createWalletClient({
	account,
	chain: sapphireLocalnet,
	transport: sapphireHttpTransport()
}));
```

:::info Viem Example

You can find more example code demonstrating how to use the library in our
[Hardhat-Viem example][viem-example].

:::

[viem-example]: https://github.com/oasisprotocol/sapphire-paratime/blob/main/examples/hardhat-viem

## Wagmi

This shows a quick way to use **Wagmi** to encrypt transactions, for more info
see [@oasisprotocol/sapphire-wagmi-v2][wagmi-github].

### Usage

Install the library with your favorite package manager

```shell npm2yarn
npm install @oasisprotocol/sapphire-wagmi-v2 wagmi@2.x viem@2.x
```


After installing the library, you have two approaches depending on your needs:

#### Multi Injected Provider Discovery (EIP-6963)

The primary way to use this library is by wrapping existing Wagmi connectors
with `wrapConnectorWithSapphire()`. This works with any connector type
(MetaMask, WalletConnect, Coinbase Wallet, etc.) and provides seamless
integration with Sapphire networks:

```typescript
import { createConfig } from "wagmi";
import { sapphire, mainnet } from "wagmi/chains";
import { metaMask } from "@wagmi/connectors";
import {
  wrapConnectorWithSapphire,
  sapphireHttpTransport,
  sapphireLocalnet
} from "@oasisprotocol/sapphire-wagmi-v2";
import { http } from "wagmi";

export const wagmiConfig = createConfig({
  chains: [sapphire, sapphireLocalnet, mainnet],
  connectors: [
    // Sapphire-wrapped aware MetaMask for Sapphire chains, unwrapped for other chains
    wrapConnectorWithSapphire(
      metaMask(),
      {
        id: 'metamask-sapphire',
        name: 'MetaMask (Sapphire)',
      }
    ),
  ],
  transports: {
    [sapphire.id]: sapphireHttpTransport(),
    [sapphireLocalnet.id]: sapphireHttpTransport(),
    [mainnet.id]: http(),
  },
});
```

For applications supporting both Sapphire and non-Sapphire networks,
`wrapConnectorWithSapphire()` automatically detects the chain and only applies
encryption when connected to Sapphire networks.

#### EIP-1193 Injected Provider

Alternatively, you can use the simpler `injectedWithSapphire()` connector
if you only need basic injected provider support:

```typescript
import { createConfig } from "wagmi";
import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
  injectedWithSapphire,
  sapphireHttpTransport,
  sapphireLocalnet
} from "@oasisprotocol/sapphire-wagmi-v2";

export const wagmiConfig = createConfig({
  multiInjectedProviderDiscovery: false,
  chains: [sapphire, sapphireTestnet, sapphireLocalnet],
  connectors: [injectedWithSapphire()],
  transports: {
    [sapphire.id]: sapphireHttpTransport(),
    [sapphireTestnet.id]: sapphireHttpTransport(),
    [sapphireLocalnet.id]: sapphireHttpTransport()
  },
});
```

#### Integration With Third-Party Wallet Libraries

When integrating with third-party wallet libraries like RainbowKit, you can wrap
their wallet connectors with Sapphire support by applying
`wrapConnectorWithSapphire()` to the connector returned by the library's wallet
creation function.

Here's a simplified example for RainbowKit:

```typescript
const wrapRainbowKitWalletWithSapphire =
  (
    walletFn: (options: { projectId: string }) => Wallet,
    sapphireOptions: { id: string; name: string },
  ) =>
    (options: { projectId: string }): Wallet => {
      const wallet = walletFn(options);

      return {
        ...wallet,
        id: sapphireOptions.id,
        name: sapphireOptions.name,
        createConnector: (walletDetails) => {
          const originalConnector = wallet.createConnector(walletDetails);
          return (config) => {
            const baseConnector = originalConnector(config);
            const wrappedConnector = wrapConnectorWithSapphire(
              (_) => baseConnector,
              sapphireOptions,
            );
            return wrappedConnector(config);
          };
        },
      };
    };

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        wrapRainbowKitWalletWithSapphire(
          metaMaskWallet,
          {
            id: "metamask-sapphire-rk",
            name: "MetaMask (Sapphire)",
          },
        )
      ],
    },
  ],
  {
    appName: "Wagmi v2 Example",
    projectId: /*PROJECT_ID*/,
  },
);
```

For a complete RainbowKit integration example including mobile wallet handling
and multiple wallet types, see the [RainbowKit configuration][rainbowkit-config]
in our Wagmi example repository.

:::info

For a complete example of how to use this library, please refer to our
[Wagmi example][wagmi-example].

:::

[wagmi-example]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2
[rainbowkit-config]: https://github.com/oasisprotocol/sapphire-paratime/blob/main/examples/wagmi-v2/src/rainbowkit.ts
