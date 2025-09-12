import { BrowserContext, expect, test as baseTest } from "@playwright/test";
import dappwright, { Dappwright, MetaMaskWallet } from "@tenkeylabs/dappwright";

baseTest.describe.configure({ mode: "serial" });

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

    await wallet.switchNetwork("Sapphire Localnet");

		await use(context);
	},

	wallet: async ({ context }, use) => {
		const metamask = await dappwright.getWallet("metamask", context);
		await use(metamask);
	},
});

[
  { url: "/#/wagmi", rdns: "metamask-sapphire" },
  { url: "/#/wagmi-injected", rdns: "injected-sapphire" },
  { url: "/#/wagmi-multichain", rdns: "metamask-sapphire" },
  { url: "/#/rainbowkit", rdns: "metamask-sapphire-rk" },
].forEach(({ url, rdns }) => {
	test.describe(() => {
		test(`deploy contract and send encrypted transaction ${url}`, async ({
			wallet,
			page,
			context,
		}) => {
			await page.goto(url);
      await page.waitForLoadState('domcontentloaded');

      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Check if wallet is already connected and disconnect if needed
      try {
        const disconnectButton = page.getByRole('button', { name: 'Disconnect' });
        const isVisible = await disconnectButton.isVisible({ timeout: 5000 });

        if (isVisible) {
          await disconnectButton.click();
          await expect(disconnectButton).not.toBeVisible({ timeout: 10000 });
          await page.waitForTimeout(1000);
        }
      } catch {}

      // Store the URL in case we need to navigate back after confirmation
			const appUrl = page.url();

			await page.getByTestId(rdns).click();
			await wallet.approve();

			await expect(
				page.getByText("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
			).toBeVisible();

      // TODO: Bug in multichain, where double click on metamask-sapphire is necessary to get the wallet to connect
      await page.getByTestId(rdns).click();

      const networkSelect = page.locator('#network-select');
      await networkSelect.selectOption('23293');

      // Let network switch settle
      await page.waitForTimeout(1000);

			await page.getByRole('button', { name: 'Deploy Contract' }).click();
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

			await expect(page.getByText("Contract Address:")).toBeVisible();

			await page.getByRole('button', { name: 'Write to Contract' }).click();
			await wallet.confirmTransaction();

			// Check again if page is still available
			try {
				await page.evaluate(() => document.title);
			} catch (e) {
				page = await context.newPage();
				await page.goto(appUrl);
			}

			await expect(page.getByText("Contract Address:")).toBeVisible();
			await expect(page.getByTestId("is-write-enveloped")).toHaveText(
				"encrypted",
			);

			await page.getByRole('button', { name: 'Read from Contract' }).click();

			await expect(page.getByTestId("read-result")).not.toBeEmpty();
		});
	});
});
