import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/json-types.ts'],
  format: ['esm'],
  dts: { compilerOptions: { composite: false, declarationMap: false } },
  tsconfig: 'tsconfig.json',
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // The generated Prisma client + engine types are resolved at the consumer.
  external: ['@prisma/client', '@finrep/engine'],
})
