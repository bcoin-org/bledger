'use strict';

const assert = require('bsert');
const bufio = require('bufio');

/**
 * Index at which hardening begins.
 * @ignore
 * @const {Number}
 */

const HARDENED = 0x80000000;

/**
 * Parse a derivation path and return an array of indexes.
 * @see https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki
 * @param {String} path
 * @param {Boolean} hard
 * @returns {Number[]}
 */

exports.parsePath = (path, hard) => {
  assert(typeof path === 'string');
  assert(typeof hard === 'boolean');
  assert(path.length >= 1);
  assert(path.length <= 3062);

  const parts = path.split('/');
  const root = parts[0];

  if (root !== 'm'
      && root !== 'M'
      && root !== 'm\''
      && root !== 'M\'') {
    throw new Error('Invalid path root.');
  }

  const result = [];

  for (let i = 1; i < parts.length; i++) {
    let part = parts[i];

    const hardened = part[part.length - 1] === '\'';

    if (hardened)
      part = part.slice(0, -1);

    if (part.length > 10)
      throw new Error('Path index too large.');

    if (!/^\d+$/.test(part))
      throw new Error('Path index is non-numeric.');

    let index = parseInt(part, 10);

    if ((index >>> 0) !== index)
      throw new Error('Path index out of range.');

    if (hardened) {
      index |= HARDENED;
      index >>>= 0;
    }

    if (!hard && (index & HARDENED))
      throw new Error('Path index cannot be hardened.');

    result.push(index);
  }

  return result;
};

/**
 * split path to 32BE ints
 * @param {Number[]} path
 * @returns {Buffer}
 */

exports.encodePath = (path) => {
  if (typeof path === 'string') {
    path = exports.parsePath(path, true);
  }

  const parts = path;
  const bw = bufio.write(1 + parts.length * 4);

  bw.writeU8(parts.length);

  for (const index of parts)
    bw.writeU32BE(index);

  return bw.render();
};
