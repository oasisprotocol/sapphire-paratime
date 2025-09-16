
all: build test

build: lib/forge-std
	cd lib/oasisprotocol-sapphire-foundry/precompiles && cargo +nightly build --release

lib/forge-std:
	forge install foundry-rs/forge-std --no-git

test:
	forge test

clean:
	forge clean
	rm -rf cache build lib/oasisprotocol-sapphire-foundry/precompiles/Cargo.lock lib/oasisprotocol-sapphire-foundry/precompiles/target
	
.PHONY: all build test clean
