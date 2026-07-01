// Re-export the root flat config so `eslint src/` resolves correctly when run
// from this package directory (via `pnpm -r run lint`). See ../../eslint.config.js.
export { default } from '../../eslint.config.js';
