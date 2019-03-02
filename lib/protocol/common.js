/*!
 * common.js - common apdu and ledger constant and functions.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const bufio = require('bufio');
const assert = require('bsert');
const hash256 = require('bcrypto/lib/hash256');

const common = exports;

/**
 * Empty buffer
 * @const {Buffer}
 */

common.EMPTY = Buffer.alloc(0);

/**
 * Address verification flags.
 * They can be combined. with VERIFY it should display the address
 * with the address flag format.
 * @const {Object}
 */

common.addressFlags = {
  // p2 for get wallet public key
  LEGACY: 0x00,
  NESTED_WITNESS: 0x01,
  WITNESS: 0x02,

  // verify on screen
  VERIFY: 0x04
};

/**
 * Address flag mask (This removes our custom flags
 * from the addressFlags, e.g. VERIFY)
 * @const {Number}
 */

common.addressTypeMask = 0x03;

/**
 * Maximum depth of HD Path
 * @const {Number}
 */

common.MAX_DEPTH = 10;

/**
 * Instruction classes
 * @const {Object}
 */
common.CLA = {
  CLA_GENERAL: 0xe0,
  CLA_VENDOR: 0xd0
};

common.claByVal = reverse(common.CLA);

/**
 * Instruction code
 * @const {Object}
 */
common.INS = {
  // implemented instructions
  INS_GET_WALLET_PUBLIC_KEY: 0x40, // formerly PUBLIC_KEY
  INS_GET_TRUSTED_INPUT: 0x42,
  INS_UNTRUSTED_HASH_TX_INPUT_START: 0x44,
  INS_UNTRUSTED_HASH_TX_INPUT_FINALIZE: 0x46,
  INS_UNTRUSTED_HASH_SIGN: 0x48,
  INS_UNTRUSTED_HASH_TX_INPUT_FINALIZE_FULL: 0x4a,
  INS_GET_FIRMWARE_VERSION: 0xc4,
  INS_GET_OPERATION_MODE: 0x24,
  INS_SET_OPERATION_MODE: 0x26,
  INS_SIGN_MESSAGE: 0x4e,

  // not implemented instructions
  INS_SET_ALTERNATE_COIN_VERSION: 0x14,
  INS_SETUP: 0x20,
  INS_VERIFY_PIN: 0x22,
  INS_SET_KEYMAP: 0x28,
  INS_SET_COMM_PROTOCOL: 0x2a,
  INS_GET_INTERNAL_CHAIN_INDEX: 0x4c,
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

common.insByVal = reverse(common.INS);

/**
 * Response status codes
 * @const {Object}
 */
common.STATUS_WORDS = {
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

common.errorMessages = {
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

common.errors = pairObjects(common.STATUS_WORDS, common.errorMessages);
common.statusByVal = reverse(common.STATUS_WORDS);

/**
 * Device features.
 * @const {Object}
 */

common.FEATURES = {
  FEATURE_COMPRESSED_KEY: 0x01,
  FEATURE_SELF_SCREEN_BUTTONS: 0x02,
  FEATURE_EXTERNAL_SCREEN_BUTTONS: 0x04,
  FEATURE_NFC: 0x08,
  FEATURE_BLE: 0x10,
  FEATURE_TEE: 0x20
};

/**
 * Device modes.
 * @const {Object}
 */
common.MODES = {
  MODE_SETUP: 0x01,
  MODE_OPERATION: 0x02
};

/**
 * Operation modes
 * @const {Object}
 */

common.OPERATION_MODES = {
  OPERATION_MODE_WALLET: 0x01,
  OPERATION_MODE_RELAXED_WALLET: 0x02,
  OPERATION_MODE_SERVER: 0x04,
  OPERATION_MODE_DEVELOPER: 0x08
};

/**
 * Get mode name by mode
 * @param {Number} mode
 * @returns {String}
 * @throws {Error}
 */

common.getModeName = function getModeName(mode) {
  switch (mode) {
    case common.OPERATION_MODES.OPERATION_MODE_WALLET:
      return 'OPERATION_MODE_WALLET';
    case common.OPERATION_MODES.OPERATION_MODE_RELAXED_WALLET:
      return 'OPERATION_MODE_RELAXED_WALLET';
    case common.OPERATION_MODES.OPERATION_MODE_SERVER:
      return 'OPERATION_MODE_SERVER';
    case common.OPERATION_MODES.OPERATION_MODE_DEVELOPER:
      return 'OPERATION_MODE_DEVELOPER';
    default:
      throw new Error('Incorrect operation mode.');
  }
};

/**
 * Bitcoin signing magic string.
 * @const {String}
 * @default
 */

common.BITCOIN_MAGIC = 'Bitcoin Signed Message:\n';

/**
 * Get signed message from original message.
 * @param {Buffer} message - original message.
 * @param {String} magic - Network magic string.
 * @returns {String}
 */

common.encodeMessage = function encodeMessage(message, magic = common.BITCOIN_MAGIC) {
  assert(message.length < 0xfff, 'Message is too big.');
  assert(Buffer.isBuffer(message), 'Message must be a buffer.');
  assert(typeof magic === 'string', 'magic must be a string.');

  const messageLength = message.length < 0xfd ? 1 : 3;
  const bw = bufio.write(magic.length + messageLength + message.length + 1);

  bw.writeVarString(magic);
  bw.writeVarBytes(message);

  return hash256.digest(bw.render());
};

/*
 * Helpers
 */

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
