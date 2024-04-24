NPM ?= pnpm

all: build lint

build lint format::
	$(NPM) $@

clean:
	rm -rf dist *.tsbuildinfo

veryclean:
	rm -rf node_modules *.tgz

dependencies:
	$(MAKE) -C ../../clients/js full

full: clean dependencies all

.PHONY: all clean veryclean dependencies full
