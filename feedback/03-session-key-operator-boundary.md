# Session Key Operator Expiry Timestamp Boundary Ambiguity

- **Short title**: Session Key Operator Expiry Timestamp Boundary Ambiguity
- **Severity**: Normal
- **Area**: contracts / SDK
- **Environment**: Somnia Tokyo Testnet (`chainId: 50312`), dreamDEX Session Key delegation
- **Reporter**: Siddharth Srivastava ([@sidsri14](https://github.com/sidsri14)) | `sidsri1502@gmail.com` | PayPal Payout: `sidsri1302@gmail.com`

---

## 1. Description
When managing non-custodial session key delegations via `grantOperator`:
```solidity
function isValidOperator(address account, address operator) public view returns (bool) {
    OperatorPermission memory perm = operatorPermissions[account][operator];
    return perm.isActive && block.timestamp <= perm.expiry;
}
```
During automated cancellation and rapid re-delegation loops, if an order transaction lands in the block where `block.timestamp == perm.expiry`, local RPC node simulation might evaluate `isValidOperator` as `true` (if local client clock has minor drift), while validator nodes pack the block with a timestamp exceeding `expiry`, causing unexpected transaction reverts without descriptive error payloads.

---

## 2. Steps to Reproduce
1. Grant operator permission to a delegate session key with a short duration (e.g. 5 minutes).
2. Dispatch an order transaction when local system clock indicates 1 second before expiry.
3. If block packaging occurs across the timestamp boundary, the transaction reverts without a distinct error message.

---

## 3. Expected vs Actual Behavior
- **Expected Behavior**: Deterministic behavior with an explicit error (e.g. `OperatorExpired(expiry, block.timestamp)`).
- **Actual Behavior**: Generic revert or unexpected dropped state during block execution.

---

## 4. Evidence & Impact
- Client-side trading agents risk stalling execution loops during session transitions.
- In `dreamDEX Agent Bot`, a client-side 60-second safety buffer (`sessionKeyBufferMs = 60_000`) was required to prevent dropped trades.

---

## 5. Suggested Remediation
1. Use strict inequality (`block.timestamp < perm.expiry`).
2. Emit custom error `OperatorExpired(uint256 currentTimestamp, uint256 expiryTimestamp)` to allow client bots to gracefully re-authenticate without crashing.
