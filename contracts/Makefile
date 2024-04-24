NPM ?= pnpm

all: build test lint

build lint format test::
	$(NPM) $@

clean:
	rm -rf artifacts cache typechain-types

veryclean:
	rm -rf node_modules *.tgz

dependencies:
	$(MAKE) -C ../../clients/js full

full: clean dependencies all

.PHONY: all clean test veryclean dependencies full
