/**
 * BoardProjectorPage — teacher-only, full-screen, real-time board projection.
 * High contrast dark surface intended for classroom projection. Minimal chrome.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { X, Loader2, CheckCircle2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import {
  useBoardQuestions,
  useBoardCategories,
  useEndorsements,
  groupQuestionsByCategory,
  countEndorsements,
} from '../../lib/boards';
import type { QuestionBoard } from '../../types';

const BoardProjectorPage: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();

  const [board, setBoard] = useState<QuestionBoard | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);

  const { questions, loading: questionsLoading } = useBoardQuestions(boardId ?? null);
  const { categories, loading: categoriesLoading } = useBoardCategories(boardId ?? null);
  const { endorsements, loading: endorsementsLoading } = useEndorsements(boardId ?? null);

  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    setBoardLoading(true);
    getDoc(doc(db, 'question_boards', boardId))
      .then(snap => {
        if (cancelled) return;
        setBoard(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<QuestionBoard, 'id'>) } : null);
      })
      .catch(err => console.error('Failed to load board', err))
      .finally(() => { if (!cancelled) setBoardLoading(false); });
    return () => { cancelled = true; };
  }, [boardId]);

  // Escape exits projection mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate(`/boards/${boardId}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, boardId]);

  const grouped = useMemo(
    () => groupQuestionsByCategory(questions, categories, ['live', 'answered']),
    [questions, categories]
  );
  const endorseCountMap = useMemo(() => countEndorsements(endorsements), [endorsements]);

  const loading = boardLoading || questionsLoading || categoriesLoading || endorsementsLoading;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0b0b10] text-white"
      role="main"
      aria-label={`Projector view of ${board?.title ?? 'board'}`}
    >
      {/* Header: minimal chrome */}
      <header className="flex items-start gap-4 px-6 pt-4 pb-3 shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold leading-tight truncate">
            {board?.title ?? 'Question Board'}
          </h1>
          {board?.prompt && (
            <p className="text-base md:text-lg text-white/70 mt-1 line-clamp-2">{board.prompt}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 text-emerald-300 px-3 py-1 text-sm font-semibold" aria-live="polite">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            Live · {grouped.reduce((n, g) => n + g.questions.length, 0)}
          </span>
          <button
            onClick={() => navigate(`/boards/${boardId}`)}
            aria-label="Exit projector view"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Columns */}
      <div className="flex-1 min-h-0 px-6 pb-6">
        {loading ? (
          <div className="h-full flex items-center justify-center gap-3 text-white/60" role="status">
            <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" /> Loading board...
          </div>
        ) : grouped.length === 0 ? (
          <div className="h-full flex items-center justify-center text-white/50 text-xl">
            No live questions yet.
          </div>
        ) : (
          <div
            className="h-full grid gap-4 overflow-hidden"
            style={{ gridTemplateColumns: `repeat(${Math.min(grouped.length, 5)}, minmax(0, 1fr))` }}
          >
            {grouped.map(col => (
              <section key={col.categoryId ?? 'uncategorized'} className="flex flex-col min-h-0 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                <h2 className="shrink-0 px-4 py-3 text-lg md:text-xl font-bold uppercase tracking-wide text-white/90 border-b border-white/10">
                  {col.categoryName}
                  <span className="ml-2 text-white/50 font-semibold">{col.questions.length}</span>
                </h2>
                <ul className="flex-1 min-h-0 overflow-hidden p-3 space-y-3">
                  {col.questions.map(q => (
                    <li
                      key={q.id}
                      className="rounded-xl bg-white/10 border border-white/10 p-4"
                    >
                      <p className="text-lg md:text-xl lg:text-2xl leading-snug font-medium">
                        {q.text}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-sm md:text-base text-white/60">
                        <span className="font-mono font-semibold text-white/70">{q.initials}</span>
                        {q.status === 'answered' && (
                          <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold">
                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Answered
                          </span>
                        )}
                        {(endorseCountMap.get(q.id) ?? 0) > 0 && (
                          <span aria-label={`${endorseCountMap.get(q.id)} me too endorsements`}>
                            {endorseCountMap.get(q.id)} me too
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardProjectorPage;
