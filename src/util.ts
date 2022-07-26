import { fetch as undiciFetch, Headers, Request, RequestInit, Response } from "undici";
import * as createError from '@fastify/error';

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

export async function fetchJson<TOkResponse, TErrorResponse extends unknown>(args: {
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
    const errorMsg = `${req.method} ${req.url} - error parsing JSON response ${resp.status}: ${respText}`;
    throwFetchError(error as Error, errorMsg);
  }

  if (resp.ok) {
    return { result: 'ok', status: resp.status, response: respBody as TOkResponse, getCurlCmd };
  } else {
    return { result: 'error', status: resp.status, response: respBody as TErrorResponse, getCurlCmd };
  }
}
