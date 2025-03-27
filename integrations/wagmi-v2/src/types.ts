/**
 * @license Apache-2.0
 */

import type {
	EIP2696_EthereumProvider,
	SapphireWrapConfig,
} from "@oasisprotocol/sapphire-paratime";
import type { EIP1193Provider } from "viem";

export type SupportedRegister = {
	provider: EIP1193Provider & EIP2696_EthereumProvider;
	rdns: ("io.metamask" | "io.metamask.mobile" | "com.brave.wallet") & string;
};

export type Provider = SupportedRegister["provider"];
export type Rdns = SupportedRegister["rdns"];

export interface EIP6963ProviderInfo {
	// RFC-2397
	icon: `data:image/${string}`;
	name: string;
	rdns: Rdns;
	uuid: string;
}

export interface EIP6963ProviderDetail {
	info: EIP6963ProviderInfo;
	provider: Provider;
}

export interface EIP6963AnnounceProviderEvent
	extends CustomEvent<EIP6963ProviderDetail> {
	type: "eip6963:announceProvider";
}

export type CreateSapphireConfigParameters = {
	sapphireConfig: { wrap?: SapphireWrapConfig } & (
		| {
				replaceProviders: true;
				wrappedProvidersFilter?: never;
		  }
		| {
				replaceProviders?: false;
				wrappedProvidersFilter?: (rdns: Rdns) => boolean;
		  }
	);
};
