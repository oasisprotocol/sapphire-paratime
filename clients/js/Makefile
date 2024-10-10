NPM ?= pnpm

all: build test lint

build test lint format::
	$(NPM) $@

clean:
	rm -rf lib coverage

full: clean all

distclean: clean
	rm -rf node_modules *.tgz

.PHONY: all clean distclean dependencies full
