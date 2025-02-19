
all: build test

build:
	forge install foundry-rs/forge-std --no-commit --no-git
	forge soldeer install @oasisprotocol-sapphire-contracts~0.2.11 --config-location foundry
	cd dependencies/integrations-foundry/precompiles && cargo +nightly build --release

test:
	forge test

clean:
	forge clean
	rm -rf cache build lib dependencies/integrations-foundry/precompiles/Cargo.lock dependencies/integrations-foundry/precompiles/target
	
.PHONY: all build test clean
