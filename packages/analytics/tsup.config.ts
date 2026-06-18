import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { compilerOptions: { composite: false, declarationMap: false } },
  tsconfig: 'tsconfig.build.json',
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // @finrep/engine is consumed for TYPES ONLY (import type). It must never be
  // bundled into the analytics runtime — keep it external so this package stays
  // a pure, dependency-light computation library.
  external: ['@finrep/engine'],
})
