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
  fastify.register(FastifySwagger, { openapi: {}, exposeRoute: true });
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
