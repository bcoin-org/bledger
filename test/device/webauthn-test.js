/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const bledger = require('../../lib/bledger');

const {ManagedLedgerBcoin} = bledger;
const {Device} = bledger.WebAuthn;
const DEVICE_TIMEOUT = Number(process.env.DEVICE_TIMEOUT) || 40000;

describe('WebAuthn Device', function () {
  this.timeout(DEVICE_TIMEOUT);

  it('should list devices', async () => {
    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device');
  });
});

// NOTE: WebAuthn does not have additional logic related to open/close.
// it only tracks the state.
require('./general')('WebAuthn Device', Device, ManagedLedgerBcoin);
