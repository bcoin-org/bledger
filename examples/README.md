Examples
===

There are three ways to communicate with Ledger Device.
For browser and node.js it's recommended to use `USB` device,
that uses node-usb on node.js side and uses WebUSB in the browser.
WebAuthn is also available for browsers that support it.

Most of the examples are for node.js, even though code is identical for webusb
an node.js you still need to User Action in the browser to get access to the device,
so it's easier to check examples on node.

There's also web usb demo, that handles device.

* [./bcoin-getPublicKey.js][getPublicKey] - Get public key for BIP32 path.
* [./bcoin-getXPUBs.js][getXPUBs] - Get XPUB and public keys from it.
* [./bcoin-verifyAddress.js][verify] - Verify addresses on device screen.
* [./bcoin-p2pkh.js][p2pkh] - Sign P2PKH transaction.
* [./bcoin-getP2SH-address.js][getP2SHaddr] - Get P2SH address.
* [./bcoin-spendP2SH.js][spendP2SH] - Sign P2SH transaction.
* [./bcoin-p2wpkh.js][p2wpkh] - Sign P2WPKH transaction.
* [./bcoin-signMessage.js][sign] - Sign Message.
* [./webusb/index.js][webusb-demo] - WebUSB Demo.
* [./webauthn/index.js][webauthn-XPUBS] - WebAuthn example for browser to get XPUB and derive keys.

[getPublicKey]: ./bcoin-getPublicKey.js
[getXPUBs]: ./bcoin-getXPUBs.js
[p2pkh]: ./bcoin-p2pkh.js
[getP2SHaddr]: ./bcoin-getP2SH-address.js
[spendP2SH]: ./bcoin-spendP2SH.js
[p2wpkh]: ./bcoin-p2wpkh.js
[verify]: ./bcoin-verifyAddress.js
[sign]: ./bcoin-signMessage.js
[webauthn-XPUBS]: ./webauthn/index.js
[webusb-demo]: ./webusb/index.js
