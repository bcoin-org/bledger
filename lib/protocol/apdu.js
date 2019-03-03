/*!
 * apdu.js - Ledger APDU Commands
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */
'use strict';

const {inspect} = require('util');
const assert = require('bsert');
const bufio = require('bufio');
const util = require('../utils/util');
const LedgerError = require('./error');

const common = require('./common');

const {errorMessages} = common;
const {CLA_GENERAL} = common.CLA;

const {
  INS_GET_WALLET_PUBLIC_KEY,
  INS_GET_TRUSTED_INPUT,
  INS_UNTRUSTED_HASH_TX_INPUT_START,
  INS_UNTRUSTED_HASH_SIGN,
  INS_UNTRUSTED_HASH_TX_INPUT_FINALIZE_FULL,
  INS_GET_FIRMWARE_VERSION,
  INS_GET_OPERATION_MODE,
  INS_SET_OPERATION_MODE,
  INS_SIGN_MESSAGE,
  INS_GET_RANDOM
} = common.INS;

const {
  SW_INTERNAL_ERROR,
  SW_OK
} = common.STATUS_WORDS;

const {
  FEATURE_COMPRESSED_KEY,
  FEATURE_SELF_SCREEN_BUTTONS,
  FEATURE_EXTERNAL_SCREEN_BUTTONS,
  FEATURE_NFC,
  FEATURE_BLE,
  FEATURE_TEE
} = common.FEATURES;

const { MODE_SETUP, MODE_OPERATION } = common.MODES;

/**
 * APDU Error
 * @extends {LedgerError}
 */

class APDUError extends LedgerError {
  /**
   * Create an APDU error.
   * @constructor
   * @param {String} reason
   * @param {Number} code
   * @param {String} hexCode
   */

  constructor(reason, code, hexCode, start) {
    super();

    this.type = 'APDUError';
    this.code = code || -1;
    this.hexCode = hexCode || '';
    this.message = `${reason}. (0x${this.hexCode})`;

    if (Error.captureStackTrace)
      Error.captureStackTrace(this, start || APDUError);
  }
}

/**
 * Ledger APDU command encoder
 */
class APDUCommand {
  /**
   * APDU command
   * @constructor
   * @param {Object} options
   * @param {Number} options.cla - instruction class
   * @param {Number} options.ins - instruction code
   * @param {Number?} options.p1 - parameter 1
   * @param {Number?} options.p2 - parameter 2
   * @param {Buffer?} options.data - APDUData
   * @param {Number?} options.le - Expected reponse length
   */

  constructor (options) {
    // instruction class
    this.cla = 0;

    // instruction code
    this.ins = 0;

    // parameters
    this.p1 = 0;
    this.p2 = 0;

    this.data = common.EMPTY;

    this.le = 64;

    this.skipBody = false;
    this.skipSize = false;

    if (options)
      this.set(options);
  }

  /**
   * Set APDU options.
   * @param {Object} options
   */

  set(options) {
    assert(options);
    assert(isU8(options.cla));
    assert(isU8(options.ins));

    this.cla = options.cla;
    this.ins = options.ins;

    if (options.p1 != null) {
      assert(isU8(options.p1));
      this.p1 = options.p1;
    }

    if (options.p2 != null) {
      assert(isU8(options.p2));
      this.p2 = options.p2;
    }

    if (options.data != null) {
      assert(Buffer.isBuffer(options.data), 'Data must be buffer');
      this.data = options.data;
    }

    if (options.le != null) {
      assert(isU8(options.le));
      this.le = options.le;
    }

    if (options.skipSize != null) {
      assert(typeof options.skipSize === 'boolean');
      this.skipSize = options.skipSize;
    }

    if (options.skipBody != null) {
      assert(typeof options.skipBody === 'boolean');
      this.skipBody = options.skipBody;
    }
  }

  /**
   * Get size of raw APDU command.
   * @returns {Number}
   */

