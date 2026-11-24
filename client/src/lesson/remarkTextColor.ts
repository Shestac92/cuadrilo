import { isTextColor } from '@cuadrilo/shared/textColors';
import type { Nodes, Parent, PhrasingContent, RootContent } from 'mdast';
import type {} from 'mdast-util-directive';

/**
 * `:red[words]` (a remark-directive text directive with a colour of the
 * palette) becomes `<span class="ex-c ex-c-red">`. Any other directive is
 * put back as the text it was written as ("Nota:casa" is not a directive of
 * ours), and so is a colour with no words in brackets.
 */
export function remarkTextColor() {
  return (tree: Nodes) => walk(tree);
}

const text = (value: string): PhrasingContent => ({ type: 'text', value });

function walk(node: Nodes): void {
  if (!('children' in node)) return;
  const parent = node as Parent;
  const children: RootContent[] = [];
  for (const child of parent.children as RootContent[]) {
    walk(child);
    if (child.type === 'textDirective') {
      if (isTextColor(child.name) && child.children.length > 0) {
        child.data = { ...child.data, hName: 'span', hProperties: { className: ['ex-c', `ex-c-${child.name}`] } };
        children.push(child);
      } else {
        const label = child.children.length > 0 ? [text('['), ...child.children, text(']')] : [];
        children.push(text(`:${child.name}`), ...label);
      }
    } else if (child.type === 'leafDirective' || child.type === 'containerDirective') {
      const colons = child.type === 'leafDirective' ? '::' : ':::';
      const label = child.type === 'leafDirective' ? child.children : [];
      children.push({ type: 'paragraph', children: [text(`${colons}${child.name}`), ...(label as PhrasingContent[])] });
      if (child.type === 'containerDirective') children.push(...child.children);
    } else {
      children.push(child);
    }
  }
  parent.children = children as Parent['children'];
}
