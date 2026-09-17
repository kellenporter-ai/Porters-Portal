import React, { useEffect, useMemo, useState } from 'react';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  useBoardQuestions,
  useBoardCategories,
  useEndorsements,
  deriveInitials,
  isValidQuestionText,
  groupQuestionsByCategory,
  countEndorsements,
  QUESTION_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
} from '../../lib/boards';
import { useToast } from '../ToastProvider';
import Modal from '../Modal';
import { useOnlineStatus } from '../../lib/useOnlineStatus';
import { Loader2, Plus, Hand, ArrowLeftRight, PlusCircle, Check } from 'lucide-react';
import type { User, QuestionBoard, BoardQuestion } from '../../types';

interface BoardPageProps {
  user: User;
  board: QuestionBoard;
  onBack?: () => void;
}

const NoteCard: React.FC<{
  question: BoardQuestion;
  endorseCount: number;
  endorsedByMe: boolean;
  boardOpen: boolean;
  onEndorse: (q: BoardQuestion) => void;
  onCategorize: (q: BoardQuestion) => void;
}> = ({ question, endorseCount, endorsedByMe, boardOpen, onEndorse, onCategorize }) => {
  const answered = question.status === 'answered';
  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        answered
          ? 'border-emerald-500/30 bg-emerald-500/5 opacity-80'
          : 'border-[var(--border)] bg-[var(--surface-glass)]'
      }`}
    >
      <p className="text-[var(--text-primary)] text-sm leading-snug break-words">{question.text}</p>
      {answered && question.answeredNote && (
        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">Answered: {question.answeredNote}</p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-wide text-[var(--text-muted)]" aria-label={`Posted by ${question.initials}`}>
          {question.initials}
        </span>
        <div className="flex items-center gap-1">
          {boardOpen && !answered && (
            <button
              onClick={() => onCategorize(question)}
              className="min-w-[44px] min-h-[44px] -my-2 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              aria-label="Move to a category"
              title="Move to a category"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onEndorse(question)}
            disabled={!boardOpen || answered}
            aria-pressed={endorsedByMe}
            className={`flex items-center gap-1 rounded-lg px-2 min-h-[44px] -my-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
              endorsedByMe
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)]'
            } ${!boardOpen || answered ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label={endorsedByMe ? 'Remove my "me too"' : 'Me too'}
            title="Me too"
          >
            <Hand className="w-4 h-4" />
            <span aria-live="polite">{endorseCount}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const BoardPage: React.FC<BoardPageProps> = ({ user, board, onBack }) => {
  const { success, error } = useToast();
  const isOnline = useOnlineStatus();
  const { questions, loading: questionsLoading } = useBoardQuestions(board.id);
  const { categories, loading: categoriesLoading } = useBoardCategories(board.id);
  const { endorsements } = useEndorsements(board.id);

  const [draft, setDraft] = useState('');
  const [initials, setInitials] = useState(() => deriveInitials(user.name || ''));
  const [posting, setPosting] = useState(false);
  const [selected, setSelected] = useState<BoardQuestion | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const endorseCountMap = useMemo(() => countEndorsements(endorsements), [endorsements]);
  const boardOpen = board.status === 'open';
  const trimmedDraft = draft.trim();
  const draftValid = isValidQuestionText(trimmedDraft);
  const initialsValid = /^[A-Za-z]{2,3}$/.test(initials.trim());

  const groups = useMemo(
    () => groupQuestionsByCategory(questions, categories, ['live', 'answered']),
    [questions, categories],
  );

  // Sync editable initials if the display name changes after mount.
  useEffect(() => {
    setInitials(deriveInitials(user.name || ''));
  }, [user.name]);

  const handlePost = async () => {
    if (!draftValid || !initialsValid || !isOnline) return;
    setPosting(true);
    try {
      await addDoc(collection(db, 'board_questions'), {
        boardId: board.id,
        text: trimmedDraft,
        initials: initials.trim().toUpperCase(),
        authorId: user.id,
        categoryId: null,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setDraft('');
      success('Question posted. It will appear once approved.');
    } catch (err) {
      console.error('Failed to post question', err);
      error('Could not post your question. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const handleEndorse = async (q: BoardQuestion) => {
    if (!boardOpen || !isOnline) return;
    const eid = `${q.id}_${user.id}`;
    const ref = doc(db, 'board_endorsements', eid);
    const already = endorsements.some(e => e.id === eid);
    try {
      if (already) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, {
          questionId: q.id,
          boardId: board.id,
          userId: user.id,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('Endorsement failed', err);
      error('Could not update "me too". Please try again.');
    }
  };

  const handleMove = async (categoryId: string | null) => {
    if (!selected || !boardOpen || !isOnline) return;
    try {
      await updateDoc(doc(db, 'board_questions', selected.id), { categoryId });
      setSelected(null);
      success('Note moved.');
    } catch (err) {
      console.error('Failed to move note', err);
      error('Could not move the note. Please try again.');
    }
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || name.length > CATEGORY_NAME_MAX_LENGTH || !isOnline) return;
    setSavingCategory(true);
    try {
      const ref = await addDoc(collection(db, 'board_categories'), {
        boardId: board.id,
        name,
        createdBy: user.id,
        createdAt: serverTimestamp(),
      });
      setNewCategoryName('');
      await handleMove(ref.id);
    } catch (err) {
      console.error('Failed to create category', err);
      error('Could not create the category. Please try again.');
    } finally {
      setSavingCategory(false);
    }
  };

  const loading = questionsLoading || categoriesLoading;

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          {onBack && (
            <button
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition min-h-[44px] -ml-2 px-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              <ArrowLeftRight className="w-4 h-4 rotate-180" aria-hidden="true" /> All boards
            </button>
          )}
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{board.title}</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1 max-w-2xl">{board.prompt}</p>
        </div>
        {board.status !== 'open' && (
          <span className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)]">
            {board.status === 'frozen' ? 'Frozen' : 'Archived'}
          </span>
        )}
      </div>

      {/* Post form */}
      <section aria-label="Post a question" className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-4">
        <label htmlFor="board-question" className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
          Post a question
        </label>
        <textarea
          id="board-question"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={3}
          maxLength={QUESTION_MAX_LENGTH + 50}
          disabled={!boardOpen}
          placeholder={boardOpen ? 'What do you wonder about this unit?' : 'This board is frozen.'}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-primary)] p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-60 resize-y"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="board-initials" className="text-xs text-[var(--text-muted)]">Your initials</label>
            <input
              id="board-initials"
              value={initials}
              onChange={e => setInitials(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 3))}
              disabled={!boardOpen}
              aria-describedby="initials-hint"
              className="w-16 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-2 text-center text-sm font-bold uppercase tracking-widest focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-60"
            />
            <span id="initials-hint" className="text-xs text-[var(--text-muted)]">2-3 letters, shown on your note.</span>
          </div>
          <span className={`ml-auto text-xs ${trimmedDraft.length > QUESTION_MAX_LENGTH || (trimmedDraft.length > 0 && trimmedDraft.length < 10) ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-muted)]'}`} aria-live="polite">
            {trimmedDraft.length}/{QUESTION_MAX_LENGTH}
          </span>
          <button
            onClick={handlePost}
            disabled={!boardOpen || !draftValid || !initialsValid || posting || !isOnline}
            className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-base)]"
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
            Post question
          </button>
        </div>
        {!isOnline && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">You are offline. Posting is unavailable.</p>}
      </section>

      {/* Columns */}
      {loading ? (
        <div className="flex items-center gap-2 text-[var(--text-muted)] py-10" role="status">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Loading questions...
        </div>
      ) : groups.length === 0 ? (
        <p className="text-[var(--text-secondary)] py-10 text-center">No questions yet. Be the first to post one.</p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {groups.map(group => (
            <section
              key={group.categoryId ?? 'uncategorized'}
              aria-label={group.categoryName}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-3 flex flex-col gap-2 min-h-[8rem]"
            >
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] px-1">
                {group.categoryName} <span className="font-normal normal-case">({group.questions.length})</span>
              </h2>
              {group.questions.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] px-1">Nothing here yet.</p>
              ) : (
                group.questions.map(q => (
                  <NoteCard
                    key={q.id}
                    question={q}
                    endorseCount={endorseCountMap.get(q.id) ?? 0}
                    endorsedByMe={endorsements.some(e => e.id === `${q.id}_${user.id}`)}
                    boardOpen={boardOpen}
                    onEndorse={handleEndorse}
                    onCategorize={setSelected}
                  />
                ))
              )}
            </section>
          ))}
        </div>
      )}

      {/* Categorize sheet */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Move to a category" maxWidth="max-w-sm">
        <p className="text-sm text-[var(--text-secondary)] mb-4 break-words">&ldquo;{selected?.text}&rdquo;</p>
        <div className="flex flex-col gap-2 mb-4" role="menu" aria-label="Categories">
          <button
            onClick={() => handleMove(null)}
            className="flex items-center justify-between min-h-[44px] px-3 rounded-xl border border-[var(--border)] text-sm text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            Uncategorized {selected && !selected.categoryId && <Check className="w-4 h-4 text-purple-500" aria-hidden="true" />}
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => handleMove(c.id)}
              className="flex items-center justify-between min-h-[44px] px-3 rounded-xl border border-[var(--border)] text-sm text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              {c.name} {selected?.categoryId === c.id && <Check className="w-4 h-4 text-purple-500" aria-hidden="true" />}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value.slice(0, CATEGORY_NAME_MAX_LENGTH))}
            placeholder="New category name"
            aria-label="New category name"
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-primary)] px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          />
          <button
            onClick={handleCreateCategory}
            disabled={!newCategoryName.trim() || savingCategory || !isOnline}
            className="inline-flex items-center gap-1 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            {savingCategory ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <PlusCircle className="w-4 h-4" aria-hidden="true" />}
            Create
          </button>
        </div>
      </Modal>
    </main>
  );
};

export default BoardPage;
