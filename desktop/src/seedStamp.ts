/**
 * The stamp of a demo database: written into the seed by scripts/build.ts, copied into the user's data with
 * it. A data folder whose stamp is not the app's own (another build, or none) was made by another version of
 * the app, and is replaced at start-up: its database may not fit this version.
 */
export const SEED_STAMP_FILE = 'demo-seed.json';

export interface SeedStamp {
  /** New on every build. */
  id: string;
  /** The app's version (the platform's, root package.json). */
  version: string;
  builtAt: string;
}
