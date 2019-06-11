/*!
 * bledger.js - Ledger communication
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const LedgerError = require('./protocol/error');
const DeviceError = require('./device/error');
const USB = require('./device/usb');

const LedgerBcoin = require('./ledger/ledgerbcoin');
const ManagedLedgerBcoin = require('./ledger/managed-ledgerbcoin');
const LedgerTXInput = require('./ledger/txinput');

exports.bledger = exports;

exports.USB = USB;

exports.LedgerError = LedgerError;
exports.DeviceError = DeviceError;

exports.ManagedLedgerBcoin = ManagedLedgerBcoin;
exports.LedgerBcoin = LedgerBcoin;
exports.LedgerTXInput = LedgerTXInput;
