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
  { name: 'useOraclePriceFeed', type: 'bool' },
  { name: 'maxTokenAmount', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'data', type: 'bytes' },
  { name: 'extendCategories', type: 'uint256[]' },
];

export function getDomain(
  contractAddress: string,
  chain_id: number,
  domain_name: string
): Domain {
  return {
    name: domain_name,
    version: '1',
    chainId: '0x' + chain_id.toString(16),
    verifyingContract: contractAddress,
  };
}
