import { Server } from 'http';
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { FastifyPluginCallback } from "fastify";
import { Type } from '@sinclair/typebox';
import { fetchJson, getAddressInfo } from '../util';
import { request, fetch as undiciFetch } from 'undici';
import * as stacksApiClient from '@stacks/blockchain-api-client';
import * as stackApiTypes from '@stacks/stacks-blockchain-api-types';
import BigNumber from 'bignumber.js';
import { BLOCKCHAIN_EXPLORER_ENDPOINT, BLOCKCHAIN_INFO_API_ENDPOINT, STACKS_API_ENDPOINT, STACKS_EXPLORER_ENDPOINT } from '../../consts';

export const BtcRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async (fastify, options, done) => {
  fastify.get('/addr/:address', {
    schema: {
      tags: ['Utils'],
      summary: 'Convert between a Stacks or Bitcoin address',
      description: 'Provide either a Stacks or Bitcoin address, and receive the Stacks address, Bitcoin address, and network version.',
      params: Type.Object({
        address: Type.String({
          description: 'Specify either a Stacks or Bitcoin address',
          examples: ['SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7', '1FzTxL9Mxnm2fdmnQEArfhzJHevwbvcH6d'],
        }),
      }),
      querystring: Type.Object({
        network: Type.Optional(Type.Union([Type.Literal('mainnet'), Type.Literal('testnet')], {
          description: 'Specify if the address should be converted to mainnet or testnet',
          examples: ['mainnet', 'testnet'],
        }))
      }),
    }
  }, (request, reply) => {
    const addrInfo = getAddressInfo(request.params.address, request.query.network);
    reply.type('application/json').send(JSON.stringify(addrInfo, null, 2));
  });

  fastify.get('/addr/:address/balances', {
    schema: {
      tags: ['Bitcoin info'],
      summary: 'Get the STX and BTC balance for an address',
      params: Type.Object({
        address: Type.String({
          description: 'Specify either an STX(Stacks) or BTC(Bitcoin) address. The below example takes STX address as input.',
          examples: ['SPRSDSRT18DS9R8Y2W13JTKF89NFHEGDWQPB78RE', '15XCtJkEDxE1nhFawvPY4QEkEyNywxNSfL'],
        }),
      }),
      response: {
        200: Type.String({
            description: "Success response",
            examples:[{
              "stacks": {
                "address": "SPRSDSRT18DS9R8Y2W13JTKF89NFHEGDWQPB78RE",
                "balance": "0.000000"
              },
              "bitcoin": {
                "address": "15XCtJkEDxE1nhFawvPY4QEkEyNywxNSfL",
                "balance": "3.47307619"
              }
            }],
            
            stacks: Type.Object({
              address: Type.String({
                description: 'STX(Stacks) address',
                examples: ['SPRSDSRT18DS9R8Y2W13JTKF89NFHEGDWQPB78RE'],
              }),
              balance: Type.Number({
                description: 'Balance for the stacks or BTC address',
                examples: ['0']
              })
            }),
            bitcoin: Type.Object({
              address: Type.String({
              description: 'BTC(Bitcoin) address',
              examples: ['15XCtJkEDxE1nhFawvPY4QEkEyNywxNSfL'],
            }),
            balance: Type.Number({
              description: 'Balance for the stacks or BTC address',
              examples: ['0']
            })})

  
        })
      }
    }
    
  }, async (req, reply) => {
    const addrInfo = getAddressInfo(req.params.address, 'mainnet');

    const stxBalanceReq = await request(
      `${STACKS_API_ENDPOINT}/extended/v1/address/${addrInfo.stacks}/balances`, { method: 'GET' }
    );
    const stxBalance = await stxBalanceReq.body.json();
    const stxBalanceFormatted = new BigNumber(stxBalance.stx.balance).shiftedBy(-6).toFixed(6);
    const btcBalanceReq = await request(
      `${BLOCKCHAIN_INFO_API_ENDPOINT}/rawaddr/${addrInfo.bitcoin}?limit=0`
    );
    const btcBalance = await btcBalanceReq.body.json();
    const btcBalanceFormatted = new BigNumber(btcBalance.final_balance).shiftedBy(-8).toFixed(8);

    reply.type('application/json').send(JSON.stringify({
      stacks: {
        address: addrInfo.stacks,
        balance: stxBalanceFormatted
      },
      bitcoin: {
        address: addrInfo.bitcoin,
        balance: btcBalanceFormatted
      }
    }, null, 2));
  });

  fastify.get('/btc-info-from-stx-tx/:txid', {
    schema: {
      tags: ['Bitcoin info'],
      summary: 'Get Bitcoin information for a Stacks tx',
      description: 'Returns Bitcoin related information for a given Stacks transaction',
      params: Type.Object({
        txid: Type.String({
          description: 'A Stacks transaction ID',
          examples: ['0xc4778249d7af16d004d5344be2683fae5c9263e22d5a2cdd6e1abf38bbdb8fa3'],
          pattern: '^(0x[0-9a-fA-F]{64}|[0-9a-fA-F]{64})$',
        }),
      }),
    }
  }, async (request, reply) => {
    let { txid } = request.params;
    txid = txid.toLocaleLowerCase();
    if (!txid.startsWith('0x')) {
      txid + '0x' + txid;
    }
    const stxApiConfig = new stacksApiClient.Configuration({ fetchApi: undiciFetch });
    const stxTxApi = new stacksApiClient.TransactionsApi(stxApiConfig);
    const stxBlockApi = new stacksApiClient.BlocksApi(stxApiConfig);
    const stxTxData = await stxTxApi.getTransactionById({ txId: txid }) as stackApiTypes.Transaction;
    const stxBlockHash = stxTxData.block_hash;
    const stxBlockData = await stxBlockApi.getBlockByHash({ hash: stxBlockHash }) as stackApiTypes.Block;
    const btcMinerTx = stxBlockData.miner_txid.slice(2);
    const btcBlockHash = stxBlockData.burn_block_hash.slice(2);

    const stacksBlockExplorerLink = new URL(`/block/${stxBlockHash}?chain=mainnet`, STACKS_EXPLORER_ENDPOINT);
    const stacksTxExplorerLink = new URL(`/txid/${txid}?chain=mainnet`, STACKS_EXPLORER_ENDPOINT);

    const btcBlockExplorerLink = new URL(`/btc/block/${btcBlockHash}`, BLOCKCHAIN_EXPLORER_ENDPOINT);
    const btcTxExplorerLink = new URL(`/btc/tx/${btcMinerTx}`, BLOCKCHAIN_EXPLORER_ENDPOINT);

    // const btcBlockDataUrl = new URL(`/rawblock/${btcBlockHash}`, BLOCKCHAIN_INFO_API_ENDPOINT);
    const btcTxDataUrl = new URL(`/rawtx/${btcMinerTx}`, BLOCKCHAIN_INFO_API_ENDPOINT);

    const btcTxData = await fetchJson<{inputs: { prev_out: { addr: string }}[]}>({ url: btcTxDataUrl });
    const btcMinerAddr = btcTxData.result === 'ok' ? (btcTxData.response.inputs[0]?.prev_out?.addr ?? null) : null;
    const btcMinerAddrExplorerLink = new URL(`/btc/address/${btcMinerAddr}`, BLOCKCHAIN_EXPLORER_ENDPOINT);

    const stxMinerAddr = btcMinerAddr ? getAddressInfo(btcMinerAddr).stacks : null;
    const stxMinerAddrExplorerLink = stxMinerAddr ? new URL(`/address/${stxMinerAddr}?chain=mainnet`, STACKS_EXPLORER_ENDPOINT) : null;

    const payload = {
      stacksTx: txid,
      stacksTxExplorer: stacksTxExplorerLink.toString(),
      stacksBlockHash: stxBlockHash,
      stacksBlockExplorer: stacksBlockExplorerLink.toString(),
      bitcoinBlockHash: btcBlockHash,
      bitcoinBlockExplorer: btcBlockExplorerLink.toString(),
      bitcoinTx: btcMinerTx,
      bitcoinTxExplorer: btcTxExplorerLink.toString(),
      minerBtcAddress: btcMinerAddr,
      minerBtcAddressExplorer: btcMinerAddrExplorerLink.toString(),
      minerStxAddress: stxMinerAddr,
      minerStxAddressExplorer: stxMinerAddrExplorerLink?.toString() ?? null,
    };

    reply.type('application/json').send(JSON.stringify(payload, null, 2));
  });

  fastify.get('/btc-info-from-stx-block/:block', {
    schema: {
      tags: ['Bitcoin info'],
      summary: 'Get Bitcoin information for a Stacks block',
      description: 'Returns Bitcoin related information for a given Stacks block',
      params: Type.Object({
        block: Type.Union([
          Type.String({
            description: 'A Stacks block hash',
            // examples: ['0xc4778249d7af16d004d5344be2683fae5c9263e22d5a2cdd6e1abf38bbdb8fa3'],
            pattern: '^(0x[0-9a-fA-F]{64}|[0-9a-fA-F]{64})$',
          }),
          Type.Integer({
            description: 'A bitcoin block height (block number)'
          }),
        ], {
          description: 'A Stacks block hash or block height',
          examples: ['0x529ed0f3ef381bbb25e9ffe46db87aa3d3de185e31129004a4da010495cc0daa', 69296],
        })
      }),
    }
  }, async (request, reply) => {
    const { block } = request.params;

    const stxApiConfig = new stacksApiClient.Configuration({ fetchApi: undiciFetch });
    const stxBlockApi = new stacksApiClient.BlocksApi(stxApiConfig);

    let stxBlockData: stackApiTypes.Block;
    let stxBlockHash: string;
    let stxBlockHeight: number;
    if (typeof block === 'string') {
      stxBlockHash = block.toLowerCase();
      if (!stxBlockHash.startsWith('0x')) {
        stxBlockHash + '0x' + stxBlockHash;
      }
      stxBlockData = await stxBlockApi.getBlockByHash({ hash: stxBlockHash }) as stackApiTypes.Block;
      stxBlockHeight = stxBlockData.height;
    } else {
      stxBlockHeight = block;
      stxBlockData = await stxBlockApi.getBlockByHeight({ height: stxBlockHeight }) as stackApiTypes.Block;
      stxBlockHash = stxBlockData.hash;
    }

    const btcMinerTx = stxBlockData.miner_txid.slice(2);
    const btcBlockHash = stxBlockData.burn_block_hash.slice(2);

    const stacksBlockExplorerLink = new URL(`/block/${stxBlockHash}?chain=mainnet`, STACKS_EXPLORER_ENDPOINT);

    const btcBlockExplorerLink = new URL(`/btc/block/${btcBlockHash}`, BLOCKCHAIN_EXPLORER_ENDPOINT);
    const btcTxExplorerLink = new URL(`/btc/tx/${btcMinerTx}`, BLOCKCHAIN_EXPLORER_ENDPOINT);

    const btcTxDataUrl = new URL(`/rawtx/${btcMinerTx}`, BLOCKCHAIN_INFO_API_ENDPOINT);

    const btcTxData = await fetchJson<{inputs: { prev_out: { addr: string }}[]}>({ url: btcTxDataUrl });
    const btcMinerAddr = btcTxData.result === 'ok' ? (btcTxData.response.inputs[0]?.prev_out?.addr ?? null) : null;
    const btcMinerAddrExplorerLink = new URL(`/btc/address/${btcMinerAddr}`, BLOCKCHAIN_EXPLORER_ENDPOINT);

    const stxMinerAddr = btcMinerAddr ? getAddressInfo(btcMinerAddr).stacks : null;
    const stxMinerAddrExplorerLink = stxMinerAddr ? new URL(`/address/${stxMinerAddr}?chain=mainnet`, STACKS_EXPLORER_ENDPOINT) : null;

    const payload = {
      stacksBlockHash: stxBlockHash,
      stacksBlockExplorer: stacksBlockExplorerLink.toString(),
      bitcoinBlockHash: btcBlockHash,
      bitcoinBlockExplorer: btcBlockExplorerLink.toString(),
      bitcoinTx: btcMinerTx,
      bitcoinTxExplorer: btcTxExplorerLink.toString(),
      minerBtcAddress: btcMinerAddr,
      minerBtcAddressExplorer: btcMinerAddrExplorerLink.toString(),
      minerStxAddress: stxMinerAddr,
      minerStxAddressExplorer: stxMinerAddrExplorerLink?.toString() ?? null,
    };

    reply.type('application/json').send(JSON.stringify(payload, null, 2));
  });

  fastify.get('/stx-block', {
    schema: {
      tags: ['Bitcoin info'],
      summary: 'Get the Stacks block associated with a Bitcoin block',
      querystring: Type.Object({
        'btc-block': Type.Union([
          Type.String({
            description: 'A bitcoin block hash',
            pattern: '^([0-9a-fA-F]{64})$',
          }),
          Type.Integer({
            description: 'A bitcoin block height'
          })
        ], {
          examples: ['00000000000000000007a5a46a5989b1e787346c3179a7e7d31ad99abdbc57c8', 746815],
        }),
      }),
    }
  }, async (req, reply) => {
    let stxBlock: any;
    if (typeof req.query['btc-block'] === 'string') {
      const stxBlockRes = await request(
        `${STACKS_API_ENDPOINT}/extended/v1/block/by_burn_block_hash/0x${req.query['btc-block']}`,
        { method: 'GET' }
      );
      stxBlock = await stxBlockRes.body.json();
    } else {
      const stxBlockRes = await request(
        `${STACKS_API_ENDPOINT}/extended/v1/block/by_burn_block_height/${req.query['btc-block']}`,
        { method: 'GET' }
      );
      stxBlock = await stxBlockRes.body.json();
    }
    reply.type('application/json').send(JSON.stringify({
      height: stxBlock.height,
      hash: stxBlock.hash,
      parent_block_hash: stxBlock.parent_block_hash
    }, null, 2));
  });
}
