import { BrowserContext, expect, test as baseTest } from "@playwright/test";
import dappwright, { Dappwright, MetaMaskWallet } from "@tenkeylabs/dappwright";

export const test = baseTest.extend<{
	context: BrowserContext;
	wallet: Dappwright;
}>({
	context: async ({}, use) => {
		// Launch context with extension
		const [wallet, _, context] = await dappwright.bootstrap("", {
			wallet: "metamask",
			version: MetaMaskWallet.recommendedVersion,
			seed: "test test test test test test test test test test test junk", // Hardhat's default https://hardhat.org/hardhat-network/docs/reference#accounts
			headless: false,
		});

		// Add Sapphire Localnet as a custom network
		await wallet.addNetwork({
			networkName: "Sapphire Localnet",
			rpc: "http://localhost:8545",
			chainId: 23293,
			symbol: "ROSE",
		});

		await use(context);
	},

	wallet: async ({ context }, use) => {
		const metamask = await dappwright.getWallet("metamask", context);
		await use(metamask);
	},
});

test.beforeEach(async ({ wallet, page }) => {
	// Use first account from seed. dAppwright adds two accounts by default.
	// Changed from numeric index to name as per PR #440
	await wallet.switchAccount("batman");
	
	await page.bringToFront();
});

test("deploy contract and send encrypted transaction", async ({
	wallet,
	page,
	context
}) => {
	await page.goto("http://localhost:3000");
	
	// Store the URL in case we need to navigate back after confirmation
	const appUrl = page.url();

	// Use address of first account
	await page.getByTestId("io.metamask").click();
	await wallet.approve();

	await expect(
		page.getByText("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
	).toBeVisible();

	await page.getByText("Deploy").click();
	await wallet.confirmTransaction();
	
	// Check if page is still available after confirmation
	let pageIsClosed = false;
	try {
		await page.evaluate(() => document.title);
	} catch (e) {
		pageIsClosed = true;
	}
	
	// If the page is closed, create a new one and navigate back
	if (pageIsClosed) {
		page = await context.newPage();
		await page.goto(appUrl);
	}
	
	await expect(page.getByText("Contract:")).toBeVisible();

	await page.getByText("Write").click();
	await wallet.confirmTransaction();
	
	// Check again if page is still available
	try {
		await page.evaluate(() => document.title);
	} catch (e) {
		page = await context.newPage();
		await page.goto(appUrl);
	}
	
	await expect(page.getByText("Contract:")).toBeVisible();
	await expect(page.getByTestId("is-write-enveloped")).toHaveText("encrypted");

	await page.getByText("Read").click();
	
	await expect(page.getByTestId("read-result")).not.toBeEmpty();
});
