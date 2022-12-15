// This is a script for deploying your contracts. You can adapt it to deploy
// yours, or create new ones.

const path = require("path");

async function main() {
  // This is just a convenience check
  if (network.name === "hardhat") {
    console.warn(
      "You are trying to deploy a contract to the Hardhat Network, which" +
        "gets automatically created and destroyed every time. Use the Hardhat" +
        " option '--network localhost'"
    );
  }

  // ethers is available in the global scope
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying the contracts with the account:",
    await deployer.getAddress()
  );

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const Favorite = await ethers.getContractFactory("Favorite");
  const Test = await ethers.getContractFactory("Test");
//  const favorite = await Favorite.deploy();
//  await favorite.deployed();
  const test = await Test.deploy();
  await test.deployed();

//  console.log("Favorite number contract address:", favorite.address);
  console.log("Test contract address:", test.address);
 
  // try some tests
/*  const num1 = await favorite.favoriteNumber();
  console.log("First favorite number:", num1);
  const num2 = await favorite.favoriteNumber();
  console.log("Second favorite number:", num2);
  
  if (!num1.eq(num2)) {
    console.log("Congratulations! Random number generator works perfectly!");
  } else {
    console.log("Oops, something went wrong: Random generator returned equal numbers.");
  }*/
  await test.test();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
