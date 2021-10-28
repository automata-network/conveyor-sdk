export interface TypedDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

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

export function getDomain(
  contractAddress: string,
  chain_id: number,
  domain_name: string
): TypedDomain {
  return {
    name: domain_name,
    version: '1',
    chainId: chain_id,
    verifyingContract: contractAddress,
  };
}
