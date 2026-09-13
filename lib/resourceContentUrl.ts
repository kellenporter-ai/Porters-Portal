/**
 * Resolve a resource `contentUrl` into an embeddable iframe src.
 *
 * Single source of truth shared by the student-facing viewer (Proctor) and the
 * teacher-side lesson editor preview, so both render the same URL.
 *
 * - Google Drive share/view links are converted to embeddable `/preview` URLs.
 * - Site-relative paths that point at a bare directory (trailing slash or no
 *   file extension in the last segment) get `index.html` appended, so the
 *   iframe loads the concrete file directly. Without this, the Vite dev
 *   server's history fallback serves the SPA root for bare directories (no
 *   firebase.json rewrite in dev), and the iframe renders the whole app
 *   (app-in-app).
 * - Everything else is returned unchanged.
 */
export function resolveResourceContentUrl(contentUrl: string): string {
  const fileIdMatch = contentUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
  const openIdMatch = contentUrl.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openIdMatch) return `https://drive.google.com/file/d/${openIdMatch[1]}/preview`;
  if (contentUrl.startsWith('/') && !contentUrl.startsWith('//')) {
    // Split off any query string or fragment so they are not treated as part
    // of the final path segment (e.g. `/foo?x=1` must not become
    // `/foo?x=1/index.html`).
    const suffixMatch = contentUrl.match(/[?#]/);
    const suffixIndex = suffixMatch ? suffixMatch.index! : contentUrl.length;
    const pathPart = contentUrl.slice(0, suffixIndex);
    const suffix = contentUrl.slice(suffixIndex);
    const withoutTrailingSlash = pathPart.replace(/\/+$/, '');
    const lastSegment = withoutTrailingSlash.slice(withoutTrailingSlash.lastIndexOf('/') + 1);
    if (!lastSegment.includes('.')) {
      return `${withoutTrailingSlash}/index.html${suffix}`;
    }
  }
  return contentUrl;
}
