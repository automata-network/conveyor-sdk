import { Response } from './types';
import { JsonRpcProvider } from '@ethersproject/providers';
import { utils, BigNumber } from 'ethers';
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
  let receipt = null;
  while (receipt === null) {
    receipt = await provider.getTransactionReceipt(response.result.txnHash!);
  }
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

/**
 * This function calculates the fee incurred by listening the Transfer events emitted from the Forwarder contract.
 * There are two Transfer events, one is a transfer of maxTokenAmount to the owner, and the other transfer only occured if the users were overcharged for the transaction.
 * Calculating the difference in amount from both Transfer events yields the fee incurred.
 * @param provider
 * @param txnHash
 * @param feeCollector
 */
export async function verifyFee(
  provider: JsonRpcProvider,
  txnHash: string,
  feeCollector: string
): Promise<BigNumber> {
  let receipt = null;
  while (receipt === null) {
    receipt = await provider.getTransactionReceipt(txnHash);
  }
  const logs = receipt.logs;
  let maxFee = BigNumber.from(0);
  let refund = BigNumber.from(0);
  for (const log of logs) {
    const transferTopic =
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    if (log.topics[0] === transferTopic) {
      const address0 = '0x' + (log.topics[1] as string).slice(26);
      const address1 = '0x' + (log.topics[2] as string).slice(26);
      if (address0 !== address1) {
        const iface = new Interface([
          'event Transfer(address indexed from, address indexed to, uint256 value)',
        ]);
        const decodedLog = iface.parseLog(log);
        const { value } = decodedLog.args;
        if (address1 === feeCollector) {
          maxFee = maxFee.add(value);
        } else if (address0 === feeCollector) {
          refund = refund.add(value);
        }
      }
    }
  }
  return maxFee.sub(refund);
}
