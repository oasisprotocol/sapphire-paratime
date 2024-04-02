import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		sourcemap: true,
		cssCodeSplit: false,
		chunkSizeWarningLimit: 2 ** 20,
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
				// Watch the output of `pnpm build`, make it fit in single 1mb chunk
				//manualChunks: () => 'app'
			},
		},
	},
	plugins: [
		react(),
		visualizer({
			template: "treemap",
			filename: "stats.html",
			sourcemap: true,
			gzipSize: true,
		}),
	],
});
