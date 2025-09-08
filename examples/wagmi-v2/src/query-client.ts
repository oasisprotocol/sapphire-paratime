import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			gcTime: 24 * 60 * 60 * 1000, // 24h
			staleTime: 30 * 1000,
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
		},
		mutations: {
			retry: 0,
		},
	},
});

if (typeof window !== "undefined") {
	const persister = createSyncStoragePersister({
		storage: window.localStorage,
		key: "rq-cache",
		throttleTime: 1000,
	});

	persistQueryClient({
		queryClient,
		persister,
		maxAge: 24 * 60 * 60 * 1000, // 24h
		dehydrateOptions: {
			// Only dehydrate successful queries
			shouldDehydrateQuery: (query) => query.state.status === "success",
		},
	});
}
