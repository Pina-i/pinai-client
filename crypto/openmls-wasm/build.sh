#!/usr/bin/env sh
# Build the openmls WASM bundle into ../openmls-pkg/.
# Run from this directory (web-client/crypto/openmls-wasm/).
set -eu
exec wasm-pack build --release --target web --out-dir ../openmls-pkg "$@"
