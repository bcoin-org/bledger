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

const apdu = exports;

/*
 * Constants
 */

apdu.EMPTY = Buffer.alloc(0);

/**
 * Adress verification flags
 * @const
 * @see https://github.com/LedgerHQ/blue-app-btc/blob/master/src/btchip_apdu_get_wallet_public_key.c#L36
 */
apdu.addressFlags = {
  // address types, choose one
  LEGACY: 0,
  NESTED_WITNESS: 1 << 0,
  WITNESS: 1 << 1,

  // whether to verify
  VERIFY: 1 << 2
};

/**
 * Address type mask least 2 bits
 * @const
 */
apdu.addressTypeMask = 0x03;

/**
 * Maximum depth of HD Path
 * @const {Number}
 */
apdu.MAX_DEPTH = 10;

/**
 * Instruction classes
 * @const {Object}
 */
apdu.CLA = {
  CLA_GENERAL: 0xe0,
  CLA_VENDOR: 0xd0
};

apdu.claByVal = reverse(apdu.CLA);

/**
 * Instruction code
 * @const {Object}
 */
apdu.INS = {
  // implemented instructions
  INS_GET_WALLET_PUBLIC_KEY: 0x40, // formerly PUBLIC_KEY
  INS_GET_TRUSTED_INPUT: 0x42,
  INS_UNTRUSTED_HASH_TX_INPUT_START: 0x44,
  INS_UNTRUSTED_HASH_TX_INPUT_FINALIZE: 0x46,
  INS_UNTRUSTED_HASH_SIGN: 0x48,
  INS_UNTRUSTED_HASH_TX_INPUT_FINALIZE_FULL: 0x4a,
  INS_GET_FIRMWARE_VERSION: 0xc4,

  // not implemented instructions
  INS_SET_ALTERNATE_COIN_VERSION: 0x14,
  INS_SETUP: 0x20,
  INS_VERIFY_PIN: 0x22,
  INS_GET_OPERATION_MODE: 0x24,
  INS_SET_OPERATION_MODE: 0x26,
  INS_SET_KEYMAP: 0x28,
  INS_SET_COMM_PROTOCOL: 0x2a,
  INS_GET_INTERNAL_CHAIN_INDEX: 0x4c,
  INS_SIGN_MESSAGE: 0x4e,
  INS_GET_TRANSACTION_LIMIT: 0xa0,
  INS_SET_TRANSACTION_LIMIT: 0xa2,
  INS_IMPORT_PRIVATE_KEY: 0xb0,
  INS_GET_PUBLIC_KEY: 0xb2,
  INS_DERIVE_BIP32_KEY: 0xb4,
  INS_SIGNVERIFY_IMMEDIATE: 0xb6,
  INS_GET_RANDOM: 0xc0,
  INS_GET_ATTESTATION: 0xc2,
  INS_COMPOSE_MOFN_ADDRESS: 0xc6,
  INS_GET_POS_SEED: 0xca,

  INS_EXT_GET_HALF_PUBLIC_KEY: 0x20,
  INS_EXT_CACHE_PUT_PUBLIC_KEY: 0x22,
  INS_EXT_CACHE_HAS_PUBLIC_KEY: 0x24,
  INS_EXT_CACHE_GET_FEATURES: 0x26
};

apdu.insByVal = reverse(apdu.INS);

/**
 * Response status codes
 * @const {Object}
 */
apdu.STATUS_WORDS = {
  SW_INCORRECT_LENGTH: 0x6700,
  SW_INVALID_SECURITY_STATUS: 0x6982,
  SW_INVALID_DATA: 0x6a80,
  SW_FILE_NOT_FOUND: 0x6a82,
  SW_INCORRECT_PARAMETERS: 0x6b00,
  SW_CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
  SW_INS_NOT_SUPPORTED: 0x6d00,
  SW_INTERNAL_ERROR: 0x6f,
  SW_OK: 0x9000
};

const errorMessages = {
  SW_INCORRECT_LENGTH: 'Incorrect length',
  SW_INVALID_SECURITY_STATUS: 'Invalid security status',
  SW_INVALID_DATA: 'Invalid data',
  SW_FILE_NOT_FOUND: 'File not found',
  SW_INCORRECT_PARAMETERS: 'Incorrect parameters',
  SW_CONDITIONS_OF_USE_NOT_SATISFIED: 'Conditions not satisfied',
  SW_INS_NOT_SUPPORTED: 'Instruction not supported (check app on the device)',
  SW_INTERNAL_ERROR: 'Internal error',
  SW_UNKNOWN_ERROR: 'Unknown status code'
};

apdu.errors = pairObjects(apdu.STATUS_WORDS, errorMessages);
apdu.statusByVal = reverse(apdu.STATUS_WORDS);

/**
 * Device features.
 * @const {Object}
 */

apdu.FEATURES = {
  FEATURE_COMPRESSED_KEY: 0x01,
  FEATURE_SELF_SCREEN_BUTTONS: 0x02,
  FEATURE_EXTERNAL_SCREEN_BUTTONS: 0x04,
  FEATURE_NFC: 0x08,
  FEATURE_BLE: 0x10,
  FEATURE_TEE: 0x20
};

/**
 * Device operation modes.
 * @const {Object}
 */
