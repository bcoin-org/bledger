'use strict';

const bledger = require('../lib/bledger');
const {LedgerBcoin} = bledger;
const {Device} = bledger.HID;

(async () => {
  const devices = await Device.getDevices();

  const device = new Device({
    device: devices[0],
    timeout: 5000
  });

  await device.open();

  const app = new LedgerBcoin({ device });

  console.log(await app.getRandomBytes(20));

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
