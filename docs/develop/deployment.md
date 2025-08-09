---
description: Deploying upgradable and deterministic contracts with proxies
---

# Deployment Patterns

## Implementing Proxy contracts on Oasis Sapphire

As a confidential Ethereum Virtual Machine (EVM), Oasis prevents external
access to contract storage or runtime states in order to keep your secrets
private. This unique feature affects how developers interact with and manage
smart contracts, particularly when using common Ethereum development tools.

### What are Upgradable Contracts?

Upgradable contracts are smart contracts designed to allow developers to update
functionality even after being deployed to a blockchain. This is particularly
useful for fixing bugs or adding new features without losing the existing state
or having to deploy a new contract. Upgradability is achieved through proxy
patterns, where a proxy contract directs calls to an underlying logic contract
which developers can swap out without affecting the state stored in the proxy.

#### [EIP-1822]: Universal Upgradeable Proxy Standard (UUPS)

EIP-1822 introduces a method for creating upgradable contracts using a proxy
pattern and specifies a mechanism where the proxy contract itself contains the
upgrade logic. This design reduces the complexity and potential for errors
compared to other proxy patterns because it consolidates upgrade functionality
within the proxy and eliminates the need for additional external management.

#### [EIP-1967]: Standard Proxy Storage Slots

EIP-1967 defines standard storage slots to be used by all proxy contracts for
consistent and predictable storage access. This standard helps prevent storage
collisions and enhances security by outlining specific locations in a proxy
contract for storing the address of the logic contract and other administrative
information. Using these predetermined slots makes managing and auditing proxy
contracts easier.

[EIP-1822]: https://eips.ethereum.org/EIPS/eip-1822
[EIP-1967]: https://eips.ethereum.org/EIPS/eip-1967

### The Impact of Confidential EVM on Tooling Compatibility

While the underlying proxy implementations in EIP-1822 work perfectly in
facilitating smart contract upgrades, the tools typically used to manage these
proxies may still face limitations on Oasis Sapphire.

As of now, only the following well-known EIP-1967 slots are readable via
`eth_getStorageAt`, enabling compatibility with most proxy tooling:

- Proxy implementation address
- Beacon proxy implementation
- Admin slot

Access to all other storage remains restricted in the confidential environment.

Additionally, Sapphire natively protects against replay and currently does not
allow an empty chain ID à la pre [EIP-155] transactions.

[eth_getStorageAt]: https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_getstorageat
[openzeppelin-upgrades]: https://github.com/OpenZeppelin/openzeppelin-upgrades
[EIP-155]: https://eips.ethereum.org/EIPS/eip-155

### Solutions for Using UUPS Proxies on Oasis Sapphire

Developers looking to use UUPS proxies on Oasis Sapphire have two primary
options:

#### 1. Directly Implement EIP-1822

Avoid using [openzeppelin-upgrades] and manually handle the proxy setup and
upgrades with your own scripts, such as by calling the `updateCodeAddress`
method directly.

#### 2. Modify Deployment Scripts

Change deployment scripts to avoid `eth_getStorageAt`. Alternative methods
like calling `owner()` which do not require direct storage access.
[hardhat-deploy] as of `0.12.4` supports this approach with a default proxy
that includes an `owner()` function when deploying with a configuration that
specifies `proxy: true`.

```typescript
module.exports = async ({getNamedAccounts, deployments, getChainId}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  await deploy('Greeter', {
    from: deployer,
    proxy: true,
  });
};
```

### Solution for Using Deterministic Proxies on Oasis Sapphire

We suggest that developers interested in deterministic proxies on Oasis
Sapphire use a contract that supports replay protection.

`hardhat-deploy` supports using the [Safe Singleton factory][safe-singleton-factory] deployed on
the Sapphire [Mainnet] and [Testnet] when `deterministicDeployment` is `true`.

```typescript
module.exports = async ({getNamedAccounts, deployments, getChainId}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  await deploy('Greeter', {
    from: deployer,
    deterministicDeployment: true,
  });
};
```

Next, in your `hardhat.config.ts` file, specify the address of the Safe
Singleton factory:

