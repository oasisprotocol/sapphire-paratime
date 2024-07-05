// SPDX-License-Identifier: Apache-2.0

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SiweMessage } from 'siwe';
import '@nomicfoundation/hardhat-chai-matchers';

import { SiweParserTests__factory } from '../typechain-types/factories/contracts/tests';
import {
  SiweParserTests,
  ParsedSiweMessageStruct,
} from '../typechain-types/contracts/tests/SiweParserTests';

describe('SiweParser', function () {
  async function deploy() {
    const SiweParserTests_factory = await ethers.getContractFactory(
      'SiweParserTests',
    );
    const siweParserTests = await SiweParserTests_factory.deploy();
    await siweParserTests.waitForDeployment();
    return { siweParserTests };
  }

  it('hexStringToAddress', async function () {
    const { siweParserTests } = await deploy();

    const addr = await siweParserTests.testHexStringToAddress(
      ethers.toUtf8Bytes((await ethers.getSigners())[0].address.slice(2)),
    );
    expect(addr.toString()).eq((await ethers.getSigners())[0].address);
  });

  it('fromHexChar', async function () {
    const { siweParserTests } = await deploy();

    expect(await siweParserTests.testFromHexChar(97)).eq(10); // a
    expect(await siweParserTests.testFromHexChar(65)).eq(10); // A
    expect(await siweParserTests.testFromHexChar(57)).eq(9); // 9
  });

  it('substr', async function () {
    const { siweParserTests } = await deploy();

    expect(
      await siweParserTests.testSubstr(
        ethers.toUtf8Bytes('hello world'),
        0,
        11,
      ),
    ).eq(ethers.hexlify(ethers.toUtf8Bytes('hello world')));
    expect(
      await siweParserTests.testSubstr(
        ethers.toUtf8Bytes('hello world'),
        6,
        11,
      ),
    ).eq(ethers.hexlify(ethers.toUtf8Bytes('world')));
    expect(
      await siweParserTests.testSubstr(ethers.toUtf8Bytes('hello world'), 0, 5),
    ).eq(ethers.hexlify(ethers.toUtf8Bytes('hello')));
  });

  it('parserUint', async function () {
    const { siweParserTests } = await deploy();

    expect(
      await siweParserTests.testParseUint(ethers.toUtf8Bytes('123456')),
    ).eq(123456);
  });

  it('parseField', async function () {
    const { siweParserTests } = await deploy();

    expect(
      await siweParserTests.testParseField(
        ethers.toUtf8Bytes('hello: world\n'),
        'hello',
        0,
      ),
    ).deep.eq([ethers.hexlify(ethers.toUtf8Bytes('world')), 13]);
    expect(
      await siweParserTests.testParseField(
        ethers.toUtf8Bytes('hello: world'),
        'hello',
        0,
      ),
    ).deep.eq([ethers.hexlify(ethers.toUtf8Bytes('world')), 12]);
    expect(
      await siweParserTests.testParseField(
        ethers.toUtf8Bytes('foo: bar\nhello: world\n'),
        'foo',
        0,
      ),
    ).deep.eq([ethers.hexlify(ethers.toUtf8Bytes('bar')), 9]);
    expect(
      await siweParserTests.testParseField(
        ethers.toUtf8Bytes('foo: bar\nhello: world\n'),
        'hello',
        0,
      ),
    ).deep.eq(['0x', 0]);
    expect(
      await siweParserTests.testParseField(
        ethers.toUtf8Bytes('foo: bar\nhello: world\n'),
        'hello',
        9,
      ),
    ).deep.eq([ethers.hexlify(ethers.toUtf8Bytes('world')), 22]);
    expect(
      await siweParserTests.testParseField(
        ethers.toUtf8Bytes('URI: http://localhost:5173\n'),
        'URI',
        0,
      ),
    ).deep.eq([
      ethers.hexlify(ethers.toUtf8Bytes('http://localhost:5173')),
      27,
    ]);
    expect(
      await siweParserTests.testParseField(
        ethers.toUtf8Bytes('Resources:\n'),
        'Resources',
        0,
      ),
    ).deep.eq([ethers.hexlify(ethers.toUtf8Bytes('')), 11]);
    expect(
      await siweParserTests.testParseField(
        ethers.toUtf8Bytes('Resources:'),
        'Resources',
        0,
      ),
    ).deep.eq([ethers.hexlify(ethers.toUtf8Bytes('')), 10]);
  });

  it('parseArray', async function () {
    const { siweParserTests } = await deploy();

    expect(
      await siweParserTests.testParseArray(
        ethers.toUtf8Bytes('- abc\n- bcd'),
        0,
      ),
    ).deep.eq([
      [
        ethers.hexlify(ethers.toUtf8Bytes('abc')),
        ethers.hexlify(ethers.toUtf8Bytes('bcd')),
      ],
      11,
    ]);
    expect(
      await siweParserTests.testParseArray(
        ethers.toUtf8Bytes('- abc\n- bcd\n'),
        0,
      ),
    ).deep.eq([
      [
        ethers.hexlify(ethers.toUtf8Bytes('abc')),
        ethers.hexlify(ethers.toUtf8Bytes('bcd')),
      ],
      12,
    ]);
    expect(
      await siweParserTests.testParseArray(
        ethers.toUtf8Bytes('- abc\n- bcd\nsomething that is not array anymore'),
        0,
      ),
    ).deep.eq([
      [
        ethers.hexlify(ethers.toUtf8Bytes('abc')),
        ethers.hexlify(ethers.toUtf8Bytes('bcd')),
      ],
      12,
    ]);
    expect(
      await siweParserTests.testParseArray(
        ethers.toUtf8Bytes('something before the array:\n- abc\n- bcd\n'),
        28,
      ),
    ).deep.eq([
      [
        ethers.hexlify(ethers.toUtf8Bytes('abc')),
        ethers.hexlify(ethers.toUtf8Bytes('bcd')),
      ],
      40,
    ]);
  });

  it('parseSiweMsg full', async function () {
    const { siweParserTests } = await deploy();
    const siweMsg = new SiweMessage({
      domain: 'example.com:5173',
      scheme: 'http',
      address: (await ethers.getSigners())[0].address,
      statement: `I accept the ExampleOrg Terms of Service: http://example.com/tos`,
      uri: `http://example.com:5173/login`,
      version: '1',
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      nonce: 'abcdef01',
      issuedAt: '2024-07-10T10:24:49Z',
      expirationTime: '2024-07-11T10:24:49Z',
      notBefore: '2024-07-10T10:24:50Z',
      requestId: 'john%40example.com%3A1234%2Fmy%20very%20secret%20request',
      resources: ['http://example.com/accounts', 'http://example.com/users'],
    });

    const parsedSiweMsg: ParsedSiweMessageStruct =
      await siweParserTests.testParseSiweMsg(
        ethers.toUtf8Bytes(siweMsg.toMessage()),
      );
    expect(parsedSiweMsg.schemeDomain).eq(
      ethers.hexlify(
        ethers.toUtf8Bytes(siweMsg.scheme + '://' + siweMsg.domain),
      ),
    );
    expect(parsedSiweMsg.addr).eq(siweMsg.address);
    expect(parsedSiweMsg.statement).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.statement!)),
    );
    expect(parsedSiweMsg.uri).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.uri)),
    );
    expect(parsedSiweMsg.version).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.version)),
    );
    expect(parsedSiweMsg.chainId).eq(siweMsg.chainId);
    expect(parsedSiweMsg.nonce).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.nonce)),
    );
    expect(parsedSiweMsg.issuedAt).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.issuedAt!)),
    );
    expect(parsedSiweMsg.expirationTime).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.expirationTime!)),
    );
    expect(parsedSiweMsg.notBefore).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.notBefore!)),
    );
    expect(parsedSiweMsg.requestId).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.requestId!)),
    );
    for (let i = 0; i < parsedSiweMsg.resources.length; i++) {
      expect(parsedSiweMsg.resources[i]).eq(
        ethers.hexlify(ethers.toUtf8Bytes(siweMsg.resources![i])),
      );
    }
  });

  it('parseSiweMsg minimal', async function () {
    const { siweParserTests } = await deploy();
    const siweMsg = new SiweMessage({
      domain: 'example.com',
      address: (await ethers.getSigners())[0].address,
      uri: `http://example.com`,
      version: '1',
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      nonce: 'abcdef01',
      issuedAt: '2024-07-10T10:24:49Z',
    });

    const parsedSiweMsg: ParsedSiweMessageStruct =
      await siweParserTests.testParseSiweMsg(
        ethers.toUtf8Bytes(siweMsg.toMessage()),
      );
    expect(parsedSiweMsg.schemeDomain).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.domain)),
    );
    expect(parsedSiweMsg.addr).eq(siweMsg.address);
    expect(parsedSiweMsg.uri).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.uri)),
    );
    expect(parsedSiweMsg.version).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.version)),
    );
    expect(parsedSiweMsg.chainId).eq(siweMsg.chainId);
    expect(parsedSiweMsg.nonce).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.nonce)),
    );
    expect(parsedSiweMsg.issuedAt).eq(
      ethers.hexlify(ethers.toUtf8Bytes(siweMsg.issuedAt!)),
    );
  });

  it('parseSiweMsg invalid', async function () {
    const { siweParserTests } = await deploy();
    const siweMsg = new SiweMessage({
      domain: 'example.com:5173',
      scheme: 'http',
      address: (await ethers.getSigners())[0].address,
      statement: `I accept the ExampleOrg Terms of Service: http://example.com/tos`,
      uri: `http://example.com:5173/login`,
      version: '1',
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      nonce: 'abcdef01',
      issuedAt: '2024-07-10T10:24:49Z',
      expirationTime: '2024-07-11T10:24:49Z',
      notBefore: '2024-07-10T10:24:50Z',
      requestId: 'john%40example.com%3A1234%2Fmy%20very%20secret%20request',
      resources: ['http://example.com/accounts', 'http://example.com/users'],
    }).toMessage();
    const siweMsgInvalidNonce = siweMsg.replace('abcdef01', 'abcdef0');

    await expect(
      siweParserTests.testParseSiweMsg(ethers.toUtf8Bytes(siweMsgInvalidNonce)),
    ).to.be.reverted;
  });

  it('timestampFromIso', async function () {
    const { siweParserTests } = await deploy();

    const date = '2024-07-10T10:24:49Z';
    expect(
      await siweParserTests.testTimestampFromIso(
        ethers.hexlify(ethers.toUtf8Bytes(date)),
      ),
    ).eq(Date.parse(date) / 1000);
  });
});
