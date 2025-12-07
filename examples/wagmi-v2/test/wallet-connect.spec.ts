import { expect, test } from "@playwright/test";

test.describe("WalletConnect", () => {
	test("should have no error when selecting WalletConnect in RainbowKit modal", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
      if (msg.type() === "error") {
        const errorText = msg.text();
        // Ignore favicon 404 errors
        if (!errorText.includes("Failed to load resource: the server responded with a status of 404 (Not Found)")) {
          console.log("Console Error:", errorText);
          errors.push(errorText);
        }
      }
		});
		page.on("pageerror", (err) => {
			console.log("Page Error:", err.message);
			errors.push(err.message);
		});

		await page.goto("/#/rainbowkit");
		await page.waitForLoadState("domcontentloaded");

		const connectButton = page.getByTestId("rk-connect-button");
		await expect(connectButton).toBeVisible();
		await connectButton.click();

		const walletConnectOption = page.getByTestId(
			"rk-wallet-option-walletConnect-sapphire-rk",
		);
		await expect(walletConnectOption).toBeVisible();
		await walletConnectOption.click();

		expect(errors.length).toBe(0);
	});
});
