import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart(), nitro({ preset: "bun" }), react(), tailwindcss()],
  server: { host: "0.0.0.0", port: 3002, strictPort: true },
  preview: { host: "0.0.0.0", port: 3002, strictPort: true },
});
