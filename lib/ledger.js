/*!
 * ledger.js - Ledger layer for BTC App
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';
const assert = require('bsert');
const util = require('./utils/util');
const Logger = require('blgr');
const utilTX = require('./utils/transaction');

const TX = require('bcoin/lib/primitives/tx');
const MTX = require('bcoin/lib/primitives/mtx');
const Script = require('bcoin/lib/script').Script;
const CoinView = require('bcoin/lib/coins/coinview');

const bufio = require('bufio');
const {encoding} = bufio;
const {BufferMap} = require('buffer-map');

const LedgerProtocol = require('./protocol');
const {APDUCommand, APDUResponse} = LedgerProtocol;

const NULL_SCRIPT = new Script();

/**
 * Ledger BTC App methods
 * @see https://ledgerhq.github.io/btchip-doc/bitcoin-technical-beta.html
 * @private
 */

class LedgerBTCApp {
  /**
   * Create ledger bcoin app
   * @constructor
   * @param {Object} options
   * @param {Device} options.device
   * @param {Logger} options.logger
   */

  constructor(options) {
    this.device = options.device;
    this.logger = Logger.global;

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger;
    }
  }

  /**
   * Get firmware version.
   * @returns {Object}
   */

  async getFirmwareVersion() {
    this.logger.spam('get firmware version.');
    const command = APDUCommand.getFirmwareVersion();
    const data = await this.device.exchange(command.toRaw());
    const response = APDUResponse.getFirmwareVersion(data);

    return response.data;
  }

  /**
   * Get operation mode.
   * @returns {Mode}
   */

  async getOperationMode() {
    this.logger.spam('get operation mode.');
    const command = APDUCommand.getOperationMode();
    const data = await this.device.exchange(command.toRaw());
    const response = APDUResponse.getOperationMode(data);

    return response.data;
  }

  /**
   * Set operation mode.
   * @param {Mode} mode
   */

  async setOperationMode(mode) {
    this.logger.spam('set operation mode %d.', mode);
    const command = APDUCommand.setOperationMode(mode);
    const data = await this.device.exchange(command.toRaw());
    const response = APDUResponse.setOperationMode(data);

    return response.data;
  }

  /**
   * Get random bytes.
   * @param {Number} size
   * @returns {Buffer}
   */

  async getRandom(size) {
    assert(typeof size === 'number');
    assert(size <= 255, 'size must be less than 255');

    this.logger.debug('get %d random bytes:', size);

    const command = APDUCommand.getRandom(size);
    const data = await this.device.exchange(command.toRaw());
    const response = APDUResponse.getRandom(data, size);

    return response.data;
  }

  /**
   * Get public key.
   * @async
   * @param {(Number[]|String)} path - Full derivation path
   * @param {apdu.addressFlags} - Verify and address types
   * @returns {Object} - publicKey, chainCode, address
   * @throws {LedgerError}
   */

  async getPublicKey(path, addressFlags) {
    this.logger.debug('getting public key for:', path);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    assert(Array.isArray(path), 'Path must be string or array');

    const indexes = path;
    const command = APDUCommand.getWalletPublicKey(indexes, addressFlags);
    const responseBuffer = await this.device.exchange(command.toRaw());
    const response = APDUResponse.getWalletPublicKey(responseBuffer);

    return response.data;
  }

  /**
   * Get trusted input.
   * @param {bcoin.TX} tx
   * @param {Number} inputIndex
   * @returns {Buffer} trustedInput
   * @throws {LedgerError}
   */

  async getTrustedInput(tx, inputIndex) {
    assert(TX.isTX(tx));

    this.logger.spam('getting trusted input, tx: %h, output: %d',
      tx.hash(), inputIndex);

    const messages = utilTX.splitTransaction(tx);

    // first packet must contain inputIndex
    const firstMessage = bufio.write(messages[0].length + 4);
    firstMessage.writeU32BE(inputIndex);
    firstMessage.writeBytes(messages[0]);
    messages[0] = firstMessage.render();

    const last = messages.pop();

    let first = true;
    for (const message of messages) {
      const packet = APDUCommand.getTrustedInput(message, first);
      const responseBuffer = await this.device.exchange(packet.toRaw());

      // check if throws
      APDUResponse.getTrustedInput(responseBuffer);
      first = false;
    }

    const packet = APDUCommand.getTrustedInput(last, false);
    const responseBuffer = await this.device.exchange(packet.toRaw());
    const response = APDUResponse.getTrustedInput(responseBuffer);

    return response.data;
  }

  /**
   * Start composing tx.
   * @async
   * @param {bcoin.MTX} tx - Mutable transaction
   * @param {bcoin.CoinView} view
   * @param {Object} tis - trusted inputs map[prevoutKey] = trustedInput
   * @param {Boolean} [isNew=false]
   * @param {Boolean} [witness=false] - is v1 tx
   * @throws {LedgerError}
   */

  async hashTransactionStart(tx, view, tis, isNew, hasWitness) {
    assert(TX.isTX(tx), 'tx must be instanceof TX');
    assert(view instanceof CoinView, 'view must be instanceof CoinView');
    assert(typeof tis === 'object', 'Trusted input map not found.');

    this.logger.spam('hashTransactionStart, start composing tx.');
    const packets = [APDUCommand.hashTransactionStart(
      utilTX.splitVersionInputs(tx),
      true,
      isNew,
      hasWitness
    )];

    for (const input of tx.inputs) {
      const prevoutKey = input.prevout.toRaw();

      let buffer;

      if (tis.get(prevoutKey)) {
        const ti = tis.get(prevoutKey);

        // Trusted input
        const scriptSize = input.script.getSize();
        const scriptVarintSize = encoding.sizeVarint(scriptSize);
        buffer = bufio.write(2 + ti.length + scriptVarintSize);

        buffer.writeU8(0x01);
        buffer.writeU8(ti.length);
        buffer.writeBytes(ti);
        buffer.writeVarint(scriptSize);
      } else if (hasWitness) {
        // Prevout + Amount
        const outpointSize = input.prevout.getSize();
        const amountSize = 8;
        const scriptSize = input.script.getSize();
        const scriptVarintSize = encoding.sizeVarint(scriptSize);
        const coin = view.getCoinFor(input);

        buffer = bufio.write(1 + amountSize + outpointSize + scriptVarintSize);

        buffer.writeU8(0x02);
        input.prevout.toWriter(buffer);
        buffer.writeI64(coin.value);
        buffer.writeVarint(scriptSize);
      } else {
        // Prevout
        const outpointSize = input.prevout.getSize(); // always 36
        const scriptSize = input.script.getSize();
        const scriptVarintSize = encoding.sizeVarint(scriptSize);
        buffer = bufio.write(1 + outpointSize + scriptVarintSize);

        buffer.writeU8(0x00);
        input.prevout.toWriter(buffer);
        buffer.writeVarint(scriptSize);
      }

      packets.push(APDUCommand.hashTransactionStart(
        buffer.render(),
        false,
        isNew,
        hasWitness
      ));

      const scripts = utilTX.splitBuffer(
        input.script.toRaw(),
        utilTX.MAX_SCRIPT_BLOCK,
        true
      );
      const last = scripts.pop();
      const sequence = bufio.write(last.length + 4);

      sequence.writeBytes(last);
      sequence.writeU32(input.sequence);

      scripts.push(sequence.render());

      for (const script of scripts) {
        packets.push(APDUCommand.hashTransactionStart(
          script,
          false,
          isNew,
          hasWitness
        ));
      }
    }

    for (const packet of packets) {
      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.hashTransactionStart(res);
    }
  }

  /**
   * Prepare legacy transaction and
   * start sending inputs.
   * @async
   * @param {bcoin.MTX} mtx - mutable transaction
   * @param {Buffer} key - Prevout to key
   * @param {bcoin.Script} prev - prev script for current input
   * @param {Object} [tis=BufferMap] - trusted inputs map
   * @param {Boolean} [isNew=false] - is new transaction
   * @param {boolean} [witness=false] - is v1 transaction
   * @throws {LedgerError}
   */

  async hashTransactionStartNullify(mtx, key, prev, tis, isNew, witness) {
    assert(MTX.isMTX(mtx));

    this.logger.spam('prepare legacy transaction.');

    if (!tis)
      tis = new BufferMap();

    const view = mtx.view;
    const newTX = new TX();
    newTX.inject(mtx);

    // nullify other input scripts
    for (const input of newTX.inputs) {
      const prevoutKey = input.prevout.toRaw();

      if (prevoutKey.equals(key))
        input.script = prev;
      else
        input.script = NULL_SCRIPT;
    }

    await this.hashTransactionStart(newTX, view, tis, isNew, witness);
  }

  /**
   * Prepare witness transaction and
   * start sending inputs.
   * @async
   * @param {bcoin.TX} tx
   * @param {Buffer} key - Prevout to Key(String)
   * @param {bcoin.CoinView} view
   * @param {bcoin.Script} prev - prev script for current input
   * @throws {LedgerError}
   */

  async hashTransactionStartSegwit(tx, view, key, prev) {
    assert(TX.isTX(tx));

    this.logger.spam('prepare witness transaction.');

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

    await this.hashTransactionStart(newTX, view, new BufferMap(), false, true);
  }

  /**
   * Send and verify outputs.
   * @async
   * @param {bcoin.TX} tx
   * @returns {Boolean[]}
   * @throws {LedgerError}
   */

  async hashOutputFinalize(tx) {
    assert(TX.isTX(tx));

    this.logger.spam('send and verify outputs on the device.');

    let size = encoding.sizeVarint(tx.outputs.length);

    for (const output of tx.outputs)
      size += output.getSize();

    const outputs = bufio.write(size);

    outputs.writeVarint(tx.outputs.length);

    for (const output of tx.outputs)
      output.toWriter(outputs);

    const messages = utilTX.splitBuffer(outputs.render(),
      utilTX.MAX_SCRIPT_BLOCK);

    const lastMessage = messages.pop();

    for (const message of messages) {
      const packet = APDUCommand.hashOutputFinalize(message, true);
      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.hashOutputFinalize(res);
    }

    const lastPacket = APDUCommand.hashOutputFinalize(lastMessage, false);
    const res = await this.device.exchange(lastPacket.toRaw());
    return APDUResponse.hashOutputFinalize(res).data;
  }

  /**
   * Sign the processed transaction.
   * @async
   * @param {String|Numbers[]} path
   * @param {bcoin.TX} tx
   * @param {bcoin.Script.SighashType} type
   * @returns {Buffer} signed hash
   * @throws {LedgerError}
   */

  async hashSign(tx, path, type) {
    assert(TX.isTX(tx));

    this.logger.spam('sign the processed transaction.');

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    const packet = APDUCommand.hashSign(path, tx.locktime, type);
    const res = await this.device.exchange(packet.toRaw());

    return APDUResponse.hashSign(res).data;
  }

  /**
   * Prepare message for signing (legacy).
   * @param {Number[]} path
   * @param {Buffer} message
   */

  async signMessagePrepare0(path, message) {
    assert(Array.isArray(path), 'Path must be string or array');
    assert(Buffer.isBuffer(message), 'Message is not a buffer.');

    this.logger.spam('prepare message for signing.(legacy)');

    const data = bufio.write();
    data.writeBytes(util.encodePath(path));
    data.writeU8(message.length);
    data.writeBytes(message);

    assert(data.getSize() <= 255, 'Message + path is too big.');

    const packet = APDUCommand.signMessage(data.render(), true, true, true);
    const rawResponse = await this.device.exchange(packet.toRaw());
    const response = APDUResponse.signMessage0(rawResponse);

    return response.data;
  }

  /**
   * Prepare message for signing.
   * @param {Number[]} path
   * @param {Buffer} message
   */

  async signMessagePrepare(path, message) {
    assert(Array.isArray(path), 'Path must be string or array');
    assert(Buffer.isBuffer(message), 'Message is not a buffer.');

    this.logger.spam('prepare message for signing.');

    let buffers;

    {
      const data = bufio.write();

      data.writeBytes(util.encodePath(path));
      data.writeU16BE(message.length);
      data.writeBytes(message);

      buffers = utilTX.splitBuffer(
        data.render(),
        255
      );
    }

    const packets = [
      APDUCommand.signMessage(buffers.shift(), true, true)
    ];

    for (const buffer of buffers)
      packets.push(APDUCommand.signMessage(buffer, true, false));

    const last = packets.pop();

    let buffer = Buffer.alloc(0);

    for (const packet of packets) {
      const data = await this.device.exchange(packet.toRaw());
      const response = APDUResponse.signMessage(data, buffer);
      buffer = response.data.encryptedOutputData;
    }

    const data = await this.device.exchange(last.toRaw());
    const response = APDUResponse.signMessage(data, buffer, true);

    return response.data;
  }

  /**
   * Get the signature.
   * @param {String} pin (not tested.)
   * @returns {Buffer}
   */

  async signMessageFinal(pin) {
    this.logger.spam('get the message signature.');

    let data;

    if (pin) {
      const bw = bufio.write();
      const buf = Buffer.from(pin, 'utf8');

      bw.writeU8(buf.length);
      bw.writeBytes(buf);

      data = bw.render();
    } else {
      data = Buffer.alloc(1, 0x00);
    }

    const packet = APDUCommand.signMessage(data, false, false);
    const rawResponse = await this.device.exchange(packet.toRaw());
    const response = APDUResponse.signMessageFinal(rawResponse);

    return response.data;
  }

  /**
   * Sign the message.
   * @async
   * @param {(Number[]|String)} path - Full derivation path
   * @param {Buffer} message - Message to sign
   * @param {String?} pin - pin
   */

  async signMessage(path, message, pin) {
    assert(Buffer.isBuffer(message), 'Message is not a buffer.');
    assert(message.length < 0xffff, 'Message is too big (max 0xffff)');

    this.logger.spam('sign the message %h with key at %s.', message, path);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    let result;
    try {
      result = await this.signMessagePrepare(path, message);
    } catch (e) {
      if (e.code !== 0x6b00) // is it old firmware?
        throw e;

      // try legacy
      result = await this.signMessagePrepare0(path, message);
    }

    if (result.confirmationNeeded)
      assert(typeof pin === 'string', 'PIN is required.');

    const signature = await this.signMessageFinal(pin);

    return signature;
  }

  /**
   * @see signMessage
   */

  async signMessageLegacy(path, message, pin) {
    assert(Buffer.isBuffer(message), 'Message is not a buffer.');

    this.logger.spam('sign the message %h with key at %s. (legacy)',
      message, path);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    const result = await this.signMessagePrepare0(path, message);

    if (result.confirmationNeeded)
      assert(typeof pin === 'string', 'PIN is required.');

    const signature = await this.signMessageFinal(pin);

    return signature;
  }
}

LedgerBTCApp.addressFlags = LedgerProtocol.APDU.addressFlags;

module.exports = LedgerBTCApp;
