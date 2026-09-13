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

  it('appends index.html to bare directory paths with a trailing slash', () => {
    expect(resolveResourceContentUrl('/texas-blackout-articles/'))
      .toBe('/texas-blackout-articles/index.html');
    expect(resolveResourceContentUrl('/foo/'))
      .toBe('/foo/index.html');
  });

  it('appends index.html to bare directory paths without a trailing slash', () => {
    expect(resolveResourceContentUrl('/texas-blackout-articles'))
      .toBe('/texas-blackout-articles/index.html');
    expect(resolveResourceContentUrl('/foo'))
      .toBe('/foo/index.html');
  });

  it('leaves site-relative paths that already point at a file unchanged', () => {
    expect(resolveResourceContentUrl('/foo/bar.html'))
      .toBe('/foo/bar.html');
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
