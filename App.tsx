
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, UserRole, ClassConfig, Assignment, Submission, TelemetryMetrics, WhitelistedUser, DefaultClassTypes } from './types';
import { dataService } from './services/dataService';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ToastProvider } from './components/ToastProvider';
import ConnectionStatus from './components/ConnectionStatus';
import Layout from './components/Layout';
import Proctor from './components/Proctor';
import GoogleLogin from './components/GoogleLogin';
import TeacherDashboard from './components/TeacherDashboard';
import UserManagement from './components/UserManagement';
import AdminPanel from './components/AdminPanel';
import XPManagement from './components/XPManagement';
import PhysicsTools from './components/PhysicsTools';
import Communications from './components/Communications';
import { ShieldAlert, ArrowLeft, Settings as SettingsIcon, Users, Brain, BookOpen as BookOpenIcon } from 'lucide-react';
import { ADMIN_EMAIL, TEACHER_DISPLAY_NAME } from './constants';

// New Modules
import StudentDashboard from './components/StudentDashboard';
import EvidenceLocker from './components/EvidenceLocker';
import PhysicsLab from './components/PhysicsLab';
import Leaderboard from './components/Leaderboard';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmProvider } from './components/ConfirmDialog';
import ReviewQuestions from './components/ReviewQuestions';
import StudyMaterial from './components/StudyMaterial';
import { setSfxEnabled } from './lib/sfx';
import { usePushNotifications } from './lib/usePushNotifications';

