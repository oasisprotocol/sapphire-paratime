import { ethers } from 'hardhat';
import { expect } from 'chai';
import * as cborg from 'cborg';
import { AbiCoder, getBytes } from 'ethers';
import { verifyRuntimePublicKey } from '@oasisprotocol/sapphire-paratime'

async function doSubcall(name:string) {
    const coder = AbiCoder.defaultAbiCoder();
    const data = coder.encode(
        ['string', 'bytes'],
        [name, cborg.encode(null)],
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
    it.skip('core.PublicKey', async () => {
        console.log(await doSubcall('core.PublicKey'));
    });

    it('core.CallDataPublicKey', async () => {
        const signerPk = await doSubcall('core.PublicKey');
        const callDataPublicKey = await doSubcall('core.CallDataPublicKey');
        console.log(callDataPublicKey);

        const vr = verifyRuntimePublicKey(signerPk.public_key, callDataPublicKey.public_key, signerPk.runtime_id, signerPk.key_pair_id);
        expect(vr).eq(true);
    });
});