apdu.MODES = {
  MODE_SETUP: 0x01,
  MODE_OPERATION: 0x02
};

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

    this.data = apdu.EMPTY;

    this.le = 64;

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
  }

  /**
   * Get size of raw APDU command.
   * @returns {Number}
   */

  getSize() {
    return 5 + this.data.length;
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
    bw.writeU8(this.data.length);
    bw.writeBytes(this.data);

    return bw.render();
  }

  /**
   * Inspect the APDU Command.
   * @returns {String}
   */

  inspect() {
    const cla = apdu.claByVal[this.cla];
    const ins = apdu.insByVal[this.ins];

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
      cla: apdu.CLA.CLA_GENERAL,
      ins: apdu.INS.INS_GET_FIRMWARE_VERSION
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
      p1: (addressFlags & apdu.addressFlags.VERIFY) >> 2,
      // address type
      p2: addressFlags & apdu.addressTypeMask,

      cla: apdu.CLA.CLA_GENERAL,
      ins: apdu.INS.INS_GET_WALLET_PUBLIC_KEY,

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
      cla: apdu.CLA.CLA_GENERAL,
      ins: apdu.INS.INS_GET_TRUSTED_INPUT,

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
      cla: apdu.CLA.CLA_GENERAL,
      ins: apdu.INS.INS_UNTRUSTED_HASH_TX_INPUT_START,

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
      cla: apdu.CLA.CLA_GENERAL,
      ins: apdu.INS.INS_UNTRUSTED_HASH_TX_INPUT_FINALIZE_FULL,

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
      cla: apdu.CLA.CLA_GENERAL,
      ins: apdu.INS.INS_UNTRUSTED_HASH_SIGN,

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
      cla: apdu.CLA.CLA_GENERAL,
      ins: apdu.INS.INS_SIGN_MESSAGE,

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
    const status = apdu.statusByVal[this.status];
    const type = apdu.insByVal[this.type];

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

    const {
      FEATURE_COMPRESSED_KEY,
      FEATURE_SELF_SCREEN_BUTTONS,
      FEATURE_EXTERNAL_SCREEN_BUTTONS,
      FEATURE_NFC,
      FEATURE_BLE,
      FEATURE_TEE
    } = apdu.FEATURES;

    const {
      MODE_SETUP,
      MODE_OPERATION
    } = apdu.MODES;

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
      type: apdu.INS.INS_GET_FIRMWARE_VERSION,
      data: firmwareInformation
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
      type: apdu.INS.INS_GET_WALLET_PUBLIC_KEY
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
      return emptyResponse(apdu.INS.INS_GET_TRUSTED_INPUT);

    const br = bufio.read(data);
    const trustedInput = br.readBytes(56);
    const status = br.readU16BE();

    return new APDUResponse({
      data: trustedInput,
      status: status,
      type: apdu.INS.INS_GET_TRUSTED_INPUT
    });
  }

  /**
   * Decode untrusted hash transaction input start
   * @param {Buffer} data - Raw APDU packet
   * @throws {APDUError}
   */

  static hashTransactionStart(data) {
    throwError(data);

    return emptyResponse(apdu.INS.INS_UNTRUSTED_HASH_TX_INPUT_START);
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
      return emptyResponse(apdu.INS.INS_UNTRUSTED_HASH_TX_INPUT_FINALIZE_FULL);

    const br = bufio.read(data);
    const userValidations = [];

    for (let i = 0; i < data.length - 2; i++)
      userValidations.push(Boolean(br.readU8()));

    const status = br.readU16BE();

    return new APDUResponse({
      data: userValidations,
      status: status,
      type: apdu.INS.INS_UNTRUSTED_HASH_TX_INPUT_FINALIZE_FULL
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
      type: apdu.INS.INS_UNTRUSTED_HASH_SIGN
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
      type: apdu.INS.INS_SIGN_MESSAGE,
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
      type: apdu.INS.INS_SIGN_MESSAGE,
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
      type: apdu.INS.INS_SIGN_MESSAGE,
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
    data: apdu.EMPTY,
    status: apdu.STATUS_WORDS.SW_OK,
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

  if (statusNo === apdu.STATUS_WORDS.SW_OK)
    return;

  if (statusCode[0] === apdu.STATUS_WORDS.SW_INTERNAL_ERROR)
    throw new APDUError(errorMessages.SW_INTERNAL_ERROR, statusNo, statusHex);

  const message = apdu.errors[apdu.statusByVal[statusNo]];

  if (message)
    throw new APDUError(message, statusNo, statusHex);

  throw new APDUError(errorMessages.SW_UNKNOWN_ERROR, statusNo, statusHex);
}

/*
 * Pair object values by keys
 * @param {Object}
 * @param {Object}
 * @returns {Object}
 */

function pairObjects(keyObject, valueObject) {
  const object = Object.create(null);

  for (const key of Object.keys(keyObject)) {
    object[key] = valueObject[key];
  }

  return object;
}

/*
 * Reverse object keys to values
 * @param {Object} object
 * @returns {Object} with reverse keys and values
 */

function reverse(object) {
  const reversed = {};

  for (const key of Object.keys(object))
    reversed[object[key]] = key;

  return reversed;
}

/*
 * Expose
 */

exports.Command = APDUCommand;
exports.Response = APDUResponse;
exports.Error = APDUError;
