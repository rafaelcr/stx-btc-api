import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { NodeRoutes } from '../src/routes/node';
import { BtcRoutes } from '../src/routes/btc';
import * as dotenv from "dotenv";
import Fastify from "fastify";

dotenv.config();

// Instantiate Fastify with some config
const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

fastify.register(NodeRoutes);
fastify.register(BtcRoutes);

export default async (req: any, res: any) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
}
