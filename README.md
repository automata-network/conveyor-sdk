# Introduction

The Conveyor SDK is a JavaScript library for developers to seamlessly interact with smart contracts that benefit from MEV protection with Conveyor.

Long story short, users submit meta-transactions to their contracts by following the three-step process below:

1. Instantiate the module and set your Web3 provider
2. Approve the Forwarder contract to collect fee payment with your choice of ERC20 tokens\*.
3. Submit a request and provide the necessary parameters.

\*ERC20 token must be enlisted on CoinGecko as a measure to determine market value, otherwise the transaction may be rejected for unsupported fee token.

---

# Specification

## Smart Contract

Implementation smart contracts must inherit the `ConveyorBase` contract. The `ConveyorBase` contract includes the following administrative methods:

- Toggle Conveyor protection using the `enableConveyorProtection` and `disableConyerProtection` methods.
- Configure the trusted forwarder address with `setForwarder`.
- The `onlyConveyor` modifier. Functions with the modifier can only be invoked by none other than the Forwarder contract.
- To retrieve the sender's address on the implementation contract, you must use the `msgSender()` instead of the default `msg.sender`.

### Source Code:

- `ConveyorBase`: https://github.com/automata-network/generic-conveyor/blob/main/contracts/ConveyorBase.sol
- Example Contract: https://github.com/automata-network/generic-conveyor/blob/main/contracts/test/Greeter.sol

## SDK

The main module has the following functions built-in:

- `erc20ApproveForwarder`- Sets an allowance for the Forwarder contract to transfer ERC20 tokens for fee payment.
- `submitMetaTransaction` - Constructs the request body to the Geode relayer to interact with contracts that are protected by Conveyor. (Note: The `submitConveyorTransaction()` method has been deprecated, it will be removed in future releases)
- `submitTransaction` - Submits a regular transaction directly to the target address. This can be used to execute methods that do not have the `onlyConveyor` modifier or to contracts that have disabled Conveyor protection.
- `fetchConveyorStatus` - detects whether Conveyor protection is enabled for the given target contract.
- `toggleConveyorProtection` - enables/disables Conveyor protection on the given target contract.

---

# Configurable Variables

The default `RELAYER_ENDPOINT_URL` and `FORWARDER_ADDRESS` are [included](./src/lib//constants.ts) in the SDK. This is because most projects are likely using the same relayer and Forwarder contract. If your projects were assigned to a dedicated relayer and/or forwarder, you may simply overwrite those variables, by passing the following object as a parameter to initialize the Conveyor module.

```javascript
// This is optional and overwrites the canon relayer and forwarder
const options = {
  forwarder: '0x84194C00E190dE7A10180853f6a28502Ad1A1029',
  relayerConfig: 'https://fake-relayer.com',
  env: ENVIRONMENT.TEST,
};

const conveyor = new Conveyor(web3, options);
```

# Quick Guide

As mentioned previously, submitting a transaction using Conveyor only requires three steps.

**Prerequisite**

Install the SDK by running:

```bash
yarn add @automata-network/conveyor-sdk
```

**Step 1: Instantiate the module and set your Web3 provider**

```javascript
import { Conveyor } from '@automata-network/conveyor-sdk';

const web3 = window.ethereum; // Metamask

const conveyor = new Conveyor(web3); // assigns default relayer and forwarder depending on chain id and the environment
```

**Step 2: Approve the Forwarder contract for collecting fees**

:warning: _This step must be performed before moving on to the next step. Otherwise, your transaction may fail due to zero allowance_

```javascript
await erc20ApproveForwarder(
  '100000000', // 100 USDC
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // USDC address on ETH
);
```

In the above example, the user is allocating 100 USDC of allowance to the Forwarder contract.

**Step 3: Submit the transaction**

The `submitMetaTransaction()` function requires the following parameters:

| Params               | Type          | Description                                                                                                                                                                                                                                                                                               |
| -------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feeToken`           | string        | **REQUIRED:** The fee token address                                                                                                                                                                                                                                                                       |
| `gasLimit`           | string        | **REQUIRED:** The gas limit - this value is used for calculating the maximum fee token amount, it may not be the actual gas limit provided to the transaction                                                                                                                                             |
| `gasPrice`           | string        | **REQUIRED:** The gas price - this value is used for calculating the maximum fee token amount, it may not be the actual gas price provided to the transaction                                                                                                                                             |
| `duration`           | string        | **REQUIRED:** The duration in seconds until the meta-txn expires                                                                                                                                                                                                                                          |
| `domainName`         | string        | **REQUIRED:** The EIP712 domain name                                                                                                                                                                                                                                                                      |
| `useOraclePriceFeed` | boolean       | **REQUIRED:** True: use an oracle price feed as a source to fetch fee token price, false: otherwise                                                                                                                                                                                                       |
| `extendCategories`   | Array<number> | **REQUIRED:** An array of numeric categories that maps to the request extension type. Pass the `[0]` value to omit extensions. To request an N-amount of extensions, provide an array of N-size with their corresponding categories. For example, to request x2 randomly generated numbers, input `[1,1]` |
| `fromAddress`        | string        | **REQUIRED:** This can be an EOA address or a smart contract address to support EIP 1271 Signature Verification. If an EOA address is provided, it must match the signing address, otherwise the transaction will fail.                                                                                   |
| `targetAddress`      | string        | **REQUIRED:** The address of the implementation contract                                                                                                                                                                                                                                                  |
| `targetAbi`          | string        | **REQUIRED:** The abi of the implementation contract                                                                                                                                                                                                                                                      |
| `methodName`         | string        | **REQUIRED:** The name of the method to invoke                                                                                                                                                                                                                                                            |
| `params`             | Array<any>    | **OPTIONAL:** The method parameters to be stored as an array                                                                                                                                                                                                                                              |

The `submitTransaction()` method can be invoked to execute functions that do not have the `onlyConveyor` modifier.

---

# Available extensions

This section describes the category index that are passed into the `extendCategories` parameter to get external data that can be useful for your target contracts.

| Category | Description                 |
| -------- | --------------------------- |
| 0        | No extension                |
| 1        | VRF Generated Random Number |
