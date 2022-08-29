import { Server } from 'http';
import { FastifyPluginCallback } from 'fastify';
import FastifyFormBody from '@fastify/formbody';
import FastifyMultipart from '@fastify/multipart';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import * as createError from '@fastify/error';
import { Type } from '@sinclair/typebox';
import { ClarityValue, cvToJSON, deserializeCV, getCVTypeString, serializeCV } from '@stacks/transactions';
import { cvFromJson, TypeNullable } from '../util';

export const ClarityUtilRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = async (fastify, options, done) => {
  // Support parsing `content-type: application/x-www-form-urlencoded` bodies.
  await fastify.register(FastifyFormBody);

  // Support parsing `content-type: multipart/form-data` bodies.
  await fastify.register(FastifyMultipart, { attachFieldsToBody: 'keyValues' });

  fastify.get('/clarity-decode/:value', {
    schema: {
      tags: ['Clarity utils'],
      summary: 'Decode a serialized Clarity value string to JSON',
      description: 'Decodes a raw / serialized Clarity value from a hex string to a JSON object.',
      params: Type.Object({
        value: Type.String({examples: ['0x03']}),
      }),
      response: {
        200: TypeNullable(Type.Union([
          Type.Object(Type.Any(), { additionalProperties: true}),
          Type.String(),
          Type.Number(),
          Type.Boolean(),
        ], {
          description: "Decoded Clarity value",
          examples: [{
            "type": "bool",
            "value": true
          }],
        }))
      }
    }
  }, async (request, reply) => {
    const { value } = request.params;
    let deserializedCv: ClarityValue;
    try {
      deserializedCv = deserializeCV(value);
    } catch (error) {
      const DeserializeError = createError('CLARITY_DESERIALIZE_ERROR', `Error deserializing Clarity value "${value}": ${error}`, 500);
      throw new DeserializeError();
    }
    const decodedResult = cvToJSON(deserializedCv);
    reply.type('application/json').send(JSON.stringify(decodedResult, null, 2));
  });

  fastify.get('/clarity-encode/:value', {
    schema: {
      tags: ['Clarity utils'],
      summary: 'Encode a human readable string to a serialized Clarity value',
      description: 'Encodes a human readable string or a JSON object into a raw / serialized Clarity value as a hex string. Supports Clarity Tuples and Lists if a JSON object or array is given.',
      params: Type.Object({
        value: Type.String({examples: ['true', '{"id": 1234, "addrs": ["SPNWZ5V2TPWGQGVDR6T7B6RQ4XMGZ4PXTEE0VQ0S", "SP1X6215NY6QKGJZ0ZEP509KJY9N7EH15QSH7N41B"]}']}),
      }),
      response: {
        200: TypeNullable(Type.Union([
          Type.Object(Type.Any(), { additionalProperties: true}),
          Type.String(),
          Type.Number(),
          Type.Boolean(),
        ], {
          description: "Serialized Clarity value",
          examples: [{
            "type": "bool",
            "serialized": "0x03"
          }],
        }))
      }
    }
  }, async (request, reply) => {
    const { value } = request.params;
    let clarityVal: ClarityValue;
    try {
      clarityVal = cvFromJson(value);
    } catch (error) {
      const DeserializeError = createError('CLARITY_DESERIALIZE_ERROR', `Error serializing Clarity value "${value}": ${error}`, 500);
      throw new DeserializeError();
    }
    const typeName = getCVTypeString(clarityVal);
    const serialized = '0x' + serializeCV(clarityVal).toString('hex');
    const result = {
      type: typeName,
      serialized: serialized,
    };
    reply.type('application/json').send(JSON.stringify(result, null, 2));
  });

  done();
}
