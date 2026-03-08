
import React, { useState, useEffect, useCallback } from 'react';
import { Assignment, ClassroomLink } from '../types';
import { ClassroomCourse, ClassroomCourseWork, fetchCourses, fetchCourseWork } from '../lib/classroomApi';
import { dataService } from '../services/dataService';

interface ClassroomLinkPanelProps {
  assignment: Assignment;
  classroomToken: string | null;
  linkedByName: string;
  onRequestToken: () => void;
  onLinkUpdated: (link: ClassroomLink | null) => void;
}

const ClassroomLinkPanel: React.FC<ClassroomLinkPanelProps> = ({
  assignment,
  classroomToken,
  linkedByName,
  onRequestToken,
  onLinkUpdated,
}) => {
  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [courseWork, setCourseWork] = useState<ClassroomCourseWork[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedCourseWorkId, setSelectedCourseWorkId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch courses when token becomes available
  useEffect(() => {
    if (!classroomToken || assignment.classroomLink) return;
    setIsLoading(true);
    setError(null);
    fetchCourses(classroomToken)
      .then(setCourses)
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [classroomToken, assignment.classroomLink]);

  // Fetch coursework when a course is selected
  const handleCourseChange = useCallback(async (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedCourseWorkId('');
    setCourseWork([]);
    if (!courseId || !classroomToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const items = await fetchCourseWork(classroomToken, courseId);
      setCourseWork(items.filter(cw => cw.maxPoints > 0));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [classroomToken]);

  // Link assignment
  const handleLink = useCallback(async () => {
    if (!selectedCourseId || !selectedCourseWorkId) return;
    const course = courses.find(c => c.id === selectedCourseId);
    const cw = courseWork.find(c => c.id === selectedCourseWorkId);
    if (!course || !cw) return;

    setIsLoading(true);
    setError(null);
    try {
      const link: ClassroomLink = {
        courseId: course.id,
        courseName: course.name,
        courseWorkId: cw.id,
        courseWorkTitle: cw.title,
        maxPoints: cw.maxPoints,
        linkedAt: new Date().toISOString(),
        linkedBy: linkedByName,
      };
      await dataService.updateAssignmentClassroomLink(assignment.id, link);
      onLinkUpdated(link);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [selectedCourseId, selectedCourseWorkId, courses, courseWork, assignment.id, onLinkUpdated]);

  // Unlink assignment
  const handleUnlink = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await dataService.updateAssignmentClassroomLink(assignment.id, null);
      onLinkUpdated(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [assignment.id, onLinkUpdated]);

  // --- No token: show connect button ---
  if (!classroomToken) {
    return (
      <div className="mt-3">
        <button
          onClick={onRequestToken}
          className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition bg-white/5 hover:bg-white/10"
        >
          Link to Google Classroom
        </button>
      </div>
    );
  }

  // --- Linked state ---
  if (assignment.classroomLink) {
    const link = assignment.classroomLink;
    return (
      <div className="mt-3 bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            <span className="text-xs text-gray-300">
              <span className="font-medium text-white">{link.courseName}</span>
              {' — '}
              {link.courseWorkTitle}
              <span className="text-gray-500 ml-1">({link.maxPoints} pts)</span>
            </span>
          </div>
          <button
            onClick={handleUnlink}
            disabled={isLoading}
            className="text-xs text-red-400 hover:text-red-300 transition disabled:opacity-50"
          >
            Unlink
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  // --- Linking flow: course → coursework → link ---
  return (
    <div className="mt-3 bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Link to Google Classroom</p>

      {/* Course picker */}
      <select
        value={selectedCourseId}
        onChange={e => handleCourseChange(e.target.value)}
        disabled={isLoading || courses.length === 0}
        aria-label="Select a Google Classroom course"
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50 transition disabled:opacity-50"
      >
        <option value="">{courses.length === 0 ? 'Loading courses...' : 'Select a course'}</option>
        {courses.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}{c.section ? ` — ${c.section}` : ''}
          </option>
        ))}
      </select>

      {/* Coursework picker */}
      {selectedCourseId && (
        <select
          value={selectedCourseWorkId}
          onChange={e => setSelectedCourseWorkId(e.target.value)}
          disabled={isLoading || courseWork.length === 0}
          aria-label="Select a coursework assignment"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50 transition disabled:opacity-50"
        >
          <option value="">{courseWork.length === 0 && isLoading ? 'Loading assignments...' : 'Select an assignment'}</option>
          {courseWork.map(cw => (
            <option key={cw.id} value={cw.id}>
              {cw.title} ({cw.maxPoints} pts)
            </option>
          ))}
        </select>
      )}

      {/* Link button */}
      {selectedCourseWorkId && (
        <button
          onClick={handleLink}
          disabled={isLoading}
          className="text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
        >
          {isLoading ? 'Linking...' : 'Link Assignment'}
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
};

export default ClassroomLinkPanel;
