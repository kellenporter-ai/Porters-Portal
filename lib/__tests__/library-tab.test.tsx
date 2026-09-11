// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const mockErrorToast = vi.fn();
let libraryErrorHandler: ((err: unknown) => void) | null = null;

vi.mock('../../lib/firebase', () => ({
  db: {},
  functions: {},
}));

vi.mock('../../lib/errorReporting', () => ({
  withErrorToast: vi.fn(async (_toast: unknown, fn: () => Promise<unknown>) => fn()),
  reportError: vi.fn(),
}));

vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: mockErrorToast,
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock('../../components/Modal', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="modal">{title}{children}</div>
  ),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn((_ref: unknown, onNext: (snap: { docs: unknown[] }) => void, onError?: (err: unknown) => void) => {
    onNext({ docs: [] });
    if (onError) libraryErrorHandler = onError;
    return vi.fn();
  }),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

import LibraryTab from '../../components/library/LibraryTab';

describe('LibraryTab', () => {
  beforeEach(() => {
    mockErrorToast.mockClear();
    libraryErrorHandler = null;
  });

  it('associates the search input with its label via id/htmlFor', () => {
    render(<LibraryTab />);
    const searchInput = screen.getByRole('searchbox');
    expect(searchInput).toHaveAttribute('id', 'library-search');
    const label = document.querySelector('label[for="library-search"]');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('Search the content library');
  });

  it('shows a distinct toast when the library snapshot fails with permission-denied', () => {
    render(<LibraryTab />);
    expect(libraryErrorHandler).toBeTruthy();
    libraryErrorHandler!({ code: 'permission-denied' });
    expect(mockErrorToast).toHaveBeenCalledWith(
      'Access to the content library was lost. Refresh the page to reconnect.',
    );
  });

  it('shows the generic toast for non-permission snapshot errors', () => {
    render(<LibraryTab />);
    libraryErrorHandler!({ code: 'unavailable' });
    expect(mockErrorToast).toHaveBeenCalledWith(
      'Failed to load the content library. Please try again.',
    );
  });
});