  getSize() {
    let size = 4;

    if (!this.skipSize)
      size += 1;

    if (!this.skipBody)
      size += this.data.length;

    return size;
  }

  /**
   * Get raw APDU command.
   * @returns {Buffer}
   */

  toRaw() {
    const size = this.getSize();
    const bw = bufio.write(size);

    bw.writeU8(this.cla);
    bw.writeU8(this.ins);
    bw.writeU8(this.p1);
    bw.writeU8(this.p2);

    if (!this.skipSize)
      bw.writeU8(this.data.length);

    if (!this.skipBody)
      bw.writeBytes(this.data);

    return bw.render();
  }

  /**
   * Inspect the APDU Command.
   * @returns {String}
   */

  inspect() {
    const cla = common.claByVal[this.cla];
    const ins = common.insByVal[this.ins];

    return '<APDUCommand:'
      + ` cla=${cla}(${this.cla})`
      + ` ins=${ins}(${this.ins})`
      + ` p1=${this.p1}`
      + ` p2=${this.p2}`
      + ` data=${this.data.toString('hex')}`
      + '>';
  }

  /**
   * Inspect the APDU Command.
   * This is used by node-v10
   * @returns {String}
   */

  [inspect.custom]() {
    return this.inspect();
  }

  /**
   * Get Firmware version.
   * @returns {APDUCommand}
   */

  static getFirmwareVersion() {
    return new APDUCommand({
      cla: CLA_GENERAL,
      ins: INS_GET_FIRMWARE_VERSION
    });
  }

  /**
   * Get operation mode.
   * @returns {APDUCommand}
   */

  static getOperationMode() {
    return new APDUCommand({
      cla: CLA_GENERAL,
      ins: INS_GET_OPERATION_MODE
    });
  }

  /**
   * Set operation mode.
   * @param {Mode} mode
   * @returns {APDUCommand}
   */

  static setOperationMode(mode) {
    return new APDUCommand({
      cla: CLA_GENERAL,
      ins: INS_SET_OPERATION_MODE,

      data: Buffer.alloc(1, mode)
    });
  }

  /**
   * Get random bytes.
   * @param {Number} size
   * @returns {APDUCommand}
   */

  static getRandom(size) {
    return new APDUCommand({
      cla: CLA_GENERAL,
      ins: INS_GET_RANDOM,

      data: Buffer.alloc(1, size),
      skipSize: true
    });
  }

  /**
   * Get wallet public key.
   * @param {Number[]} path
   * @param {apdu.addressFlags} [addressFlags=0]
   * @returns {APDUCommand}
   */

  static getWalletPublicKey(path, addressFlags) {
    const data = util.encodePath(path);

    return new APDUCommand({
      // verify ?
      p1: (addressFlags & common.addressFlags.VERIFY) >> 2,
      // address type
      p2: addressFlags & common.addressTypeMask,

      cla: CLA_GENERAL,
      ins: INS_GET_WALLET_PUBLIC_KEY,

      data: data
    });
  }

  /**
   * Get trusted input.
   * @param {Buffer} data - Raw data
   * @param {Boolean} [first=false] - First part
   * @returns {APDUCommand}
   */

  static getTrustedInput(data, first = false) {
    return new APDUCommand({
      cla: CLA_GENERAL,
      ins: INS_GET_TRUSTED_INPUT,

      p1: first ? 0x00 : 0x80,
      data: data
    });
  }

  /**
   * Get trusted input.
   * @param {Buffer} data - Raw data
   * @param {Boolean} [first=false] - First part
   * @param {Boolean} [isNew=false]
   * @param {Boolean} [witness=false]
   * @returns {APDUCommand}
   */

  static hashTransactionStart(data, first, isNew, witness) {
    let p2 = 0x80;

    if (isNew)
      p2 = 0x00;

    if (isNew && witness)
      p2 = 0x02;

    return new APDUCommand({
      cla: CLA_GENERAL,
      ins: INS_UNTRUSTED_HASH_TX_INPUT_START,

      p1: first ? 0x00 : 0x80,
      p2: p2,

      data: data
    });
  }

