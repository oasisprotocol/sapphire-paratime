NPM ?= pnpm

all: build test

build:
	$(NPM) $@

test: build
	$(NPM) $@

clean:
	rm -rf artifacts cache typechain-types

distclean: clean
	rm -rf node_modules

.PHONY: build test clean distclean
