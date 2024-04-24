NPM ?= pnpm

all: build test lint

build lint test format::
	$(NPM) $@

clean:
	rm -rf dist

veryclean:
	rm -rf node_modules *.tgz

dependencies:
	$(MAKE) -C ../../clients/js full

full: clean dependencies all

.PHONY: all clean veryclean dependencies full
