import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/oneroster/index.ts', 'src/diocesan/index.ts'],
  format: ['esm'],
  dts: { compilerOptions: { composite: false, declarationMap: false } },
  tsconfig: 'tsconfig.build.json',
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // Never bundle a sibling workspace package — they resolve at runtime via
  // node_modules (the diocesan parser imports @finrep/analytics + @finrep/db).
  external: [/^@finrep\//],
})
