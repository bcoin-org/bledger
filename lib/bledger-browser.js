/*!
 * bledger-browser.js - Ledger communication for browser
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const LedgerError = require('./protocol/error');
const DeviceError = require('./devices/error');
const LedgerBcoin = require('./bcoin');
const LedgerTXInput = require('./txinput');
const WebUSB = require('./devices/webusb');
const WebAuthn = require('./devices/webauthn');

exports.bledger = exports;

exports.WebUSB = WebUSB;
exports.WebAuthn = WebAuthn;

exports.LedgerError = LedgerError;
exports.DeviceError = DeviceError;

exports.LedgerBcoin = LedgerBcoin;
exports.LedgerTXInput = LedgerTXInput;
