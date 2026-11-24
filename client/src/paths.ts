/** Addresses of the app's pages (the routes are in App.tsx). */

/** The lessons list. The start page is the dashboard (`/`). */
export const lessonsPath = '/lessons';
export const lessonPath = (lessonId: number) => `/lessons/${lessonId}`;
/** The student's homework: the lesson with only the assigned exercises. */
export const studentHomeworkPath = (lessonId: number, homeworkId: number) =>
  `${lessonPath(lessonId)}?homework=${homeworkId}`;
export const lessonEditorPath = (lessonId: number) => `/lessons/${lessonId}/edit`;
export const homeworkReviewPath = (homeworkId: number) => `/homework/${homeworkId}`;
export const homeworkEditPath = (homeworkId: number) => `/homework/${homeworkId}/edit`;

/** Whether the address is this page or one under it: /lessons/12 and /lessons/12/3, not /lessons/123. */
export const isOnPageOrBelow = (pathname: string, pagePath: string) =>
  pathname === pagePath || pathname.startsWith(`${pagePath}/`);
