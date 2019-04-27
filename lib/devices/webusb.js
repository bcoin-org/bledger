/*!
 * webusb.js - Ledger Web USB hid communication
 * Copyright (c) 2019, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

/* eslint-env browser */

'use strict';

const assert = require('bsert');
const {Lock} = require('bmutex');

const Logger = require('blgr');
const LedgerProtocol = require('../protocol');
const {LedgerError} = LedgerProtocol;
const {ProtocolWriter, ProtocolReader} = LedgerProtocol;

const {Device, DeviceInfo} = require('./device');

/**
 * Ledger WebUSB Packetsize
 * @const {Number}
 */
const PACKET_SIZE = 64;

/**
 * USB instance
 * @const {USBDevice}
 */

const usb = navigator.usb;

/**
 * Configuration to use.
 */

const configurationValue = 1;
const interfaceNumber = 2;
const endpointNumber = 3;

/**
 * Ledger WebUSB wrapper
 * @alias module:device.WebUSBDevice
 * @extends {Device}
 * @property {bmutex.Lock} lock
 * @property {USBDevice} device
 */

class WebUSBDevice extends Device {
  /**
   * Create Ledger HID device
   * @constructor
   * @param {Object} options
   * @param {WebUSBDeviceInfo} options.device
   * @param {Number?} [options.timeout=5000]
   */

  constructor(options) {
    super();

    this.lock = new Lock(false);
    this.device = null;

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
      assert(options.device instanceof WebUSBDeviceInfo);
      this.device = options.device.device;
    }

    return this;
  }

  get opened() {
    return this.device.opened;
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
    this.enforce(this.device, 'Can not find device.');
    this.enforce(this.opened === false, 'Device is already open');

    const device = this.device;

    await device.open();

    if (device.configuration === null
      || device.configuration.configurationValue !== configurationValue)
      await device.selectConfiguration(configurationValue);

    await device.reset();

    try {
      await device.claimInterface(interfaceNumber);
    } catch (e) {
      await device.close();
      throw new LedgerError('Web Interface not available.');
    }

    this.logger.info('Device is open.');
    return this;
  }

  /**
   * Closes the device
   * @throws {LedgerError}
   */

  async close() {
    this.enforce(this.device, 'Can not find device.');
    this.enforce(this.opened === true, 'Device is not open');

    await this.device.releaseInterface(interfaceNumber);
    await this.device.reset();
    await this.device.close();

    this.logger.info('Device is closed.');
    return this;
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
   * @returns {Promise}
   */

  _write(data) {
    const level = this.logger.logger.level;

    if (level >= Logger.levels.DEBUG)
      this.logger.debug('==>', data.toString('hex'));

    return this.device.transferOut(endpointNumber, data);
  }

  /**
   * Read device data
   * @private
   * @returns {Promise}
   */

  async _read() {
    const result = await this.device.transferIn(endpointNumber, PACKET_SIZE);
    const level = this.logger.logger.level;

    assert(result.status === 'ok', 'Receiving data failed.');

    const data = Buffer.from(result.data.buffer);

    if (level >= Logger.levels.DEBUG)
      this.logger.debug('<==', data.toString('hex'));

    return data;
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

    for (const message of messages)
      await this._write(message);

    while (!reader.finished) {
      const data = await this._readTimeout();

      reader.pushMessage(data);
    }

    return reader.getData();
  }

  /**
   * List ledger devices
   * @returns {Promise<WebUSBDeviceInfo[]>}
   */

  static async getDevices() {
    const allDevices = await usb.getDevices();
    const devices = [];

    for (const device of allDevices) {
      if (WebUSBDeviceInfo.isLedgerDevice(device))
        devices.push(WebUSBDeviceInfo.fromWebUSBDevice(device));
    }

    return devices;
  }

  /**
   * Request device
   * @returns {Promise<WebUSBDeviceInfo>}
   */

  static async requestDevice() {
    const filters = [WebUSBDeviceInfo.getDeviceFilter()];
    let device;

    try {
      device = await usb.requestDevice({
        filters
      });
    } catch (e) {
      throw new LedgerError('Device was not selected.');
    }

    return WebUSBDeviceInfo.fromWebUSBDevice(device);
  }
}

/**
 * Ledger WebUSB Device info
 * @extends {DeviceInfo}
 */

class WebUSBDeviceInfo extends DeviceInfo {
  /**
   * Create Ledger device info
   * @constructor
   * @param {Object} [options]
   * @param {USBDevice?} options.device
   * @param {!String} options.path - Device path for HID
   * @param {Number} options.release
   * @param {Number} options.interface
   * @param {Number} options.usagePage
   * @param {Number} options.usage
   */

  constructor(options) {
    super();

    this.device = null;

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

    assert(options.device instanceof global.USBDevice);
    this.device = options.device;

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

  static fromWebUSBDevice(device) {
    const options = {
      device: device,
      vendorId: device.vendorId,
      productId: device.productId,
      manufacturerName: device.manufacturerName,
      productName: device.productName,
      serialNumber: device.serialNumber
    };

    return this.fromOptions(options);
  }

  static getDeviceFilter() {
    return {
      vendorId: 0x2c97
    };
  }

  static enforceSupport() {
    const supported = this.isSupported();

    if (!supported)
      throw new LedgerError('WebUSB is not supported.', WebUSBDevice);
  }

  static isSupported() {
    return typeof navigator === 'object'
      && typeof global.navigator.usb === 'object'
      && global.navigator.usb instanceof global.USB;
  }
}

/*
 * Expose
 */

exports.Device = WebUSBDevice;
exports.DeviceInfo = WebUSBDeviceInfo;
