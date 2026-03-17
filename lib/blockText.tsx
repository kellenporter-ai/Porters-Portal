import React, { useMemo } from 'react';
import katex from 'katex';

/**
 * Process text containing LaTeX ($...$, $$...$$), markdown bold (**...**),
 * markdown italic (*...*), and bullet lists into rendered HTML.
 */
export function processBlockText(text: string): string {
  // Display math: $$...$$
  let result = text.replace(/\$\$([^$]+)\$\$/g, (_m, tex) => {
    try {
      return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: true });
    } catch { return `<code>${tex}</code>`; }
  });
  // Inline math: $...$
  result = result.replace(/\$([^$]+)\$/g, (_m, tex) => {
    try {
      return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: false });
    } catch { return `<code>${tex}</code>`; }
  });
  // Markdown bold: **text**
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Markdown italic: *text* (but not inside already-processed tags)
  result = result.replace(/(?<![<\/\w])\*([^*]+)\*(?![>])/g, '<em>$1</em>');
  // Newlines to <br>
  result = result.replace(/\n/g, '<br/>');
  return result;
}

/**
 * React component that renders block text with LaTeX, bold, and italic support.
 * Drop-in replacement for {block.content} — use <BlockText text={block.content} />
 */
export const BlockText: React.FC<{
  text: string | undefined;
  className?: string;
  style?: React.CSSProperties;
  tag?: 'p' | 'div' | 'span';
}> = React.memo(({ text, className, style, tag: Tag = 'span' }) => {
  const html = useMemo(() => text ? processBlockText(text) : '', [text]);
  if (!text) return null;
  return <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
});
