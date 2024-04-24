NPM ?= pnpm

all: build test lint

build lint format test::
	$(NPM) $@

clean:
	rm -rf dist artifacts cache typechain-types

veryclean:
	rm -rf node_modules *.tgz ignition/deployments

dependencies:
	$(MAKE) -C ../../clients/js full

full: clean dependencies all

.PHONY: all clean test veryclean dependencies full
