import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import typescript from '@rollup/plugin-typescript'
//import { terser } from 'rollup-plugin-terser'

const commonPlugins = [json(), resolve(), commonjs(), typescript()]

export default [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/bundle.js',
      format: 'esm',
      sourcemap: false,
    },
    plugins: commonPlugins,
  },
  {
    // Worker runs in a separate thread — must be a standalone file, not bundled with main
    input: 'src/engines/arenaEngineWorker.js',
    output: {
      file: 'dist/arenaEngineWorker.js',
      format: 'esm',
      sourcemap: false,
    },
    external: ['worker_threads', 'url'],
    plugins: [resolve(), commonjs()],
  },
]
