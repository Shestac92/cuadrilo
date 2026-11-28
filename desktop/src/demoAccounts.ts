/**
 * The accounts of the demo database (scripts/seed.ts makes them, the main process signs in with them). The
 * password is not a secret: the database lives on the user's own computer and is only a sandbox.
 */
export const DEMO_PASSWORD = 'cuadrilo-demo';
export const DEMO_TEACHER = 'teacher';
/** The students the right half can be signed in as; the first one by default. */
export const DEMO_STUDENTS = ['ana', 'ben'] as const;
export type DemoStudent = (typeof DEMO_STUDENTS)[number];
export const DEMO_GROUP = 'Demo class';
