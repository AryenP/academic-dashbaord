// Build-time switches, readable both in the browser bundle (Vite fills `import.meta.env`) and in
// the prerender script, which runs under Node with the same variables in `process.env`.
const env: Record<string, string | undefined> =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ??
  (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ??
  {};

/** Google sign-in is wired for this copy of the site (`GOOGLE_SIGNIN` repo variable). */
export const GOOGLE_SIGNIN = env.VITE_GOOGLE_SIGNIN === 'true';
