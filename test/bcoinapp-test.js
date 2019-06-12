
/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const utils = require('./util/utils');

const {Device} = require('./util/device');
const LedgerBTC = require('../lib/ledger/ledger');
const LedgerBcoin = require('../lib/ledger/ledgerbcoin');
const LedgerTXInput = require('../lib/ledger/txinput');
const LedgerSignature = require('../lib/utils/signature');

const TX = require('bcoin/lib/primitives/tx');
const MTX = require('bcoin/lib/primitives/mtx');
const Coin = require('bcoin/lib/primitives/coin');
const KeyRing = require('bcoin/lib/primitives/keyring');
const {Script} = require('bcoin/lib/script');
const hashType = Script.hashType;

const {BufferMap} = require('buffer-map');

const getRing = utils.getCommands('data/getRing.json');
const getParentFingerprint = utils.getCommands('data/getParentFP.json');
const getTrustedInput = utils.getCommands('data/getTrustedInput.json');
const hashTxStart = utils.getCommands('data/hashTransactionStart.json');
const hashOutputFinalize = utils.getCommands('data/hashOutputFinalize.json');
const hashSign = utils.getCommands('data/hashSign.json');

const tx1 = utils.getCommands('data/tx1.json');
const tx2 = utils.getCommands('data/tx2.json');
const multisigTX1 = utils.getCommands('data/tx-p2sh-mulsig.json');
const wtx1 = utils.getCommands('data/wtx1.json');
const multisigWTX1 = utils.getCommands('data/tx-p2wsh-mulsig.json');

const firmwareInformation = utils.getCommands('data/firmwareVersion.json');
const operationMode = utils.getCommands('data/operationMode.json');
const signMessages = utils.getCommands('data/signMessages.json');

