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
      title: 'Stacks + Bitcoin Utility Service',
      description: '#### Simple, developer-friendly APIs for various uses. \n * Easy to use endpoints to retrieve Bitcoin information related to Stacks and vice versa. \n * Automatic Clarity encoding & decoding for various Stacks RPC endpoints. \n * Chain-tip based HTTP caching support for expensive Stacks RPC endpoints.',
      version: '0.0.1',
    },
    externalDocs: {
      url: 'https://github.com/rafaelcr/stx-btc-api',
      description: 'Source Repository'
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
