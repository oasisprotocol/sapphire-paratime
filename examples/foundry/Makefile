
all: build test

build:
	forge install foundry-rs/forge-std --no-commit --no-git
	cp -r ../../contracts/contracts/ lib/contracts
	cp -r ../../integrations/foundry/src src
	cd src/precompiles && cargo +nightly build --release

test:
	forge test

clean:
	forge clean
	rm -rf cache build lib src/precompiles/Cargo.lock src/precompiles/target

.PHONY: all build test clean

