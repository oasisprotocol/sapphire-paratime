pragma solidity >=0.4.21;
    
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ConfidentialToken is ERC20 {

    constructor() ERC20("ConfidentialToken", "CGT") {
        _mint(msg.sender, 100000);
    }

    function mint() external {
        _mint(msg.sender, 100000);
    }
}

