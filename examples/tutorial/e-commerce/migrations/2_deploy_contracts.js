const ConfidentialToken = artifacts.require("ConfidentialToken")
const ItemPurchaseShop = artifacts.require("ItemPurchaseShop")

module.exports = async function(deployer) {
    await deployer.deploy(ConfidentialToken, { gas: 4700000 });
    await deployer.deploy(ItemPurchaseShop, ConfidentialToken.address, { gas: 4700000 });
    const tokenAddress = ConfidentialToken.address;
    console.log("token address:", tokenAddress);
    console.log("game address:", ItemPurchaseShop.address);
}
