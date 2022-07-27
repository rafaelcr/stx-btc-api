import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import { BtcRoutes } from './routes/btc';
import { NodeRoutes } from './routes/node';

const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

fastify.register(NodeRoutes);
fastify.register(BtcRoutes);

fastify.listen({ host: '127.0.0.1', port: 3000 }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    // process.exit(1)
  }
});
