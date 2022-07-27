import { Server } from 'http';
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { FastifyPluginCallback } from "fastify";
import { Type } from '@sinclair/typebox';
import { fetchJson, getAddressInfo } from '../util';
import { request, fetch as undiciFetch } from 'undici';
import * as stacksApiClient from '@stacks/blockchain-api-client';
import * as stackApiTypes from '@stacks/stacks-blockchain-api-types';
import { BLOCKCHAIN_EXPLORER_ENDPOINT, BLOCKCHAIN_INFO_API_ENDPOINT, STACKS_API_ENDPOINT, STACKS_EXPLORER_ENDPOINT } from '../../consts';


export const BtcRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async (fastify, options, done) => {
  fastify.get('/addr/:address', {
    schema: {
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
      params: Type.Object({
        address: Type.String({
          description: 'Specify either a Stacks or Bitcoin address',
          examples: ['SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7', '1FzTxL9Mxnm2fdmnQEArfhzJHevwbvcH6d'],
        }),
      })
    }
  }, async (req, reply) => {
    const addrInfo = getAddressInfo(req.params.address, 'mainnet');

    const stxBalanceReq = await request(
      `${STACKS_API_ENDPOINT}/extended/v1/address/${addrInfo.stacks}/balances`, { method: 'GET' }
    );
    const stxBalance = await stxBalanceReq.body.json();
    const btcBalanceReq = await request(
      `${BLOCKCHAIN_INFO_API_ENDPOINT}/rawaddr/${addrInfo.bitcoin}?limit=0`
    );
    const btcBalance = await btcBalanceReq.body.json();

    reply.type('application/json').send(JSON.stringify({
      stacks: {
        address: addrInfo.stacks,
        balance: stxBalance.stx.balance
      },
      bitcoin: {
        address: addrInfo.bitcoin,
        balance: btcBalance.final_balance.toString()
      }
    }, null, 2));
  });


  fastify.get('/tx-btc-info/:txid', {
    schema: {
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

}
