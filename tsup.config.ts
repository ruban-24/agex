import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node20',
    clean: true,
    sourcemap: true,
    dts: true,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: ['src/mcp/server.ts'],
    format: ['esm'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
