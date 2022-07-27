import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import { Api } from './api/init';

const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

fastify.register(Api);

fastify.listen({ host: '127.0.0.1', port: 3000 }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    // process.exit(1)
  }
});
