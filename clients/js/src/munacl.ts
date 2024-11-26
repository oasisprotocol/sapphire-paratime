// SPDX-License-Identifier: Unlicense
/*
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org>
*/

// See: https://www.rfc-editor.org/rfc/rfc8032
// See: https://eprint.iacr.org/2020/1244.pdf for Ed25519

// Minimum necessary functions extracted and made TypeScript compatible from:
// https://github.com/dchest/tweetnacl-js/blob/fecde6ecf0eb81e31d54ca0509531ab1b825f490/nacl-fast.js

import { sha512 } from '@noble/hashes/sha512';
import { hexlify } from './ethersutils.js';

function gf(init?: number[]): Float64Array {
  const r = new Float64Array(16);
  if (init) {
    for (let i = 0; i < init.length; i++) r[i] = init[i];
  }
  return r;
}

export const crypto_box_SECRETKEYBYTES = 32 as const;
export const crypto_box_PUBLICKEYBYTES = 32 as const;
export const crypto_scalarmult_BYTES = 32 as const;
export const crypto_scalarmult_SCALARBYTES = 32 as const;
export const crypto_sign_BYTES = 64 as const;
export const crypto_sign_PUBLICKEYBYTES = 32 as const;

const gf0 = gf();
const gf1 = gf([1]);

/**
 * D: Edwards curve constant
 * -121665/121666 over the field
 * Used in the Edwards curve equation: -x^2 + y^2 = 1 + dx^2y^2
 */
const D = gf([
  0x78a3, 0x1359, 0x4dca, 0x75eb, 0xd8ab, 0x4141, 0x0a4d, 0x0070, 0xe898,
  0x7779, 0x4079, 0x8cc7, 0xfe73, 0x2b6f, 0x6cee, 0x5203,
]);

/**
 * D2: 2 * D
 * Used for optimizing certain calculations
 */
const D2 = gf([
  0xf159, 0x26b2, 0x9b94, 0xebd6, 0xb156, 0x8283, 0x149a, 0x00e0, 0xd130,
  0xeef3, 0x80f2, 0x198e, 0xfce7, 0x56df, 0xd9dc, 0x2406,
]);

/**
 * X: x-coordinate of the base point
 * The base point is a generator of the main subgroup
 */
const X = gf([
  0xd51a, 0x8f25, 0x2d60, 0xc956, 0xa7b2, 0x9525, 0xc760, 0x692c, 0xdc5c,
  0xfdd6, 0xe231, 0xc0a4, 0x53fe, 0xcd6e, 0x36d3, 0x2169,
]);

/**
 * Y: y-coordinate of the base point
 * 4/5 in the field
 */
const Y = gf([
  0x6658, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666,
  0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666,
]);

/**
 * I: sqrt(-1) in the field
 * Used in various calculations
 */
const I = gf([
  0xa0b0, 0x4a0e, 0x1b27, 0xc4ee, 0xe478, 0xad2f, 0x1806, 0x2f43, 0xd7a7,
  0x3dfb, 0x0099, 0x2b4d, 0xdf0b, 0x4fc1, 0x2480, 0x2b83,
]);

const _8 = new Uint8Array(32);
_8[0] = 8;

const _9 = new Uint8Array(32);
_9[0] = 9;
const _121665 = gf([0xdb41, 1]);

function sel25519(p: Float64Array, q: Float64Array, b: number) {
  let t;
  const c = ~(b - 1);
  for (let i = 0; i < 16; i++) {
    t = c & (p[i] ^ q[i]);
    p[i] ^= t;
    q[i] ^= t;
  }
}

function inv25519(o: Float64Array, i: Float64Array) {
  const c = gf();
  let a;
  for (a = 0; a < 16; a++) c[a] = i[a];
  for (a = 253; a >= 0; a--) {
    S(c, c);
    if (a !== 2 && a !== 4) M(c, c, i);
  }
  for (a = 0; a < 16; a++) o[a] = c[a];
}

function car25519(o: Float64Array) {
  let v,
    c = 1;
  for (let i = 0; i < 16; i++) {
    v = o[i] + c + 65535;
    c = Math.floor(v / 65536);
    o[i] = v - c * 65536;
  }
  o[0] += c - 1 + 37 * (c - 1);
}

function unpack25519(o: Float64Array, n: Uint8Array) {
  for (let i = 0; i < 16; i++) o[i] = n[2 * i] + (n[2 * i + 1] << 8);
  o[15] &= 0x7fff;
}

function pack25519(o: Uint8Array, n: Float64Array) {
  let i: number, j: number, b: number;
  const m = gf(),
    t = gf();
  for (i = 0; i < 16; i++) t[i] = n[i];
  car25519(t);
  car25519(t);
  car25519(t);
  for (j = 0; j < 2; j++) {
    m[0] = t[0] - 0xffed;
    for (i = 1; i < 15; i++) {
      m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
      m[i - 1] &= 0xffff;
    }
    m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
    b = (m[15] >> 16) & 1;
    m[14] &= 0xffff;
    sel25519(t, m, 1 - b);
  }
  for (i = 0; i < 16; i++) {
    o[2 * i] = t[i] & 0xff;
    o[2 * i + 1] = t[i] >> 8;
  }
}

