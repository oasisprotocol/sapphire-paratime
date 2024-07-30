NPM ?= pnpm

all: build test

build test lint format::
	$(NPM) $@

clean:
	rm -rf dist artifacts cache typechain-types ignition/deployments

distclean:
	rm -rf node_modules *.tgz

dependencies:
	$(MAKE) -C ../../integrations/hardhat full

full: clean dependencies all

.PHONY: all clean test distclean dependencies full
