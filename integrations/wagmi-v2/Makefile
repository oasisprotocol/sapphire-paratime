NPM ?= pnpm

all: build lint

build lint format::
	$(NPM) $@

clean:
	rm -rf dist

veryclean: clean
	rm -rf node_modules

test:
	@echo wagmi-v2 integration not testable yet! Please write tests!

dependencies:
	$(MAKE) -C ../viem-v2 full

full: clean dependencies build

.PHONY: all clean test veryclean dependencies full
