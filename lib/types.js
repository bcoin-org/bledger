'use strict';

/**
 * Operation mode one of {@link module:protocol/common.OPERATION_MODES}
 * @global
 * @typedef {Number} Mode
 */

/**
 * Outpoint prev.hash + prev.index
 * @global
 * @typedef {Buffer} OutpointKey
 */

/**
 * Trusted input buffer
 * @global
 * @typedef {Buffer} TrustedInput
 */

/**
 * Compressed Public Key (33 bytes)
 * @global
 * @typedef {Buffer} CompressedPublicKey
 */

/**
 * Uncompressed Public Key (65 bytes)
 * @global
 * @typedef {Buffer} UncompressedPublicKey
 */

/**
 * Public Key (Compressed or Uncompressed)
 * @global
 * @typedef {CompressedPublicKey|UncompressedPublicKey} PublicKey
 */
