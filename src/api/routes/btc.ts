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
      response : {
        200: Type.Object({
          stacks: Type.String({
            description:'stacks address',
            examples:['SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7']
          }),
          bitcoin: Type.String({
            description:'bitcoin address',
            examples:['1FzTxL9Mxnm2fdmnQEArfhzJHevwbvcH6d']
          }),
          network: Type.String({
            description:'network',
            examples:['mainnet']
          })
        })
      }
    }
  }, (request, reply) => {
    const addrInfo = getAddressInfo(request.params.address, request.query.network);
    reply.type('application/json').send(addrInfo);
  });

  fastify.get('/addr/:address/balances', {
    schema: {
      tags: ['Bitcoin info'],
      summary: 'Get the STX and BTC balance for an address',
      params: Type.Object({
        address: Type.String({
          description: 'Specify either a Stacks or Bitcoin address',
          examples: ['SPRSDSRT18DS9R8Y2W13JTKF89NFHEGDWQPB78RE', '15XCtJkEDxE1nhFawvPY4QEkEyNywxNSfL'],
        }),
      }),
      response : {
        200 : Type.Object({
          stacks: Type.Object({
            address: Type.String({
              description: 'Specify either a Stacks or Bitcoin address',
              examples: ['SPRSDSRT18DS9R8Y2W13JTKF89NFHEGDWQPB78RE'],
            }),
            balance: Type.String({
              description: 'Account balance for the stacks address',
              examples: ["5000"],
            })
          }),
          bitcoin: Type.Object({
            address: Type.String({
              description: 'Bitcoin address',
              examples: ['15XCtJkEDxE1nhFawvPY4QEkEyNywxNSfL'],
            }),
            balance: Type.String({
              description: 'Account balance for the bitcoin address',
              examples: ["3.01321"],
            })
          })

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

    reply.type('application/json').send({
      stacks: {
        address: addrInfo.stacks,
        balance: stxBalanceFormatted
      },
      bitcoin: {
        address: addrInfo.bitcoin,
        balance: btcBalanceFormatted
      }
    });
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
      response: {
        200: Type.Object({
              stacksTx:  Type.String({
              description:'Stacks Transction ID',
              examples:['0xc4778249d7af16d004d5344be2683fae5c9263e22d5a2cdd6e1abf38bbdb8fa3']
                }),
              stacksTxExplorer: Type.String({
              description:'Stacks Transction ID',
              examples:['https://explorer.stacks.co/txid/0xc4778249d7af16d004d5344be2683fae5c9263e22d5a2cdd6e1abf38bbdb8fa3?chain=mainnet']
            }),
            stacksBlockHash: Type.String({
              description:'Stacks Transction ID',
              examples:['0x529ed0f3ef381bbb25e9ffe46db87aa3d3de185e31129004a4da010495cc0daa']
            }),
              stacksBlockExplorer: Type.String({
              description:'Stacks Transction ID',
              examples:['https://explorer.stacks.co/block/0x529ed0f3ef381bbb25e9ffe46db87aa3d3de185e31129004a4da010495cc0daa?chain=mainnet']
            }),
            bitcoinBlockHash: Type.String({
              description:'Stacks Transction ID',
              examples:['00000000000000000003e70c11501aaba9c0b21229ec75b6be9af4649cd2f8d9']
            }),
            bitcoinBlockExplorer: Type.String({
              description:'Stacks Transction ID',
              examples:['https://www.blockchain.com/btc/block/00000000000000000003e70c11501aaba9c0b21229ec75b6be9af4649cd2f8d9']
            }),
            bitcoinTx: Type.String({
              description:'Stacks Transction ID',
              examples:['d62956b9a1d7cc39e9f6210e3753bfaf10e5c6709b17245c1335befa3fe06d4c']
            }),
            bitcoinTxExplorer: Type.String({
              description:'Stacks Transction ID',
              examples:['https://www.blockchain.com/btc/tx/d62956b9a1d7cc39e9f6210e3753bfaf10e5c6709b17245c1335befa3fe06d4c']
            }),
            minerBtcAddress: Type.String({
              description:'Stacks Transction ID',
              examples:['18HTpsp3YuFqndkxxCJA6PXdtaFUQCfwK6']
            }),
            minerBtcAddressExplorer: Type.String({
              description:'Stacks Transction ID',
              examples:['https://www.blockchain.com/btc/address/18HTpsp3YuFqndkxxCJA6PXdtaFUQCfwK6']
            }),
            minerStxAddress: Type.String({
              description:'Stacks Transction ID',
              examples:['SP17YBVDTV7FNWDM5Y8PWXB9MQRT0FTWZXQBFA97A']
            }),
            minerStxAddressExplorer: Type.String({
              description:'Stacks Transction ID',
              examples:['https://explorer.stacks.co/address/SP17YBVDTV7FNWDM5Y8PWXB9MQRT0FTWZXQBFA97A?chain=mainnet']
            }),
        })
      }
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
    const btcMinerAddr = btcTxData.result === 'ok' ? (btcTxData.response.inputs[0]?.prev_out?.addr ?? "") : "";
    const btcMinerAddrExplorerLink = new URL(`/btc/address/${btcMinerAddr}`, BLOCKCHAIN_EXPLORER_ENDPOINT);

    const stxMinerAddr = btcMinerAddr ? getAddressInfo(btcMinerAddr).stacks : "";
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
      minerStxAddressExplorer: stxMinerAddrExplorerLink?.toString() ?? "",
    };

    reply.type('application/json').send(payload);
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

    reply.type('application/json').send(payload);
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
    reply.type('application/json').send({
      height: stxBlock.height,
      hash: stxBlock.hash,
      parent_block_hash: stxBlock.parent_block_hash
    });
  });
}
