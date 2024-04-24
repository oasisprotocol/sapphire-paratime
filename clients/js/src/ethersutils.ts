// SPDX-License-Identifier: MIT
// https://github.com/ethers-io/ethers.js/blob/main/LICENSE.md
// This file avoids importing the Ethers library

/**
 *  Returns true if %%value%% is a valid [[HexString]].
 *
 *  If %%length%% is ``true`` or a //number//, it also checks that
 *  %%value%% is a valid [[DataHexString]] of %%length%% (if a //number//)
 *  bytes of data (e.g. ``0x1234`` is 2 bytes).
 */
export function isHexString(
  value: any,
  length?: number | boolean,
): value is `0x${string}` {
  if (typeof value !== 'string' || !value.match(/^0x[0-9A-Fa-f]*$/)) {
    return false;
  }

  if (typeof length === 'number' && value.length !== 2 + 2 * length) {
    return false;
  }
  if (length === true && value.length % 2 !== 0) {
    return false;
  }

  return true;
}

/**
 *  A [[HexString]] whose length is even, which ensures it is a valid
 *  representation of binary data.
 */
export type DataHexString = string;

/**
 *  A string which is prefixed with ``0x`` and followed by any number
 *  of case-agnostic hexadecimal characters.
 *
 *  It must match the regular expression ``/0x[0-9A-Fa-f]*\/``.
 */
export type HexString = string;

/**
 *  An object that can be used to represent binary data.
 */
export type BytesLike = DataHexString | Uint8Array;

/**
 *  Returns true if %%value%% is a valid representation of arbitrary
 *  data (i.e. a valid [[DataHexString]] or a Uint8Array).
 */
export function isBytesLike(value: any): value is BytesLike {
  return isHexString(value, true) || value instanceof Uint8Array;
}

/**
 *  Get a typed Uint8Array for %%value%%. If already a Uint8Array
 *  the original %%value%% is returned; if a copy is required copy=true
 */
export function getBytes(
  value: BytesLike,
  name?: string,
  copy?: boolean,
): Uint8Array {
  if (value instanceof Uint8Array) {
    if (copy) {
      return new Uint8Array(value);
    }
    return value;
  }

  if (typeof value === 'string' && value.match(/^0x([0-9a-f][0-9a-f])*$/i)) {
    const result = new Uint8Array((value.length - 2) / 2);
    let offset = 2;
    for (let i = 0; i < result.length; i++) {
      result[i] = parseInt(value.substring(offset, offset + 2), 16);
      offset += 2;
    }
    return result;
  }

  throw new Error(`invalid BytesLike value ${name ?? ''}`);
}

const HexCharacters = '0123456789abcdef';

/**
 *  Returns a [[DataHexString]] representation of %%data%%.
 */
export function hexlify(data: BytesLike): string {
  const bytes = getBytes(data);

  let result = '0x';
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i];
    result += HexCharacters[(v & 0xf0) >> 4] + HexCharacters[v & 0x0f];
  }
  return result;
}

/**
 * A //Quantity// does not have and leading 0 values unless the value is
 * the literal value `0x0`. This is most commonly used for JSSON-RPC
 * numeric values.
 *
 * It will parse '0x' prefixed hex strings, base-10 encoded numbers and numbers.
 *
 * @param quantity
 * @returns Quantity as an integer
 */
export function fromQuantity(quantity: number | string): number {
  if (typeof quantity === 'string') {
    if (quantity.startsWith('0x')) {
      return parseInt(quantity, 16);
    }
    return parseInt(quantity); // Assumed to be base 10
  }
  return quantity;
}
