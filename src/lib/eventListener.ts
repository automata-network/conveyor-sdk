import { Response } from './types';
import { JsonRpcProvider } from '@ethersproject/providers';
import { utils } from 'ethers';
const { Interface } = utils;

/**
 * This function listens for the MetaStatus event emitted from the router contract.
 * Failure of meta-txn execution does not cause the transaction to revert, therefore this method is necessory to extract
 * the failure message.
 * @param provider
 * @param response
 */
export async function verifyMetaTxnResponse(
  provider: JsonRpcProvider,
  response: Response
): Promise<Response> {
  const receipt = await provider.getTransactionReceipt(
    response.result.txnHash!
  );
  const logs = receipt.logs;
  let res: Response;
  for (const log of logs) {
    let topicToQuery =
      '0xf624f223d0e1427abaf1ac2d9cf7c8487cad3018f0a93b5dafa867aed96165a3';
    if (log.topics[0] === topicToQuery) {
      const iface = new Interface([
        'event MetaStatus(address sender, bool success, string error)',
      ]);
      const decodedLog = iface.parseLog(log);
      const { success, error } = decodedLog.args;
      if (success === false) {
        res = {
          ...response,
          result: {
            txnHash: response.result.txnHash,
            success: false,
            errorMessage: error,
          },
        };
        return res;
      }
    }
  }
  return response;
}
