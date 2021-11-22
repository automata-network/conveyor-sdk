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
  extendCategories: number[];
}

export interface Domain {
  name: string;
  version: string;
  chainId: string;
  verifyingContract: string;
}

export interface PermitType {
  owner: string;
  spender: string;
  value: string;
  nonce: string;
  deadline: string;
}

export interface DaiPermitType {
  holder: string;
  spender: string;
  nonce: string;
  expiry: string;
  allowed: boolean;
}

export type AddressMap = { [chainId: number]: string };
