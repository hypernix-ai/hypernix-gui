import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri serves the dev build from a fixed port and expects the frontend
// not to clear the terminal it prints Rust errors into.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // WebKitGTK on the Flatpak runtime and Safari 15 on macOS 12 are the
    // oldest engines this ships to.
    target: ["es2021", "safari15"],
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