const STUDENT_TAB_MAP: Record<string, 'RESOURCES' | 'LOADOUT' | 'MISSIONS' | 'ACHIEVEMENTS' | 'SKILLS' | 'FORTUNE' | 'TUTORING'> = {
  'Resources': 'RESOURCES',
  'Agent Loadout': 'LOADOUT',
  'Missions': 'MISSIONS',
  'Badges': 'ACHIEVEMENTS',
  'Skills': 'SKILLS',
  'Fortune': 'FORTUNE',
  'Tutoring': 'TUTORING',
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('Dashboard');
  
  // Real-time Data States
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [rawUsers, setRawUsers] = useState<User[]>([]);
  const [whitelistedEmails, setWhitelistedEmails] = useState<WhitelistedUser[]>([]);
  const [classConfigs, setClassConfigs] = useState<ClassConfig[]>([]);
  
  // UI States
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [adminViewMode, setAdminViewMode] = useState<'STUDENT' | 'ADMIN'>('STUDENT');
  const [assignViewMode, setAssignViewMode] = useState<'WORK' | 'REVIEW' | 'STUDY'>('WORK');
  const [hasQuestionBank, setHasQuestionBank] = useState(false);
  const [hasStudyMaterial, setHasStudyMaterial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCommOpen, setIsCommOpen] = useState(false);

  // Computed State
  const users = useMemo(() => {
    // Pre-index submissions by userId for O(n) lookup
    const subsByUser = new Map<string, Submission[]>();
    submissions.forEach(s => {
        const arr = subsByUser.get(s.userId) || [];
        arr.push(s);
        subsByUser.set(s.userId, arr);
    });

    return rawUsers.map(u => {
        const userSubs = subsByUser.get(u.id) || [];
        const resourcesAccessed = userSubs.length; 
        const totalTimeMin = Math.round(userSubs.reduce((acc, s) => acc + (s.metrics?.engagementTime || 0), 0) / 60);

        return {
            ...u,
            stats: {
                problemsCompleted: resourcesAccessed,
                avgScore: 0,
                rawAccuracy: 0,
                totalTime: totalTimeMin
            }
        };
    });
  }, [rawUsers, submissions]);

  const availableSections = useMemo(() => {
    const sections = new Set<string>();
    rawUsers.forEach(u => { if (u.section) sections.add(u.section); });
    return Array.from(sections).sort();
  }, [rawUsers]);

  const activeAssignment = useMemo(() =>
    assignments.find(a => a.id === activeAssignmentId) || null
  , [assignments, activeAssignmentId]);

  // Probe which supplemental tabs exist for the active assignment
  useEffect(() => {
    setHasQuestionBank(false);
    setHasStudyMaterial(false);
    if (!activeAssignmentId) return;
    const checkQuestions = getDoc(doc(db, 'question_banks', activeAssignmentId)).then(snap => {
      if (snap.exists() && (snap.data().questions || []).length > 0) setHasQuestionBank(true);
    }).catch(() => {});
    const checkStudy = getDoc(doc(db, 'reading_materials', activeAssignmentId)).then(snap => {
      if (snap.exists()) setHasStudyMaterial(true);
    }).catch(() => {});
    // If the view was on a tab that no longer exists, reset to WORK
    Promise.all([checkQuestions, checkStudy]).then(() => {});
  }, [activeAssignmentId]);

  // Auth Init
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await handleSession(firebaseUser);
        unsubProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (snapshot) => {
            if (snapshot.exists()) {
                setUser(prev => ({ ...(prev || {}), ...snapshot.data(), id: firebaseUser.uid } as User));
            }
        });
      } else {
        setUser(null);
        if (unsubProfile) unsubProfile();
        setIsLoading(false);
      }
    });
    return () => { unsubscribeAuth(); if (unsubProfile) unsubProfile(); };
  }, []);

  // Data Subscriptions
  useEffect(() => {
    if (user && (user.isWhitelisted || user.role === UserRole.ADMIN)) {
        const unsubAssignments = dataService.subscribeToAssignments(setAssignments);
        const unsubConfigs = dataService.subscribeToClassConfigs(setClassConfigs);
        const unsubs = [unsubAssignments, unsubConfigs];

        if (user.role === UserRole.ADMIN) {
            // Admin: load all submissions, all users, whitelist
            unsubs.push(dataService.subscribeToSubmissions(setSubmissions));
            unsubs.push(dataService.subscribeToUsers(setRawUsers));
            unsubs.push(dataService.subscribeToWhitelist(setWhitelistedEmails));
        } else {
            // Student: only their own submissions (avoids Firestore permission errors)
            unsubs.push(dataService.subscribeToUserSubmissions(user.id, setSubmissions));
        }

        return () => unsubs.forEach(u => u());
    }
  }, [user?.id, user?.isWhitelisted, user?.role]);

  // Redirect students from Dashboard to Resources (their default view)
  useEffect(() => {
    if (user?.role === UserRole.STUDENT && activeTab === 'Dashboard') {
      setActiveTab('Resources');
    }
  }, [user?.role, activeTab]);

  // Sync sound effects setting
  useEffect(() => {
    setSfxEnabled(user?.settings?.soundEffects !== false);
  }, [user?.settings?.soundEffects]);

  // Browser push notifications (fires native notifications when tab is backgrounded)
  usePushNotifications(
    user?.id || null,
    user?.settings?.pushNotifications === true
  );

  const handleSession = async (firebaseUser: FirebaseUser) => {
    try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        
        const whitelistDoc = await getDoc(doc(db, 'allowed_emails', firebaseUser.email || ''));
        
        // Check admin via Custom Claims (set by Cloud Function), with email fallback for bootstrap
        const tokenResult = await firebaseUser.getIdTokenResult();
        const isAdmin = tokenResult.claims.admin === true || firebaseUser.email === ADMIN_EMAIL;
        
        const isWhitelisted = whitelistDoc.exists() || isAdmin;
        const whitelistData = whitelistDoc.exists() ? whitelistDoc.data() : null;
        const assignedClass = whitelistData?.classType || DefaultClassTypes.UNCATEGORIZED;
        const assignedClasses: string[] = whitelistData?.classTypes || (assignedClass !== DefaultClassTypes.UNCATEGORIZED ? [assignedClass] : []);

        if (!userSnap.exists()) {
            const newUserProfile = {
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
            };
            await setDoc(userRef, newUserProfile);
        } else {
            const existingData = userSnap.data();
            const updates: Record<string, unknown> = {
                lastLoginAt: new Date().toISOString(),
                isWhitelisted: isWhitelisted
            };
            // If they have admin claim, ensure role is synced
            if (isAdmin) {
                updates.role = 'ADMIN';
            }
            if (!isWhitelisted && !isAdmin) {
                updates.enrolledClasses = [];
            }
            // Merge all whitelisted classes into enrolledClasses
            if (isWhitelisted && assignedClasses.length > 0) {
                const existing: string[] = existingData.enrolledClasses || [];
                const merged = Array.from(new Set([...existing, ...assignedClasses]));
                if (merged.length !== existing.length) {
                    updates.enrolledClasses = merged;
                    // Only update classType if user doesn't have one yet
                    if (!existingData.classType || existingData.classType === DefaultClassTypes.UNCATEGORIZED) {
                        updates.classType = assignedClasses[0];
                    }
                }
            }
            await updateDoc(userRef, updates);
        }
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  const handleLogout = async () => { await signOut(auth); setUser(null); setActiveAssignmentId(null); };

  const openAssignment = (id: string) => {
    setAssignViewMode('WORK');
    setActiveAssignmentId(id);
  };

  // Keep refs for engagement submission so unmount cleanup always has current values
  const activeAssignmentRef = useRef(activeAssignment);
  const userRef = useRef(user);
  useEffect(() => { activeAssignmentRef.current = activeAssignment; }, [activeAssignment]);
  useEffect(() => { userRef.current = user; }, [user]);

  const handleEngagementComplete = async (metrics: TelemetryMetrics) => {
    const u = userRef.current;
    const a = activeAssignmentRef.current;
    if (!u || !a || u.role === UserRole.ADMIN) return;
    if (metrics.engagementTime < 10) return;
    try {
        await dataService.submitEngagement(
            u.id,
            u.name,
            a.id,
            a.title,
            metrics,
            a.classType
        );
    } catch (err) {
        console.error("Engagement submission failed:", err);
    }
  };

  // Must be before early returns to satisfy Rules of Hooks (constant hook order)
  const enabledFeatures = useMemo(() => {
    const defaults = { physicsLab: true, evidenceLocker: true, leaderboard: true, physicsTools: true, communications: true };
    if (user && user.role === 'STUDENT' && user.classType) {
        const config = classConfigs.find(c => c.className === user.classType);
        if (config) return config.features;
    }
    return defaults;
  }, [user?.role, user?.classType, classConfigs]);

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-[#0f0720] text-white font-mono">ESTABLISHING CONNECTION...</div>;
  if (!user) return <GoogleLogin />;

  if (!user.isWhitelisted && user.role !== UserRole.ADMIN) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0720] p-6">
        <div className="max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 p-10 rounded-3xl text-center shadow-2xl relative z-10">
            <ShieldAlert className="w-16 h-16 text-amber-500 mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-white mb-4">Access Pending</h1>
            <p className="text-gray-300 mb-8">Hi {user.name}! Your account is currently restricted. Please contact {TEACHER_DISPLAY_NAME} for authorization.</p>
            <button onClick={handleLogout} className="w-full py-4 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-red-500/20 transition-all font-bold">Sign Out</button>
        </div>
      </div>
    );
  }

  const showTools = user.role === UserRole.ADMIN || enabledFeatures.physicsTools;
  const showComm = user.role === UserRole.ADMIN || enabledFeatures.communications;

  return (
    <ErrorBoundary>
    <ConfirmProvider>
    <ToastProvider>
    <>
      <ConnectionStatus />
      {showTools && (
        <PhysicsTools 
          onToggleChat={showComm ? () => setIsCommOpen(!isCommOpen) : undefined} 
        />
      )}
      
      {showComm && (
        <Communications 
            user={user} 
            isOpen={isCommOpen} 
            onClose={() => setIsCommOpen(false)} 
            assignments={assignments}
            classConfigs={classConfigs}
            onOpenResource={(id) => {
                openAssignment(id);
            }}
        />
      )}

      <Layout user={user} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab}>
        {activeAssignment ? (
          <div className="space-y-4 h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-md gap-4">
              <div className="flex-1">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    {activeAssignment.title}
                    {user.role === UserRole.ADMIN && (
                        <span className="text-[10px] bg-purple-600 px-2 py-1 rounded-full uppercase tracking-widest">Admin Control</span>
                    )}
                </h2>
                <div className="flex gap-4 mt-2">
                    <button onClick={() => setAssignViewMode('WORK')} className={`text-sm font-bold pb-1 border-b-2 transition ${assignViewMode === 'WORK' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400'}`}>Resource</button>
                    {hasQuestionBank && (
                        <button onClick={() => setAssignViewMode('REVIEW')} className={`text-sm font-bold pb-1 border-b-2 transition flex items-center gap-1.5 ${assignViewMode === 'REVIEW' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400'}`}><Brain className="w-3.5 h-3.5" /> Review</button>
                    )}
                    {hasStudyMaterial && (
                        <button onClick={() => setAssignViewMode('STUDY')} className={`text-sm font-bold pb-1 border-b-2 transition flex items-center gap-1.5 ${assignViewMode === 'STUDY' ? 'border-purple-500 text-white' : 'border-transparent text-gray-400'}`}><BookOpenIcon className="w-3.5 h-3.5" /> Study Material</button>
                    )}
                </div>
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto">
                {user.role === 'ADMIN' && (
                    <div className="flex bg-black/40 rounded-lg p-1 border border-white/10 text-[10px] font-bold">
                        <button onClick={() => setAdminViewMode('STUDENT')} className={`px-3 py-1.5 rounded transition ${adminViewMode === 'STUDENT' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>Student View</button>
                        <button onClick={() => setAdminViewMode('ADMIN')} className={`px-3 py-1.5 rounded transition ${adminViewMode === 'ADMIN' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>Admin View</button>
                    </div>
                )}
                <button onClick={() => { setActiveAssignmentId(null); setAssignViewMode('WORK'); }} className="text-gray-400 hover:text-white transition flex items-center gap-1 text-sm bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                    <ArrowLeft className="w-4 h-4" /> Exit
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {assignViewMode === 'WORK' && (
                    <div className="h-full flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <Proctor 
                                onComplete={handleEngagementComplete} 
                                contentUrl={activeAssignment.contentUrl}
                                htmlContent={activeAssignment.htmlContent}
                                userId={user.id}
                                assignmentId={activeAssignment.id}
                                classType={activeAssignment.classType}
                            />
                        </div>
                        {adminViewMode === 'ADMIN' && user.role === UserRole.ADMIN && (
                            <div className="w-full md:w-72 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md animate-in slide-in-from-right duration-300 overflow-y-auto">
                                <h3 className="font-bold text-white mb-4 flex items-center gap-2"><SettingsIcon className="w-4 h-4 text-purple-400" /> Admin Controls</h3>
                                <div className="space-y-6">
                                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                        <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest block mb-2">Active Engagement</label>
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center text-purple-400">
                                                <Users className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="text-2xl font-bold text-white">{submissions.filter(s => s.assignmentId === activeAssignment.id && !s.isArchived).length}</div>
                                                <div className="text-[10px] text-gray-500">Live Operatives</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                        <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest block mb-2">Collaboration</label>
                                        <button 
                                            onClick={() => setIsCommOpen(true)}
                                            className="w-full bg-indigo-600 border border-indigo-500 py-2 rounded-lg text-xs font-bold text-white hover:bg-indigo-500 transition"
                                        >
                                            Open Class Chat
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {assignViewMode === 'REVIEW' && (
                    <div className="h-full bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                        <ReviewQuestions assignment={activeAssignment} />
                    </div>
                )}
                {assignViewMode === 'STUDY' && (
                    <div className="h-full bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
                        <StudyMaterial assignment={activeAssignment} onComplete={handleEngagementComplete} />
                    </div>
                )}
            </div>
          </div>
        ) : (
          <div className="h-full">
            <div key={activeTab} className="h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
            {user.role === UserRole.ADMIN && (
              <>
                  {activeTab === 'Dashboard' && <TeacherDashboard users={users} assignments={assignments} submissions={submissions} />}
                  {activeTab === 'User Management' && <UserManagement users={users} whitelistedEmails={whitelistedEmails} classConfigs={classConfigs} onWhitelist={async (e, c) => dataService.addToWhitelist(e, c)} />}
                  {activeTab === 'Admin Panel' && (
                    <AdminPanel
                      assignments={assignments}
                      submissions={submissions}
                      onCreateAssignment={async (p) => { if(p.title) await dataService.addAssignment(p as Assignment); }}
                      classConfigs={classConfigs}
                      availableSections={availableSections}
                      onPreviewAssignment={(id) => {
                        setAdminViewMode('STUDENT');
                        openAssignment(id);
                      }}
                    />
                  )}
                  {activeTab === 'XP Command' && <XPManagement users={rawUsers} />}
              </>
            )}

            {user.role === UserRole.STUDENT && (
               <>
                  {activeTab in STUDENT_TAB_MAP && <StudentDashboard user={user} assignments={assignments} submissions={submissions} enabledFeatures={enabledFeatures} onNavigate={setActiveTab} onStartAssignment={openAssignment} studentTab={STUDENT_TAB_MAP[activeTab]} />}
                  {activeTab === 'Forensics' && enabledFeatures.evidenceLocker && <EvidenceLocker user={user} />}
                  {activeTab === 'Physics Lab' && enabledFeatures.physicsLab && <PhysicsLab user={user} />}
                  {activeTab === 'Leaderboard' && enabledFeatures.leaderboard && <Leaderboard user={user} />}
               </>
            )}
            </div>
          </div>
        )}
      </Layout>
    </>
    </ToastProvider>
    </ConfirmProvider>
    </ErrorBoundary>
  );
};

export default App;
