PYTHON?=python3
MODULE=sapphirepy

all: mypy test wheel

mypy:
	$(PYTHON) -mmypy $(MODULE) --check-untyped-defs

ruff:
	$(PYTHON) -mruff check --target-version py38 --select AIR,PERF,F,PD,FLY,N,W $(MODULE)

test:
	$(PYTHON) -munittest discover

clean:
	rm -rf sapphirepy/__pycache__ build dist sapphire.py.egg-info .mypy_cache docs

lint:
	$(PYTHON) -mpylint $(MODULE) -d line-too-long,missing-module-docstring,missing-class-docstring,missing-function-docstring

build: wheel

wheel:
	$(PYTHON) setup.py bdist_wheel

docs:
	@rm -rf docs; mkdir docs
	@cd docs && sphinx-quickstart --quiet --sep --project=sapphirepy --author='team@oasisprotocol.org' --ext-autodoc --ext-viewcode
	@sed -i "s/^copyright = .*/copyright = '$$(date +%Y), Oasis Protocol Foundation'/" docs/source/conf.py
	@pip install furo
	@sed -i "s/^html_theme = 'alabaster'/html_theme = 'furo'/" docs/source/conf.py
	@sed -i "s/^extensions = \[/extensions = [\n    'myst_parser',/" docs/source/conf.py
	@echo "source_suffix = {'.rst': 'restructuredtext', '.md': 'markdown'}" >> docs/source/conf.py
	@sed -i '/Add your content/,/details/c\\n.. automodule:: sapphirepy\n   :members:\n   :undoc-members:\n   :show-inheritance:\n\n.. include:: ../../README.md\n   :parser: markdown' docs/source/index.rst
	@echo "\n   modules" >> docs/source/index.rst
	@sphinx-apidoc -o docs/source/ $$(pip show sapphire-py | grep Location | cut -d' ' -f2)/sapphirepy
	@$(MAKE) html -C docs

.PHONY: all mypy ruff test clean lint build wheel docs
