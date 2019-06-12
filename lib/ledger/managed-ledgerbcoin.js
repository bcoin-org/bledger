/*!
 * managed-ledgerbcoin.js - Managed Ledger Bcoin wrapper.
 * Copyright (c) 2019, The Bcoin Developers (MIT License).
 */

'use strict';

const {enforce} = require('bsert');
const {Device} = require('../device/device');
const LedgerBcoin = require('./ledgerbcoin');

/**
 * Wraps Ledger bcoin with device open/close.
 * @property {Device} device
 * @property {LedgerBcoin?} ledger
 */
class ManagedLedgerBcoin {
  /**
   * @param {Object} options
   * @param {Device} options.device
   * @param {bcoin.Network} [options.network = primary]
   * @param {blgr.Logger} [options.logger = global]
   */

  constructor(options) {
    enforce(options && typeof options === 'object', 'options', 'object');
    enforce(options.device instanceof Device, 'options.device', 'Device');

    this.device = options.device;
    this.bledger = new LedgerBcoin(options);
  }

  /**
   * Create Bcoin object from device.
   * @param {Device} device
   * @returns {BcoinDevice}
   */

  static fromDevice(device) {
    return new this({ device });
  }

  /**
   * Open device if not open.
   */

  async tryOpen() {
    if (this.device.opened)
      return;

    await this.device.open();
  }

  /**
   * Close device if not closed.
   */

  async tryClose() {
    if (!this.device.opened)
      return;

    await this.device.close();
  }

  /**
   * Get firmware version.
   * @returns {Object}
   */

  async getFirmwareVersion() {
    await this.tryOpen();

    let res;
    try {
      res = await this.bledger.getFirmwareVersion();
    } finally {
      await this.tryClose();
    }

    return res;
  }

  /**
   * Get operation mode.
   * @returns {Mode}
   */

  async getOperationMode() {
    await this.tryOpen();

    let res;
    try {
      res = await this.bledger.getOperationMode();
    } finally {
      await this.tryClose();
    }

    return res;
  }

  /**
   * Set operation mode.
   * @param {Mode} mode
   */

  async setOperationMode(mode) {
    await this.tryOpen();

    let res;
    try {
      res = await this.bledger.setOperationMode(mode);
    } finally {
      await this.tryClose();
    }

    return res;
  }

  /**
   * Get random bytes.
   * @param {Number} size
   * @returns {Buffer}
   */

  async randomBytes(size) {
    await this.tryOpen();

    let res;
    try {
      res = await this.bledger.randomBytes(size);
    } finally {
      await this.tryClose();
    }

    return res;
  }

  /**
   * Get public key.
   * @async
   * @param {(Number[]|String)} path - Full derivation path
   * @param {Boolean} [parentFingerPrint = false] - Note:
   *  This will make it run slower.
   *  It will request public key twice from the ledger.
   * @param {apdu.addressFlags} [addressFlags=0x00]
   * @returns {bcoin.HDPublicKey}
   * @throws {LedgerError}
   */

  async getPublicKey(path, parentFingerPrint = false, addressFlags = 0) {
    await this.tryOpen();

    let res;
    try {
      res = await this.bledger.getPublicKey(path, parentFingerPrint,
        addressFlags);
    } finally {
      await this.tryClose();
    }

    return res;
  }

  /**
   * Get fingerPrint of the HD public key.
   * NOTE: This will always skip on screen verification.
   * @param {(Number[]|String)} path - Full derivation path.
   * @returns {Number}
   */

  async getFingerPrint(path) {
    await this.tryOpen();

    let res;
    try {
      res = await this.bledger.getFingerPrint(path);
    } finally {
      await this.tryClose();
    }

    return res;
  }

  /**
   * Get signatures for transaction.
   * @param {bcoin.TX|bcoin.MTX|Buffer} tx - transaction
   * @param {bcoin.CoinView|Buffer} view
   * @param {LedgerTXInput[]} ledgerInputs
   * @returns {Buffer[]}
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async getTransactionSignatures(tx, view, ledgerInputs) {
    await this.tryOpen();

    let res;
    try {
      res = await this.bledger.getTransactionSignatures(tx, view, ledgerInputs);
    } finally {
      await this.tryClose();
    }

    return res;
  }

  /**
   * Sign transaction with lock.
   * Ledger should finish signing one transaction
   * in order to sign another.
   * @param {bcoin.MTX} tx - mutable transaction
   * @param {LedgerTXInput[]} ledgerInputs
   * @returns {MTX} - signed mutable transaction
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async signTransaction(tx, ledgerInputs) {
    await this.tryOpen();

    let res;
    try {
      res = await this.bledger.signTransaction(tx, ledgerInputs);
    } finally {
      await this.tryClose();
    }

    return res;
  }

  /**
   * Apply signature to transaction.
   * @param {bcoin.MTX} tx
   * @param {Number} index - index of the input
   * @param {LedgerTXInput} ledgerInput
   * @param {Buffer} sig - raw signature
   * @returns {Boolean}
   * @throws {Error}
   */

  applySignature(tx, index, ledgerInput, sig) {
    return this.bledger.applySignature(tx, index, ledgerInput, sig);
  }

  /**
   * Sign message. (lock)
   * @param {(Number[]|String)} path - Full derivation path
   * @param {(Buffer|String)} message
   * @param {Stirng?} pin
   * @returns {LedgerSignature}
   * @throws {LedgerError}
   */

  async signMessage(path, message, pin) {
    await this.tryOpen();

    let res;
    try {
      res = await this.bledger.signMessage(path, message, pin);
    } finally {
      await this.tryClose();
    }

    return res;
  }

  /**
   * Sign message (legacy). (lock)
   * Not recommended to use, signMessage will fallback to legacy.
   * @param {(Number[]|String)} path - Full derivation path
   * @param {(Buffer|String)} message
   * @param {String?} pin
   * @returns {Buffer}
   * @throws {LedgerError}
   */

  async signMessageLegacy(path, message, pin) {
    await this.tryOpen();

    let res;
    try {
      res = await this.bledger.signMessageLegacy(path, message, pin);
    } finally {
      await this.tryClose();
    }

    return res;
  }

  /**
   * Verify message
   * @param {(Number[]|String)} path - Full derivation path
   * @param {(Buffer|String)} message
   * @param {LedgerSignature} signature
   * @returns {Boolean}
   */

  async verifyMessage(path, message, signature) {
    await this.tryOpen();

    let res;
    try {
      res = await this.bledger.verifyMessage(path, message, signature);
    } finally {
      await this.tryClose();
    }

    return res;
  }
}

ManagedLedgerBcoin.ManagedLedgerBcoin = ManagedLedgerBcoin;
module.exports = ManagedLedgerBcoin;
