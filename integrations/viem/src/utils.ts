import { toBytes, type EIP1193Provider } from "viem";
import { Cipher, fetchRuntimePublicKeyByChainId, type Envelope, type BytesLike, arrayify, isBytesLike, Kind as CipherKind } from "./cipher.js";
import * as cbor from "cborg";

export type Hooks<T> = {
    [K in keyof T]?: T[K];
};


export const SAPPHIRE_PROP = "sapphire";


export type SapphireAnnex = {
    [SAPPHIRE_PROP]: {
        cipher: Cipher;
    };
};


export async function fetchRuntimePublicKey(
    request: EIP1193Provider["request"],
    chainId?: number,
): Promise<Uint8Array> {
    try {
        const resp: any = await request({
            method: "oasis_callDataPublicKey" as any,
            args: [],
        });
        if (resp && "key" in resp) {
            return toBytes(resp.key);
        }
    } catch (e: any) {
        console.error(
            "failed to fetch runtime public key using upstream transport:",
            e,
        );
    }
    if (!chainId) {
        throw new Error("unable to fetch runtime public key. chain not provided");
    }
    return fetchRuntimePublicKeyByChainId(chainId);
}


export function makeProxy<U extends object>(
    upstream: U,
    cipher: Cipher,
    hooks: Hooks<U>,
): U & SapphireAnnex {
    return new Proxy(upstream, {
        get(upstream, prop) {
            if (prop === SAPPHIRE_PROP) return { cipher };
            if (prop in hooks) return Reflect.get(hooks, prop);
            const value = Reflect.get(upstream, prop);
            return typeof value === "function" ? value.bind(upstream) : value;
        },
    }) as U & SapphireAnnex;
}


// -----------------------------------------------------------------------------
// Determine if the CBOR encoded calldata is a signed query or an evelope

export class EnvelopeError extends Error {}

interface SignedQuery {
    data: Envelope;
    leash: any;
    signature: Uint8Array;
}

type SignedQueryOrEnvelope = Envelope | SignedQuery;

function isSignedQuery(x: SignedQueryOrEnvelope): x is SignedQuery {
    return 'data' in x && 'leash' in x && 'signature' in x;
}

export function isCalldataEnveloped(calldata: BytesLike, allowSignedQuery: boolean) {
    try {
        const outer_envelope = cbor.decode(arrayify(calldata)) as SignedQueryOrEnvelope;
        let envelope: Envelope;
        if (isSignedQuery(outer_envelope)) {
            if (!allowSignedQuery) {
                throw new EnvelopeError('Got unexpected signed query!');
            }
            envelope = outer_envelope.data;
        } else {
            envelope = outer_envelope;
        }
        if (!envelopeFormatOk(envelope)) {
            throw new EnvelopeError(
            'Bogus Sapphire enveloped data found in transaction!',
            );
        }
        return true;
    } catch (e: any) {
        if (e instanceof EnvelopeError) throw e;
    }
    return false;
}

export function envelopeFormatOk(envelope: Envelope): boolean {
    const { format, body, ...extra } = envelope;

    if (Object.keys(extra).length > 0) return false;

    if (!body) return false;

    if (format !== null && format !== CipherKind.Plain) {
        if (isBytesLike(body)) return false;

        if (!isBytesLike(body.data)) return false;
    }

    return true;
}