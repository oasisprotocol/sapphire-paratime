import {
    type EIP1193Provider,
    type PublicClient,
    type WalletClient,
    encodeFunctionData,
} from "viem";

import {
    Cipher,
    lazy as lazyCipher,
    X25519DeoxysII,
} from "./cipher.js";

import { fetchRuntimePublicKey, makeProxy, type Hooks } from './utils.js'
import { call, deployContract, estimateGas, prepareTransactionRequest } from "viem/actions";


function getAction<params extends {}, returnType extends {}>(
    client: any,
    action: (_: any, params: params) => returnType,
    // Some minifiers drop `Function.prototype.name`, meaning that `action.name`
    // will not work. For that case, the consumer needs to pass the name explicitly.
    name: string,
) {
    return (params: params): returnType =>
    (
        client as any & {
            [key: string]: (params: params) => returnType;
        }
    )[action.name || name](params) ?? action(client, params);
}


export function wrapPublicClient<U extends PublicClient>(
    upstream: U,
    overrides?: Partial<{
        cipher: Cipher;
        transport: { request: EIP1193Provider['request'] };
    }>,
): U {
    const transport = overrides?.transport ?? upstream.transport;
    if (!transport)
        throw new Error(
            'unknown transport. please configure one on the wallet client or pass it as an override',
        );
    const cipher =
        overrides?.cipher ??
        lazyCipher(async () => {
            const rtPubKey = await fetchRuntimePublicKey(transport.request, await upstream.getChainId());
            return X25519DeoxysII.ephemeral(rtPubKey);
        });
    return makeProxy(upstream, cipher, {
        async estimateGas(req) {
            console.log('Hooked estimateGas');
            return estimateGas(this as any, {
                ...req,
                data: await cipher.encryptEncode(req.data),
            });
        },
        async call(req) {
            console.log('Hooked call');
            return call(this as any, {
                ...req,
                data: await cipher.encryptEncode(req.data),
            });
        },
    } as Hooks<U>);
}

export function wrapWalletClient<U extends WalletClient>(
    upstream: U,
    overrides?: Partial<{
        cipher: Cipher;
        transport: { request: EIP1193Provider["request"] };
    }>,
): U {
    const transport = overrides?.transport ?? upstream.transport;
    if (!transport)
        throw new Error(
            "unknown transport. please configure one on the wallet client or pass it as an override",
        );
    const cipher =
        overrides?.cipher ??
        lazyCipher(async () => {
            const rtPubKey = await fetchRuntimePublicKey(transport.request, await upstream.getChainId());
            return X25519DeoxysII.ephemeral(rtPubKey);
        });
    return makeProxy<U>(upstream, cipher, {
        async deployContract(args) {
            console.log('Hooked deploy');
            return deployContract(this as any, args);
        },
        async writeContract(req) {
            console.log('Hooked writeContract', req);
            const data = encodeFunctionData({
                abi: req.abi,
                args: req.args,
                functionName: req.functionName,
            } as any);
            const encryptedData = await cipher.encryptEncode(data);
            const hash = getAction(
                this,
                upstream.sendTransaction.bind(this),
                "sendTransaction",
            )({
                data: encryptedData,
                to: req.address,
                ...req,
            });
            return hash;
        },
        async prepareTransactionRequest(req) {
            console.log('Hooked prepareTransactionRequest', req);
            return prepareTransactionRequest(this as any, req);
        },
        /*
        async sendRawTransaction(req) {
            console.log('hooked sendRawTransaction', req);
            return upstream.sendRawTransaction(req);
        },
        async sendTransaction(req) {
            console.log('Hooked sendTransaction', req);
            req.data = await cipher.encryptEncode(req.data);
            return upstream.sendTransaction(req);
        },
        async signTransaction(req) {
            console.log('Hooked signTransaction', req);
            req.data = await cipher.encryptEncode(req.data);
            return upstream.signTransaction(req);
        },
        */
    } as Hooks<U>);
}
