/*!
 * device.js - Abstract Ledger Device
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');
const DeviceError = require('./error');
const Logger = require('blgr');

const DEFAULT_SCRAMBLE_KEY = Buffer.from('btc');
const VENDOR_ID = 0x2c97;

/**
 * Ledger device
 * @alias module:device.Device
 * @abstract
 * @property {Number} timeout
 * @property {blgr.Logger?} logger
 */
class Device {
  /**
   * Create Ledger device
   * @constructor
   * @param {Object} [options]
   * @param {Number} [options.timeout=5000]
   * @param {(Buffer|String)} [options.scrambleKey=btc]
   */

  constructor(options) {
    this.logger = null;
    this.timeout = 5000;
    this.scrambleKey = DEFAULT_SCRAMBLE_KEY;

    if (options)
      this.set(options);
  }

  /**
   * Set device options.
   * @param {!Object} options
   * @see {@link Device}
   * @throws {AssertionError}
   */

  set(options) {
    assert(options);

    if (options.logger != null)
      this.logger = options.logger.context('ledger-device');
    else if (this.logger == null) {
      const logger = new Logger();
      this.logger = logger.context('ledger-device');
    }

    if (options.timeout != null) {
      assert(typeof options.timeout === 'number');
      assert(options.timeout >= 0);

      this.timeout = options.timeout;
    }

    if (options.scrambleKey != null) {
      if (typeof options.scrambleKey === 'string')
        options.scrambleKey = Buffer.from(options.scrambleKey, 'ascii');

      assert(Buffer.isBuffer(options.scrambleKey),
        'scramble key must be buffer');

      this.scrambleKey = options.scrambleKey;
    }
  }

  /**
   * Get device with options
   * @returns {Device}
   */

  static fromOptions(options) {
    return new this(options);
  }

  /**
   * Open connetion with device
   * @returns {Promise}
   * @throws {DeviceError}
   */

  async open () {
    ;
  }

  /**
   * Close connetion with device
   * @returns {Promise}
   * @throws {DeviceError}
   */

  async close() {
    ;
  }

  /**
   * Timeout read
   * @private
   * @returns {Promise<Buffer>}
   * @throws {DeviceError}
   */

  async _readTimeout() {
    if (this.timeout === 0)
      return this._read();

    let to;
    const timeout = new Promise((resolve, reject) => {
      to = setTimeout(() => {
        reject(new DeviceError('Read Timeout'));
      }, this.timeout);
    });
    const read = this._read();

    const response = await Promise.race([timeout, read]);
    clearTimeout(to);

    return response;
  }

  /**
   * Exchange APDU command with device
   * @param {Buffer} apdu
   * @returns {Promise<Buffer>} - Response data
   * @throws {LedgerError}
   */

  async exchange(apdu) {
    ;
  }

  /**
   * List ledger devices
   * @returns {Promise<DeviceInfo[]>}
   */

  static async getDevices() {
    return [];
  }

  static async requestDevice() {
    return new DeviceInfo();
  }
}

/**
 * Device Information
 * @alias module:device.DeviceInfo
 * @see {@link Device}
 */

class DeviceInfo {
  /**
   * Common DeviceInfo for Device
   * @constructor
   * @param {Object} [options]
   * @param {Number} [options.vendorId]
   * @param {Number} [options.productId]
   * @param {String} [options.manufacturerName]
   * @param {String} [options.productName]
   * @param {String} [options.serialNumber]
   */

  constructor(options) {
    this.type = '';
    this.vendorId = 0;
    this.productId = 0;
    this.productName = '';
    this.manufacturerName = 'Ledger';
    this.serialNumber = '';

    if (options)
      this.set(options);
  }

  /**
   * Set device information
   * @param {Object} options
   * @see {@link DeviceInfo}
   * @throws {AssertionError}
   */

  set(options) {
    assert(options);

    if (options.vendorId != null) {
      assert(typeof options.vendorId === 'number');
      this.vendorId = options.vendorId;
    }

    if (options.productId != null) {
      assert(typeof options.productId === 'number');
      this.productId = options.productId;
    }

    if (options.manufacturerName != null) {
      assert(typeof options.manufacturerName === 'string');
      this.manufacturerName = options.manufacturerName;
    }

    if (options.productName != null) {
      assert(typeof options.productName === 'string');
      this.productName = options.productName;
    }

    if (options.serialNumber != null) {
      assert(typeof options.serialNumber === 'string');
      this.serialNumber = options.serialNumber;
    }

    return this;
  }

  /**
   * Check device is ledger
   * @param {DeviceInfo} device
   * @returns {Boolean}
   */

  static isLedgerDevice(device) {
    return device.vendorId === VENDOR_ID;
  }
}

/*
 * Expose
 */

exports.Device = Device;
exports.DeviceInfo = DeviceInfo;
