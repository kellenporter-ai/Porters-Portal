// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

const mockErrorToast = vi.fn();

const mockState = vi.hoisted(() => ({
  libraryDocs: [] as unknown[],
  libraryErrorHandler: null as ((err: unknown) => void) | null,
  batchCommit: vi.fn(async () => {}),
  batchUpdate: vi.fn(),
}));

const makeDoc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

const SAMPLE_ITEM = {
  title: 'Kinematics Lab',
  description: 'A motion lab',
  subject: 'AP Physics 1',
  tags: ['kinematics'],
  contentKind: 'activity',
  hostingType: 'bundled',
  url: 'https://example.com/lab',
  status: 'active',
  untagged: false,
  suggestedCategory: 'Lab',
};

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
    onNext({ docs: mockState.libraryDocs });
    if (onError) mockState.libraryErrorHandler = onError;
    return vi.fn();
  }),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(() => ({ update: mockState.batchUpdate, commit: mockState.batchCommit })),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

// Class configs come from the shared AppDataContext, not a local snapshot.
const mockClassConfigs = vi.hoisted(() => ({
  configs: [] as { id: string; className: string; unitOrder?: string[]; features: { leaderboard: boolean; bossFights: boolean } }[],
}));

vi.mock('../../lib/AppDataContext', () => ({
  useClassConfig: () => ({ classConfigs: mockClassConfigs.configs, enabledFeatures: { leaderboard: true, bossFights: true } }),
}));

import LibraryTab from '../../components/library/LibraryTab';