function A(o: Float64Array, a: Float64Array, b: Float64Array) {
  for (let i = 0; i < 16; i++) o[i] = a[i] + b[i];
}

/// Subtract field elements, o = a - b
function Z(o: Float64Array, a: Float64Array, b: Float64Array) {
  for (let i = 0; i < 16; i++) o[i] = a[i] - b[i];
}

function M(o: Float64Array, a: Float64Array, b: Float64Array) {
  let v,
    c,
    t0 = 0,
    t1 = 0,
    t2 = 0,
    t3 = 0,
    t4 = 0,
    t5 = 0,
    t6 = 0,
    t7 = 0,
    t8 = 0,
    t9 = 0,
    t10 = 0,
    t11 = 0,
    t12 = 0,
    t13 = 0,
    t14 = 0,
    t15 = 0,
    t16 = 0,
    t17 = 0,
    t18 = 0,
    t19 = 0,
    t20 = 0,
    t21 = 0,
    t22 = 0,
    t23 = 0,
    t24 = 0,
    t25 = 0,
    t26 = 0,
    t27 = 0,
    t28 = 0,
    t29 = 0,
    t30 = 0;
  const b0 = b[0],
    b1 = b[1],
    b2 = b[2],
    b3 = b[3],
    b4 = b[4],
    b5 = b[5],
    b6 = b[6],
    b7 = b[7],
    b8 = b[8],
    b9 = b[9],
    b10 = b[10],
    b11 = b[11],
    b12 = b[12],
    b13 = b[13],
    b14 = b[14],
    b15 = b[15];

  v = a[0];
  t0 += v * b0;
  t1 += v * b1;
  t2 += v * b2;
  t3 += v * b3;
  t4 += v * b4;
  t5 += v * b5;
  t6 += v * b6;
  t7 += v * b7;
  t8 += v * b8;
  t9 += v * b9;
  t10 += v * b10;
  t11 += v * b11;
  t12 += v * b12;
  t13 += v * b13;
  t14 += v * b14;
  t15 += v * b15;
  v = a[1];
  t1 += v * b0;
  t2 += v * b1;
  t3 += v * b2;
  t4 += v * b3;
  t5 += v * b4;
  t6 += v * b5;
  t7 += v * b6;
  t8 += v * b7;
  t9 += v * b8;
  t10 += v * b9;
  t11 += v * b10;
  t12 += v * b11;
  t13 += v * b12;
  t14 += v * b13;
  t15 += v * b14;
  t16 += v * b15;
  v = a[2];
  t2 += v * b0;
  t3 += v * b1;
  t4 += v * b2;
  t5 += v * b3;
  t6 += v * b4;
  t7 += v * b5;
  t8 += v * b6;
  t9 += v * b7;
  t10 += v * b8;
  t11 += v * b9;
  t12 += v * b10;
  t13 += v * b11;
  t14 += v * b12;
  t15 += v * b13;
  t16 += v * b14;
  t17 += v * b15;
  v = a[3];
  t3 += v * b0;
  t4 += v * b1;
  t5 += v * b2;
  t6 += v * b3;
  t7 += v * b4;
  t8 += v * b5;
  t9 += v * b6;
  t10 += v * b7;
  t11 += v * b8;
  t12 += v * b9;
  t13 += v * b10;
  t14 += v * b11;
  t15 += v * b12;
  t16 += v * b13;
  t17 += v * b14;
  t18 += v * b15;
  v = a[4];
  t4 += v * b0;
  t5 += v * b1;
  t6 += v * b2;
  t7 += v * b3;
  t8 += v * b4;
  t9 += v * b5;
  t10 += v * b6;
  t11 += v * b7;
  t12 += v * b8;
  t13 += v * b9;
  t14 += v * b10;
  t15 += v * b11;
  t16 += v * b12;
  t17 += v * b13;
  t18 += v * b14;
  t19 += v * b15;
  v = a[5];
  t5 += v * b0;
  t6 += v * b1;
  t7 += v * b2;
  t8 += v * b3;
  t9 += v * b4;
  t10 += v * b5;
  t11 += v * b6;
  t12 += v * b7;
  t13 += v * b8;
  t14 += v * b9;
  t15 += v * b10;
  t16 += v * b11;
  t17 += v * b12;
  t18 += v * b13;
  t19 += v * b14;
  t20 += v * b15;
  v = a[6];
  t6 += v * b0;
  t7 += v * b1;
  t8 += v * b2;
  t9 += v * b3;
  t10 += v * b4;
  t11 += v * b5;
  t12 += v * b6;
  t13 += v * b7;
  t14 += v * b8;
  t15 += v * b9;
  t16 += v * b10;
  t17 += v * b11;
  t18 += v * b12;
  t19 += v * b13;
  t20 += v * b14;
  t21 += v * b15;
  v = a[7];
  t7 += v * b0;
  t8 += v * b1;
  t9 += v * b2;
  t10 += v * b3;
  t11 += v * b4;
  t12 += v * b5;
  t13 += v * b6;
  t14 += v * b7;
  t15 += v * b8;
  t16 += v * b9;
  t17 += v * b10;
  t18 += v * b11;
  t19 += v * b12;
  t20 += v * b13;
  t21 += v * b14;
  t22 += v * b15;
  v = a[8];
  t8 += v * b0;
  t9 += v * b1;
  t10 += v * b2;
  t11 += v * b3;
  t12 += v * b4;
  t13 += v * b5;
  t14 += v * b6;
  t15 += v * b7;
  t16 += v * b8;
  t17 += v * b9;
  t18 += v * b10;
  t19 += v * b11;
  t20 += v * b12;
  t21 += v * b13;
  t22 += v * b14;
  t23 += v * b15;
  v = a[9];
  t9 += v * b0;
  t10 += v * b1;
  t11 += v * b2;
  t12 += v * b3;
  t13 += v * b4;
  t14 += v * b5;
  t15 += v * b6;
  t16 += v * b7;
  t17 += v * b8;
  t18 += v * b9;
  t19 += v * b10;
  t20 += v * b11;
  t21 += v * b12;
  t22 += v * b13;
  t23 += v * b14;
  t24 += v * b15;
  v = a[10];
  t10 += v * b0;
  t11 += v * b1;
  t12 += v * b2;
  t13 += v * b3;
  t14 += v * b4;
  t15 += v * b5;
  t16 += v * b6;
  t17 += v * b7;
  t18 += v * b8;
  t19 += v * b9;
  t20 += v * b10;
  t21 += v * b11;
  t22 += v * b12;
  t23 += v * b13;
  t24 += v * b14;
  t25 += v * b15;
  v = a[11];
  t11 += v * b0;
  t12 += v * b1;
  t13 += v * b2;
  t14 += v * b3;
  t15 += v * b4;
  t16 += v * b5;
  t17 += v * b6;
  t18 += v * b7;
  t19 += v * b8;
  t20 += v * b9;
  t21 += v * b10;
  t22 += v * b11;
  t23 += v * b12;
  t24 += v * b13;
  t25 += v * b14;
  t26 += v * b15;
  v = a[12];
  t12 += v * b0;
  t13 += v * b1;
  t14 += v * b2;
  t15 += v * b3;
  t16 += v * b4;
  t17 += v * b5;
  t18 += v * b6;
  t19 += v * b7;
  t20 += v * b8;
  t21 += v * b9;
  t22 += v * b10;
  t23 += v * b11;
  t24 += v * b12;
  t25 += v * b13;
  t26 += v * b14;
  t27 += v * b15;
  v = a[13];
  t13 += v * b0;
  t14 += v * b1;
  t15 += v * b2;
  t16 += v * b3;
  t17 += v * b4;
  t18 += v * b5;
  t19 += v * b6;
  t20 += v * b7;
  t21 += v * b8;
  t22 += v * b9;
  t23 += v * b10;
  t24 += v * b11;
  t25 += v * b12;
  t26 += v * b13;
  t27 += v * b14;
  t28 += v * b15;
  v = a[14];
  t14 += v * b0;
  t15 += v * b1;
  t16 += v * b2;
  t17 += v * b3;
  t18 += v * b4;
  t19 += v * b5;
  t20 += v * b6;
  t21 += v * b7;
  t22 += v * b8;
  t23 += v * b9;
  t24 += v * b10;
  t25 += v * b11;
  t26 += v * b12;
  t27 += v * b13;
  t28 += v * b14;
  t29 += v * b15;
  v = a[15];
  t15 += v * b0;
  t16 += v * b1;
  t17 += v * b2;
  t18 += v * b3;
  t19 += v * b4;
  t20 += v * b5;
  t21 += v * b6;
  t22 += v * b7;
  t23 += v * b8;
  t24 += v * b9;
  t25 += v * b10;
  t26 += v * b11;
  t27 += v * b12;
  t28 += v * b13;
  t29 += v * b14;
  t30 += v * b15;

  t0 += 38 * t16;
  t1 += 38 * t17;
  t2 += 38 * t18;
  t3 += 38 * t19;
  t4 += 38 * t20;
  t5 += 38 * t21;
  t6 += 38 * t22;
  t7 += 38 * t23;
  t8 += 38 * t24;
  t9 += 38 * t25;
  t10 += 38 * t26;
  t11 += 38 * t27;
  t12 += 38 * t28;
  t13 += 38 * t29;
  t14 += 38 * t30;
  // t15 left as is

  // first car
  c = 1;
  v = t0 + c + 65535;
  c = Math.floor(v / 65536);
  t0 = v - c * 65536;
  v = t1 + c + 65535;
  c = Math.floor(v / 65536);
  t1 = v - c * 65536;
  v = t2 + c + 65535;
  c = Math.floor(v / 65536);
  t2 = v - c * 65536;
  v = t3 + c + 65535;
  c = Math.floor(v / 65536);
  t3 = v - c * 65536;
  v = t4 + c + 65535;
  c = Math.floor(v / 65536);
  t4 = v - c * 65536;
  v = t5 + c + 65535;
  c = Math.floor(v / 65536);
  t5 = v - c * 65536;
  v = t6 + c + 65535;
  c = Math.floor(v / 65536);
  t6 = v - c * 65536;
  v = t7 + c + 65535;
  c = Math.floor(v / 65536);
  t7 = v - c * 65536;
  v = t8 + c + 65535;
  c = Math.floor(v / 65536);
  t8 = v - c * 65536;
  v = t9 + c + 65535;
  c = Math.floor(v / 65536);
  t9 = v - c * 65536;
  v = t10 + c + 65535;
  c = Math.floor(v / 65536);
  t10 = v - c * 65536;
  v = t11 + c + 65535;
  c = Math.floor(v / 65536);
  t11 = v - c * 65536;
  v = t12 + c + 65535;
  c = Math.floor(v / 65536);
  t12 = v - c * 65536;
  v = t13 + c + 65535;
  c = Math.floor(v / 65536);
  t13 = v - c * 65536;
  v = t14 + c + 65535;
  c = Math.floor(v / 65536);
  t14 = v - c * 65536;
  v = t15 + c + 65535;
  c = Math.floor(v / 65536);
  t15 = v - c * 65536;
  t0 += c - 1 + 37 * (c - 1);

  // second car
  c = 1;
  v = t0 + c + 65535;
  c = Math.floor(v / 65536);
  t0 = v - c * 65536;
  v = t1 + c + 65535;
  c = Math.floor(v / 65536);
  t1 = v - c * 65536;
  v = t2 + c + 65535;
  c = Math.floor(v / 65536);
  t2 = v - c * 65536;
  v = t3 + c + 65535;
  c = Math.floor(v / 65536);
  t3 = v - c * 65536;
  v = t4 + c + 65535;
  c = Math.floor(v / 65536);
  t4 = v - c * 65536;
  v = t5 + c + 65535;
  c = Math.floor(v / 65536);
  t5 = v - c * 65536;
  v = t6 + c + 65535;
  c = Math.floor(v / 65536);
  t6 = v - c * 65536;
  v = t7 + c + 65535;
  c = Math.floor(v / 65536);
  t7 = v - c * 65536;
  v = t8 + c + 65535;
  c = Math.floor(v / 65536);
  t8 = v - c * 65536;
  v = t9 + c + 65535;
  c = Math.floor(v / 65536);
  t9 = v - c * 65536;
  v = t10 + c + 65535;
  c = Math.floor(v / 65536);
  t10 = v - c * 65536;
  v = t11 + c + 65535;
  c = Math.floor(v / 65536);
  t11 = v - c * 65536;
  v = t12 + c + 65535;
  c = Math.floor(v / 65536);
  t12 = v - c * 65536;
  v = t13 + c + 65535;
  c = Math.floor(v / 65536);
  t13 = v - c * 65536;
  v = t14 + c + 65535;
  c = Math.floor(v / 65536);
  t14 = v - c * 65536;
  v = t15 + c + 65535;
  c = Math.floor(v / 65536);
  t15 = v - c * 65536;
  t0 += c - 1 + 37 * (c - 1);

  o[0] = t0;
  o[1] = t1;
  o[2] = t2;
  o[3] = t3;
  o[4] = t4;
  o[5] = t5;
  o[6] = t6;
  o[7] = t7;
  o[8] = t8;
  o[9] = t9;
  o[10] = t10;
  o[11] = t11;
  o[12] = t12;
  o[13] = t13;
  o[14] = t14;
  o[15] = t15;
}

