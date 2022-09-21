pragma solidity >=0.4.21;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ItemPurchaseShop {
    struct PurchasedItem {
	uint item_id;
	uint price_paid;
    }
    address private _owner;
    IERC20 private _acceptedToken;
    mapping(address => PurchasedItem[]) orders;
    mapping(address => uint) numOfOrders;

    event Purchase(address _from, uint _item_id, uint _amount);
    event TokenSet(IERC20 _token);


    constructor(IERC20 acceptedToken) {
    	_owner = msg.sender;
        _acceptedToken = acceptedToken;
        emit TokenSet(acceptedToken);
    }

    function getAcceptedToken() view public returns (IERC20) {
        return _acceptedToken;
    }

    function getTotalNumOfOrders(address user) view public returns (uint) {
        require(msg.sender == _owner, "Only owner can access this information");
	    return numOfOrders[user];
    }

    function getPurchaseItemAtIndex(address user, uint index) view public returns (uint) {
        require(msg.sender == _owner, "Only owner can access this information");
    	require(index <= orders[user].length, "the user does not have this number of orders");
	    return orders[user][index - 1].item_id;
    }
    
    function purchase(uint item_id, IERC20 token, uint amount) public {
        require(token == _acceptedToken, "illegal payment token");
    	token.transferFrom(msg.sender, address(this), amount);
    	orders[msg.sender].push(PurchasedItem(item_id, amount));
    	numOfOrders[msg.sender] = orders[msg.sender].length;
        emit Purchase(msg.sender, item_id, amount);
    }    
}
