
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ExternalLink, Link, Unlink, Loader2, ChevronDown, Plus, X } from 'lucide-react';
import { Assignment, ClassroomLink } from '../types';
import { callClassroomListCourses, callClassroomListCourseWork, callClassroomCreateCourseWork } from '../lib/firebase';
import { getClassroomAccessToken } from '../lib/classroomAuth';
import { dataService } from '../services/dataService';
import { auth } from '../lib/firebase';

interface ClassroomLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment;
  onLinked: (link: ClassroomLink) => void;
  onUnlinked: () => void;
}

interface Course {
  id: string;
  name: string;
}

interface CourseWork {
  id: string;
  title: string;
  maxPoints: number;
}

const ClassroomLinkModal: React.FC<ClassroomLinkModalProps> = ({
  isOpen,
  onClose,
  assignment,
  onLinked,
  onUnlinked,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseWork, setCourseWork] = useState<CourseWork[]>([]);
  const [courseWorkLoading, setCourseWorkLoading] = useState(false);
  const [courseWorkError, setCourseWorkError] = useState<string | null>(null);
  const [courseWorkLoaded, setCourseWorkLoaded] = useState(false);

  const [selectedCourseWorkId, setSelectedCourseWorkId] = useState<string | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [newTitle, setNewTitle] = useState(assignment.title);
  const [newMaxPoints, setNewMaxPoints] = useState(100);

  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  // Acquire access token on open
  useEffect(() => {
    if (!isOpen) return;
    // Reset state
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

    // If already linked, don't need to auth immediately
    if (assignment.classroomLink) return;

    acquireToken();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const acquireToken = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const token = await getClassroomAccessToken();
      setAccessToken(token);
      // Fetch courses immediately
      fetchCourses(token);
    } catch (err: any) {
      setAuthError(err.message || 'Failed to authorize with Google Classroom');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const fetchCourses = useCallback(async (token: string) => {
    setCoursesLoading(true);
    setCoursesError(null);
    try {
      const result = await callClassroomListCourses({ accessToken: token });
      const data = result.data as { courses: Course[] };
      const loadedCourses = (data.courses || []).filter(c => c.id);
      setCourses(loadedCourses);
      // Auto-select if only one course
      if (loadedCourses.length === 1) {
        setSelectedCourseId(loadedCourses[0].id);
        fetchCourseWork(loadedCourses[0].id, token);
      }
    } catch (err: any) {
      setCoursesError(err.message || 'Failed to load courses');
    } finally {
      setCoursesLoading(false);
    }
  }, []);

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
      setCourseWork(items);
      setCourseWorkLoaded(true);
      // If no existing coursework, default to create-new mode
      if (items.length === 0) {
        setCreateNew(true);
      }
    } catch (err: any) {
      setCourseWorkError(err.message || 'Failed to load assignments');
      setCourseWorkLoaded(true);
    } finally {
      setCourseWorkLoading(false);
    }
  }, []);

  const handleCourseSelect = (courseId: string) => {
    setSelectedCourseId(courseId);
    if (accessToken) {
      fetchCourseWork(courseId, accessToken);
    }
  };

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
        // Create new coursework via Cloud Function
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

      const link: ClassroomLink = {
        courseId: selectedCourseId,
        courseName: selectedCourse.name,
        courseWorkId,
        courseWorkTitle,
        maxPoints,
        linkedAt: new Date().toISOString(),
        linkedBy: auth.currentUser?.email || 'unknown',
      };

      await dataService.updateAssignmentClassroomLink(assignment.id, link);
      onLinked(link);
      onClose();
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to link assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
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

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Trap focus inside modal
  useEffect(() => {
    if (!isOpen) return;
    const el = modalRef.current;
    if (el) el.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const isLinked = !!assignment.classroomLink;

  const canConfirm = !saving && selectedCourseId && courseWorkLoaded && (createNew ? newTitle.trim().length > 0 : !!selectedCourseWorkId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Link to Google Classroom"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-gray-800 rounded-xl border border-white/10 shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Link className="w-5 h-5 text-green-400" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-white">
              {isLinked ? 'Google Classroom Link' : 'Link to Google Classroom'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition p-1 rounded-lg hover:bg-white/10"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Already linked view */}
          {isLinked && assignment.classroomLink && (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                  Currently Linked
                </div>
                <div className="text-sm text-gray-300">
                  <div><span className="text-gray-500">Course:</span> {assignment.classroomLink.courseName}</div>
                  <div><span className="text-gray-500">Assignment:</span> {assignment.classroomLink.courseWorkTitle}</div>
                  <div><span className="text-gray-500">Max Points:</span> {assignment.classroomLink.maxPoints}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Linked {new Date(assignment.classroomLink.linkedAt).toLocaleDateString()} by {assignment.classroomLink.linkedBy}
                  </div>
                </div>
              </div>
              <button
                onClick={handleUnlink}
                disabled={unlinking}
                className="w-full flex items-center justify-center gap-2 text-sm text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg px-4 py-2.5 transition bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50"
              >
                {unlinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                {unlinking ? 'Unlinking...' : 'Unlink from Classroom'}
              </button>
            </div>
          )}

          {/* Auth step */}
          {!isLinked && !accessToken && (
            <div className="space-y-3">
              {authLoading && (
                <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Authorizing with Google Classroom...</span>
                </div>
              )}
              {authError && (
                <div className="space-y-3">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400">
                    {authError}
                  </div>
                  <button
                    onClick={acquireToken}
                    className="w-full flex items-center justify-center gap-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2.5 transition"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Retry Authorization
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Course selection + CourseWork selection */}
          {!isLinked && accessToken && (
            <div className="space-y-4">
              {/* Step 1: Select course */}
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider font-bold mb-1.5">
                  1. Select Course
                </label>
                {coursesLoading ? (
                  <div className="flex items-center gap-2 py-3 text-gray-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading courses...
                  </div>
                ) : coursesError ? (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
                    {coursesError}
                  </div>
                ) : courses.length === 0 ? (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-400">
                    No active courses found in your Google Classroom account.
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedCourseId || ''}
                      onChange={e => handleCourseSelect(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white appearance-none focus:outline-none focus:border-green-500/50 cursor-pointer"
                      aria-label="Select a Google Classroom course"
                    >
                      {courses.length > 1 && (
                        <option value="" disabled>Choose a course...</option>
                      )}
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Step 2: Select or create coursework */}
              {selectedCourseId && (
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wider font-bold mb-1.5">
                    2. Select or Create Assignment
                  </label>
                  {courseWorkLoading ? (
                    <div className="flex items-center gap-2 py-3 text-gray-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading Classroom assignments...
                    </div>
                  ) : courseWorkError ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
                      {courseWorkError}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {courseWork.length > 0 && !createNew && (
                        <div className="relative">
                          <select
                            value={selectedCourseWorkId || ''}
                            onChange={e => setSelectedCourseWorkId(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white appearance-none focus:outline-none focus:border-green-500/50 cursor-pointer"
                            aria-label="Select existing Classroom assignment"
                          >
                            <option value="" disabled>Choose an assignment...</option>
                            {courseWork.map(cw => (
                              <option key={cw.id} value={cw.id}>
                                {cw.title} ({cw.maxPoints} pts)
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                        </div>
                      )}

                      {!createNew ? (
                        <button
                          onClick={() => { setCreateNew(true); setSelectedCourseWorkId(null); }}
                          className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Create new assignment in Classroom
                        </button>
                      ) : (
                        <div className="bg-black/20 border border-white/5 rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-green-400 font-medium">New Assignment</span>
                            {courseWork.length > 0 && (
                              <button
                                onClick={() => { setCreateNew(false); }}
                                className="text-xs text-gray-500 hover:text-gray-300 transition"
                              >
                                Use existing instead
                              </button>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Title</label>
                            <input
                              type="text"
                              value={newTitle}
                              onChange={e => setNewTitle(e.target.value)}
                              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50"
                              aria-label="New assignment title"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Max Points</label>
                            <input
                              type="number"
                              min={1}
                              value={newMaxPoints}
                              onChange={e => setNewMaxPoints(Math.max(1, Number(e.target.value) || 1))}
                              className="w-24 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50"
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
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
                  {generalError}
                </div>
              )}

              {/* Step 3: Confirm — only show when Step 2 is ready */}
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
      </div>
    </div>
  );
};

export default ClassroomLinkModal;
