import { utils, Contract, Signature, BigNumber, ContractInterface, constants } from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
const { splitSignature, verifyTypedData } = utils;
import { RELAYER_ENDPOINT_URL, FORWARDER_ADDRESS } from './lib/constants';
import getFeePrice from './lib/fee';
import * as eip712 from './lib/eip712';
import { verifyMetaTxnResponse } from './lib/eventListener';
import { abi as erc20Abi } from './abi/IERC20Permit.json';
import { abi as baseAbi } from './abi/ConveyorBase.json';
import { abi as forwarderAbi } from './abi/ConveyorForwarder.json';

const zeroAddress = constants.AddressZero;

export interface Response {
    id: number
    jsonrpc: string
    result: {
      errorMessage: string | undefined
      success: boolean
      txnHash: string | undefined
    }
}

interface MetaTxn {
    from: string;
    to: string;
    feeToken: string;
    maxTokenAmount: BigNumber;
    deadline: BigNumber;
    nonce: BigNumber;
    data: string;
}

export default class Conveyor {
    
    provider: JsonRpcProvider;

    constructor(_provider: JsonRpcProvider) {
        this.provider = _provider;
    }

    _verifySignature(
        domain: eip712.TypedDomain,
        message: MetaTxn,
        signature: Signature,
        signerAddress: string
      ): void {
        const recovered = verifyTypedData(domain, { Forwarder: eip712.FORWARDER_TYPE }, message, signature)
        if (recovered !== signerAddress || recovered === zeroAddress) {
            throw new Error('Signature verification failed');
        }
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
     * Assigns an allowance to the Forwarder contract
     * First time users must invoke this method prior to calling the submitConveyorTransaction() method
     * @param amount - the allowance amount
     * @param tokenAddress - the token address
     */
    async erc20ApproveForwarder(amount: string, tokenAddress: string): Promise<void> {
        const erc20Token = new Contract(tokenAddress, erc20Abi, this.provider);
        await erc20Token.approve(FORWARDER_ADDRESS, amount);
    }

    /**
     * 
     * @param feeToken - the fee token address
     * @param gasLimit - the gas limit
     * @param gasPrice - the gas price
     * @param duration - the duration in seconds until the meta-txn expires
     * @param domainName - the EIP712 domain name
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
        targetAddress: string,
        targetAbi: ContractInterface,
        methodName: string,
        params: Array<any> = []
    ): Promise<Response> {
        const conveyorIsEnabled = await this.fetchConveyorStatus(targetAddress);
        const implementation = new Contract(targetAddress, targetAbi, this.provider);
        const forwarder = new Contract(FORWARDER_ADDRESS, forwarderAbi, this.provider);
        const encodedFunction = implementation.interface.encodeFunctionData(methodName, params);
        const chainId = await this.provider.network.chainId;
        const signer = await this.provider.getSigner();
        const signerAddress = await signer.getAddress();
        let res: Response;
        if (conveyorIsEnabled) {
            const txnFee = BigNumber.from(gasLimit).mul(BigNumber.from(gasPrice));
            const feeErc20 = new Contract(feeToken, erc20Abi, this.provider);
            const feeDecimal = await feeErc20.decimals();
            const maxTokenAmount = await getFeePrice(chainId, feeToken, feeDecimal, txnFee);
            const nonce = await forwarder.nonces(signerAddress);
            const now = Math.floor(Date.now() / 1000);
            const deadline = BigNumber.from(now).add(BigNumber.from(duration));
            const message: MetaTxn = {
                from: signerAddress,
                to: targetAddress,
                feeToken: feeToken,
                maxTokenAmount: maxTokenAmount,
                deadline: deadline,
                nonce: nonce,
                data: encodedFunction
            }
            const domain = await eip712.getDomain(targetAddress, chainId, domainName);
            const eip712Msg = {
                types: {
                    EIP712Domain: eip712.DOMAIN_TYPE,
                    Forwarder: eip712.FORWARDER_TYPE
                  },
                domain,
                primaryType: 'Forwarder',
                message
            }
            const data = JSON.stringify(eip712Msg);
            const signature: Signature = await this.provider.send(
                'eth_signTypedData_v4',
                [signerAddress, data]
            );
            const { v, r, s } = splitSignature(signature);
            this._verifySignature(domain, message, signature, signerAddress);
            const reqParam = [ chainId.toString(), eip712Msg, v.toString(), r, s ];
            const jsonrpcRequest = {
                jsonrpc: '2.0',
                method: `/v3/metaTx/execute`, // need to check in with @liaoyi
                id: 1,
                reqParam
            };
            const reqOptions = {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(jsonrpcRequest)
            };
            const jsonResponse = await fetch(RELAYER_ENDPOINT_URL, reqOptions);
            const response = (await jsonResponse.json()) as Response;
            res = response;
            const { result } = response;
            if (result.success) {
                res = await verifyMetaTxnResponse(this.provider, response);
            }
            return res;
        } else {
            const tx = await signer.sendTransaction({
                to: targetAddress,
                data: encodedFunction,
                gasLimit: BigNumber.from(gasLimit),
                gasPrice: BigNumber.from(gasPrice),
            });
            const receipt = await tx.wait();
            res = {
                id: 1,
                jsonrpc: '2.0',
                result: {
                    success: receipt.status === 1,
                    errorMessage: receipt.status === 1 ? '' : 'Transaction Failed',
                    txnHash: receipt.transactionHash
                }
            }
        }
        return res;
    }
}