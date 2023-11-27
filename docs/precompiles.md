---
description: Additional Sapphire precompiles for encryption and confidentiality
---

# Precompiles

In addition to the standard EVM precompiles, Sapphire provides a number
of further cryptography-related ones to make some operations easier and
cheaper to perform: x25519 key derivation, Deoxys-II-based encryption
and decryption, signing key generation, message digest signing and
verification.

These can be called in the same way as other precompiles by dispatching
calls to specific well-known contract addresses, as described below.

Input parameters should be packed into a contiguous memory region with
each chunk of data padded to 32 bytes as usual. The recommended way to
construct parameter byte sequences in Solidity is with `abi.encode` and
`abi.decode`, which will transparently handle things like putting
`bytes` lengths in the correct position.

## Library

While it is possible to call the precompiles directly using Yul or, for
example, `abi.encode` and `abi.decode` in Solidity, we recommend always
using the `contracts/Sapphire.sol` wrapper library for a more comfortable
experience. The examples below are written against it. The library is provided
by the `@oasisprotocol/sapphire-contracts` npm package.

```shell npm2yarn
npm install -D @oasisprotocol/sapphire-contracts
```

Then, you can use the wrapper library inside your `.sol` contract file as
follows:

```solidity
pragma solidity ^0.8.13;

import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

contract Test {
    constructor() {}
    function test() public view returns (bytes32) {
        return Sapphire.deriveSymmetricKey("public key as bytes32", "private key as bytes32");
    }
}
```

