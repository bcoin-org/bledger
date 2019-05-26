'use strict';

const bledger = require('../lib/bledger');
const {LedgerBcoin} = bledger;
const {Device} = bledger.USB;

(async () => {
  const device = await Device.requestDevice();

  device.set({ timeout: 5000 });

  await device.open();

  const app = new LedgerBcoin({ device });

  console.log(await app.randomBytes(20));

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
