/**
 * Resolve a resource `contentUrl` into an embeddable iframe src.
 *
 * Single source of truth shared by the student-facing viewer (Proctor) and the
 * teacher-side lesson editor preview, so both render the same URL.
 *
 * - Google Drive share/view links are converted to embeddable `/preview` URLs.
 * - Site-relative paths that point at a bare directory get `index.html`
 *   appended, so the iframe loads the concrete file directly. Without this,
 *   the Vite dev server's history fallback serves the SPA root for bare
 *   directories (no firebase.json rewrite in dev), and the iframe renders the
 *   whole app (app-in-app).
 * - Everything else is returned unchanged.
 *
 * Directory vs. clean-URL disambiguation uses a build-time hosting manifest
 * (scripts/generate-hosting-manifest.mjs) generated from firebase.json
 * rewrites + the files present in public/:
 *  - path matching a firebase.json rewrite source  -> pass through; hosting
 *    rewrites it to the real .html in prod.
 *  - path inside a real hosted directory           -> append /index.html.
 *  - unknown path (only possible in dev, or for a
 *    resource pointing at not-yet-deployed content) -> append /index.html
 *    (previous behavior; correct for dev-server directories).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import manifestJson from './hosting-manifest.json';

const hostingManifest: { rewrites: Record<string, string>; dirs: string[] } = manifestJson;

/** Longest-prefix match of `path` against firebase.json rewrite sources. */
function matchRewrite(path: string): string | null {
  let best: string | null = null;
  for (const src of Object.keys(hostingManifest.rewrites)) {
    if ((path === src || path.startsWith(src + '/')) && (best === null || src.length > best.length)) {
      best = src;
    }
  }
  return best ? hostingManifest.rewrites[best] : null;
}

/** True when `path` is inside a directory actually present in public/. */
function matchHostedDir(path: string): boolean {
  for (const dir of hostingManifest.dirs) {
    if (path === dir || path.startsWith(dir + '/')) return true;
  }
  return false;
}

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
      // A clean rewrite-backed URL like /ap1-kinematics-practice must pass
      // through unchanged: appending /index.html would bypass the firebase.json
      // rewrite and hit the SPA catch-all (app-in-app).
      // Check hosted dirs BEFORE rewrites: firebase.json also lists real
      // directories as rewrites (e.g. /texas-blackout-articles ->
      // /texas-blackout-articles/index.html) so bare subpaths resolve in prod.
      // For those, appending /index.html ourselves is equivalent to the
      // rewrite and also correct in dev.
      if (matchHostedDir(withoutTrailingSlash)) {
        return `${withoutTrailingSlash}/index.html${suffix}`;
      }
      if (matchRewrite(withoutTrailingSlash) !== null) {
        return contentUrl; // rewrite-backed clean URL; firebase.json handles it in prod
      }
      return `${withoutTrailingSlash}/index.html${suffix}`;
    }
  }
  return contentUrl;
}
