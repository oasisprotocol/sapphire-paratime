PYTHON?=python3
MODULE=sapphirepy

all: mypy test wheel

mypy:
	$(PYTHON) -mmypy $(MODULE) --check-untyped-defs

test:
	$(PYTHON) -munittest discover

clean:
	rm -rf sapphirepy/__pycache__ build dist sapphire.py.egg-info .mypy_cache

wheel:
	$(PYTHON) setup.py bdist_wheel
