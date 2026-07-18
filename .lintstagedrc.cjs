module.exports = {
  '*.{js,jsx,ts,tsx,cjs,mjs,json,jsonc,css,md,yaml,yml}':
    'biome check --write --no-errors-on-unmatched',
  '*.{ts,tsx}': () => 'bun run typecheck',
}
