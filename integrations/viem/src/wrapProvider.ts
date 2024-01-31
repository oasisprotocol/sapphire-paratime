import type { Chain } from "viem";
import { sapphire as sapphireMainnet } from "./chain.js";
import * as sapphire from "@oasisprotocol/sapphire-paratime";

export function sapphireWrapProvider (wagmiChainProviderFunction:any) {
    return (chain: Chain) => {
        const wagmiChainProvider = wagmiChainProviderFunction(chain);

        if (wagmiChainProvider === null) {
        return null;
        }

        // @ts-ignore
        (wagmiChainProvider as any)._provider = wagmiChainProvider.provider;

        if (chain.id === sapphireMainnet.id) {
        console.log("Wrapping provider...");

        // @ts-ignore
        wagmiChainProvider.provider = () =>
            sapphire.wrap((wagmiChainProvider as any)._provider());
        }

        return wagmiChainProvider;
    };
}
