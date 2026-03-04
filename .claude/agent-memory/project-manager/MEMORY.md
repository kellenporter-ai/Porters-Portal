# Project Manager Memory

## Project Architecture
- **Stack:** React + TypeScript, Firebase Firestore, Tailwind CSS
- **Key entity:** `Assignment` (types.ts line 113-367) serves as both "resource" and "assignment"
- **Data service:** `services/dataService.ts` -- all Firestore CRUD in one service object
- **Student view:** `StudentDashboard.tsx` -> `ResourcesTab.tsx` (unit-grouped card list)
- **Teacher view:** `LessonEditorPage.tsx` + `lesson-editor/ResourceSidebar.tsx` (sidebar + editor)
- **Resource detail:** `ResourceViewer.tsx` (renders Proctor for a single resource)
- **Unit ordering:** `sortUnitKeys()` in `AdminPanel.tsx`, uses `ClassConfig.unitOrder`

## Key Data Model Gaps
- `Assignment` type has NO `createdAt` or `updatedAt` field
- `addAssignment()` in dataService does NOT write `createdAt` to Firestore
- `subscribeToAssignments()` does NOT read `createdAt` from Firestore docs
- Student ResourcesTab items are NOT sorted within units (just insertion order)
- ResourceCategory type: 'Textbook' | 'Supplemental' | 'Lab Guide' | 'Practice Set' | 'Simulation' | 'Article' | 'Video Lesson'

## UI Patterns
- Dark theme: bg-white/5, border-white/10, text-gray-300/400/500
- Tiny labels: text-[8px] to text-[10px], uppercase tracking-widest
- Cards: bg-white/5 border hover:border-purple-500/40 rounded-xl
- Category badges: small colored pills with icons
- Uses lucide-react icons throughout