```typescript
  deterministicDeployment: {
    "97": {
      factory: '0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7',
      deployer: '0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37',
      funding: '2000000',
      signedTx: '',
    },
    "23295": {
      factory: '0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7',
      deployer: '0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37',
      funding: '2000000',
      signedTx: '',
    }
  },
```

[hardhat-deploy]: https://github.com/wighawag/hardhat-deploy
[Mainnet]: https://explorer.oasis.io/mainnet/sapphire/address/0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7
[Testnet]: https://explorer.oasis.io/testnet/sapphire/address/0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7
[safe-singleton-factory]: https://github.com/safe-global/safe-singleton-factory

## Clones

Sapphire supports fixed address non-upgradable [clones][clones] to help
developers replicate contract functionality and reduce contract deployment
costs.

[clones]: https://docs.openzeppelin.com/contracts/5.x/api/proxy#Clones

#### [EIP-1167]: Minimal Proxy

EIP-1167 introduces a way to minimize bytecode and associated contract
deployment costs while copying contract functionality. "Clone" contracts
delegate calls to a target or fixed address which serve as a reference for the
behavior of the "clone." Third-party tools and users can correctly predict
the outcome of contract calls with minimal side effects.

[EIP-1167]: https://eips.ethereum.org/EIPS/eip-1167

## Caution Against Using `eth_getStorageAt`

Direct storage access, such as with `eth_getStorageAt`, is generally
discouraged. It reduces contract flexibility and deviates from common practice
which advocates for a standardized Solidity compatible API to both facilitate
interactions between contracts and allow popular libraries such as [ABIType]
and [TypeChain] to automatically generate client bindings. Direct storage
access makes contracts less adaptable and complicates on-chain automation; it
can even complicate the use of multisig wallets.
For contracts aiming to maintain a standard interface and ensure future
upgradeability, we advise sticking to ERC-defined Solidity compatible APIs and
avoiding directly interacting with contract storage.

[ABIType]: https://abitype.dev/
[TypeChain]: https://www.npmjs.com/package/typechain

### [EIP-7201]: Namespaced Storage for Delegatecall Contracts

ERC-7201 proposes a structured approach to storage in smart contracts that
utilize `delegatecall` which is often employed in proxy contracts for
upgradability. This standard recommends namespacing storage to mitigate the
risk of storage collisions — a common issue when multiple contracts share the
same storage space in a `delegatecall` context.

[EIP-7201]: https://eips.ethereum.org/EIPS/eip-7201

### Benefits of Namespacing over Direct Storage Access

Contracts using `delegatecall`, such as upgradable proxies, can benefit from
namespacing their storage through more efficient data organization which
enhances security. This approach isolates different variables and sections of
a contract’s storage under distinct namespaces, ensuring that each segment is
distinct and does not interfere with others. Namespacing is generally more
robust and preferable to using `eth_getStorageAt`.

See example ERC-7201 implementation and usage:
https://gist.github.com/CedarMist/4cfb8f967714aa6862dd062742acbc7b

```solidity
// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

contract Example7201 {
    /// @custom:storage-location erc7201:Example7201.state
    struct State {
        uint256 counter;
    }

    function _stateStorageSlot()
        private pure
        returns (bytes32)
    {
        return keccak256(abi.encode(uint256(keccak256("Example7201.state")) - 1)) & ~bytes32(uint256(0xff));
    }

    function _getState()
        private pure
        returns (State storage state)
    {
        bytes32 slot = _stateStorageSlot();
        assembly {
            state.slot := slot
        }
    }

    function increment()
        public
    {
        State storage state = _getState();

        state.counter += 1;
    }

    function get()
        public view
        returns (uint256)
    {
        State storage state = _getState();

        return state.counter;
    }
}

contract ExampleCaller {
    Example7201 private example;

    constructor () {
        example = new Example7201();
    }
    function get()
        external
        returns (uint256 counter)
    {
        (bool success, bytes memory result ) = address(example).delegatecall(abi.encodeCall(example.get, ()));
        require(success);
        counter = abi.decode(result, (uint256));
    }

    function increment()
        external
    {
        (bool success, ) = address(example).delegatecall(abi.encodeCall(example.increment, ()));
        require(success);
    }
}
```
