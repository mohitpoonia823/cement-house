// Vercel discovers serverless functions by scanning the source tree for api/*,
// so this file is committed while the bundle it points at is generated during
// the build (scripts/build-vercel.mjs).
//
// The .js extension is required, not stylistic: Vercel compiles this file
// per-file rather than bundling it, and Node's ESM resolver does not infer
// extensions. Everything past this import is already bundled, so no other
// module resolution happens at runtime.
export { default } from '../dist/vercel/index.js'
