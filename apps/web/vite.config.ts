import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: "../../",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["tree-icon.svg"],
      manifest: {
        name: "TreeTask — проекты с результатом",
        short_name: "TreeTask",
        description: "Работа выращивает дерево, результаты приносят плоды.",
        theme_color: "#f7f8fb",
        background_color: "#f7f8fb",
        display: "standalone",
        lang: "ru",
        start_url: "/",
        icons: [
          {
            src: "/tree-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2}"]
      }
    })
  ],
  server: {
    port: 5173
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
