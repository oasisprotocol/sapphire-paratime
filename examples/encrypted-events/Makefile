NPM ?= pnpm

all: build test

build:
	$(NPM) $@

test: build
	$(NPM) $@

clean:
	rm -rf artifacts cache typechain typechain-types

distclean: clean
	rm -rf node_modules

.PHONY: all build test clean distclean
