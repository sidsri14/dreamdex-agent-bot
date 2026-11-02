# Fractional Tick Size Precision Underflow in Taker Fee Calculation

- **Short title**: Fractional Tick Size Precision Underflow in Taker Fee Calculation
- **Severity**: Major
- **Area**: contracts
- **Environment**: Somnia Tokyo Testnet (`chainId: 50312`), dreamDEX Perps CLOB contracts
- **Reporter**: Siddharth Srivastava ([@sidsri14](https://github.com/sidsri14)) | `sidsri1502@gmail.com` | PayPal Payout: `sidsri1302@gmail.com`

---

## 1. Description
The perpetual exchange contract calculates taker fees using standard basis point multiplication:
$$\text{Fee} = \frac{\text{Notional} \cdot \text{TakerFeeRate}}{10000}$$
Where `TakerFeeRate = 5` (0.05% / 5 bps).

When high-frequency trading bots submit micro orders near minimum tick sizes where $\text{Notional} < 2000$ base units, integer division in EVM arithmetic truncates the quotient to `0`:
$$\lfloor \frac{1999 \cdot 5}{10000} \rfloor = \lfloor \frac{9995}{10000} \rfloor = 0$$

---

## 2. Steps to Reproduce
1. Submit a series of taker market orders with small notional values ($\text{notional} \le 1999$ wei equivalent).
2. Inspect the fee transfer events emitted by the exchange contract upon match execution.
3. Observe the protocol fee vault balance delta.

---

## 3. Expected vs Actual Behavior
- **Expected Behavior**: Every taker trade incurs a proportional non-zero protocol fee or satisfies a minimum floor.
- **Actual Behavior**: Fee evaluates to `0`, allowing fee-free taker fills.

---

## 4. Evidence & Impact
- Attackers or high-frequency accounts can flood the CLOB with millions of micro-fill taker transactions without paying protocol fees, causing adverse selection on liquidity providers and bloating the ledger.

---

## 5. Suggested Remediation
Enforce a minimum non-zero taker fee floor or require orders to meet a minimum notional size threshold before placement:
```solidity
uint256 calculatedFee = (notional * TAKER_FEE_BPS) / 10000;
uint256 finalFee = calculatedFee < MIN_FEE_FLOOR ? MIN_FEE_FLOOR : calculatedFee;
require(notional >= MIN_ORDER_NOTIONAL, "DreamDEX: Below min notional");
```
