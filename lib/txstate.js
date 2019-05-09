/*!
 * txstate.js - Ledger Transaction state.
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');
const MTX = require('bcoin/lib/primitives/mtx');
const TX = require('bcoin/lib/primitives/tx');
const Script = require('bcoin/lib/script').Script;
const LedgerBTCApp = require('./ledger');
const LedgerTXInput = require('./txinput');
const secp256k1 = require('bcrypto/lib/secp256k1');
const {BufferMap} = require('buffer-map');
const Logger = require('blgr');

const NULL_SCRIPT = new Script();

/**
 * Outpoint prev.hash + prev.index
 * @typedef {Buffer} OupointKey
 */

/**
 * Trusted input buffer
 * @typedef {Buffer} TrustedInput
 */

/**
 * Keeps track of the signing state
 * for current transaction.
 * @private
 * @property {LedgerBTCApp} ledger
 * @property {bcoin.MTX} mtx
 * @property {LedgerTXInput[]} inputs
 * @property {BufferMap} inputsByKey - OutpointKey -> LedgerTXInput
 * @property {BufferMap} indexByInput - OutpointKey -> Number
 * @property {BufferMap} trustedInputs - OutpointKey -> TrustedInput
 * @property {Boolean} witness - transaction has witness input
 * @property {Boolean} new - If we are signing new tx (ledger state)
 */

class LedgerTXState {
  /**
   * Create signature object
   * @param {Object} options
   * @param {bcoin.MTX} options.mtx
   * @param {LedgerTXInput[]} options.inputs
   */

