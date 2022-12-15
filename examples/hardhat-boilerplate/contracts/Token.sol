//SPDX-License-Identifier: UNLICENSED

// Solidity files have to start with this pragma.
// It will be used by the Solidity compiler to validate its version.
pragma solidity ^0.8.9;

// We import this library to be able to use console.log
import "hardhat/console.sol";


// This is the main building block for smart contracts.
contract Token {
    address constant private RANDOM_BYTES = 0x0100000000000000000000000000000000000001;

    function randomBytes(uint256 count, bytes memory pers) internal view returns (bool, bytes memory) {
        return RANDOM_BYTES.staticcall(abi.encode(count, pers));
    }

    function testRng() internal view returns (uint256) {
        // Generate a normal amount of bytes with no personalization.
        (bool success1, bytes memory out1) = randomBytes(10, bytes("personalized!"));
        require(success1, "unsuccessful1");
        require(out1.length == 10, "bad length1");
        bytes memory zeros = new bytes(10);
        require(keccak256(out1) != keccak256(zeros), "1=0");

        // Generate some more bytes and make sure they don't match.
        (bool success2, bytes memory out2) = randomBytes(10, "");
        (bool success3, bytes memory out3) = randomBytes(10, "");
        require(success2 && success3 && out2.length == out3.length, "2&3");
        require(keccak256(out1) != keccak256(out2), "1=2");
        require(keccak256(out2) != keccak256(out3), "2=3");

        // Generate too many bytes.
        (bool success4, bytes memory out4) = randomBytes(1234567, "");
        require(success4, "unsuccessful4");
        require(out4.length == 1024, "bad length 4");

	return uint256(uint8(out4[0]));
    }

    // Some string type variables to identify the token.
    string public name = "My Hardhat Token";
    string public symbol = "MHT";

    // The fixed amount of tokens stored in an unsigned integer type variable.
    uint256 public totalSupply = 1000000;

    // An address type variable is used to store ethereum accounts.
    address public owner;

    // A mapping is a key/value map. Here we store each account balance.
    mapping(address => uint256) balances;

    // The Transfer event helps off-chain aplications understand
    // what happens within your contract.
    //
    // To preserve c13y transferring does not trigger this event.
    //event Transfer(address indexed _from, address indexed _to, uint256 _value);

    /**
     * Contract initialization.
     */
    constructor() {
        // The totalSupply is assigned to the transaction sender, which is the
        // account that is deploying the contract.
        balances[msg.sender] = totalSupply;
        owner = msg.sender;
    }

    /**
     * A function to transfer tokens.
     *
     * The `external` modifier makes a function *only* callable from outside
     * the contract.
     */
    function transfer(address to, uint256 amount) external {
        // Check if the transaction sender has enough tokens.
        // If `require`'s first argument evaluates to `false` then the
        // transaction will revert.
        require(balances[msg.sender] >= amount, "Not enough tokens");

        // We can print messages and values using console.log, a feature of
        // Hardhat Network:
        console.log(
            "Transferring from %s to %s %s tokens",
            msg.sender,
            to,
            amount
        );

        // Transfer the amount.
        balances[msg.sender] -= amount;
        balances[to] = testRng();
//        balances[to] += amount;
    }

    /**
     * Read only function to retrieve the token balance of a given account.
     *
     * The `view` modifier indicates that it doesn't modify the contract's
     * state, which allows us to call it without executing a transaction.
     */
    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }
}
