all:
	@echo "Nothing to build."

.certs:
	mkdir .certs

.certs/cert.pem: .certs
	@openssl req -x509 -newkey rsa:2048 \
		-keyout .certs/key.pem \
		-out .certs/cert.pem \
		-days 365 -batch -nodes

clean:
	@npm run clean

lint:
	@npm run lint

test:
	@npm test

test-hid:
	@npm run test-hid

test-webusb: .certs/cert.pem
	@npm run test-webusb

test-webauthn: .certs/cert.pem
	@npm run test-webauthn

docs:
	@npm run docs

cover:
	@npm run cover

.PHONY: all clean lint test test-hid test-webusb test-webauthn cert docs

