NPM ?= pnpm

all: build lint

build lint format test::
	$(NPM) $@

clean:
	rm -rf dist *.tsbuildinfo

distclean:
	rm -rf node_modules *.tgz

dependencies:
	$(MAKE) -C ../../clients/js full

full: clean dependencies all

.PHONY: all clean distclean dependencies full
