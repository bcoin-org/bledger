/*!
 * txinput.js - Ledger transaction input
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');

const Network = require('bcoin/lib/protocol/network');
const Outpoint = require('bcoin/lib/primitives/outpoint');
const Coin = require('bcoin/lib/primitives/coin');
const KeyRing = require('bcoin/lib/primitives/keyring');
const TX = require('bcoin/lib/primitives/tx');
const Script = require('bcoin/lib/script').Script;

const LedgerError = require('../protocol/error');
const util = require('../utils/util');

/**
 * Transactions and outputs
 * to be used for next transaction
 */

class LedgerTXInput {
  /**
   * @constructor
   * @param {Object} options
   * @param {String|Number[]} options.path
   * @param {bcoin.TX|Buffer} options.tx
   * @param {Number} options.index
   * @param {(bcoin.Script|Buffer)?} options.redeem - script for P2SH.
   * @param {Buffer?} options.publicKey - raw public key for ring
   * @param {TrustedInput?} options.trustedInput
   * @param {bcoin.SighashType} [options.type=SIGHASH_ALL]
   */

  constructor(options) {
    this.path = [];
    this.tx = null;
    this.index = 0; // Output index
    this.witness = false;
    this.redeem = null;
    this.type = Script.hashType.ALL;
    this.publicKey = null;
    this.trustedInput = null;
    this.coin = null;

    this._ring = null;
    this._key = '';
    this._prev = null;
    this._prevred = null;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Set options for SignInput
   * @param {Object} options
   */

  fromOptions(options) {
    assert(options, 'SignInput data is required.');
    assert(options.path, 'Path is required.');

    if (typeof options.path === 'string')
      options.path = util.parsePath(options.path, true);

    assert(Array.isArray(options.path), 'Path must be Array or string');
    this.path = options.path;

    if (options.type != null) {
      assert(options.type !== Script.hashType.ALL,
        'Ledger only supports SIGHASH_ALL'
      );

      this.type = options.type;
    }

    if (options.redeem != null) {
      if (Buffer.isBuffer(options.redeem))
        options.redeem = Script.fromRaw(options.redeem);

      assert(Script.isScript(options.redeem), 'Cannot use non-script redeem.');
      this.redeem = options.redeem;
    }

    if (options.witness != null) {
      assert(typeof options.witness === 'boolean');
      this.witness = options.witness;
    }

    // we only need previous tx with output index
    // for p2pkh legacy transactions
    // Coin should be enough
    if ((this.redeem == null && !this.witness) || options.tx) {
      assert(options.tx, 'Tx is required.');

      if (Buffer.isBuffer(options.tx))
        options.tx = TX.fromRaw(options.tx);

      assert(TX.isTX(options.tx), 'Cannot use non-transaction tx.');
      this.tx = options.tx;

      assert(typeof options.index === 'number', 'Output index is required.');
      assert(isU32(options.index), 'Output index must be a uint32.');
      this.index = options.index;

      this.coin = Coin.fromTX(this.tx, this.index, 0);
    }

    if (this.coin == null) {
      assert(Coin.isCoin(options.coin),
        'LedgerInput needs Coin or previous tx');
      this.coin = options.coin;
    }

    if (options.publicKey != null) {
      assert(Buffer.isBuffer(options.publicKey),
        'Cannot set non-buffer public key');
      this.publicKey = options.publicKey;
    }

    if (options.trustedInput != null) {
      assert(Buffer.isBuffer(options.trustedInput),
        'Can not set non-buffer trusted input.');
      this.trustedInput = options.trustedInput;
    }

    // we can't check legacy P2SH (it might be nested P2WPKH).
    if (this.isWitnessScripthash())
      assert(this.redeem, 'Can not sign ScriptHash without redeem.');

    if (!this.witness)
      assert(!this.isWitness(), 'input script is program.');

    return this;
  }

  /**
   * Create SignInput from options
   * @see {@link LedgerTXInput}
   * @returns {LedgerTXInput}
   */

  static fromOptions(options) {
    return new this().fromOptions(options);
  }

  /**
   * Test an object to see if it is an LedgerTXInput.
   * @param {Object} obj
   * @returns {Boolean}
   */

  static isLedgerTXInput(obj) {
    return obj instanceof this;
  }

  /**
   * Get Key from prevout
   * @returns {Buffer}
   */

  toKey() {
    if (!this._key)
      this._key = this.getOutpoint().toRaw();

    return this._key;
  }

  /**
   * Get prevout
   * @returns {bcoin.Outpoint}
   */

  getOutpoint() {
    if (!this._outpoint)
      this._outpoint = Outpoint.fromOptions({
        hash: this.coin.hash,
        index: this.coin.index
      });

    return this._outpoint;
  }

  /**
   * Get previous script
   * @returns {bcoin.Script}
   */

  getPrev() {
    if (!this._prev)
      this._prev = this.getCoin().script;

    return this._prev;
  }

  /**
   * Get script that should be signed:
   *  - nested p2wpkh inside p2sh - we just need to sign p2pkh script.
   *  - p2sh and p2wsh - we need to sign redeem script.
   *  - p2pkh - we sign p2pkh script.
   *  - p2wpkh - we sign p2pkh script.
   *
   *  e.g. if you are signing nested p2wpkh, you need to set witness=true
   *  and don't specify redeem (Redeem is for p2sh/p2wsh)
   * @returns {Boolean}
   */

  getPrevRedeem() {
    if (this._prevred)
      return this._prevred;

    const prev = this.getPrev();

    if (prev.isScripthash() && this.witness && !this.redeem) { // nested
      const wpkh = this.getRing().getProgram().getWitnessPubkeyhash();
      this._prevred = Script.fromPubkeyhash(wpkh);
    } else if (this.isScripthash()) { // witness or not, we need redeem script
      this._prevred = this.redeem;
    } else if (!this.witness) { // p2pkh script is fine
      this._prevred = this.getPrev();
    } else { // for witness we need p2pkh equivalent
      const wpkh = this.getPrev().getWitnessPubkeyhash();
      this._prevred = Script.fromPubkeyhash(wpkh);
    }

    return this._prevred;
  }

  /**
   * Generate and return coin
   * @returns {bcoin.Coin} coin
   */

  getCoin() {
    return this.coin;
  }

  /**
   * Get ring
   * @param {bcoin.Network} [network=main]
   * @returns {bcoin.KeyRing}
   */

  getRing(network = Network.primary) {
    if (!this.publicKey)
      throw new LedgerError('Cannot return ring without public key');

    if (!this._ring) {
      this._ring = KeyRing.fromPublic(this.publicKey, network);

      if (this.redeem)
        this._ring.script = this.redeem;

      if (this.witness)
        this._ring.witness = true;
    }

    return this._ring;
  }

  /**
   * Check if coin is scripthash
   * @returns {Boolean}
   */

  isScripthash() {
    const prev = this.getPrev();

    return prev.isWitnessScripthash() || prev.isScripthash();
  }

  /**
   * Check if previous script is P2WSH
   * @returns {Boolean}
   */

  isWitnessScripthash() {
    const prev = this.getPrev();

    return prev.isWitnessScripthash();
  }

  /**
   * Check if the coin is witness program
   * @returns {Boolean}
   */

  isWitness() {
    const prev = this.getPrev();

    return prev.isWitnessPubkeyhash() || prev.isWitnessScripthash();
  }

  /**
   * Clear the cache
   */

  refresh() {
    this._coin = null;
    this._ring = null;
    this._key = '';
    this._prev = null;
    this._outpoint = null;
  }
}

/*
 * Helpers
 */

function isU32(value) {
  return (value >>> 0) === value;
}

LedgerTXInput.LedgerTXInput = LedgerTXInput;
module.exports = LedgerTXInput;
