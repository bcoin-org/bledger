# bledger

[![Build Status][circleci-status-img]][circleci-status-url]
[![Coverage Status][coverage-status-img]][coverage-status-url]

Ledger hardware wallet api for Bcoin.

## Usage
You can check [examples/](examples/)

### Note
- `bcoin` is a peer dependency.

## Installation

Bledger depends on [busb][busb] which needs following libraries in order to build.

### Debian/Ubuntu

Add the necessary dependencies:
```sh
apt-get install libusb-dev libudev-dev
```

## Contribution and License Agreement

If you contribute code to this project, you are implicitly allowing your code
to be distributed under the MIT license. You are also implicitly verifying that
all code is your original work. `</legalese>`

## License

- Copyright (c) 2018, The Bcoin Developers (MIT License).

See LICENSE for more info.

[busb]: https://github.com/nodar-chkuaselidze/busb
[coverage-status-img]: https://codecov.io/gh/bcoin-org/bledger/badge.svg?branch=master
[coverage-status-url]: https://codecov.io/gh/bcoin-org/bledger?branch=master
[circleci-status-img]: https://circleci.com/gh/bcoin-org/bledger/tree/master.svg?style=shield
[circleci-status-url]: https://circleci.com/gh/bcoin-org/bledger/tree/master
