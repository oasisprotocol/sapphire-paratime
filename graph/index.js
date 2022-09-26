const express = require('express');
const bodyParser = require('body-parser');
const ethers = require('ethers');
const sapphire = require('@oasisprotocol/sapphire-paratime');

const app = express();
app.use(bodyParser.json());

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC);
const signer = ethers.Wallet.createRandom().connect(provider);
const client = sapphire.wrap(signer);

app.post('/', async (req, res) => {
    if (req.body.jsonrpc !== '2.0') {
        res.status(405).end();
        return;
    }

    let result;
    let { id, method, params } = req.body;
    if (method === 'eth_call') {
        delete params[0]['gas'];
        result = await client.call(...params);
    } else {
        result = await provider.send(method, params);
    }
    
    res.status(200)
        .json({ id, jsonrpc: "2.0", result });
        .end();
})

app.listen(8080);