import React from 'react';
import { useParams } from 'react-router-dom';
import { FeatureErrorBoundary } from '../ErrorBoundary';
import type { User, Assignment, Submission } from '../../types';
import AssessmentListPage from './AssessmentListPage';
import AssessmentGradingView from './AssessmentGradingView';

interface GradingPageProps {
  users: User[];
  assignments: Assignment[];
  submissions: Submission[];
}

const GradingPage: React.FC<GradingPageProps> = ({ users, assignments, submissions }) => {
  const { assessmentId } = useParams<{ assessmentId?: string }>();

  const assessmentAssignments = assignments.filter(a => a.isAssessment);

  return (
    <FeatureErrorBoundary feature="Grading">
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col min-h-0">
        {!assessmentId ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Grading</h1>
              <p className="text-[var(--text-tertiary)]">Assessment review and rubric grading.</p>
            </div>
            <AssessmentListPage
              assessmentAssignments={assessmentAssignments}
              submissions={submissions}
            />
          </div>
        ) : (
          <AssessmentGradingView
            users={users}
            assignments={assignments}
            submissions={submissions}
          />
        )}
      </div>
    </FeatureErrorBoundary>
  );
};

export default GradingPage;
