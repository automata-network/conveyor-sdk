import { ENVIRONMENT } from './lib/enums';
import {
  utils,
  Contract,
  BigNumber,
  ContractInterface,
  constants,
} from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { RELAYER_ENDPOINT_URL, FORWARDER_ADDRESS } from './lib/constants';
import getFeePrice from './lib/fee';
import * as eip712 from './lib/eip712';
import { verifyMetaTxnResponse, verifyFee } from './lib/eventListener';
import { MetaTxn, Response, Domain } from './lib/types';
import { abi as erc20Abi } from './abi/IERC20Permit.json';
import { abi as baseAbi } from './abi/ConveyorBase.json';
import { abi as forwarderAbi } from './abi/ConveyorForwarder.json';
import { SignatureLike } from '@ethersproject/bytes';
const { splitSignature, verifyTypedData } = utils;

const zeroAddress = constants.AddressZero;

export default class Conveyor {
  forwarderAddress: string;

  relayerConfig: string;

  provider: JsonRpcProvider;

  constructor(
    _provider: JsonRpcProvider,
    _forwarder?: string,
    _relayerConfig?: string,
    _env = ENVIRONMENT.PRODUCTION
  ) {
    this.provider = _provider;
    this.forwarderAddress =
      _forwarder || FORWARDER_ADDRESS[_provider.network.chainId];
    this.relayerConfig = _relayerConfig || RELAYER_ENDPOINT_URL(_env);
  }

  /**
   * This method checks for whether the implementation contract has enabled Conveyor protection
   * @param targetAddress - the address of the implementation contract
   * @returns true if Conveyor protection is enabled, false otherwise
   */
  async fetchConveyorStatus(targetAddress: string): Promise<boolean> {
    const implementation = new Contract(targetAddress, baseAbi, this.provider);
    const status = await implementation.conveyorIsEnabled();
    return status;
  }

  /**
   * Toggles Conveyor protection on the implementation contract
   * @param targetAddress - the address of the implementation contract
   * @param enabled - true: enable Conveyor protection, false: disable Conveyor protection
   */
  async toggleConveyorProtection(
    targetAddress: string,
    enabled: boolean
  ): Promise<Response> {
    const implementation = new Contract(targetAddress, baseAbi, this.provider);
    const signer = await this.provider.getSigner();
    let tx;
    if (enabled) {
      tx = await implementation.connect(signer).enableConveyorProtection();
    } else {
      tx = await implementation.connect(signer).disableConveyorProtection();
    }
    const receipt = await tx.wait();
    return {
      id: 1,
      jsonrpc: '2.0',
      result: {
        success: receipt.status === 1,
        errorMessage: receipt.status === 1 ? '' : 'Transaction Reverted',
        txnHash: receipt.transactionHash,
      },
    };
  }

  /**
   * Assigns an allowance to the Forwarder contract
   * First time users must invoke this method prior to calling the submitConveyorTransaction() method
   * @param amount - the allowance amount
   * @param tokenAddress - the token address
   */
  async erc20ApproveForwarder(
    amount: string,
    tokenAddress: string
  ): Promise<Response> {
    const erc20Token = new Contract(tokenAddress, erc20Abi, this.provider);
    const signer = await this.provider.getSigner();
    const tx = await erc20Token
      .connect(signer)
      .approve(this.forwarderAddress, amount);
    const receipt = await tx.wait();
    return {
      id: 1,
      jsonrpc: '2.0',
      result: {
        success: receipt.status === 1,
        errorMessage: receipt.status === 1 ? '' : 'Transaction Reverted',
        txnHash: receipt.transactionHash,
      },
    };
  }

  /**
   * Use this method to find out the amount of ERC20 fee token that is charged by the forwarder
   * @param txnHash - the hash of the transaction
   * @returns the ERC20 amount of the token, factored decimals.
   */
  async getFeeFromTxn(txnHash: string): Promise<BigNumber> {
    const fee = await verifyFee(this.provider, txnHash, this.forwarderAddress);
    return fee;
  }

