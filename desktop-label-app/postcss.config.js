// Empty on purpose: this app's plain CSS needs no PostCSS plugins at all.
// Without a config file here, Vite searches *upward* through parent
// directories and finds the main skywin-bill repo's own
// postcss.config.mjs (Tailwind, for the Next.js app) — which this Tauri
// project doesn't have installed and doesn't want. A local, empty config
// stops that upward search.
export default {};
