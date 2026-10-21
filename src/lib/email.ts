// .edu, or the international forms (.edu.<cc>, .ac.<cc>). The database enforces the same rule
// (is_school_email in migration 0003), so this is the friendly check, not the only one.
export const isSchoolEmail = (e: string) => /\.(edu|edu\.[a-z]{2}|ac\.[a-z]{2})$/i.test(e.trim());
