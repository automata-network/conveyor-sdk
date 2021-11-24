import { AddressMap } from './types';
import { ChainId } from './enums';

export const RELAYER_ENDPOINT_URL = '';
export const FORWARDER_ADDRESS = '';

export const DAI_ADDRESS: AddressMap = {
  [ChainId.MAINNET]: '0x6b175474e89094c44da98b954eedeac495271d0f',
  [ChainId.BSC]: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3',
  [ChainId.MATIC]: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
};

export const USDC_ADDRESS: AddressMap = {
  [ChainId.MAINNET]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  [ChainId.BSC]: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  [ChainId.MATIC]: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
};
