/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('./util/assert');
const util = require('../lib/utils/transaction');
const common = require('../lib/protocol/common');
const Signature = require('../lib/utils/signature');

const sigVector = require('./data/signature.json');

const responseTests = [{
  messages: [
    Buffer.from('010105000000053132333434', 'hex')
  ],
  expectedData: Buffer.from('3132333434', 'hex')
}, {
  messages: [
    Buffer.from(
    '0101050000003900000000000000000000000000' +
    '0000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000' +
    '00000000', 'hex')
  ],
  expectedData: Buffer.from(
    '0000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000', 'hex')
}, {
  messages: [
    Buffer.from(
      '0101050000008741042d4eaa0351d491c928b8d2' +
      '95079927abc4c4c595d98d5f30d8acf8e7476b2c' +
      '68e0ab3f929bbebb13e181ffc8a133a4aa87c256' +
      '8d537a3c', 'hex'),
    Buffer.from(
      '0101050001923f63e8df1f4d5fdc223138436933' +
      '4339377a6a31377238586d773843665536517351' +
      '724c5042476a556776b6ab28942fd09759fe7270' +
      'ac84d5d8', 'hex'),
    Buffer.from(
      '0101050002747c502066254596e69deaec01b266' +
      '2bea900000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '00000000', 'hex')
  ],
  expectedData: Buffer.from(
    '41042d4eaa0351d491c928b8d295079927abc4c4' +
    'c595d98d5f30d8acf8e7476b2c68e0ab3f929bbe' +
    'bb13e181ffc8a133a4aa87c2568d537a3c923f63' +
    'e8df1f4d5fdc2231384369334339377a6a313772' +
    '38586d773843665536517351724c5042476a5567' +
    '76b6ab28942fd09759fe7270ac84d5d8747c5020' +
    '66254596e69deaec01b2662bea9000', 'hex')
}];

describe('utils', function () {
  it('should split buffer to messages', () => {
    for (const test of responseTests) {
      const buf = Buffer.concat(test.messages);
      const messages = util.splitBuffer(buf, 64);

      for (let i = 0; i < messages.length; i++) {
        assert.bufferEqual(messages[i], test.messages[i]);
      }
    }
  });
});

function checkSignature(vector, lsig) {
  const msgbuf = vector.originalMessage;
  const hash = vector.messageHash;

  assert.bufferEqual(lsig.r, vector.r, 'R is not correct.');
  assert.bufferEqual(lsig.s, vector.s, 'S is not correct.');
  assert.strictEqual(lsig.recid, vector.param, 'RecId is not correct.');
  assert.bufferEqual(lsig.encode(), vector.sigrs, 'RS encoding error.');
  assert.bufferEqual(lsig.toDER(), vector.dersig, 'DER encoding error.');
  assert.bufferEqual(lsig.toLedgerSignature(), vector.ledgersig,
    'Ledger signature encoding error.');
  assert.bufferEqual(lsig.toCoreSignature(), vector.core,
    'Bitcoin Core signature encoding error.');

  {
    const compressedPublicKey = lsig.recover(hash, true);
    const uncompressedPublicKey = lsig.recover(hash, false);

    assert.bufferEqual(compressedPublicKey, vector.compressedPublicKey,
      'Recovered compressed public key does not match.');
    assert.bufferEqual(uncompressedPublicKey, vector.uncompressedPublicKey,
      'Recovered uncompressed public key does not match.');
  }

  {
    const compressedPublicKey = lsig.recoverMessage(msgbuf, true);
    const uncompressedPublicKey = lsig.recoverMessage(msgbuf, false);

    assert.bufferEqual(compressedPublicKey, vector.compressedPublicKey,
      'Recovered compressed public key does not match.');
    assert.bufferEqual(uncompressedPublicKey, vector.uncompressedPublicKey,
      'Recovered uncompressed public key does not match.');
  }

  {
    const compressedPublicKey = lsig.recoverMessage(msgbuf.toString(), true);
    const uncompressedPublicKey = lsig.recoverMessage(msgbuf.toString(), false);

    assert.bufferEqual(compressedPublicKey, vector.compressedPublicKey,
      'Recovered compressed public key does not match.');
    assert.bufferEqual(uncompressedPublicKey, vector.uncompressedPublicKey,
      'Recovered uncompressed public key does not match.');
  }

  assert.ok(lsig.verify(hash, vector.compressedPublicKey),
    'Verification failed for compressed public key.'
  );

  assert.ok(lsig.verify(hash, vector.uncompressedPublicKey),
    'Verification failed for uncompressed public key.'
  );

  assert.ok(lsig.verifyMessage(msgbuf, vector.compressedPublicKey),
    'Verification failed for compressed public key.'
  );

  assert.ok(lsig.verifyMessage(msgbuf, vector.uncompressedPublicKey),
    'Verification failed for uncompressed public key.'
  );

  assert.ok(lsig.verifyMessage(msgbuf.toString(), vector.compressedPublicKey),
    'Verification failed for compressed public key.'
  );

  assert.ok(lsig.verifyMessage(msgbuf.toString(), vector.uncompressedPublicKey),
    'Verification failed for uncompressed public key.'
  );
}

describe('Signature', function () {
  const vector = {};

  before(() => {
    for (const [k, v] of Object.entries(sigVector)) {
      if (k === 'param') {
        vector[k] = v;
        continue;
      }

      if (k === 'originalMessage') {
        vector[k] = Buffer.from(v, 'binary');
        continue;
      }

      vector[k] = Buffer.from(v, 'hex');
    }
  });

  it('should encode message', () => {
    const msgbuf = Buffer.from(vector.originalMessage);
    const hash = common.encodeMessage(msgbuf);

    assert.bufferEqual(hash, vector.messageHash);
  });

  it('should create sig from Options', () => {
    const sig = Signature.fromOptions({
      r: vector.r,
      s: vector.s,
      recid: vector.param
    });

    checkSignature(vector, sig);
  });

  it('should create sig from RS and recid', () => {
    const sig = Signature.decode(vector.sigrs);

    // decode from RS wont recover recid
    sig.setRecid(vector.param);

    checkSignature(vector, sig);
  });

  it('should create sig from DER and recid', () => {
    const sig = Signature.fromDER(vector.dersig);

    // DER does not contain recid either.
    sig.setRecid(vector.param);

    checkSignature(vector, sig);
  });

  it('should create sig from Ledger signature format', () => {
    const sig = Signature.fromLedgerSignature(vector.ledgersig);

    checkSignature(vector, sig);
  });

  it('should create sig from Core Signature format', () => {
    const sig = Signature.fromCoreSignature(vector.core);

    checkSignature(vector, sig);
  });
});
