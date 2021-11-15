import { AddressMap } from './types';
import { ChainId } from './enums';

export const RELAYER_ENDPOINT_URL = '';
export const FORWARDER_ADDRESS = '';

export const DAI_ADDRESS: AddressMap = {
  [ChainId.MAINNET]: '0x6b175474e89094c44da98b954eedeac495271d0f',
  [ChainId.BSC]: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3',
  [ChainId.MATIC]: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
};