Feel free to discover other convenient libraries for Solidity inside the
`contracts/` folder of the
[Oasis Sapphire repository](https://github.com/oasisprotocol/sapphire-paratime)!

## Generating Pseudo-Random Bytes

* Precompile address: `0x0100000000000000000000000000000000000001`
* Parameters: `uint num_bytes, bytes pers`
* Gas cost: 10,000 minimum plus 240 per output word plus 60 per word of
  the personalization string.

Generate `num_bytes` pseudo-random bytes, with an optional personalization
string (`pers`) added into the hashing algorithm to increase domain separation
when needed.

```solidity
bytes memory randomPad = Sapphire.randomBytes(64, "");
```

### Implementation Details

:::danger Prior to 0.6.0
All view queries and simulated transactions (via `eth_call`) would receive the
same entropy in-between blocks if they use the same `num_bytes` and `pers` parameters.
If your contract requires confidentiality you should generate a secret in the constructor
to be used with view calls:

```solidity
Sapphire.randomBytes(64, abi.encodePacked(msg.sender, this.perContactSecret));
```
:::

The mode (e.g. simulation or 'view call' vs transaction execution) is fed to TupleHash (among other
block-dependent components) to derive the "key id", which is then used to derive a per-block VRF key
from epoch-ephemeral entropy (using KMAC256 and cSHAKE) so a different "key id" will result in a
unique per-block VRF key. This per-block VRF key is then used to create the per-block root RNG which
is then used to derive domain-separated (using Merlin transcripts) per-transaction random RNGs which
are then exposed via this precompile. The KMAC, cSHAKE and TupleHash algorithms are SHA-3 derived functions
defined in [NIST Special Publication 800-185](https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-185.pdf).

## X25519 Key Derivation

* Precompile address: `0x0100000000000000000000000000000000000002`
* Parameters: `bytes32 public_key, bytes32 private_key`
* Gas cost: 100,000

### Example

```solidity
bytes32 publicKey = ... ;
bytes32 privateKey = ... ;
bytes32 symmetric = Sapphire.deriveSymmetricKey(publicKey, privateKey);
```

## Deoxys-II Encryption

* Encryption precompile address: `0x0100000000000000000000000000000000000003`
* Decryption precompile address: `0x0100000000000000000000000000000000000004`
* Parameters: `bytes32 key, bytes32 nonce, bytes text_or_ciphertext, bytes additional_data`
* Gas cost: 50,000 minimum plus 100 per word of input

### Example

```solidity
bytes32 key = ... ;
bytes32 nonce = ... ;
bytes memory text = "plain text";
bytes memory ad = "additional data";
bytes memory encrypted = Sapphire.encrypt(key, nonce, text, ad);
bytes memory decrypted = Sapphire.decrypt(key, nonce, encrypted, ad);
```

## Signing Keypairs Generation

* Precompile address: `0x0100000000000000000000000000000000000005`
* Parameters: `uint method, bytes seed`
* Return value: `bytes public_key, bytes private_key`
* Gas cost: method-dependent base cost, see below

The available methods are items in the `Sapphire.SigningAlg` enum. Note,
however, that the generation method ignores subvariants, so all three
ed25519-based are equivalent, and all secp256k1 & secp256r1 based methods are
equivalent. `Sr25519` is not available and will return an error.

### Gas Cost
* Ed25519: 1,000 gas
  * `0` (`Ed25519Oasis`)
  * `1` (`Ed25519Pure`)
  * `2` (`Ed25519PrehashedSha512`)
* Secp256k1: 1,500 gas.
  * `3` (`Secp256k1Oasis`)
  * `4` (`Secp256k1PrehashedKeccak256`)
  * `5` (`Secp256k1PrehashedSha256`)
* Secp256r1: 4,000 gas
  * `7` (`Secp256r1PrehashedSha256`)

### Public Key Format

 * Ed25519: 32 bytes
 * Secp256k1 & Secp256r1: 33 bytes, compressed format (0x02 or 0x03 prefix, then 32 byte X coordinate)

### Example

Using the Sapphire library:

```solidity
bytes memory seed = hex"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
bytes memory publicKey;
bytes memory privateKey;
(publicKey, privateKey) = Sapphire.generateSigningKeyPair(Sapphire.SigningAlg.Ed25519Pure, seed);
```

## Message Signing

* Precompile address: `0x0100000000000000000000000000000000000006`
* Parameters: `uint method, bytes private_key, bytes context_or_digest, bytes message`
* Gas cost: see below for the method-dependent base cost, plus 8 gas per 32 bytes of context and message except digest.

The `context_or_digest` and `messages` parameters change in meaning slightly
depending on the method requested. For methods that take a context in addition
to the message you must pass the context in the `context_or_digest` parameter
and use `message` as expected. For methods that take a pre-existing hash of the
message, pass that in `context_or_digest` and leave `message` empty.
Specifically the `Ed25519Oasis` and `Secp256k1Oasis` variants take both a
context and a message (each are variable length `bytes`), the context serves as
a domain separator.

### Signing Algorithms

* `0` (`Ed25519Oasis`)
  * 1,500 gas
  * variable length context and message
* `1` (`Ed25519Pure`)
  * 1,500 gas
  * empty context, variable length message
* `2` (`Ed25519PrehashedSha512`)
  * 1,500 gas
  * pre-existing SHA-512 hash (64 bytes) as context, empty message
* `3` (`Secp256k1Oasis`)
  * 3,000 gas
  * variable length context and message
* `4` (`Secp256k1PrehashedKeccak256`)
  * 3,000 gas
  * pre-existing hash (32 bytes) as context, empty message
* `5` (`Secp256k1PrehashedSha256`)
  * 3,000 gas
  * pre-existing hash (32 bytes) as context, empty message
* `7` (`Secp256r1PrehashedSha256`)
  * 9,000 gas
  * pre-existing hash (32 bytes) as context, empty message

### Example

Using the Sapphire library:

```solidity
Sapphire.SigningAlg alg = Sapphire.SigningAlg.Ed25519Pure;
bytes memory pk;
bytes memory sk;
(pk, sk) = Sapphire.generateSigningKeyPair(alg, Sapphire.randomBytes(32, ""));
bytes memory signature = Sapphire.sign(alg, sk, "", "signed message");
```

## Signature Verification

* Precompile address: `0x0100000000000000000000000000000000000007`
* Parameters: `uint method, bytes public_key, bytes context_or_digest, bytes message, bytes signature`

The `method`, `context_or_digest` and `message` parameters have the same meaning
as described above in the Message Signing section.

### Gas Cost

The algorithm-specific base cost below, with an additional 8 gas per 32 bytes of
`context` and `message` for the `Ed25519Oasis`, `Ed25519Pure` and `Secp256k1Oasis` algorithms.

* Ed25519: 2,000 gas
  * `0` (`Ed25519Oasis`)
  * `1` (`Ed25519Pure`)
  * `2` (`Ed25519PrehashedSha512`)
* Secp256k1: 3,000 gas
  * `3` (`Secp256k1Oasis`)
  * `4` (`Secp256k1PrehashedKeccak256`)
  * `5` (`Secp256k1PrehashedSha256`)
* Secp256r1: 7,900 gas
  * `7` (`Secp256r1PrehashedSha256`)

### Example

Using the Sapphire library:

```solidity
Sapphire.SigningAlg alg = Sapphire.SigningAlg.Secp256k1PrehashedKeccak256;
bytes memory pk;
bytes memory sk;
bytes memory digest = abi.encodePacked(keccak256("signed message"));
(pk, sk) = Sapphire.generateSigningKeyPair(alg, Sapphire.randomBytes(32, ""));
bytes memory signature = Sapphire.sign(alg, sk, digest, "");
require( Sapphire.verify(alg, pk, digest, "", signature) );
```

## SHA-512

 * Precompile address: `0x0100000000000000000000000000000000000101`
 * Parameters: `bytes input_data`

Hash the input data with SHA-512, according to [NIST.FIPS.180-4]

:::warning SHA-512 is vulnerable to length-extension attacks

The SHA-512/256 variant (below) is not vulnerable to [length-extension attacks].
Length extension attacks are relevant if, among other things, you are computing
the hash of a secret message or computing merkle trees.

:::

[length-extension attacks]: https://en.wikipedia.org/wiki/Length_extension_attack

### Gas Cost

* 115 gas, then 13 gas per word

### Example

```solidity
bytes memory result = sha512(abi.encodePacked("input data"));
```


## SHA-512/256

 * Precompile address: `0x0100000000000000000000000000000000000102`
 * Parameters: `bytes input_data`

Hash the input data with SHA-512/256, according to [NIST.FIPS.180-4]

[NIST.FIPS.180-4]: https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf

### Gas Cost

 * 115 gas, then 13 gas per word

### Example

```solidity
bytes32 result = sha512_256(abi.encodePacked("input data"));
```


## Subcall

 * Precompile address: `0x0100000000000000000000000000000000000102`
 * Parameters: `string method, bytes cborEncodedParams`

Subcall performs an Oasis SDK call. This allows Sapphire contracts to interact
with the Consensus layer and other modules supported by the SDK. For more
information about the specific modules and their available calls see the Oasis
SDK [source code].

### Gas Cost

Varies per operation, refer to the oasis-sdk [source code].

### Example

TODO: an example

[source code]: https://github.com/oasisprotocol/oasis-sdk/tree/main/runtime-sdk/src/modules
