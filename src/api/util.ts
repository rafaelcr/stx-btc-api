import { fetch as undiciFetch, Headers, Request, RequestInit, Response } from "undici";
import * as createError from '@fastify/error';
import * as c32check from 'c32check';

const defaultFetchTimeout = 15_000; // 15 seconds

function throwFetchError(...args: [Error, string] | [string] | [Error]): never {
  if (args.length === 2) {
    const FetchError = createError('FETCH_ERROR', 'Server fetch error: %s', 500);
    throw new FetchError(args[1]);
  } else {
    const FetchError = createError('FETCH_ERROR', 'Server fetch error: %s', 500);
    throw new FetchError(args[0]);
  }
}

export async function fetchJson<TOkResponse = unknown, TErrorResponse = unknown>(args: {
  url: URL;
  init?: RequestInit | undefined;
  timeoutMs?: number;
}): Promise<
  ({
    result: 'ok';
    status: number;
    response: TOkResponse;
  } | {
    result: 'error';
    status: number;
    response: TErrorResponse;
  })
  & { getCurlCmd: () => string }
> {
  const requestInit: RequestInit = {
    signal: (AbortSignal as any).timeout(args.timeoutMs ?? defaultFetchTimeout),
    ...args.init
  };
  const headers = new Headers(requestInit.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  requestInit.headers = headers;
  const req = new Request(args.url, requestInit);

  const getCurlCmd = () => {
    let curl = `curl -i -X ${req.method} '${req.url}'`;
    if (args.init?.body) {
      if (typeof args.init.body === 'string') {
        curl += ` -H 'Content-Type: application/json' -d '${args.init.body.replace(/'/g, `'\\''`)}'`;
      } else {
        throw new Error(`Can only create curl command for request bodies with string type`)
      }
    }
    return curl;
  };


  let resp: Response;
  try {
    resp = await undiciFetch(req);
  } catch (error) {
    const errorMsg = `${req.method} ${req.url} - error performing fetch: ${error}`;
    throwFetchError(error as Error, errorMsg);
  }

  let respText = '';
  try {
    respText = await resp.text();
  } catch (error) {
    const errorMsg = `${req.method} ${req.url} - error reading response ${resp.status}: ${respText}`;
    throwFetchError(error as Error, errorMsg);
  }

  let respBody: unknown;
  try {
    respBody = JSON.parse(respText);
  } catch (error) {
    if (resp.ok) {
      const errorMsg = `${req.method} ${req.url} - error parsing JSON response ${resp.status}: ${respText}`;
      throwFetchError(error as Error, errorMsg);
    }
  }

  if (resp.ok) {
    return { result: 'ok', status: resp.status, response: respBody as TOkResponse, getCurlCmd };
  } else {
    return { result: 'error', status: resp.status, response: (respBody ?? respText) as TErrorResponse, getCurlCmd };
  }
}

/** Provide either a Stacks or Bitcoin address, and receive the Stacks address, Bitcoin address, and network version */
export function getAddressInfo(addr: string, network: 'mainnet' | 'testnet' = 'mainnet') {
  let b58addr: string;
  if (addr.match(/^S[0123456789ABCDEFGHJKMNPQRSTVWXYZ]+$/)) {
    b58addr = c32check.c32ToB58(addr);
  } else if (addr.match(/[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+/)) {
    b58addr = addr;
  } else {
    throw new Error(`Unrecognized address ${addr}`);
  }

  let stxAddr = c32check.b58ToC32(b58addr);

  let decodedStxAddr = c32check.c32addressDecode(stxAddr);

  // Check if address needs coerced from one network version to another
  if (network) {
    if (network === 'mainnet' && decodedStxAddr[0] !== c32check.versions.mainnet.p2pkh && decodedStxAddr[0] !== c32check.versions.mainnet.p2sh) {
      if (decodedStxAddr[0] === c32check.versions.testnet.p2pkh) {
        decodedStxAddr[0] = c32check.versions.mainnet.p2pkh;
      } else if (decodedStxAddr[0] === c32check.versions.testnet.p2sh) {
        decodedStxAddr[0] = c32check.versions.testnet.p2pkh;
      } else {
        throw new Error(`Cannot convert address network type, unknown network version: ${decodedStxAddr[0]}`);
      }
    } else if (network === 'testnet' && decodedStxAddr[0] !== c32check.versions.testnet.p2pkh && decodedStxAddr[0] !== c32check.versions.testnet.p2sh) {
      if (decodedStxAddr[0] === c32check.versions.mainnet.p2pkh) {
        decodedStxAddr[0] = c32check.versions.testnet.p2pkh;
      } else if (decodedStxAddr[0] === c32check.versions.mainnet.p2sh) {
        decodedStxAddr[0] = c32check.versions.testnet.p2pkh;
      } else {
        throw new Error(`Cannot convert address network type, unknown network version: ${decodedStxAddr[0]}`);
      }
    }
    stxAddr = c32check.c32address(decodedStxAddr[0], decodedStxAddr[1]);
    b58addr = c32check.c32ToB58(stxAddr);
  }

  let networkName = 'other';
  if (decodedStxAddr[0] === c32check.versions.testnet.p2pkh || decodedStxAddr[0] === c32check.versions.testnet.p2sh) {
    networkName = 'testnet';
  } else if (decodedStxAddr[0] === c32check.versions.mainnet.p2pkh || decodedStxAddr[0] === c32check.versions.mainnet.p2sh) {
    networkName = 'mainnet';
  }

  return {
    stacks: stxAddr,
    bitcoin: b58addr,
    network: networkName,
  };
}
