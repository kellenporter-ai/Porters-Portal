// Google Classroom REST API client wrapper
// Uses Google Identity Services (GIS) for OAuth and raw fetch() for API calls.
// No Firebase dependencies — this is a standalone module.

// --- GIS type declarations (loaded via script tag) ---
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

// --- Exported types ---

export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
}

export interface ClassroomCourseWork {
  id: string;
  title: string;
  maxPoints: number;
  state: string;
}

// --- Helpers ---

const CLASSROOM_BASE = 'https://classroom.googleapis.com/v1';

const SCOPES = [
  'https://www.googleapis.com/auth/classroom.coursework.students',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
].join(' ');

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function classroomFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(token), ...init?.headers },
  });

  if (res.status === 401) {
    throw new Error('Classroom API returned 401 — please re-authenticate.');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Classroom API error ${res.status}: ${body}`);
  }

  return res.json();
}

/** Dynamically load the GIS script if it isn't already present. */
function ensureGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      // Script tag exists but hasn't finished loading yet
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services script')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(script);
  });
}

// --- Public API ---

/**
 * Open an OAuth popup via GIS and return the access token.
 */
export async function requestClassroomAccess(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID is not set. Add it to your .env file to enable Google Classroom integration.'
    );
  }

  await ensureGisScript();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(`OAuth error: ${response.error}`));
        } else if (response.access_token) {
          resolve(response.access_token);
        } else {
          reject(new Error('No access token received from Google'));
        }
      },
    });
    client.requestAccessToken();
  });
}

/**
 * Fetch active courses where the current user is a teacher.
 */
export async function fetchCourses(token: string): Promise<ClassroomCourse[]> {
  const courses: ClassroomCourse[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${CLASSROOM_BASE}/courses`);
    url.searchParams.set('teacherId', 'me');
    url.searchParams.set('courseStates', 'ACTIVE');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const data = await classroomFetch<{
      courses?: Array<{ id: string; name: string; section?: string }>;
      nextPageToken?: string;
    }>(url.toString(), token);

    if (data.courses) {
      courses.push(
        ...data.courses.map((c) => ({
          id: c.id,
          name: c.name,
          section: c.section,
        }))
      );
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return courses;
}

/**
 * Fetch all course work items for a given course.
 */
export async function fetchCourseWork(token: string, courseId: string): Promise<ClassroomCourseWork[]> {
  const items: ClassroomCourseWork[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${CLASSROOM_BASE}/courses/${courseId}/courseWork`);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const data = await classroomFetch<{
      courseWork?: Array<{ id: string; title: string; maxPoints: number; state: string }>;
      nextPageToken?: string;
    }>(url.toString(), token);

    if (data.courseWork) {
      items.push(
        ...data.courseWork.map((cw) => ({
          id: cw.id,
          title: cw.title,
          maxPoints: cw.maxPoints,
          state: cw.state,
        }))
      );
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

/**
 * Push a grade for a single student to a Classroom course work item.
 * Returns { success: true } on success or { success: false, error } on failure.
 * Does NOT throw for "student not found" — that's an expected scenario.
 */
export async function pushGrade(
  token: string,
  courseId: string,
  courseWorkId: string,
  studentEmail: string,
  points: number,
  _maxPoints: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Find the student's submission
    const subsUrl = `${CLASSROOM_BASE}/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions?userId=${encodeURIComponent(studentEmail)}`;
    const subsData = await classroomFetch<{
      studentSubmissions?: Array<{ id: string }>;
    }>(subsUrl, token);

    if (!subsData.studentSubmissions || subsData.studentSubmissions.length === 0) {
      return { success: false, error: 'Student not found in Google Classroom' };
    }

    const submissionId = subsData.studentSubmissions[0].id;

    // 2. Patch the submission with the grade
    const patchUrl = `${CLASSROOM_BASE}/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${submissionId}?updateMask=assignedGrade,draftGrade`;
    await classroomFetch(patchUrl, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedGrade: points, draftGrade: points }),
    });

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Push grades for multiple students sequentially (respects rate limits).
 */
export async function batchPushGrades(
  token: string,
  courseId: string,
  courseWorkId: string,
  grades: Array<{ studentEmail: string; points: number; maxPoints: number }>
): Promise<Array<{ studentEmail: string; success: boolean; error?: string }>> {
  const results: Array<{ studentEmail: string; success: boolean; error?: string }> = [];

  for (const g of grades) {
    const result = await pushGrade(token, courseId, courseWorkId, g.studentEmail, g.points, g.maxPoints);
    results.push({ studentEmail: g.studentEmail, ...result });
  }

  return results;
}
