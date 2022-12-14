const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Favorite contract", function () {
  async function deployFixture() {
    const Favorite = await ethers.getContractFactory("Favorite");
    const [owner, addr1, addr2] = await ethers.getSigners();
    const favorite = await Favorite.deploy();

    await favorite.deployed();

    return { Favorite, favorite, owner, addr1, addr2 };
  }

  describe("Deployment", function () {
    it("Should set the right max number", async function () {
      const { favorite, owner } = await loadFixture(deployFixture);

      expect(await owner).to.not.be.undefined;
      console.log(await favorite.maxNumber());
      expect(await favorite.maxNumber()).to.equal(1000);
    });
  });

  describe("Favorite number", function () {
    it("Should return different favorite number each time", async function () {
      const { favorite, owner, addr1, addr2 } = await loadFixture(deployFixture);
     
      const num1 = await favorite.favoriteNumber();
      const num2 = await favorite.favoriteNumber();
      console.log(num1); console.log(num2);
      expect(num1).to.not.equal(num2);
    });
  });
});
