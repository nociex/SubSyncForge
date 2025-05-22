import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/scripts/sync-subscriptions.js',
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: true,
    entryFileNames: 'scripts/[name].js',
    chunkFileNames: 'shared/[name]-[hash].js',
    preserveModules: true,
    preserveModulesRoot: 'src'
  },
  plugins: [
    nodeResolve({
      preferBuiltins: true,
      extensions: ['.js', '.json']
    }),
    commonjs(),
    json()
  ],
  external: [
    'fs',
    'path',
    'url',
    'crypto',
    'child_process',
    'https',
    'http',
    'net',
    'js-yaml',
    'yaml',
    'node-fetch',
    'https-proxy-agent'
  ]
};