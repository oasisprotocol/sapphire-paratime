---
description: Authenticate users with your confidential contracts
---

# View-Call Authentication

User impersonation on Ethereum and other "Transparent EVMs" isn't a problem
because **everybody** can see **all** data however the Sapphire confidential
EVM prevents contracts from revealing confidential information to the wrong
party (account or contract) - for this reason we cannot allow arbitrary
impersonation of any `msg.sender`.

In Sapphire, there are four types of contract calls:

 1. Contract to contract calls (also known as *internal calls*)
 2. Unauthenticted view calls (queries using `eth_call`)
 3. Authenticated view calls (signed queries)
 4. Transactions (authenticated by signature)

Intra-contract calls always set `msg.sender` appropriately, if a contract calls
another contract in a way which could reveal sensitive information, the calling
contract must implement access control or authentication.

By default all `eth_call` queries used to invoke contract functions have the
`msg.sender` parameter set to `address(0x0)`. In contrast, authenticated calls are
signed by a keypair and will have the `msg.sender` parameter correctly initialized
(more on that later). Also, when a transaction is
submitted it is signed by a keypair (thus costs gas and can make state updates)
and the `msg.sender` will be set to the signing account.

## Sapphire Wrapper

The [@oasisprotocol/sapphire-paratime][sp-npm] Ethereum provider wrapper
`sapphire.wrap` function will **automatically end-to-end encrypt calldata** when
interacting with contracts on Sapphire, this is an easy way to ensure the
calldata of your dApp transactions remain confidential - although the `from`,
`to`, and `gasprice` parameters are not encrypted.

[sp-npm]: https://www.npmjs.com/package/@oasisprotocol/sapphire-paratime

:::tip Unauthenticated calls and Encryption

Although the calls may be unauthenticated, they can still be encrypted!

:::

However, if the Sapphire wrapper has been attached to a signer then subsequent
view calls via `eth_call` will request that the user sign them (e.g. a
MetaMask popup), these are called **signed queries** meaning `msg.sender` will be
set to the signing account and can be used for authentication or to implement
access control. This may add friction to the end-user experience and can result
in frequent pop-ups requesting they sign queries which wouldn't normally require
any interaction on Transparent EVMs.

Let's see how Sapphire interprets different contract calls. Suppose the
following solidity code:

```solidity
contract Example {
    address owner;
    constructor () {
        owner = msg.sender;
    }
    function isOwner () public view returns (bool) {
        return msg.sender == owner;
    }
}
```

In the sample above, assuming we're calling from the same contract or account
which created the contract, calling `isOwner` will return:

 * `false`, for `eth_call`
 * `false`, with `sapphire.wrap` but without an attached signer
 * `true`, with `sapphire.wrap` and an attached signer
 * `true`, if called via the contract which created it
 * `true`, if called via transaction

## Caching Signed Queries

When using signed queries the blockchain will be queried each time, however
the Sapphire wrapper will cache signatures for signed queries with the same
parameters to avoid asking the user to sign the same thing multiple times.

Behind the scenes the signed queries use a "leash" to specify validity conditions
so the query can only be performed within a block and account `nonce` range.
These parameters are visible in the EIP-712 popup signed by the user. Queries
with the same parameters will use the same leash.

## Daily Sign-In with EIP-712

One strategy which can be used to reduce the number of transaction signing
prompts when a user interacts with contracts via a dApp is to use
[EIP-712][eip-712] to "sign-in" once per day (or per-session), in combination
with using two wrapped providers:

[eip-712]: https://eips.ethereum.org/EIPS/eip-712

 1. Provider to perform encrypted but unauthenticated view calls
 2. Another provider to perform encrypted and authenticated transactions (or view calls)
    - The user will be prompted to sign each action.

The two-provider pattern, in conjunction with a daily EIP-712 sign-in prompt
ensures all transactions are end-to-end encrypted and the contract can
authenticate users in view calls without frequent annoying popups.

The code sample below uses an `authenticated` modifier to verify the sign-in:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

struct SignatureRSV {
    bytes32 r;
    bytes32 s;
    uint256 v;
}

contract SignInExample {
    bytes32 public constant EIP712_DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    string public constant SIGNIN_TYPE = "SignIn(address user,uint32 time)";
    bytes32 public constant SIGNIN_TYPEHASH = keccak256(bytes(SIGNIN_TYPE));
    bytes32 public immutable DOMAIN_SEPARATOR;

    constructor () {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256("SignInExample.SignIn"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    struct SignIn {
        address user;
        uint32 time;
        SignatureRSV rsv;
    }

    modifier authenticated(SignIn calldata auth)
    {
        // Must be signed within 24 hours ago.
        require( auth.time > (block.timestamp - (60*60*24)) );

        // Validate EIP-712 sign-in authentication.
        bytes32 authdataDigest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(
                SIGNIN_TYPEHASH,
                auth.user,
                auth.time
            ))
        ));

        address recovered_address = ecrecover(
            authdataDigest, uint8(auth.rsv.v), auth.rsv.r, auth.rsv.s);

        require( auth.user == recovered_address, "Invalid Sign-In" );

        _;
    }

    function authenticatedViewCall(
        SignIn calldata auth,
        ... args
    )
        external view
        authenticated(auth)
        returns (bytes memory output)
    {
        // Use `auth.user` instead of `msg.sender`!
    }
}
```

With the above contract code deployed, let's look at the frontend dApp and how
it can request the user to sign-in using EIP-712. You may wish to add additional
parameters which are authenticated such as the domain name. The following code
example uses Ethers:

```typescript
const time = new Date().getTime();
const user = await eth.signer.getAddress();

// Ask user to "Sign-In" every 24 hours.
const signature = await eth.signer.signTypedData({
    name: "SignInExample.SignIn",
    version: "1",
    chainId: import.meta.env.CHAINID,
    verifyingContract: await contract.getAddress()
}, {
    SignIn: [
        { name: 'user', type: "address" },
        { name: 'time', type: 'uint32' },
    ]
}, {
    user,
    time: time
});
const rsv = ethers.Signature.from(signature);
const auth = {user, time, rsv};
// The `auth` variable can then be cached.

// Then in the future, authenticated view calls can be performed by
// passing auth without further user interaction authenticated data.
await contract.authenticatedViewCall(auth, ...args);
```
