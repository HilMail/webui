import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Extend Vite config in a separate file so production config stays clean for upstream rebases and avoids triple-slash directives.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }),
);
