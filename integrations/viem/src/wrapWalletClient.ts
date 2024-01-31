import {
    type EIP1193Provider,
    encodeFunctionData,
    toBytes,
    type WalletClient,
  } from "viem";

  import {
    Cipher,
    fetchRuntimePublicKeyByChainId,
    lazy as lazyCipher,
    X25519DeoxysII,
  } from "./cipher.js";

  export type Hooks<T> = {
    [K in keyof T]?: T[K];
  };

  const SAPPHIRE_PROP = "sapphire";

  export type SapphireAnnex = {
      [SAPPHIRE_PROP]: {
          cipher: Cipher;
      };
  };

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
      )[action.name || name]?.(params) ?? action(client, params);
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
        async writeContract(req) {
            const data = encodeFunctionData({
                abi: req.abi,
                args: req.args,
                functionName: req.functionName,
            } as any);
            const encryptedData = await cipher.encryptEncode(data);
            const hash = await getAction(
                upstream,
                upstream.sendTransaction,
                "sendTransaction",
            )({
                data: encryptedData,
                to: req.address,
                ...req,
            });
            return hash;
        },
        async prepareTransactionRequest(req) {
            return upstream.prepareTransactionRequest(req);
        },
        async sendRawTransaction(req) {
            return upstream.sendRawTransaction(req);
        },
        async sendTransaction(req) {
            req.data = await cipher.encryptEncode(req.data);
            return upstream.sendTransaction(req);
        },
        async signTransaction(req) {
            req.data = await cipher.encryptEncode(req.data);
            return upstream.signTransaction(req);
        },
      } as Hooks<U>);
  }

  async function fetchRuntimePublicKey(
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
