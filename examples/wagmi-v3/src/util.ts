export const isMobile = (): boolean => {
	if (typeof window === "undefined" || typeof navigator === "undefined") {
		return false;
	}

	const userAgent = navigator.userAgent.toLowerCase();

	const mobilePatterns = [
		/android/i,
		/webos/i,
		/iphone/i,
		/ipad/i,
		/ipod/i,
		/blackberry/i,
		/windows phone/i,
		/opera mini/i,
		/iemobile/i,
		/mobile/i,
	];

	return mobilePatterns.some((pattern) => pattern.test(userAgent));
};

export const isMobileDevice = (): boolean => {
	if (isMobile()) {
		return true;
	}

	if (typeof window !== "undefined") {
		return "ontouchstart" in window || navigator.maxTouchPoints > 0;
	}

	return false;
};

export const isMetaMaskInjected = () =>
	typeof window !== "undefined" ? window.ethereum?.isMetaMask === true : false;
