import { createRequire } from "node:module";
import path from "node:path";

const requireFromCwd = createRequire(path.join(process.cwd(), "package.json"));
const { MetaMaskWallet } = requireFromCwd("@tenkeylabs/dappwright");

const version =
	process.env.DAPPWRIGHT_METAMASK_VERSION || MetaMaskWallet.recommendedVersion;

// dappwright only performs the download on the primary worker.
process.env.TEST_PARALLEL_INDEX ??= "0";

console.log(`Pre-warming MetaMask ${version} for dappwright...`);
await MetaMaskWallet.download({ version });
console.log(`MetaMask ${version} is ready.`);
