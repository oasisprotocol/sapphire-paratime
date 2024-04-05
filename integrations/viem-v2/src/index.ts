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

/**
 * This environment variable allows for the sapphire-localnet port to be
 * overridden via the command-line. This is useful for debugging with a proxy.
 *
 * Note: this will fail gracefully in-browser
 */
export const SAPPHIRE_LOCALNET_HTTP_PROXY_PORT = globalThis.process?.env
	?.SAPPHIRE_LOCALNET_HTTP_PROXY_PORT
	? Number(process.env.SAPPHIRE_LOCALNET_HTTP_PROXY_PORT)
	: 8545;

/**
 * sapphire-localnet chain, a local chain for local people
 */
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
 * import { createConfig } from 'viem';
 * import { sapphireTransport } from '@oasisprotocol/sapphire-viem-v2';
 *
 * export const config = createConfig({
 *   transports: {
 *     [sapphireTestnet.id]: sapphireTransport()
 *   },
 *   ...
 * });
 * ```
 *
 * @returns Same as custom()
 */
export function sapphireTransport<T extends Transport>(): T {
	const cachedProviders: Record<string, ReturnType<typeof wrap>> = {};
	return ((params) => {
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
	}) as T;
}

/**
 * Creates a Viem transaction serializer which encrypts transactions prior to
 * them being signed. This is compatible with both local wallet clients and
 * injected wallets.
 *
 * Example
 * ```
 * import { defineChain } from 'viem';
 * import { createSapphireSerializer } from '@oasisprotocol/sapphire-viem-v2';
 *
 * defineChain({
 *   serializers: {
 *     transaction: createSapphireSerializer(publicClient)
 *   },
 *   ...
 * });
 * ```
 *
 * @param client Provides upstream access to Sapphire JSON-RPC via `.request`
 * @param originalSerializer Optional serializer to wrap, otherwise will use default
 * @returns Sapphire wrapped transaction encryption serializer
 */
export async function createSapphireSerializer<
	S extends Client,
	T extends SerializeTransactionFn,
>(client: S, originalSerializer?: T | undefined): Promise<T> {
	// Don't double-wrap serializer
	if (
		originalSerializer &&
		Reflect.has(originalSerializer, SAPPHIRE_WRAPPED_VIEM_SERIALIZER)
	) {
		return originalSerializer;
	}

	// As the serialized is synchronous, pre-emptively fetch keys while running
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
 * Example:
 * ```
 * walletClient = await wrapWalletClient(createWalletClient({
 *   account,
 *   chain: sapphireLocalnet,
 *   transport: sapphireTransport()
 * }));
 * ```
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
