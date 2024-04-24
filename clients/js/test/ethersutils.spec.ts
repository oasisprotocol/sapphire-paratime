// SPDX-License-Identifier: Apache-2.0

import { fromQuantity, isBytesLike, isHexString } from '@oasisprotocol/sapphire-paratime';

describe('ethersutils', () => {
  it('fromQuantity', () => {
    expect(fromQuantity('0x0')).toEqual(0);
    expect(fromQuantity('0x00')).toEqual(0);
    expect(fromQuantity('0x10')).toEqual(0x10);
    expect(fromQuantity('0x000001')).toEqual(0x1);
    expect(fromQuantity('010')).toEqual(10);
    expect(fromQuantity('0')).toEqual(0);
    expect(fromQuantity(10)).toEqual(10);
    expect(fromQuantity(0)).toEqual(0);
  });

  it('isHexString', () => {
    expect(isHexString('0x0', 1)).toBeFalsy();
    expect(isHexString('0x0', true)).toBeFalsy();
    expect(isHexString('BLAH')).toBeFalsy();
    expect(isHexString('0x01')).toBeTruthy();
  });

  it('isBytesLike', () => {
    expect(isBytesLike(1)).toBeFalsy();
    expect(isBytesLike('0x01')).toBeTruthy();
    expect(isBytesLike(new Uint8Array([]))).toBeTruthy();
    expect(isBytesLike(new Uint8Array([1]))).toBeTruthy();
  });
});
