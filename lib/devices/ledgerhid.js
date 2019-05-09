/*!
 * ledgerhid.js - Ledger USB Hid communication
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');

const HID = require('node-hid-ng');
const {Lock} = require('bmutex');

const protocol = require('../protocol');
const {LedgerProtocol, LedgerError} = protocol;
const {ProtocolWriter, ProtocolReader} = protocol;

const {Device, DeviceInfo} = require('./device');

/**
 * Ledger HID Packetsize
 * @const {Number}
 */
const PACKET_SIZE = 64;

/**
 * Ledger HID wrapper
 * @alias module:device.HIDDevice
 * @extends {Device}
 */
class HIDDevice extends Device {
  /**
   * Create Ledger HID device
   * @constructor
   * @param {Object} options
   * @param {(String|DeviceInfo)} options.device
   * @param {Number?} [options.timeout=5000]
   */

  constructor(options) {
    super();

    this.lock = new Lock(false);
    this.device = null;
    this.devicePath = null;

    this.opened = false;
    this.closed = false;

    if (options)
      this.set(options);
  }

  /**
   * Set device options.
   * @param {Object} options
   * @throws {AssertionError}
   */

  set(options) {
    super.set(options);

    if (options.device != null) {
      if (typeof options.device === 'string')
        this.devicePath = options.device;

      if (options.device instanceof DeviceInfo)
        this.devicePath = options.device.path;

      assert(this.devicePath, 'Couldn\'t set device');
    }

    return this;
  }

  /**
   * Assertion
   * @param {Boolean} value
   * @param {String?} reason
   * @throws {LedgerError}
   */

  enforce(value, reason) {
    if (!value)
      throw new LedgerError(reason, this.enforce);
  }

  /**
   * Opens the device
   * @throws {LedgerError}
   */

  async open() {
    this.enforce(this.opened === false, 'Device is already open');
    this.enforce(this.closed === false, 'Cant open closed device');
    this.enforce(this.devicePath, 'Device is not configured');
    this.enforce(!this.device, 'Device already exists');

    this.device = new HID(this.devicePath);
    this.opened = true;
    this.closed = false;

    this.logger.info('Opened HID device.');
  }

  /**
   * Closes the device
   * @throws {LedgerError}
   */

  async close() {
    this.enforce(this.opened === true, 'Device is not open');
    this.enforce(this.closed === false, 'Device is already closed');
    this.enforce(this.device !== null, 'Can\'t find device');

    this.opened = false;
    this.closed = true;

    this.device.close();
    this.device = null;
    this.logger.info('Closed HID device.');
  }

  /**
   * Pads the buffer to PACKET_SIZE
   * @private
   * @param {Buffer} message
   * @returns {Buffer} - padded
   */

  _padMessage(message) {
    const paddedMessage = Buffer.alloc(PACKET_SIZE);

    message.copy(paddedMessage);
    return paddedMessage;
  }

  /**
   * Write device data
   * @private
   * @param {Buffer} data
   */

  _write(data) {
    this.logger.spam('==>', data.toString('hex'));

    const array = [0x00];

    for (const value of data.values())
      array.push(value);

    return this.device.write(array);
  }

  /**
   * Read device data
   * @private
   * @returns {Promise}
   */

  _read() {
    return new Promise((resolve, reject) => {
      this.device.read((err, data) => {
        if (err || !data) {
          reject(err);
          return;
        }

        data = Buffer.from(data);

        this.logger.spam('<==', data.toString('hex'));

        resolve(data);
      });
    });
  }

  /**
   * Exchange APDU commands with device
   * Lock
   * @param {Buffer} apdu
   * @returns {Promise<Buffer>} - Response data
   * @throws {LedgerError}
   */

  async exchange(apdu) {
    const unlock = await this.lock.lock();

    try {
      return await this._exchange(apdu);
    } finally {
      unlock();
    }
  }

  /**
   * Exchange APDU command with device
   * without lock
   * @param {Buffer} apdu
   * @returns {Promise<Buffer>} - Response data
   * @throws {LedgerError}
   */

  async _exchange(apdu) {
    this.enforce(this.opened === true, 'Connection is not open');

    const writer = new ProtocolWriter({
      channelID: LedgerProtocol.CHANNEL_ID,
      tag: LedgerProtocol.TAG_APDU,
      data: apdu,
      packetSize: PACKET_SIZE
    });

    const reader = new ProtocolReader({
      channelID: LedgerProtocol.CHANNEL_ID,
      tag: LedgerProtocol.TAG_APDU,
      packetSize: PACKET_SIZE
    });

    const messages = writer.toMessages();

    for (const message of messages) {
      // this is syncronous
      this._write(this._padMessage(message));
    }

    while (!reader.finished) {
      const data = await this._readTimeout();

      reader.pushMessage(data);
    }

    return reader.getData();
  }

  /**
   * List ledger devices
   * @returns {Promise<DeviceInfo[]>}
   */

  static async getDevices() {
    const allDevices = HID.devices();
    const devices = [];

    for (const device of allDevices) {
      if (HIDDeviceInfo.isLedgerDevice(device)) {
        devices.push(HIDDeviceInfo.fromHIDDevice(device));
      }
    }

    return devices;
  }
}

/**
 * Ledger device info
 * @alias module:device.HIDDeviceInfo
 * @extends {DeviceInfo}
 */

class HIDDeviceInfo extends DeviceInfo {
  /**
   * Create Ledger device info
   * @constructor
   * @param {Object} [options]
   * @param {!String} options.path - Device path for HID
   * @param {Number} options.release
   * @param {Number} options.interface
   * @param {Number} options.usagePage
   * @param {Number} options.usage
   */

  constructor(options) {
    super();

    this.path = '';
    this.release = 0;
    this.interface = -1;
    this.usagePage = 0;
    this.usage = 1;

    if (options)
      this.set(options);
  }

  /**
   * Set device information
   * @param {Object} options
   * @throws {AssertionError}
   * @see {@link HIDDeviceInfo}
   */

  set(options) {
    assert(options);

    super.set(options);

    if (options.path != null) {
      assert(typeof options.path === 'string');
      this.path = options.path;
    }

    if (options.release != null) {
      assert(typeof options.release === 'number');
      this.release = options.release;
    }

    if (options.interface != null) {
      assert(typeof options.interface === 'number');
      this.interface = options.interface;
    }

    if (options.usagePage != null) {
      assert(typeof options.usagePage === 'number');
      this.usagePage = options.usagePage;
    }

    if (options.usage != null) {
      assert(typeof options.usage === 'number');
      this.usage = options.usage;
    }

    return this;
  }

  /**
   * Create DeviceInfo from Options
   * @param {Object} options
   * @returns {HIDDeviceInfo}
   * @see {@link HIDDeviceInfo}
   */

  static fromOptions(options) {
    return new this().set(options);
  }

  static fromHIDDevice(device) {
    device.productName = device.product;
    device.manufacturerName = device.manufacturer;
    return this.fromOptions(device);
  }

  static isLedgerDevice(device) {
    if (process.platform === 'win32' || process.platform === 'darwin') {
      if (device.usagePage !== 0xffa0)
        return false;
    } else if (device.interface !== 0)
      return false;

    return device.vendorId === 0x2c97
      || (device.vendorId === 0x2581 && device.productId === 0x3b7c);
  }
}

/*
 * Expose
 */

exports.Device = HIDDevice;
exports.DeviceInfo = HIDDeviceInfo;
