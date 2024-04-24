// SPDX-License-Identifier: Apache-2.0

import type {
	ContractRunner,
	EthersError,
	Provider,
	Signer,
	TransactionLike,
	TransactionRequest,
} from "ethers";
import { AbstractSigner, type JsonRpcApiProvider, hexlify } from "ethers";

import type {
	Cipher,
	EIP1193_RequestArguments,
	EIP1193_RequestFn,
	EIP2696_EthereumProvider,
	SapphireWrapOptions,
} from "@oasisprotocol/sapphire-paratime";

import {
	fillOptions,
	isCalldataEnveloped,
	makeTaggedProxyObject,
} from "@oasisprotocol/sapphire-paratime";

export { NETWORKS } from "@oasisprotocol/sapphire-paratime";

function isEthersJsonRpcApiProvider(
	p: ContractRunner,
): p is JsonRpcApiProvider {
	return "send" in p && typeof p.send === "function";
}

/// JsonRpcApiProviders need to be made EIP-1193 compatible
function addJsonRpcRequestHook(
	p: Signer | Provider,
	hooks: Record<string, unknown>,
) {
	let q: JsonRpcApiProvider;
	if (isEthersJsonRpcApiProvider(p)) {
		q = p;
	} else if (p.provider && isEthersJsonRpcApiProvider(p.provider)) {
		q = p.provider;
	} else {
		throw new Error("Runner not jsonRpcApiProvider");
	}

	if (!isEthereumProvider(q)) {
		hooks.request = makeEthereumRequestFnFromProvider(p);
	}
}

function isEthereumProvider(
	p: ContractRunner | EIP2696_EthereumProvider,
): p is EIP2696_EthereumProvider {
	return "request" in p && typeof p.request === "function";
}

function makeEthereumRequestFnFromProvider(
	r: ContractRunner,
): EIP1193_RequestFn {
	if (isEthereumProvider(r)) {
		return r.request;
	}

	let p: JsonRpcApiProvider;
	if (isEthersJsonRpcApiProvider(r)) {
		p = r;
	} else if (r.provider && isEthersJsonRpcApiProvider(r.provider)) {
		p = r.provider;
	} else {
		throw new Error("Runner not jsonRpcApiProvider");
	}

	return async (request: EIP1193_RequestArguments): Promise<unknown> => {
		const { method, params } = request;
		return p.send(method, params ?? []);
	};
}

const SAPPHIRE_WRAPPED_ETHERS_SIGNER = "#SAPPHIRE_WRAPPED_ETHERS_SIGNER";

function isWrappedSigner<P extends Signer>(
	p: P,
): p is P & EIP2696_EthereumProvider {
	return SAPPHIRE_WRAPPED_ETHERS_SIGNER in p;
}

export function wrapEthersSigner<P extends Signer>(
	upstream: P,
	options?: SapphireWrapOptions,
): P & EIP2696_EthereumProvider {
	if (isWrappedSigner(upstream)) {
		return upstream;
	}

	const filled_options = fillOptions(options);

	let signer: Signer;
	if (upstream.provider) {
		const provider = wrapEthersProvider(upstream.provider, filled_options);
		try {
			signer = upstream.connect(provider);
		} catch (e: unknown) {
			if ((e as EthersError).code !== "UNSUPPORTED_OPERATION") throw e;
			signer = upstream;
		}
	} else {
		signer = upstream;
	}
	const hooks: Record<string, unknown> = {
		sendTransaction: hookEthersSend(
			signer.sendTransaction.bind(signer),
			filled_options,
			signer,
		),
		signTransaction: hookEthersSend(
			signer.signTransaction.bind(signer),
			filled_options,
			signer,
		),
		call: hookEthersCall(signer, "call", filled_options),
		estimateGas: hookEthersCall(signer, "estimateGas", filled_options),
		connect(provider: Provider) {
			const wp = signer.connect(provider);
			return wrapEthersSigner(wp, filled_options);
		},
	};

	addJsonRpcRequestHook(signer, hooks);

	return makeTaggedProxyObject(
		signer,
		SAPPHIRE_WRAPPED_ETHERS_SIGNER,
		filled_options,
		hooks,
	) as P & EIP2696_EthereumProvider;
}

const SAPPHIRE_WRAPPED_ETHERS_PROVIDER = "#SAPPHIRE_WRAPPED_ETHERS_PROVIDER";

function isWrappedProvider<P extends Provider>(
	p: P,
): p is P & EIP2696_EthereumProvider {
	return SAPPHIRE_WRAPPED_ETHERS_PROVIDER in p;
}

export function wrapEthersProvider<P extends Provider>(
	provider: P,
	options?: SapphireWrapOptions,
): P & EIP2696_EthereumProvider {
	const filled_options = fillOptions(options);

	// Already wrapped, so don't wrap it again.
	if (isWrappedProvider(provider)) {
		return provider;
	}

	const hooks: Record<string, unknown> = {
		// Calls can be unsigned, but must be enveloped.
		call: hookEthersCall(provider, "call", filled_options),
		estimateGas: hookEthersCall(provider, "estimateGas", filled_options),
	};

	addJsonRpcRequestHook(provider, hooks);

	return makeTaggedProxyObject(
		provider,
		SAPPHIRE_WRAPPED_ETHERS_PROVIDER,
		filled_options,
		hooks,
	) as P & EIP2696_EthereumProvider;
}

function isEthersSigner(upstream: object): upstream is Signer {
	return upstream instanceof AbstractSigner;
}

async function sendUnsignedCall(
	fn: ContractRunner["call"] | ContractRunner["estimateGas"],
	call: TransactionRequest,
	is_already_enveloped: boolean,
	cipher: Cipher,
) {
	let call_data = call.data ?? undefined;
	if (!is_already_enveloped) {
		call_data = cipher.encryptCall(call.data ?? new Uint8Array());
	}
	return await fn?.({
		...call,
		data: call_data ? hexlify(call_data) : "0x",
	});
}

function hookEthersCall(
	runner: ContractRunner,
	method: "call" | "estimateGas",
	options: SapphireWrapOptions,
) {
	const request = makeEthereumRequestFnFromProvider(runner);

	return async (call: TransactionLike<string>) => {
		const cipher = await options.fetcher.cipher({ request });

		// If the calldata is already enveloped, don't wrap it in another envelope
		const is_already_enveloped = isCalldataEnveloped(call.data ?? undefined);

		const f = runner[method];
		if (!f) {
			throw new Error(`${method} not found in runner!`);
		}

		const res = await sendUnsignedCall(
			f.bind(runner),
			isEthersSigner(runner) ? await runner.populateCall(call) : call,
			is_already_enveloped,
			cipher,
		);

		// NOTE: if it's already enveloped, caller will decrypt it (not us)
		if (!is_already_enveloped && res && typeof res === "string") {
			return cipher.decryptResult(res);
		}
		return res;
	};
}

function hookEthersSend<
	C extends Signer["sendTransaction"] | Signer["signTransaction"],
>(send: C, options: SapphireWrapOptions, signer: Signer): C {
	const request = makeEthereumRequestFnFromProvider(signer);

	return (async (tx: TransactionRequest) => {
		if (tx.data) {
			const cipher = await options.fetcher.cipher({ request });
			tx.data = cipher.encryptCall(tx.data);
		}
		return send(tx);
	}) as C;
}