  /**
   * @deprecated Use submitMetaTransaction instead
   */
  async submitConveyorTransaction(
    feeToken: string,
    gasLimit: string,
    gasPrice: string,
    duration: string,
    domainName: string,
    useOraclePriceFeed: boolean,
    extendCategories: Array<number>,
    targetAddress: string,
    targetAbi: ContractInterface,
    methodName: string,
    params: Array<any> = []
  ): Promise<Response> {
    const conveyorIsEnabled = await this.fetchConveyorStatus(targetAddress);
    if (!conveyorIsEnabled) {
      return this.submitTransaction(
        targetAddress,
        targetAbi,
        methodName,
        params
      );
    }
    const implementation = new Contract(
      targetAddress,
      targetAbi,
      this.provider
    );
    const forwarder = new Contract(
      this.forwarderAddress,
      forwarderAbi,
      this.provider
    );
    const encodedFunction = implementation.interface.encodeFunctionData(
      methodName,
      params
    );
    const chainId = await this.provider.network.chainId;
    const signer = await this.provider.getSigner();
    const signerAddress = await signer.getAddress();
    const txnFee = BigNumber.from(gasLimit).mul(BigNumber.from(gasPrice));
    const feeErc20 = new Contract(feeToken, erc20Abi, this.provider);
    const feeDecimal = await feeErc20.decimals();
    const maxTokenAmount =
      feeToken === zeroAddress
        ? BigNumber.from(0)
        : await getFeePrice(chainId, feeToken, feeDecimal, txnFee);
    const nonce = await forwarder.nonces(signerAddress);
    const now = Math.floor(Date.now() / 1000);
    const deadline = BigNumber.from(now).add(BigNumber.from(duration));
    const hexCategories = extendCategories.map(category => {
      return BigNumber.from(category).toHexString();
    });
    const message: MetaTxn = {
      from: signerAddress,
      to: targetAddress,
      feeToken: feeToken,
      useOraclePriceFeed: useOraclePriceFeed,
      maxTokenAmount: maxTokenAmount.toHexString(),
      deadline: deadline.toHexString(),
      nonce: nonce.toHexString(),
      data: encodedFunction,
      extendCategories: hexCategories,
    };
    const { sig, msg } = await _buildForwarderEIP712(
      this.provider,
      chainId,
      this.forwarderAddress,
      domainName,
      message,
      signerAddress
    );
    const signature = splitSignature(sig);
    const reqParam = [msg, signature.v.toString(), signature.r, signature.s];
    const reqOptions = _buildRequest(`/v3/metaTx/execute`, reqParam);
    console.log('sending request...');
    console.log(reqOptions);
    const jsonResponse = await fetch(this.relayerConfig, reqOptions);
    const response = (await jsonResponse.json()) as Response;
    const { result } = response;
    let res: Response;
    res = response;
    if (result.success) {
      res = await verifyMetaTxnResponse(this.provider, response);
    }
    console.log('response received...');
    console.log(res);
    return res;
  }

  /**
   * Sends transaction the relayer. Otherwise if conveyor is disabled, a regular transaction is sent to the target contract directly.
   * This method sends an API request using the executeMetaTxV2 method, which incorporates EIP 1271, a.k.a smart contracts signature verification.
   * @param feeToken - the fee token address
   * @param gasLimit - the gas limit
   * @param gasPrice - the gas price
   * @param duration - the duration in seconds until the meta-txn expires
   * @param domainName - the EIP712 domain name
   * @param useOraclePriceFeed - True: use an oracle price feed as a source to fetch fee token price, false: otherwise
   * @param extendCategories - array of numbers representing the extension categories
   * @param fromAddress - the sender address. Can be both an EOA or contract address
   * @param targetAddress - the address of the implementation contract
   * @param targetAbi - the abi of the implementation contract
   * @param methodName - the name of the method to invoke
   * @param params - OPTIONAL: the method parameters to be stored as an array
   */
  async submitMetaTransaction(
    feeToken: string,
    gasLimit: string,
    gasPrice: string,
    duration: string,
    domainName: string,
    useOraclePriceFeed: boolean,
    extendCategories: Array<number>,
    fromAddress: string,
    targetAddress: string,
    targetAbi: ContractInterface,
    methodName: string,
    params: Array<any> = []
  ) {
    const conveyorIsEnabled = await this.fetchConveyorStatus(targetAddress);
    if (!conveyorIsEnabled) {
      return this.submitTransaction(
        targetAddress,
        targetAbi,
        methodName,
        params
      );
    }
    const implementation = new Contract(
      targetAddress,
      targetAbi,
      this.provider
    );
    const forwarder = new Contract(
      this.forwarderAddress,
      forwarderAbi,
      this.provider
    );
    const encodedFunction = implementation.interface.encodeFunctionData(
      methodName,
      params
    );
    const chainId = await this.provider.network.chainId;
    const signer = await this.provider.getSigner();
    const signerAddress = await signer.getAddress();
    const txnFee = BigNumber.from(gasLimit).mul(BigNumber.from(gasPrice));
    const feeErc20 = new Contract(feeToken, erc20Abi, this.provider);
    const feeDecimal = await feeErc20.decimals();
    const maxTokenAmount =
      feeToken === zeroAddress
        ? BigNumber.from(0)
        : await getFeePrice(chainId, feeToken, feeDecimal, txnFee);
    const nonce = await forwarder.nonces(signerAddress);
    const now = Math.floor(Date.now() / 1000);
    const deadline = BigNumber.from(now).add(BigNumber.from(duration));
    const hexCategories = extendCategories.map(category => {
      return BigNumber.from(category).toHexString();
    });
    const message: MetaTxn = {
      from: fromAddress,
      to: targetAddress,
      feeToken: feeToken,
      useOraclePriceFeed: useOraclePriceFeed,
      maxTokenAmount: maxTokenAmount.toHexString(),
      deadline: deadline.toHexString(),
      nonce: nonce.toHexString(),
      data: encodedFunction,
      extendCategories: hexCategories,
    };
    const { sig, msg } = await _buildForwarderEIP712(
      this.provider,
      chainId,
      this.forwarderAddress,
      domainName,
      message,
      signerAddress
    );
    const senderIsContract = await _addressIsContract(
      this.provider,
      fromAddress
    );
    const signerType = senderIsContract ? 'CONTRACT' : 'EOA';
    const reqParam = [signerType, msg, sig];
    const reqOptions = _buildRequest(`/v3/metaTx/executeV2`, reqParam);
    console.log('sending request...');
    console.log(reqOptions);
    const jsonResponse = await fetch(this.relayerConfig, reqOptions);
    const response = (await jsonResponse.json()) as Response;
    const { result } = response;
    let res: Response;
    res = response;
    if (result.success) {
      res = await verifyMetaTxnResponse(this.provider, response);
    }
    console.log('response received...');
    console.log(res);
    return res;
  }

