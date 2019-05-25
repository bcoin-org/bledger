'use strict';

const bledger = require('../lib/bledger');
const {LedgerBcoin} = bledger;
const {Device} = bledger.USB;

(async () => {
  const deviceInfo = await Device.requestDevice();

  const device = new Device({
    device: deviceInfo,
    timeout: 5000
  });

  await device.open();

  const app = new LedgerBcoin({ device });

  console.log(await app.randomBytes(20));

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
