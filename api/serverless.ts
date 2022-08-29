import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Api } from '../src/api/init';
import * as dotenv from "dotenv";
import Fastify from "fastify";

dotenv.config();
const fastify = Fastify({
  trustProxy: true,
  logger: true,
  maxParamLength: 1048576, // 1MB
}).withTypeProvider<TypeBoxTypeProvider>();

fastify.register(Api);

export default async (req: any, res: any) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
}
