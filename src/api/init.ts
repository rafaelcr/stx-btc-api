import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { FastifyPluginCallback } from "fastify";
import { Server } from "http";
import FastifySwagger from '@fastify/swagger';
import FastifyCors from '@fastify/cors';
import { NodeRoutes } from "./routes/node";
import { BtcRoutes } from "./routes/btc";

export const Api: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.register(FastifySwagger, { openapi: {
    info: {
      title: 'Stacks + Bitcoin utils',
      description: 'Easy to use endpoints to retrieve Bitcoin information related to Stacks, and automatic Clarity encoding & decoding for various Stacks RPC endpoints.',
      version: '0.0.1',
    },
    tags: [{
      name: 'Utils',
      description: 'Converter / helpers'
    }, {
      name: 'Bitcoin info',
      description: 'Get Bitcoin information related to Stacks information and vice versa'
    }, {
      name: 'Clarity query helpers',
      description: 'Automatically encode input values into serialized Clarity strings, and decode Clarity values into JSON'
    }],
  }, exposeRoute: true });
  fastify.register(FastifyCors);

  fastify.register(NodeRoutes);
  fastify.register(BtcRoutes);

  fastify.get('/', (request, reply) => {
    reply.redirect('/documentation');
  });

  fastify.get('/status', (request, reply) => {
    reply.send({ status: 'ok' });
  });

  done();
}
