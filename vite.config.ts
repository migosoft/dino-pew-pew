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
    // Several tests (and maps.test's beforeAll) generate the full 8192 px map, about 0.3 s each on an
    // idle machine; under parallel load that takes seconds.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
} as any);
