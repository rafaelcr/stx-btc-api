import { Server } from 'http';
import { FastifyPluginCallback } from 'fastify';
import FastifyFormBody from '@fastify/formbody';
import FastifyMultipart from '@fastify/multipart';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import * as createError from '@fastify/error';
import { Type } from '@sinclair/typebox';
import { ClarityAbi, ClarityAbiType, ClarityType, ClarityValue, cvToValue, deserializeCV, parseToCV, serializeCV } from '@stacks/transactions';
import { fetchJson } from '../util';
import { handleChainTipCache } from '../cache';
import { STACKS_API_ENDPOINT } from '../../consts';

export const NodeRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = async (fastify, options, done) => {
  // Add chain-tip cache
  fastify.addHook('preHandler', handleChainTipCache);

  // Support parsing `content-type: application/x-www-form-urlencoded` bodies.
  await fastify.register(FastifyFormBody);

  // Support parsing `content-type: multipart/form-data` bodies.
  await fastify.register(FastifyMultipart, { attachFieldsToBody: 'keyValues' });

  // POST /v2/map_entry/[Stacks Address]/[Contract Name]/[Map Name]
  // https://github.com/stacks-network/stacks-blockchain/blob/master/docs/rpc-endpoints.md#post-v2map_entrystacks-addresscontract-namemap-name
  fastify.get('/map-entry/:address/:contract/:map/:key', {
    schema: {
      querystring: Type.Object({
        key_encoded: Type.Optional(Type.Boolean({ 
          default: false, 
          description: 'If true then the function args are treated as already hex-encoded Clarity values. Otherwise, values will be coerced into the matching contract ABI type.' 
        })),
        no_unwrap: Type.Optional(Type.Boolean({
          default: false,
          description: 'If true, top-level Optional and Response values will not be unwrapped.'
        }))
      }),
      params: Type.Object({
        address: Type.String({examples: ['SPNWZ5V2TPWGQGVDR6T7B6RQ4XMGZ4PXTEE0VQ0S']}),
        contract: Type.String({examples: ['crypto-graffiti']}),
        map: Type.String({examples: ['nft-data']}),
        key: Type.String({examples: ['42']}),
      })
    }
  }, async (request, reply) => {
    const { address, contract, map, key } = request.params;
    const getContractUrl = new URL(`/v2/contracts/interface/${address}/${contract}`, STACKS_API_ENDPOINT);
    const contractInterface = await fetchJson<ClarityAbi>({ url: getContractUrl });
    if (contractInterface.result !== 'ok') {
      const FetchError = createError('CONTRACT_ABI_ERROR', 'Error fetching contract ABI: %s', 400);
      throw new FetchError(JSON.stringify({ status: contractInterface.status, response: contractInterface.response }));
    }

    const mapEntry = contractInterface.response.maps.find(mapEntry => mapEntry.name === map) as unknown as {
      name: string;
      key: ClarityAbiType;
      value: ClarityAbiType;
    };
    if (!mapEntry) {
      const AbiError = createError('CONTRACT_ABI_ERROR', `Contract does not contain a map titled "${map}"`, 404);
      throw new AbiError();
    }

    let serializedKey = request.params.key;
    if (!request.query.key_encoded) {
      try {
        const clarityVal = parseToCV(request.params.key, mapEntry.key);
        serializedKey = '0x' + serializeCV(clarityVal).toString('hex');
      } catch (error) {
        const AbiError = createError('CLARITY_SERIALIZE_ERROR', `Map key of type ${JSON.stringify(mapEntry.key)} could not be encoded from value "${request.params.key}": ${error}`, 400);
        throw new AbiError();
      }
    }

    const url = new URL(`/v2/map_entry/${address}/${contract}/${map}`, STACKS_API_ENDPOINT);
    url.searchParams.set('proof', '0');

    const result = await fetchJson<{data: string}>({ 
      url, 
      init: { method: 'POST', body: JSON.stringify(serializedKey) }
    });
    if (result.result !== 'ok') {
      const CallReadError = createError('CONTRACT_DATA_MAP_READ_ERROR', 'Error contract map read: %s', 400);
      throw new CallReadError(JSON.stringify({ status: result.status, response: result.response }));
    }
    if (!result.response.data) {
      const CallReadError = createError('CONTRACT_DATA_MAP_READ_ERROR', 'Error contract map read: %s', 400);
      throw new CallReadError(JSON.stringify({ status: result.status, response: result.response }));
    }

    let deserializedCv: ClarityValue;
    try {
      deserializedCv = deserializeCV(result.response.data);
    } catch (error) {
      const DeserializeError = createError('CLARITY_DESERIALIZE_ERROR', `Error deserializing Clarity value "${result.response.data}": ${error}`, 500);
      throw new DeserializeError();
    }
    while (!request.query.no_unwrap && (deserializedCv.type === ClarityType.OptionalSome || deserializedCv.type === ClarityType.ResponseErr || deserializedCv.type === ClarityType.ResponseOk)) {
      deserializedCv = deserializedCv.value;
    }

    let decodedResult = cvToValue(deserializedCv, true);
    if (!request.query.no_unwrap && deserializedCv.type === ClarityType.OptionalNone) {
      decodedResult = null;
    }

    reply.header('x-curl-equiv', result.getCurlCmd());

    reply.type('application/json').send(decodedResult);
  });

  // POST /v2/contracts/call-read/[Stacks Address]/[Contract Name]/[Function Name]
  fastify.get('/call-fn/:address/:contract/:fn',  {
    schema: {
      querystring: Type.Object({
        arg: Type.Array(Type.String({examples: ['149']})),
        sender: Type.Optional(Type.String()),
        args_encoded: Type.Optional(Type.Boolean({ 
          default: false, 
          description: 'If true then the function args are treated as already hex-encoded Clarity values. Otherwise, values will be coerced into the matching contract ABI type.' 
        })),
        no_unwrap: Type.Optional(Type.Boolean({
          default: false,
          description: 'If true, top-level Optional and Response values will not be unwrapped.'
        }))
      }),
      params: Type.Object({
        address: Type.String({examples: ['SPNWZ5V2TPWGQGVDR6T7B6RQ4XMGZ4PXTEE0VQ0S']}),
        contract: Type.String({examples: ['crypto-graffiti']}),
        fn: Type.String({examples: ['get-price']}),
      })
    }
  }, async (request, reply) => {
    const { address, contract, fn } = request.params;

    const getContractUrl = new URL(`/v2/contracts/interface/${address}/${contract}`, STACKS_API_ENDPOINT);
    const contractInterface = await fetchJson<ClarityAbi>({ url: getContractUrl });
    if (contractInterface.result !== 'ok') {
      const FetchError = createError('CONTRACT_ABI_ERROR', 'Error fetching contract ABI: %s', 400);
      throw new FetchError(JSON.stringify({ status: contractInterface.status, response: contractInterface.response }));
    }

    let args = request.query.arg;
    const functionAbi = contractInterface.response.functions.find(abiFn => abiFn.name === fn);
    if (!functionAbi) {
      const AbiError = createError('CONTRACT_ABI_ERROR', `Contract does not contain a function titled "${fn}"`, 404);
      throw new AbiError();
    }

    if (functionAbi.args.length !== args.length) {
      const AbiError = createError('CONTRACT_ABI_ERROR', `Contract function "${fn}" requires ${functionAbi.args.length} arguments but only ${args.length} were provided`, 400);
      throw new AbiError();
    }

    if (!request.query.args_encoded) {
      for (let i = 0; i < args.length; i++) {
        const { name, type } = functionAbi.args[i];
        try {
          const clarityVal = parseToCV(args[i], type);
          args[i] = '0x' + serializeCV(clarityVal).toString('hex');
        } catch (error) {
          const AbiError = createError('CLARITY_SERIALIZE_ERROR', `Function argument "${name}" of type ${JSON.stringify(type)} could not be encoded from value "${args[i]}": ${error}`, 400);
          throw new AbiError();
        }
      }
    }

    const url = new URL(`/v2/contracts/call-read/${address}/${contract}/${fn}`, STACKS_API_ENDPOINT);
    const defaultSender = 'STM9EQRAB3QAKF8NKTP15WJT7VHH4EWG3DJB4W29';

    const payload = {
      sender: request.query.sender ?? defaultSender,
      arguments: args,
    };
    const result = await fetchJson<{okay: true; result: string } | {okay: false; cause: string}>({ 
      url, 
      init: { method: 'POST', body: JSON.stringify(payload) }
    });
    if (result.result !== 'ok') {
      const CallReadError = createError('CALL_READ_ERROR', 'Error performing call-read: %s', 400);
      throw new CallReadError(JSON.stringify({ status: result.status, response: result.response }));
    }
    if (!result.response.okay) {
      const CallReadError = createError('CALL_READ_ERROR', 'Error performing call-read: %s', 400);
      throw new CallReadError(JSON.stringify({ status: result.status, response: result.response }));
    }

    let deserializedCv: ClarityValue;
    try {
      deserializedCv = deserializeCV(result.response.result);
    } catch (error) {
      const DeserializeError = createError('CLARITY_DESERIALIZE_ERROR', `Error deserializing Clarity value "${result.response.result}": ${error}`, 500);
      throw new DeserializeError();
    }
    while (!request.query.no_unwrap && (deserializedCv.type === ClarityType.OptionalSome || deserializedCv.type === ClarityType.ResponseErr || deserializedCv.type === ClarityType.ResponseOk)) {
      deserializedCv = deserializedCv.value;
    }

    let decodedResult = cvToValue(deserializedCv, true);
    if (!request.query.no_unwrap && deserializedCv.type === ClarityType.OptionalNone) {
      decodedResult = null;
    }

    reply.header('x-curl-equiv', result.getCurlCmd());

    reply.type('application/json').send(decodedResult);
  });
  done();
}
