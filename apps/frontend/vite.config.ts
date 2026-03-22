import { defineConfig } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@auditor/openapi": path.resolve(
        __dirname,
        "../../packages/openapi/src"
      ),
      "@auditor/zod": path.resolve(__dirname, "../../packages/zod/src"),
    },
  },
});

