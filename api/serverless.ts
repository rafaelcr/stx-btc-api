import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { ApiRoutes } from '../src/index';
import * as dotenv from "dotenv";
import Fastify from "fastify";

dotenv.config();

// Instantiate Fastify with some config
const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

// Register your application as a normal plugin.
fastify.register(ApiRoutes, {
  prefix: '/'
});

export default async (req, res) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
}
