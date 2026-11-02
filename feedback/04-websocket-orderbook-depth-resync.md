# Missing Sequence Gap Detection in WebSocket Orderbook Snapshot Delta Stream

- **Short title**: WebSocket Orderbook Depth Stream Missing Sequence Gap Recovery
- **Severity**: Major
- **Area**: API / SDK / app
- **Environment**: Somnia Tokyo Testnet, dreamDEX WebSocket feed (`wss://...`), Node.js v24.19.0
- **Reporter**: Siddharth Srivastava ([@sidsri14](https://github.com/sidsri14)) | `sidsri1502@gmail.com` | PayPal Payout: `sidsri1302@gmail.com`

---

## 1. Description
The WebSocket depth stream pushes initial orderbook snapshot followed by incremental depth updates (deltas). However, individual depth delta frames do not consistently transmit monotonically increasing `sequenceId` or `lastUpdateId` fields linking back to the snapshot's baseline ID.

---

## 2. Steps to Reproduce
1. Establish a WebSocket connection to the market depth channel for ETH-PERP.
2. Ingest the baseline snapshot (`depthSnapshot`).
3. Simulate temporary packet loss or network jitter by dropping 2 consecutive WebSocket delta frames.
4. Attempt to verify whether local orderbook state aligns with the remote exchange state.

---

## 3. Expected vs Actual Behavior
- **Expected Behavior**: Each delta packet carries `prevSequenceId` and `sequenceId` so client agents can detect missed packets and trigger an automatic re-snapshot resync.
- **Actual Behavior**: Deltas lack explicit linkable sequence anchors, leading to silent price-level drift and ghost liquidity if packets are dropped during network congestion.

---

## 4. Evidence & Impact
- Algorithmic market makers and high-frequency bots rely on strictly accurate local orderbook depth. Silent desync can cause bots to place orders against non-existent depth, leading to unintended adverse fills or slippage breaches.
- In `dreamDEX Agent Bot`, we addressed this by implementing periodic 5-second polling reconciliation against REST `/depth` to self-heal stale orderbooks.

---

## 5. Suggested Remediation
1. Include `u` (final update ID) and `pu` (previous final update ID) in all WebSocket depth stream frames matching standard exchange conventions (e.g. Binance/dYdX CLOB protocols).
2. Explicitly document client reconnection and re-snapshot requirements when a sequence gap (`pu != last_u`) is detected.
