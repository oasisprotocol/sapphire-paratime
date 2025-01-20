
all: build test

build:
	forge install foundry-rs/forge-std --no-commit --no-git
	forge install oasisprotocol/sapphire-paratime --no-commit --no-git
	cd src/precompiles && cargo +nightly build --release

test:
	forge test

clean:
	forge clean
	rm -rf cache
	rm -rf src/precompiles/target
	rm -rf build
	rm -rf lib
	rm -rf src/precompiles/Cargo.lock

.PHONY: all build test clean
