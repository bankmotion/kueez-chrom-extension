import { defineConfig } from "vite";
import { resolve } from "path";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        content: resolve(__dirname, "src/content.ts"), // ADD this!
      },
      output: {
        entryFileNames: "src/[name].js", // Ensures content.js ends up in src/
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "manifest.json", dest: "." },
        { src: "public", dest: "." },
      ],
    }),
  ],
});
