import { test, expect } from './fixtures';
import { setupWallet, addNetwork, addAccount } from './metamask';

test.describe("MetaMask wallet connection", () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await setupWallet(page, extensionId);
    await addNetwork(page, extensionId);
    await addAccount(page, extensionId);
  });

  test('deploy contract test', async ({ page, context, extensionId }) => {
    await page.goto('http://localhost:5173/');
    await page.getByText("Injected (Sapphire)").click();

    let metaMaskPage = await context.newPage();
    await metaMaskPage.goto(`chrome-extension://${extensionId}/home.html`);
    await metaMaskPage.getByText("Next").click();
    await metaMaskPage.getByText("Confirm").click();

    await page.getByText("Deploy").click();
    await metaMaskPage.goto(`chrome-extension://${extensionId}/home.html`);
    await metaMaskPage.getByText("Confirm").click();
    expect(page.getByText("Contract:")).toBeVisible();
    
    await page.getByText("Write").click();
    await metaMaskPage.goto(`chrome-extension://${extensionId}/home.html`);
    await metaMaskPage.getByText("Confirm").click();
    expect(page.getByText("encrypted")).toBeVisible({ timeout: 10000 });

    await page.getByText("Read").click();
    expect(page.locator('#readResult')).toContainText("40367");
  });
});
