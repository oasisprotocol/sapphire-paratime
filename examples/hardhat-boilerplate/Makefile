NPM ?= pnpm

all: build

build:
	$(NPM) $@
	$(MAKE) -C frontend $@

clean:
	$(MAKE) -C frontend $@
	rm -rf artifact cache

distclean: clean
	$(MAKE) -C frontend $@

.PHONY: build clean distclean
