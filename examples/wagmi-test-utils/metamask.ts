import type { AddNetwork, MetaMaskWallet } from "@tenkeylabs/dappwright";

export async function addCustomNetwork(
	wallet: MetaMaskWallet,
	network: AddNetwork,
) {
	const { page } = wallet;

	await page.bringToFront();
	await page
		.getByTestId("sort-by-networks")
		.waitFor({ state: "visible", timeout: 30_000 });
	await page.getByTestId("sort-by-networks").click();
	await page.getByRole("tab", { name: "Custom" }).click();
	await page.getByRole("button", { name: "Add custom network" }).click();

	await page.getByTestId("network-form-network-name").fill(network.networkName);
	await page.getByTestId("test-add-rpc-drop-down").click();
	await page.getByRole("button", { name: "Add RPC URL" }).click();
	await page.getByTestId("rpc-url-input-test").fill(network.rpc);
	await page.getByRole("button", { name: "Add URL" }).click();
	await page.getByTestId("network-form-chain-id").fill(String(network.chainId));
	await page.getByTestId("network-form-ticker-input").fill(network.symbol);

	const errorMessage = await page
		.locator(".mm-help-text.mm-box--color-error-default")
		.textContent({ timeout: 5000 })
		.catch(() => undefined);
	if (errorMessage) {
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Close" })
			.click();
		throw new Error(errorMessage);
	}

	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.getByTestId("modal-header-close-button").click();
	await page
		.getByRole("button", { name: "Got it" })
		.click({ timeout: 3000 })
		.catch(() => {});
	await page
		.getByTestId("sort-by-networks")
		.filter({ hasText: network.networkName })
		.waitFor({ state: "visible", timeout: 30_000 });
}
