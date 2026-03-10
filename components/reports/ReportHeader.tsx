import React from 'react';
import { User } from '../../types';
import { getRankDetails } from '../../lib/gamification';
import { Mail, Calendar, Clock, Users } from 'lucide-react';

interface ReportHeaderProps {
  student: User;
}

const ReportHeader: React.FC<ReportHeaderProps> = ({ student }) => {
  const level = student.gamification?.level || 1;
  const rankDetails = getRankDetails(level);
  const enrolledClasses = student.enrolledClasses || (student.classType ? [student.classType] : []);

  return (
    <div className="flex items-start gap-5 print:gap-4">
      <div className={`w-16 h-16 rounded-2xl p-0.5 bg-gradient-to-tr from-white/10 to-white/5 ${rankDetails.tierGlow} shadow-xl shrink-0 print:shadow-none`}>
        {student.avatarUrl ? (
          <img src={student.avatarUrl} alt={student.name} loading="lazy" className={`w-full h-full rounded-2xl border-2 object-cover ${rankDetails.tierColor.split(' ')[0]}`} />
        ) : (
          <div className={`w-full h-full rounded-2xl border-2 ${rankDetails.tierColor.split(' ')[0]} bg-purple-500/20 flex items-center justify-center text-xl font-bold text-white print:text-black`}>
            {student.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-2xl font-bold text-white print:text-black">{student.name}</h2>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs font-mono uppercase font-bold tracking-widest ${rankDetails.tierColor.split(' ')[1]} print:text-gray-600`}>
            {rankDetails.rankName}
          </span>
          <span className="text-xs text-gray-500">· Lv.{level}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-400 print:text-gray-600">
          <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{student.email}</span>
          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />Section: {student.section || 'Unassigned'}</span>
          {enrolledClasses.length > 0 && (
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{enrolledClasses.join(', ')}</span>
          )}
          {student.lastLoginAt && (
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Last login: {new Date(student.lastLoginAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportHeader;
