import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/scripts/sync-subscriptions.js',
  output: {
    file: 'dist/sync-subscriptions.js',
    format: 'es',
    sourcemap: true
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
    'js-yaml'
  ]
}; 