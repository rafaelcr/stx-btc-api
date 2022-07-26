import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { ApiRoutes } from '../src/routes';
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

export default async (req: any, res: any) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
}
