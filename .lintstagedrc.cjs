module.exports = {
  '*.{js,jsx,cjs,mjs,json,jsonc,css,md,yaml,yml}':
    'biome check --write --no-errors-on-unmatched',
  '*.{ts,tsx}': [
    'biome check --write --no-errors-on-unmatched',
    () => 'bun run typecheck',
  ],
}
