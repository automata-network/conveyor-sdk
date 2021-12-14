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

export type AddressMap = { [chainId: number]: string };
