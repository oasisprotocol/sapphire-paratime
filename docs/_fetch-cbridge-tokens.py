#!/usr/bin/env python3
"""
Retrieves all of the Celer cBridge tokens to/from Oasis Sapphire mainnet
"""
import json
from urllib.request import urlopen

def format_result(data):
    chains = {}
    for c in data["chains"]:
        chains[c["id"]] = c
    for p in data['pegged_pair_configs']:
        org_chain = chains[p['org_chain_id']]
        pegged_chain = chains[p['pegged_chain_id']]
        if p['org_chain_id'] in [0x5afe,0x5aff] or p['pegged_chain_id'] in [0x5afe,0x5aff]:
            src_url = org_chain['explore_url'] + 'address/' + p["org_token"]["token"]["address"]
            dest_url = pegged_chain['explore_url'] + 'address/' + p["pegged_token"]["token"]["address"]
            print(f'| {org_chain["name"]} ({org_chain["id"]}) | {p["org_token"]["token"]["symbol"]} | [`{p["org_token"]["token"]["address"]}`]({src_url}) | {pegged_chain["name"]} ({pegged_chain["id"]}) | [`{p["pegged_token"]["token"]["address"]}`]({dest_url}) |')

print('## Celer cBridge Tokens (Mainnet)')
print("""<!-- NOTE: this is generated using `_fetch-cbridge-tokens.py` -->
<!-- WARNING: please don't manually update the table! -->
| Source Chain | Token Name | Source Address | Dest. Chain | Dest Address |
| ------------ | ---------- | -------------- | ----------- | ------------ |""")
with urlopen('https://cbridge-prod2.celer.app/v1/getTransferConfigs') as h:
    data = json.load(h)
    format_result(data)

print()
print('## Celer cBridge Tokens (Testnet)')
print("""<!-- NOTE: this is generated using `_fetch-cbridge-tokens.py` -->
<!-- WARNING: please don't manually update the table! -->
| Source Chain | Token Name | Source Address | Dest. Chain | Dest Address |
| ------------ | ---------- | -------------- | ----------- | ------------ |""")
with urlopen('https://cbridge-v2-test.celer.network/v1/getTransferConfigs') as h:
    data = json.load(h)
    format_result(data)
