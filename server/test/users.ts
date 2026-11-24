/** Accounts of the test database (test/seed.ts). Test-only password, never used outside the tests. */
export const TEST_PASSWORD = 'test-password-1';

export const TEST_USERS = {
  teacher: 'teacher',
  ana: 'student',
  ben: 'student',
  eva: 'student',
} as const;

export type TestLogin = keyof typeof TEST_USERS;
