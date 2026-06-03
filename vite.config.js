import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      mangle: true,
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("maplibre-gl")) return "vendor-maplibre";
            if (id.includes("@deck.gl")) return "vendor-deckgl";
            if (id.includes("h3-js")) return "vendor-h3js";
            if (id.includes("performance-helpers"))
              return "vendor-performance-helpers";
            return "vendor";
          }
        },
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
    chunkSizeWarningLimit: 600,
  },
  optimizeDeps: {
    include: ["maplibre-gl"],
  },
});
