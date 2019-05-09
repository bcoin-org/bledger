'use strict';

const bledger = require('../lib/bledger');
const {LedgerBcoin} = bledger;
const {Device} = bledger.HID;
const Logger = require('blgr');

const KeyRing = require('bcoin/lib/primitives/keyring');

const NETWORK = 'regtest';
const XPUBS = 1;
const ADDRESSES = 4;
const CHANGE = true;

(async () => {
  const devices = await Device.getDevices();

  const logger = new Logger({
    console: true,
    level: 'debug'
  });

  await logger.open();

  const device = new Device({
    device: devices[0],
    timeout: 5000,
    logger
  });

  await device.open();

  const ledgerBcoin = new LedgerBcoin({ device, logger });

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
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function getPublicKey(btcApp, path) {
  return await btcApp.getPublicKey(path);
}

function deriveAddress(hd, change, index, network) {
  const pubkey = hd.derive(change).derive(index);
  const keyring = KeyRing.fromPublic(pubkey.publicKey, network);

  return keyring.getAddress().toString();
}
