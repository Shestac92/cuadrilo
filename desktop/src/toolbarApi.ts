import type { DemoStudent } from './demoAccounts';

/** What the window shows: both halves, or one of them on the whole width. */
export type Layout = 'both' | 'teacher' | 'student';

/**
 * The toolbar's second line: 'reset' asks whether to reset the demo, 'updated' says the demo started again
 * because this is another version (with other demo lessons).
 */
export type Prompt = 'reset' | 'updated';

/** What the toolbar shows; the main process sends it on every change. */
export interface ToolbarState {
  layout: Layout;
  student: DemoStudent;
  students: readonly DemoStudent[];
  /** Starting, signing in or resetting: the buttons wait. */
  busy: boolean;
  prompt: Prompt | null;
  /** The app's version, for the notice of an update. */
  version: string;
}

/** The toolbar's calls to the main process (preload.ts puts them on window.demo). */
export interface ToolbarApi {
  setLayout: (layout: Layout) => void;
  setStudent: (student: DemoStudent) => void;
  /** Asks the question of a reset ('reset') or closes the second line (null). */
  setPrompt: (prompt: 'reset' | null) => void;
  /** Resets the demo; only while its question is asked. */
  reset: () => void;
  onState: (listener: (state: ToolbarState) => void) => void;
}

/** The IPC channels between them. */
export const CHANNELS = {
  layout: 'demo:layout',
  student: 'demo:student',
  prompt: 'demo:prompt',
  reset: 'demo:reset',
  state: 'demo:state',
  ready: 'demo:toolbar-ready',
} as const;
