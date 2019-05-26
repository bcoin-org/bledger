'use strict';

const bledger = require('../lib/bledger');
const {LedgerBcoin} = bledger;
const {Device} = bledger.USB;
const Logger = require('blgr');

(async () => {
  const logger = new Logger({
    console: true,
    level: 'debug'
  });

  await logger.open();

  // get first device available.
  const device = await Device.requestDevice();

  device.set({
    timeout: 5000,
    logger
  });

  await device.open();

  const ledgerBcoin = new LedgerBcoin({ device, logger });

  const purpose = 44;
  const coinType = 0;

  const path = `m/${purpose}'/${coinType}'/0/0`;

  const message = 'Hello bledger!';
  const hdpub = await ledgerBcoin.getPublicKey(path);
  const signature = await ledgerBcoin.signMessage(path, message);

  // recover compressed public key.
  const recoveredPublicKey = signature.recoverMessage(message, true);

  // get public key from ledger and verify
  const ledgerVerify = await ledgerBcoin.verifyMessage(
    path,
    message,
    signature
  );

  console.log(`Signature details:
    Path: ${path}
    Public key: ${hdpub.publicKey.toString('hex')}
    Message: ${message}
    Recovered public key: ${recoveredPublicKey.toString('hex')}

    R: ${signature.r.toString('hex')}
    S: ${signature.s.toString('hex')}
    Recovery id: ${signature.recid}

    Signature serializations:
      DER signature: ${signature.toDER().toString('hex')}
      Bitcoin Core hex: ${signature.toCoreSignature().toString('hex')}
      Bitcoin Core base64: ${signature.toCoreSignature().toString('base64')}

    Verify:
      With pubkey: ${signature.verifyMessage(message, hdpub.publicKey)}
      Get pubkey and verify: ${ledgerVerify}
  `);

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
