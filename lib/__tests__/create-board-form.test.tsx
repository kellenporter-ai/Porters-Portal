// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../../services/resilientSnapshot', () => ({ resilientSnapshot: vi.fn() }));
vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../components/ConfirmDialog', () => ({
  useConfirm: () => ({ confirm: vi.fn() }),
}));

import * as boardsLib from '../boards';
vi.mock('../boards', async (importOriginal) => {
  const actual = await importOriginal<typeof boardsLib>();
  return {
    ...actual,
    useBoards: () => ({ boards: [], loading: false }),
    useBoardQuestions: () => ({ questions: [], loading: false }),
    useBoardCategories: () => ({ categories: [], loading: false }),
  };
});

import TeacherBoardsPage from '../../components/boards/TeacherBoardsPage';
import type { User } from '../../types';

const teacher = { id: 't1', name: 'Kellen Porter', classType: 'Physics' } as unknown as User;
const students = [
  { id: 's1', classType: 'Physics', section: 'P.1' },
  { id: 's2', classType: 'Physics', section: 'P.2' },
] as unknown as User[];

describe('create board form', () => {
  it('enables after filling title and prompt', () => {
    render(<TeacherBoardsPage teacher={teacher} students={students} />);
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Energy' } });
    fireEvent.change(screen.getByLabelText(/Prompt shown to students/i), { target: { value: 'What do you wonder?' } });
    const btn = screen.getByRole('button', { name: /Create board/i });
    expect(btn).toBeEnabled();
  });

  it('sandbox class: enables after filling title and prompt', () => {
    render(<TeacherBoardsPage teacher={teacher} students={students} />);
    fireEvent.change(screen.getByLabelText(/Class/i), { target: { value: 'Sandbox Class' } });
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Energy' } });
    fireEvent.change(screen.getByLabelText(/Prompt shown to students/i), { target: { value: 'What do you wonder?' } });
    const btn = screen.getByRole('button', { name: /Create board/i });
    expect(btn).toBeEnabled();
  });

  it('per-section: requires a selected section', () => {
    render(<TeacherBoardsPage teacher={teacher} students={students} />);
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Energy' } });
    fireEvent.change(screen.getByLabelText(/Prompt shown to students/i), { target: { value: 'What do you wonder?' } });
    fireEvent.click(screen.getByLabelText(/Create one board per checked section/i));
    const btn = screen.getByRole('button', { name: /Create 0 boards/i });
    expect(btn).toBeDisabled();
  });

  it('seed question too short disables the button with a visible reason', () => {
    render(<TeacherBoardsPage teacher={teacher} students={students} />);
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Energy' } });
    fireEvent.change(screen.getByLabelText(/Prompt shown to students/i), { target: { value: 'What do you wonder?' } });
    fireEvent.change(screen.getByLabelText(/Seed question/i), { target: { value: 'short' } });
    const btn = screen.getByRole('button', { name: /Create board/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/at least 10 characters/i)).toBeVisible();
  });

  it('enables the button when the seed question is a valid length', () => {
    render(<TeacherBoardsPage teacher={teacher} students={students} />);
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Energy' } });
    fireEvent.change(screen.getByLabelText(/Prompt shown to students/i), { target: { value: 'What do you wonder?' } });
    fireEvent.change(screen.getByLabelText(/Seed question/i), { target: { value: 'Why does the ball keep rolling?' } });
    const btn = screen.getByRole('button', { name: /Create board/i });
    expect(btn).toBeEnabled();
    expect(screen.queryByText(/at least 10 characters/i)).not.toBeInTheDocument();
  });
});
