import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { compilerOptions: { composite: false, declarationMap: false } },
  tsconfig: 'tsconfig.build.json',
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // @finrep/engine + @finrep/analytics are consumed for TYPES ONLY (import type).
  // They must never be bundled into the compliance runtime — keep them external
  // so this package stays a pure, dependency-light rules library.
  external: ['@finrep/engine', '@finrep/analytics'],
})