function S(o: Float64Array, a: Float64Array) {
  M(o, a, a);
}

function crypto_scalarmult(q: Uint8Array, n: Uint8Array, p: Uint8Array) {
  const z = new Uint8Array(32);
  const x = new Float64Array(80);
  let r, i;
  const a = gf(),
    b = gf(),
    c = gf(),
    d = gf(),
    e = gf(),
    f = gf();
  for (i = 0; i < 31; i++) z[i] = n[i];
  z[31] = (n[31] & 127) | 64;
  z[0] &= 248;
  unpack25519(x, p);
  for (i = 0; i < 16; i++) {
    b[i] = x[i];
    d[i] = a[i] = c[i] = 0;
  }
  a[0] = d[0] = 1;
  for (i = 254; i >= 0; --i) {
    r = (z[i >>> 3] >>> (i & 7)) & 1;
    sel25519(a, b, r);
    sel25519(c, d, r);
    A(e, a, c);
    Z(a, a, c);
    A(c, b, d);
    Z(b, b, d);
    S(d, e);
    S(f, a);
    M(a, c, a);
    M(c, b, e);
    A(e, a, c);
    Z(a, a, c);
    S(b, a);
    Z(c, d, f);
    M(a, c, _121665);
    A(a, a, d);
    M(c, c, a);
    M(a, d, f);
    M(d, b, x);
    S(b, e);
    sel25519(a, b, r);
    sel25519(c, d, r);
  }
  for (i = 0; i < 16; i++) {
    x[i + 16] = a[i];
    x[i + 32] = c[i];
    x[i + 48] = b[i];
    x[i + 64] = d[i];
  }
  const x32 = x.subarray(32);
  const x16 = x.subarray(16);
  inv25519(x32, x32);
  M(x16, x16, x32);
  pack25519(q, x16);
  return q;
}

