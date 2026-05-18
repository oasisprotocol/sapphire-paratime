import { BrowserContext, expect, test as base } from "@playwright/test";
import dappwright, { Dappwright, MetaMaskWallet } from "@tenkeylabs/dappwright";
import { addCustomNetwork } from "../../wagmi-test-utils/metamask";

base.describe.configure({ mode: "serial" });

const TX_TIMEOUT = 30_000;
const HARDHAT_RPC_URL = process.env.VITE_HARDHAT_RPC_URL ?? "http://localhost:9545";

export const test = base.extend<
    { wallet: Dappwright },
    { walletContext: BrowserContext }
>({
    walletContext: [
        // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures must use object destructuring.
        async ({}, use) => {
            // Launch context with extension
            const [wallet, _app, context] = await dappwright.bootstrap("", {
                wallet: "metamask",
                version: MetaMaskWallet.recommendedVersion,
                seed: "test test test test test test test test test test test junk", // Hardhat's default https://hardhat.org/hardhat-network/docs/reference#accounts
                headless: !!process.env.CI,
            });

            // MetaMask selects newly added custom networks. Add Sapphire last so tests start there.
            await addCustomNetwork(wallet, {
                networkName: "Hardhat Localnet",
                rpc: HARDHAT_RPC_URL,
                chainId: 31337,
                symbol: "ETH",
            });

            await addCustomNetwork(wallet, {
                networkName: "Sapphire Localnet",
                rpc: "http://localhost:8545",
                chainId: 23293,
                symbol: "ROSE",
            });

            await use(context);
            await context.close();
        },
        { scope: "worker" },
    ],
    context: async ({ walletContext }, use) => {
        await use(walletContext);
    },
    wallet: async ({ walletContext }, use) => {
        const wallet = await dappwright.getWallet("metamask", walletContext);
        await use(wallet);
    },
});

[
    {
        url: "/#/wagmi",
        rdns: "metamask-sapphire",
        network: "23293",
        encrypted: true,
    },
    {
        url: "/#/wagmi-injected",
        rdns: "injected-sapphire",
        network: "23293",
        encrypted: true,
    },
    {
        url: "/#/wagmi-multichain",
        rdns: "metamask-sapphire",
        network: "23293",
        encrypted: true,
    },
    {
        url: "/#/wagmi-multichain?plain",
        rdns: "metamask-sapphire",
        network: "31337",
        encrypted: false,
    },
    // RainbowKit route removed - @rainbow-me/rainbowkit is not yet compatible with wagmi 3.x
].forEach(({ url, rdns, network, encrypted }) => {
    test.describe(() => {
        test(`deploy contract and send encrypted transaction ${url}`, async ({
            wallet,
            page,
            context,
        }) => {
            await page.goto(url);
            await page.waitForLoadState("domcontentloaded");

            await page.evaluate(() => {
                localStorage.clear();
                sessionStorage.clear();
            });

            // Check if wallet is already connected and disconnect if needed
            try {
                const disconnectButton = page.getByRole("button", {
                    name: "Disconnect",
                });
                const isVisible = await disconnectButton.isVisible({ timeout: 5000 });

                if (isVisible) {
                    await disconnectButton.click();
                    await expect(disconnectButton).not.toBeVisible({ timeout: 10000 });
                    await page.waitForTimeout(1000);
                }
            } catch { }

            // Store the URL in case we need to navigate back after confirmation
            const appUrl = page.url();

            await page.getByTestId(rdns).click();

            // If the wallet is already connected from a previous test, approval might be optional.
            try {
                await expect(
                    page.getByText("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
                ).toBeVisible({ timeout: 3000 });
            } catch {
                // If not visible, we assume we need to approve the connection.
                await wallet.approve();
            }

            await expect(
                page.getByText("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
            ).toBeVisible();

            const networkSelect = page.locator("#network-select");
            const chainIdText = page.getByText(new RegExp(`Chain ID:\\s*${network}\\b`));
            let switchedNetwork = false;
            if ((await networkSelect.inputValue()) !== network) {
                await networkSelect.selectOption(network);
                switchedNetwork = true;
            }

            if (switchedNetwork) {
                // MetaMask may or may not show a network switch approval prompt.
                // Confirm only when the sidepanel prompt is actually visible.
                const switchedInDapp = await chainIdText
                    .isVisible({ timeout: 5000 })
                    .catch(() => false);
                if (!switchedInDapp) {
                    const sidepanel = context
                        .pages()
                        .find((p) => p.url().includes("sidepanel.html"));
                    const hasSwitchPrompt = sidepanel
                        ? await sidepanel
                            .getByTestId("page-container-footer-next")
                            .isVisible({ timeout: 3000 })
                            .catch(() => false)
                        : false;
                    if (hasSwitchPrompt) {
                        await wallet.confirmNetworkSwitch();
                    }
                }
                await expect(networkSelect).toHaveValue(network);
                await expect(chainIdText).toBeVisible({ timeout: 15_000 });
            }

            // Let network switch settle
            await page.waitForTimeout(1000);

            await page.getByRole("button", { name: "Deploy Contract" }).click();
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

            await expect(page.getByText("Contract Address:")).toBeVisible({
                timeout: TX_TIMEOUT,
            });

            await page.getByRole("button", { name: "Write to Contract" }).click();
            await wallet.confirmTransaction();

            // Check again if page is still available
            try {
                await page.evaluate(() => document.title);
            } catch (e) {
                page = await context.newPage();
                await page.goto(appUrl);
            }

            await expect(page.getByText("Contract Address:")).toBeVisible({
                timeout: TX_TIMEOUT,
            });

            if (encrypted) {
                await expect(page.getByTestId("is-write-enveloped")).toHaveText(
                    "encrypted",
                    { timeout: TX_TIMEOUT },
                );
            } else {
                await expect(page.getByTestId("is-write-enveloped")).toHaveText(
                    "plaintext",
                    { timeout: TX_TIMEOUT },
                );
            }

            await page.getByRole("button", { name: "Read from Contract" }).click();

            await expect(page.getByTestId("read-result")).not.toBeEmpty({
                timeout: TX_TIMEOUT,
            });
        });
    });
});
