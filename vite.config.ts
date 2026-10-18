import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
    // `@glass-sdk/liquid-glass` is a `file:` link, and the package was installed
    // standalone (`--workspaces=false`) so it carries its OWN `node_modules`
    // with its own `react`. Two Reacts in one bundle is not a warning: the
    // second copy's dispatcher is null, and every hook in the glass components
    // throws "Invalid hook call" on the first render. Deduping forces both
    // sides onto this project's copy.
    dedupe: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      // Three entry points, deliberately. `shop.html` is the customer wizard
      // and `cover.html` is the page the product is shown to the outside
      // world; neither is for the people who use the professional editor. An
      // entry point is the only boundary that holds without anyone having to
      // remember it: `/diy` and `/kits` are reachable by typing a URL, whereas
      // a second HTML entry is a separate chunk graph that never imports them,
      // so their code is not sent to a visitor at all. Vite serves every entry
      // in dev without this block; it is `build` that needs telling, or only
      // `index.html` would be emitted.
      input: {
        main: 'index.html',
        shop: 'shop.html',
        cover: 'cover.html',
      },
    },
  },
})
