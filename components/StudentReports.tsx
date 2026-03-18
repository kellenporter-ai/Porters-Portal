import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, Submission, Assignment, StudentBucketProfile, StudentAlert, UserRole } from '../types';
import { dataService } from '../services/dataService';
import { Search, FileBarChart, UserCircle } from 'lucide-react';
import ReportHeader from './reports/ReportHeader';
import OverallStanding from './reports/OverallStanding';
import EngagementSummary from './reports/EngagementSummary';
import AcademicPerformance from './reports/AcademicPerformance';
import BehavioralIndicators from './reports/BehavioralIndicators';
import StrengthsConcerns from './reports/StrengthsConcerns';
import ReportActions from './reports/ReportActions';

interface StudentReportsProps {
  users: User[];
  assignments: Assignment[];
  submissions: Submission[];
}

const StudentReports: React.FC<StudentReportsProps> = ({ users, assignments }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [daysRange, setDaysRange] = useState(30);

  // Per-student subscriptions
  const [studentSubmissions, setStudentSubmissions] = useState<Submission[]>([]);
  const [bucketProfiles, setBucketProfiles] = useState<StudentBucketProfile[]>([]);
  const [alerts, setAlerts] = useState<StudentAlert[]>([]);

  // URL query param sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const studentParam = params.get('student');
    if (studentParam && users.some(u => u.id === studentParam)) {
      setSelectedStudentId(studentParam);
    }
  }, [users]);

  // Update URL when student changes
  useEffect(() => {
    if (selectedStudentId) {
      const url = new URL(window.location.href);
      url.searchParams.set('student', selectedStudentId);
      window.history.replaceState({}, '', url.toString());
    }
  }, [selectedStudentId]);

  // Subscribe to per-student submissions
  useEffect(() => {
    if (!selectedStudentId) { setStudentSubmissions([]); return; }
    const unsub = dataService.subscribeToUserSubmissions(selectedStudentId, setStudentSubmissions, 200);
    return () => unsub();
  }, [selectedStudentId]);

  // Subscribe to bucket profiles (class-wide, filter client-side)
  useEffect(() => {
    const unsub = dataService.subscribeToStudentBuckets((all: StudentBucketProfile[]) => setBucketProfiles(all));
    return () => unsub();
  }, []);

  // Subscribe to alerts (class-wide, filter client-side)
  useEffect(() => {
    const unsub = dataService.subscribeToStudentAlerts((all: StudentAlert[]) => setAlerts(all));
    return () => unsub();
  }, []);

  // Filtered data for selected student
  const students = useMemo(() => users.filter(u => u.role === UserRole.STUDENT), [users]);
  const selectedStudent = useMemo(() => students.find(u => u.id === selectedStudentId) || null, [students, selectedStudentId]);
  const studentBuckets = useMemo(() => bucketProfiles.filter(b => b.studentId === selectedStudentId), [bucketProfiles, selectedStudentId]);
  const studentAlerts = useMemo(() => alerts.filter(a => a.studentId === selectedStudentId && !a.isDismissed), [alerts, selectedStudentId]);
  const primaryBucket = studentBuckets.length > 0 ? studentBuckets[0] : null;

  // Filter submissions by date range
  const filteredSubmissions = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysRange);
    const cutoffStr = cutoff.toISOString();
    return studentSubmissions
      .filter(s => !s.submittedAt || s.submittedAt >= cutoffStr)
      .sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
  }, [studentSubmissions, daysRange]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return students.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return students
      .filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 20);
  }, [students, searchQuery]);

  const handleSelectStudent = useCallback((id: string) => {
    setSelectedStudentId(id);
    setShowDropdown(false);
    setSearchQuery('');
  }, []);

  const enrolledClasses = selectedStudent?.enrolledClasses || (selectedStudent?.classType ? [selectedStudent.classType] : []);

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
      {/* Page title + student picker */}
      <div className="mb-8 print:mb-4">
        <div className="flex items-center gap-3 mb-4 print:hidden">
          <FileBarChart className="w-6 h-6 text-purple-400" />
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Student Reports</h1>
        </div>

        {/* Print header */}
        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-bold text-black">Student Progress Report</h1>
          <p className="text-sm text-gray-600">Porter's Portal — Generated {new Date().toLocaleDateString()}</p>
        </div>

        {/* Student picker */}
        <div className="relative print:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery || (selectedStudent ? selectedStudent.name : '')}
              onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search for a student by name or email..."
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition text-sm"
            />
          </div>

          {showDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
              <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl shadow-2xl max-h-72 overflow-y-auto custom-scrollbar">
                {searchResults.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-600 text-xs">No students found</div>
                ) : (
                  searchResults.map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleSelectStudent(u.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition text-left ${
                        u.id === selectedStudentId ? 'bg-purple-500/10 border-l-2 border-purple-500' : ''
                      }`}
                    >
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-sm font-bold text-purple-300">
                          {u.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white font-medium truncate">{u.name}</div>
                        <div className="text-[10px] text-gray-500 truncate">{u.email} · {u.section || 'No section'}</div>
                      </div>
                      <div className="text-[10px] text-gray-600 shrink-0">Lv.{u.gamification?.level || 1}</div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Report content */}
      {selectedStudent ? (
        <div className="space-y-8 print:space-y-6" id="student-report">
          {/* Actions bar */}
          <ReportActions
            student={selectedStudent}
            submissions={filteredSubmissions}
            assignments={assignments}
            bucket={primaryBucket}
            alerts={studentAlerts}
            daysRange={daysRange}
            onDaysRangeChange={setDaysRange}
          />

          {/* Report sections */}
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 print:border-gray-300 print:bg-white print:rounded-none print:shadow-none">
            <ReportHeader student={selectedStudent} />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 print:border-gray-300 print:bg-white print:rounded-none">
            <OverallStanding student={selectedStudent} bucket={primaryBucket} alerts={studentAlerts} />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 print:border-gray-300 print:bg-white print:rounded-none">
            <EngagementSummary submissions={filteredSubmissions} bucket={primaryBucket} daysRange={daysRange} />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 print:border-gray-300 print:bg-white print:rounded-none print:break-before-page">
            <AcademicPerformance submissions={filteredSubmissions} assignments={assignments} enrolledClasses={enrolledClasses} />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 print:border-gray-300 print:bg-white print:rounded-none">
            <BehavioralIndicators submissions={filteredSubmissions} bucket={primaryBucket} />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 print:border-gray-300 print:bg-white print:rounded-none">
            <StrengthsConcerns submissions={filteredSubmissions} bucket={primaryBucket} alerts={studentAlerts} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center print:hidden">
          <UserCircle className="w-16 h-16 text-gray-700 mb-4" />
          <h2 className="text-lg font-bold text-gray-400 mb-2">Select a Student</h2>
          <p className="text-sm text-gray-600 max-w-md">
            Search for a student above to generate their academic progress report. Reports include engagement data, assessment scores, behavioral metrics, and identified strengths and concerns.
          </p>
        </div>
      )}
    </div>
  );
};

export default StudentReports;
