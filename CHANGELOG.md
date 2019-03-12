# Pre release changelog & notes

## 0.2.0

### New features
 - `getFirmwareVersion()` - output of this may change
 - `getOperationMode()` and `setOperationMode`
 - `randomBytes(size)` - get random bytes from ledger (Up to 255 bytes)
 - `getFingerPrint(path)` - get fingerprint of the path.
 - `signMessage(message)` - will return signature wrapped in `LedgerSignature`.
 - `verifyMessage(path, message, signature)` - verify message using public key
  from ledger.
 -  `LedgerSignature` helper that has several serialization methods:
    - `fromLedgerSignature/toLedgerSignature` - DER with first byte having recid
    - `fromDER/toDER` - DER encoded signature.
    - `decode/encode` - Just R/S encoding.
    - `fromCoreSignature/toCoreSignature` - Bitcoin signed message encoding
    - `verifyMessage(msg, publicKey, prefix = BITCOIN_MAGIC)` - verify message.
    - `verify(hash, publicKey)` - verify hash.
    - `recoverMessage(msg, compress = true, prefix = BITCOIN_MAGIC)` - recover
    public key from message and signature.
    - `recover(hash, compress = true)` - recover public key from hash and sig.

### API Changes
  - `getPublicKey(path, addressFlags = 0)` changed to
`getPublicKey(path, parentFingerPrint = false, addressFlags = 0)`
    - `parentFingerPrint = 1` will return parentFingerprint with `HDPublicKey`
    object.

### Notes
  - Removed karma in favor of `bmocha`.
