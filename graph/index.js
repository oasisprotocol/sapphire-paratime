const express = require('express');
const bodyParser = require('body-parser');
const ethers = require('ethers');
const sapphire = require('@oasisprotocol/sapphire-paratime');

const app = express();
app.use(bodyParser.json());

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC);
const signer = new ethers.Wallet(Buffer.from(ethers.utils.randomBytes(32)).toString('hex'), provider);
const client = sapphire.wrap(signer);

app.post('/', async (req, res) => {
    if (req.body.jsonrpc !== '2.0') {
        res.status(405).end();
        return;
    }

    let payload;
    if (req.body.method === 'eth_call') {
        delete req.body.params[0]['gas'];
        payload = await client.call(req.body.params[0], req.body.params[1]);
    } else {
        payload = await provider.send(req.body.method, req.body.params);
    }
    
    res.status(200);
    res.json({ id: req.body.id, jsonrpc: "2.0", result: payload });
    res.end();
})

app.listen(8080);