NPM ?= pnpm

subdirs = hardhat-boilerplate hardhat-viem onchain-signer wagmi-v2

all: build test

build:
	for sd in $(subdirs); do $(MAKE) -C $$sd $@; done

test:
	for sd in $(subdirs); do $(MAKE) -C $$sd $@; done
