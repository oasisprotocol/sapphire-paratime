pragma solidity ^0.8.0;

contract Greeter {
    string public greeting;

    constructor() {
        greeting = 'Hello';
    }

    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }

    function greet() view public returns (string memory) {
        return greeting;
    }

    event Greeting(string g);

    function blah() external {
        emit Greeting(greeting);
    }

    function revertWithReason() external view {
        require(false, "reasonGoesHere");
    }

    error MyCustomError(string blah);

    function revertWithCustomError() external view {
        revert MyCustomError("thisIsCustom");
    }
}