import * as eip712 from './eip712';

export interface Response {
  id: number;
  jsonrpc: string;
  result: {
    errorMessage: string | undefined;
    success: boolean;
    txnHash: string | undefined;
  };
}

export interface MetaTxn {
  from: string;
  to: string;
  feeToken: string;
  useOraclePriceFeed: boolean;
  maxTokenAmount: string;
  deadline: string;
  nonce: string;
  data: string;
  extendCategories: string[];
}

export interface Domain {
  name: string;
  version: string;
  chainId: string;
  verifyingContract: string;
}

export interface EIP712Type {
  types: {
    EIP712Domain: typeof eip712.DOMAIN_TYPE;
    Forwarder: typeof eip712.FORWARDER_TYPE;
  };
  domain: Domain;
  primaryType: string;
  message: MetaTxn;
}

export type AddressMap = { [chainId: number]: string };

export type ConfigMap = { [env: number]: string[] };
