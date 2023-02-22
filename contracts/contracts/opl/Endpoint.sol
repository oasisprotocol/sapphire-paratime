// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// Unable to automatically configure OPL. Please use the manual version of the base contract.
error AutoConfigUnavailable();
/// The method cannot be called in this context.
error Forbidden(bytes32 location);
/// This message arrived too early or late.
error WrongSeqNum(uint256 expected, uint256 got);
/// The function was called with an invalid argument.
error InvalidArgument(bytes32 location);

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

contract BaseEndpoint {
    address private immutable bus;
    bool private immutable inOrder;

    address private host;
    uint256 private hostChainId;

    mapping(bytes32 => function(bytes calldata) returns (Result))
        private endpoints;

    uint256 private txSeq;
    uint256 private rxSeq;

    constructor(
        address _host,
        uint256 _hostChainId,
        address _bus,
        bool _inOrder
    ) {
        if (_host == address(0)) revert InvalidArgument("endpoint ctor");
        if (_hostChainId == block.chainid || _hostChainId == 0)
            revert InvalidArgument("endpoint ctor");
        host = _host;
        hostChainId = _hostChainId;
        bus = _bus;
        inOrder = _inOrder;
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

    function postMessage(bytes memory _method, bytes memory _message) internal {
        uint256 fee = estimateFee(_message);
        ICelerMessageBus(bus).sendMessage{value: fee}(
            host,
            hostChainId,
            abi.encodeWithSelector(bytes4(keccak256(_method)), txSeq, _message)
        );
        ++txSeq;
    }

    function executeMessage(
        address _sender,
        uint64 _senderChainId,
        bytes calldata _message,
        address
    ) external payable returns (uint256) {
        if (msg.sender != bus) revert Forbidden("bridge endpoint");
        if (_sender != host || _senderChainId != hostChainId)
            revert Forbidden("non-host sender");
        bytes4 epSel = bytes4(_message[:4]);
        uint256 seq = uint256(bytes32(_message[4:36]));
        bytes calldata message = _message[36:];
        if (inOrder) {
            if (seq != rxSeq) revert WrongSeqNum(rxSeq, seq);
            ++rxSeq;
        }
        function(bytes calldata) returns (Result) ep = endpoints[epSel];
        bool epExists;
        assembly ("memory-safe") {
            epExists := not(iszero(ep))
        }
        Result result = Result.PermanentFailure;
        if (epExists) result = endpoints[epSel](message);
        // Convert the Result to a Celer ExecutionStatus.
        if (result == Result.TransientFailure) return 2; // ExecutionStatus.Retry
        if (result == Result.Success) return 1; // ExecutionStatus.Success
        return 0; // ExecutionStatus.Fail
    }

    function estimateFee(bytes memory _message)
        internal
        view
        returns (uint256)
    {
        uint256 feeBase = ICelerMessageBus(bus).feeBase();
        uint256 feePerByte = ICelerMessageBus(bus).feePerByte();
        return
            feeBase +
            (_message.length +
                32 + /* seq */
                4) * /* epsel */
            feePerByte;
    }

    function _chainName2ChainId(bytes32 name) internal pure returns (uint256) {
        if (name == "ethereum") return 1;
        if (name == "goerli") return 5;
        if (name == "optimism") return 10;
        if (name == "bsc") return 56;
        if (name == "bsc-testnet") return 97;
        if (name == "polygon") return 137;
        if (name == "fantom") return 0xfa;
        if (name == "fantom-testnet") return 0xfa2;
        if (name == "moonriver") return 0x505;
        if (name == "sapphire-testnet") return 0x5aff;
        if (name == "arbitrum-one") return 1;
        if (name == "arbitrum-nova") return 1;
        if (name == "sapphire") return 0x5afe;
        if (name == "polygon-mumbai") return 80001;
        if (name == "avalanche") return 43114;
        if (name == "avalanche-fuji") return 43313;
        if (name == "arbitrum-testnet") return 0x66eeb;
        return 0;
    }

    function _getChainConfig(uint256 _chainId)
        internal
        pure
        returns (address _bus, bool _isTestnet)
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
}

/**
 * @title OPL Endpoint
 * @dev An app that sends or receives using OPL.
 */
contract Endpoint is BaseEndpoint {
    constructor(address _host, bytes32 _hostChain)
        BaseEndpoint(_host, _chainName2ChainId(_hostChain), _getBus(), false)
    {} // solhint-disable-line no-empty-blocks

    function _getBus() internal view returns (address) {
        (address bus, ) = _getChainConfig(block.chainid);
        return bus;
    }

    function autoswitch(bytes32 protocol)
        internal
        view
        returns (bytes32 networkName)
    {
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
}
