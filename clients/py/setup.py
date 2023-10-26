from setuptools import find_packages, setup

readme = ""

setup(
    author="oasisprotocol",
    author_email="devops@oasisprotocol.org",
    classifiers=[
        "Development Status :: 2 - Pre-Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: Apache Software License",
        "Natural Language :: English",
        "Programming Language :: Python :: 3.8",
    ],
    description="Sapphire transaction wrapper",
    install_requires=[],
    name="sapphire.py",
    license="Apache Software License 2.0",
    long_description=readme,
    long_description_content_type="text/markdown",
    include_package_data=True,
    python_requires='>=3.8',
    packages=find_packages(
        include=[
            "sapphirepy",
        ]
    ),
    url="https://github.com/oasisprotocol/sapphire-paratime",
    version="0.0.1",
    zip_safe=True,
)
