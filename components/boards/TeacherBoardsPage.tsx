import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  useBoards,
  useBoardQuestions,
  useBoardCategories,
  deriveInitials,
  QUESTION_MIN_LENGTH,
  QUESTION_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  ANSWERED_NOTE_MAX_LENGTH,
} from '../../lib/boards';
import { useToast } from '../ToastProvider';
import { useConfirm } from '../ConfirmDialog';
import Modal from '../Modal';
import {
  Loader2, Plus, Snowflake, Archive, CheckCircle2, Pencil, Trash2, Presentation, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getSectionsForClass } from '../../types';
import type { User, QuestionBoard, BoardQuestion, BoardCategory } from '../../types';

const VALID_CLASS_TYPES = ['AP Physics', 'Honors Physics', 'Physics', 'Forensic Science', 'Sandbox Class'];

interface TeacherBoardsPageProps {
  teacher: User;
  students: User[];
}

// ─── Create board form ───
const CreateBoardForm: React.FC<{
  teacher: User;
  students: User[];
  onCreated: (board: QuestionBoard) => void;
}> = ({ teacher, students, onCreated }) => {
  const { success, error } = useToast();
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [classType, setClassType] = useState(VALID_CLASS_TYPES[2]);
  const [seedQuestion, setSeedQuestion] = useState('');
  const [perSection, setPerSection] = useState(false);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const sections = useMemo(() => getSectionsForClass(students, classType), [students, classType]);

  const toggleSection = (s: string) => {
    setSelectedSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const valid =
    title.trim().length > 0 &&
    prompt.trim().length > 0 &&
    (perSection ? selectedSections.length > 0 : true) &&
    (!seedQuestion.trim() || (seedQuestion.trim().length >= QUESTION_MIN_LENGTH && seedQuestion.trim().length <= QUESTION_MAX_LENGTH));

  const handleCreate = async () => {
    if (!valid) return;
    setCreating(true);
    try {
      const targets = perSection ? selectedSections : sections;
      const created: QuestionBoard[] = [];
      for (const section of targets) {
        const ref = await addDoc(collection(db, 'question_boards'), {
          title: title.trim(),
          prompt: prompt.trim(),
          classType,
          sections: [section],
          schoolYear: '2026-27',
          status: 'open',
          createdBy: teacher.id,
          createdAt: serverTimestamp(),
        });
        if (seedQuestion.trim()) {
          try {
            await addDoc(collection(db, 'board_questions'), {
              boardId: ref.id,
              text: seedQuestion.trim(),
              initials: deriveInitials(teacher.name || '') || 'T',
              authorId: teacher.id,
              categoryId: null,
              status: 'live',
              createdAt: serverTimestamp(),
            });
          } catch (seedErr) {
            console.error('Failed to seed question', seedErr);
            error('Board created, but the seed question could not be added. You can post it manually.');
          }
        }
        created.push({
          id: ref.id,
          title: title.trim(),
          prompt: prompt.trim(),
          classType,
          sections: [section],
          schoolYear: '2026-27',
          status: 'open',
          createdBy: teacher.id,
          createdAt: {} as never,
        });
      }
      success(perSection ? `Created ${created.length} boards, one per section.` : 'Board created.');
      setTitle(''); setPrompt(''); setSeedQuestion(''); setPerSection(false); setSelectedSections([]);
      if (created.length === 1) onCreated(created[0]);
    } catch (err) {
      console.error('Failed to create board', err);
      error('Could not create the board. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-4 mb-6" open>
      <summary className="cursor-pointer text-sm font-bold text-[var(--text-primary)] min-h-[44px] flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-lg px-1">
        Create a new board
      </summary>
      <div className="mt-4 grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="board-title" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Title</label>
            <input
              id="board-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="P.1: Reliable Energy"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-primary)] px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            />
          </div>
          <div>
            <label htmlFor="board-class" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Class</label>
            <select
              id="board-class"
              value={classType}
              onChange={e => { setClassType(e.target.value); setSelectedSections([]); }}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-primary)] px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              {VALID_CLASS_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="board-prompt" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Prompt shown to students</label>
          <textarea
            id="board-prompt"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={2}
            placeholder="What do you wonder about reliable energy?"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-primary)] px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 resize-y"
          />
        </div>
        <div>
          <label htmlFor="board-seed" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Seed question (optional, {QUESTION_MIN_LENGTH}-{QUESTION_MAX_LENGTH} characters)
          </label>
          <textarea
            id="board-seed"
            value={seedQuestion}
            onChange={e => setSeedQuestion(e.target.value)}
            rows={2}
            placeholder="One example question to model the format."
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-primary)] px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 resize-y"
          />
        </div>
        <fieldset className="rounded-xl border border-[var(--border)] p-3">
          <legend className="text-xs font-semibold text-[var(--text-secondary)] px-1">Sections</legend>
          {sections.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No rostered sections for this class yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {sections.map(s => (
                <label key={s} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] cursor-pointer hover:bg-[var(--surface-glass-heavy)] transition min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={selectedSections.includes(s)}
                    onChange={() => toggleSection(s)}
                    className="w-4 h-4 accent-purple-600"
                  />
                  {s}
                </label>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={perSection}
              onChange={e => setPerSection(e.target.checked)}
              className="w-4 h-4 accent-purple-600"
            />
            Create one board per checked section
          </label>
        </fieldset>
        <div>
          <button
            onClick={handleCreate}
            disabled={!valid || creating}
            className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
            {perSection ? `Create ${selectedSections.length || 0} board${selectedSections.length === 1 ? '' : 's'}` : 'Create board'}
          </button>
        </div>
      </div>
    </details>
  );
};

// ─── Pending queue ───
const PendingQueue: React.FC<{
  questions: BoardQuestion[];
}> = ({ questions }) => {
  const { success, error } = useToast();
  const { confirm } = useConfirm();
  const pending = questions.filter(q => q.status === 'pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const approve = async (q: BoardQuestion) => {
    setBusyId(q.id);
    try {
      await updateDoc(doc(db, 'board_questions', q.id), { status: 'live' });
      success('Question approved.');
    } catch (err) {
      console.error('Approve failed', err);
      error('Could not approve the question.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (q: BoardQuestion) => {
    const ok = await confirm({ title: 'Delete note', message: 'Delete this question note? This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    setBusyId(q.id);
    try {
      await deleteDoc(doc(db, 'board_questions', q.id));
      success('Note deleted.');
    } catch (err) {
      console.error('Delete failed', err);
      error('Could not delete the note.');
    } finally {
      setBusyId(null);
    }
  };

  if (pending.length === 0) return null;

  return (
    <section aria-label="Pending moderation queue" className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-3">
        Awaiting approval ({pending.length})
      </h3>
      <ul className="flex flex-col gap-2">
        {pending.map(q => (
          <li key={q.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-glass)] p-3">
            <p className="flex-1 min-w-[12rem] text-sm text-[var(--text-primary)] break-words">{q.text}</p>
            <span className="text-xs font-bold text-[var(--text-muted)]">{q.initials}</span>
            <button
              onClick={() => approve(q)}
              disabled={busyId === q.id}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-semibold transition disabled:opacity-50 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Approve
            </button>
            <button
              onClick={() => remove(q)}
              disabled={busyId === q.id}
              className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 text-red-600 dark:text-red-400 px-3 py-2 text-xs font-semibold transition hover:bg-red-500/10 disabled:opacity-50 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

// ─── Live notes (teacher view: mark answered, manage categories) ───
const LiveNotes: React.FC<{
  questions: BoardQuestion[];
  categories: BoardCategory[];
}> = ({ questions, categories }) => {
  const { success, error } = useToast();
  const { confirm } = useConfirm();
  const [answerTarget, setAnswerTarget] = useState<BoardQuestion | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const live = questions.filter(q => q.status === 'live');
  const answered = questions.filter(q => q.status === 'answered');

  const markAnswered = async () => {
    if (!answerTarget) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'board_questions', answerTarget.id), {
        status: 'answered',
        answeredNote: note.trim() ? note.trim() : null,
      });
      setAnswerTarget(null);
      setNote('');
      success('Marked as answered.');
    } catch (err) {
      console.error('Mark answered failed', err);
      error('Could not mark the question answered.');
    } finally {
      setBusy(false);
    }
  };

  const reopen = async (q: BoardQuestion) => {
    try {
      await updateDoc(doc(db, 'board_questions', q.id), { status: 'live', answeredNote: null });
      success('Question moved back to live.');
    } catch (err) {
      console.error('Reopen failed', err);
      error('Could not reopen the question.');
    }
  };

  const removeNote = async (q: BoardQuestion) => {
    const ok = await confirm({ title: 'Delete note', message: 'Delete this question note? This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'board_questions', q.id));
      success('Note deleted.');
    } catch (err) {
      console.error('Delete failed', err);
      error('Could not delete the note.');
    }
  };

  const renderNote = (q: BoardQuestion) => {
    const catName = q.categoryId ? categories.find(c => c.id === q.categoryId)?.name : null;
    return (
      <li key={q.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-glass)] p-3">
        <p className="text-sm text-[var(--text-primary)] break-words">{q.text}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[var(--text-muted)]">{q.initials}</span>
          {catName && <span className="text-xs text-[var(--text-muted)]">in {catName}</span>}
          <div className="ml-auto flex items-center gap-1">
            {q.status === 'live' ? (
              <button
                onClick={() => { setAnswerTarget(q); setNote(''); }}
                className="min-h-[44px] px-3 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Mark answered
              </button>
            ) : (
              <>
                {q.answeredNote && <span className="text-xs text-emerald-700 dark:text-emerald-400 mr-1">Note: {q.answeredNote}</span>}
                <button
                  onClick={() => reopen(q)}
                  className="min-h-[44px] px-3 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-glass-heavy)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                  Reopen
                </button>
              </>
            )}
            <button
              onClick={() => removeNote(q)}
              aria-label="Delete note"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <section aria-label="Live and answered questions" className="mb-6">
      <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-2">Live ({live.length})</h3>
      {live.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] mb-4">No live questions.</p>
      ) : (
        <ul className="flex flex-col gap-2 mb-6">{live.map(renderNote)}</ul>
      )}
      {answered.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-2">Answered ({answered.length})</h3>
          <ul className="flex flex-col gap-2 mb-6">{answered.map(renderNote)}</ul>
        </>
      )}

      <Modal isOpen={!!answerTarget} onClose={() => setAnswerTarget(null)} title="Mark answered" maxWidth="max-w-sm">
        <p className="text-sm text-[var(--text-secondary)] mb-3 break-words">&ldquo;{answerTarget?.text}&rdquo;</p>
        <label htmlFor="answered-note" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
          Short note (optional, up to {ANSWERED_NOTE_MAX_LENGTH} characters)
        </label>
        <input
          id="answered-note"
          value={note}
          onChange={e => setNote(e.target.value.slice(0, ANSWERED_NOTE_MAX_LENGTH))}
          placeholder="e.g. Covered in lesson 4."
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-primary)] px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 mb-4"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setAnswerTarget(null)}
            className="min-h-[44px] px-4 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-glass-heavy)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            Cancel
          </button>
          <button
            onClick={markAnswered}
            disabled={busy}
            className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Mark answered
          </button>
        </div>
      </Modal>
    </section>
  );
};

// ─── Category manager ───
const CategoryManager: React.FC<{
  board: QuestionBoard;
  categories: BoardCategory[];
  onRename: (c: BoardCategory) => void;
}> = ({ board, categories, onRename }) => {
  const { success, error } = useToast();
  const { confirm } = useConfirm();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const boardOpen = board.status === 'open';

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > CATEGORY_NAME_MAX_LENGTH) return;
    setAdding(true);
    try {
      await addDoc(collection(db, 'board_categories'), {
        boardId: board.id,
        name: trimmed,
        createdBy: board.createdBy,
        createdAt: serverTimestamp(),
      });
      setName('');
      success('Category added.');
    } catch (err) {
      console.error('Failed to add category', err);
      error('Could not add the category.');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (c: BoardCategory) => {
    const ok = await confirm({
      title: 'Delete category',
      message: `Delete the category "${c.name}"? Notes in it will become uncategorized. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'board_categories', c.id));
      success('Category deleted.');
    } catch (err) {
      console.error('Failed to delete category', err);
      error('Could not delete the category.');
    }
  };

  return (
    <section aria-label="Categories" className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-4">
      <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-3">Categories ({categories.length})</h3>
      {categories.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] mb-3">Students create categories as they cluster questions. You can add one here too.</p>
      ) : (
        <ul className="flex flex-wrap gap-2 mb-3">
          {categories.map(c => (
            <li key={c.id} className="flex items-center gap-1 rounded-lg border border-[var(--border)] pl-3 pr-1 py-1 text-sm text-[var(--text-primary)]">
              {c.name}
              <button
                onClick={() => onRename(c)}
                disabled={!boardOpen}
                aria-label={`Rename category ${c.name}`}
                className="min-w-[44px] min-h-[44px] -my-2 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                onClick={() => remove(c)}
                disabled={!boardOpen}
                aria-label={`Delete category ${c.name}`}
                className="min-w-[44px] min-h-[44px] -my-2 mr-1 flex items-center justify-center rounded-md text-red-600 dark:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {boardOpen && (
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value.slice(0, CATEGORY_NAME_MAX_LENGTH))}
            placeholder="New category name"
            aria-label="New category name"
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-primary)] px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          />
          <button
            onClick={add}
            disabled={!name.trim() || adding}
            className="inline-flex items-center gap-1 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
            Add
          </button>
        </div>
      )}
    </section>
  );
};

// ─── Board detail (opened from the list) ───
const BoardDetail: React.FC<{
  board: QuestionBoard;
  onBack: () => void;
}> = ({ board, onBack }) => {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { confirm } = useConfirm();
  const { questions, loading } = useBoardQuestions(board.id);
  const { categories, loading: catsLoading } = useBoardCategories(board.id);
  const [renameTarget, setRenameTarget] = useState<BoardCategory | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const setStatus = async (status: 'open' | 'frozen' | 'archived', confirmMessage?: string) => {
    if (confirmMessage) {
      const ok = await confirm({ title: 'Change board status', message: confirmMessage, confirmLabel: 'Continue' });
      if (!ok) return;
    }
    try {
      await updateDoc(doc(db, 'question_boards', board.id), { status });
      success(`Board ${status}.`);
    } catch (err) {
      console.error('Status change failed', err);
      error('Could not update the board status.');
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed.length > CATEGORY_NAME_MAX_LENGTH) return;
    setRenaming(true);
    try {
      await updateDoc(doc(db, 'board_categories', renameTarget.id), { name: trimmed });
      setRenameTarget(null);
      success('Category renamed.');
    } catch (err) {
      console.error('Rename failed', err);
      error('Could not rename the category.');
    } finally {
      setRenaming(false);
    }
  };

  const pendingCount = questions.filter(q => q.status === 'pending').length;
  const boardOpen = board.status === 'open';

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className="flex-1 min-w-[16rem]">
          <button
            onClick={onBack}
            className="mb-1 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition min-h-[44px] -ml-2 px-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            All boards
          </button>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">{board.title}</h2>
          <p className="text-sm text-[var(--text-secondary)]">{board.classType} · {board.sections.join(', ')} · {board.schoolYear}</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">{board.prompt}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate(`/boards/${board.id}/projector`)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <Presentation className="w-4 h-4" aria-hidden="true" /> Projector
          </button>
          {boardOpen ? (
            <button
              onClick={() => setStatus('frozen', 'Freeze this board? Students will no longer be able to post or move notes.')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] text-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--surface-glass-heavy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              <Snowflake className="w-4 h-4" aria-hidden="true" /> Freeze
            </button>
          ) : board.status === 'frozen' ? (
            <>
              <button
                onClick={() => setStatus('open')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] text-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--surface-glass-heavy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                Reopen
              </button>
              <button
                onClick={() => setStatus('archived', 'Archive this board? It will be hidden from students.')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 text-red-600 dark:text-red-400 px-4 py-2.5 text-sm font-semibold transition hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <Archive className="w-4 h-4" aria-hidden="true" /> Archive
              </button>
            </>
          ) : (
            <span className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)]">Archived</span>
          )}
        </div>
      </div>

      {board.status === 'frozen' && (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">This board is frozen. Students can view it but cannot post.</p>
      )}

      {loading || catsLoading ? (
        <div className="flex items-center gap-2 text-[var(--text-muted)] py-8" role="status">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Loading board...
        </div>
      ) : (
        <>
          <PendingQueue questions={questions} />
          {pendingCount > 0 && <p className="sr-only" aria-live="polite">{pendingCount} question(s) awaiting approval.</p>}
          <LiveNotes
            questions={questions}
            categories={categories}
          />
          <CategoryManager board={board} categories={categories} onRename={(c) => { setRenameTarget(c); setRenameValue(c.name); }} />
        </>
      )}

      <Modal isOpen={!!renameTarget} onClose={() => setRenameTarget(null)} title="Rename category" maxWidth="max-w-sm">
        <label htmlFor="rename-category" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Category name</label>
        <input
          id="rename-category"
          value={renameValue}
          onChange={e => setRenameValue(e.target.value.slice(0, CATEGORY_NAME_MAX_LENGTH))}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-primary)] px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 mb-4"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setRenameTarget(null)}
            className="min-h-[44px] px-4 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-glass-heavy)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            Cancel
          </button>
          <button
            onClick={handleRename}
            disabled={renaming || !renameValue.trim()}
            className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            {renaming && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Save
          </button>
        </div>
      </Modal>
    </div>
  );
};

// ─── Main page ───
const TeacherBoardsPage: React.FC<TeacherBoardsPageProps> = ({ teacher, students }) => {
  const { boards, loading } = useBoards(teacher.classType && teacher.classType !== 'Uncategorized' ? teacher.classType : null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const selected = boards.find(b => b.id === selectedId) ?? null;
  const visible = boards.filter(b => showArchived ? b.status === 'archived' : b.status !== 'archived');

  if (selected) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-6">
        <BoardDetail board={selected} onBack={() => setSelectedId(null)} />
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Question Boards</h1>
        <button
          onClick={() => setShowArchived(v => !v)}
          className="min-h-[44px] px-3 rounded-xl text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass-heavy)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          aria-pressed={showArchived}
        >
          {showArchived ? 'Show active' : 'Show archived'} {showArchived ? <ChevronUp className="inline w-4 h-4" aria-hidden="true" /> : <ChevronDown className="inline w-4 h-4" aria-hidden="true" />}
        </button>
      </div>

      {!showArchived && (
        <CreateBoardForm
          teacher={teacher}
          students={students}
          onCreated={(board) => setSelectedId(board.id)}
        />
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--text-muted)] py-8" role="status">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Loading boards...
        </div>
      ) : visible.length === 0 ? (
        <p className="text-[var(--text-secondary)] py-8 text-center">
          {showArchived ? 'No archived boards.' : 'No boards yet. Create one above.'}
        </p>
      ) : (
        <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {visible.map(b => (
            <li key={b.id}>
              <button
                onClick={() => setSelectedId(b.id)}
                className="w-full text-left rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-4 transition hover:bg-[var(--surface-glass-heavy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-[var(--text-primary)]">{b.title}</h2>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    b.status === 'open'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : b.status === 'frozen'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                        : 'bg-gray-500/15 text-[var(--text-muted)]'
                  }`}>
                    {b.status}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">{b.classType} · {b.sections.join(', ')}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-2 line-clamp-2">{b.prompt}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};

export default TeacherBoardsPage;