function crypto_scalarmult_base(q: Uint8Array, n: Uint8Array) {
  return crypto_scalarmult(q, n, _9);
}

/**
 * Copies elements from one Float64Array to another, truncating to integers.
 * Used in operations related to the curve25519 field.
 *
 * @param r Destination Float64Array (length 16)
 * @param a Source Float64Array (length 16)
 *
 * Note: The `|0` operation truncates each float to a 32-bit integer.
 *       This ensures all values in `r` are integers, which is
 *       important for certain field arithmetic operations.
 */
function set25519(r: Float64Array, a: Float64Array) {
  let i;
  for (i = 0; i < 16; i++) r[i] = a[i] | 0;
}

/**
 * Computes (2^252 - 3) power in the finite field.
 * This is a key operation for Ed25519 signature scheme.
 *
 * @param o Output Float64Array (length 16)
 * @param i Input Float64Array (length 16)
 *
 * Details:
 * - Implements the exponentiation i^(2^252 - 3) (mod p)
 * - Uses a square-and-multiply algorithm
 * - S(c, c) squares the value
 * - M(c, c, i) multiplies by the original input
 * - The result is used in computing inverses in the field
 */
function pow2523(o: Float64Array, i: Float64Array) {
  const c = gf();
  let a;
  for (a = 0; a < 16; a++) c[a] = i[a];
  for (a = 250; a >= 0; a--) {
    S(c, c);
    if (a !== 1) M(c, c, i);
  }
  for (a = 0; a < 16; a++) o[a] = c[a];
}

