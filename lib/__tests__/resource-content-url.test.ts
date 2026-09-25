import { describe, it, expect } from 'vitest';
import { resolveResourceContentUrl } from '../resourceContentUrl';

describe('resolveResourceContentUrl', () => {
  it('converts Google Drive /file/d/ links to embeddable preview URLs', () => {
    expect(resolveResourceContentUrl('https://drive.google.com/file/d/ABC123xyz_-9/view?usp=sharing'))
      .toBe('https://drive.google.com/file/d/ABC123xyz_-9/preview');
  });

  it('converts Google Drive /open?id= links to embeddable preview URLs', () => {
    expect(resolveResourceContentUrl('https://drive.google.com/open?id=FILEID123'))
      .toBe('https://drive.google.com/file/d/FILEID123/preview');
  });

  it('passes through hosted HTML paths unchanged', () => {
    expect(resolveResourceContentUrl('/texas-blackout-articles/index.html'))
      .toBe('/texas-blackout-articles/index.html');
    expect(resolveResourceContentUrl('/textbook/ch2-kinematics-1d/index.html'))
      .toBe('/textbook/ch2-kinematics-1d/index.html');
  });

  it('passes through absolute content URLs unchanged', () => {
    expect(resolveResourceContentUrl('https://example.com/activity.html'))
      .toBe('https://example.com/activity.html');
  });

  it('passes through rewrite-backed clean URLs unchanged (prod rewrites handle them)', () => {
    // Regression: appending /index.html here bypassed the firebase.json
    // rewrite and hit the SPA catch-all, rendering the app inside the iframe.
    expect(resolveResourceContentUrl('/ap1-kinematics-practice'))
      .toBe('/ap1-kinematics-practice');
    expect(resolveResourceContentUrl('/texas-grid-blackout'))
      .toBe('/texas-grid-blackout');
    expect(resolveResourceContentUrl('/tools/bar-chart'))
      .toBe('/tools/bar-chart');
    expect(resolveResourceContentUrl('/electroscope-charge-assessment'))
      .toBe('/electroscope-charge-assessment');
    expect(resolveResourceContentUrl('/privacy'))
      .toBe('/privacy');
    expect(resolveResourceContentUrl('/circuit-diagram-builder'))
      .toBe('/circuit-diagram-builder');
  });

  it('passes through rewrite-backed clean URLs with query strings or fragments unchanged', () => {
    expect(resolveResourceContentUrl('/ap1-kinematics-practice?mode=review'))
      .toBe('/ap1-kinematics-practice?mode=review');
    expect(resolveResourceContentUrl('/texas-grid-blackout#step2'))
      .toBe('/texas-grid-blackout#step2');
  });

  it('passes through subpaths of rewrite-backed paths unchanged', () => {
    expect(resolveResourceContentUrl('/tools/bar-chart'))
      .toBe('/tools/bar-chart');
    expect(resolveResourceContentUrl('/tools/force-diagram'))
      .toBe('/tools/force-diagram');
  });

  it('appends index.html to real hosted directory paths', () => {
    expect(resolveResourceContentUrl('/texas-blackout-articles'))
      .toBe('/texas-blackout-articles/index.html');
    expect(resolveResourceContentUrl('/forensic-branches'))
      .toBe('/forensic-branches/index.html');
    expect(resolveResourceContentUrl('/textbook/ch2-kinematics-1d'))
      .toBe('/textbook/ch2-kinematics-1d/index.html');
  });

  it('appends index.html to hosted directory paths with a trailing slash', () => {
    expect(resolveResourceContentUrl('/texas-blackout-articles/'))
      .toBe('/texas-blackout-articles/index.html');
    expect(resolveResourceContentUrl('/textbook/ch2-kinematics-1d/'))
      .toBe('/textbook/ch2-kinematics-1d/index.html');
  });

  it('appends index.html to unknown bare paths (dev-server directories)', () => {
    expect(resolveResourceContentUrl('/foo'))
      .toBe('/foo/index.html');
    expect(resolveResourceContentUrl('/foo/'))
      .toBe('/foo/index.html');
    expect(resolveResourceContentUrl('/foo/bar'))
      .toBe('/foo/bar/index.html');
  });

  it('leaves site-relative paths that already point at a file unchanged', () => {
    expect(resolveResourceContentUrl('/foo/bar.html'))
      .toBe('/foo/bar.html');
    expect(resolveResourceContentUrl('/ap1-kinematics-practice.html'))
      .toBe('/ap1-kinematics-practice.html');
  });

  it('appends index.html before any query string or fragment', () => {
    expect(resolveResourceContentUrl('/foo?x=1'))
      .toBe('/foo/index.html?x=1');
    expect(resolveResourceContentUrl('/foo#frag'))
      .toBe('/foo/index.html#frag');
  });

  it('passes through protocol-relative URLs unchanged', () => {
    expect(resolveResourceContentUrl('//evil.com/x'))
      .toBe('//evil.com/x');
  });

  it('passes through an empty string unchanged', () => {
    expect(resolveResourceContentUrl(''))
      .toBe('');
  });
});
