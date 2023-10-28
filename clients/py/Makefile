PYTHON?=python3
MODULE=sapphirepy

all: mypy test wheel

mypy:
	$(PYTHON) -mmypy $(MODULE) --check-untyped-defs

test:
	$(PYTHON) -munittest discover

clean:
	rm -rf sapphirepy/__pycache__ build dist sapphire.py.egg-info .mypy_cache

lint:
	$(PYTHON) -mpylint $(MODULE) -d line-too-long,missing-module-docstring,missing-class-docstring,missing-function-docstring

wheel:
	$(PYTHON) setup.py bdist_wheel
