/*!
 * bledger.js - Ledger communication
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const LedgerError = require('./protocol/error');
const DeviceError = require('./devices/error');
const LedgerBcoin = require('./bcoin');
const LedgerTXInput = require('./txinput');
const USB = require('./devices/usb');

exports.bledger = exports;

exports.USB = USB;

exports.LedgerError = LedgerError;
exports.DeviceError = DeviceError;

exports.LedgerBcoin = LedgerBcoin;
exports.LedgerTXInput = LedgerTXInput;
