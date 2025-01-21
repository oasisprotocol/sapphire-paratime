
all: build test

build:
	@if ! command -v forge > /dev/null; then \
		curl -L https://foundry.paradigm.xyz | bash; \
		$$HOME/.foundry/bin/foundryup; \
	fi
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
