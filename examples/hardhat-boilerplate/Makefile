NPM ?= pnpm

all: build

build:
	$(MAKE) -C frontend $@

clean:
	$(MAKE) -C frontend $@
	rm -rf artifact cache

veryclean: clean
	$(MAKE) -C frontend $@
