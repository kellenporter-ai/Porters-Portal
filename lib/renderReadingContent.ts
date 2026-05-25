import katex from 'katex';

/**
 * Renders study material text with math formatting, bullets, and paragraphs.
 * Handles: $...$ LaTeX, garbled AI math, bullets, bold, paragraphs.
 */
export function renderReadingContent(raw: string): string {
    let text = raw;

    // Step 1: Clean garbled AI duplicates — patterns like "W=Fd W=Fd" or "K K"
    // Strip duplicate variable definitions: "Ug U g ​" → "Ug"
    text = text.replace(/([A-Z][a-z]?)\s+\1(?:\s+[a-z])?\s*​*/g, '$1');

    // Strip zero-width chars and invisible Unicode
    text = text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '');

    // Step 2: Handle explicit LaTeX $...$ and $$...$$ delimiters
    text = text.replace(/\$\$([^$]+)\$\$/g, (_m, tex) => {
        try {
            return `<div class="my-3 text-center">${katex.renderToString(tex.trim(), { throwOnError: false, displayMode: true })}</div>`;
        } catch { return `<code class="math-block">${tex}</code>`; }
    });
    text = text.replace(/\$([^$]+)\$/g, (_m, tex) => {
        try {
            return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: false });
        } catch { return `<code class="math-inline">${tex}</code>`; }
    });

    // Step 3: Style remaining equation-like text as highlighted code
    // Match patterns like: W=Fdcostheta, K=frac12mv2, Ug=mgy, P=Fv, etc.
    text = text.replace(
        /(?<![a-z])([A-Z][a-z]*(?:_?\{?[a-z]*\}?)?)\s*=\s*([-−]?(?:frac|sqrt|Delta|\\)?[\w\d{}()^_/\\.,×·±≠≤≥∞]+(?:\s*[+\-−*/×·]\s*[-−]?(?:frac|sqrt|Delta|\\)?[\w\d{}()^_/\\.,×·±≠≤≥∞]+)*)(?![a-zA-Z])/g,
        (_m, lhs, rhs) => `<code class="math-inline">${lhs} = ${rhs}</code>`
    );

    // Step 4: Paragraph breaks
    text = text.replace(/\\n\\n|\n\n/g, '</p><p class="mt-3">');

    // Step 5: Bullet points
    text = text.replace(/(?:^|\n)\*\s+(.+)/g, '<li class="ml-4 list-disc">$1</li>');
    text = text.replace(/(?:^|\n)-\s+(.+)/g, '<li class="ml-4 list-disc">$1</li>');
    text = text.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul class="my-2 space-y-1">$1</ul>');

    // Step 6: Numbered lists (1. 2. 3.)
    text = text.replace(/(?:^|\n)(\d+)\.\s+(.+)/g, '<li class="ml-4" value="$1">$2</li>');

    // Step 7: Line breaks
    text = text.replace(/\\n|\n/g, '<br/>');

    // Step 8: Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-[var(--text-primary)]">$1</strong>');

    return `<p>${text}</p>`;
}
