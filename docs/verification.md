---
description: Verifying deployed contracts
---

# Contract Verification

[Sourcify] is the preferred service for the [verification of smart
contracts][ethereum-contract-verify] deployed on Sapphire. Make sure you have
the **address of each deployed contract** available (your deployment scripts
should report those) and the **contracts JSON metadata file** generated when
compiling contracts (Hardhat stores it inside the `artifacts/build-info` folder
and names it as a 32-digit hex number). If your project contains multiple
contracts, you will need to verify each contract separately.

:::warning Contract deployment encryption

**Do not deploy your contract with an encrypted contract deployment transaction,
if you want to verify it.** For example, if your `hardhat.config.ts`
or deployment script contains `import '@oasisprotocol/sapphire-hardhat'` or
`import '@oasisprotocol/sapphire-paratime'` lines at the beginning, you should
comment those out for the deployment.

Verification services will try to match the contract deployment transaction code
with the one in the provided contract's metadata and since the transaction was
encrypted with an ephemeral ParaTime key, the verification service will not be
able to decrypt it. Some services may extract the contract's bytecode from the
chain directly by calling `eth_getCode` RPC, but this will not work correctly
for contracts with immutable variables.

:::

To verify a contract deployed on Sapphire Mainnet or Testnet:

1. Visit the [Sourcify] website and hit the "VERIFY CONTRACT" button.

   ![Sourcify website](images/sourcify1.png)

2. Upload the contracts JSON metadata file.

   ![Sourcify: Upload metadata JSON file](images/sourcify2.png)

   :::tip Store your metadata files

   For production deployments, it is generally a good idea to **archive your
   contract metadata JSON file** since it is not only useful for the
   verification, but contains a copy of all the source files, produced bytecode,
   an ABI, compiler and other relevant contract-related settings that may be
   useful in the future. Sourcify will store the metadata file for you and will
   even make it available via IPFS, but it is still a good idea to store it
   yourself.

   :::

3. Sourcify will decode the metadata and prepare a list of included contracts on
   the right. Enter the address of the specific contract and select the "Oasis
   Sapphire" or "Oasis Sapphire Testnet" chain for Mainnet or Testnet
   accordingly. If your contract assigns any immutable variables in the
   constructor, you will also need to correctly fill those out under the "More
   Inputs (optional)" panel. Finally, click on the "Verify" button.

   ![Sourcify: Verify contract](images/sourcify3.png)

4. If everything goes well, you will get a *Perfect match* notice and your
   contract is now verified. Congratulations!

In case of a *Partial match*, the contracts metadata JSON differs from the one
used for deployment although the compiled contract bytecode matched. Make sure
the source code `.sol` file of the contract is the same as the one used during the
deployment (including the comments, variable names and source code file
names) and use the same version of Hardhat and solc compiler.

You can also explore other verification methods on Sourcify by reading the
[official Sourcify contract verification instructions][sourcify-contract-verify].

[Sourcify]: https://sourcify.dev/
[hardhat-example]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/hardhat
[sourcify-contract-verify]: https://docs.sourcify.dev/docs/how-to-verify/
[ethereum-contract-verify]: https://ethereum.org/en/developers/docs/smart-contracts/verifying/
