// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {Context} from "@openzeppelin/contracts/utils/Context.sol";

/// Unable to automatically configure OPL. Please use the manual version of the base contract.
error AutoConfigUnavailable();
/// The method can only be called by the message bus;
error NotMessageBus();
/// Messages may only be sent by the remote endpoint (Enclave or Host).
error NotRemoteEndpoint();
/// This message arrived too early or late.
error WrongSeqNum(uint256 expected, uint256 got);
/// The remote endpoint's contract address was missing.
error MissingRemoteAddr();
/// The remote endpoint's chain ID was missing.
error MissingRemoteChainId();
/// Calls to contracts on the same chain are not allowed unless on a local testnet.
error SelfCallDisallowed();
/// The requested endpoint does not exist.
error UnknownEndpoint();
/// Receiving endpoint did not return successfully.
error ReceiverError();

/// The outcome of the message call.
enum Result {
    // The message was rejected.
    PermanentFailure,
    // The message was rejected but may be accepted later.
    TransientFailure,
    // The message was accepted and processed.
    Success
}

interface ICelerMessageBus {
    function feeBase() external view returns (uint256);

    function feePerByte() external view returns (uint256);

    function sendMessage(
        address _host,
        uint256 _hostChainId,
        bytes calldata _message
    ) external payable;
}

contract BaseEndpoint is Context {
    address internal immutable messageBus;
    bool private immutable inOrder;

    address private remote;
    uint256 private remoteChainId;

    mapping(bytes32 => function(bytes calldata) returns (Result))
        private endpoints;

    uint256 private txSeq;
    uint256 private rxSeq;

    constructor(
        address _remote,
        uint256 _remoteChainId,
        address _messageBus,
        bool _inOrder
    ) {
        if (_remote == address(0)) revert MissingRemoteAddr();
        if (_remoteChainId == 0) revert MissingRemoteChainId();
        remote = _remote;
        remoteChainId = _remoteChainId;
        messageBus = _messageBus;
        inOrder = _inOrder;
        if (!_isLocalNetwork() && _remoteChainId == block.chainid)
            revert SelfCallDisallowed();
    }

    function registerEndpoint(
        bytes memory _method,
        function(bytes calldata) returns (Result) _cb
    ) internal {
        // This is a waste of an SLOAD, but the alternative before immutable arrays
        // (https://github.com/ethereum/solidity/issues/12587) land is terribly verbose.
        // This can be fixed once gas usage becomes a problem.
        endpoints[bytes4(keccak256(_method))] = _cb;
    }

    function postMessage(bytes memory _method) internal {
        return postMessage(_method, "");
    }

    function postMessage(bytes memory _method, bytes memory _message) internal {
        bytes memory envelope = abi.encodePacked(
            bytes4(keccak256(_method)),
            txSeq,
            _message
        );
        uint256 fee = estimateFee(envelope.length);
        if (_isLocalNetwork()) {
            uint256 celerStatus = BaseEndpoint(messageBus).executeMessage(
                address(this), // sender
                uint64(block.chainid),
                envelope,
                address(this) // executor
            );
            if (celerStatus != 1) revert ReceiverError();
            if (fee > 0) payable(0).transfer(fee); // burn the fee, for fidelity
        } else {
            ICelerMessageBus(messageBus).sendMessage{value: fee}(
                remote,
                remoteChainId,
                envelope
            );
        }
        ++txSeq;
    }

    /// Celer message bus callback function.
    function executeMessage(
        address _sender,
        uint64 _senderChainId,
        bytes calldata _message,
        address // executor
    ) external payable returns (uint256) {
        if (msg.sender != messageBus) revert NotMessageBus();
        if (_sender != remote || _senderChainId != remoteChainId)
            revert NotRemoteEndpoint();
        bytes4 epSel = bytes4(_message[:4]);
        uint256 seq = uint256(bytes32(_message[4:36]));
        bytes calldata message = _message[36:];
        if (inOrder) {
            if (seq != rxSeq) revert WrongSeqNum(rxSeq, seq);
            ++rxSeq;
        }
        function(bytes calldata) returns (Result) ep = endpoints[epSel];
        bool epMissing;
        /// @solidity memory-safe-assembly
        assembly {
            epMissing := iszero(ep)
        }
        Result result = endpoints[epSel](message);
        // Convert the Result to a Celer ExecutionStatus.
        if (result == Result.TransientFailure) return 2; // ExecutionStatus.Retry
        if (result == Result.Success) return 1; // ExecutionStatus.Success
        return 0; // ExecutionStatus.Fail
    }

    function estimateFee(uint256 _msgLen) internal view returns (uint256) {
        if (_isLocalNetwork()) return 0;
        uint256 feeBase = ICelerMessageBus(messageBus).feeBase();
        uint256 feePerByte = ICelerMessageBus(messageBus).feePerByte();
        return feeBase + _msgLen * feePerByte;
    }

    function _isLocalNetwork() internal view returns (bool) {
        return messageBus == remote && block.chainid == remoteChainId;
    }
}

/**
 * @title OPL Endpoint
 * @dev An app that sends or receives using OPL.
 */
contract Endpoint is BaseEndpoint {
    constructor(address _remote, bytes32 _remoteChainName)
        BaseEndpoint(
            _remote,
            _getRemoteChainId(_remoteChainName),
            _getBus(_remote, _remoteChainName),
            false
        )
    {} // solhint-disable-line no-empty-blocks
}