  /**
   * Untrusted hash transaction input finalize.
   * @param {Buffer} data
   * @param {Boolean} [more=false]
   * @returns {APDUCommand}
   */

  static hashOutputFinalize(data, more = true) {
    return new APDUCommand({
      cla: CLA_GENERAL,
      ins: INS_UNTRUSTED_HASH_TX_INPUT_FINALIZE_FULL,

      p1: more ? 0x00 : 0x80,

      data: data
    });
  }

  /**
   * Untrusted hash sign.
   * @param {Number[]} path
   * @param {Number} lockTime
   * @param {bcoin.SighashType} sighashType
   * @returns {APDUCommand}
   */

  static hashSign(path, lockTime, sighashType) {
    // TODO(node): user validation codes

    const encodedPath = util.encodePath(path);
    const data = bufio.write(encodedPath.length + 6);

    data.writeBytes(encodedPath);
    data.writeU8(0x00); // user validation codes
    data.writeU32BE(lockTime);
    data.writeU8(sighashType);

    return new APDUCommand({
      cla: CLA_GENERAL,
      ins: INS_UNTRUSTED_HASH_SIGN,

      data: data.render()
    });
  }

  /**
   * Sign message.
   * @param {Buffer} data
   * @param {Boolean} [prepare = false]
   * @param {Boolean} [first = false]
   * @param {Boolean} [legacy = false]
   * @returns {APDUCommand}
   */

  static signMessage(data, prepare, first, legacy) {
    let p2 = first ? 0x01 : 0x80;

    if (first && legacy)
      p2 = 0x00;

    return new APDUCommand({
      cla: CLA_GENERAL,
      ins: INS_SIGN_MESSAGE,

      p1: prepare ? 0x00 : 0x80,
      p2: p2,

      data: data
    });
  }
}

/**
 * APDU Response decoded structure
 */
class APDUResponse {
  /**
   * Create decoded structure
   * @param {Object} options
   * @param {Object} options.data - Data object
   * @param {Number} options.status
   * @param {Number} options.type
   */

  constructor(options) {
    this.data = null;
    this.status = 0;
    this.type = 0;

    if (options)
      this.set(options);
  }

  /**
   * Set APDUResponse options
   * @param {Object} options
   */

  set(options) {
    assert(options);
    assert(options.data);
    assert(typeof options.data === 'object');

    assert(isU16(options.status));
    assert(isU8(options.type));

    this.data = options.data;
    this.status = options.status;
    this.type = options.type;
  }

  /**
   * Inspect APDU Response.
   * @returns {String}
   */

  inspect() {
    const status = common.statusByVal[this.status];
    const type = common.insByVal[this.type];

    return '<APDUResponse:'
      + ` status=${status}`
      + ` type=${type}`
      + ` data=${inspect(this.data)}`
      + '>';
  }

  /**
   * Inspect APDU Response
   * @returns String
   */

  [inspect.custom]() {
    return this.inspect();
  }

