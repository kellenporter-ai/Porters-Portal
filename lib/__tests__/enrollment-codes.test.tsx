// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockState = vi.hoisted(() => ({
  classNames: [] as string[],
}));

vi.mock('../../lib/AppDataContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/AppDataContext')>();
  return {
    ...actual,
    useClassList: () => mockState.classNames,
  };
});

vi.mock('../../services/dataService', () => ({
  dataService: {
    subscribeToEnrollmentCodes: vi.fn(() => () => {}),
    createEnrollmentCode: vi.fn(),
    deactivateEnrollmentCode: vi.fn(),
  },
}));

vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../components/ConfirmDialog', () => ({
  useConfirm: () => ({ confirm: vi.fn(async () => true) }),
}));

import EnrollmentCodes from '../../components/EnrollmentCodes';

describe('EnrollmentCodes with empty class configs', () => {
  beforeEach(() => {
    mockState.classNames = [];
    vi.clearAllMocks();
  });

  it('shows disabled placeholder instead of class options when no configs exist', () => {
    render(<EnrollmentCodes availableSections={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /generate code/i }));
    const select = screen.getByLabelText(/class/i);
    expect(select).toBeInTheDocument();
    expect(select).toHaveDisplayValue('Select a class');
    // No class options should be present (only the disabled placeholder)
    expect(select.querySelectorAll('option')).toHaveLength(1);
    expect(select.querySelector('option')).toBeDisabled();
  });

  it('disables Create when no class is selected', () => {
    render(<EnrollmentCodes availableSections={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /generate code/i }));
    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled();
  });

  it('renders empty-state message when no active codes', () => {
    render(<EnrollmentCodes availableSections={[]} />);
    expect(screen.getByText('No Active Enrollment Codes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate your first code/i })).toBeInTheDocument();
  });

  it('lists class names from configs when they exist', () => {
    mockState.classNames = ['AP Physics', 'Honors Physics'];
    render(<EnrollmentCodes availableSections={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /generate code/i }));
    expect(screen.getByRole('option', { name: 'AP Physics' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Honors Physics' })).toBeInTheDocument();
  });
});
