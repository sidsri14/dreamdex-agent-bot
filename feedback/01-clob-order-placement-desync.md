# Interface Desynchronization in CLOB Order Placement (`placeTakerOrderWithoutVault` vs `placeOrder`)

- **Short title**: CLOB Order Placement Interface Desynchronization
- **Severity**: Major
- **Area**: SDK / contracts / docs
- **Environment**: Somnia Tokyo Testnet (`chainId: 50312`), Node.js v24.19.0, dreamDEX Testnet Contracts (`app.testnet.dreamdex.io`)
- **Reporter**: Siddharth Srivastava ([@sidsri14](https://github.com/sidsri14)) | `sidsri1502@gmail.com` | PayPal Payout: `sidsri1302@gmail.com`

---

## 1. Description
The public dreamDEX developer documentation and initial TypeScript SDK examples reference the legacy order placement method:
```solidity
function placeTakerOrderWithoutVault(
    address market,
    uint256 size,
    uint256 maxSlippage
) external returns (bytes32 orderId);
```
However, calling this function on the deployed Somnia Tokyo Testnet contracts reverts with an empty EVM revert reason (`0x`). Static bytecode inspection and contract ABI analysis indicate the interface has transitioned to a unified order placement endpoint:
```solidity
function placeOrder(
    bool isBid,
    uint256 price,
    uint256 size,
    uint8 orderType
) external returns (bytes32 orderId);
```

---

## 2. Steps to Reproduce
1. Initialize an algorithmic agent using the documented SDK client helper method `placeTakerOrderWithoutVault`.
2. Construct a market order targeting the ETH-PERP testnet market with 1% max slippage.
3. Sign and broadcast the transaction via the Somnia Tokyo RPC endpoint (`https://dream-rpc.somnia.network`).
4. Observe the transaction receipt status.

---

## 3. Expected vs Actual Behavior
- **Expected Behavior**: The SDK transaction successfully matches or places the taker order against the CLOB, or reverts with a descriptive error string.
- **Actual Behavior**: The transaction execution reverts with `0x` due to unrecognized function selector collision against the updated contract ABI.

---

## 4. Evidence & Impact
- Any automated liquidator, copy-trader, or algorithmic bot relying on the documented helper method encounters 100% failure during taker execution.
- Verified in `dreamDEX Agent Bot` (`src/order-engine.ts`) where switching to explicit `placeOrder` interface resolved the failure.

---

## 5. Suggested Remediation
1. Update developer documentation and npm SDK exports to match `placeOrder(bool isBid, uint256 price, uint256 size, uint8 orderType)`.
2. Add a custom error `LegacyEndpointDeprecated()` to return explicit error messages for outdated client calls.
