// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ boardId: 'b1' }),
}));

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../../services/resilientSnapshot', () => ({ resilientSnapshot: vi.fn() }));
// getDoc(doc(db, ...)) is called on mount; resolve to a non-existent snap.
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn().mockReturnValue({}),
    getDoc: vi.fn().mockResolvedValue({ exists: () => false, id: 'b1' }),
  };
});

import * as boardsLib from '../boards';
vi.mock('../boards', async (importOriginal) => {
  const actual = await importOriginal<typeof boardsLib>();
  return {
    ...actual,
    useBoardQuestions: () => ({ questions: [], loading: false }),
    useBoardCategories: () => ({ categories: [], loading: false }),
    useEndorsements: () => ({ endorsements: [], loading: false }),
  };
});

import BoardProjectorPage from '../../components/boards/BoardProjectorPage';

describe('BoardProjectorPage exit navigation', () => {
  it('navigates to /boards when the X button is clicked', () => {
    mockNavigate.mockClear();
    render(<BoardProjectorPage />);
    fireEvent.click(screen.getByRole('button', { name: /exit projector view/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/boards');
  });

  it('navigates to /boards on Escape keydown', () => {
    mockNavigate.mockClear();
    render(<BoardProjectorPage />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockNavigate).toHaveBeenCalledWith('/boards');
  });
});
