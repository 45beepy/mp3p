import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'MP3P - Music Player',
        short_name: 'MP3P',
        description: 'Personal FLAC music player with Google Drive integration',
        theme_color: '#ffff64',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/mp3p/',
        scope: '/mp3p/',
        icons: [
          {
            src: '/mp3p/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/mp3p/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/mp3p/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/apis\.google\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'google-apis-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/www\.googleapis\.com\/drive\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'drive-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7
              }
            }
          },
          {
            urlPattern: /^https:\/\/lrclib\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lyrics-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  base: '/mp3p/'
})
