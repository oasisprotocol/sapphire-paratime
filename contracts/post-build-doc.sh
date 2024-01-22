#!/bin/sh

# This script is to be executed by `pnpm doc` after building the docs.

# Inject another /contracts/ for github.com URLs.
find sol/sapphire-contracts/book -name *.html | xargs sed -i -E "s+(blob/.*/contracts)+\1/contracts+"

# Remove /src/ from "Inherits" links.
find sol/sapphire-contracts/book -name *.html | xargs sed -i "s+/src/+/+"

# Inject nicer Pagetoc theme (hides level-4 headings, smaller font, wider toc).
cp theme/* sol/sapphire-contracts/book/theme