describe('Bitcoin App', function () {
  let device, bcoinApp, btcApp;

  beforeEach(() => {
    device = new Device();
    bcoinApp = new LedgerBcoin({ device });
    btcApp = new LedgerBTC({ device });
  });

  it('should get firmware version', async () => {
    const {data, responses, commands} = firmwareInformation;

    device.set({ responses });

    const info = await bcoinApp.getFirmwareVersion();
    const deviceCommands = device.getCommands();

    assert.strictEqual(deviceCommands.length, 1);
    assert.bufferEqual(deviceCommands[0], commands[0]);

    assert.deepStrictEqual(info, data.info);
  });

  it('should get and set operation mode', async () => {
    const {data, responses, commands} = operationMode;

    device.set({ responses });

    const mode = await bcoinApp.getOperationMode();

    assert.deepStrictEqual(mode, data.operationMode);

    await bcoinApp.setOperationMode(mode.mode);

    const deviceCommands = device.getCommands();

    assert.strictEqual(deviceCommands.length, 2);
    assert.bufferEqual(deviceCommands[0], commands[0]);
    assert.bufferEqual(deviceCommands[1], commands[1]);
  });

  it('should get random bytes', async () => {
    const responses = [
      Buffer.from('1d6bd12e842c2ee601f41c496054cc2b470280599000', 'hex')
    ];

    const expected = Buffer.from(
      '1d6bd12e842c2ee601f41c496054cc2b47028059',
      'hex'
    );

    const expectedCommand = Buffer.from('e0c0000014', 'hex');

    device.set({ responses });

    const randomBytes = await bcoinApp.randomBytes(20);

    assert.bufferEqual(randomBytes, expected,
      'Could not get random bytes correctly.');

    const deviceCommands = device.getCommands();

    assert.strictEqual(deviceCommands.length, 1,
      'Incorrect number of commands.');

    assert.bufferEqual(deviceCommands[0], expectedCommand,
      'Incorrect first message.');
  });

  it('should get ring from pubkey', async () => {
    const {data, responses, commands} = getRing;

    device.set({ responses });

    bcoinApp.set({
      network: 'testnet'
    });

    const path = data.path;
    const hd = await bcoinApp.getPublicKey(path);
    const ring = KeyRing.fromPublic(hd.publicKey);

    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    // ring checks
    assert.strictEqual(ring.getPublicKey('hex'), data.pubkey);
  });

  it('should get parent fingerprint', async () => {
    const {data, responses, commands} = getParentFingerprint;

    device.set({ responses });

    bcoinApp.set({
      network: 'main'
    });

    const path = data.path;
    const hd = await bcoinApp.getPublicKey(path, true);

    assert.strictEqual(hd.parentFingerPrint, data.parentFingerPrint);
    assert.strictEqual(hd.publicKey.toString('hex'), data.publicKey);

    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }
  });

  it('should handle getTrustedInput commands', async () => {
    const {tx, responses, commands} = getTrustedInput;

    device.set({ responses });

    const response = await btcApp.getTrustedInput(TX.fromRaw(tx), 1);
    const deviceCommands = device.getCommands();

    assert.bufferEqual(response, responses[12].slice(0, -2));

    for (let i = 0; i < deviceCommands.length; i++) {
      assert.bufferEqual(deviceCommands[i], commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );
  });

  it('should handle hashTransactionStart non-segwit commands', async () => {
    const {data, tx, responses, commands} = hashTxStart;

    device.set({ responses });

    const tis = new BufferMap();

    for (const tik of Object.keys(data.trusted)) {
      const key = Buffer.from(tik, 'hex');
      tis.set(key, Buffer.from(data.trusted[tik], 'hex'));
    }

    const mtx = MTX.fromRaw(tx);
    const pokey = Buffer.from(data.prevoutKey, 'hex');
    const prev = Script.fromRaw(data.prev, 'hex');

    await btcApp.hashTransactionStartNullify(mtx, pokey, prev, tis, true);

    const deviceCommands = device.getCommands();

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    for (let i = 0; i < deviceCommands.length; i++) {
      assert.bufferEqual(deviceCommands[i], commands[i],
        `Message ${i} wasn't correct`
      );
    }
  });

  it('should handle hashOutputFinalize', async () => {
    const {tx, responses, commands} = hashOutputFinalize;

    device.set({ responses });

    const validations = await btcApp.hashOutputFinalize(TX.fromRaw(tx));
    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    assert.strictEqual(validations.length, 2,
      'There should be 2 user validation requests'
    );

    for (const validation of validations) {
      assert.strictEqual(validation, false,
        'All valdiation requests are false'
      );
    }
  });

  it('should handle hashSign', async () => {
    const {
      tx,
      responses,
      commands,
      data
    } = hashSign;

    device.set({ responses });

    const path = 'm/44\'/0\'/0\'/0/0';
    const sigType = hashType.ALL;

    const signature = await btcApp.hashSign(TX.fromRaw(tx), path, sigType);

    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    assert.bufferEqual(signature, Buffer.from(data.signature, 'hex'),
      'Signature wasn\'t correct'
    );
  });

  for (const [i, txData] of [tx1, tx2].entries()) {
    it(`should sign normal P2PKH transaction ${i}`, async () => {
      const { data, tx, commands, responses } = txData;

      device.set({ responses });

      const ledgerInputs = wrapCoinInputs(data.ledgerInputs);

      const mtx = MTX.fromRaw(tx, 'hex');
      await bcoinApp.signTransaction(mtx, ledgerInputs);

      const deviceCommands = device.getCommands();

      for (const [i, deviceCommand] of deviceCommands.entries()) {
        assert.bufferEqual(deviceCommand, commands[i],
          `Message ${i} wasn't correct`
        );
      }

      assert.strictEqual(deviceCommands.length, commands.length,
        'Number of messages doesn\'t match'
      );

      assert.bufferEqual(mtx.toRaw(), Buffer.from(data.signedTX, 'hex'),
        'Transaction was not signed properly'
      );
    });
  }

  for (const [i, txData] of [multisigTX1].entries()) {
    it(`should sign P2SH/Multisig transaction ${i}`, async () => {
      const {data, tx, commands, responses } = txData;

      device.set({ responses });

      const ledgerInputs = wrapCoinInputs(data.ledgerInputs);

      const mtx = MTX.fromRaw(tx, 'hex');
      await bcoinApp.signTransaction(mtx, ledgerInputs);

      const deviceCommands = device.getCommands();

      for (const [i, deviceCommand] of deviceCommands.entries()) {
        assert.bufferEqual(deviceCommand, commands[i],
          `Message ${i} wasn't correct`
        );
      }

      assert.strictEqual(deviceCommands.length, commands.length,
        'Number of messages doesn\'t match'
      );

      assert.bufferEqual(mtx.toRaw(), Buffer.from(data.signedTX, 'hex'),
        'Transaction was not signed properly'
      );
    });
  }

  it('should sign P2WPKH transaction', async () => {
    const {data, tx, commands, responses} = wtx1;

    device.set({ responses });

    const ledgerInputs = wrapCoinInputs(data.ledgerInputs);
    const mtx = MTX.fromRaw(tx, 'hex');

    updateCoinView(mtx, ledgerInputs);

    await bcoinApp.signTransaction(mtx, ledgerInputs);

    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    assert.bufferEqual(mtx.toRaw(), Buffer.from(data.signedTX, 'hex'),
      'Transaction was not signed properly'
    );
  });

  it('should sign P2WSH transaction', async () => {
    const {data, tx, commands, responses} = multisigWTX1;

    device.set({ responses });

    const ledgerInputs = wrapCoinInputs(data.ledgerInputs);
    const mtx = MTX.fromRaw(tx, 'hex');

    updateCoinView(mtx, ledgerInputs);

    await bcoinApp.signTransaction(mtx, ledgerInputs);

    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    assert.bufferEqual(mtx.toRaw(), Buffer.from(data.signedTX, 'hex'),
      'Transaction was not signed properly'
    );
  });

  it('should sign abritrary messages', async () => {
    const {
      path,
      publicKey,
      messagesToSign,
      signatures,
      commands,
      responses
    } = signMessages.data;

    device.set({
      responses: responses.map(r => Buffer.from(r, 'hex'))
    });

    for (const [i, message] of messagesToSign.entries()) {
      const msgbuf = Buffer.from(message, 'hex');
      const signature = await bcoinApp.signMessage(path, msgbuf);

      assert.strictEqual(
        signature.toString('hex'),
        signatures[i],
        ''
      );

      const recPubKey = signature.recoverMessage(msgbuf);
      assert.strictEqual(recPubKey.toString('hex'), publicKey);
      assert.ok(signature.verifyMessage(msgbuf, recPubKey));
    }

    const deviceCommands = device.getCommands();
    assert.strictEqual(deviceCommands.length, commands.length);
    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.strictEqual(deviceCommand.toString('hex'), commands[i],
        `Message ${i} was not correct.`
      );
    }
  });

  it('should sign abritrary messages(legacy)', async () => {
    const {
      path,
      publicKey,
      messagesToSign,
      signaturesLegacy,
      commandsLegacy,
      responsesLegacy
    } = signMessages.data;

    device.set({
      responses: responsesLegacy.map(r => Buffer.from(r, 'hex'))
    });

    for (const [i, message] of messagesToSign.entries()) {
      const msgbuf = Buffer.from(message, 'hex');

      if (signaturesLegacy[i] == null) {
        let err;

        try {
          await bcoinApp.signMessageLegacy(path, msgbuf);
        } catch (e) {
          err = e;
        }

        assert(err);
        assert.strictEqual(err.message, 'Message + path is too big.');
        continue;
      }

      const signature = await bcoinApp.signMessageLegacy(path, msgbuf);
      assert.equal(signature.toString('hex'), signaturesLegacy[i]);

      assert.ok(signature.verifyMessage(msgbuf, Buffer.from(publicKey, 'hex')));
    }

    const deviceCommands = device.getCommands();

    assert.strictEqual(deviceCommands.length, commandsLegacy.length);
    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.strictEqual(deviceCommand.toString('hex'), commandsLegacy[i],
        `Message ${i} was not correct.`
      );
    }
  });

  it('should verify signed messages from ledger', async () => {
    const {
      path,
      messagesToSign,
      signatures,
      commandsVerify,
      responsesVerify
    } = signMessages.data;

    device.set({
      responses: responsesVerify.map(r => Buffer.from(r, 'hex'))
    });

    for (const [i, message] of messagesToSign.entries()) {
      const msgbuf = Buffer.from(message, 'hex');
      const sig = LedgerSignature.fromLedgerSignature(
        Buffer.from(signatures[i], 'hex')
      );

      const verify = await bcoinApp.verifyMessage(path, msgbuf, sig);
      assert.strictEqual(verify, true, `Verification failed for message #${i}`);
    }

    const deviceCommands = device.getCommands();
    assert.strictEqual(deviceCommands.length, responsesVerify.length);
    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.strictEqual(deviceCommand.toString('hex'), commandsVerify[i],
        `Message ${i} was not correct.`
      );
    }
  });
});

function wrapCoinInputs(inputData) {
  const ledgerInputs = [];

  for (const ledgerInput of inputData) {
    const tx = TX.fromRaw(Buffer.from(ledgerInput.tx, 'hex'));

    const {
      index,
      path,
      redeem,
      witness
    } = ledgerInput;

    const redeemScript = redeem != null ? Script.fromRaw(redeem, 'hex') : null;

    if (witness || redeem) {
      const coin = Coin.fromTX(tx, index, 0);

      ledgerInputs.push(new LedgerTXInput({
        coin, index, witness, path,
        redeem: redeemScript
      }));
    } else {
      ledgerInputs.push(new LedgerTXInput({ tx, index, witness, path }));
    }
  }

  return ledgerInputs;
}

function updateCoinView(tx, ledgerInputs) {
  for (const input of ledgerInputs) {
    tx.view.addOutput(input.getOutpoint(), input.getCoin());
  }
}
