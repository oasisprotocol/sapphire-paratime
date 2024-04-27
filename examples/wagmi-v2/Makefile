NPM ?= pnpm

build:
	$(NPM) build

clean:
	rm -rf dist stats.html

distclean: clean
	rm -rf node_modules

dependencies:
	$(MAKE) -C ../../integrations/wagmi-v2 full

full: dependencies build

test:
	@echo Please make tests for wagmi-v2 example!

run:
	$(NPM) run dev

run-proxied:
	SAPPHIRE_LOCALNET_HTTP_PROXY_PORT=3001 $(NPM) run dev

.PHONY: all clean distclean dependencies full test run run-proxied