/**
 * Compares n bytes of two arrays in constant time.
 * @param x First Uint8Array
 * @param xi Starting index in x
 * @param y Second Uint8Array
 * @param yi Starting index in y
 * @param n Number of bytes to compare
 * @returns 0 if sections are identical, -1 otherwise
 */
function vn(x: Uint8Array, xi: number, y: Uint8Array, yi: number, n: number) {
  let i,
    d = 0;
  for (i = 0; i < n; i++) d |= x[xi + i] ^ y[yi + i];
  return (1 & ((d - 1) >>> 8)) - 1;
}

/**
 * Compares 32 bytes of two arrays in constant time.
 * @param x First Uint8Array
 * @param xi Starting index in x
 * @param y Second Uint8Array
 * @param yi Starting index in y
 * @returns 0 if 32-byte sections are identical, -1 otherwise
 */
function crypto_verify_32(
  x: Uint8Array,
  xi: number,
  y: Uint8Array,
  yi: number,
) {
  return vn(x, xi, y, yi, 32);
}

/**
 * Checks if two field elements are not equal.
 *
 * @param a First field element (Float64Array)
 * @param b Second field element (Float64Array)
 * @returns 0 if equal, -1 if not equal
 *
 * Note: Operates in constant time to prevent timing attacks.
 */
function neq25519(a: Float64Array, b: Float64Array) {
  const c = new Uint8Array(32),
    d = new Uint8Array(32);
  pack25519(c, a);
  pack25519(d, b);
  return crypto_verify_32(c, 0, d, 0);
}

/**
 * Computes the parity of a field element.
 *
 * @param a Field element (Float64Array)
 * @returns 0 if even, 1 if odd
 *
 * Note: Used in point compression/decompression.
 */
function par25519(a: Float64Array) {
  const d = new Uint8Array(32);
  pack25519(d, a);
  return d[0] & 1;
}

function unpack(r: Float64Array[], p: Uint8Array) {
  return unpackneg(r, p, true);
}

/**
 * Unpacks a compressed Edwards point, then negates it
 *
 * @param r Output array of 4 Float64Arrays representing the point (X:Y:Z:T)
 * @param p Input compressed point (32-byte Uint8Array)
 * @returns 0 on success, -1 if point is invalid
 */
