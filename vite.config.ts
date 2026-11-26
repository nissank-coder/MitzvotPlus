import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// @ts-expect-error – plain .mjs helper shared with CI
import { buildInfo } from './scripts/build-info.mjs';
// @ts-expect-error – plain .mjs helper shared with CI and tests
import { cspFor } from './scripts/csp.mjs';

/**
 * Content-Security-Policy for builds (the bundle that ships inside the native app).
 * Only bundled code runs; network access is limited to the Sefaria text API, plus – in development
 * and staging builds with a backend – exactly that backend's origin (scripts/csp.mjs).
 * Not applied in dev, where Vite injects inline scripts.
 */
function cspPlugin(csp: string): Plugin {
  return {
    name: 'mitzvot-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
  };
}

export default defineConfig(({ command, mode }) => ({
  // Version, commit (only when known), build time and source fingerprint – shown under
  // "אודות האפליקציה" so it is clear which code a preview (e.g. AI Studio) runs.
  define: {
    __BUILD_INFO__: JSON.stringify({ ...buildInfo(), kind: command === 'serve' ? 'dev-server' : 'build' }),
  },
  plugins: [react(), tailwindcss(), cspPlugin(cspFor({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }))],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    hmr: false,
  },
  build: {
    // Prayer-text chunks (src/content/packs) are data loaded on demand; up to ~700 KB each is expected.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Separate vendor chunks: the calendar engine and React change rarely and cache independently.
        manualChunks: (id) => {
          if (id.includes('node_modules/@hebcal/core') || id.includes('node_modules/@hebcal/hdate') || id.includes('node_modules/@hebcal/noaa') || id.includes('node_modules/temporal')) return 'calendar';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
}));
