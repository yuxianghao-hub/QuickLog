import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  root: "app/renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../app/renderer-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve("app/renderer/index.html"),
        quick: resolve("app/renderer/quick.html")
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
