NPM ?= pnpm

subdirs = ethers-v6 hardhat viem-v2 wagmi-v2

all: build test lint

build veryclean clean test format lint::
	for sd in $(subdirs); do $(MAKE) -C $$sd $@; done
