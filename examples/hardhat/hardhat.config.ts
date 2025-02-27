import { HardhatUserConfig, task } from "hardhat/config";
// #region config-import
import "@oasisprotocol/sapphire-hardhat";
// #endregion config-import
import "@nomicfoundation/hardhat-toolbox";

// Hardhat Node and sapphire-dev test key
const firstPrivateKey = `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`;
const accounts = process.env.PRIVATE_KEY
  ? [process.env.PRIVATE_KEY]
  : [firstPrivateKey];

// #region config-tasks
task("deploy").setAction(async (_args, hre) => {
  const Vigil = await hre.ethers.getContractFactory("Vigil");
  const vigil = await Vigil.deploy();
  const vigilAddr = await vigil.waitForDeployment();

  console.log(`Vigil address: ${vigilAddr.target}`);
  return vigilAddr.target;
});

task("create-secret")
  .addParam("address", "contract address")
  .setAction(async (args, hre) => {
    const vigil = await hre.ethers.getContractAt("Vigil", args.address);

    const tx = await vigil.createSecret(
      "ingredient",
      30 /* seconds */,
      Buffer.from("brussel sprouts"),
    );
    console.log("Storing a secret in", tx.hash);
  });

task("check-secret")
  .addParam("address", "contract address")
  .setAction(async (args, hre) => {
    const vigil = await hre.ethers.getContractAt("Vigil", args.address);

    try {
      console.log("Checking the secret");
      await vigil.revealSecret.staticCall(0);
      console.log("Uh oh. The secret was available!");
      process.exit(1);
    } catch (e: any) {
      console.log("failed to fetch secret:", e.message);
    }
    console.log("Waiting...");

    await new Promise((resolve) => setTimeout(resolve, 30_000));
    console.log("Checking the secret again");
    await (await vigil.revealSecret(0)).wait(); // Reveal the secret.
    const secret = await vigil.revealSecret.staticCallResult(0); // Get the value.
    console.log(
      "The secret ingredient is",
      Buffer.from(secret[0].slice(2), "hex").toString(),
    );
  });

task("full-vigil").setAction(async (_args, hre) => {
  await hre.run("compile");

  const address = await hre.run("deploy");

  await hre.run("create-secret", { address });
  await hre.run("check-secret", { address });
});
// #endregion config-tasks

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    sapphire: {
      url: "https://sapphire.oasis.io",
      chainId: 0x5afe,
      accounts,
    },
    // #region config-networks
    "sapphire-testnet": {
      url: "https://testnet.sapphire.oasis.io",
      accounts,
      chainId: 0x5aff,
    },
    // #endregion config-networks
    "sapphire-localnet": {
      // docker run -it -p8544-8548:8544-8548 ghcr.io/oasisprotocol/sapphire-localnet
      url: "http://localhost:8545",
      chainId: 0x5afd,
      accounts,
    },
  },
};

export default config;
