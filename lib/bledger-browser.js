/*!
 * bledger-browser.js - Ledger communication for browser
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const LedgerError = require('./protocol/error');
const DeviceError = require('./device/error');
const LedgerBcoin = require('./bcoin');
const LedgerTXInput = require('./txinput');
const USB = require('./device/usb');
const WebAuthn = require('./device/webauthn');

exports.bledger = exports;

exports.USB = USB;
exports.WebAuthn = WebAuthn;

exports.LedgerError = LedgerError;
exports.DeviceError = DeviceError;

exports.LedgerBcoin = LedgerBcoin;
exports.LedgerTXInput = LedgerTXInput;
