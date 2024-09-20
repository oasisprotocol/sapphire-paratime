// SPDX-License-Identifier: CC-PDDC

pragma solidity ^0.8.0;

contract Greeter {
    string public greeting;

    constructor() {
        greeting = 'Hello';
        owner = msg.sender;
    }

    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }

    function greet() view public returns (string memory) {
        return greeting;
    }

    function greetOnlyOwner() view public returns (string memory) {
        require(msg.sender == owner, "Only owner can call this function");
        return greeting;
    }

    event Greeting(string g);

    function blah() external {
        emit Greeting(greeting);
    }

    function revertWithReason() external pure {
        require(false, "reasonGoesHere");
    }

    error MyCustomError(string blah);

    function revertWithCustomError() external pure {
        revert MyCustomError("thisIsCustom");
    }
}
