Examples
===

There are three ways to communicate with Ledger Device.
From browser using `webusb` and `webauthn` and using `HID` from nodejs.
Most of the examples are on node.js.

* [./bcoin-getPublicKey.js][getPublicKey] - Get public key for BIP32 path.
* [./bcoin-getXPUBs.js][getXPUBs] - Get XPUB and public keys from it.
* [./bcoin-verifyAddress.js][verify] - Verify addresses on device screen.
* [./bcoin-p2pkh.js][p2pkh] - Sign P2PKH transaction.
* [./bcoin-getP2SH-address.js][getP2SHaddr] - Get P2SH address.
* [./bcoin-spendP2SH.js][spendP2SH] - Sign P2SH transaction.
* [./bcoin-p2wpkh.js][p2wpkh] - Sign P2WPKH transaction.
* [./webusb/index.js][webusb-demo] - WebUSB Demo.
* [./webauthn/index.js][webauthn-XPUBS] - WebAuthn example for browser to get XPUB and derive keys.

[getPublicKey]: ./bcoin-getPublicKey.js
[getXPUBs]: ./bcoin-getXPUBs.js
[p2pkh]: ./bcoin-p2pkh.js
[getP2SHaddr]: ./bcoin-getP2SH-address.js
[spendP2SH]: ./bcoin-spendP2SH.js
[p2wpkh]: ./bcoin-p2wpkh.js
[verify]: ./bcoin-verifyAddress.js
[webauthn-XPUBS]: ./webauthn/index.js
[webusb-demo]: ./webusb/index.js
