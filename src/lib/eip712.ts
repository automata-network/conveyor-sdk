import { BigNumber } from '@ethersproject/bignumber';
import { Domain } from './types';

export const DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

export const FORWARDER_TYPE = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'feeToken', type: 'address' },
  { name: 'maxTokenAmount', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'data', type: 'bytes' },
];

export const PERMIT_TYPE = [
  { name: 'owner', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
];

export const PERMIT_DAI_TYPE = [
  { name: 'holder', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'nonce', type: 'uint256' },
  { name: 'expiry', type: 'uint256' },
  { name: 'allowed', type: 'bool' },
];

export function getDomain(
  contractAddress: string,
  chain_id: number,
  domain_name: string
): Domain {
  return {
    name: domain_name,
    version: '1',
    chainId: BigNumber.from(chain_id).toHexString(),
    verifyingContract: contractAddress,
  };
}
