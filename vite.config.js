import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { target: ["chrome80", "safari14"], sourcemap: false, manifest: true },
});
