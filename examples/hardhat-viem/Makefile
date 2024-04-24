NPM ?= pnpm

build:
	$(NPM) build

test: build
	$(NPM) test

clean:
	rm -rf artifacts cache typechain-types

veryclean: clean
	rm -rf node_modules

.PHONY: build test clean veryclean
