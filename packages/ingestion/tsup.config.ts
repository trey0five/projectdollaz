import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { compilerOptions: { composite: false, declarationMap: false } },
  tsconfig: 'tsconfig.build.json',
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['@finrep/engine'],
})
