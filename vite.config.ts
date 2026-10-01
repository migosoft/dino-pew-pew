import { defineConfig } from 'vite';

// In dev the game server (tsx watch src/server/main.ts) runs on :8080; Vite proxies to it.
const GAME_SERVER = process.env.GAME_SERVER ?? 'http://localhost:8080';

export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/api': GAME_SERVER,
      '/ws': { target: GAME_SERVER.replace(/^http/, 'ws'), ws: true },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
} as any);
