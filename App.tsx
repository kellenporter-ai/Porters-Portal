
import React, { useState, useEffect, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams, Outlet } from 'react-router-dom';
import { User, UserRole, Submission, DefaultClassTypes, Assignment, isValidUser } from './types';
import { dataService, clearDeniedCollections } from './services/dataService';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { ToastProvider } from './components/ToastProvider';
import ConnectionStatus from './components/ConnectionStatus';
import Layout from './components/Layout';
import GoogleLogin from './components/GoogleLogin';
import { ShieldAlert, KeyRound, Loader2, CheckCircle } from 'lucide-react';
import { TEACHER_DISPLAY_NAME } from './constants';
import ErrorBoundary, { FeatureErrorBoundary } from './components/ErrorBoundary';
import { ConfirmProvider } from './components/ConfirmDialog';
import { setSfxEnabled, setSfxVolume, preloadSounds } from './lib/sfx';
import { usePushNotifications } from './lib/usePushNotifications';
import BugReporter from './components/BugReporter';
import StreakDisplay from './components/StreakDisplay';
import RouteSkeleton from './components/RouteSkeleton';
import { AppDataProvider, useAppData } from './lib/AppDataContext';
import { AdminDataProvider, useAdminData } from './lib/AdminDataContext';
import { ChatProvider, useChat } from './lib/ChatContext';
import { TAB_TO_PATH, XP_SUB_ROUTES } from './lib/routes';
import { lazyWithRetry } from './lib/lazyWithRetry';

// ─── Lazy-loaded route components — auto-reload on stale chunk errors ───
const TeacherDashboard = lazyWithRetry(() => import('./components/TeacherDashboard'));
const UserManagement = lazyWithRetry(() => import('./components/UserManagement'));
const AdminPanel = lazyWithRetry(() => import('./components/AdminPanel'));
const XPManagement = lazyWithRetry(() => import('./components/XPManagement'));
const GroupManager = lazyWithRetry(() => import('./components/GroupManager'));
const PhysicsTools = lazyWithRetry(() => import('./components/PhysicsTools'));
const Communications = lazyWithRetry(() => import('./components/Communications'));
const StudentDashboard = lazyWithRetry(() => import('./components/StudentDashboard'));
const EvidenceLocker = lazyWithRetry(() => import('./components/EvidenceLocker'));
const Leaderboard = lazyWithRetry(() => import('./components/Leaderboard'));
const EnrollmentCodes = lazyWithRetry(() => import('./components/EnrollmentCodes'));
const LessonEditorPage = lazyWithRetry(() => import('./components/LessonEditorPage'));
const ResourceViewer = lazyWithRetry(() => import('./components/ResourceViewer'));
const StudentReports = lazyWithRetry(() => import('./components/StudentReports'));

const LazyFallback = () => <RouteSkeleton />;

