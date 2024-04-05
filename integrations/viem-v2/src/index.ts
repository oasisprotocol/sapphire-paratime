import { KeyFetcher, wrap } from "@oasisprotocol/sapphire-paratime";
import {
	type Client,
	type SerializeTransactionFn,
	type Transport,
	type WalletClient,
	custom,
	defineChain,
	serializeTransaction,
} from "viem";

declare let process: {
	env: {
		SAPPHIRE_LOCALNET_HTTP_PROXY_PORT?: string;
	};
};

// Allows for the sapphire-localnet port to be overridden in command-line
// Note: this will fail gracefully in-browser
export const SAPPHIRE_LOCALNET_HTTP_PROXY_PORT = globalThis.process?.env
	?.SAPPHIRE_LOCALNET_HTTP_PROXY_PORT
	? Number(process.env.SAPPHIRE_LOCALNET_HTTP_PROXY_PORT)
	: 8545;

export const sapphireLocalnet = defineChain({
	id: 0x5afd,
	name: "Oasis Sapphire Localnet",
	network: "sapphire-localnet",
	nativeCurrency: { name: "Sapphire Local Rose", symbol: "TEST", decimals: 18 },
	rpcUrls: {
		default: {
			http: [`http://localhost:${SAPPHIRE_LOCALNET_HTTP_PROXY_PORT}`],
			//webSocket: ["ws://localhost:8546/ws"],
		},
	},
	testnet: true,
});

// Hidden property used to detect if transport is Sapphire-wrapped
const SAPPHIRE_WRAPPED_VIEM_TRANSPORT = "#SAPPHIRE_WRAPPED_VIEM_TRANSPORT";

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
	const cachedProviders: Record<string, ReturnType<typeof wrap>> = {};
	return (params) => {
		if (!params.chain) {
			throw new Error("sapphireTransport() not possible with no params.chain!");
		}
		const url = params.chain.rpcUrls.default.http[0];
		if (!(url in cachedProviders)) {
			cachedProviders[url] = wrap(url);
		}
		const p = cachedProviders[url];
		const q = custom(p)(params);
		Reflect.set(q, SAPPHIRE_WRAPPED_VIEM_TRANSPORT, true);
		return q;
	};
}

export async function createSapphireSerializer<
	S extends Client,
	T extends SerializeTransactionFn,
>(client: S, originalSerializer: T | undefined): Promise<T> {
	const fetcher = new KeyFetcher();

	await fetcher.fetch(client as unknown as Parameters<typeof fetcher.fetch>[0]);

	fetcher.runInBackground(
		client as unknown as Parameters<typeof fetcher.fetch>[0],
	);

	const wrappedSerializer = ((tx, sig?) => {
		if (!sig) {
			const cipher = fetcher.cipherSync();
			const encryptedData = cipher.encryptEncode(tx.data);
			tx.data = encryptedData as `0x${string}`;
		}
		if (originalSerializer) {
			return originalSerializer(tx, sig);
		}
		return serializeTransaction(tx, sig);
	}) as T;

	Reflect.set(wrappedSerializer, SAPPHIRE_WRAPPED_VIEM_SERIALIZER, true);

	return wrappedSerializer;
}

// Hidden property to test if serializer is Sapphire-wrapped
const SAPPHIRE_WRAPPED_VIEM_SERIALIZER = "#SAPPHIRE_WRAPPED_VIEM_SERIALIZER";

/**
 * Add the Sapphire transaction encryption wrapper to a wallet client
 *
 * @param client Wagmi wallet client
 * @returns wrapped wallet client
 */
export async function wrapWalletClient<T extends WalletClient>(
	client: T,
): Promise<T> {
	if (!client.chain) {
		throw new Error("No chain defined in client");
	}

	const originalSerializer = client.chain?.serializers?.transaction;

	// Override any existing transaction serializer, or create a new one
	// With one that auto-encrypts transactions before they're signed
	if (
		!originalSerializer ||
		!Reflect.get(originalSerializer, SAPPHIRE_WRAPPED_VIEM_SERIALIZER)
	) {
		if (!client.chain.serializers) {
			client.chain.serializers = {};
		}

		client.chain.serializers.transaction = await createSapphireSerializer(
			client,
			originalSerializer,
		);
	}

	return client;
}
