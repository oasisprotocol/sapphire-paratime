import { createServer, IncomingMessage, ServerResponse } from 'node:http';

import { formatEther, toBigInt, Transaction } from 'ethers';

import {
  Envelope,
  EnvelopeError,
  getBytes,
} from '@oasisprotocol/sapphire-paratime';

import { decode as cborgDecode } from 'cborg';

// Environment var can change listen port
// This will also change listen port in client via sapphire-paratime NETWORKS
const LISTEN_PORT = process.env.SAPPHIRE_LOCALNET_HTTP_PROXY_PORT
  ? Number(process.env.SAPPHIRE_LOCALNET_HTTP_PROXY_PORT)
  : 3001;

const LOG_ALL_METHODS = true;
const DIE_ON_UNENCRYPTED = true;
const ALLOW_UNENCRYPTED_DEPLOYS = true;
const UPSTREAM_URL = 'http://127.0.0.1:8545';
const SHOW_ENCRYPTED_RESULTS = false;
const SHOW_ENCRYPTED_REQUESTS = false;

// These are the first 4 'test' accounts
// It's assumed that all tests from these addresses require transaction encryption
// This is to verify that the client encryption wrapper is working correctly.
const DISALLOW_UNENCRYPTED_ONLY_FROM = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
];

console.log('LOG_ALL_METHODS', LOG_ALL_METHODS);
console.log('DIE_ON_UNENCRYPTED', DIE_ON_UNENCRYPTED);
console.log('UPSTREAM_URL', UPSTREAM_URL);
console.log('LISTEN_PORT', LISTEN_PORT);
console.log('SHOW_ENCRYPTED_REQUESTS', SHOW_ENCRYPTED_REQUESTS);
console.log('SHOW_ENCRYPTED_RESULTS', SHOW_ENCRYPTED_RESULTS);
console.log('DISALLOW_UNENCRYPTED_ONLY_FROM', DISALLOW_UNENCRYPTED_ONLY_FROM);

createServer(onRequest).listen(LISTEN_PORT);

interface JSONRPCRequest {
  jsonrpc: string;
  method: string;
  params: any[];
  id: number;
}

interface JSONRPCResult {
  jsonrpc: string;
  id: number;
  error?: { code: number; message: string; data?: string };
  result?: unknown;
}

class CallError extends Error {
  public constructor(message: string, public readonly request?: unknown) {
    super(message);
  }
}

// Handles eth_sendRawTransaction
async function handleSendRawTransaction(
  req: IncomingMessage,
  body: JSONRPCRequest,
) {
  const tx = Transaction.from(body.params[0]);
  let envelope: Envelope | undefined = undefined;
  try {
    envelope = cborgDecode(getBytes(tx.data)) as Envelope;
  } catch (e: any) {
    // Ignore cborg decode errors, this means it's not an envelope
  }

  let commonTxMsg = `FROM=${tx.from} TO=${tx.to}`;
  if (tx.data) {
    commonTxMsg += ` DATA=${tx.data} (${tx.data.length})`;
  }

  if (!envelope) {
    // We can enforce that specific senders are required to have encrypted txns
    if (
      !DIE_ON_UNENCRYPTED ||
      (ALLOW_UNENCRYPTED_DEPLOYS && !tx.to) ||
      (tx.from &&
        (!DISALLOW_UNENCRYPTED_ONLY_FROM ||
          !DISALLOW_UNENCRYPTED_ONLY_FROM.includes(tx.from)))
    ) {
      console.log(
        req.method,
        req.url,
        body.method,
        `UNENCRYPTED.TX`,
        commonTxMsg,
      );
      return true;
    }
    console.log('From', tx.fromPublicKey, tx.from);
    console.log(tx.toJSON());
    console.log(body);
    throw new CallError(
      `NOT ENCRYPTED.TX ${req.method} ${req.url} ${body.method} ${commonTxMsg}`,
      tx,
    );
  }

  if (envelope.format !== 1) {
    // Verify envelope format == 1 (encrypted)
    throw new EnvelopeError('Enveloped byt not encrypted!', envelope);
  }

  // format=1 transactions will contain a struct with pk, nonce, data, epoch etc
  if ('pk' in envelope.body) {
    const epoch = envelope.body.epoch;
    console.log(
      req.method,
      req.url,
      body.method,
      'ENCRYPTED.TX' + (epoch ? `(EPOCH=${epoch})` : ''),
      commonTxMsg,
    );
    return true;
  }

  throw new CallError('Unexpected state, body is not a struct', tx);
}

