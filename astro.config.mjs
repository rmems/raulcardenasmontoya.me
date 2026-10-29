import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://raulcardenasmontoya.me',
  output: 'static',
  // /projects/ was merged into /work/.
  redirects: { '/projects/': '/work/' },
  vite: {
    // The hero renderer loads three lazily (`await import('three')` inside
    // src/runtime/topology-renderer.ts), which the dev server's dependency
    // scanner cannot see. Pre-bundling it keeps `astro dev` from answering
    // that first request with 504 (outdated dep), which the demo reports as a
    // renderer error and falls back to the static diagram.
    optimizeDeps: { include: ['three'] }
  },
  integrations: [sitemap()]
});