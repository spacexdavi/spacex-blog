import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  trailingSlash: "always",
  compressHTML: true,
  server: {
    port: 4322,
  },
  vite: {
    build: {
      assetsInlineLimit: 4096,
    },
  },
});
