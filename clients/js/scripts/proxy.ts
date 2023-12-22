///<reference path="../node_modules/@types/node/index.d.ts"/>

import {createServer, IncomingMessage, ServerResponse} from 'node:http'

import { decodeRlp, getBytes } from 'ethers';

import * as cborg from 'cborg';

import fetch from 'node-fetch';
import { assert } from 'console';

async function getBody(request:IncomingMessage) : Promise<string> {
  return new Promise((resolve) => {
    const bodyParts: Uint8Array[] = [];
    let body : string;
    request.on('data', (chunk) => {
      bodyParts.push(chunk);
    }).on('end', () => {
      body = Buffer.concat(bodyParts).toString();
      resolve(body)
    });
  });
}

createServer(onRequest).listen(3000);

interface JSONRPCRequest {
  jsonrpc: string;
  method: string;
  params: any[];
  id: number;
}

async function onRequest(req:IncomingMessage, response:ServerResponse) {
  if( req.method != 'POST' ) {
    response.writeHead(500, 'Not POST!');
    response.end();
    return;
  }

  const inputBody = JSON.parse(await getBody(req)) as JSONRPCRequest;
  const encryptableMethods = ['eth_estimateGas', 'eth_call', 'eth_sendRawTransaction'];
  const loggedMethods = encryptableMethods.concat(['oasis_callDataPublicKey']);

  let bodies: JSONRPCRequest[];
  if( Array.isArray(inputBody) ) {
    bodies = inputBody;
  }
  else {
    bodies = [inputBody];
  }

  for( const body of bodies )
  {
    const log = loggedMethods.includes(body.method);

    if( log ) {
      if( body.method == 'oasis_callDataPublicKey' ) {
        console.log(req.method, req.url, body.method);
      }
      else if( body.method == 'eth_estimateGas' || body.method == 'eth_call' ) {
        try {
          const x = getBytes(body.params[0].data);
          const y = cborg.decode(x);
          // Verify envelope format == 1 (encrypted)
          if( 'data' in y ) {
            // EIP-712 signed queries are wrapped as follows:
            // {data: {body{pk:,data:,nonce:},format:},leash:{nonce:,block_hash:,block_range:,block_number:},signature:}
            assert(y.data.format == 1);
          }
          else {
            assert(y.format == 1);
          }
          console.log('ENCRYPTED', req.method, req.url, body.method);
        }
        catch( e:any ) {
          console.log('NOT ENCRYPTED', req.method, req.url, body.method);
        }
      }
      else if( body.method == 'eth_sendRawTransaction' ) {
        try {
          const x = getBytes(body.params[0]);
          const y = decodeRlp(x) as string[];  //console.log(pj);
          const z = cborg.decode(getBytes(y[5]));
          assert(z.format == 1);  // Verify envelope format == 1 (encrypted)
          console.log('ENCRYPTED', req.method, req.url, body.method);
        }
        catch( e:any ) {
          console.log('NOT ENCRYPTED', req.method, req.url, body.method, body.params);
        }
      }
    }
  }

  const pr = await fetch('http://127.0.0.1:8545/', {
    method: 'POST',
    body: JSON.stringify(inputBody),
    headers: {'Content-Type': 'application/json'}
  })

  const pj = await pr.json();

  response.writeHead(200, 'OK');
  response.write(JSON.stringify(pj));
  response.end();
}