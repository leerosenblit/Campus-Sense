import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // listen on 0.0.0.0 so phones on the same Wi-Fi can scan QR codes
    proxy: {
      // Proxy API + WebSocket to the Node server during development.
      "/api": { target: "http://localhost:4000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
      "/socket.io": { target: "http://localhost:4000", ws: true },
    },
  },
});
