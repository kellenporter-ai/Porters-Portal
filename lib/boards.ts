import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import { resilientSnapshot } from '../services/resilientSnapshot';
import type {
  QuestionBoard,
  BoardQuestion,
  BoardCategory,
  BoardEndorsement,
  BoardQuestionStatus,
} from '../types';

// ─── Pure helpers ───

export const QUESTION_MIN_LENGTH = 10;
export const QUESTION_MAX_LENGTH = 280;
export const CATEGORY_NAME_MAX_LENGTH = 40;
export const ANSWERED_NOTE_MAX_LENGTH = 140;

/**
 * Derive 2-3 character initials from a display name.
 * "Ada Lovelace" -> "AL", "Cher" -> "CHE", "mary jane watson" -> "MJW".
 */
export function deriveInitials(displayName: string): string {
  const cleaned = displayName.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const parts = cleaned.split(' ');
  if (parts.length === 1) {
    return parts[0].slice(0, 3).toUpperCase();
  }
  const first = parts[0][0] ?? '';
  const last = parts[parts.length - 1][0] ?? '';
  const middle = parts.length > 2 ? parts[1][0] ?? '' : '';
  return (first + (middle || '') + last).toUpperCase();
}

/** Validate question text length (10..280 chars after trimming). */
export function isValidQuestionText(text: string): boolean {
  const len = text.trim().length;
  return len >= QUESTION_MIN_LENGTH && len <= QUESTION_MAX_LENGTH;
}

/** Bucket label used for questions without a category. */
export const UNCATEGORIZED_LABEL = 'Uncategorized';

export interface QuestionGroup {
  categoryId: string | null;
  categoryName: string;
  questions: BoardQuestion[];
}

/**
 * Group questions by category. Categories with no questions are still shown
 * (so students see available categories); questions with a categoryId that
 * no longer exists fall into the Uncategorized bucket. Uncategorized always
 * renders last.
 */
export function groupQuestionsByCategory(
  questions: BoardQuestion[],
  categories: BoardCategory[],
  visibleStatuses: BoardQuestionStatus[],
): QuestionGroup[] {
  const visible = questions.filter(q => visibleStatuses.includes(q.status));
  const byId = new Map(categories.map(c => [c.id, c]));
  const groups: QuestionGroup[] = categories.map(c => ({
    categoryId: c.id,
    categoryName: c.name,
    questions: [],
  }));
  const buckets = new Map<string | null, BoardQuestion[]>(categories.map(c => [c.id, groups.find(g => g.categoryId === c.id)!.questions]));
  const uncategorized: BoardQuestion[] = [];

  for (const q of visible) {
    if (q.categoryId && byId.has(q.categoryId)) {
      buckets.get(q.categoryId)!.push(q);
    } else {
      uncategorized.push(q);
    }
  }

  const result = groups.filter(g => g.questions.length > 0 || categories.some(c => c.id === g.categoryId));
  if (uncategorized.length > 0) {
    result.push({ categoryId: null, categoryName: UNCATEGORIZED_LABEL, questions: uncategorized });
  }
  return result;
}

// ─── Firestore deserializers ───

function deserializeBoard(id: string, data: Record<string, unknown>): QuestionBoard {
  return { ...(data as unknown as QuestionBoard), id };
}

function deserializeQuestion(id: string, data: Record<string, unknown>): BoardQuestion {
  return { ...(data as unknown as BoardQuestion), id };
}

function deserializeCategory(id: string, data: Record<string, unknown>): BoardCategory {
  return { ...(data as unknown as BoardCategory), id };
}

function deserializeEndorsement(id: string, data: Record<string, unknown>): BoardEndorsement {
  return { ...(data as unknown as BoardEndorsement), id };
}

// ─── Real-time hooks (resilientSnapshot wraps onSnapshot, returns unsubscribe) ───

/** All boards created by a teacher (any status, any target class). Pass `null` to skip the subscription. */
export function useBoards(creatorUid: string | null): { boards: QuestionBoard[]; loading: boolean } {
  const [boards, setBoards] = useState<QuestionBoard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!creatorUid) { setBoards([]); setLoading(false); return; }
    setLoading(true);
    const q = query(
      collection(db, 'question_boards'),
      where('createdBy', '==', creatorUid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = resilientSnapshot('question_boards', q, (snapshot) => {
      setBoards(snapshot.docs.map(d => deserializeBoard(d.id, d.data())));
      setLoading(false);
    });
    return unsub;
  }, [creatorUid]);

  return { boards, loading };
}

/** All questions on a board (every status; filter in the component). */
export function useBoardQuestions(boardId: string | null): { questions: BoardQuestion[]; loading: boolean } {
  const [questions, setQuestions] = useState<BoardQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!boardId) { setQuestions([]); setLoading(false); return; }
    setLoading(true);
    const q = query(
      collection(db, 'board_questions'),
      where('boardId', '==', boardId),
      orderBy('createdAt', 'asc'),
    );
    const unsub = resilientSnapshot('board_questions', q, (snapshot) => {
      setQuestions(snapshot.docs.map(d => deserializeQuestion(d.id, d.data())));
      setLoading(false);
    });
    return unsub;
  }, [boardId]);

  return { questions, loading };
}

/** All categories on a board, alphabetical. */
export function useBoardCategories(boardId: string | null): { categories: BoardCategory[]; loading: boolean } {
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!boardId) { setCategories([]); setLoading(false); return; }
    setLoading(true);
    const q = query(
      collection(db, 'board_categories'),
      where('boardId', '==', boardId),
      orderBy('name', 'asc'),
    );
    const unsub = resilientSnapshot('board_categories', q, (snapshot) => {
      setCategories(snapshot.docs.map(d => deserializeCategory(d.id, d.data())));
      setLoading(false);
    });
    return unsub;
  }, [boardId]);

  return { categories, loading };
}

/** Endorsements for all questions on a board (single subscription). */
export function useEndorsements(boardId: string | null): { endorsements: BoardEndorsement[]; loading: boolean } {
  const [endorsements, setEndorsements] = useState<BoardEndorsement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!boardId) { setEndorsements([]); setLoading(false); return; }
    setLoading(true);
    const q = query(
      collection(db, 'board_endorsements'),
      where('boardId', '==', boardId),
    );
    const unsub = resilientSnapshot('board_endorsements', q, (snapshot) => {
      setEndorsements(snapshot.docs.map(d => deserializeEndorsement(d.id, d.data())));
      setLoading(false);
    });
    return unsub;
  }, [boardId]);

  return { endorsements, loading };
}

/** Convenience: endorsement counts per question id. */
export function countEndorsements(endorsements: BoardEndorsement[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of endorsements) {
    counts.set(e.questionId, (counts.get(e.questionId) ?? 0) + 1);
  }
  return counts;
}