describe('LibraryTab', () => {
  beforeEach(() => {
    mockErrorToast.mockClear();
    mockState.libraryErrorHandler = null;
    mockState.libraryDocs = [];
    mockState.batchCommit.mockClear();
    mockState.batchUpdate.mockClear();
    mockClassConfigs.configs = [];
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
    expect(mockState.libraryErrorHandler).toBeTruthy();
    mockState.libraryErrorHandler!({ code: 'permission-denied' });
    expect(mockErrorToast).toHaveBeenCalledWith(
      'Access to the content library was lost. Refresh the page to reconnect.',
    );
  });

  it('shows the generic toast for non-permission snapshot errors', () => {
    render(<LibraryTab />);
    mockState.libraryErrorHandler!({ code: 'unavailable' });
    expect(mockErrorToast).toHaveBeenCalledWith(
      'Failed to load the content library. Please try again.',
    );
  });

  it('defaults to list view when Untagged only is active', () => {
    mockState.libraryDocs = [makeDoc('item-1', { ...SAMPLE_ITEM, untagged: true })];
    render(<LibraryTab />);
    fireEvent.click(screen.getByRole('checkbox', { name: /untagged only/i }));
    expect(screen.getByRole('table', { name: /content library items/i })).toBeInTheDocument();
  });

  it('switches between grid and list views via the view toggle', () => {
    mockState.libraryDocs = [makeDoc('item-1', SAMPLE_ITEM)];
    render(<LibraryTab />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByRole('table', { name: /content library items/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the bulk bar and commits a batch write when Mark curated is clicked', async () => {
    mockState.libraryDocs = [
      makeDoc('item-1', { ...SAMPLE_ITEM, untagged: true }),
      makeDoc('item-2', { ...SAMPLE_ITEM, title: 'Momentum Practice', untagged: true }),
    ];
    render(<LibraryTab />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible items' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('button', { name: /mark curated/i }));
    await vi.waitFor(() => expect(mockState.batchCommit).toHaveBeenCalledTimes(1));
  });

  it('marks curated with a batch patch containing only untagged and updatedAt', async () => {
    mockState.libraryDocs = [makeDoc('item-1', { ...SAMPLE_ITEM, untagged: true })];
    render(<LibraryTab />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Kinematics Lab' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('button', { name: /mark curated/i }));
    await vi.waitFor(() => expect(mockState.batchUpdate).toHaveBeenCalledTimes(1));
    const patch = mockState.batchUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(['untagged', 'updatedAt']);
    expect(patch).not.toHaveProperty('tags');
    expect(patch).not.toHaveProperty('subject');
  });

  it('prunes stale selections when the subject filter changes, dropping the bulk count', async () => {
    mockState.libraryDocs = [
      makeDoc('item-1', SAMPLE_ITEM),
      makeDoc('item-2', { ...SAMPLE_ITEM, title: 'Momentum Practice', subject: 'AP Physics 2' }),
    ];
    render(<LibraryTab />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible items' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/filter by subject/i), { target: { value: 'AP Physics 2' } });
    await vi.waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('shows configured classes in the assign modal', () => {
    mockClassConfigs.configs = [
      { id: 'Forensic Science', className: 'Forensic Science', features: { leaderboard: true, bossFights: true } },
      { id: 'AP Physics', className: 'AP Physics', features: { leaderboard: true, bossFights: true } },
    ];
    mockState.libraryDocs = [makeDoc('item-1', SAMPLE_ITEM)];
    render(<LibraryTab />);
    fireEvent.click(screen.getByRole('button', { name: /list view/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign Kinematics Lab' }));
    const classSelect = screen.getByLabelText(/class/i) as HTMLSelectElement;
    const options = Array.from(classSelect.options).map(o => o.textContent);
    expect(options).toContain('AP Physics');
    expect(options).toContain('Forensic Science');
    expect(options).not.toContain('Uncategorized');
  });

  it('shows only the placeholder in the assign modal when no class configs exist', () => {
    mockClassConfigs.configs = [];
    mockState.libraryDocs = [makeDoc('item-1', SAMPLE_ITEM)];
    render(<LibraryTab />);
    fireEvent.click(screen.getByRole('button', { name: /list view/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign Kinematics Lab' }));
    const classSelect = screen.getByLabelText(/class/i) as HTMLSelectElement;
    const options = Array.from(classSelect.options).map(o => o.textContent);
    expect(options).toEqual(['Select a class']);
  });

  it('groups storage re-uploads by prefix-stripped base filename and badges latest vs older', () => {
    mockState.libraryDocs = [
      makeDoc('item-new', {
        ...SAMPLE_ITEM,
        title: 'Momentum Practice v2',
        hostingType: 'storage',
        sourceFingerprint: 'library/a1b2c3d_momentum-practice.pdf',
        createdAt: '2026-09-10T00:00:00.000Z',
      }),
      makeDoc('item-old', {
        ...SAMPLE_ITEM,
        title: 'Momentum Practice v1',
        hostingType: 'storage',
        sourceFingerprint: 'library/xyz9q21_momentum-practice.pdf',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z',
      }),
      // Different base name, should land in its own group (not rendered).
      makeDoc('item-other', {
        ...SAMPLE_ITEM,
        title: 'Chapter 6 Embedded',
        hostingType: 'storage',
        sourceFingerprint: 'library/k3j5m8n_chapter-6-embedded.pdf',
      }),
    ];
    render(<LibraryTab />);
    fireEvent.click(screen.getByRole('checkbox', { name: /duplicates/i }));
    const group = screen.getByRole('rowgroup', { name: /momentum-practice\.pdf duplicate group, 2 copies/i });
    expect(group).toBeInTheDocument();
    expect(screen.queryByRole('rowgroup', { name: /chapter-6-embedded/ })).not.toBeInTheDocument();
    expect(within(group).getByText('Latest')).toBeInTheDocument();
    expect(within(group).getByText('Older copy')).toBeInTheDocument();
    // Newest first: v2 row appears before v1 row.
    const rows = within(group).getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('Momentum Practice v2');
    expect(rows[1].textContent).toContain('Momentum Practice v1');
  });

  it('pre-selects older copies on entering the duplicates view only', () => {
    mockState.libraryDocs = [
      makeDoc('item-new', {
        ...SAMPLE_ITEM,
        title: 'Momentum Practice v2',
        hostingType: 'storage',
        sourceFingerprint: 'library/a1b2c3d_momentum-practice.pdf',
        createdAt: '2026-09-10T00:00:00.000Z',
      }),
      makeDoc('item-old', {
        ...SAMPLE_ITEM,
        title: 'Momentum Practice v1',
        hostingType: 'storage',
        sourceFingerprint: 'library/xyz9q21_momentum-practice.pdf',
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
    ];
    render(<LibraryTab />);
    fireEvent.click(screen.getByRole('checkbox', { name: /duplicates/i }));
    expect(screen.getByRole('checkbox', { name: 'Select Momentum Practice v1' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Momentum Practice v2' })).not.toBeChecked();
    // Deselect the older copy, then re-render via search change: pre-selection must not reapply.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Momentum Practice v1' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Momentum' } });
    expect(screen.getByRole('checkbox', { name: 'Select Momentum Practice v1' })).not.toBeChecked();
  });

  it('archives selected items with a batch patch of status and updatedAt only', async () => {
    mockState.libraryDocs = [
      makeDoc('item-1', SAMPLE_ITEM),
      makeDoc('item-2', { ...SAMPLE_ITEM, title: 'Momentum Practice' }),
    ];
    render(<LibraryTab />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible items' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('button', { name: /^archive$/i }));
    await vi.waitFor(() => expect(mockState.batchCommit).toHaveBeenCalledTimes(1));
    expect(mockState.batchUpdate).toHaveBeenCalledTimes(2);
    const patch = mockState.batchUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(['status', 'updatedAt']);
    expect(patch.status).toBe('archived');
    expect(patch.updatedAt).toBe('server-timestamp');
  });

  it('adds a tag without duplicating an existing one', async () => {
    mockState.libraryDocs = [makeDoc('item-1', { ...SAMPLE_ITEM, untagged: true })];
    render(<LibraryTab />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Kinematics Lab' }));
    fireEvent.change(screen.getByLabelText(/tag to add/i), { target: { value: 'Kinematics' } });
    fireEvent.click(within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('button', { name: /add tag/i }));
    // Item already has "kinematics" (case-insensitive), so no batch write should occur.
    await vi.waitFor(() => expect(mockState.batchCommit).not.toHaveBeenCalled());
  });
});
