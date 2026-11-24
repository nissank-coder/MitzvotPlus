import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Content-Security-Policy for production builds (the bundle that ships inside the native app).
 * Only bundled code runs; network access is limited to the Sefaria text API.
 * Not applied in dev, where Vite injects inline scripts.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.sefaria.org",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'mitzvot-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin()],
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
});
