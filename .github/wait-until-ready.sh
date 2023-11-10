#!/bin/sh
set -o pipefail
SECONDS=0
TIMEOUT=30
OASIS_WEB3_GATEWAY=http://127.0.0.1:8545

gatewayisready() {
  curl -X POST -s \
      -H 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","method":"oasis_callDataPublicKey","params":[],"id":1}' \
      ${OASIS_WEB3_GATEWAY} 2>&1 | jq -e '.result | has("key")'
}

until gatewayisready
do
  if (( SECONDS >= TIMEOUT ))
  then
    echo "Gateway not ready..."
    exit 1
  fi
  sleep 1
done
