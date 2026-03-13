import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import typescript from '@rollup/plugin-typescript'
//import { terser } from 'rollup-plugin-terser'

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/bundle.js',
    format: 'esm',
    sourcemap: false,
  },
  plugins: [
    json(),
    resolve(),
    commonjs(),
    typescript(),
    //terser(),
  ],
}
