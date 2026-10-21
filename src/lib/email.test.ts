import { describe, expect, it } from 'vitest';
import { isSchoolEmail } from './email';

describe('isSchoolEmail', () => {
  it('accepts .edu and the international forms', () => {
    for (const e of ['a@ucsd.edu', 'B@Mail.Stanford.EDU', 'c@cam.ac.uk', 'd@unimelb.edu.au', 'e@iitb.ac.in'])
      expect(isSchoolEmail(e)).toBe(true);
  });
  it('rejects everything else', () => {
    for (const e of ['a@gmail.com', 'b@edu.com', 'c@educational.org', 'd@ac.uk.evil.com', ''])
      expect(isSchoolEmail(e)).toBe(false);
  });
});
