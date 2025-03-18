---
description: End-to-End Testing of Oasis Sapphire dApps
---

# End-to-End Testing

Many modern web applications utilize [Playwright] tests during the development
and release process to increase shipping speed and improve quality. While the
Web3 dApps ecosystem is still evolving, tools exist to do the same. We recommend
using [dAppwright] for dApps on the Sapphire Network. In this tutorial, we will
examine the e2e testing involved in the [demo-starter] project.

[Playwright]: https://playwright.dev/docs/intro
[dAppwright]: https://github.com/TenKeyLabs/dappwright
[demo-starter]: https://github.com/oasisprotocol/demo-starter

## dAppwright

The [dAppwright package] builds on Playwright and includes tooling to support
testing with a MetaMask or Coinbase wallet as an extension on a Chromium
browser.

[dAppwright package]: https://www.npmjs.com/package/@tenkeylabs/dappwright

## Installation

We need to install both `dAppwright` and `Playwright`. Navigate to your
frontend application directory:

1. Install dAppwright:

   ```shell npm2yarn
   npm install -D @tenkeylabs/dappwright
   ```

2. Install Playwright (we recommend the TypeScript option):

   ```shell npm2yarn
   npm init playwright@latest
   ```

3. A successful installation should allow the running of the example tests:

   ```shell
   npx playwright test
   ```

## Setup

We suggest starting a local dev server with each test run to consistently
iterate over the same state.

```typescript title="playwright.config.ts"
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // highlight-start
  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm dev',
    url: process.env.FRONTEND_URL || 'http://localhost:8080/',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  // highlight-end
});
```

## Adding Test Context

We begin with a test file extending the testing context to include dAppwright:

```typescript title="tests/e2e.spec.ts"
import { BrowserContext, expect, test as baseTest } from '@playwright/test'
import dappwright, { Dappwright, MetaMaskWallet } from '@tenkeylabs/dappwright'

export const test = baseTest.extend<{
  context: BrowserContext
  wallet: Dappwright
}>({
  context: async ({}, use) => {
    // Launch context with extension
    const [wallet, _, context] = await dappwright.bootstrap('', {
      wallet: 'metamask',
      version: MetaMaskWallet.recommendedVersion,
      seed: 'test test test test test test test test test test test junk', // Hardhat's default https://hardhat.org/hardhat-network/docs/reference#accounts
      headless: false,
    })

    // Add Sapphire Localnet as a custom network
    await wallet.addNetwork({
      networkName: 'Sapphire Localnet',
      rpc: 'http://localhost:8545',
      chainId: 23293,
      symbol: 'ROSE',
    })

    await use(context)
  },

  wallet: async ({ context }, use) => {
    const metamask = await dappwright.getWallet('metamask', context)

    await use(metamask)
  },
})
...
```

The above snippet includes the Sapphire [Localnet] as a network with the
correct RPC for testing, and sets up the default MetaMask wallet to use the
same [seed] as you would in a Hardhat test.

[seed]: https://hardhat.org/hardhat-network/docs/reference#accounts

## Writing a Test

Writing a test with dAppwright is very similar to how you would write a
Playwright one. The first step is to navigate to our application:

```typescript title="tests/e2e.spec.ts"
test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:5173')
})
```

Next, we can load the application and confirm using the Sapphire network in
Metamask. Note that **we will need to use `wallet.approve` to access the
MetaMask extension which waits for the MetaMask dom to reload.** Depending on
your use case, you may force your extension page to reload with
`wallet.page.reload()`.

```typescript title="tests/e2e.spec.ts"
test('set and view message', async ({ wallet, page }) => {
  // Load page
  await page.getByTestId('rk-connect-button').click()
  await page.getByTestId('rk-wallet-option-injected-sapphire').click()
  await wallet.approve()
})
```

Otherwise, we write selectors and assertions in the same way.

```typescript title="tests/e2e.spec.ts"
  // Set a message
  await page.locator(':text-matches("0x.{40}")').fill('hola amigos')
  const submitBtn = page.getByRole('button', { name: 'Set Message' })
  await submitBtn.click()
  await wallet.confirmTransaction()

  // Reveal the message
  await expect(submitBtn).toBeEnabled()
  await page.locator('[data-label="Tap to reveal"]').click()
  await wallet.confirmTransaction()

  // Assert message has been set
  await expect(page.locator('[data-label="Tap to reveal"]').locator('input')).toHaveValue('hola amigos')
```

You can make assertions in the same way on the wallet page, but
[wallet actions] will significantly simplify the amount of boilerplate testing
code.

```typescript
  await expect(wallet.page.getByText("My Account Name")).toBeVisible();
```

[wallet actions]: https://github.com/TenKeyLabs/dappwright/blob/d791017c51edc4e61e786504c154f9ad3db43ab6/src/wallets/wallet.ts#L27-L45

## Debugging

Playwright's UI mode is very beneficial to debugging your tests as you develop.
The pick locator button will help you refine element selectors while giving
visual feedback.

```sh
npx playwright test --ui
```

Alternatively, you can leverage the debug mode which allows you to set
breakpoints, pause testing, and examine network requests.

```sh
npx playwright test --debug
```

## CI

Running your dAppwright tests on CI environments like GitHub is possible with
the right configurations. You will need to install `playwright` itself as a
dependency before you can install Playwright's dependency packages, and
run a [headed] execution in Linux agents with `Xvfb`. We recommend uploading
test results on failure to more quickly move through CI cycles.

You will need a Sapphire [Localnet] service to provide an RPC endpoint during
testing.

```yaml
  playwright-test:
    runs-on: ubuntu-latest
    // highlight-start
    services:
      sapphire-localnet-ci:
        image: ghcr.io/oasisprotocol/sapphire-localnet:latest
        ports:
          - 8545:8545
          - 8546:8546
        env:
          OASIS_DOCKER_START_EXPLORER: no
        options: >-
          --rm
          --health-cmd="test -f /CONTAINER_READY"
          --health-start-period=90s
    // highlight-end
```

We recommend saving deployed smart contract addresses as environment variables
and [passing] `$GITHUB_OUTPUT` to a subsequent testing step.

```yaml
      - name: Deploy backend
        working-directory: backend
        id: deploy
        run: |
          echo "message_box_address=$(pnpm hardhat deploy localhost --network sapphire-localnet | grep -o '0x.*')" >> $GITHUB_OUTPUT
```

Finally, run the test and upload results on failure:

```yaml
      - name: Build
        working-directory: frontend
        run: pnpm build

      - name: Install Playwright dependencies
        run: pnpm test:setup
        working-directory: frontend

      - name: Run playwright tests (with xvfb-run to support headed extension test)
        working-directory: frontend
        run: xvfb-run pnpm test
        env:
          VITE_MESSAGE_BOX_ADDR: ${{ steps.deploy.outputs.message_box_address }}

      - name: Upload playwright test-results
        if: ${{ failure() }}
        uses: actions/upload-artifact@v4
        with:
          name: playwright-test-results
          path: frontend/test-results
          retention-days: 5
```

[headed]: https://playwright.dev/docs/ci#running-headed
[Localnet]: https://github.com/oasisprotocol/docs/blob/main/docs/build/tools/localnet.mdx
[passing]: https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/passing-information-between-jobs

:::info Example: demo-starter

If you are interested in seeing how dAppwright is integrated into an example
application, check out the [demo-starter].

:::

:::info Example: wagmi

If you are interested in seeing how dAppwright is integrated into a Sapphire
dApp with Wagmi, check out the [Wagmi example].

[Wagmi example]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2

:::
