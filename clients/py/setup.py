from setuptools import find_packages, setup

with open('README.md', 'r') as handle:
    README = handle.read()

with open('requirements.txt', 'r') as handle:
    REQUIREMENTS = [_.strip() for _ in handle.readlines()]

setup(
    author="oasisprotocol",
    author_email="team@oasisprotocol.org",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: Apache Software License",
        "Natural Language :: English",
        "Programming Language :: Python :: 3 :: Only",
        "Operating System :: OS Independent",
        "Typing :: Typed"
    ],
    description="Oasis Sapphire encryption middleware for Web3.py",
    name="sapphire.py",
    license="Apache Software License 2.0",
    long_description=README,
    long_description_content_type="text/markdown",
    include_package_data=True,
    python_requires='>=3.8',
    packages=find_packages(include=["sapphirepy"]),
    install_requires=REQUIREMENTS,
    url="https://github.com/oasisprotocol/sapphire-paratime",
    version="0.3.0",
    zip_safe=True,
)
