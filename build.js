import { build } from 'esbuild';
import { rmSync, chmodSync } from 'fs';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts', 'src/mcp/server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outdir: 'dist',
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
  packages: 'external',
  loader: { '.md': 'text' },
});

chmodSync('dist/index.js', 0o755);
chmodSync('dist/mcp/server.js', 0o755);
