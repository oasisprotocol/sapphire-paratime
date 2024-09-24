import { ethers } from 'hardhat';
import { expect } from 'chai';
import * as cborg from 'cborg';
import { AbiCoder, getBytes } from 'ethers';
import { CallDataPublicKey, curve25519_to_ed25519, ed25519_to_curve25519, hexlify, verifyRuntimePublicKey } from '@oasisprotocol/sapphire-paratime'

async function doSubcall(name:string, args:any=null) {
    const coder = AbiCoder.defaultAbiCoder();
    const data = coder.encode(
        ['string', 'bytes'],
        [name, cborg.encode(args)],
    );
    const subcallResult = await ethers.provider.call({
        to: '0x0100000000000000000000000000000000000103', data
    });
    const [subcall_status, subcall_raw_response] = coder.decode(
        ['uint', 'bytes'], subcallResult,
    );
    expect(subcall_status).eq(0n);
    return cborg.decode(getBytes(subcall_raw_response));
}

describe('Call Data Public Key', () => {
    it.skip('core.KeyManagerPublicKey', async () => {
        const blah = await doSubcall('core.KeyManagerPublicKey');
    });

    it('core.CallDataPublicKey', async () => {
        const signerPk = await doSubcall('core.KeyManagerPublicKey');
        console.log('KeyManagerPublicKey', signerPk);

        const signerPkEd25519 = curve25519_to_ed25519(signerPk.public_key.key);
        const signerPkX25519 = ed25519_to_curve25519(signerPkEd25519)!;
        expect(hexlify(signerPkX25519)).eq(hexlify(signerPk.public_key.key));

        const response = await doSubcall('core.CallDataPublicKey') as CallDataPublicKey;
        console.log('CallDataPublicKey', response);
        console.log('cdpk.public_key.key', hexlify(response.public_key.key));
        console.log('signerPK', hexlify(signerPk.public_key.key));
        console.log('signerPK (ed25519)', hexlify(signerPkEd25519));
        console.log('signerPK (x25519)', hexlify(signerPkX25519));
        console.log('cdpk sig', hexlify(response.public_key.signature));

        const cdpk_sig_R = response.public_key.signature.slice(0, 32);
        const cdpk_sig_R_ed25519 = curve25519_to_ed25519(cdpk_sig_R);
        console.log('cdpk sig R', hexlify(response.public_key.signature));
        console.log('cdpk sig R (ed25519)', hexlify(cdpk_sig_R_ed25519));

        const cdpk_sig_s = response.public_key.signature.slice(32);
        console.log('cdpk sig s', hexlify(cdpk_sig_s));

        const newsig = new Uint8Array([...cdpk_sig_R_ed25519, ...cdpk_sig_s]);
        const newresponse = {
            public_key: {
                key: signerPkEd25519,
                checksum: response.public_key.checksum,
                signature: newsig
            }
        };

        signerPkEd25519[31] |= newsig[63] & 128;
        newsig[63] &= 127;

        const vr = verifyRuntimePublicKey(
            signerPkEd25519, //signerPk.public_key.key,
            newresponse, // response,
            signerPk.runtime_id,
            signerPk.key_pair_id);
        expect(vr).eq(true);
    });
});
