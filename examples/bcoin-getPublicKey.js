'use strict';

const bledger = require('../lib/bledger');
const {LedgerBcoin} = bledger;
const {Device} = bledger.USB;

(async () => {
  // get first device available.
  const device = await Device.requestDevice();

  device.set({ timeout: 5000 });

  await device.open();

  const purpose = 44;
  const coinType = 0;

  const coinTypePath = `m/${purpose}'/${coinType}'`;

  const account1Path = `${coinTypePath}/0'`;
  const account2Path = `${coinTypePath}/1'`;

  const ledgerBcoin = new LedgerBcoin({ device });

  const pubkey1 = await ledgerBcoin.getPublicKey(account1Path);
  const pubkey2 = await ledgerBcoin.getPublicKey(account2Path);

  console.log(pubkey1);
  console.log(pubkey2);

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