  /**
   * Invoke this method to submit a transaction directly to the contract.
   * WARNING: The transaction may be reverted if the method is protected by the onlyConveyor modifer
   * @param targetAddress
   * @param targetAbi
   * @param methodName
   * @param params
   * @returns
   */
  async submitTransaction(
    targetAddress: string,
    targetAbi: ContractInterface,
    methodName: string,
    params: Array<any> = []
  ): Promise<Response> {
    const implementation = new Contract(
      targetAddress,
      targetAbi,
      this.provider
    );
    const encodedFunction = implementation.interface.encodeFunctionData(
      methodName,
      params
    );
    const signer = await this.provider.getSigner();
    const tx = await signer.sendTransaction({
      to: targetAddress,
      data: encodedFunction,
    });
    const receipt = await tx.wait();
    return {
      id: 1,
      jsonrpc: '2.0',
      result: {
        success: receipt.status === 1,
        errorMessage: receipt.status === 1 ? '' : 'Transaction Reverted',
        txnHash: receipt.transactionHash,
      },
    };
  }
}

// helper functions

async function _addressIsContract(
  provider: JsonRpcProvider,
  address: string
): Promise<boolean> {
  const code = await provider.getCode(address);
  return code.length > 2;
}

async function _buildForwarderEIP712(
  provider: JsonRpcProvider,
  chainId: number,
  forwarderAddress: string,
  domainName: string,
  content: MetaTxn,
  signerAddress: string
) {
  const domain = await eip712.getDomain(forwarderAddress, chainId, domainName);
  const eip712Msg = {
    types: {
      EIP712Domain: eip712.DOMAIN_TYPE,
      Forwarder: eip712.FORWARDER_TYPE,
    },
    domain: domain,
    primaryType: 'Forwarder',
    message: content,
  };
  const data = JSON.stringify(eip712Msg);
  const signature: SignatureLike = await provider.send('eth_signTypedData_v4', [
    signerAddress,
    data,
  ]);
  if (content.from === signerAddress) {
    _verifySignature(domain, content, signature, signerAddress);
  }
  return { sig: signature, msg: eip712Msg };
}

function _buildRequest(method: string, params: Array<any>) {
  const jsonrpcRequest = {
    jsonrpc: '2.0',
    method: method,
    id: 1,
    params,
  };
  const reqOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(jsonrpcRequest),
  };
  return reqOptions;
}

function _verifySignature(
  domain: Domain,
  message: MetaTxn,
  signature: SignatureLike,
  signerAddress: string
): void {
  const recovered = verifyTypedData(
    domain,
    { Forwarder: eip712.FORWARDER_TYPE },
    message,
    signature
  );
  if (recovered !== signerAddress || recovered === zeroAddress) {
    throw new Error('Signature verification failed');
  }
}
