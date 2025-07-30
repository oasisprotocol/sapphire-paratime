This is a [Vite](https://vitejs.dev) project bootstrapped with [create-wagmi].

[create-wagmi]: https://github.com/wevm/wagmi/tree/main/packages/create-wagmi

It uses the Sapphire wrapper to encrypt contract deployments, transactions,
view calls & gas estimations using the `injectedWithSapphire()` connector and
`sapphireHttpTransport` adapter configured in `src/wagmi.ts`:

The connector and transport must be configured to use Sapphire to ensure
that both transactions and view calls are encrypted.

```typescript
import { injectedWithSapphire,
         sapphireHttpTransport,
         sapphireLocalnet } from "@oasisprotocol/sapphire-wagmi-v2";

export const config = createConfig({
	multiInjectedProviderDiscovery: false,
	chains: [sapphire, sapphireTestnet, sapphireLocalnet],
	connectors: [injectedWithSapphire()],
	transports: {
		[sapphire.id]: sapphireHttpTransport(),
		[sapphireTestnet.id]: sapphireHttpTransport(),
		[sapphireLocalnet.id]: sapphireHttpTransport(),
	},
});
```

Please note that `multiInjectedProviderDiscovery` is disabled, as [EIP-6963] is
not yet supported by the Sapphire Wagmi integration.

[EIP-6963]: https://eips.ethereum.org/EIPS/eip-6963









### Third-party integration

#### Rainbowkit

Injected wallet

```ts
wallets: [
    (wallet => () => ({
      ...wallet,
      id: 'injected-sapphire',
      name: 'Injected (Sapphire)',
      createConnector: walletDetails =>
        createConnector(config => ({
          ...injectedWithSapphire()(config),
          ...walletDetails,
        })),
    }))(injectedWallet())
]
```

WalletConnect

```ts
const sapphireWalletConnectWallet = (sapphireOptions?: SapphireWrapConfig) => ({projectId, options}: WalletConnectWalletOptions): Wallet => ({
  id: "walletConnect-sapphire",
  name: "WalletConnect (Sapphire)",
  installed: void 0,
  iconUrl: walletConnectIconUrl,
  iconBackground: "#3b99fc",
  qrCode: {  getUri: (uri) => uri },
  createConnector: (walletDetails: RainbowKitDetails) =>
    createConnector((config) => ({
      ...walletConnectWithSapphire({
        projectId,
        ...options,
        showQrModal: false,
        rkDetailsShowQrModal: walletDetails.rkDetails.showQrModal,
        rkDetailsIsWalletConnectModalConnector: walletDetails.rkDetails.isWalletConnectModalConnector
      }, sapphireOptions)(config),
      ...walletDetails
    })),
});
```

Metamask

```ts
const wrappedMetaMaskWallet = ({projectId, options}: WalletConnectWalletOptions): Wallet => {
  const baseWallet = metaMaskWallet({
    projectId,
  });

  return {
    ...baseWallet,
    id: 'metamask-wrapped',
    name: 'MetaMask (Sapphire)',
    createConnector: (walletDetails) => {
      const baseConnector = baseWallet.createConnector(walletDetails);

      return createConnector((config) => {
        const connector = baseConnector(config);
        const originalGetProvider = connector.getProvider.bind(connector);

        connector.getProvider = async () => {
          const provider = await originalGetProvider();

          if (isWrappedEthereumProvider(provider as EIP2696_EthereumProvider)) {
            return provider;
          }

          return wrapEthereumProvider(
            provider as EIP2696_EthereumProvider,
          );
        };

        return connector;
      });
    }
  };
};
```
