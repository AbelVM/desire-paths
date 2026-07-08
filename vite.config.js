import { defineConfig } from "vite";
import fs from "fs";
import path from "path";

// Vite plugin: copy static files from public/ to dist/ during build
function copyPublicFiles() {
  return {
    name: "copy-public-files",
    enforce: "post",
    writeBundle(options) {
      const srcDir = path.resolve("public");
      const destDir = options.dir;

      try {
        const files = fs.readdirSync(srcDir);
        for (const file of files) {
          const srcFile = path.join(srcDir, file);
          if (fs.statSync(srcFile).isFile()) {
            const destFile = path.join(destDir, file);
            fs.copyFileSync(srcFile, destFile);
          }
        }
      } catch (_) {
        // public/ dir may not exist during watch mode; ignore
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [copyPublicFiles()],
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
