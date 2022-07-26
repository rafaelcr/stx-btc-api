import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import { handleChainTipCache } from './cache';
import { ApiRoutes } from './routes';

const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

fastify.addHook('preHandler', handleChainTipCache);
fastify.register(ApiRoutes);

fastify.listen({ host: '127.0.0.1', port: 3000 }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    // process.exit(1)
  }
});
