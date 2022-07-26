import { Server } from 'http';
import { FastifyPluginCallback } from 'fastify';
import FastifyCors from '@fastify/cors';
import FastifyFormBody from '@fastify/formbody';
import FastifyMultipart from '@fastify/multipart';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox'
import { fetchJson } from './util';

export const STACKS_API_ENDPOINT = 'https://stacks-node-api.mainnet.stacks.co';

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
        sender: Type.Optional(Type.String())
      }),
      params: Type.Object({
        address: Type.String(),
        contract: Type.String(),
        fn: Type.String(),
      })
    }
  }, async (request, reply) => {
    const { address, contract, fn } = request.params;
    const url = new URL(`/v2/contracts/call-read/${address}/${contract}/${fn}`, STACKS_API_ENDPOINT);
    const sender = request.query.sender ?? 'STM9EQRAB3QAKF8NKTP15WJT7VHH4EWG3DJB4W29';
    const args = typeof request.query.arg === 'string' ? [request.query.arg] : request.query.arg;
    const payload = {
      sender: sender,
      arguments: args,
    };
    const result = await fetchJson({ url, init: { method: 'POST', body: JSON.stringify(payload) }});
    reply.send(result);
    /*
    POST http://127.0.0.1:20443/v2/contracts/call-read/SP187Y7NRSG3T9Z9WTSWNEN3XRV1YSJWS81C7JKV7/imaginary-friends-zebras/get-token-uri
    {
      "sender": "STM9EQRAB3QAKF8NKTP15WJT7VHH4EWG3DJB4W29",
      "arguments": [
        "0x0100000000000000000000000000000095"
      ]
    }
    */
  });
  done();
}