// Handles eth_call and eth_estimateGas
async function handleRequestCallOrEstimate(
  req: IncomingMessage,
  body: JSONRPCRequest,
) {
  const params: { from?: string; data?: string; value?: string; to?: string } =
    body.params[0];
  const calldata = getBytes(params.data!);
  let envelope: Envelope | undefined = undefined;
  try {
    envelope = cborgDecode(calldata) as Envelope;
  } catch (e: any) {
    // Ignore cborg decode errors, this means it's not an envelope
  }
  let commonMsg = `FROM=${params.from}`;
  if (params.value) {
    commonMsg += ` VALUE=${formatEther(toBigInt(params.value))}`;
  }
  if (params.data) {
    commonMsg += ` DATA=${params.data} (${params.data.length})`;
  }

  if (envelope) {
    if ('body' in envelope && 'format' in envelope) {
      // Otherwise, it's not a signed query, but a normal encrypted (but unauthenticated) call
      if (envelope.format !== 1) {
        throw new EnvelopeError(
          'Enveloped call or gas estimation but not encrypted!',
          envelope,
        );
      }
      if (!('pk' in envelope.body)) {
        throw new EnvelopeError('Body is not a struct', envelope);
      }
      const epoch = envelope.body.epoch;
      console.log(
        req.method,
        req.url,
        body.method,
        'ENCRYPTED.CALL' + (epoch ? `(EPOCH=${epoch})` : ''),
        commonMsg,
      );
      if (SHOW_ENCRYPTED_REQUESTS) {
        console.dir(body);
      }
      return true;
    }
    throw new EnvelopeError('Unknown envelope type!', envelope);
  }

  // Call is not enveloped
  if (DIE_ON_UNENCRYPTED && !params.to && !ALLOW_UNENCRYPTED_DEPLOYS) {
    console.log(
      req.method,
      req.url,
      body.method,
      'CALL NOT ENCRYPTED!',
      params,
    );
    console.dir(body);
    throw new CallError('CALL NOT ENCRYPTED', body);
  }

  return true;
}

async function getBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const bodyParts: Uint8Array[] = [];
    let body: string;
    request
      .on('data', (chunk) => {
        bodyParts.push(chunk);
      })
      .on('end', () => {
        body = Buffer.concat(bodyParts).toString();
        resolve(body);
      });
  });
}

function isJsonRpcResult(o: object): o is JSONRPCResult {
  return 'jsonrpc' in o && ('result' in o || 'error' in o);
}

async function onRequest(req: IncomingMessage, response: ServerResponse) {
  if (req.method !== 'POST') {
    // An initial prefetch request will be made to determine if CORS is allowed.
    response.writeHead(200, 'Not POST!', {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    });
    response.end();
    return;
  }

  const inputBody = JSON.parse(await getBody(req)) as JSONRPCRequest;
  let bodies: JSONRPCRequest[];
  if (Array.isArray(inputBody)) {
    bodies = inputBody;
  } else {
    bodies = [inputBody];
  }

  let showResult = false;

  for (const body of bodies) {
    if (body.method === 'eth_estimateGas' || body.method === 'eth_call') {
      showResult = await handleRequestCallOrEstimate(req, body);
    } else if (body.method === 'eth_sendRawTransaction') {
      showResult = await handleSendRawTransaction(req, body);
    } else if (LOG_ALL_METHODS || body.method === 'oasis_callDataPublicKey') {
      console.log(req.method, req.url, body.method);
    }
  }

  const pr = await fetch(UPSTREAM_URL, {
    method: 'POST',
    body: JSON.stringify(inputBody),
    headers: { 'Content-Type': 'application/json' },
  });

  const pj = await pr.json();
  if (SHOW_ENCRYPTED_RESULTS && showResult) {
    console.log(' - RESULT', pj);
  }

  // If any queries result in errors, display them
  const responses: JSONRPCResult[] = isJsonRpcResult(pj) ? [pj] : pj;
  for (const r of responses) {
    if (r.error) {
      console.log('ERROR', r);
    }
  }

  response.writeHead(200, 'OK', {
    Connection: 'close',
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
  });
  response.write(JSON.stringify(pj), () => {
    response.end();
  });
}
