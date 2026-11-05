NPM ?= pnpm

all: build

clean:
	rm -rf dist stats.html src/contracts

distclean: clean
	rm -rf node_modules

build:
	$(NPM) $@

start:
	$(NPM) $@

.PHONY: build clean distclean all start
