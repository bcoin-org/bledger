/* eslint-env mocha, browser */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const bledger = require('../../lib/bledger');

const {Device, DeviceInfo} = bledger.WebUSB;
const DEVICE_TIMEOUT = Number(process.env.DEVICE_TIMEOUT) || 40000;

describe('WebUSB Device', function () {
  this.timeout(DEVICE_TIMEOUT);

  // HACK.
  // TODO: Replace with appropriate flag in chrome.
  // (See script/bmocha-chrome)
  before((cb) => {
    const body = document.getElementsByTagName('body')[0];
    const button = document.createElement('button');

    button.innerText = 'Choose device.';
    button.addEventListener('click', () => {
      Device.requestDevice().then(() => {
        body.removeChild(button);
        cb();
      });
    });

    body.appendChild(button);
  });

  it('should list devices', async () => {
    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device');
  });
});

require('./general')(Device, DeviceInfo);
