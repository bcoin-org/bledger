/*!
 * signature.js - helper class for signature.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const secp256k1 = require('bcrypto/lib/secp256k1');

/**
 * Size of the curve
 * @const {Number}
 */

const SIZE = 32;

/**
 * 32 byte number zero
 * @const {Buffer}
 */

const ZERO = Buffer.alloc(32, 0x00);

/**
 * This based on bcrypto/lib/internal/signature
 * Adds recid on top.
 * @property {Buffer} r
 * @property {Buffer} s
 * @property {Number} recid
 */

class LedgerSignature {
  /**
   * Create LedgerSignature object.
   *
   * @param {Buffer?} r
   * @param {Buffer?} s
   * @param {Number?} recid
   */

  constructor(r, s, recid) {
    this.r = ZERO;
    this.s = ZERO;
    this.recid = -1;

    if (r)
      this.setR(r);

    if (s)
      this.setS(s);

    if (recid)
      this.setRecid(recid);
  }

  /**
   * Inject options
   * @param {Object} options
   * @param {Buffer?} options.r
   * @param {Buffer?} options.s
   * @param {Number?} options.recid
   * @returns {LedgerSignature}
   */

  fromOptions(options) {
    assert(typeof options === 'object');

    if (options.r)
      this.setR(options.r);

    if (options.s)
      this.setS(options.s);

    if (options.recid)
      this.setRecid(options.recid);

    return this;
  }

  /**
   * Set R.
   * @param {Buffer} r
   * @returns {LedgerSignature}
   */

  setR(r) {
    assert(Buffer.isBuffer(r));
    assert(r.length === SIZE);

    this.r = r;

    return this;
  }

  /**
   * Set S.
   * @param {Buffer} s
   * @returns {LedgerSignature}
   */

  setS(s) {
    assert(Buffer.isBuffer(s));
    assert(s.length === SIZE);

    this.s = s;

    return this;
  }

  /**
   * Set Recovery ID.
   * @param {Number} recid
   * @returns {LedgerSignature}
   */

  setRecid(recid) {
    assert(typeof recid === 'number', 'recid must be a number.');
    assert(recid >= 0 && recid <= 3,
      'recid must be a number between 0 and 3.');

    this.recid = recid;

    return this;
  }

  /**
   * Check equality with other signature
   * @param {LedgerSignature} sig
   * @returns {Boolean}
   */

  equals(sig) {
    assert(sig instanceof LedgerSignature);

    return this.recid === sig.recid
      && this.s.equals(sig.s)
      && this.r.equals(sig.r);
  }

  /**
   * Encode to RS buffer.
   * @returns {Buffer} - R || S (32 + 32 bytes)
   */

  encode() {
    const raw = Buffer.allocUnsafe(SIZE * 2);

    this.r.copy(raw, 0);
    this.s.copy(raw, SIZE);

    return raw;
  }

  /**
   * Decode RS buffer.
   * @param {Buffer} data - R || SS (32 + 32 bytes)
   * @returns {LedgerSignature}
   */

  decode(data) {
    assert(Buffer.isBuffer(data), 'sig must be a buffer.');
    assert(data.length === SIZE * 2);

    this.r = data.slice(0, SIZE);
    this.s = data.slice(SIZE, SIZE * 2);

    return this;
  }

  /**
   * Deserialize DER encoded buffer to LedgerSignature.
   * @param {Buffer} der
   * @returns {LedgerSignature}
   */

  fromDER(der) {
    const sig = secp256k1.fromDER(der);

    return this.decode(sig);
  }

  /**
   * Serialize to DER encoded buffer.
   * @returns {Buffer}
   */

  toDER() {
    return secp256k1.toDER(this.encode());
  }

  /**
   * Deserialize signatures from Ledger (Almost DER)
   * @param {Buffer} raw
   * @returns {LedgerSignature}
   */

  fromLedgerSignature(raw) {
    assert(Buffer.isBuffer(raw));

    this.setRecid(raw[0] & 0x03);
    raw[0] ^= this.recid;

    assert(raw[0] === 0x30);

    this.fromDER(raw);

    // recover original buffer.
    raw[0] ^= this.recid;

    return this;
  }

  /**
   * Serialize to ledger signature (Almost DER)
   * @returns {Buffer}
   */

  toLedgerSignature() {
    const der = this.toDER();

    if (this.recid > 0)
      der[0] ^= this.recid;

    return der;
  }

  /**
   * serialize to bitcoin-core format
   * for signatures.
   * @param {Boolean} [compressed=true]
   * @returns {Buffer}
   */

  toCoreSignature(compressed = true) {
    const sig = Buffer.allocUnsafe(SIZE * 2 + 1);

    sig[0] = this.recid + 27 + (compressed ? 4 : 0);

    this.r.copy(sig, 1);
    this.s.copy(sig, SIZE + 1);

    return sig;
  }

  /**
   * Deserialize bitcoin-core format
   * for message signatures.
   * @param {Buffer} raw
   * @returns {LedgerSignature}
   */

  fromCoreSignature(raw) {
    assert(Buffer.isBuffer(raw), 'signature must be a buffer.');
    assert(raw.length === SIZE * 2 + 1, 'signature must be 65 bytes.');
    const first = raw[0] - 27;

    this.setRecid(first & 0x03);
    this.decode(raw.slice(1));

    return this;
  }

  /**
   * Create LedgerSignature from options.
   * @param {Object} options
   * @returns {LedgerSignature}
   */

  static fromOptions(options) {
    return new this().fromOptions(options);
  }

  /**
   * Create LedgerSignature from RS.
   * @param {Buffer} raw
   * @returns {LedgerSignature}
   */

  static decode(raw) {
    return new this().decode(raw);
  }

  /**
   * Create LedgerSignature from DER
   * @param {Buffer} raw
   * @returns {LedgerSignature}
   */

  static fromDER(sig) {
    return new this().fromDER(sig);
  }

  /**
   * Create LedgerSignature from
   * ledger serialized signature (Almost DER)
   * @param {Buffer} raw
   */

  static fromLedgerSignature(raw) {
    return new this().fromLedgerSignature(raw);
  }

  /**
   * Create LedgerSignature from
   * bitcoin-core serialized signature.
   * @param {Buffer} raw
   */

  static fromCoreSignature(raw) {
    return new this().fromCoreSignature(raw);
  }

  /**
   * Recover public key.
   * @param {Buffer} msg
   * @param {Boolean} [compress = true]
   * @returns {Buffer?} - publicKey or null
   */

  recover(msg, compress = true) {
    assert(Buffer.isBuffer(msg), 'msg must be a buffer.');
    assert(typeof compress === 'boolean', 'compress must be a boolean.');
    if (this.recid < 0)
      return null;

    return secp256k1.recover(msg, this.encode(), this.recid, compress);
  }

  /**
   * Verify this signature against msg and publicKey
   * @param {Buffer} msg
   * @param {Buffer} publicKey
   * @returns {Boolean}
   */

  verify(msg, publicKey) {
    return secp256k1.verify(msg, this.encode(), publicKey);
  }
}

/*
 * Expose
 */

module.exports = LedgerSignature;
