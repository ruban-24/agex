import { build } from 'esbuild';
import { rmSync, chmodSync, readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

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
  define: {
    'AGEX_VERSION': JSON.stringify(pkg.version),
  },
});

chmodSync('dist/index.js', 0o755);
chmodSync('dist/mcp/server.js', 0o755);
