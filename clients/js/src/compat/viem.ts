import { Chain, EIP1193Provider, WalletClient, http, toBytes } from 'viem';

import {
  Cipher,
  X25519DeoxysII,
  fetchRuntimePublicKeyByChainId,
  lazy as lazyCipher,
} from '../cipher.js';
import { Hooks, makeProxy } from './utils.js';

export default function <U extends WalletClient>(
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
  upstream.transport.request;
  const cipher =
    overrides?.cipher ??
    lazyCipher(async () => {
      const rtPubKey = await fetchRuntimePublicKey(transport, upstream.chain);
      return X25519DeoxysII.ephemeral(rtPubKey);
    });
  return makeProxy(
    upstream,
    {} as any,
    {
      async sendTransaction(req) {
        return upstream.sendTransaction({
          ...req,
          data: await cipher.encryptEncode(req.data),
        });
      },
    } as Hooks<U>,
  );
}

async function fetchRuntimePublicKey(
  {
    request,
  }: {
    request: EIP1193Provider['request'];
  },
  chain?: Chain,
): Promise<Uint8Array> {
  try {
    const resp: any = await request({
      method: 'oasis_callDataPublicKey' as any,
      args: [],
    });
    if (resp && 'key' in resp) {
      return toBytes(resp.key);
    }
  } catch (e: any) {
    console.error(
      'failed to fetch runtime public key using upstream transport:',
      e,
    );
  }
  if (!chain)
    throw new Error('unable to fetch runtime public key. chain not provided');
  return fetchRuntimePublicKeyByChainId(chain.id);
}