  /**
   * Decode firmware version APDU Response.
   * @param {Buffer} data
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static getFirmwareVersion(data) {
    throwError(data);

    const br = bufio.read(data);
    const features = br.readU8();
    const archID = br.readU8(data[1]);
    const major = br.readU8();
    const minor = br.readU8();
    const patch = br.readU8();

    br.seek(1);
    const tcsLoaderPatchVersion = br.readU8();
    const mode = br.readU8();
    const status = br.readU16BE();

    const firmwareInformation = {
      version: `${major}.${minor}.${patch}`,
      archID,
      tcsLoaderPatchVersion,
      features: {
        compressedPubkey: Boolean(features & FEATURE_COMPRESSED_KEY),
        selfScreenButtons: Boolean(features & FEATURE_SELF_SCREEN_BUTTONS),
        externalScreenButtons:
          Boolean(features & FEATURE_EXTERNAL_SCREEN_BUTTONS),
        nfc: Boolean(features & FEATURE_NFC),
        ble: Boolean(features & FEATURE_BLE),
        tee: Boolean(features & FEATURE_TEE)
      },
      mode: {
        setup: Boolean(mode & MODE_SETUP),
        operation: Boolean(mode & MODE_OPERATION)
      }
    };

    return new APDUResponse({
      status: status,
      type: INS_GET_FIRMWARE_VERSION,
      data: firmwareInformation
    });
  }

  /**
   * Decode get operation mode message.
   * @param {Buffer} data
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static getOperationMode(data) {
    throwError(data);

    const br = bufio.read(data);
    const mode = br.readU8();
    const status = br.readU16BE();

    return new APDUResponse({
      status: status,
      type: INS_GET_OPERATION_MODE,

      data: {
        mode: mode,
        modeName: common.getModeName(mode)
      }
    });
  }

  /**
   * Decode set operation mode message.
   * @param {Buffer} data
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static setOperationMode(data) {
    throwError(data);
    assert(data.length === 2, 'Incorrect data length.');

    const status = readU16BE(data);

    return new APDUResponse({
      status: status,
      type: INS_SET_OPERATION_MODE,

      data: {}
    });
  }

  /**
   * Decode random bytes.
   * @param {Buffer} data
   * @param {Number} size
   * @returns {APDUResponse}
   */

  static getRandom(data, size) {
    throwError(data);

    const br = bufio.read(data);
    const bytes = br.readBytes(size);
    const status = br.readU16BE();

    return new APDUResponse({
      status: status,
      type: INS_GET_RANDOM,

      data: bytes
    });
  }

  /**
   * Decode Public Key APDU Response.
   * @param {Buffer} data - Raw APDU packet
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static getWalletPublicKey(data) {
    throwError(data);

    const br = bufio.read(data);

    const pubkeyLength = br.readU8();
    const pubkey = br.readBytes(pubkeyLength);

    const addressLength = br.readU8();
    const address = br.readBytes(addressLength);

    const chainCode = br.readBytes(32);
    const status = br.readU16BE();

    return new APDUResponse({
      data: {
        publicKey: pubkey,
        address: address.toString(),
        chainCode: chainCode
      },
      status: status,
      type: INS_GET_WALLET_PUBLIC_KEY
    });
  }

  /**
   * Decode get trusted input response.
   * @param {Buffer} data - Raw APDU packet.
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static getTrustedInput(data) {
    throwError(data);

    if (data.length === 2)
      return emptyResponse(INS_GET_TRUSTED_INPUT);

    const br = bufio.read(data);
    const trustedInput = br.readBytes(56);
    const status = br.readU16BE();

    return new APDUResponse({
      data: trustedInput,
      status: status,
      type: INS_GET_TRUSTED_INPUT
    });
  }

  /**
   * Decode untrusted hash transaction input start
   * @param {Buffer} data - Raw APDU packet
   * @throws {APDUError}
   */

  static hashTransactionStart(data) {
    throwError(data);

    return emptyResponse(INS_UNTRUSTED_HASH_TX_INPUT_START);
  }

