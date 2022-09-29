import * as sapphire from '@oasisprotocol/sapphire-paratime';
import { ethers } from 'ethers';
import express from 'express';

const app = express();
app.use(express.json());

const provider = sapphire.wrap(new ethers.providers.JsonRpcBatchProvider(process.env.RPC));

app.post('/', async (req, res) => {
  if (req.body.jsonrpc !== '2.0') {
    res.status(405).end();
    return;
  }

  let result;
  let { id, method, params } = req.body;
  if (method === 'eth_call') {
    const { gas, ...txCall } = params[0];
    result = await provider.call({ from: ethers.constants.AddressZero, ...txCall }, params[1]);
  } else {
    result = await provider.send(method, params);
  }

  res.status(200).json({ id, jsonrpc: '2.0', result }).end();
});

app.listen(8080);
