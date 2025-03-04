// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {encryptCallData} from "lib/oasisprotocol-sapphire-contracts/CalldataEncryption.sol";
import {EIP155Signer} from "lib/oasisprotocol-sapphire-contracts/EIP155Signer.sol";
import {SapphireDecryptor} from "lib/oasisprotocol-sapphire-foundry/BinaryContracts.sol";
struct EthereumKeypair {
    address addr;
    bytes32 secret;
    uint64 nonce;
}

// Proxy for gasless transaction.
contract Gasless is SapphireDecryptor {
    EthereumKeypair private kp;

    constructor(EthereumKeypair memory keypair) payable {
        kp = keypair;
        if (msg.value > 0) {
            payable(kp.addr).transfer(msg.value);
        }
    }

    function makeProxyTx(
        address innercallAddr,
        bytes memory innercall
    ) external view returns (bytes memory output) {
        bytes memory data = abi.encode(innercallAddr, innercall);
        return
            EIP155Signer.sign(
                kp.addr,
                kp.secret,
                EIP155Signer.EthTx({
                    nonce: kp.nonce,
                    gasPrice: 100_000_000_000,
                    gasLimit: 250000,
                    to: address(this),
                    value: 0,
                    data: encryptCallData(abi.encodeCall(this.proxy, data)),
                    chainId: block.chainid
                })
            );
    }

    function makeProxyTxPlain(
        address innercallAddr,
        bytes memory innercall
    ) external view returns (bytes memory output) {
        bytes memory data = abi.encode(innercallAddr, innercall);
        return
            EIP155Signer.sign(
                kp.addr,
                kp.secret,
                EIP155Signer.EthTx({
                    nonce: kp.nonce,
                    gasPrice: 100_000_000_000,
                    gasLimit: 250000,
                    to: address(this),
                    value: 0,
                    data: abi.encodeCall(this.proxy, data),
                    chainId: block.chainid
                })
            );
    }

    function proxy(bytes memory data) external payable {
        (address addr, bytes memory subcallData) = abi.decode(
            data,
            (address, bytes)
        );
        (bool success, bytes memory outData) = addr.call{value: msg.value}(
            subcallData
        );
        if (!success) {
            // Add inner-transaction meaningful data in case of error.
            assembly {
                revert(add(outData, 32), mload(outData))
            }
        }
        kp.nonce += 1;
    }
}
