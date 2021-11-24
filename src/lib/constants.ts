import { AddressMap } from './types';
import { ChainId } from './enums';

export const RELAYER_ENDPOINT_URL =
  'https://conveyor-geode-staging.ata.network';
export const FORWARDER_ADDRESS = '0x84194C00E190dE7A10180853f6a28502Ad1A1029';

export const DAI_ADDRESS: AddressMap = {
  [ChainId.MAINNET]: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  [ChainId.MATIC]: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
};

export const USDC_ADDRESS: AddressMap = {
  [ChainId.MAINNET]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  [ChainId.BSC]: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  [ChainId.MATIC]: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
};
