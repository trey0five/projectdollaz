import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { compilerOptions: { composite: false, declarationMap: false } },
  tsconfig: 'tsconfig.build.json',
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // @finrep/engine is consumed for TYPES ONLY. @finrep/analytics is types plus one
  // runtime value (`bandsFor`, the frozen band table — see src/index.ts's header).
  // Neither may be BUNDLED into the compliance runtime: keep them external so this
  // package stays a dependency-light rules library and so a band change ships from
  // its own package rather than from a stale copy baked in here.
  external: ['@finrep/engine', '@finrep/analytics'],
})
