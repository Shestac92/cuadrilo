import { createContext, useContext } from 'react';

/**
 * How an exercise is shown:
 * - student: as the student sees it, answers are given (the editor's preview);
 * - teacher: read-only, with the right answers and what the student answered;
 * - edit: the editor's form.
 */
export type ViewMode = 'student' | 'teacher' | 'edit';

const ViewModeContext = createContext<ViewMode>('student');

/** The mode of the exercise around (lesson/exerciseModes.tsx sets it); 'student' outside of any. */
export const ViewModeScope = ViewModeContext.Provider;
export const useViewMode = () => useContext(ViewModeContext);
