# Backend Infrastructure Reference (2026)

## Cloud Functions v2 Architecture

### Concurrency Model
Cloud Functions v2 is built on Google Cloud Run. Key advantage: a single function instance can handle multiple simultaneous requests, amortizing cold start cost across multiple users.

### Cold Start Mitigation
- **Avoid wrapping every Firestore write in a Cloud Function.** Only use callable functions for complex, multi-step state mutations (boss encounters, loot generation, XP calculation).
- Standard CRUD operations should execute directly from the React client, secured by Firestore Security Rules.
- Keep function dependencies minimal — large `node_modules` increase cold start time.
- Use `minInstances: 1` for critical-path functions (boss encounters, purchases) if budget allows.

### When to Use Cloud Functions vs Client-Side Writes

**Cloud Function required:**
- Multi-step state mutations (XP calc + loot gen + HP scaling)
- Economy enforcement (currency grants, purchases, disenchanting)
- Operations requiring admin SDK or elevated permissions
- Anything touching multiple collections atomically
- Academic integrity analysis

**Client-side write (secured by rules):**
- User appearance/avatar changes
- Codename updates
- Privacy mode toggles
- Class profile selections
- Quest tracking updates
- Any field in the Firestore self-write allowlist

### Idempotent Function Design (NON-NEGOTIABLE)
Network instability on Chromebooks means retried invocations are common. Every callable function must be idempotent.

**Requirements:**
- Never double-award Cyber-Flux, XP, or items on retry
- Use Firestore transactions to check-then-write atomically
- Once a function returns a resolved promise, NO background activities should continue
- Lingering background processes leak memory and degrade subsequent invocations on the same container

**Pattern:**
```typescript
// Check for existing completion before awarding
const existingAward = await db.collection('xp_events')
  .where('userId', '==', userId)
  .where('sourceId', '==', eventId)
  .limit(1).get();

if (!existingAward.empty) {
  return { alreadyAwarded: true, ...existingAward.docs[0].data() };
}

// Proceed with award in a transaction
await db.runTransaction(async (tx) => {
  // ... atomic read-then-write
});
```

## Firestore Optimization

### Index Management
Index fanout — automatic index creation for every field — causes:
- Increased write latency
- Higher storage costs
- Slower document creation on massive collections

**Implement collection-level index exemptions:**
- Disable descending and array indexing by default on: `xp_events`, `messages`, `student_telemetry`
- Only create composite indexes explicitly required by active queries
- Audit indexes periodically: `firebase firestore:indexes`

### Query Optimization
- Use field projection to restrict document payload sizes (avoid transferring unnecessary fields)
- Apply `limit()` on leaderboard and analytics queries
- Always pair `limit()` with `orderBy()` — `limit` without `orderBy` returns arbitrary documents

### Firestore Data Bundles
Pre-package static/slowly-changing data into a static file served via Firebase Hosting CDN:
- Base stats of all RPG items
- Skill tree unlock conditions
- Seasonal cosmetic configurations
- Loot table definitions

**Benefits:** Bypasses Firestore entirely for initial loads, dramatically improving time-to-interactive on Chromebooks. Data is served from CDN edge, no Firestore read costs.

### Security Rules
- Custom claims: verify `admin` flag for teacher operations
- Document-level ownership: `request.auth.uid == resource.data.userId`
- Self-write allowlist: only specific gamification fields writable by students (see QA agent memory for current list)
- **Critical:** Any new gamification field written client-side MUST be added to the allowlist in `firestore.rules`, otherwise writes silently fail

## Firebase Genkit (AI Integration)

### Overview
Genkit provides a unified, type-safe framework for orchestrating RAG flows within Firebase. Used by `/create-assessment` and `/generate-questions` skills.

### Key Patterns

**Zod Schema Validation:**
All LLM outputs must be validated with Zod schemas before reaching the client. This prevents:
- Unpredictable text outputs breaking the React frontend
- Malformed physics equations breaking KaTeX rendering
- Rubrics that don't conform to the assignments collection schema

```typescript
const AssessmentOutputSchema = z.object({
  questions: z.array(z.object({
    type: z.enum(['free-response', 'interactive', 'simulation']),
    prompt: z.string(),
    rubric: z.object({
      missing: z.string(),
      emerging: z.string(),
      approaching: z.string(),
      developing: z.string(),
      refining: z.string(),
    }),
  })),
});
```

**Vector Similarity Search:**
For RAG operations, create a vector similarity search index in Firestore:
- Embed educational content (kinematic formulas, forensic texts) using `text-embedding-005`
- Query by vector similarity to retrieve relevant content for assessment generation
- Store embeddings as high-dimensional vectors in Firestore documents

**Observable Flows:**
Genkit flows are observable — monitor token consumption, trace execution latency, and verify semantic accuracy through the Genkit Developer UI before deploying prompts to production.
