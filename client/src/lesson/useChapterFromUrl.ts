import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

/**
 * The open chapter kept in the address (`<basePath>/<n>`, 1-based), so it
 * survives a reload: the lesson page (/lessons/:id/:chapter) and the editor
 * (/lessons/:id/edit/:chapter); the query (?homework=…) stays. A missing or wrong number is the first chapter.
 * → [index, open another chapter].
 */
export function useChapterFromUrl(basePath: string, chapterCount: number) {
  const params = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const fromUrl = Number(params.chapter) - 1;
  const index = Number.isInteger(fromUrl) && fromUrl >= 0 && fromUrl < chapterCount ? fromUrl : 0;
  const openChapter = useCallback(
    (next: number) => navigate(`${basePath}/${next + 1}${search}`, { replace: true }),
    [navigate, basePath, search],
  );
  return [index, openChapter] as const;
}