  /**
   * Decode untrusted hash tx input finalize
   * @param {Buffer} data
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static hashOutputFinalize(data) {
    throwError(data);

    if (data.length === 2)
      return emptyResponse(INS_UNTRUSTED_HASH_TX_INPUT_FINALIZE_FULL);

    const br = bufio.read(data);
    const userValidations = [];

    for (let i = 0; i < data.length - 2; i++)
      userValidations.push(Boolean(br.readU8()));

    const status = br.readU16BE();

    return new APDUResponse({
      data: userValidations,
      status: status,
      type: INS_UNTRUSTED_HASH_TX_INPUT_FINALIZE_FULL
    });
  }

  /**
   * Decide hash sign
   * @param {Buffer} data
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static hashSign(data) {
    throwError(data);

    const br = bufio.read(data);
    const signature = br.readBytes(data.length - 2);
    const status = br.readU16BE();

    signature[0] &= 0xFE;

    return new APDUResponse({
      data: signature,
      status: status,
      type: INS_UNTRUSTED_HASH_SIGN
    });
  }

  /**
   * Decode sign message data. (Legacy)
   * @param {Buffer} data
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static signMessage0(data) {
    throwError(data.slice(-2));

    const status = readU16BE(data.slice(-2));
    const confirmationType = data[0];
    const confirmationNeeded = confirmationType !== 0x00;

    let keycardData = null;
    let secureScreenData = null;

    if (confirmationType === 0x02)
      keycardData = data.slice(1, -2);

    if (confirmationType === 0x03)
      secureScreenData = data.slice(1, -2);

    return new APDUResponse({
      type: INS_SIGN_MESSAGE,
      status: status,
      data: {
        confirmationNeeded,
        confirmationType,
        keycardData,
        secureScreenData,
        encryptedOutputData: null
      }
    });
  }

  /**
   * Decode sign message data.
   * @param {Buffer} data
   * @param {Buffer} encryptedOutputData
   * @param {Boolean} last
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static signMessage(data, encryptedOutputData, last) {
    throwError(data.slice(-2));
    assert(Buffer.isBuffer(encryptedOutputData));

    const br = bufio.read(data);
    const outputDataLength = br.readU8();
    const outputData = br.readBytes(outputDataLength);

    if (outputDataLength) {
      encryptedOutputData = Buffer.concat([
        encryptedOutputData,
        outputData
      ]);
    }

    let confirmationType = -1;
    let confirmationNeeded = false;
    let secureScreenData = null;

    if (last) {
      confirmationType = br.readU8();
      confirmationNeeded = confirmationType !== 0x00;
    }

    // requested with secure screen
    if (last && confirmationType === 0x03) {
      // it should be 30 bytes, but let's play it safe.
      secureScreenData = br.readBytes(br.left() - 2);
    }

    const status = br.readU16BE();

    return new APDUResponse({
      type: INS_SIGN_MESSAGE,
      status: status,
      data: {
        confirmationNeeded,
        confirmationType,
        keycardData: null,
        secureScreenData,
        encryptedOutputData
      }
    });
  }

  /**
   * Decode signature from data
   * @param {Buffer} data
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static signMessageFinal(data) {
    throwError(data.slice(-2));

    const status = readU16BE(data.slice(-2));
    const signature = data.slice(0, -2);

    return new APDUResponse({
      type: INS_SIGN_MESSAGE,
      status: status,
      data: signature
    });
  }
}

/*
 * Helpers
 */

function emptyResponse(type) {
  return new APDUResponse({
    data: common.EMPTY,
    status: SW_OK,
    type: type
  });
}

function isU8(value) {
  return (value & 0xff) === value;
};

function isU16(value) {
  return (value & 0xffff) === value;
};

function readU16BE(buffer) {
  return buffer[0] * 0x100 + buffer[1];
}

/**
 * Check if buffer is statusCode
 * @param {Buffer} statusCode
 * @throws {APDUError}
 */

function throwError(statusCode) {
  if (!Buffer.isBuffer(statusCode) || statusCode.length !== 2)
    return;

  // read Uint16BE
  const statusNo = statusCode[0] << 8 | statusCode[1];
  const statusHex = statusCode.toString('hex');

  if (statusNo === SW_OK)
    return;

  if (statusCode[0] === SW_INTERNAL_ERROR)
    throw new APDUError(errorMessages.SW_INTERNAL_ERROR, statusNo, statusHex);

  const message = common.errors[common.statusByVal[statusNo]];

  if (message)
    throw new APDUError(message, statusNo, statusHex);

  throw new APDUError(errorMessages.SW_UNKNOWN_ERROR, statusNo, statusHex);
}

/*
 * Expose
 */

exports.Command = APDUCommand;
exports.Response = APDUResponse;
exports.Error = APDUError;
