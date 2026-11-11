// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import LessonBlocks from '../../components/LessonBlocks';
import { ThemeProvider } from '../ThemeContext';
import type { LessonBlock } from '../../types';

// EmbedBlock is not exported, so it is exercised through the public LessonBlocks
// renderer with a single EMBED block — the same path students hit in production.

const DRIVE_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-popups-to-escape-sandbox';
const SAME_ORIGIN_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads';
const THIRD_PARTY_SANDBOX = 'allow-scripts allow-forms allow-popups allow-downloads';

function makeEmbedBlock(url: string): LessonBlock {
  return {
    id: 'embed-1',
    type: 'EMBED',
    content: '',
    url,
    caption: 'Embedded content',
  } as LessonBlock;
}

function renderEmbed(url: string): HTMLIFrameElement {
  const { container } = render(
    <ThemeProvider>
      <LessonBlocks blocks={[makeEmbedBlock(url)]} />
    </ThemeProvider>,
  );
  const iframe = container.querySelector('iframe');
  if (!iframe) throw new Error(`No iframe rendered for url: ${url}`);
  return iframe as HTMLIFrameElement;
}

function sandboxOf(url: string): string {
  return renderEmbed(url).getAttribute('sandbox') ?? '';
}

describe('EmbedBlock iframe sandbox is scoped by URL origin', () => {
  beforeEach(() => {
    // Pin the Portal origin so the same-origin branch is deterministic.
    vi.stubGlobal('location', { ...window.location, origin: 'https://porters-portal.web.app' });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('grants allow-same-origin to a relative path (Portal-owned resource)', () => {
    const sandbox = sandboxOf('/minutiae-hunt.html');
    expect(sandbox).toContain('allow-same-origin');
    expect(sandbox).toBe(SAME_ORIGIN_SANDBOX);
  });

  it('grants allow-same-origin to a same-origin absolute URL', () => {
    const sandbox = sandboxOf('https://porters-portal.web.app/x.html');
    expect(sandbox).toContain('allow-same-origin');
    expect(sandbox).toBe(SAME_ORIGIN_SANDBOX);
  });

  it('does NOT grant allow-same-origin to a third-party URL', () => {
    const sandbox = sandboxOf('https://docs.google.com/forms/d/e/abc/viewform');
    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).toBe(THIRD_PARTY_SANDBOX);
  });

  it('gives a Drive URL the Drive sandbox string (with popups-to-escape-sandbox)', () => {
    const sandbox = sandboxOf('https://drive.google.com/file/d/abc123/view?usp=sharing');
    expect(sandbox).toBe(DRIVE_SANDBOX);
    expect(sandbox).toContain('allow-popups-to-escape-sandbox');
  });

  it('fails closed on a malformed URL (no allow-same-origin)', () => {
    const sandbox = sandboxOf('ht!tp://%%%');
    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).toBe(THIRD_PARTY_SANDBOX);
  });

  it('fails closed when the block has no URL at all', () => {
    const sandbox = sandboxOf('');
    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).toBe(THIRD_PARTY_SANDBOX);
  });

  // These cases reach the absolute-URL branch (the scheme regex cannot short-circuit
  // them), so they are the ones that actually catch a base-resolution regression.
  // `new URL('ftp://...', origin)` would otherwise parse and report the Portal origin.
  it('fails closed on a same-origin URL with a non-http(s) scheme', () => {
    const sandbox = sandboxOf('ftp://porters-portal.web.app/x.html');
    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).toBe(THIRD_PARTY_SANDBOX);
  });

  it('fails closed on a javascript: URL', () => {
    const sandbox = sandboxOf('javascript:alert(1)');
    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).toBe(THIRD_PARTY_SANDBOX);
  });

  it('fails closed on a same-origin-looking but different host', () => {
    const sandbox = sandboxOf('https://porters-portal.web.app.evil.example.com/x.html');
    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).toBe(THIRD_PARTY_SANDBOX);
  });

  it('keeps the three branches distinct', () => {
    expect(new Set([DRIVE_SANDBOX, SAME_ORIGIN_SANDBOX, THIRD_PARTY_SANDBOX]).size).toBe(3);
  });
});
