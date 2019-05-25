/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const bledger = require('../../lib/bledger');

const {Device, DeviceInfo} = bledger.USB;
const DEVICE_TIMEOUT = Number(process.env.DEVICE_TIMEOUT) || 40000;

describe('USB Device (node)', function () {
  this.timeout(DEVICE_TIMEOUT);

  it('should list devices', async () => {
    // request/list devices.
    // NOTE: on node.js it will enable all devices that exist.
    await  Device.requestDevice();

    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device');

    for (const device of devices)
      assert.ok(DeviceInfo.isLedgerDevice(device),
        'Device should be a ledger device');
  });
});

require('./general')(Device, DeviceInfo);
