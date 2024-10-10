/*
This script verifies that when Viem is used using Node via the CLI it won't
prevent Node from exiting cleanly.

See: https://github.com/oasisprotocol/sapphire-paratime/pull/383
*/

import {
	createSapphireSerializer,
	sapphireHttpTransport,
	sapphireLocalnet,
} from "@oasisprotocol/sapphire-viem-v2";
import { createPublicClient, defineChain } from "viem";

const transport = sapphireHttpTransport();
const chain = sapphireLocalnet;
const publicClient = createPublicClient({ chain, transport });
defineChain({
	id: 0x5afd,
	name: "Oasis Sapphire Localnet",
	network: "sapphire-localnet",
	nativeCurrency: { name: "Sapphire Local Rose", symbol: "TEST", decimals: 18 },
	rpcUrls: {
		default: {
			http: ["http://localhost:8545"],
		},
	},
	serializers: {
		transaction: await createSapphireSerializer(publicClient),
	},
	testnet: true,
});
