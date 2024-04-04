import { KeyFetcher, wrap } from "@oasisprotocol/sapphire-paratime";
import { defineChain, type Transport, custom, type WalletClient, serializeTransaction } from "viem";

export const sapphireLocalnet = defineChain({
	id: 0x5afd,
	name: "Oasis Sapphire Localnet",
	network: "sapphire-localnet",
	nativeCurrency: { name: "Sapphire Local Rose", symbol: "TEST", decimals: 18 },
	rpcUrls: {
		default: {
			http: ["http://localhost:8545"],
			webSocket: ["ws://localhost:8546/ws"],
		},
	},
	testnet: true
});


/**
 * Provide a Sapphire encrypted RPC transport for Wagmi or Viem.
 *
 * Example:
 * ```
 *
 *    import { sapphireTransport } from '@oasisprotocol/sapphire-viem-v2';
 *
 *    export const config = createConfig({
 *      transports: {
 *        [sapphireTestnet.id]: sapphireTransport()
 *      },
 *      ...
 *    });
 *
 * ```
 *
 * @returns Same as custom()
 */
export function sapphireTransport(): Transport {
	return (params) => {
		if (!params.chain) {
			throw new Error("sapphireTransport() not possible with no params.chain!");
		}
		const p = wrap(params.chain.rpcUrls.default.http[0]);
		return custom(p)(params);
	};
}

const SAPPHIRE_WRAPPED_VIEM_SERIALIZER = 'SAPPHIRE_WRAPPED_VIEM_SERIALIZER';

export async function wrapWalletClient<T extends WalletClient>(client: T) : Promise<T>
{
	if( ! client.chain ) {
		throw new Error('No chain defined in client');
	}

	if( ! client.chain.serializers ) {
		client.chain.serializers = {}
	}

	const originalSerializer = client.chain?.serializers?.transaction;

	if( ! originalSerializer || ! Reflect.get(originalSerializer, SAPPHIRE_WRAPPED_VIEM_SERIALIZER) )
	{
		const fetcher = new KeyFetcher();

		await fetcher.fetch(client as any);

		fetcher.runInBackground(client as any);

		client.chain.serializers.transaction = (tx, sig?) => {
			if( ! sig ) {
				const cipher = fetcher.cipherSync();
				const encryptedData = cipher.encryptEncode(tx.data);
				tx.data = encryptedData as `0x${string}`;
			}
			if( originalSerializer ) {
				return originalSerializer(tx, sig);
			}
			return serializeTransaction(tx, sig);
		}
		Reflect.set(client.chain.serializers.transaction, SAPPHIRE_WRAPPED_VIEM_SERIALIZER, true);
	}

	return client;
}