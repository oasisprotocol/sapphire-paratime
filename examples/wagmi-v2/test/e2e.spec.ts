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
  await wallet.switchAccount(1); // Selector queries as a string
  await page.bringToFront();
});

test("deploy contract and send encrypted transaction", async ({ wallet, page }) => {
  await page.goto("http://localhost:3000");

  // Use address of first account
  await page.getByText("Injected (Sapphire)").click();
  await wallet.approve();
  await expect(page.getByText("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBeVisible();

  await page.getByText("Deploy").click();
  await wallet.confirmTransaction();
  await expect(page.getByText("Contract:")).toBeVisible();

  await page.getByText("Write").click();
  await wallet.confirmTransaction();
  await expect(page.getByText("Contract:")).toBeVisible();
  await expect(page.getByTestId('is-write-enveloped')).toHaveText('encrypted');

  await page.getByText("Read").click();
  await expect(page.getByTestId("read-result")).not.toBeEmpty();
});