  constructor(options) {
    this.ledger = null;
    this.mtx = new MTX();
    this.inputs = [];
    this.inputsByKey = new BufferMap();
    this.indexByInput = new BufferMap();
    this.trustedInputs = new BufferMap();
    this.witness = false;
    this.new = true;
    this.logger = Logger.global;

    this.signedInputs = 0;

    // process
    this.initialized = false;

    // cache some info
    this._trustedInputs = false;
    this._publicKeys = false;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject properties from options.
   * @param {Object} options
   * @returns {LedgerTXState}
   */

  fromOptions(options) {
    assert(options, 'LedgerTXState options are required.');
    assert(options.mtx, 'MTX is required.');
    assert(options.ledger instanceof LedgerBTCApp,
      'Ledger is not LedgerBTCApp instance.');
    assert(MTX.isMTX(options.mtx),
      'Can not use non-MTX object.'
    );

    this.ledger = options.ledger;
    this.mtx = options.mtx;
    this.logger = options.logger;

    if (options.inputs) {
      assert(Array.isArray(options.inputs));
      this.inputs = options.inputs;
    }

    return this;
  }

  /**
   * Create sigobject from options
   * @param {Object} options
   * @returns {LedgerTXState}
   */

  static fromOptions(options) {
    return new this(options);
  }

  /**
   * Initialize maps with inputs.
   */

  init() {
    assert(this.ledger);
    assert(!this.initialized);

    for (const li of this.inputs) {
      this.inputsByKey.set(li.toKey(), li);

      if (li.witness)
        this.witness = true;
    }

    this.mapTXInputs();

    this.initialized = true;

    return this;
  }

  /**
   * Map transaction inputs to ledger inputs.
   * @private
   */

  mapTXInputs() {
    for (const [i, input] of this.mtx.inputs.entries()) {
      const key = input.prevout.toRaw();

      assert(Buffer.isBuffer(key));

      this.indexByInput.set(key, i);
    }
  }

  /**
   * Get ledger input index in tx.
   * @param {Buffer|LedgerTXInput} input
   * @returns {Number}
   */

  getIndex(input) {
    if (Buffer.isBuffer(input))
      return this.indexByInput.get(input);

    assert(LedgerTXInput.isLedgerTXInput(input));

    return this.indexByInput.get(input.toKey());
  }

  /**
   * Whether there is any witness input.
   * @returns {Boolean}
   */

  hasWitness() {
    return this.witness;
  }

  /**
   * Whether we are signing new tx, so
   * we have not sent any information to ledger yet.
   * @returns {Boolean}
   */

  isNew() {
    return this.new;
  }

  /**
   * Collects public keys and update ledgerInputs,
   * if ledgerInput does not contain it.
   */

  async collectPubkeys() {
    assert(this.initialized, 'Can not use uninitialized object.');

    if (this._publicKeys)
      return;

    this.logger.spam('collect public keys.');

    for (const li of this.inputs) {
      if (li.publicKey)
        continue;

      const data = await this.ledger.getPublicKey(li.path);
      const rawpk = data.publicKey;

      // TODO: don't mutate inputs
      // compress public key
      li.publicKey = secp256k1.publicKeyConvert(rawpk, true);
    }

    this._publicKeys = true;
  }

  /**
   * Collects trusted inputs if they are necessary.
   */

  async collectTrustedInputs() {
    assert(this.initialized, 'Can not use uninitialized object.');

    if (this._trustedInputs)
      return;

    this.logger.spam('collect trusted inputs.');

    for (const li of this.inputs) {
      if (li.witness || li.redeem)
        continue;

      if (li.trustedInput)
        continue;

      const trustedInput = await this.ledger.getTrustedInput(li.tx, li.index);
      const key = li.toKey();

      // TODO: don't mutate inputs
      li.trustedInput = trustedInput;
      this.trustedInputs.set(key, trustedInput);
    }

    this._trustedInputs = true;
  }

  /**
   * Start sending witness tx inputs.
   */

  async cacheWitnessInputs() {
    assert(this.initialized, 'Can not use uninitialized object.');

    if (!this.witness)
      return;

    this.logger.spam('start sending witness tx inputs.');

    await this.ledger.hashTransactionStart(
      this.mtx,
      this.mtx.view,
      new BufferMap(),
      this.isNew(),
      this.witness
    );

    await this.ledger.hashOutputFinalize(this.mtx);
    this.new = false;
  }

  /**
   * Get signature for ledgerInput.
   * @param {LedgerTXInput} li
   * @returns {Promise<Buffer>}
   */

  async getSignature(li) {
    assert(LedgerTXInput.isLedgerTXInput(li));

    this.logger.spam('get signature for input.');

    const inputKey = li.toKey();
    const witness = li.witness;

    const prev = li.getPrevRedeem();
    const view = this.mtx.view;

    if (witness) {
      await this.ledger.hashTransactionStart(
        prepareWitnessTX(this.mtx, inputKey, prev),
        view,
        this.trustedInputs,
        this.isNew(),
        this.witness
      );
    } else {
      // nullify all other scripts for legacy signing
      await this.ledger.hashTransactionStart(
        prepareLegacyTX(this.mtx, inputKey, prev),
        view,
        this.trustedInputs,
        this.isNew(),
        witness
      );

      await this.ledger.hashOutputFinalize(this.mtx);
    }

    const sig = await this.ledger.hashSign(
      this.mtx,
      li.path,
      li.type
    );

    this.new = false;

    return sig;
  }

  /**
   * Destroy signing object.
   * This also resets caches.
   */

  destroy() {
    this.ledger = null;
    this.mtx = new MTX();
    this.inputs = [];
    this.inputsByKey.clear();
    this.indexByInput.clear();
    this.trustedInputs.clear();
    this.witness = false;
    this.new = true;
    this.initialized = false;

    this.reset();
  }

  /**
   * Reset caches.
   */

  reset() {
    this._publicKeys = false;
    this._trustedInputs = false;
  }
}

/**
 * Nullify scripts other than `key`.
 * returns new tx object.
 * @see {LedgerBTCApp#hashTransactionStartNullify}
 * @param {bcoin.TX} tx - transaction
 * @param {Buffer} key - prevout key
 * @param {bcoin.Script} - prev
 * @returns {bcoin.TX} - tx.cloned new tx
 */

function prepareLegacyTX(tx, key, prev) {
  const newTX = new TX();
  newTX.inject(tx);

  for (const input of newTX.inputs) {
    const prevoutKey = input.prevout.toRaw();

    if (prevoutKey.equals(key))
      input.script = prev;
    else
      input.script = NULL_SCRIPT;
  }

  return newTX;
}

/**
 * Leave only witness inputs in tx.
 * returns new tx object.
 * @see {LedgerBTCApp#hashTransactionStartSegwit}
 * @param {bcoin.TX} tx - transaction
 * @param {Buffer} key - prevout key
 * @param {bcoin.Script} - prev
 * @returns {bcoin.TX} - tx.cloned new tx
 */

function prepareWitnessTX(tx, key, prev) {
  const newTX = new TX();
  newTX.inject(tx);

  const inputs = [];

  for (const input of newTX.inputs) {
    const prevoutKey = input.prevout.toRaw();

    if (prevoutKey.equals(key)) {
      input.script = prev;
      inputs.push(input);
      break;
    }
  }

  newTX.inputs = inputs;

  return newTX;
}

module.exports = LedgerTXState;
