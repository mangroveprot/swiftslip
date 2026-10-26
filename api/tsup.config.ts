import { defineConfig } from 'tsup';

// `@swiftslip/shared` ships as TypeScript source, so it is bundled into the
// build; every other dependency stays external and is loaded from node_modules.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['cjs'],
  target: 'node20',
  outDir: 'build',
  sourcemap: true,
  clean: true,
  noExternal: ['@swiftslip/shared'],
});
