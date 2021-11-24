import {
  utils,
  Contract,
  Signature,
  BigNumber,
  ContractInterface,
  constants,
} from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
import {
  RELAYER_ENDPOINT_URL,
  FORWARDER_ADDRESS,
  DAI_ADDRESS,
} from './lib/constants';
import getFeePrice from './lib/fee';
import * as eip712 from './lib/eip712';
import { verifyMetaTxnResponse } from './lib/eventListener';
import {
  MetaTxn,
  Response,
  Domain,
  DaiPermitType,
  PermitType,
} from './lib/types';
import { abi as erc20Abi } from './abi/IERC20Permit.json';
import { abi as baseAbi } from './abi/ConveyorBase.json';
import { abi as forwarderAbi } from './abi/ConveyorForwarder.json';
const { splitSignature, verifyTypedData } = utils;

const zeroAddress = constants.AddressZero;

export default class Conveyor {
  provider: JsonRpcProvider;

  constructor(_provider: JsonRpcProvider) {
    this.provider = _provider;
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
      .approve(FORWARDER_ADDRESS, amount);
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
   * Sends request to the relayer. If Conveyor protection is disabled, a transaction is sent directly to the target contract.
   * @param feeToken - the fee token address
   * @param gasLimit - the gas limit
   * @param gasPrice - the gas price
   * @param duration - the duration in seconds until the meta-txn expires
   * @param domainName - the EIP712 domain name
   * @param useOraclePriceFeed - True: use an oracle price feed as a source to fetch fee token price, false: otherwise
   * @param targetAddress - the address of the implementation contract
   * @param targetAbi - the abi of the implementation contract
   * @param methodName - the name of the method to invoke
   * @param params - OPTIONAL: the method parameters to be stored as an array
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
      FORWARDER_ADDRESS,
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
    const maxTokenAmount = await getFeePrice(
      chainId,
      feeToken,
      feeDecimal,
      txnFee
    );
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
      FORWARDER_ADDRESS,
      domainName,
      message,
      signerAddress
    );
    const reqParam = [msg, sig.v.toString(), sig.r, sig.s];
    const reqOptions = _buildRequest(`/v3/metaTx/execute`, reqParam);
    console.log('sending request...');
    console.log(reqOptions);
    const jsonResponse = await fetch(RELAYER_ENDPOINT_URL, reqOptions);
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
   * Same as submitConveyorTransaction(), supports EIP2612 permit (and DAI-like) fee tokens.
   * @param feeToken - the fee token address
   * @param gasLimit - the gas limit
   * @param gasPrice - the gas price
   * @param duration - the duration in seconds until the meta-txn expires
   * @param domainName - the EIP712 domain name
   * @param useOraclePriceFeed - True: use an oracle price feed as a source to fetch fee token price, false: otherwise
   * @param targetAddress - the address of the implementation contract
   * @param targetAbi - the abi of the implementation contract
   * @param methodName - the name of the method to invoke
   * @param params - OPTIONAL: the method parameters to be stored as an array
   */
  async submitConveyorTransactionWithPermit(
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
      return await this.submitTransaction(
        targetAddress,
        targetAbi,
        methodName,
        params
      );
    }
    const now = Math.floor(Date.now() / 1000);
    const deadline = BigNumber.from(now).add(BigNumber.from(duration));
    const chainId = await this.provider.network.chainId;
    const signer = await this.provider.getSigner();

    // generate the PERMIT signature
    const { sig: permitSig, msg: permitMsg } = await _buildPermitSignature(
      this.provider,
      chainId,
      feeToken,
      deadline
    );

    const signerAddress = await signer.getAddress();
    const implementation = new Contract(
      targetAddress,
      targetAbi,
      this.provider
    );
    const forwarder = new Contract(
      FORWARDER_ADDRESS,
      forwarderAbi,
      this.provider
    );
    const encodedFunction = implementation.interface.encodeFunctionData(
      methodName,
      params
    );
    const txnFee = BigNumber.from(gasLimit).mul(BigNumber.from(gasPrice));
    const feeErc20 = new Contract(feeToken, erc20Abi, this.provider);
    const feeDecimal = await feeErc20.decimals();
    const maxTokenAmount = await getFeePrice(
      chainId,
      feeToken,
      feeDecimal,
      txnFee
    );
    const nonce = await forwarder.nonces(signerAddress);
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
      FORWARDER_ADDRESS,
      domainName,
      message,
      signerAddress
    );
    const reqParam = [
      msg,
      sig.v.toString(),
      sig.r,
      sig.s,
      permitMsg,
      permitSig.v.toString(),
      permitSig.r,
      permitSig.s,
    ];
    const methods =
      feeToken === DAI_ADDRESS[chainId]
        ? 'executeWithDAIPermit'
        : 'executeWithPermit';
    const reqOptions = _buildRequest(`/v3/metaTx/${methods}`, reqParam);
    const jsonResponse = await fetch(RELAYER_ENDPOINT_URL, reqOptions);
    let response = (await jsonResponse.json()) as Response;
    const { result } = response;
    if (result.success) {
      response = await verifyMetaTxnResponse(this.provider, response);
    }
    console.log('response received...');
    console.log(response);
    return response;
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
  const signature: Signature = await provider.send('eth_signTypedData_v4', [
    signerAddress,
    data,
  ]);
  _verifySignature(domain, content, signature, signerAddress);
  return { sig: splitSignature(signature), msg: eip712Msg };
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
  signature: Signature,
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

async function _buildPermitSignature(
  provider: JsonRpcProvider,
  chainId: number,
  feeToken: string,
  deadline: BigNumber
) {
  const domain = await eip712.getDomain(feeToken, chainId, 'Permit');
  let permitType;
  let permitContent: PermitType | DaiPermitType;
  const signer = await provider.getSigner();
  const user = await signer.getAddress();
  const token = new Contract(feeToken, erc20Abi, provider);
  const nonce = await token.nonces(user);
  if (feeToken === DAI_ADDRESS[chainId]) {
    permitType = eip712.PERMIT_DAI_TYPE;
    permitContent = {
      holder: user,
      spender: FORWARDER_ADDRESS,
      nonce: nonce.toHexString(),
      expiry: deadline.toHexString(),
      allowed: true,
    };
  } else {
    permitType = eip712.PERMIT_TYPE;
    permitContent = {
      owner: user,
      spender: FORWARDER_ADDRESS,
      value: BigNumber.from('1000000000000000000000000000000').toHexString(),
      nonce: nonce.toHexString(),
      deadline: deadline.toHexString(),
    };
  }
  const message = {
    types: {
      EIP712Domain: eip712.DOMAIN_TYPE,
      Permit: permitType,
    },
    domain: domain,
    primaryType: 'Permit',
    message: permitContent,
  };
  const data = JSON.stringify(message);
  const signature: Signature = await provider.send('eth_signTypedData_v4', [
    user,
    data,
  ]);
  return { sig: splitSignature(signature), msg: message };
}
