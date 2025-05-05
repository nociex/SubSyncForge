import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/scripts/sync-subscriptions.js',
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: true,
    entryFileNames: '[name].js',
    chunkFileNames: '[name]-[hash].js'
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
    'js-yaml',
    'yaml',
    'node-fetch' // 将 node-fetch 添加到外部依赖
  ]
};