// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "./Precompiles.sol";
import {Vm} from "forge-std/Vm.sol";
import {console} from "forge-std/console.sol";
import "./BinaryContracts.sol";

contract BinaryHandler is Precompiles {
    Vm constant vm = Vm(address(bytes20(uint160(uint256(keccak256("hevm cheat code"))))));
    RandomBytesPrecompile randomBytesPrecompile;
    X25519DerivePrecompile x25519DerivePrecompile;
    Curve25519ComputePublicPrecompile curve25519ComputePublicPrecompile;
    DeoxysiiSealPrecompile deoxysiiSealPrecompile;
    DeoxysiiOpenPrecompile deoxysiiOpenPrecompile;
    KeypairGeneratePrecompile keypairGeneratePrecompile;
    SignPrecompile signPrecompile;
    VerifyPrecompile verifyPrecompile;
    GasUsedPrecompile gasUsedPrecompile;
    PadGasPrecompile padGasPrecompile;
    SubcallPrecompile subcallPrecompile;
    CoreCalldataPublicKeyPrecompile coreCalldataPublicKeyPrecompile;
    CoreCurrentEpochPrecompile coreCurrentEpochPrecompile;
    RoflIsAuthorizedOriginPrecompile roflIsAuthorizedOriginPrecompile;
    DecodePrecompile decodePrecompile;

    constructor() {
        // Deploy typed contracts for each precompile
        vm.etch(RANDOM_BYTES, type(RandomBytesPrecompile).runtimeCode);
        vm.label(RANDOM_BYTES, "RANDOM_BYTES");

        vm.etch(X25519_DERIVE, type(X25519DerivePrecompile).runtimeCode);
        vm.label(X25519_DERIVE, "X25519_DERIVE");

        vm.etch(CURVE25519_COMPUTE_PUBLIC, type(Curve25519ComputePublicPrecompile).runtimeCode);
        vm.label(CURVE25519_COMPUTE_PUBLIC, "CURVE25519_COMPUTE_PUBLIC");

        vm.etch(DEOXYSII_SEAL, type(DeoxysiiSealPrecompile).runtimeCode);
        vm.label(DEOXYSII_SEAL, "DEOXYSII_SEAL");

        vm.etch(DEOXYSII_OPEN, type(DeoxysiiOpenPrecompile).runtimeCode);
        vm.label(DEOXYSII_OPEN, "DEOXYSII_OPEN");

        vm.etch(KEYPAIR_GENERATE, type(KeypairGeneratePrecompile).runtimeCode);
        vm.label(KEYPAIR_GENERATE, "KEYPAIR_GENERATE");

        vm.etch(SIGN, type(SignPrecompile).runtimeCode);
        vm.label(SIGN, "SIGN");

        vm.etch(VERIFY, type(VerifyPrecompile).runtimeCode);
        vm.label(VERIFY, "VERIFY");

        vm.etch(GAS_USED, type(GasUsedPrecompile).runtimeCode);
        vm.label(GAS_USED, "GAS_USED");

        vm.etch(PAD_GAS, type(PadGasPrecompile).runtimeCode);
        vm.label(PAD_GAS, "PAD_GAS");

        vm.etch(SUBCALL, type(SubcallPrecompile).runtimeCode);
        vm.label(SUBCALL, "SUBCALL");

        vm.etch(
            address(bytes20(keccak256(bytes(CORE_CALLDATAPUBLICKEY)))),
            type(CoreCalldataPublicKeyPrecompile).runtimeCode
        );
        vm.label(address(bytes20(keccak256(bytes(CORE_CALLDATAPUBLICKEY)))), "CORE_CALLDATAPUBLICKEY");

        vm.etch(address(bytes20(keccak256(bytes(CORE_CURRENT_EPOCH)))), type(CoreCurrentEpochPrecompile).runtimeCode);
        vm.label(address(bytes20(keccak256(bytes(CORE_CURRENT_EPOCH)))), "CORE_CURRENT_EPOCH");

        vm.etch(
            address(bytes20(keccak256(bytes(ROFL_IS_AUTHORIZED_ORIGIN)))),
            type(RoflIsAuthorizedOriginPrecompile).runtimeCode
        );
        vm.label(address(bytes20(keccak256(bytes(ROFL_IS_AUTHORIZED_ORIGIN)))), "ROFL_IS_AUTHORIZED_ORIGIN");

        vm.etch(
            DECODE, type(DecodePrecompile).runtimeCode
        );
        vm.label(DECODE, "DECODE");
    }
}
