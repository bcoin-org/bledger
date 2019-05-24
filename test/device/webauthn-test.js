/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const bledger = require('../../lib/bledger');

const {Device, DeviceInfo} = bledger.WebAuthn;
const DEVICE_TIMEOUT = Number(process.env.DEVICE_TIMEOUT) || 40000;

describe('WebAuthn Device', function () {
  this.timeout(DEVICE_TIMEOUT);

  it('should list devices', async () => {
    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device');
  });
});

require('./general')(Device, DeviceInfo);
