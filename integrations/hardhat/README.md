# @oasisprotocol/sapphire-hardhat

A plugin for Hardhat that wraps the provider connected to a Sapphire network.

## Usage

First install the plugin.

```
npm install -D @oasisprotocol/sapphire-hardhat
```

Next, import it in your Hardhat config above the rest of your plugins so that the provider gets wrapped before anything else starts to use it.

```js
// ESM
import '@oasisprotocol/sapphire-hardhat';

// CommonJS
require('@oasisprotocol/sapphire-hardhat');

/** All other plugins must go below this one! **/
```