function unpackneg(r: Float64Array[], p: Uint8Array, dontnegate?:boolean) {
  const t = gf(),
    chk = gf(),
    num = gf(),
    den = gf(),
    den2 = gf(),
    den4 = gf(),
    den6 = gf();

  set25519(r[2], gf1);
  unpack25519(r[1], p);
  S(num, r[1]);
  M(den, num, D);
  Z(num, num, r[2]);
  A(den, r[2], den);

  S(den2, den);
  S(den4, den2);
  M(den6, den4, den2);
  M(t, den6, num);
  M(t, t, den);

  pow2523(t, t);
  M(t, t, num);
  M(t, t, den);
  M(t, t, den);
  M(r[0], t, den);

  S(chk, r[0]);
  M(chk, chk, den);
  if (neq25519(chk, num)) M(r[0], r[0], I);

  S(chk, r[0]);
  M(chk, chk, den);
  if (neq25519(chk, num)) return -1;

  if( ! dontnegate ) {
    if (par25519(r[0]) === p[31] >> 7) Z(r[0], gf0, r[0]);
  }

  M(r[3], r[0], r[1]);
  return 0;
}

/**
 * Conditionally swaps two sets of field elements in constant time.
 *
 * @param p First array of Float64Array (length 4)
 * @param q Second array of Float64Array (length 4)
 * @param b Condition for swapping (0 or 1)
 *
 * Operation:
 * - Applies sel25519 to each pair of corresponding elements in p and q
 * - If b is 1, elements are swapped; if b is 0, no change occurs
 * - Operates in constant time to prevent timing attacks
 *
 * Security:
 * - The constant-time nature of this operation is critical for
 *   preventing side-channel attacks in cryptographic implementations.
 */
function cswap(p: Float64Array[], q: Float64Array[], b: number) {
  let i;
  for (i = 0; i < 4; i++) {
    sel25519(p[i], q[i], b);
  }
}

/**
 * Adds two points on the Edwards curve.
 *
 * @param p First point (input/output), array of 4 Float64Arrays
 * @param q Second point (input), array of 4 Float64Arrays
 *
 * Note: Uses extended coordinates (X:Y:Z:T) for efficient computation
 */
function add(p: Float64Array[], q: Float64Array[]) {
  const a = gf(),
    b = gf(),
    c = gf(),
    d = gf(),
    e = gf(),
    f = gf(),
    g = gf(),
    h = gf(),
    t = gf();

  Z(a, p[1], p[0]);
  Z(t, q[1], q[0]);
  M(a, a, t);
  A(b, p[0], p[1]);
  A(t, q[0], q[1]);
  M(b, b, t);
  M(c, p[3], q[3]);
  M(c, c, D2);
  M(d, p[2], q[2]);
  A(d, d, d);
  Z(e, b, a);
  Z(f, d, c);
  A(g, d, c);
  A(h, b, a);

  M(p[0], e, f);
  M(p[1], h, g);
  M(p[2], g, f);
  M(p[3], e, h);
}

/**
 * Performs scalar multiplication: p = s * q
 *
 * @param p Result point (output), array of 4 Float64Arrays
 * @param q Base point (input), array of 4 Float64Arrays
 * @param s Scalar (input), 32-byte Uint8Array
 *
 * Algorithm:
 * - Implements the Montgomery ladder for constant-time operation
 * - Uses conditional swaps (cswap) to prevent timing attacks
 */
function scalarmult(p: Float64Array[], q: Float64Array[], s: Uint8Array) {
  set25519(p[0], gf0);
  set25519(p[1], gf1);
  set25519(p[2], gf1);
  set25519(p[3], gf0);
  for (let i = 255; i >= 0; --i) {
    const b = (s[(i / 8) | 0] >> (i & 7)) & 1;
    cswap(p, q, b);
    add(q, p);
    add(p, p);
    cswap(p, q, b);
  }
}

/**
 * Computes s * B, where B is the curve's base point
 *
 * @param p Result point (output), array of 4 Float64Arrays
 * @param s Scalar (input), 32-byte Uint8Array
 *
 * Operation:
 * - Initializes q with the curve's base point (X, Y)
 * - Calls scalarmult(p, q, s)
 */
function scalarbase(p: Float64Array[], s: Uint8Array) {
  const q = [gf(), gf(), gf(), gf()];
  set25519(q[0], X);
  set25519(q[1], Y);
  set25519(q[2], gf1);
  M(q[3], X, Y);
  scalarmult(p, q, s);
}

/**
 * L: The order of the main subgroup of the Ed25519 curve
 * Represented as a little-endian 256-bit number
 * L = 2^252 + 27742317777372353535851937790883648493
 */
const L = new Float64Array([
  0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde,
  0xf9, 0xde, 0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10,
]);

