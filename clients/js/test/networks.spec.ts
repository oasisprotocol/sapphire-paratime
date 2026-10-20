// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('NETWORKS', () => {
  // TS 5.0-5.6 consumers can't index `[mainnetParams.chainId]` keys.
  it('declares chain IDs as a number index signature', () => {
    const file = fileURLToPath(new URL('../src/networks.ts', import.meta.url));
    let dts = '';
    ts.createProgram([file], {
      declaration: true,
      emitDeclarationOnly: true,
    }).emit(undefined, (_, text) => (dts = text));
    expect(dts).toMatch(/\[\w+: number\]: \{/);
  });
});
