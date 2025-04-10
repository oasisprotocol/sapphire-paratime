import { describe, expect, jest } from "@jest/globals";
import {
	createSapphireConfig,
	sapphireLocalnet,
} from "@oasisprotocol/sapphire-wagmi-v2";
import type { EIP1193Provider } from "viem";
import { http } from "wagmi";

const mockProvider: EIP1193Provider = {
	request: jest.fn().mockImplementation(() => {
		return null;
	}),
	on: jest.fn(),
	removeListener: jest.fn(),
};

describe("Event Listener Tests", () => {
	let originalAddEventListener:
		| typeof EventTarget.prototype.addEventListener
		| undefined;

	beforeEach(() => {
		originalAddEventListener = EventTarget.prototype.addEventListener;

		createSapphireConfig({
			sapphireConfig: {
				replaceProviders: true,
			},
			chains: [sapphireLocalnet],
			transports: {
				[sapphireLocalnet.id]: http(),
			},
		});
	});

	afterEach(() => {
		// Restore addEventListener
		EventTarget.prototype.addEventListener = originalAddEventListener;
	});

	test("should not break addEventListener", () => {
		const eventHandler = jest.fn();

		document.addEventListener("click", eventHandler);
		document.dispatchEvent(new Event("click"));

		expect(eventHandler).toHaveBeenCalledTimes(1);
	});

	test("should remove eip6963:announceProvider event handler using removeEventListener", () => {
		const eventHandler = jest.fn();

		document.addEventListener("eip6963:announceProvider", eventHandler);
		document.removeEventListener("eip6963:announceProvider", eventHandler);

		document.dispatchEvent(
			new CustomEvent("eip6963:announceProvider", {
				detail: {
					info: {
						icon: "data:image/png",
						name: "test",
						rdns: "io.metamask",
						uuid: "test",
					},
					provider: mockProvider,
				},
			}),
		);

		expect(eventHandler).toHaveBeenCalledTimes(0);
	});

	test("should remove eip6963:announceProvider event handler using signal", () => {
		const eventHandler = jest.fn();
		const abortController = new AbortController();

		document.addEventListener("eip6963:announceProvider", eventHandler, {
			signal: abortController.signal,
		});
		abortController.abort();

		document.dispatchEvent(
			new CustomEvent("eip6963:announceProvider", {
				detail: {
					info: {
						icon: "data:image/png",
						name: "test",
						rdns: "io.metamask",
						uuid: "test",
					},
					provider: mockProvider,
				},
			}),
		);

		expect(eventHandler).toHaveBeenCalledTimes(0);
	});
});
