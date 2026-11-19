// @ts-check
import { defineConfig } from 'astro/config';

// No GitHub Pages o workflow define SITE_ORIGIN e SITE_BASE (ex.: /preco-na-bomba).
// Localmente ficam vazios e o site roda na raiz.
export default defineConfig({
  site: process.env.SITE_ORIGIN || undefined,
  base: process.env.SITE_BASE || '/',
  vite: {
    // Fixa o tsconfig do projeto: sem isso o Vite pode achar um tsconfig.json fora dele (ex.: na home).
    resolve: { tsconfigPaths: false },
    tsconfig: './tsconfig.json',
  },
});
