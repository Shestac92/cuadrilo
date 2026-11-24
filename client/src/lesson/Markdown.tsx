import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';

import { remarkTextColor } from './remarkTextColor';

const PLUGINS = [remarkGfm, remarkDirective, remarkTextColor];

/** Links lead to other sites: always a new tab, so the student does not leave the lesson (and the live class). */
const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

/**
 * A text block: Markdown with tables (GFM) and coloured words (`:red[words]`,
 * shared/src/textColors.ts). Raw HTML in the source is not
 * rendered (react-markdown's default), so a lesson can't inject markup.
 * Parsed again only when the text changes, not on every render of the lesson.
 */
export const Markdown = memo(function Markdown({ source }: { source: string }) {
  return (
    <div className="ex-markdown">
      <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS}>
        {source}
      </ReactMarkdown>
    </div>
  );
});
