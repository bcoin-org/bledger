'use strict';
/* eslint-env browser */

const bledger = require('../..');
const {LedgerBcoin} = bledger;
const {Device} = bledger.WebAuthn;

const KeyRing = require('bcoin/lib/primitives/keyring');

const NETWORK = 'regtest';
const XPUBS = 1;
const ADDRESSES = 4;
const CHANGE = true;

const device = new Device({
  timeout: 20000
});

(async () => {
  await device.open();

  const ledgerBcoin = new LedgerBcoin({ device });

  const xpubs = {};

  for (let i = 0; i < XPUBS; i++) {
    const path = `m/44'/0'/${i}'`;

    xpubs[path] = await getPublicKey(ledgerBcoin, path);
  }

  for (const key of Object.keys(xpubs)) {
    const xpub = xpubs[key];

    console.log(`Account: ${key} addresses:`);
    for (let i = 0; i < ADDRESSES; i++) {
      const address = deriveAddress(xpub, 0, i, NETWORK);

      console.log(`  /0/${i}: ${address}`);

      if (CHANGE) {
        const change = deriveAddress(xpub, 1, i, NETWORK);
        console.log(`  /1/${i}: ${change}\n`);
      }
    }
  }
  await device.close();
})();

async function getPublicKey(btcApp, path) {
  return await btcApp.getPublicKey(path);
}

function deriveAddress(hd, change, index, network) {
  const pubkey = hd.derive(change).derive(index);
  const keyring = KeyRing.fromPublic(pubkey.publicKey, network);

  return keyring.getAddress().toString();
}
/**/
