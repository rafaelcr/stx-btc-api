import { Server } from 'http';
import { FastifyPluginCallback } from 'fastify';
import FastifyCors from '@fastify/cors';
import FastifyFormBody from '@fastify/formbody';
import FastifyMultipart from '@fastify/multipart';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import * as createError from '@fastify/error';
import { Type } from '@sinclair/typebox';
import { ClarityAbi, ClarityType, ClarityValue, cvToJSON, cvToValue, deserializeCV, parseToCV, serializeCV } from '@stacks/transactions';
import { fetchJson } from './util';


const STACKS_API_ENDPOINT = 'https://stacks-node-api.mainnet.stacks.co';

export const ApiRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = async (fastify, options, done) => {

  // Enable cross-origin access.
  await fastify.register(FastifyCors);

  // Support parsing `content-type: application/x-www-form-urlencoded` bodies.
  await fastify.register(FastifyFormBody);

  // Support parsing `content-type: multipart/form-data` bodies.
  await fastify.register(FastifyMultipart, { attachFieldsToBody: 'keyValues' });

  fastify.get('/', (request, reply) => {
    reply.send({ status: 'ok' });
  });

  // POST /v2/contracts/call-read/[Stacks Address]/[Contract Name]/[Function Name]
  fastify.get('/call-fn/:address/:contract/:fn',  {
    schema: {
      querystring: Type.Object({
        arg: Type.Union([
          Type.String(),
          Type.Array(Type.String())
        ]),
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
        address: Type.String(),
        contract: Type.String(),
        fn: Type.String(),
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

    let args = typeof request.query.arg === 'string' ? [request.query.arg] : request.query.arg;
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

    reply.send(decodedResult);
  });
  done();
}