// ─── Access Pending screen with enrollment code redemption ───
const AccessPendingScreen: React.FC<{ userName: string; userId: string; onLogout: () => void }> = ({ userName, userId, onLogout }) => {
  const [code, setCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleCodeChange = (raw: string) => {
    const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
    setCode(cleaned.length > 4 ? cleaned.slice(0, 4) + '-' + cleaned.slice(4) : cleaned);
    setError(null);
  };

  const handleRedeem = async () => {
    if (code.replace('-', '').length < 4) { setError('Please enter a valid enrollment code.'); return; }
    setIsRedeeming(true);
    setError(null);
    try {
      const result = await dataService.redeemEnrollmentCode(code, userId);
      if (result.success) {
        setSuccess(`Enrolled in ${result.classType}! Refreshing...`);
      } else {
        setError(result.error || 'Failed to redeem code.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0720] p-6">
      <div className="max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 p-10 rounded-3xl text-center shadow-2xl relative z-10">
        <ShieldAlert className="w-16 h-16 text-amber-500 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-white mb-4">Access Pending</h1>
        <p className="text-gray-300 mb-6">Hi {userName}! Your account is not yet enrolled in a class.</p>

        <div className="bg-black/20 border border-white/10 rounded-2xl p-6 mb-6 text-left">
          <label className="flex items-center gap-2 text-sm font-bold text-white mb-3">
            <KeyRound className="w-4 h-4 text-emerald-400" />
            Have an enrollment code?
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={e => handleCodeChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isRedeeming) handleRedeem(); }}
              placeholder="XXXX-XXXX"
              className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-center text-lg font-mono font-bold text-emerald-400 tracking-[0.2em] placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition"
              maxLength={9}
              disabled={isRedeeming || !!success}
            />
            <button
              onClick={handleRedeem}
              disabled={isRedeeming || !!success || code.replace('-', '').length < 4}
              className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold transition flex items-center gap-2"
            >
              {isRedeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join'}
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-400 animate-in fade-in slide-in-from-top-1 duration-200">{error}</p>}
          {success && (
            <p className="mt-3 text-sm text-emerald-400 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <CheckCircle className="w-4 h-4" /> {success}
            </p>
          )}
        </div>

        <p className="text-xs text-gray-500 mb-6">
          No code? Ask {TEACHER_DISPLAY_NAME} for one, or wait for manual authorization.
        </p>
        <button onClick={onLogout} className="w-full py-4 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-red-500/20 transition-all font-bold">Sign Out</button>
      </div>
    </div>
  );
};

// ─── Admin layout route — subscribes to admin-only data ───
const AdminLayout: React.FC = () => (
  <AdminDataProvider>
    <Outlet />
  </AdminDataProvider>
);

// ─── Route guard — blocks non-admin users from admin routes ───
const RequireAdmin: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  if (!isAdmin) return <Navigate to="/resources" replace />;
  return <Outlet />;
};

// ─── Reverse lookup for XP sub-route slugs → tab names ───
const XP_SLUG_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(XP_SUB_ROUTES).map(([name, slug]) => [slug, name])
);

// ─── Floating overlays (PhysicsTools + Communications) ───
const FloatingOverlays: React.FC<{ user: User }> = ({ user }) => {
  const { assignments, classConfigs, enabledFeatures } = useAppData();
  const { unreadChannels, markChannelRead, isCommOpen, setIsCommOpen } = useChat();
  const navigate = useNavigate();

  const showTools = user.role === UserRole.ADMIN || enabledFeatures.physicsTools;
  const showComm = user.role === UserRole.ADMIN || enabledFeatures.communications;

  return (
    <FeatureErrorBoundary feature="Floating Tools">
    <Suspense fallback={null}>
      {showTools && (
        <PhysicsTools
          onToggleChat={showComm ? () => setIsCommOpen(!isCommOpen) : undefined}
          hasUnreadChat={unreadChannels.size > 0}
        />
      )}
      {showComm && (
        <Communications
          user={user}
          isOpen={isCommOpen}
          onClose={() => setIsCommOpen(false)}
          assignments={assignments}
          classConfigs={classConfigs}
          unreadChannels={unreadChannels}
          onMarkChannelRead={markChannelRead}
          onOpenResource={(id) => navigate(`/resources/${id}`)}
        />
      )}
    </Suspense>
    </FeatureErrorBoundary>
  );
};

// ─── Admin route wrappers (pull from AdminDataContext) ───
const DashboardRoute: React.FC = () => {
  const { users, submissions } = useAdminData();
  const { assignments } = useAppData();
  return <TeacherDashboard users={users} assignments={assignments} submissions={submissions} />;
};

const AdminPanelRoute: React.FC = () => {
  const { rawUsers, submissions } = useAdminData();
  return <AdminPanel assignments={[]} submissions={submissions} users={rawUsers} onCreateAssignment={undefined as never} classConfigs={[]} />;
};

const UserManagementRoute: React.FC = () => {
  const { users, whitelistedEmails } = useAdminData();
  const { classConfigs } = useAppData();
  return <UserManagement users={users} whitelistedEmails={whitelistedEmails} classConfigs={classConfigs} onWhitelist={async (e, c) => dataService.addToWhitelist(e, c)} />;
};

const GroupsRoute: React.FC = () => {
  const { users, availableSections } = useAdminData();
  return <GroupManager students={users.filter(u => u.role === 'STUDENT')} availableSections={availableSections} fullPage />;
};

const EnrollmentRoute: React.FC = () => {
  const { availableSections } = useAdminData();
  const { classConfigs } = useAppData();
  return <EnrollmentCodes classConfigs={classConfigs} availableSections={availableSections} />;
};

const EditorRoute: React.FC = () => {
  const { rawUsers, availableSections } = useAdminData();
  const { assignments, classConfigs } = useAppData();
  const navigate = useNavigate();
  return (
    <LessonEditorPage
      assignments={assignments}
      onClose={() => navigate('/admin')}
      classConfigs={classConfigs}
      users={rawUsers}
      availableSections={availableSections}
      onCreateAssignment={async (p) => { if (p.title) await dataService.addAssignment(p as Assignment); }}
    />
  );
};

const StudentReportsRoute: React.FC = () => {
  const { users, submissions } = useAdminData();
  const { assignments } = useAppData();
  return <StudentReports users={users} assignments={assignments} submissions={submissions} />;
};

const XPRoute: React.FC = () => {
  const { tab } = useParams<{ tab: string }>();
  const { rawUsers } = useAdminData();
  const tabName = XP_SLUG_TO_TAB[tab || 'operatives'] || 'Operatives';
  return <XPManagement users={rawUsers} initialTab={tabName} />;
};

// ─── Main App ───
const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Student-scoped submission subscription (cheap — single user)
  const [studentSubmissions, setStudentSubmissions] = useState<Submission[]>([]);

  // Auth init
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await handleSession(firebaseUser);
        unsubProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (snapshot) => {
          if (snapshot.exists()) {
            const raw = { ...snapshot.data(), id: firebaseUser.uid };
            if (isValidUser(raw)) {
              setUser(prev => ({ ...(prev || {}), ...raw } as User));
            }
          }
        });
      } else {
        setUser(null);
        clearDeniedCollections();
        if (unsubProfile) unsubProfile();
        setIsLoading(false);
      }
    });
    return () => { unsubscribeAuth(); if (unsubProfile) unsubProfile(); };
  }, []);

  // Student submissions — scoped to one user, stays in App (cheap)
  useEffect(() => {
    if (!user || user.role === UserRole.ADMIN || !user.isWhitelisted) return;
    const unsub = dataService.subscribeToUserSubmissions(user.id, setStudentSubmissions);
    return () => unsub();
  }, [user?.id, user?.isWhitelisted, user?.role]);

  // Sync sound effects setting + volume
  useEffect(() => {
    setSfxEnabled(user?.settings?.soundEffects !== false);
    setSfxVolume(user?.settings?.soundVolume ?? 0.5);
  }, [user?.settings?.soundEffects, user?.settings?.soundVolume]);

  // Preload critical sound files on mount
  useEffect(() => {
    preloadSounds();
  }, []);

  // Browser push notifications
  usePushNotifications(user?.id || null, user?.settings?.pushNotifications === true);

  const handleSession = async (firebaseUser: FirebaseUser) => {
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const whitelistDoc = await getDoc(doc(db, 'allowed_emails', firebaseUser.email || ''));
      const tokenResult = await firebaseUser.getIdTokenResult();
      const isAdmin = tokenResult.claims.admin === true;

      const isWhitelisted = whitelistDoc.exists() || isAdmin;
      const whitelistData = whitelistDoc.exists() ? whitelistDoc.data() : null;
      const assignedClass = whitelistData?.classType || DefaultClassTypes.UNCATEGORIZED;
      const assignedClasses: string[] = whitelistData?.classTypes || (assignedClass !== DefaultClassTypes.UNCATEGORIZED ? [assignedClass] : []);

      await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);

        if (!userSnap.exists()) {
          transaction.set(userRef, {
            email: firebaseUser.email,
            name: firebaseUser.displayName || 'Student',
            avatarUrl: firebaseUser.photoURL || '',
            role: isAdmin ? 'ADMIN' : 'STUDENT',
            classType: assignedClass,
            enrolledClasses: isWhitelisted ? assignedClasses : [],
            isWhitelisted: isWhitelisted,
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            gamification: { xp: 0, level: 1, currency: 0, badges: [], privacyMode: false, classXp: {} },
            settings: { liveBackground: true, performanceMode: false, privacyMode: false, compactView: false }
          });
        } else {
          const existingData = userSnap.data();
          const updates: Record<string, unknown> = {
            lastLoginAt: new Date().toISOString(),
            isWhitelisted: isWhitelisted
          };
          if (isAdmin) updates.role = 'ADMIN';
          if (!isWhitelisted && !isAdmin) updates.enrolledClasses = [];
          if (isWhitelisted && assignedClasses.length > 0) {
            const existing: string[] = existingData.enrolledClasses || [];
            const merged = Array.from(new Set([...existing, ...assignedClasses]));
            if (merged.length !== existing.length) {
              updates.enrolledClasses = merged;
              if (!existingData.classType || existingData.classType === DefaultClassTypes.UNCATEGORIZED) {
                updates.classType = assignedClasses[0];
              }
            }
          }
          transaction.update(userRef, updates);
        }
      });
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  const handleLogout = async () => { await signOut(auth); setUser(null); };

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-[#0f0720] text-white font-mono">ESTABLISHING CONNECTION...</div>;
  if (!user) return <GoogleLogin />;

  if (!user.isWhitelisted && user.role !== UserRole.ADMIN) {
    return <AccessPendingScreen userName={user.name} userId={user.id} onLogout={handleLogout} />;
  }

  const isAdmin = user.role === UserRole.ADMIN;
  const defaultPath = isAdmin ? '/dashboard' : '/home';

  return (
    <ErrorBoundary>
    <ConfirmProvider>
    <ToastProvider>
    <AppDataProvider user={user}>
    <ChatProvider user={user}>
    <>
      <ConnectionStatus />
      <FloatingOverlays user={user} />

      <Routes>
        <Route element={<Layout user={user} onLogout={handleLogout} />}>
          {/* ─── Admin routes (role-gated, wrapped in AdminDataProvider) ─── */}
          <Route element={<RequireAdmin isAdmin={isAdmin} />}>
            <Route element={<AdminLayout />}>
              <Route path="/dashboard" element={<Suspense fallback={<LazyFallback />}><FeatureErrorBoundary feature="Teacher Dashboard"><DashboardRoute /></FeatureErrorBoundary></Suspense>} />
              <Route path="/admin" element={<Suspense fallback={<LazyFallback />}><FeatureErrorBoundary feature="Admin Panel"><AdminPanelRoute /></FeatureErrorBoundary></Suspense>} />
              <Route path="/editor" element={<Suspense fallback={<LazyFallback />}><FeatureErrorBoundary feature="Lesson Editor"><EditorRoute /></FeatureErrorBoundary></Suspense>} />
              <Route path="/users" element={<Suspense fallback={<LazyFallback />}><FeatureErrorBoundary feature="User Management"><UserManagementRoute /></FeatureErrorBoundary></Suspense>} />
              <Route path="/groups" element={<Suspense fallback={<LazyFallback />}><FeatureErrorBoundary feature="Groups"><GroupsRoute /></FeatureErrorBoundary></Suspense>} />
              <Route path="/enrollment" element={<Suspense fallback={<LazyFallback />}><FeatureErrorBoundary feature="Enrollment"><EnrollmentRoute /></FeatureErrorBoundary></Suspense>} />
              <Route path="/reports" element={<Suspense fallback={<LazyFallback />}><FeatureErrorBoundary feature="Reports"><StudentReportsRoute /></FeatureErrorBoundary></Suspense>} />
              <Route path="/xp/:tab" element={<Suspense fallback={<LazyFallback />}><FeatureErrorBoundary feature="XP Management"><XPRoute /></FeatureErrorBoundary></Suspense>} />
            </Route>
          </Route>

          {/* ─── Student routes ─── */}
          <Route path="/home" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="HOME" />
            </Suspense>
          } />
          <Route path="/resources" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="RESOURCES" />
            </Suspense>
          } />
          <Route path="/loadout" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="LOADOUT" />
            </Suspense>
          } />
          <Route path="/missions" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="MISSIONS" />
            </Suspense>
          } />
          <Route path="/badges" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="ACHIEVEMENTS" />
            </Suspense>
          } />
          <Route path="/skills" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="SKILLS" />
            </Suspense>
          } />
          <Route path="/fortune" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="FORTUNE" />
            </Suspense>
          } />
          <Route path="/flux-shop" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="FLUX_SHOP" />
            </Suspense>
          } />
          <Route path="/tutoring" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="TUTORING" />
            </Suspense>
          } />
          <Route path="/intel" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="INTEL" />
            </Suspense>
          } />
          <Route path="/progress" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="PROGRESS" />
            </Suspense>
          } />
          <Route path="/calendar" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="CALENDAR" />
            </Suspense>
          } />
          <Route path="/dungeons" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="DUNGEONS" />
            </Suspense>
          } />
          <Route path="/arena" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="ARENA" />
            </Suspense>
          } />
          <Route path="/deploy" element={
            <Suspense fallback={<LazyFallback />}>
              <StudentRouteWrapper user={user} submissions={studentSubmissions} tab="DEPLOY" />
            </Suspense>
          } />
          <Route path="/forensics" element={
            <Suspense fallback={<LazyFallback />}><FeatureErrorBoundary feature="Evidence Locker"><EvidenceLocker user={user} /></FeatureErrorBoundary></Suspense>
          } />
          <Route path="/leaderboard" element={
            <Suspense fallback={<LazyFallback />}><FeatureErrorBoundary feature="Leaderboard"><Leaderboard user={user} /></FeatureErrorBoundary></Suspense>
          } />

          {/* ─── Resource viewer (shared — both admin and student) ─── */}
          <Route path="/resources/:id" element={
            <Suspense fallback={<LazyFallback />}><FeatureErrorBoundary feature="Resource Viewer"><ResourceViewer user={user} /></FeatureErrorBoundary></Suspense>
          } />

          {/* ─── Default + catch-all ─── */}
          <Route path="/" element={<Navigate to={defaultPath} replace />} />
          <Route path="*" element={<Navigate to={defaultPath} replace />} />
        </Route>
      </Routes>

      <BugReporter user={user} />
      {user.role === UserRole.STUDENT && (
        <div className="fixed top-3 right-48 z-30">
          <StreakDisplay userId={user.id} compact />
        </div>
      )}
    </>
    </ChatProvider>
    </AppDataProvider>
    </ToastProvider>
    </ConfirmProvider>
    </ErrorBoundary>
  );
};

// ─── Student route wrapper (passes AppData + submissions to StudentDashboard) ───
const StudentRouteWrapper: React.FC<{
  user: User;
  submissions: Submission[];
  tab: 'HOME' | 'RESOURCES' | 'LOADOUT' | 'MISSIONS' | 'ACHIEVEMENTS' | 'SKILLS' | 'FORTUNE' | 'FLUX_SHOP' | 'TUTORING' | 'INTEL' | 'PROGRESS' | 'CALENDAR' | 'DUNGEONS' | 'ARENA' | 'DEPLOY';
}> = ({ user, submissions, tab }) => {
  const { assignments, classConfigs, enabledFeatures, loading } = useAppData();
  const navigate = useNavigate();

  if (loading) return <RouteSkeleton />;

  return (
    <StudentDashboard
      user={user}
      assignments={assignments}
      submissions={submissions}
      classConfigs={classConfigs}
      enabledFeatures={enabledFeatures}
      onNavigate={(tabName) => navigate(TAB_TO_PATH[tabName] || '/')}
      onStartAssignment={(id) => navigate(`/resources/${id}`)}
      studentTab={tab}
    />
  );
};

export default App;
