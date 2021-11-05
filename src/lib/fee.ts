import { BigNumber } from 'ethers';
import { ChainId } from './enums';
import { BigNumber as JSBigNumber } from 'bignumber.js';

export const PRICE_API_PREFIX: { [chainId in ChainId]?: string } = {
  [ChainId.BSC]:
    'https://api.coingecko.com/api/v3/simple/token_price/binance-smart-chain?',
  [ChainId.MATIC]:
    'https://api.coingecko.com/api/v3/simple/token_price/polygon-pos?',
  [ChainId.MAINNET]:
    'https://api.coingecko.com/api/v3/simple/token_price/ethereum?',
};

/**
 * This function converts a transaction fee to the equivalent value of the provided payment token
 * @param chainId the chainID of the network
 * @param token the payment token
 * @param tokenDecimals the decimals of the token
 * @param gasFee the transaction fee
 * @param nativeToken the native token of the network. 'eth', 'bsc' etc
 * @param nativeTokenDecimals defaults at 18
 * @return the total amount of tokens to be paid for the transaction fee
 */
async function calculateFee(
  chainId: ChainId,
  token: string,
  tokenDecimals: BigNumber,
  gasFee: BigNumber,
  nativeToken: string,
  nativeTokenDecimals = 18
): Promise<BigNumber> {
  const priceApiPrefix = PRICE_API_PREFIX[chainId];
  if (!priceApiPrefix) {
    throw new Error(
      `Error: API support for the provided chainId ${chainId} is not supported`
    );
  }
  const response = await fetch(
    `${priceApiPrefix}contract_addresses=${token}&vs_currencies=${nativeToken}`
  );
  const data: Promise<any> = response.json().then(res => {
    if (Object.keys(res).length === 0) {
      throw new Error('Error: Unsupported fee token.');
    }
    return Object.values(res)[0];
  });
  let ethPerToken: number;
  if (nativeToken === 'eth') {
    const { eth } = await data;
    ethPerToken = eth;
  } else if (nativeToken === 'bnb') {
    const { bnb } = await data;
    ethPerToken = bnb;
  } else {
    throw new Error(
      'Error: Unsupported native token. Use the calculateFeeOnMatic() method for calculating fees on the Matic network.'
    );
  }
  const factor = new JSBigNumber(10)
    .pow(nativeTokenDecimals)
    .div(new JSBigNumber(10).pow(tokenDecimals.toString()));
  const adjustedPrice = new JSBigNumber(ethPerToken).multipliedBy(factor); // WEI per token - adjusted for the token decimals
  const fee = new JSBigNumber(gasFee.toString()).div(adjustedPrice);
  const roundedFee = fee.toFixed(0, 2);
  const max = parseInt(roundedFee) < 1 ? '1' : roundedFee;
  return BigNumber.from(max);
}

/**
 * Same as the calculateFee() method but used exclusively for calculating token fees on the Matic network
 * @param token the payment token
 * @param tokenDecimals the decimals of the token
 * @param gasFee the transaction fee
 * @returns the total amount of tokens to be paid for the transaction fee
 */
async function calculateFeeOnMatic(
  token: string,
  tokenDecimals: BigNumber,
  gasFee: BigNumber
): Promise<BigNumber> {
  const priceApiPrefix = PRICE_API_PREFIX[ChainId.MATIC];
  const response = await fetch(
    `${priceApiPrefix}contract_addresses=${token}&vs_currencies=bnb`
  );
  const data: Promise<any> = response.json().then(res => {
    if (Object.keys(res).length === 0) {
      throw new Error('Error: Unsupported fee token.');
    }
    return Object.values(res)[0];
  });
  const { bnb } = await data;
  const adjustedBnbPerToken = new JSBigNumber(bnb)
    .multipliedBy(new JSBigNumber(10).pow(18))
    .div(new JSBigNumber(10).pow(tokenDecimals.toString()));
  const maticBnbRatioApi =
    'https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=bnb';
  const maticResponse = await fetch(maticBnbRatioApi);
  const maticResponseMap = await maticResponse.json();
  const maticData = maticResponseMap['matic-network'];
  const maticBnb = maticData['bnb'];
  const bnbPerMatic = new JSBigNumber(maticBnb);

  const fee = new JSBigNumber(gasFee.toString()).div(
    adjustedBnbPerToken.div(bnbPerMatic)
  );
  const roundedFee = fee.toFixed(0, 2);
  const max = parseInt(roundedFee) < 1 ? '1' : roundedFee;
  return BigNumber.from(max);
}

export default async function getFeePrice(
  chainId: ChainId,
  token: string,
  tokenDecimals: BigNumber,
  gasFee: BigNumber,
  nativeToken?: string,
  nativeTokenDecimals = 18
): Promise<BigNumber> {
  switch (chainId) {
    case ChainId.MATIC:
      return calculateFeeOnMatic(token, tokenDecimals, gasFee);
    case ChainId.MAINNET:
      return calculateFee(
        chainId,
        token,
        tokenDecimals,
        gasFee,
        'eth',
        nativeTokenDecimals
      );
    case ChainId.BSC:
      return calculateFee(
        chainId,
        token,
        tokenDecimals,
        gasFee,
        'bnb',
        nativeTokenDecimals
      );
    default:
      return calculateFee(
        chainId,
        token,
        tokenDecimals,
        gasFee,
        nativeToken!,
        nativeTokenDecimals
      );
  }
}
