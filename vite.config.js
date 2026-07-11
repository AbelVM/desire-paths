import { defineConfig } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

// terra-draw and its maplibre adapter ship an `exports` map with only
// `require` + `default` conditions (no `import`), which Vite's dev/esbuild
// resolver cannot match for ESM imports. Alias both bare specifiers to their
// explicit ESM builds so dev (`vite`) and the production build agree.
const terraDrawEsm = fileURLToPath(
  new URL("./node_modules/terra-draw/dist/terra-draw.module.js", import.meta.url)
);
const terraDrawMaplibreEsm = fileURLToPath(
  new URL(
    "./node_modules/terra-draw-maplibre-gl-adapter/dist/terra-draw-maplibre-gl-adapter.module.js",
    import.meta.url
  )
);

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
  resolve: {
    alias: {
      "terra-draw": terraDrawEsm,
      "terra-draw-maplibre-gl-adapter": terraDrawMaplibreEsm,
    },
  },
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
