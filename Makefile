NPM ?= pnpm

subdirs = runtime clients integrations contracts

all:
	@echo ...

clean veryclean build::
	for sd in $(subdirs); do $(MAKE) -C $$sd $@; done

$(subdirs)::
	$(MAKE) -C $@

full: clean build

.PHONY: full all
