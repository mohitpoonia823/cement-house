// Vercel discovers serverless functions by file path, so this file must live in
// api/. The implementation stays in src/ where tsconfig typechecks it.
export { default } from '../src/serverless'
