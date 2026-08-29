import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/react/index.ts',
    core: 'src/core/index.ts',
    server: 'src/server/index.ts',
    'vite-plugin': 'src/vite/index.ts',
    cli: 'src/cli/index.ts',
  },
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  // The host provides these; keeping them external avoids a second React/Vite
  // install whose types clash with the consumer's own.
  external: ['react', 'react-dom', 'react/jsx-runtime', 'vite'],
});