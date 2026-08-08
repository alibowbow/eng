import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function normalizeBase(value: string | undefined): string {
  const clean = (value || '/eng/').trim();
  if (clean === '/') return '/';
  return `/${clean.replace(/^\/+|\/+$/g, '')}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const base = normalizeBase(env.VITE_BASE_PATH);

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'auto',
        scope: base,
        includeAssets: ['icons/saygrid.svg', 'icons/saygrid-maskable.svg'],
        manifest: {
          id: base,
          name: 'SayGrid — 무한 회화 그리드',
          short_name: 'SayGrid',
          description: '영어와 한국어를 가리고, 듣고, 눌러가며 익히는 무한 회화 그리드',
          lang: 'ko-KR',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'any',
          background_color: '#f7f3e9',
          theme_color: '#dbeaf3',
          categories: ['education', 'productivity'],
          icons: [
            {
              src: 'icons/saygrid.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: 'icons/saygrid-maskable.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          navigateFallback: 'index.html',
          // Content JSON is versioned and cached pack-by-pack below, not bulk-preloaded.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.includes('/content/packs/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'saygrid-content-packs',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: ({ url }) => url.pathname.endsWith('/content/manifest.json'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'saygrid-content-manifest',
                networkTimeoutSeconds: 4,
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: ({ url }) =>
                url.pathname.includes('/content/audio/') || /\.(?:mp3|m4a|ogg|wav)$/i.test(url.pathname),
              handler: 'CacheFirst',
              options: {
                cacheName: 'saygrid-recorded-audio',
                expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      clearMocks: true,
    },
  };
});
