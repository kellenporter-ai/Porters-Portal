import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Submission, User, BugReport, SongRequest } from '../types';
import { Clock, Bug, Clipboard, CheckCircle, Sparkles, Wrench, Pencil, X as XIcon, Check, Trash2, TrendingUp, Users, BarChart3, Activity, Gamepad2, Music, LayoutGrid, List } from 'lucide-react';
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

type MainTab = 'ACTIVITY' | 'BUGS' | 'SONGS' | 'AI';
type AIMode = 'fix' | 'create_multiplayer';

const AdminPanel: React.FC<AdminPanelProps> = ({ submissions }) => {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [tab, setTab] = useState<MainTab>('ACTIVITY');
  const [activityView, setActivityView] = useState<'grid' | 'list'>('grid');

  // Bug reports state
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [editingReport, setEditingReport] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [selectedBugs, setSelectedBugs] = useState<Set<string>>(new Set());

  // Song requests state
  const [songRequests, setSongRequests] = useState<SongRequest[]>([]);
  const [showAllSongs, setShowAllSongs] = useState(false);

  // AI Lab state
  const [aiMode, setAiMode] = useState<AIMode>('fix');
  const [aiContext, setAiContext] = useState('');

  // Subscribe to bug reports
  useEffect(() => {
    const unsub = dataService.subscribeToBugReports(setBugReports);
    return unsub;
  }, []);

  // Subscribe to song requests
  useEffect(() => {
    const unsub = dataService.subscribeToSongRequests(setSongRequests);
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

  const pendingSongCount = useMemo(() => songRequests.filter(r => r.status === 'pending').length, [songRequests]);

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

    if (aiMode === 'create_multiplayer') {
      return `You are an expert educational game designer for "Porter Portal", an LMS built with React/TypeScript and Firebase.

Create a standalone HTML multiplayer interactive activity that uses Firebase Realtime Database for real-time player synchronization.
${ctx ? `\nACTIVITY DESCRIPTION:\n${ctx}\n` : ''}
REQUIREMENTS:
- Self-contained single HTML file (inline CSS + JS)
- Dark theme matching the portal (#0f0720 background, white/gray text, purple/blue accents)
- Mobile-responsive design
- Multiplayer via Firebase Realtime Database (support 2+ players as the game requires)
- Game lobby with join codes so students can find each other in a classroom setting
- The host sets a maxPlayers count; game starts when enough players join and all are ready

FIREBASE REALTIME DATABASE SETUP — Include these scripts and config:
<script src="https://www.gstatic.com/firebasejs/11.7.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/11.7.1/firebase-database-compat.js"></script>

const firebaseConfig = {
  apiKey: "AIzaSyAGUwSeJVCLLz_UTIFj4H3qvJnlFnvNjSw",
  authDomain: "porters-portal.firebaseapp.com",
  databaseURL: "https://porters-portal-default-rtdb.firebaseio.com",
  projectId: "porters-portal",
  storageBucket: "porters-portal.firebasestorage.app",
  messagingSenderId: "822085463019",
  appId: "1:822085463019:web:d55fa7e5b4516429d4aa52"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

PLAYER IDENTITY — No Firebase Auth needed (RTDB rules are open for /games/ paths).
Generate a stable player ID per browser tab using sessionStorage:

let myUid = sessionStorage.getItem('game_player_uid');
if (!myUid) {
  myUid = 'player_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  sessionStorage.setItem('game_player_uid', myUid);
}

CONNECTION STATUS — Listen for RTDB connectivity (works without auth):

db.ref('.info/connected').on('value', snap => {
  const el = document.getElementById('fb-status');
  if (el) {
    const online = snap.val() === true;
    el.textContent = online ? '● ONLINE' : '● OFFLINE';
    el.style.color = online ? '#4ade80' : '#ef4444';
  }
});

REALTIME DATABASE STRUCTURE — Use this schema at path /games/{gameId}/:
{
  "meta": {
    "createdBy": "uid",
    "status": "waiting|setup|playing|finished",
    "createdAt": timestamp,
    "joinCode": "ABCD",
    "numTeams": 2,
    "timerSecs": 20
    // Add any game-specific meta fields you need (e.g., maxPlayers, currentTurn, etc.)
  },
  "players": {
    "uid1": { "name": "Team Alpha", "teamId": 0, "ready": false, "connected": true, "lastSeen": timestamp },
    "uid2": { "name": "Team Bravo", "teamId": 1, "ready": true,  "connected": true, "lastSeen": timestamp }
  },
  "state": {
    // Shared game state object — ALL game logic goes here
    // Examples: phase, teams[], currentTeamIndex, scores, round, board, etc.
    // Any player/device can read and write this — the host typically drives updates
  },
  "answers": {
    "uid1": { "teamId": 0, "answer": "A", "correct": true, "ts": timestamp }
    // Per-player answer submissions — useful for quiz/review games
  }
}
// /join_codes/{CODE} → gameId  (maps a 4-letter code to its game)

SECURITY RULES IN EFFECT:
- /games/ and /join_codes/ paths are fully OPEN — no auth, no validation
- Any device can read and write any game path
- No Firebase Auth SDK is needed — do NOT include firebase-auth-compat.js
- Use myUid (from the sessionStorage block above) as the player identifier for all database writes
- The schema above is a guide, not enforced — add whatever fields your game needs

CRITICAL IMPLEMENTATION PATTERNS:

1. GAME CREATION (Host):
const gameId = db.ref('games').push().key;
const joinCode = Math.random().toString(36).substring(2, 6).toUpperCase();
await db.ref('games/' + gameId).set({
  meta: { createdBy: myUid, status: 'waiting', createdAt: Date.now(), joinCode, numTeams: N },
  players: { [myUid]: { name: 'HOST', teamId: -1, ready: true, connected: true } }
});
await db.ref('join_codes/' + joinCode).set(gameId);
// Clean up if host disconnects:
db.ref('games/' + gameId).onDisconnect().remove();
db.ref('join_codes/' + joinCode).onDisconnect().remove();

2. JOINING (Any player):
const snapshot = await db.ref('join_codes/' + code).get();
if (!snapshot.exists()) { /* room not found */ return; }
const gameId = snapshot.val();
const gameSnap = await db.ref('games/' + gameId).get();
const gameData = gameSnap.val();
if (gameData.meta.status !== 'waiting') { /* game already started */ return; }
// Find lowest unoccupied team slot
const players = gameData.players || {};
const takenIds = Object.values(players).map(p => p.teamId).filter(id => id >= 0);
let slot = 0;
while (takenIds.includes(slot)) slot++;
if (slot >= gameData.meta.numTeams) { /* room full */ return; }
await db.ref('games/' + gameId + '/players/' + myUid).set({
  name: teamName, teamId: slot, ready: false, connected: true,
  lastSeen: firebase.database.ServerValue.TIMESTAMP
});
db.ref('games/' + gameId + '/players/' + myUid + '/connected').onDisconnect().set(false);

3. SINGLE STATE LISTENER (all devices — this is the core pattern):
// One listener on /games/{gameId}/state drives ALL screen transitions.
// The host pushes state updates; all devices (including host) react to them.
db.ref('games/' + gameId + '/state').on('value', snap => {
  const gs = snap.val();
  if (!gs) return;
  switch (gs.phase) {
    case 'setup':   handleSetup(gs); break;
    case 'turn':    handleTurn(gs); break;
    case 'playing': handlePlaying(gs); break;
    case 'gameover': handleGameOver(gs); break;
  }
});

4. PRESENCE / DISCONNECT:
db.ref('games/' + gameId + '/players/' + myUid + '/connected').onDisconnect().set(false);

5. LOBBY PLAYER LIST (live updates):
db.ref('games/' + gameId + '/players').on('value', snap => {
  const players = snap.val() || {};
  // Render connected players, show count vs numTeams
});

6. STATE UPDATES (host pushes, all devices react via the listener above):
await db.ref('games/' + gameId + '/state').update({
  phase: 'playing', currentTeamIndex: 0, scores: [0, 0], round: 1
});

7. GAME CLEANUP — When game ends:
await db.ref('games/' + gameId + '/meta/status').set('finished');
await db.ref('join_codes/' + joinCode).remove();

UI FLOW:
1. Start screen — Enter name, choose "Create Game" or "Join Game"
2. If creating: Set max players (if the game supports variable counts), show a 4-character join code
3. If joining: Enter the join code
4. Lobby screen — Shows all connected players, their ready status, and how many slots remain
5. Host can start the game when all players are ready (or auto-start when full + all ready)
6. Game plays with live updates via Firebase listeners; show whose turn it is
7. End screen shows results / leaderboard for all players

IMPORTANT:
- Do NOT include firebase-auth-compat.js — auth is not used
- Use .on('value') for real-time listeners, NOT .once() — the whole point is live sync
- Use a SINGLE state listener on /games/{gameId}/state that drives ALL UI transitions
- The host device pushes state changes; all devices (including host) react via the listener
- Always use onDisconnect() to handle players closing the tab
- Use firebase.database.ServerValue.TIMESTAMP for server-side timestamps
- Clean up listeners with .off() when leaving the game
- The join code should be short (4 chars) and easy to share verbally in a classroom
- All players must see changes immediately — never cache stale state client-side
- For turn-based games, only allow the active team's device to trigger actions
- For team games, use teamId in each player entry and group accordingly
- Handle late joins gracefully: if the game is already "playing", block join
- Show a player roster / scoreboard that dynamically updates as players join, disconnect, or score
- The host device is the "source of truth" — it resolves conflicts and advances game phases

Output ONLY the complete HTML file — no explanation or commentary.`;
    }

    // fallback (should not reach here with current AIMode type)
    return '';
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
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2 tracking-tight">Admin System</h1>
        <p className="text-[var(--text-tertiary)]">Operational oversight, bug triage, and AI tools.</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-2xl p-1.5">
        {([
          { key: 'ACTIVITY' as MainTab, icon: <Activity className="w-4 h-4" />, label: 'Student Activity', badge: engagementLogs.length > 0 ? String(engagementLogs.length) : undefined },
          { key: 'BUGS' as MainTab, icon: <Bug className="w-4 h-4" />, label: 'Bug Reports', badge: unresolvedCount > 0 ? String(unresolvedCount) : undefined },
          { key: 'SONGS' as MainTab, icon: <Music className="w-4 h-4" />, label: 'Song Queue', badge: pendingSongCount > 0 ? String(pendingSongCount) : undefined },
          { key: 'AI' as MainTab, icon: <Sparkles className="w-4 h-4" />, label: 'AI Lab' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition cursor-pointer ${
              tab === t.key
                ? 'bg-purple-600/50 text-white shadow-lg shadow-purple-500/10'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-glass)]'
            }`}
          >
            {t.icon} {t.label}
            {t.badge && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-[var(--surface-glass-heavy)] text-white' : 'bg-[var(--surface-glass-heavy)] text-[var(--text-tertiary)]'
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
              <div key={stat.label} className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-${stat.color}-400`}>{stat.icon}</span>
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{stat.label}</span>
                </div>
                <div className="text-2xl font-black text-[var(--text-primary)]">{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Activity Feed */}
          <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--accent-text)]" /> Recent Engagement
              </h3>
              <div className="flex items-center gap-1 bg-[var(--surface-glass)] border border-[var(--border)] rounded-lg p-0.5">
                <button onClick={() => setActivityView('grid')} className={`p-1.5 rounded-md transition ${activityView === 'grid' ? 'bg-purple-500/20 text-purple-300' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`} title="Grid view" aria-label="Grid view"><LayoutGrid className="w-3.5 h-3.5" /></button>
                <button onClick={() => setActivityView('list')} className={`p-1.5 rounded-md transition ${activityView === 'list' ? 'bg-purple-500/20 text-purple-300' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`} title="List view" aria-label="List view"><List className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {engagementLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Clock className="w-12 h-12 text-gray-700 mb-4" />
                <p className="text-[var(--text-muted)] text-sm font-medium">No engagement data yet</p>
                <p className="text-[var(--text-muted)] text-xs mt-1 max-w-sm">Activity will appear here as students complete resources.</p>
              </div>
            ) : (
              <>
                {activityView === 'grid' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
                    {engagementLogs.map((sub: Submission) => (
                      <div key={sub.id} className="bg-[var(--panel-bg)] border border-[var(--border)] p-4 rounded-2xl hover:border-purple-500/20 transition group">
                        <div className="flex justify-between items-start mb-3">
                          <div className="min-w-0">
                            <span className="font-bold text-[var(--text-secondary)] text-sm block truncate">{sub.userName}</span>
                            <span className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-tight line-clamp-1">{sub.assignmentTitle}</span>
                          </div>
                          <span className="text-[10px] font-bold text-blue-400 bg-blue-900/30 px-2.5 py-1 rounded-full shrink-0 ml-2">{Math.round(sub.score)} XP</span>
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] border-t border-[var(--border)] pt-2 flex justify-between">
                          <span>{Math.round(sub.metrics.engagementTime / 60)}m active</span>
                          <span className="opacity-0 group-hover:opacity-100 transition">{new Date(sub.submittedAt || '').toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {activityView === 'list' && (
                  <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left table-fixed">
                      <thead className="sticky top-0 bg-[var(--panel-bg)] z-10">
                        <tr className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border)]">
                          <th scope="col" className="py-2 px-3 w-[25%]">Student</th>
                          <th scope="col" className="py-2 px-3 w-[35%]">Resource</th>
                          <th scope="col" className="py-2 px-3 text-right w-[12%]">XP</th>
                          <th scope="col" className="py-2 px-3 text-right w-[13%]">Time</th>
                          <th scope="col" className="py-2 px-3 text-right w-[15%]">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {engagementLogs.map((sub: Submission) => (
                          <tr key={sub.id} className="border-b border-[var(--border)] hover:bg-purple-500/5 transition text-xs">
                            <td className="py-2 px-3 font-medium text-[var(--text-secondary)] truncate max-w-[200px]">{sub.userName}</td>
                            <td className="py-2 px-3 text-[var(--text-muted)] truncate max-w-[250px]">{sub.assignmentTitle}</td>
                            <td className="py-2 px-3 text-right font-bold text-blue-400">{Math.round(sub.score)}</td>
                            <td className="py-2 px-3 text-right text-[var(--text-muted)]">{Math.round(sub.metrics.engagementTime / 60)}m</td>
                            <td className="py-2 px-3 text-right text-[var(--text-muted)]">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
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
              <span className="text-sm text-[var(--text-tertiary)]">
                <span className="font-bold text-[var(--text-primary)]">{unresolvedCount}</span> open
                {bugReports.length - unresolvedCount > 0 && (
                  <span className="ml-2 text-[var(--text-muted)]">/ {bugReports.length - unresolvedCount} resolved</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {selectedBugs.size > 0 && (
                <button
                  onClick={() => { setTab('AI'); setAiMode('fix'); }}
                  className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent-text)] bg-[var(--accent-muted)] border border-purple-500/20 px-3 py-2 rounded-xl hover:bg-purple-500/20 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Send {selectedBugs.size} to AI Lab
                </button>
              )}
              <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer select-none bg-[var(--surface-glass)] px-3 py-2 rounded-xl border border-[var(--border)]">
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
          <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-3xl p-6">
            {visibleReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Bug className="w-12 h-12 text-gray-700 mb-4" />
                <p className="text-[var(--text-muted)] text-sm font-medium">No reports yet</p>
                <p className="text-[var(--text-muted)] text-xs mt-1 max-w-sm">Bug reports and feature requests submitted by users will appear here.</p>
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
                      className={`bg-[var(--panel-bg)] border rounded-2xl p-4 transition ${
                        report.resolved ? 'border-green-500/10 opacity-50' :
                        isSelected ? 'border-purple-500/30 bg-purple-500/5' : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        {!report.resolved && (
                          <button
                            onClick={() => toggleBugSelect(report.id!)}
                            className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition cursor-pointer ${
                              isSelected ? 'bg-purple-600 border-purple-500' : 'border-[var(--border-strong)] hover:border-purple-500/50'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${badge.color}`}>{badge.label}</span>
                            <span className="text-xs text-[var(--text-muted)] truncate">{report.userName}</span>
                            {report.resolved && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                          </div>
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                rows={3}
                                className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition resize-none"
                                autoFocus
                              />
                              <div className="flex items-center gap-2">
                                <button onClick={() => saveEdit(report.id!)} className="flex items-center gap-1 text-xs font-bold text-green-300 bg-green-500/10 px-3 py-1.5 rounded-lg hover:bg-green-500/20 transition cursor-pointer">
                                  <Check className="w-3 h-3" /> Save
                                </button>
                                <button onClick={() => setEditingReport(null)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-lg transition cursor-pointer">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{report.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                          {new Date(report.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {!report.resolved && !isEditing && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(report)} className="p-1.5 text-[var(--text-muted)] hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition cursor-pointer" title="Edit description">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => resolveReport(report.id!)} className="p-1.5 text-[var(--text-muted)] hover:text-green-400 hover:bg-green-500/10 rounded-lg transition cursor-pointer" title="Mark resolved">
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteReport(report.id!)} className="p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer" title="Delete">
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

      {/* ═══════════ SONG QUEUE ═══════════ */}
      {tab === 'SONGS' && (
        <div className="space-y-4">
          {/* Header and filter */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-[var(--text-tertiary)]">
                <span className="font-bold text-[var(--text-primary)]">{pendingSongCount}</span> pending
                {songRequests.length - pendingSongCount > 0 && (
                  <span className="ml-2 text-[var(--text-muted)]">/ {songRequests.length - pendingSongCount} played or skipped</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAllSongs(false)}
                className={`text-xs font-bold px-3 py-2 rounded-xl border transition ${!showAllSongs ? 'bg-purple-600/50 text-white border-purple-500/30' : 'bg-[var(--surface-glass)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--border-strong)]'}`}
              >
                Pending
              </button>
              <button
                onClick={() => setShowAllSongs(true)}
                className={`text-xs font-bold px-3 py-2 rounded-xl border transition ${showAllSongs ? 'bg-purple-600/50 text-white border-purple-500/30' : 'bg-[var(--surface-glass)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--border-strong)]'}`}
              >
                All
              </button>
            </div>
          </div>

          {/* Song request list */}
          <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-3xl p-6">
            <p className="text-[10px] text-[var(--text-muted)] mb-4">Playing via Amazon Music. Mark requests as played to keep the queue current.</p>
            {(() => {
              const visible = showAllSongs ? songRequests : songRequests.filter(r => r.status === 'pending');
              if (visible.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Music className="w-12 h-12 text-gray-700 mb-4" />
                    <p className="text-[var(--text-muted)] text-sm font-medium">No song requests yet.</p>
                    <p className="text-[var(--text-muted)] text-xs mt-1 max-w-sm">Student song requests will appear here.</p>
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
                  {visible.map(req => {
                    const relTime = (() => {
                      const diff = Date.now() - new Date(req.timestamp).getTime();
                      const mins = Math.floor(diff / 60000);
                      if (mins < 1) return 'just now';
                      if (mins < 60) return `${mins}m ago`;
                      const hrs = Math.floor(mins / 60);
                      if (hrs < 24) return `${hrs}h ago`;
                      return `${Math.floor(hrs / 24)}d ago`;
                    })();
                    const statusBadge = req.status === 'pending'
                      ? 'bg-amber-500/20 text-amber-600 border-amber-500/30'
                      : req.status === 'played'
                        ? 'bg-green-500/20 text-green-600 border-green-500/30'
                        : 'bg-gray-500/20 text-gray-600 border-gray-500/30';
                    return (
                      <div
                        key={req.id}
                        className={`bg-[var(--panel-bg)] border rounded-2xl p-4 transition ${
                          req.status !== 'pending' ? 'border-[var(--border)] opacity-60' : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-[var(--text-primary)] truncate">{req.song}</p>
                            <p className="text-xs text-[var(--text-tertiary)] truncate">{req.artist}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => navigator.clipboard.writeText(`${req.song} ${req.artist}`).then(() => toast.success('Copied!'))}
                              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-glass)] rounded-lg transition"
                              title="Copy to clipboard"
                            >
                              <Clipboard className="w-3.5 h-3.5" />
                            </button>
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${statusBadge}`}>
                              {req.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {req.userName} · {relTime}
                          </span>
                          {req.status === 'pending' && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={async () => {
                                  try {
                                    await dataService.updateSongRequest(req.id!, { status: 'played' });
                                    toast.success('Marked as played.');
                                  } catch {
                                    toast.error('Failed to update request.');
                                  }
                                }}
                                className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-500/10 hover:bg-green-500/20 px-2.5 py-1.5 rounded-lg transition min-h-[44px]"
                                title="Mark as played"
                              >
                                <Check className="w-3 h-3" /> Played
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    await dataService.updateSongRequest(req.id!, { status: 'dismissed' });
                                    toast.success('Request dismissed.');
                                  } catch {
                                    toast.error('Failed to update request.');
                                  }
                                }}
                                className="flex items-center gap-1 text-[10px] font-bold text-[var(--text-muted)] bg-[var(--surface-glass)] hover:bg-[var(--surface-glass-heavy)] px-2.5 py-1.5 rounded-lg transition min-h-[44px]"
                                title="Skip / dismiss"
                              >
                                <XIcon className="w-3 h-3" /> Skip
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══════════ AI LAB ═══════════ */}
      {tab === 'AI' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Mode selector + controls */}
          <div className="lg:col-span-4 space-y-4">
            {/* Mode selector */}
            <div className="space-y-1.5">
              <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest px-1">Prompt Generator</div>
              <button
                onClick={() => setAiMode('fix')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition cursor-pointer ${
                  aiMode === 'fix' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-[var(--surface-glass)] border-[var(--border)] hover:border-[var(--border-strong)]'
                }`}
              >
                <Wrench className={`w-4 h-4 ${aiMode === 'fix' ? 'text-amber-400' : 'text-[var(--text-muted)]'}`} />
                <div><div className={`text-xs font-bold ${aiMode === 'fix' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>Fix Bugs</div><div className="text-[9px] text-[var(--text-muted)]">From selected bug reports</div></div>
              </button>
              <button
                onClick={() => setAiMode('create_multiplayer')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition cursor-pointer ${
                  aiMode === 'create_multiplayer' ? 'bg-blue-500/10 border-blue-500/30' : 'bg-[var(--surface-glass)] border-[var(--border)] hover:border-[var(--border-strong)]'
                }`}
              >
                <Gamepad2 className={`w-4 h-4 ${aiMode === 'create_multiplayer' ? 'text-blue-400' : 'text-[var(--text-muted)]'}`} />
                <div><div className={`text-xs font-bold ${aiMode === 'create_multiplayer' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>Multiplayer App</div><div className="text-[9px] text-[var(--text-muted)]">Real-time multiplayer game via RTDB</div></div>
              </button>
            </div>

            {/* Selected bugs (fix mode) */}
            {aiMode === 'fix' && selectedBugs.size > 0 && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4">
                <span className="text-[10px] font-bold text-[var(--accent-text)] uppercase tracking-widest">{selectedBugs.size} report{selectedBugs.size !== 1 ? 's' : ''} selected</span>
                <div className="mt-2 space-y-1.5">
                  {bugReports.filter(r => selectedBugs.has(r.id!)).map(r => (
                    <div key={r.id} className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] bg-[var(--panel-bg)] rounded-lg px-3 py-2">
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${CATEGORY_BADGES[r.category].color}`}>{r.category}</span>
                      <span className="truncate flex-1">{r.description.slice(0, 80)}{r.description.length > 80 ? '...' : ''}</span>
                      <button onClick={() => toggleBugSelect(r.id!)} className="shrink-0 p-0.5 text-[var(--text-muted)] hover:text-red-400 transition cursor-pointer">
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Context input */}
            <div>
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">
                {aiMode === 'fix' ? 'Additional Context' : 'Game / Activity Description'}
              </label>
              <textarea
                value={aiContext}
                onChange={e => setAiContext(e.target.value)}
                rows={4}
                placeholder={
                  aiMode === 'fix' ? 'Extra context about the bugs or how to reproduce them...'
                  : 'Describe the multiplayer game (e.g., Battleship, Quiz Duel, Word Race)...'
                }
                className="w-full bg-[var(--panel-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-purple-500/50 transition resize-none"
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
            <div className="bg-[var(--surface-glass)] backdrop-blur-md border border-[var(--border)] rounded-3xl p-6 h-full">
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 block">Generated Prompt Preview</label>
              <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-5 h-[calc(100%-2rem)] max-h-[600px] overflow-y-auto custom-scrollbar">
                <pre className="text-xs text-[var(--text-tertiary)] whitespace-pre-wrap font-mono leading-relaxed">{generatePrompt()}</pre>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminPanel;