/**
 * Performs modular reduction of a 512-bit number modulo L
 *
 * @param r Output Uint8Array (64 bytes) for the reduced result
 * @param x Input Float64Array (64 elements) representing the number to reduce
 *
 * Algorithm:
 * 1. Reduces higher 256 bits using schoolbook division
 * 2. Reduces lower 256 bits
 * 3. Handles final carry and normalization
 *
 * Notes:
 * - Uses 256-bit arithmetic to avoid BigInt dependencies
 * - Implements optimized reduction for the specific prime L
 * - Critical for maintaining correct range in Ed25519 operations
 */
function modL(r: Uint8Array, x: Float64Array) {
  let carry, i, j, k;
  for (i = 63; i >= 32; --i) {
    carry = 0;
    for (j = i - 32, k = i - 12; j < k; ++j) {
      x[j] += carry - 16 * x[i] * L[j - (i - 32)];
      carry = Math.floor((x[j] + 128) / 256);
      x[j] -= carry * 256;
    }
    x[j] += carry;
    x[i] = 0;
  }
  carry = 0;
  for (j = 0; j < 32; j++) {
    x[j] += carry - (x[31] >> 4) * L[j];
    carry = x[j] >> 8;
    x[j] &= 255;
  }
  for (j = 0; j < 32; j++) x[j] -= carry * L[j];
  for (i = 0; i < 32; i++) {
    x[i + 1] += x[i] >> 8;
    r[i] = x[i] & 255;
  }
}

/**
 * Reduces a 64-byte number modulo L.
 * L is the order of the main subgroup used in Ed25519.
 *
 * @param r Uint8Array (length 64) to be reduced in place
 *
 * **Operation:**
 * 1. Copies input to a Float64Array for precision
 * 2. Zeros out the original input array
 * 3. Performs modular reduction using modL function
 *
 * **Note:**
 * - Using Float64Array allows for higher precision in intermediate calculations
 * - The result is stored back in the original array r
 *
 * This function is crucial for ensuring that scalar values in
 * Ed25519 operations remain within the appropriate range.
 */
function reduce(r: Uint8Array) {
  const x = new Float64Array(64);
  for (let i = 0; i < 64; i++) x[i] = r[i];
  for (let i = 0; i < 64; i++) r[i] = 0;
  modL(r, x);
}

/**
 * Encodes a point on the Edwards curve to a 32-byte array.
 *
 * @param r Output Uint8Array (32 bytes) for the encoded point
 * @param p Input array of Float64Array representing the point (x, y, z, t)
 *
 * Operation:
 * 1. Converts the point from projective to affine coordinates
 * 2. Encodes the y-coordinate
 * 3. Stores the sign of x in the most significant bit of the last byte
 */
function pack(r: Uint8Array, p: Float64Array[]) {
  const tx = gf(),
    ty = gf(),
    zi = gf();
  inv25519(zi, p[2]);
  M(tx, p[0], zi); // Calculate affine x and y coordinates
  M(ty, p[1], zi);
  pack25519(r, ty); // Encode y-coordinate
  r[31] ^= par25519(tx) << 7; // set sign bit
}

/// Check if s < L, per RFC 8032
/// https://www.rfc-editor.org/rfc/rfc8032
export function ed25519_is_valid_scalar(s: Uint8Array): boolean {
  // Check if scalar s is less than L
  for (let i = 31; i >= 0; i--) {
    if (s[i] < L[i]) return true;
    if (s[i] > L[i]) return false;
  }
  // The scalar is equal to the order of the curve.
  return false;
}

/// The 8 elements of the Ed25519 torsion subgroup as Uint8Arrays
const ED25519_TORSION_SUBGROUP = [
  // 0100000000000000000000000000000000000000000000000000000000000000
  // (0,1), order 1, neutral element
  new Uint8Array([
    1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
  ]),

  // c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a
  // order 8
  new Uint8Array([
    199, 23, 106, 112, 61, 77, 216, 79, 186, 60, 11, 118, 13, 16, 103, 15, 42,
    32, 83, 250, 44, 57, 204, 198, 78, 199, 253, 119, 146, 172, 3, 122,
  ]),

  // 0000000000000000000000000000000000000000000000000000000000000080
  // order 4
  new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 128,
  ]),

  // 26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05
  // order 8
  new Uint8Array([
    38, 232, 149, 143, 194, 178, 39, 176, 69, 195, 244, 137, 242, 239, 152, 240,
    213, 223, 172, 5, 211, 198, 51, 57, 177, 56, 2, 136, 109, 83, 252, 5,
  ]),

  // ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f
  // order 2
  new Uint8Array([
    236, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    255, 127,
  ]),

  // 26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85
  // order 8
  new Uint8Array([
    38, 232, 149, 143, 194, 178, 39, 176, 69, 195, 244, 137, 242, 239, 152, 240,
    213, 223, 172, 5, 211, 198, 51, 57, 177, 56, 2, 136, 109, 83, 252, 133,
  ]),

  // 0000000000000000000000000000000000000000000000000000000000000000
  // order 4
  new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
  ]),

  // c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa
  // order 8
  new Uint8Array([
    199, 23, 106, 112, 61, 77, 216, 79, 186, 60, 11, 118, 13, 16, 103, 15, 42,
    32, 83, 250, 44, 57, 204, 198, 78, 199, 253, 119, 146, 172, 3, 250,
  ]),
] as const;

