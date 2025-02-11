
all: build test

build:
	forge install foundry-rs/forge-std --no-commit --no-git
	forge soldeer install @oasisprotocol-sapphire-contracts~0.2.11
	cd src/precompiles && cargo +nightly build --release

test:
	forge test

clean:
	forge clean
	rm -rf cache build lib src/precompiles/Cargo.lock src/precompiles/target
	
.PHONY: all build test clean
