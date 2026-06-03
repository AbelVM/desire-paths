import purgecss from "@fullhuman/postcss-purgecss";
import cssnano from "cssnano";

export default {
  plugins: [
    purgecss({
      content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx,html}"],
      defaultExtractor: (content) => content.match(/[A-Za-z0-9-_:/]+/g) || [],
      safelist: [/^maplibregl-/],
    }),
    cssnano({ preset: "default" }),
  ],
};
