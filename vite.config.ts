import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Pre-bundle heavy dependencies at dev server startup instead of on first request.
  // This eliminates the 3-4s first-load compilation stall.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "zustand",
      "sonner",
      "lucide-react",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "@radix-ui/react-avatar",
      "@radix-ui/react-progress",
      "@radix-ui/react-separator",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "tauri-plugin-mihomo-api",
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5173,
    strictPort: false,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
