import * as cbor from 'cborg';
import * as ethers from 'ethers';

import {
  EthCall,
  makeSignableCall,
  signedCallEIP712Params,
} from '@oasislabs/sapphire-paratime/signed_calls.js';
import { Cipher } from '@oasislabs/sapphire-paratime/cipher.js';

export const CHAIN_ID = 0x5afe;

export async function verifySignedCall(
  call: EthCall,
  cipher?: Cipher,
): Promise<void> {
  const { domain, types } = signedCallEIP712Params(CHAIN_ID);
  const dataPack = cbor.decode(ethers.utils.arrayify(call.data!));
  const body = dataPack?.data?.body;
  let origData: Uint8Array;
  if (cipher) {
    const envelopeBytes = await cipher.decrypt(body?.nonce, body?.data ?? body);
    origData = cbor.decode(envelopeBytes).body;
  } else {
    origData = body;
  }
  const recoveredSender = ethers.utils.verifyTypedData(
    domain,
    types,
    makeSignableCall({ ...call, data: origData }, dataPack.leash),
    dataPack.signature,
  );
  if (call.from.toLowerCase() !== recoveredSender.toLowerCase()) {
    throw new Error('signed call signature verification failed');
  }
}