/**
 * Checks if a given point is a small order point on the Ed25519 curve.
 *
 * @param p - A Uint8Array of 32 bytes representing a compressed Ed25519 point.
 * @returns true if the point is of small order (in the torsion subgroup), false otherwise.
 *
 * This function is critical for security in Ed25519 operations, particularly
 * in signature verification and key exchange protocols.
 */
function ed25519_is_small_order(p: Uint8Array): boolean {
  for (const q of ED25519_TORSION_SUBGROUP) {
    if (crypto_verify_32(q, 0, p, 0) === 0) {
      return true;
    }
  }
  return false;
}

function _ed25519_verify_raw_common(
  signature: Uint8Array,
  publicKey: Uint8Array,
  msg: Uint8Array,
) {
  if (ed25519_is_small_order(publicKey)) {
    return false; // Small order A
  }

  const R_bits = signature.subarray(0, 32);
  const S_bits = signature.subarray(32, 64);

  if (ed25519_is_small_order(R_bits)) {
    return false; // Small order R
  }

  if (!ed25519_is_valid_scalar(S_bits)) {
    return false; // S is not minimal (reject malleability)
  }

  // TODO: verify A and R are canonical point encodings

  // Decompress A (PublicKey)
  const negA = [gf(), gf(), gf(), gf()];
  if (unpackneg(negA, publicKey) !== 0) {
    return false; // Decompress A (PublicKey) failed
  }

  // k = H(R,A,m)
  const k = sha512(new Uint8Array([...R_bits, ...publicKey, ...msg]));
  reduce(k);

  const sB = [gf(), gf(), gf(), gf()];
  const kA = [gf(), gf(), gf(), gf()];

  // sB = G^s
  scalarbase(sB, S_bits);

  // kA = -A^k
  scalarmult(kA, negA, k);

  return {kA, sB, k};
}

/// Verify signature without applying domain separation.
export function ed25519_verify_raw_cofactorless(
  signature: Uint8Array,
  publicKey: Uint8Array,
  msg: Uint8Array,
): boolean {
  const result = _ed25519_verify_raw_common(signature, publicKey, msg);
  if( result === false ) {
    return false;
  }

  const {sB, kA, k} = result;

  // sB = G^s - A^k
  add(sB, kA);

  pack(k, sB);

  // R == G^s - A^k
  return crypto_verify_32(signature, 0, k, 0) === 0;
}

/// Verify signature without applying domain separation.
export function ed25519_verify_raw_cofactored(
  signature: Uint8Array,
  publicKey: Uint8Array,
  msg: Uint8Array,
): boolean {
  const result = _ed25519_verify_raw_common(signature, publicKey, msg);
  if( result === false ) {
    return false;
  }

  const {sB, kA, k} = result;

  scalarmult(sB, sB, _8);

  // kA = 8 * -A^k
  scalarmult(kA, kA, _8);

  // R = 8*r
  const R = [gf(), gf(), gf(), gf()];
  unpack(R, signature);
  scalarmult(R, R, _8);

  // Check the cofactored group equation ([8][S]B = [8]R - [8][k]A)
  add(R, kA);
  pack(k, R);
  const j = new Uint8Array(32);
  pack(j, sB);

  return crypto_verify_32(j, 0, k, 0) === 0;
}

export class MuNaclError extends Error {}

export interface BoxKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function naclScalarMult(n: Uint8Array, p: Uint8Array): Uint8Array {
  if (n.length !== crypto_scalarmult_SCALARBYTES) {
    throw new MuNaclError('bad n size');
  }
  if (p.length !== crypto_scalarmult_BYTES) {
    throw new MuNaclError('bad p size');
  }
  return crypto_scalarmult(new Uint8Array(crypto_scalarmult_BYTES), n, p);
}

export function naclScalarMultBase(n: Uint8Array): Uint8Array {
  return naclScalarMult(n, _9);
}

export function boxKeyPairFromSecretKey(secretKey: Uint8Array): BoxKeyPair {
  if (secretKey.length !== crypto_box_SECRETKEYBYTES) {
    throw new MuNaclError('bad secret key size');
  }
  return {
    publicKey: crypto_scalarmult_base(
      new Uint8Array(crypto_box_PUBLICKEYBYTES),
      secretKey,
    ),
    secretKey: new Uint8Array(secretKey),
  };
}
