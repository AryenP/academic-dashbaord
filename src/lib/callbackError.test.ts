import { beforeEach, describe, expect, it } from 'vitest';
import { clearCallbackError, readCallbackError, takeCallbackError } from './callbackError';

describe('OAuth callback errors', () => {
  beforeEach(() => {
    sessionStorage.clear();
    history.replaceState(null, '', '/academic-dashbaord/');
  });

  it('does nothing on a clean URL', () => {
    expect(takeCallbackError()).toBe(false);
    expect(location.hash).toBe('');
    expect(readCallbackError()).toBeNull();
  });

  it('moves the message off the URL to the sign-in screen, until cleared', () => {
    history.replaceState(
      null,
      '',
      '/academic-dashbaord/?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user',
    );
    expect(takeCallbackError()).toBe(true);
    expect(location.search).toBe('');
    expect(location.hash).toBe('#/signin');
    expect(readCallbackError()).toBe('Database error saving new user');
    expect(readCallbackError()).toBe('Database error saving new user'); // reading is harmless
    clearCallbackError();
    expect(readCallbackError()).toBeNull();
  });

  it('falls back to the code when there is no description', () => {
    history.replaceState(null, '', '/academic-dashbaord/?error=access_denied');
    takeCallbackError();
    expect(readCallbackError()).toBe('Sign-in failed (access_denied).');
  });
});
