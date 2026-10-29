import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The whole demo ships as one screen; a single chunk of about 1.2 MB (about 300 kB gzipped) is expected.
  build: { chunkSizeWarningLimit: 2000 },
});
