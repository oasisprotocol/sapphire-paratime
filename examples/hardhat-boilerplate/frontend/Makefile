NPM ?= pnpm

all: build

clean:
	rm -rf build report.html src/contracts

veryclean: clean
	rm -rf node_modules

report.html: build/bundle-stats.json
	$(NPM) webpack-bundle-analyzer -m static $<

build/bundle-stats.json: build

build:
	$(NPM) $@ --stats

start eject::
	$(NPM) $@

.PHONY: build clean veryclean all
