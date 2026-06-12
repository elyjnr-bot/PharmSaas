import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
/// <reference types="vitest" />

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'JunglePharm',
        short_name: 'JunglePharm',
        description: 'Gestion intelligente de pharmacie pour l\'Afrique rurale',
        theme_color: '#2563eb',
        background_color: '#2563eb',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          // ── Données métier (REST PostgREST) : JAMAIS de cache HTTP ──────────────
          // Un cache HTTP périmé ressuscitait des lignes supprimées (stock fantôme).
          // L'accès hors-ligne passe déjà par IndexedDB (db.products), pas par ce
          // cache. On force NetworkOnly : la base reste l'unique source de vérité.
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkOnly',
          },
          // ── Auth / storage / autres : NetworkFirst court ───────────────────────
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-auth-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60   // 1 h
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        // Découpe les grosses libs vendeur en chunks séparés :
        // – chargés en parallèle du code app au premier accès
        // – mis en cache navigateur indépendamment des mises à jour app
        manualChunks: (id: string) => {
          if (id.includes('node_modules/xlsx'))           return 'vendor-xlsx';
          if (id.includes('node_modules/html5-qrcode'))   return 'vendor-scanner';
          if (id.includes('node_modules/jsbarcode'))      return 'vendor-barcode';
          if (id.includes('node_modules/tesseract'))      return 'vendor-ocr';
          if (id.includes('node_modules/@supabase'))      return 'vendor-supabase';
          if (id.includes('node_modules/dexie'))          return 'vendor-dexie';
          if (id.includes('node_modules/react-dom'))      return 'vendor-react';
          if (id.includes('node_modules/papaparse') ||
              id.includes('node_modules/fuse.js'))        return 'vendor-utils';
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
  },
});
