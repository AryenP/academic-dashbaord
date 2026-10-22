// When an OAuth sign-in fails after Google, Supabase sends the person back to the site with
// ?error=…&error_description=… and no session. The app takes that message off the URL once and
// hands it to the sign-in screen, so the failure is explained instead of silently dropping them
// on the landing page (or on whatever account was already signed in on this browser).
const KEY = 'runway:signin-error';

/** Called once at boot. Returns true when an error was found and moved to the sign-in screen. */
export function takeCallbackError(): boolean {
  const params = new URLSearchParams(location.search);
  const description = params.get('error_description');
  const code = params.get('error_code') ?? params.get('error');
  if (!description && !code) return false;
  try {
    sessionStorage.setItem(KEY, description || `Sign-in failed (${code}).`);
  } catch {
    // private mode: the message is lost, the URL is still cleaned
  }
  history.replaceState(null, '', `${location.pathname}#/signin`);
  return true;
}

/** The sign-in screen reads the message once; a reload shows a clean form. */
export function readCallbackError(): string | null {
  try {
    const m = sessionStorage.getItem(KEY);
    if (m) sessionStorage.removeItem(KEY);
    return m;
  } catch {
    return null;
  }
}
