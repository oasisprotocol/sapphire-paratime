ROOT_DIR := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))
#SAPPHIRE_DEV_DOCKER=ghcr.io/oasisprotocol/sapphire-localnet:latest
SAPPHIRE_DEV_DOCKER=ghcr.io/oasisprotocol/sapphire-localnet:local

all:

build-debug:
	OASIS_UNSAFE_SKIP_AVR_VERIFY=1 OASIS_UNSAFE_ALLOW_DEBUG_ENCLAVES=1 OASIS_UNSAFE_USE_LOCALNET_CHAINID=1 cargo build --features debug-mock-sgx

pull:
	docker pull $(SAPPHIRE_DEV_DOCKER)

# Enable debugging in the container
DOCKER_EXTRA_ARGS = # -e OASIS_NODE_LOG_LEVEL=debug

debug: build-debug
	docker run --rm -ti -p8545:8545 -p8546:8546 -v $(ROOT_DIR)/target/debug/sapphire-paratime:/ronl.elf $(DOCKER_EXTRA_ARGS) $(SAPPHIRE_DEV_DOCKER) -test-mnemonic -n 4

clean:
	cargo clean
