import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ExternalLink, Link, Unlink, Loader2, ChevronDown, Plus, X, Eye, EyeOff } from 'lucide-react';
import { Assignment, ClassroomLink, ClassroomLinkEntry, User, getSectionsForClass } from '../types';
import { callClassroomListCourses, callClassroomListCourseWork, callClassroomCreateCourseWork, auth } from '../lib/firebase';
import { getClassroomAccessToken } from '../lib/classroomAuth';
import { dataService } from '../services/dataService';

interface ClassroomLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment;
  classType: string;
  students: User[];
  onLinked: (links: ClassroomLinkEntry[], accessToken?: string) => void;
  onUnlinked: () => void;
}

interface Course {
  id: string;
  name: string;
  section?: string;
  descriptionHeading?: string;
}

interface CourseWork {
  id: string;
  title: string;
  maxPoints: number;
}

/** State for a single row in the multi-section table */
interface SectionRow {
  portalSection: string;
  selectedCourseId: string;
  selectedCourseWorkId: string;
  createNew: boolean;
  newTitle: string;
  newMaxPoints: number;
  courseWorkLoaded: boolean;
  courseWorkLoading: boolean;
  courseWorkError: string | null;
  skip: boolean;
}

const ClassroomLinkModal: React.FC<ClassroomLinkModalProps> = ({
  isOpen,
  onClose,
  assignment,
  classType,
  students,
  onLinked,
  onUnlinked,
}) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // ── Courses ───────────────────────────────────────────────────────────────
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);

  // ── Hidden-courses prefs ──────────────────────────────────────────────────
  const [hiddenCourseIds, setHiddenCourseIds] = useState<string[]>([]);
  const [showManagePanel, setShowManagePanel] = useState(false);

  // ── Single-section flow ───────────────────────────────────────────────────
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseWork, setCourseWork] = useState<CourseWork[]>([]);
  const [courseWorkLoading, setCourseWorkLoading] = useState(false);
  const [courseWorkError, setCourseWorkError] = useState<string | null>(null);
  const [courseWorkLoaded, setCourseWorkLoaded] = useState(false);
  const [selectedCourseWorkId, setSelectedCourseWorkId] = useState<string | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [newTitle, setNewTitle] = useState(assignment.title);
  const [newMaxPoints, setNewMaxPoints] = useState(100);

  // ── Multi-section flow ────────────────────────────────────────────────────
  const [sectionRows, setSectionRows] = useState<SectionRow[]>([]);
  const [courseWorkMap, setCourseWorkMap] = useState<Map<string, CourseWork[]>>(new Map());
  // Track whether we're in add-section mode from the legacy linked view
  const [addingSectionLinks, setAddingSectionLinks] = useState(false);

  // ── Shared ────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkingSection, setUnlinkingSection] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  // Tracks component mount state for async callbacks that can't use useEffect cleanup directly
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isNewLinked = !!(assignment.classroomLinks && assignment.classroomLinks.length > 0);
  const isLegacyLinked = !isNewLinked && !!assignment.classroomLink;
  const isLinked = isNewLinked || isLegacyLinked;

  const detectedSections = getSectionsForClass(students, classType);
  const isMultiSection = detectedSections.length >= 2;

  const visibleCourses = courses.filter(c => !hiddenCourseIds.includes(c.id));

  // ── Auto-match helper ─────────────────────────────────────────────────────
  const autoMatchCourse = useCallback((portalSection: string, available: Course[]): string => {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const match = available.find(c => c.section && norm(c.section) === norm(portalSection));
    return match ? match.id : '';
  }, []);

  // ── Init section rows when sections + courses are known ───────────────────
  const buildSectionRows = useCallback((sections: string[], available: Course[]): SectionRow[] => {
    return sections.map(sec => {
      const matchedId = autoMatchCourse(sec, available);
      return {
        portalSection: sec,
        selectedCourseId: matchedId,
        selectedCourseWorkId: '',
        createNew: false,
        newTitle: assignment.title,
        newMaxPoints: 100,
        courseWorkLoaded: false,
        courseWorkLoading: false,
        courseWorkError: null,
        skip: false,
      };
    });
  }, [autoMatchCourse, assignment.title]);

  // ── Open handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Reset everything
    setAccessToken(null);
    setAuthError(null);
    setCourses([]);
    setCourseWork([]);
    setSelectedCourseId(null);
    setSelectedCourseWorkId(null);
    setCreateNew(false);
    setNewTitle(assignment.title);
    setNewMaxPoints(100);
    setCoursesError(null);
    setCourseWorkError(null);
    setCourseWorkLoaded(false);
    setGeneralError(null);
    setShowManagePanel(false);
    setHiddenCourseIds([]);
    setSectionRows([]);
    setCourseWorkMap(new Map());
    setAddingSectionLinks(false);

    // If already linked (new or legacy, not adding sections), don't auth immediately
    if (isLinked && !addingSectionLinks) return;

    let cancelled = false;
    const init = async () => {
      try {
        setAuthLoading(true);
        const [token, prefs] = await Promise.all([
          getClassroomAccessToken(),
          dataService.getClassroomPrefs(),
        ]);
        if (cancelled) return;
        setAccessToken(token);
        if (!cancelled) setHiddenCourseIds(prefs.hiddenCourseIds);
        fetchCoursesWithToken(token, prefs.hiddenCourseIds);
      } catch (err: any) {
        if (!cancelled) setAuthError(err.message || 'Failed to authorize with Google Classroom');
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const acquireToken = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const [token, prefs] = await Promise.all([
        getClassroomAccessToken(),
        dataService.getClassroomPrefs(),
      ]);
      if (!mountedRef.current) return;
      setAccessToken(token);
      setHiddenCourseIds(prefs.hiddenCourseIds);
      fetchCoursesWithToken(token, prefs.hiddenCourseIds);
    } catch (err: any) {
      if (mountedRef.current) setAuthError(err.message || 'Failed to authorize with Google Classroom');
    } finally {
      if (mountedRef.current) setAuthLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCoursesWithToken = async (token: string, hidden: string[]) => {
    setCoursesLoading(true);
    setCoursesError(null);
    try {
      const result = await callClassroomListCourses({ accessToken: token });
      const data = result.data as { courses: Course[] };
      const loaded = (data.courses || []).filter(c => c.id && c.name);
      setCourses(loaded);

      const visible = loaded.filter(c => !hidden.includes(c.id));

      if (isMultiSection) {
        const rows = buildSectionRows(detectedSections, visible);
        setSectionRows(rows);
        // Kick off courseWork loads for auto-matched rows
        rows.forEach(row => {
          if (row.selectedCourseId) {
            loadCourseWorkForRow(row.portalSection, row.selectedCourseId, token);
          }
        });
      } else {
        // Single-section: auto-select if only one visible course
        if (visible.length === 1) {
          setSelectedCourseId(visible[0].id);
          fetchCourseWork(visible[0].id, token);
        }
      }
    } catch (err: any) {
      setCoursesError(err.message || 'Failed to load courses');
    } finally {
      setCoursesLoading(false);
    }
  };

  // ── Single-section courseWork ─────────────────────────────────────────────
  const fetchCourseWork = useCallback(async (courseId: string, token: string) => {
    setCourseWorkLoading(true);
    setCourseWorkError(null);
    setCourseWork([]);
    setSelectedCourseWorkId(null);
    setCreateNew(false);
    setCourseWorkLoaded(false);
    try {
      const result = await callClassroomListCourseWork({ accessToken: token, courseId });
      const data = result.data as { courseWork: CourseWork[] };
      const items = (data.courseWork || []).filter(cw => cw.id);
      if (mountedRef.current) {
        setCourseWork(items);
        setCourseWorkLoaded(true);
        if (items.length === 0) setCreateNew(true);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setCourseWorkError(err.message || 'Failed to load assignments');
        setCourseWorkLoaded(true);
      }
    } finally {
      if (mountedRef.current) setCourseWorkLoading(false);
    }
  }, []);

  const handleCourseSelect = (courseId: string) => {
    setSelectedCourseId(courseId);
    if (accessToken) fetchCourseWork(courseId, accessToken);
  };

  // ── Multi-section courseWork ──────────────────────────────────────────────
  const loadCourseWorkForRow = useCallback(async (portalSection: string, courseId: string, token: string) => {
    // Mark row as loading
    setSectionRows(prev => prev.map(r =>
      r.portalSection === portalSection
        ? { ...r, courseWorkLoading: true, courseWorkError: null, courseWorkLoaded: false, selectedCourseWorkId: '', createNew: false }
        : r
    ));
    try {
      // Check cache first
      if (courseWorkMap.has(courseId)) {
        const cached = courseWorkMap.get(courseId)!;
        if (mountedRef.current) {
          setSectionRows(prev => prev.map(r =>
            r.portalSection === portalSection
              ? { ...r, courseWorkLoading: false, courseWorkLoaded: true, createNew: cached.length === 0 }
              : r
          ));
        }
        return;
      }
      const result = await callClassroomListCourseWork({ accessToken: token, courseId });
      const data = result.data as { courseWork: CourseWork[] };
      const items = (data.courseWork || []).filter(cw => cw.id);
      if (mountedRef.current) {
        setCourseWorkMap(prev => {
          const next = new Map(prev);
          next.set(courseId, items);
          return next;
        });
        setSectionRows(prev => prev.map(r =>
          r.portalSection === portalSection
            ? { ...r, courseWorkLoading: false, courseWorkLoaded: true, createNew: items.length === 0 }
            : r
        ));
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setSectionRows(prev => prev.map(r =>
          r.portalSection === portalSection
            ? { ...r, courseWorkLoading: false, courseWorkLoaded: true, courseWorkError: err.message || 'Failed to load' }
            : r
        ));
      }
    }
  }, [courseWorkMap]);

  const handleRowCourseSelect = (portalSection: string, courseId: string) => {
    setSectionRows(prev => prev.map(r =>
      r.portalSection === portalSection
        ? { ...r, selectedCourseId: courseId, selectedCourseWorkId: '', courseWorkLoaded: false, createNew: false }
        : r
    ));
    if (courseId && accessToken) {
      loadCourseWorkForRow(portalSection, courseId, accessToken);
    }
  };

  const updateRow = (portalSection: string, patch: Partial<SectionRow>) => {
    setSectionRows(prev => prev.map(r => r.portalSection === portalSection ? { ...r, ...patch } : r));
  };

  // ── Toggle hidden course ──────────────────────────────────────────────────
  const toggleHiddenCourse = async (courseId: string) => {
    const newHidden = hiddenCourseIds.includes(courseId)
      ? hiddenCourseIds.filter(id => id !== courseId)
      : [...hiddenCourseIds, courseId];
    setHiddenCourseIds(newHidden);
    await dataService.setHiddenClassroomCourses(newHidden);
  };

  // ── Single-section confirm ────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!accessToken || !selectedCourseId) return;
    const selectedCourse = courses.find(c => c.id === selectedCourseId);
    if (!selectedCourse) return;

    setSaving(true);
    setGeneralError(null);
    try {
      let courseWorkId: string;
      let courseWorkTitle: string;
      let maxPoints: number;

      if (createNew) {
        const result = await callClassroomCreateCourseWork({
          accessToken,
          courseId: selectedCourseId,
          title: newTitle,
          maxPoints: newMaxPoints,
        });
        const data = result.data as { courseWork: { id: string; title: string; maxPoints: number } };
        courseWorkId = data.courseWork.id;
        courseWorkTitle = data.courseWork.title;
        maxPoints = data.courseWork.maxPoints;
      } else {
        if (!selectedCourseWorkId) return;
        const selected = courseWork.find(cw => cw.id === selectedCourseWorkId);
        if (!selected) return;
        courseWorkId = selected.id;
        courseWorkTitle = selected.title;
        maxPoints = selected.maxPoints;
      }

      const entry: ClassroomLinkEntry = {
        courseId: selectedCourseId,
        courseName: selectedCourse.name,
        courseSection: selectedCourse.section,
        courseWorkId,
        courseWorkTitle,
        maxPoints,
        linkedAt: new Date().toISOString(),
        linkedBy: auth.currentUser?.email || 'unknown',
      };

      await dataService.updateAssignmentClassroomLinks(assignment.id, [entry]);
      onLinked([entry], accessToken ?? undefined);
      onClose();
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to link assignment');
    } finally {
      setSaving(false);
    }
  };

  // ── Multi-section confirm ─────────────────────────────────────────────────
  const handleLinkAll = async () => {
    if (!accessToken) return;
    setSaving(true);
    setGeneralError(null);
    try {
      const activeRows = sectionRows.filter(r => !r.skip);

      // Run all courseWork creates in parallel
      const entries: ClassroomLinkEntry[] = await Promise.all(
        activeRows.map(async row => {
          const course = courses.find(c => c.id === row.selectedCourseId);
          if (!course) throw new Error(`Course not found for ${row.portalSection}`);

          let courseWorkId: string;
          let courseWorkTitle: string;
          let maxPoints: number;

          if (row.createNew) {
            const result = await callClassroomCreateCourseWork({
              accessToken,
              courseId: row.selectedCourseId,
              title: row.newTitle,
              maxPoints: row.newMaxPoints,
            });
            const data = result.data as { courseWork: { id: string; title: string; maxPoints: number } };
            courseWorkId = data.courseWork.id;
            courseWorkTitle = data.courseWork.title;
            maxPoints = data.courseWork.maxPoints;
          } else {
            const items = courseWorkMap.get(row.selectedCourseId) || [];
            const selected = items.find(cw => cw.id === row.selectedCourseWorkId);
            if (!selected) throw new Error(`Assignment not selected for ${row.portalSection}`);
            courseWorkId = selected.id;
            courseWorkTitle = selected.title;
            maxPoints = selected.maxPoints;
          }

          return {
            courseId: row.selectedCourseId,
            courseName: course.name,
            courseSection: course.section,
            portalSection: row.portalSection,
            courseWorkId,
            courseWorkTitle,
            maxPoints,
            linkedAt: new Date().toISOString(),
            linkedBy: auth.currentUser?.email || 'unknown',
          } as ClassroomLinkEntry;
        })
      );

      await dataService.updateAssignmentClassroomLinks(assignment.id, entries);
      onLinked(entries, accessToken ?? undefined);
      onClose();
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to link assignments');
    } finally {
      setSaving(false);
    }
  };

  // ── Multi-section "can link all" ──────────────────────────────────────────
  const canLinkAll = !saving && sectionRows.every(row => {
    if (row.skip) return true;
    if (!row.selectedCourseId) return false;
    if (!row.courseWorkLoaded) return false;
    if (row.createNew) return row.newTitle.trim().length > 0;
    return !!row.selectedCourseWorkId;
  }) && sectionRows.some(r => !r.skip);

  // ── Unlink helpers ────────────────────────────────────────────────────────
  const handleUnlinkAll = async () => {
    setUnlinking(true);
    try {
      await dataService.updateAssignmentClassroomLinks(assignment.id, null);
      onUnlinked();
      onClose();
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to unlink assignment');
    } finally {
      setUnlinking(false);
    }
  };

  const handleUnlinkLegacy = async () => {
    setUnlinking(true);
    try {
      await dataService.updateAssignmentClassroomLink(assignment.id, null);
      onUnlinked();
      onClose();
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to unlink assignment');
    } finally {
      setUnlinking(false);
    }
  };

  // Use portalSection (not courseId) as the discriminator — two sections can share the same courseId
  const handleUnlinkSection = async (portalSection: string) => {
    if (!assignment.classroomLinks) return;
    setUnlinkingSection(portalSection);
    try {
      const remaining = assignment.classroomLinks.filter(l => l.portalSection !== portalSection);
      await dataService.updateAssignmentClassroomLinks(assignment.id, remaining.length > 0 ? remaining : null);
      if (remaining.length === 0) {
        onUnlinked();
        onClose();
      } else {
        onLinked(remaining, accessToken ?? undefined);
      }
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to unlink section');
    } finally {
      setUnlinkingSection(null);
    }
  };

  // ── Keyboard + focus trap ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const el = modalRef.current;
    if (el) el.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Single-section confirm gate ───────────────────────────────────────────
  const canConfirm = !saving && selectedCourseId && courseWorkLoaded
    && (createNew ? newTitle.trim().length > 0 : !!selectedCourseWorkId);

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderManagePanel = () => (
    <div className="mt-2 bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg p-3 space-y-2">
      <p className="text-xs text-[var(--text-muted)] mb-1">Toggle visibility in the dropdowns:</p>
      {courses.map(c => {
        const hidden = hiddenCourseIds.includes(c.id);
        return (
          <div key={c.id} className="flex items-center justify-between gap-2">
            <span className={`text-sm flex-1 ${hidden ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`}>
              {c.name}{c.section ? ` — ${c.section}` : ''}
            </span>
            <button
              onClick={() => toggleHiddenCourse(c.id)}
              className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition p-1 rounded"
              aria-label={hidden ? `Show ${c.name}` : `Hide ${c.name}`}
            >
              {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        );
      })}
    </div>
  );

  const renderCourseDropdown = (
    value: string,
    onChange: (id: string) => void,
    ariaLabel: string,
    compact = false
  ) => (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-3 ${compact ? 'py-1.5 text-xs' : 'py-2.5 text-sm'} text-[var(--text-primary)] appearance-none focus:outline-none focus:border-green-500/50 cursor-pointer`}
        aria-label={ariaLabel}
      >
        <option value="" disabled>Choose a course...</option>
        {visibleCourses.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}{c.section ? ` — ${c.section}` : ''}
          </option>
        ))}
      </select>
      <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 ${compact ? 'w-3 h-3' : 'w-4 h-4'} text-[var(--text-muted)] pointer-events-none`} />
    </div>
  );

  const renderCourseWorkSection = (
    row: SectionRow,
    items: CourseWork[]
  ) => {
    if (row.courseWorkLoading) {
      return (
        <div className="flex items-center gap-1.5 text-[var(--text-tertiary)] text-xs py-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading...
        </div>
      );
    }
    if (row.courseWorkError) {
      return <p className="text-xs text-red-600 dark:text-red-400">{row.courseWorkError}</p>;
    }
    if (!row.courseWorkLoaded) return null;

    return (
      <div className="space-y-1">
        {items.length > 0 && !row.createNew && (
          <div className="relative">
            <select
              value={row.selectedCourseWorkId}
              onChange={e => updateRow(row.portalSection, { selectedCourseWorkId: e.target.value })}
              className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] appearance-none focus:outline-none focus:border-green-500/50 cursor-pointer"
              aria-label={`Assignment for ${row.portalSection}`}
            >
              <option value="" disabled>Choose...</option>
              {items.map(cw => (
                <option key={cw.id} value={cw.id}>{cw.title} ({cw.maxPoints}pts)</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)] pointer-events-none" />
          </div>
        )}
        {!row.createNew ? (
          <button
            onClick={() => updateRow(row.portalSection, { createNew: true, selectedCourseWorkId: '' })}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-300 transition"
            aria-label={`Create new assignment for ${row.portalSection}`}
          >
            <Plus className="w-3 h-3" />
            Create new
          </button>
        ) : (
          <div className="space-y-1.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">New</span>
              {items.length > 0 && (
                <button
                  onClick={() => updateRow(row.portalSection, { createNew: false })}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
                  aria-label={`Use existing assignment for ${row.portalSection}`}
                >
                  Use existing
                </button>
              )}
            </div>
            <input
              type="text"
              value={row.newTitle}
              onChange={e => updateRow(row.portalSection, { newTitle: e.target.value })}
              className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-green-500/50"
              placeholder="Title"
              aria-label={`New assignment title for ${row.portalSection}`}
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">Pts:</label>
              <input
                type="number"
                min={1}
                value={row.newMaxPoints}
                onChange={e => updateRow(row.portalSection, { newMaxPoints: Math.max(1, Number(e.target.value) || 1) })}
                className="w-16 bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-green-500/50"
                aria-label={`Max points for ${row.portalSection}`}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop)] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Link to Google Classroom"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border)] shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Link className="w-5 h-5 text-green-600 dark:text-green-400" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {isLinked && !addingSectionLinks ? 'Google Classroom Link' : 'Link to Google Classroom'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition p-1 rounded-lg hover:bg-[var(--surface-glass-heavy)]"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ── NEW FORMAT: already linked (classroomLinks array) ─────────── */}
          {isNewLinked && !addingSectionLinks && assignment.classroomLinks && (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium mb-2">
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                  Linked Sections
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
                      <th className="text-left pb-2 font-semibold">Section</th>
                      <th className="text-left pb-2 font-semibold">Course</th>
                      <th className="text-left pb-2 font-semibold">Assignment</th>
                      <th className="text-right pb-2 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {assignment.classroomLinks.map(link => {
                      const rowKey = link.portalSection || link.courseId;
                      return (
                        <tr key={rowKey} className="text-[var(--text-secondary)]">
                          <td className="py-2 pr-3 font-medium text-[var(--text-primary)]">
                            {link.portalSection || link.courseSection || '—'}
                          </td>
                          <td className="py-2 pr-3">{link.courseName}</td>
                          <td className="py-2 pr-3">{link.courseWorkTitle}</td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => handleUnlinkSection(link.portalSection || link.courseId)}
                              disabled={unlinkingSection === (link.portalSection || link.courseId)}
                              className="text-xs text-red-600 dark:text-red-400 hover:text-red-300 transition disabled:opacity-50"
                              aria-label={`Unlink ${link.portalSection || link.courseName}`}
                            >
                              {unlinkingSection === (link.portalSection || link.courseId)
                                ? <Loader2 className="w-3 h-3 animate-spin inline" />
                                : 'Unlink'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {generalError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
                  {generalError}
                </div>
              )}
              <button
                onClick={handleUnlinkAll}
                disabled={unlinking}
                className="w-full flex items-center justify-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg px-4 py-2.5 transition bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50"
                aria-label="Unlink all sections from Classroom"
              >
                {unlinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                {unlinking ? 'Unlinking...' : 'Unlink All'}
              </button>
            </div>
          )}

          {/* ── LEGACY FORMAT: already linked (classroomLink single) ───────── */}
          {isLegacyLinked && !addingSectionLinks && assignment.classroomLink && (() => {
            const legacyLink: ClassroomLink = assignment.classroomLink!;
            return (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                  Currently Linked
                </div>
                <div className="text-sm text-[var(--text-secondary)]">
                  <div><span className="text-[var(--text-muted)]">Course:</span> {legacyLink.courseName}</div>
                  <div><span className="text-[var(--text-muted)]">Assignment:</span> {legacyLink.courseWorkTitle}</div>
                  <div><span className="text-[var(--text-muted)]">Max Points:</span> {legacyLink.maxPoints}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">
                    Linked {new Date(legacyLink.linkedAt).toLocaleDateString()} by {legacyLink.linkedBy}
                  </div>
                </div>
              </div>
              {generalError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
                  {generalError}
                </div>
              )}
              <button
                onClick={() => { setAddingSectionLinks(true); acquireToken(); }}
                className="w-full flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400 hover:text-green-300 border border-green-500/20 hover:border-green-500/40 rounded-lg px-4 py-2.5 transition bg-green-500/10 hover:bg-green-500/20"
                aria-label="Add section links to Google Classroom"
              >
                <Plus className="w-4 h-4" />
                Add section links
              </button>
              <button
                onClick={handleUnlinkLegacy}
                disabled={unlinking}
                className="w-full flex items-center justify-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg px-4 py-2.5 transition bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50"
                aria-label="Unlink from Google Classroom"
              >
                {unlinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                {unlinking ? 'Unlinking...' : 'Unlink from Classroom'}
              </button>
            </div>
            );
          })()}

          {/* ── AUTH STEP (not yet linked or adding sections) ─────────────── */}
          {(!isLinked || addingSectionLinks) && !accessToken && (
            <div className="space-y-3">
              {authLoading && (
                <div className="flex items-center justify-center gap-2 py-8 text-[var(--text-tertiary)]">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Authorizing with Google Classroom...</span>
                </div>
              )}
              {authError && (
                <div className="space-y-3">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-600 dark:text-red-400">
                    {authError}
                  </div>
                  <button
                    onClick={acquireToken}
                    className="w-full flex items-center justify-center gap-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2.5 transition"
                    aria-label="Retry Classroom authorization"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Retry Authorization
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── LINKED FLOW: courses loaded ───────────────────────────────── */}
          {(!isLinked || addingSectionLinks) && accessToken && (
            <div className="space-y-4">

              {/* ── MULTI-SECTION TABLE ─────────────────────────────────── */}
              {isMultiSection ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-bold mb-2">
                      Map Sections to Classroom Courses
                    </p>
                    {coursesLoading ? (
                      <div className="flex items-center gap-2 py-3 text-[var(--text-tertiary)] text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading courses...
                      </div>
                    ) : coursesError ? (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
                        {coursesError}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
                              <th className="text-left pb-2 pr-3 font-semibold w-24">Section</th>
                              <th className="text-left pb-2 pr-3 font-semibold">Classroom Course</th>
                              <th className="text-left pb-2 pr-3 font-semibold">Assignment</th>
                              <th className="text-center pb-2 font-semibold w-16">Skip</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {sectionRows.map(row => {
                              const cwItems = courseWorkMap.get(row.selectedCourseId) || [];
                              return (
                                <tr key={row.portalSection} className={row.skip ? 'opacity-40' : ''}>
                                  <td className="py-3 pr-3 font-medium text-[var(--text-primary)] whitespace-nowrap">
                                    {row.portalSection}
                                  </td>
                                  <td className="py-3 pr-3 min-w-[180px]">
                                    {renderCourseDropdown(
                                      row.selectedCourseId,
                                      (id) => handleRowCourseSelect(row.portalSection, id),
                                      `Course for ${row.portalSection}`,
                                      true
                                    )}
                                  </td>
                                  <td className="py-3 pr-3 min-w-[200px]">
                                    {row.selectedCourseId
                                      ? renderCourseWorkSection(row, cwItems)
                                      : <span className="text-xs text-[var(--text-muted)]">Select a course first</span>
                                    }
                                  </td>
                                  <td className="py-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={row.skip}
                                      onChange={e => updateRow(row.portalSection, { skip: e.target.checked })}
                                      className="accent-green-500 w-4 h-4 cursor-pointer"
                                      aria-label={`Skip linking ${row.portalSection}`}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Manage hidden courses */}
                  {courses.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowManagePanel(p => !p)}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline transition"
                        aria-label="Manage hidden courses"
                      >
                        Manage hidden courses
                      </button>
                      {showManagePanel && renderManagePanel()}
                    </div>
                  )}

                  {/* General error */}
                  {generalError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
                      {generalError}
                    </div>
                  )}

                  {/* Link All button */}
                  {sectionRows.length > 0 && (
                    <button
                      onClick={handleLinkAll}
                      disabled={!canLinkAll}
                      className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Link all sections to Google Classroom"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Linking All Sections...
                        </>
                      ) : (
                        <>
                          <Link className="w-4 h-4" />
                          Link All Sections
                        </>
                      )}
                    </button>
                  )}
                </div>

              ) : (
                /* ── SINGLE-SECTION FLOW ─────────────────────────────────── */
                <div className="space-y-4">
                  {/* Step 1: Select course */}
                  <div>
                    <label className="block text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-bold mb-1.5">
                      1. Select Course
                    </label>
                    {coursesLoading ? (
                      <div className="flex items-center gap-2 py-3 text-[var(--text-tertiary)] text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading courses...
                      </div>
                    ) : coursesError ? (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
                        {coursesError}
                      </div>
                    ) : visibleCourses.length === 0 ? (
                      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-600 dark:text-yellow-400">
                        No active courses found. {courses.length > 0 ? 'All courses are hidden — use Manage to restore them.' : 'No active courses in your Google Classroom account.'}
                      </div>
                    ) : (
                      renderCourseDropdown(
                        selectedCourseId || '',
                        handleCourseSelect,
                        'Select a Google Classroom course'
                      )
                    )}

                    {/* Manage hidden courses */}
                    {courses.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() => setShowManagePanel(p => !p)}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline transition"
                          aria-label="Manage hidden courses"
                        >
                          Manage hidden courses
                        </button>
                        {showManagePanel && renderManagePanel()}
                      </div>
                    )}
                  </div>

                  {/* Step 2: Select or create coursework */}
                  {selectedCourseId && (
                    <div>
                      <label className="block text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-bold mb-1.5">
                        2. Select or Create Assignment
                      </label>
                      {courseWorkLoading ? (
                        <div className="flex items-center gap-2 py-3 text-[var(--text-tertiary)] text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading Classroom assignments...
                        </div>
                      ) : courseWorkError ? (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
                          {courseWorkError}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {courseWork.length > 0 && !createNew && (
                            <div className="relative">
                              <select
                                value={selectedCourseWorkId || ''}
                                onChange={e => setSelectedCourseWorkId(e.target.value)}
                                className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] appearance-none focus:outline-none focus:border-green-500/50 cursor-pointer"
                                aria-label="Select existing Classroom assignment"
                              >
                                <option value="" disabled>Choose an assignment...</option>
                                {courseWork.map(cw => (
                                  <option key={cw.id} value={cw.id}>
                                    {cw.title} ({cw.maxPoints} pts)
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                            </div>
                          )}
                          {!createNew ? (
                            <button
                              onClick={() => { setCreateNew(true); setSelectedCourseWorkId(null); }}
                              className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 hover:text-green-300 transition"
                              aria-label="Create new Classroom assignment"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Create new assignment in Classroom
                            </button>
                          ) : (
                            <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-green-600 dark:text-green-400 font-medium">New Assignment</span>
                                {courseWork.length > 0 && (
                                  <button
                                    onClick={() => setCreateNew(false)}
                                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
                                    aria-label="Use existing Classroom assignment instead"
                                  >
                                    Use existing instead
                                  </button>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs text-[var(--text-muted)] mb-1">Title</label>
                                <input
                                  type="text"
                                  value={newTitle}
                                  onChange={e => setNewTitle(e.target.value)}
                                  className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-green-500/50"
                                  aria-label="New assignment title"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-[var(--text-muted)] mb-1">Max Points</label>
                                <input
                                  type="number"
                                  min={1}
                                  value={newMaxPoints}
                                  onChange={e => setNewMaxPoints(Math.max(1, Number(e.target.value) || 1))}
                                  className="w-24 bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-green-500/50"
                                  aria-label="Max points"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error display */}
                  {generalError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
                      {generalError}
                    </div>
                  )}

                  {/* Step 3: Confirm */}
                  {selectedCourseId && courseWorkLoaded && (
                    <button
                      onClick={handleConfirm}
                      disabled={!canConfirm}
                      className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Confirm link to Google Classroom"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {createNew ? 'Creating & Linking...' : 'Linking...'}
                        </>
                      ) : (
                        <>
                          <Link className="w-4 h-4" />
                          {createNew ? 'Create & Link Assignment' : 'Link Assignment'}
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassroomLinkModal;