/* solhint-disable func-visibility */

/**
 * @dev Autoswitch automatically picks the remote network based on the network the contract on which the contract has already been deployed.
 * @dev When on testnet, the remote chain will be the testnet version of the provided chain.
 * @dev When running locally, the remote chain will be this one and the contracts will call each other without going through a message bus. This is helpful for debugging logic but does not test gas fee payment and other moving parts.
 */
function autoswitch(bytes32 protocol) view returns (bytes32 networkName) {
    if (block.chainid == 1337 || block.chainid == 31337) return "local";
    (, bool isTestnet) = _getChainConfig(block.chainid);
    if (isTestnet) {
        if (protocol == "ethereum") return "goerli";
        if (protocol == "bsc") return "bsc-testnet";
        if (protocol == "polygon") return "polygon-mumbai";
        if (protocol == "fantom") return "fantom-testnet";
        if (protocol == "sapphire") return "sapphire-testnet";
        if (protocol == "arbitrum-one") return "arbitrum-testnet";
        if (protocol == "arbitrum-nova") return "arbitrum-testnet";
        if (protocol == "avalanche") return "avalanche-fuji";
        revert AutoConfigUnavailable();
    }
    if (_chainName2ChainId(protocol) == 0) revert AutoConfigUnavailable();
    return protocol;
}

function _getBus(address _remote, bytes32 _remoteChainName)
    view
    returns (address)
{
    if (_remoteChainName == "local") return _remote;
    (address messageBus, ) = _getChainConfig(block.chainid);
    return messageBus;
}

function _getRemoteChainId(bytes32 _remoteChainName) view returns (uint256) {
    if (_remoteChainName == "local") return block.chainid;
    return _chainName2ChainId(_remoteChainName);
}

function _chainName2ChainId(bytes32 name) pure returns (uint256) {
    if (name == "ethereum") return 1;
    if (name == "goerli") return 5;
    if (name == "optimism") return 10;
    if (name == "bsc") return 56;
    if (name == "bsc-testnet") return 97;
    if (name == "polygon") return 137;
    if (name == "fantom") return 0xfa;
    if (name == "fantom-testnet") return 0xfa2;
    if (name == "moonriver") return 0x505;
    if (name == "arbitrum-one") return 0xa4b1;
    if (name == "arbitrum-nova") return 0xa4ba;
    if (name == "sapphire") return 0x5afe;
    if (name == "sapphire-testnet") return 0x5aff;
    if (name == "polygon-mumbai") return 80001;
    if (name == "avalanche") return 43114;
    if (name == "avalanche-fuji") return 43313;
    if (name == "arbitrum-testnet") return 0x66eeb;
    return 0;
}

/// Configs from https://im-docs.celer.network/developer/contract-addresses-and-rpc-info.
function _getChainConfig(uint256 _chainId)
    pure
    returns (address _messageBus, bool _isTestnet)
{
    if (_chainId == 1)
        // ethereum
        return (0x4066D196A423b2b3B8B054f4F40efB47a74E200C, false);
    if (_chainId == 5)
        // goerli
        return (0xF25170F86E4291a99a9A560032Fe9948b8BcFBB2, true);
    if (_chainId == 10)
        // optimism
        return (0x0D71D18126E03646eb09FEc929e2ae87b7CAE69d, false);
    if (_chainId == 56)
        // bsc
        return (0x95714818fdd7a5454F73Da9c777B3ee6EbAEEa6B, false);
    if (_chainId == 97)
        // bsc testnet
        return (0xAd204986D6cB67A5Bc76a3CB8974823F43Cb9AAA, true);
    if (_chainId == 137)
        // polygon
        return (0xaFDb9C40C7144022811F034EE07Ce2E110093fe6, false);
    if (_chainId == 0xfa)
        // fantom
        return (0xFF4E183a0Ceb4Fa98E63BbF8077B929c8E5A2bA4, false);
    if (_chainId == 0xfa2)
        // fantom testnet
        return (0xb92d6933A024bcca9A21669a480C236Cbc973110, true);
    if (_chainId == 0x505)
        // moonriver
        return (0x940dAAbA3F713abFabD79CdD991466fe698CBe54, false);
    if (_chainId == 0x5afe)
        // sapphire
        return (0x9Bb46D5100d2Db4608112026951c9C965b233f4D, false);
    if (_chainId == 0x5aff)
        // sapphire testnet
        return (0x9Bb46D5100d2Db4608112026951c9C965b233f4D, true);
    if (_chainId == 0xa4b1)
        // arbitrum one
        return (0x3Ad9d0648CDAA2426331e894e980D0a5Ed16257f, false);
    if (_chainId == 0xa4ba)
        // arbitrum nova
        return (0xf5C6825015280CdfD0b56903F9F8B5A2233476F5, false);
    if (_chainId == 43113)
        // avalanche c-chain fuji testnet
        return (0xE9533976C590200E32d95C53f06AE12d292cFc47, true);
    if (_chainId == 43114)
        // avalanche c-chain
        return (0x5a926eeeAFc4D217ADd17e9641e8cE23Cd01Ad57, false);
    if (_chainId == 80001)
        // polygon mumbai testnet
        return (0x7d43AABC515C356145049227CeE54B608342c0ad, true);
    if (_chainId == 0x66eeb)
        // arbitrum testnet
        return (0x7d43AABC515C356145049227CeE54B608342c0ad, true);
    revert AutoConfigUnavailable();
}
