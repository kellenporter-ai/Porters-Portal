import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Submission, User, BugReport } from '../types';
import { Clock, Bug, Clipboard, CheckCircle, Sparkles, Wrench, Lightbulb, BookOpen, Pencil, X as XIcon, Check, Trash2, TrendingUp, Users, BarChart3, Activity, FileJson, Code, Swords, GraduationCap, FlaskConical } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';

/** Sort unit keys according to a unitOrder array. Unordered units go last alphabetically. */
export function sortUnitKeys(unitNames: string[], unitOrder?: string[]): string[] {
  if (!unitOrder || unitOrder.length === 0) return [...unitNames].sort();
  const orderMap = new Map(unitOrder.map((u, i) => [u, i]));
  return [...unitNames].sort((a, b) => {
    const aIdx = orderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bIdx = orderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aIdx === bIdx) return a.localeCompare(b);
    return aIdx - bIdx;
  });
}

interface AdminPanelProps {
  assignments: never[];
  submissions: Submission[];
  classConfigs: never[];
  users: User[];
  onCreateAssignment: never;
  onDeleteAssignment?: never;
  onPreviewAssignment?: never;
  availableSections?: string[];
  onNavigate?: (tab: string) => void;
}

const CATEGORY_BADGES: Record<string, { label: string; color: string }> = {
  bug: { label: 'Bug', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  feature: { label: 'Feature', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  other: { label: 'Other', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

type MainTab = 'ACTIVITY' | 'BUGS' | 'AI';
type AIMode = 'fix' | 'create_blocks' | 'create_html' | 'create_qbank' | 'create_study' | 'create_boss' | 'create_rubric' | 'discover';

const AdminPanel: React.FC<AdminPanelProps> = ({ submissions }) => {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [tab, setTab] = useState<MainTab>('ACTIVITY');

  // Bug reports state
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [editingReport, setEditingReport] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [selectedBugs, setSelectedBugs] = useState<Set<string>>(new Set());

  // AI Lab state
  const [aiMode, setAiMode] = useState<AIMode>('fix');
  const [aiContext, setAiContext] = useState('');

  // Subscribe to bug reports
  useEffect(() => {
    const unsub = dataService.subscribeToBugReports(setBugReports);
    return unsub;
  }, []);

  const engagementLogs: Submission[] = useMemo(() => {
    const rawSubs = Array.isArray(submissions) ? submissions : [];
    return [...rawSubs].sort((a, b) => {
      const dateA = new Date(a.submittedAt || 0).getTime();
      const dateB = new Date(b.submittedAt || 0).getTime();
      return dateB - dateA;
    });
  }, [submissions]);

  // Engagement stats
  const engagementStats = useMemo(() => {
    const totalXP = engagementLogs.reduce((sum, s) => sum + Math.round(s.score), 0);
    const totalTime = engagementLogs.reduce((sum, s) => sum + (s.metrics?.engagementTime || 0), 0);
    const uniqueStudents = new Set(engagementLogs.map(s => s.userId)).size;
    const avgXP = engagementLogs.length > 0 ? Math.round(totalXP / engagementLogs.length) : 0;
    return { totalXP, totalTime, uniqueStudents, avgXP, totalSubmissions: engagementLogs.length };
  }, [engagementLogs]);

  const visibleReports = useMemo(() => {
    return bugReports.filter(r => showResolved || !r.resolved);
  }, [bugReports, showResolved]);

  const unresolvedCount = useMemo(() => bugReports.filter(r => !r.resolved).length, [bugReports]);

  const toggleBugSelect = useCallback((id: string) => {
    setSelectedBugs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const startEdit = useCallback((report: BugReport) => {
    setEditingReport(report.id!);
    setEditText(report.description);
  }, []);

  const saveEdit = useCallback(async (reportId: string) => {
    await dataService.updateBugReport(reportId, { description: editText });
    setEditingReport(null);
    setEditText('');
    toast.success('Report updated.');
  }, [editText, toast]);

  const resolveReport = useCallback(async (id: string) => {
    await dataService.resolveBugReport(id);
    setSelectedBugs(prev => { const n = new Set(prev); n.delete(id); return n; });
    toast.success('Report resolved.');
  }, [toast]);

  const deleteReport = useCallback(async (id: string) => {
    if (await confirm({ message: 'Delete this report permanently?', confirmLabel: 'Delete' })) {
      await dataService.deleteBugReport(id);
      setSelectedBugs(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }, [confirm]);

  // Generate AI prompts — consolidated from all components
  const generatePrompt = useCallback(() => {
    const selected = bugReports.filter(r => selectedBugs.has(r.id!));
    const ctx = aiContext.trim();

    if (aiMode === 'fix') {
      const bugList = selected.length > 0
        ? selected.map((r, i) =>
          `${i + 1}. [${r.category.toUpperCase()}] ${r.description}${r.userName ? ` (reported by ${r.userName})` : ''}`
        ).join('\n')
        : '(No specific reports selected — analyze the codebase for common issues)';

      return `You are working on "Porter Portal", an educational platform built with React 19, TypeScript, Tailwind CSS, and Firebase Firestore.

The following bug reports and feature requests have been filed by users:

${bugList}
${ctx ? `\nAdditional context from the admin:\n${ctx}\n` : ''}
Please analyze these issues, identify the root causes in the codebase, and implement fixes. For each fix:
1. Explain what the issue is and where in the code it occurs
2. Make the minimal, targeted change needed
3. Ensure the fix doesn't introduce regressions
4. Build and verify the changes compile cleanly`;
    }

    if (aiMode === 'create_blocks') {
      return `You are an expert educational content designer for "Porter Portal", an LMS built with React/TypeScript.

I need you to create lesson content as JSON blocks for the Resource Editor's "Paste JSON" import.
${ctx ? `\nTOPIC / INSTRUCTIONS:\n${ctx}\n` : ''}
Available block types and required fields:

Content blocks:
- {"type":"SECTION_HEADER", "icon":"📚", "title":"Section Name", "subtitle":"Optional subtitle"}
- {"type":"TEXT", "content":"Plain text content"}
- {"type":"IMAGE", "url":"https://...", "caption":"Caption", "alt":"Description"}
- {"type":"VIDEO", "url":"https://youtube.com/watch?v=...", "caption":"Caption"}
- {"type":"OBJECTIVES", "title":"Learning Objectives", "items":["Obj 1","Obj 2"]}
- {"type":"DIVIDER"}
- {"type":"EXTERNAL_LINK", "title":"Link Title", "url":"https://...", "content":"Description", "buttonLabel":"Open", "openInNewTab":true}
- {"type":"INFO_BOX", "variant":"tip|warning|note", "content":"Box content"}

Interactive blocks:
- {"type":"VOCABULARY", "term":"Word", "definition":"Definition"}
- {"type":"VOCAB_LIST", "terms":[{"term":"Word1","definition":"Def1"}]}
- {"type":"ACTIVITY", "icon":"⚡", "title":"Activity Name", "instructions":"Do this..."}
- {"type":"CHECKLIST", "content":"Checklist title", "items":["Step 1","Step 2"]}
- {"type":"SORTING", "title":"Sort Title", "instructions":"Sort these", "leftLabel":"Category A", "rightLabel":"Category B", "sortItems":[{"text":"Item","correct":"left|right"}]}
- {"type":"DATA_TABLE", "title":"Table Title", "columns":[{"key":"col1","label":"Name","editable":true}], "trials":3}
- {"type":"BAR_CHART", "title":"Chart Title", "barCount":3, "initialLabel":"Initial", "finalLabel":"Final", "deltaLabel":"Change", "height":300}

Question blocks:
- {"type":"MC", "content":"Question?", "options":["A","B","C","D"], "correctAnswer":0}
- {"type":"SHORT_ANSWER", "content":"Question?", "acceptedAnswers":["answer1","answer2"]}
- {"type":"RANKING", "content":"Put in order:", "items":["First","Second","Third"]}

Rules: Start with SECTION_HEADER, use OBJECTIVES near top, add TEXT between interactive elements, include INFO_BOX for callouts, add DIVIDER between sections, include 2-3 question blocks.
Output ONLY the JSON array — no markdown fences, no commentary.`;
    }

    if (aiMode === 'create_html') {
      return `You are an expert educational content designer for "Porter Portal", an LMS built with React/TypeScript.

Create a standalone HTML interactive activity that integrates with the Proctor Bridge Protocol via postMessage.
${ctx ? `\nACTIVITY DESCRIPTION:\n${ctx}\n` : ''}
REQUIREMENTS:
- Self-contained single HTML file (inline CSS + JS)
- Dark theme matching the portal (#0f0720 background, white/gray text)
- Mobile-responsive design
- Engaging, interactive educational content

PROCTOR BRIDGE INTEGRATION — Include this snippet at the top of your <script>:
const PortalBridge = (() => {
  const send = (type, data) => window.parent.postMessage({ source: 'portal-activity', type, ...data }, '*');
  return {
    init: () => send('PROCTOR_READY'),
    save: (state, currentQuestion) => send('SAVE_STATE', { state, currentQuestion }),
    answer: (questionId, correct, attempts) => send('ANSWER', { questionId, correct, attempts }),
    complete: (score, total, correct) => send('COMPLETE', { score, total, correct })
  };
})();
window.addEventListener('load', () => PortalBridge.init());

- Call PortalBridge.answer(questionId, correct, attempts) when a student answers (awards XP)
- Call PortalBridge.complete(score, total, correct) when the activity is finished
- Call PortalBridge.save(stateObj, currentQuestionIndex) periodically to save progress

Output ONLY the complete HTML file — no explanation or commentary.`;
    }

    if (aiMode === 'create_qbank') {
      return `You are an expert educational assessment designer. Generate a question bank of 150 questions for a resource.
${ctx ? `\nRESOURCE / TOPIC:\n${ctx}\n` : ''}
Generate questions organized into 3 Bloom's Taxonomy tiers. Use a MIXTURE of the following question formats across all tiers:

QUESTION FORMATS:
1. Multiple Choice — 4 options, 1 correct
2. Multiple Select — 4 options, 2-3 correct
3. Ranking Task — 4 items to order correctly
4. Conflicting Contentions — Two students disagree, who is correct and why
5. Linked Multiple Choice — Two connected questions where part B depends on part A
6. Qualitative Reasoning — Conceptual MC requiring deep understanding
7. Troubleshooting Task — Identify the error in a scenario
8. What's Wrong Task — Find the flaw in given reasoning/solution
9. Working Backwards Task — Given the answer, determine what produced it

TIER DISTRIBUTION (50 questions each):
- TIER 1 (Remember & Understand) — 50 questions, +10 XP each
- TIER 2 (Apply & Analyze) — 50 questions, +25 XP each
- TIER 3 (Evaluate & Create) — 50 questions, +50 XP each

OUTPUT FORMAT — Respond with ONLY a valid JSON array. Each question object:
{
  "id": "t1q001" (tier + question number),
  "tier": 1, 2, or 3,
  "xp": 10, 25, or 50 (matching tier),
  "type": "multiple_choice" | "multiple_select" | "ranking" | "qualitative_reasoning" | "linked_mc" | "troubleshooting" | "conflicting_contentions" | "whats_wrong" | "working_backwards",
  "bloomsLevel": "Remember" | "Understand" | "Apply" | "Analyze" | "Evaluate" | "Create",
  "stem": "The question text",
  "context": "Optional scenario/context text" or null,
  "options": [{"id": "a", "text": "..."}, {"id": "b", "text": "..."}, {"id": "c", "text": "..."}, {"id": "d", "text": "..."}],
  "correctAnswer": "b" (for MC) OR ["a","c"] (for multiple_select) OR ["c","a","d","b"] (for ranking, in correct order),
  "explanation": "Why this is the correct answer",
  "linkedFollowUp": null OR (only for linked_mc) {"stem": "...", "options": [...], "correctAnswer": "...", "explanation": "..."}
}

IMPORTANT:
- Distractors must be plausible and educational
- Vary question formats within each tier (use all 9 types)
- Output ONLY the JSON array — no markdown fences, no commentary
- Generate exactly 150 questions (50 per tier) if possible`;
    }

    if (aiMode === 'create_study') {
      return `You are an expert educational content creator. Create comprehensive study material for students working through a practice set or lesson.
${ctx ? `\nTOPIC / PRACTICE SET:\n${ctx}\n` : ''}
Create detailed reading material that covers all the concepts, formulas, principles, and background knowledge a student needs to succeed.

OUTPUT FORMAT — Respond with ONLY a valid JSON object:
{
  "title": "Study Guide: [Topic]",
  "description": "A brief 1-2 sentence overview of what this reading covers",
  "estimatedMinutes": 15,
  "sections": [
    {
      "title": "Section title",
      "content": "Detailed explanation text. Use clear language. Include definitions, examples, step-by-step explanations, key formulas, common misconceptions, and practical applications."
    }
  ]
}

GUIDELINES:
- Create 8-15 sections that logically progress through the material
- Each section should be 150-400 words — substantial enough to actually teach the concept
- Include worked examples where applicable
- Define key vocabulary and terminology
- Address common student misconceptions
- Use clear, direct language
- The total reading should take approximately 10-20 minutes
- CRITICAL: For ALL math expressions, use LaTeX notation wrapped in dollar signs. Examples: $W = Fd\\cos\\theta$, $K = \\frac{1}{2}mv^2$
- Use double dollar signs for display equations: $$E_i + W_{ext} = E_f$$
- Use bullet points (* at line start) for lists
- Use **bold** for key terms on first introduction
- Output ONLY the JSON object — no markdown fences, no commentary`;
    }

    if (aiMode === 'create_boss') {
      return `You are an expert educational assessment designer. Generate quiz boss questions for a gamified LMS.
${ctx ? `\nBOSS / CLASS / TOPIC:\n${ctx}\n` : ''}
Generate 15-30 multiple choice questions across 3 difficulty tiers.

TIER DISTRIBUTION:
- EASY (5-10 questions): Recall and basic comprehension
- MEDIUM (5-10 questions): Application and analysis
- HARD (5-10 questions): Evaluation and synthesis

OUTPUT FORMAT — Respond with ONLY a valid JSON array:
[
  {
    "id": "q001",
    "stem": "The question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "difficulty": "EASY",
    "damageBonus": 0
  }
]

RULES:
- "correctAnswer" is the 0-based INDEX of the correct option (0=A, 1=B, 2=C, 3=D)
- "damageBonus" should be 0 for EASY, 25 for MEDIUM, 50 for HARD
- Each question must have exactly 4 options
- Distractors must be plausible and educational
- Questions must be specific to the class material
- Output ONLY the JSON array — no markdown fences, no commentary`;
    }

    if (aiMode === 'create_rubric') {
      return `You are an expert educational assessment designer. Create a detailed grading rubric for an assignment or project.
${ctx ? `\nASSIGNMENT / PROJECT:\n${ctx}\n` : ''}
Create a comprehensive rubric that clearly defines performance levels for each criterion.

OUTPUT FORMAT — Respond with ONLY a valid JSON object:
{
  "title": "Rubric: [Assignment Name]",
  "totalPoints": 100,
  "criteria": [
    {
      "name": "Criterion Name",
      "weight": 25,
      "levels": [
        {"label": "Exemplary", "points": 25, "description": "Exceeds expectations. ..."},
        {"label": "Proficient", "points": 20, "description": "Meets expectations. ..."},
        {"label": "Developing", "points": 15, "description": "Approaching expectations. ..."},
        {"label": "Beginning", "points": 10, "description": "Below expectations. ..."}
      ]
    }
  ]
}

GUIDELINES:
- Include 4-6 criteria that cover all major aspects of the assignment
- Each criterion should have 4 performance levels (Exemplary, Proficient, Developing, Beginning)
- Descriptions should be specific and observable — avoid vague language
- Weights should sum to the total points
- Output ONLY the JSON object — no markdown fences, no commentary`;
    }

    // discover mode
    return `You are working on "Porter Portal", an educational platform built with React 19, TypeScript, Tailwind CSS, and Firebase Firestore.

Please analyze the codebase and suggest improvements, new features, or optimizations. Focus on:

1. UX improvements that would benefit students and administrators
2. Performance optimizations for large class sizes
3. Missing features that similar educational platforms typically have
4. Code quality improvements and potential bug areas
5. Accessibility improvements
${ctx ? `\nThe admin has these specific areas of interest:\n${ctx}\n` : ''}
For each suggestion, briefly describe the feature/improvement, the expected benefit, and the approximate complexity (small/medium/large). Prioritize suggestions by impact.`;
  }, [aiMode, selectedBugs, bugReports, aiContext]);

  const copyPrompt = useCallback(() => {
    const prompt = generatePrompt();
    navigator.clipboard.writeText(prompt);
    toast.success('Prompt copied to clipboard!');
  }, [generatePrompt, toast]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Admin System</h1>
        <p className="text-gray-400">Operational oversight, bug triage, and AI tools.</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-1.5">
        {([
          { key: 'ACTIVITY' as MainTab, icon: <Activity className="w-4 h-4" />, label: 'Student Activity', badge: engagementLogs.length > 0 ? String(engagementLogs.length) : undefined },
          { key: 'BUGS' as MainTab, icon: <Bug className="w-4 h-4" />, label: 'Bug Reports', badge: unresolvedCount > 0 ? String(unresolvedCount) : undefined },
          { key: 'AI' as MainTab, icon: <Sparkles className="w-4 h-4" />, label: 'AI Lab' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition cursor-pointer ${
              tab === t.key
                ? 'bg-purple-600/50 text-white shadow-lg shadow-purple-500/10'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {t.icon} {t.label}
            {t.badge && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-400'
              }`}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════ STUDENT ACTIVITY ═══════════ */}
      {tab === 'ACTIVITY' && (
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Submissions', value: engagementStats.totalSubmissions, icon: <BarChart3 className="w-5 h-5" />, color: 'purple' },
              { label: 'Unique Students', value: engagementStats.uniqueStudents, icon: <Users className="w-5 h-5" />, color: 'blue' },
              { label: 'Total XP Earned', value: engagementStats.totalXP.toLocaleString(), icon: <TrendingUp className="w-5 h-5" />, color: 'emerald' },
              { label: 'Avg XP / Submission', value: engagementStats.avgXP, icon: <Activity className="w-5 h-5" />, color: 'amber' },
            ].map(stat => (
              <div key={stat.label} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-${stat.color}-400`}>{stat.icon}</span>
                  <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{stat.label}</span>
                </div>
                <div className="text-2xl font-black text-white">{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Activity Feed */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" /> Recent Engagement
            </h3>
            {engagementLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Clock className="w-12 h-12 text-gray-700 mb-4" />
                <p className="text-gray-500 text-sm font-medium">No engagement data yet</p>
                <p className="text-gray-600 text-xs mt-1 max-w-sm">Activity will appear here as students complete resources.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
                {engagementLogs.map((sub: Submission) => (
                  <div key={sub.id} className="bg-black/30 border border-white/5 p-4 rounded-2xl hover:border-purple-500/20 transition group">
                    <div className="flex justify-between items-start mb-3">
                      <div className="min-w-0">
                        <span className="font-bold text-gray-200 text-sm block truncate">{sub.userName}</span>
                        <span className="text-[10px] text-gray-500 font-medium uppercase tracking-tight line-clamp-1">{sub.assignmentTitle}</span>
                      </div>
                      <span className="text-[10px] font-bold text-blue-400 bg-blue-900/30 px-2.5 py-1 rounded-full shrink-0 ml-2">{Math.round(sub.score)} XP</span>
                    </div>
                    <div className="text-[10px] text-gray-600 border-t border-white/5 pt-2 flex justify-between">
                      <span>{Math.round(sub.metrics.engagementTime / 60)}m active</span>
                      <span className="opacity-0 group-hover:opacity-100 transition">{new Date(sub.submittedAt || '').toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ BUG REPORTS ═══════════ */}
      {tab === 'BUGS' && (
        <div className="space-y-4">
          {/* Bug stats & controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">
                <span className="font-bold text-white">{unresolvedCount}</span> open
                {bugReports.length - unresolvedCount > 0 && (
                  <span className="ml-2 text-gray-600">/ {bugReports.length - unresolvedCount} resolved</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {selectedBugs.size > 0 && (
                <button
                  onClick={() => { setTab('AI'); setAiMode('fix'); }}
                  className="flex items-center gap-1.5 text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-3 py-2 rounded-xl hover:bg-purple-500/20 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Send {selectedBugs.size} to AI Lab
                </button>
              )}
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none bg-white/5 px-3 py-2 rounded-xl border border-white/10">
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={e => setShowResolved(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-purple-500"
                />
                Show Resolved
              </label>
            </div>
          </div>

          {/* Bug list */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6">
            {visibleReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Bug className="w-12 h-12 text-gray-700 mb-4" />
                <p className="text-gray-500 text-sm font-medium">No reports yet</p>
                <p className="text-gray-600 text-xs mt-1 max-w-sm">Bug reports and feature requests submitted by users will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
                {visibleReports.map(report => {
                  const badge = CATEGORY_BADGES[report.category];
                  const isSelected = selectedBugs.has(report.id!);
                  const isEditing = editingReport === report.id;
                  return (
                    <div
                      key={report.id}
                      className={`bg-black/30 border rounded-2xl p-4 transition ${
                        report.resolved ? 'border-green-500/10 opacity-50' :
                        isSelected ? 'border-purple-500/30 bg-purple-500/5' : 'border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        {!report.resolved && (
                          <button
                            onClick={() => toggleBugSelect(report.id!)}
                            className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition cursor-pointer ${
                              isSelected ? 'bg-purple-600 border-purple-500' : 'border-white/20 hover:border-purple-500/50'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${badge.color}`}>{badge.label}</span>
                            <span className="text-xs text-gray-500 truncate">{report.userName}</span>
                            {report.resolved && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                          </div>
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                rows={3}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition resize-none"
                                autoFocus
                              />
                              <div className="flex items-center gap-2">
                                <button onClick={() => saveEdit(report.id!)} className="flex items-center gap-1 text-xs font-bold text-green-300 bg-green-500/10 px-3 py-1.5 rounded-lg hover:bg-green-500/20 transition cursor-pointer">
                                  <Check className="w-3 h-3" /> Save
                                </button>
                                <button onClick={() => setEditingReport(null)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition cursor-pointer">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-300 leading-relaxed">{report.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-white/5">
                        <span className="text-[10px] text-gray-600 font-mono">
                          {new Date(report.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {!report.resolved && !isEditing && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(report)} className="p-1.5 text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition cursor-pointer" title="Edit description">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => resolveReport(report.id!)} className="p-1.5 text-gray-500 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition cursor-pointer" title="Mark resolved">
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteReport(report.id!)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ AI LAB ═══════════ */}
      {tab === 'AI' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Mode selector + controls */}
          <div className="lg:col-span-4 space-y-4">
            {/* Primary modes */}
            <div className="space-y-1.5">
              <div className="text-[9px] font-bold text-gray-600 uppercase tracking-widest px-1">Operations</div>
              <button
                onClick={() => setAiMode('fix')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition cursor-pointer ${
                  aiMode === 'fix' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'
                }`}
              >
                <Wrench className={`w-4 h-4 ${aiMode === 'fix' ? 'text-amber-400' : 'text-gray-500'}`} />
                <div><div className={`text-xs font-bold ${aiMode === 'fix' ? 'text-white' : 'text-gray-300'}`}>Fix Bugs</div><div className="text-[9px] text-gray-500">From selected bug reports</div></div>
              </button>
              <button
                onClick={() => setAiMode('discover')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition cursor-pointer ${
                  aiMode === 'discover' ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'
                }`}
              >
                <Lightbulb className={`w-4 h-4 ${aiMode === 'discover' ? 'text-yellow-400' : 'text-gray-500'}`} />
                <div><div className={`text-xs font-bold ${aiMode === 'discover' ? 'text-white' : 'text-gray-300'}`}>Discover</div><div className="text-[9px] text-gray-500">Improvement suggestions</div></div>
              </button>
            </div>

            {/* Content creation modes */}
            <div className="space-y-1.5">
              <div className="text-[9px] font-bold text-gray-600 uppercase tracking-widest px-1">Content Creation</div>
              {([
                { key: 'create_blocks' as AIMode, icon: <FileJson className="w-4 h-4" />, label: 'Lesson Blocks', desc: 'JSON blocks for Resource Editor' },
                { key: 'create_html' as AIMode, icon: <Code className="w-4 h-4" />, label: 'HTML Interactive', desc: 'Standalone HTML activity' },
                { key: 'create_qbank' as AIMode, icon: <FlaskConical className="w-4 h-4" />, label: 'Question Bank', desc: '150 tiered questions (9 formats)' },
                { key: 'create_study' as AIMode, icon: <GraduationCap className="w-4 h-4" />, label: 'Study Material', desc: 'Reading guide with LaTeX math' },
                { key: 'create_boss' as AIMode, icon: <Swords className="w-4 h-4" />, label: 'Quiz Boss', desc: '15-30 tiered boss questions' },
                { key: 'create_rubric' as AIMode, icon: <BookOpen className="w-4 h-4" />, label: 'Grading Rubric', desc: 'Structured rubric with criteria' },
              ]).map(m => {
                const isActive = aiMode === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => setAiMode(m.key)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition cursor-pointer ${
                      isActive ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <span className={isActive ? 'text-blue-400' : 'text-gray-500'}>{m.icon}</span>
                    <div><div className={`text-xs font-bold ${isActive ? 'text-white' : 'text-gray-300'}`}>{m.label}</div><div className="text-[9px] text-gray-500">{m.desc}</div></div>
                  </button>
                );
              })}
            </div>

            {/* Selected bugs (fix mode) */}
            {aiMode === 'fix' && selectedBugs.size > 0 && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4">
                <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">{selectedBugs.size} report{selectedBugs.size !== 1 ? 's' : ''} selected</span>
                <div className="mt-2 space-y-1.5">
                  {bugReports.filter(r => selectedBugs.has(r.id!)).map(r => (
                    <div key={r.id} className="flex items-center gap-2 text-xs text-gray-400 bg-black/20 rounded-lg px-3 py-2">
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${CATEGORY_BADGES[r.category].color}`}>{r.category}</span>
                      <span className="truncate flex-1">{r.description.slice(0, 80)}{r.description.length > 80 ? '...' : ''}</span>
                      <button onClick={() => toggleBugSelect(r.id!)} className="shrink-0 p-0.5 text-gray-600 hover:text-red-400 transition cursor-pointer">
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Context input */}
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">
                {aiMode === 'fix' ? 'Additional Context' :
                 aiMode === 'create_blocks' ? 'Topic & Instructions' :
                 aiMode === 'create_html' ? 'Activity Description' :
                 aiMode === 'create_qbank' ? 'Resource / Topic' :
                 aiMode === 'create_study' ? 'Topic / Practice Set' :
                 aiMode === 'create_boss' ? 'Boss / Class / Topic' :
                 aiMode === 'create_rubric' ? 'Assignment / Project' :
                 'Areas of Interest'}
              </label>
              <textarea
                value={aiContext}
                onChange={e => setAiContext(e.target.value)}
                rows={4}
                placeholder={
                  aiMode === 'fix' ? 'Extra context about the bugs or how to reproduce them...'
                  : aiMode === 'create_blocks' ? 'Describe the lesson topic, grade level, specific blocks you want...'
                  : aiMode === 'create_html' ? 'Describe the interactive activity (simulation, game, lab)...'
                  : aiMode === 'create_qbank' ? 'Paste the resource content or describe the topic for questions...'
                  : aiMode === 'create_study' ? 'Describe the topic or paste the practice set content...'
                  : aiMode === 'create_boss' ? 'Boss name, class, and topic for quiz boss encounter...'
                  : aiMode === 'create_rubric' ? 'Describe the assignment or project to create a rubric for...'
                  : 'Areas to focus on, or leave blank for general analysis...'
                }
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition resize-none"
              />
            </div>

            {/* Copy button */}
            <button
              onClick={copyPrompt}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-bold text-sm transition cursor-pointer shadow-lg shadow-purple-500/20"
            >
              <Clipboard className="w-4 h-4" /> Copy Prompt to Clipboard
            </button>
          </div>

          {/* Prompt preview */}
          <div className="lg:col-span-8">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 h-full">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 block">Generated Prompt Preview</label>
              <div className="bg-black/30 border border-white/5 rounded-2xl p-5 h-[calc(100%-2rem)] max-h-[600px] overflow-y-auto custom-scrollbar">
                <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">{generatePrompt()}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
