
all: build test

build:
	forge install foundry-rs/forge-std --no-git
	cd lib/oasisprotocol-sapphire-foundry/precompiles && cargo +nightly build --release

test:
	forge test

clean:
	forge clean
	rm -rf cache build lib/oasisprotocol-sapphire-foundry/precompiles/Cargo.lock lib/oasisprotocol-sapphire-foundry/precompiles/target
	
.PHONY: all build test clean
