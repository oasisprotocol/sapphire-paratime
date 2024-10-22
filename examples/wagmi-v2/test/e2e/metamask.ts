import { Page } from "@playwright/test";

export const metaMaskWallet = {
  privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  password: 'qwre1242',
  passphrase: [
    'potato',
    'burger',
    'strategy',
    'catalog',
    'dilemma',
    'oxygen',
    'gaze',
    'hazard',
    'popular',
    'asset',
    'miss',
    'collect',
  ],
};

export async function setupWallet(page: Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/home.html`);
  await page.getByRole('checkbox', { name: "I agree to MetaMask's Terms of use" }).click();
  await page.getByRole('button', { name: "Import an existing wallet" }).click();
  await page.getByRole('button', { name: "No thanks" }).click();
  for (let i = 0; i < metaMaskWallet.passphrase.length; i++) {
    await page.getByLabel(`${i + 1}.`, { exact: true }).fill(metaMaskWallet.passphrase[i]);
  }
  await page.getByRole('button', { name: "Confirm Secret Recovery Phrase" }).click();
  await page.locator('input[data-testid="create-password-new"]').fill(metaMaskWallet.password);
  await page.locator('input[data-testid="create-password-confirm"]').fill(metaMaskWallet.password);
  await page.getByRole('checkbox', { name: "I understand that MetaMask cannot recover this password for me." }).click();
  await page.getByRole('button', { name: "Import my wallet" }).click();
  await page.getByRole('button', { name: "Got it" }).click();
  await page.getByRole('button', { name: "Next" }).click();
  await page.getByRole('button', { name: "Done" }).click();
}

export async function addNetwork(page: Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/home.html`);
  await page.getByText("Ethereum Mainnet").click();
  await page.getByText("Add network").click();
  await page.getByText("Add a network manually", { exact: true }).click();
  await page.locator('input[data-testid="network-form-network-name"]').fill("Sapphire Localnet");
  await page.locator('input[data-testid="network-form-rpc-url"]').fill("http://localhost:8545");
  await page.locator('input[data-testid="network-form-chain-id"]').fill("23293");
  await page.locator('input[data-testid="network-form-ticker-input"]').fill("ROSE");
  await page.getByText("Save").click();
  await page.getByText("Switch to Sapphire Localnet").click();
}

export async function addAccount(page: Page, extensionId: string, privateKey?: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/home.html`);
  await page.getByText("Account 1").click();
  await page.getByText("Add account or hardware wallet").click();
  await page.getByText("Import account").click();
  await page.getByLabel('Enter your private key string here:').fill(privateKey || metaMaskWallet.privateKey);
  await page.keyboard.press('Enter');
}