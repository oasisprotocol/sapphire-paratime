// SPDX-License-Identifier: Apache-2.0

import {
	KeyFetcher,
	NETWORKS as SapphireNETWORKS,
	type SapphireWrapConfig,
	wrapEthereumProvider,
} from "@oasisprotocol/sapphire-paratime";

import type {
	Chain,
	Client,
	HttpTransportConfig,
	SerializeTransactionFn,
	Transport,
	WalletClient,
} from "viem";

import { http, defineChain, serializeTransaction } from "viem";

/**
 * sapphire-localnet chain, a local chain for local people
 */
export const sapphireLocalnet = defineChain({
	id: SapphireNETWORKS.localnet.chainId,
	name: "Oasis Sapphire Localnet",
	network: "sapphire-localnet",
	nativeCurrency: { name: "Sapphire Local Rose", symbol: "TEST", decimals: 18 },
	rpcUrls: {
		default: {
			http: [SapphireNETWORKS.localnet.defaultGateway],
			//webSocket: ["ws://localhost:8546/ws"],
		},
	},
	testnet: true,
}) satisfies Chain;

// Hidden property used to detect if transport is Sapphire-wrapped
export const SAPPHIRE_WRAPPED_VIEM_TRANSPORT = Symbol(
	"#SAPPHIRE_WRAPPED_VIEM_TRANSPORT",
);

// biome-ignore lint/suspicious/noExplicitAny: required for viem compatibility
type EthereumProvider = { request(...args: unknown[]): Promise<any> };

export type SapphireHttpTransport = Transport<
	"sapphire",
	// biome-ignore lint/complexity/noBannedTypes: required for viem compatibility
	{},
	EthereumProvider["request"]
>;

/**
 * Provide a Sapphire encrypted RPC transport for Wagmi or Viem.
 *
 * Example:
 * ```
 * import { createConfig } from 'viem';
 * import { sapphireHttpTransport } from '@oasisprotocol/sapphire-viem-v2';
 *
 * export const config = createConfig({
 *   transports: {
 *     [sapphireTestnet.id]: sapphireHttpTransport()
 *   },
 *   ...
 * });
 * ```
 *
 * Results for every instance of sapphireHttpTransport() are cached to prevent
 * the wrapper from being instantiated multiple times.
 *
 * @returns Same as http()
 */
export function sapphireHttpTransport<T extends Transport>(
	sapphireConfig?: SapphireWrapConfig,
	overrideUrl?: string,
	httpConfig?: HttpTransportConfig,
): T {
	const cachedProviders: Record<string, unknown> = {};
	return ((params) => {
		const defaultUrl = params.chain?.rpcUrls.default.http[0];
		const url = overrideUrl || defaultUrl;
		if (!url) {
			throw new Error(
				"sapphireHttpTransport() needs a chain.rpcUrls.default.http[0] to be set or explicit url",
			);
		}
		if (!(url in cachedProviders)) {
			const x = wrapEthereumProvider(
				http(url, httpConfig)(params),
				sapphireConfig,
			);
			Reflect.set(x, SAPPHIRE_WRAPPED_VIEM_TRANSPORT, true);
			cachedProviders[url] = x;
		}
		return cachedProviders[url];
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
	C extends Client,
	S extends SerializeTransactionFn,
>(client: C, originalSerializer?: S | undefined): Promise<S> {
	// Don't double-wrap serializer
	if (
		originalSerializer &&
		Reflect.has(originalSerializer, SAPPHIRE_WRAPPED_VIEM_SERIALIZER)
	) {
		return originalSerializer;
	}

	// As the serializer is synchronous, fetching keys while running
	const fetcher = new KeyFetcher();
	const provider = client as EthereumProvider;
	await fetcher.fetch(provider);

	// The fetcher runs in the background, routinely fetching the keys
	// This means when the serializer requests a calldata public key one will
	// have been retrieved pre-emptively.
	const intervalId: NodeJS.Timeout | number = setInterval(async () => {
		await fetcher.fetch(provider);
	}, fetcher.timeoutMilliseconds);
	// The interval ID is unreferenced to prevent Node from hanging at exit
	// See discussion on https://github.com/oasisprotocol/sapphire-paratime/pull/379
	// This is only available in NodeJS, and not in browsers
	if (typeof intervalId.unref === "function") {
		intervalId.unref();
	}

	const wrappedSerializer = ((tx, sig?) => {
		if (!sig) {
			const cipher = fetcher.cipherSync();
			const encryptedData = cipher.encryptCall(tx.data);
			tx.data = encryptedData as `0x${string}`;
		}
		if (originalSerializer) {
			return originalSerializer(tx, sig);
		}
		return serializeTransaction(tx, sig);
	}) as S;

	Reflect.set(wrappedSerializer, SAPPHIRE_WRAPPED_VIEM_SERIALIZER, true);

	return wrappedSerializer;
}

// Hidden property to test if serializer is Sapphire-wrapped
export const SAPPHIRE_WRAPPED_VIEM_SERIALIZER = Symbol(
	"#SAPPHIRE_WRAPPED_VIEM_SERIALIZER",
);

/**
 * Add the Sapphire transaction encryption wrapper to a wallet client
 *
 * Example:
 * ```
 * walletClient = await wrapWalletClient(createWalletClient({
 *   account,
 *   chain: sapphireLocalnet,
 *   transport: sapphireHttpTransport()
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
