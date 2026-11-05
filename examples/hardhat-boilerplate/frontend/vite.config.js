import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3000,
    strictPort: true,
  },
  plugins: [
    react(),
    visualizer({
      template: "treemap",
      filename: "stats.html",
      gzipSize: true,
    }),
  ],
});
