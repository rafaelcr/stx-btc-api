import { FastifyPluginCallback } from 'fastify';

export const ApiRoutes: FastifyPluginCallback = (fastify, options, done) => {
  fastify.get('/', (request, reply) => {
    reply.send({ status: 'ok' });
  });

  fastify.listen({ host: '127.0.0.1', port: 3000 }, (err, address) => {
    if (err) {
      fastify.log.error(err)
      // process.exit(1)
    }
  });
  done();
}
