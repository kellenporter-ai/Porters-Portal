# Production Monitoring & Reliability Reference (2026)

## Sentry (Error Monitoring)

### Backend Integration
Use `@sentry/google-cloud-serverless` for Cloud Functions v2:

```typescript
import * as Sentry from '@sentry/google-cloud-serverless';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% of transactions
  profilesSampleRate: 0.1,
});

// Wrap callable functions
export const bossEncounter = onCall(
  Sentry.wrapCloudEventFunction(async (request) => {
    // Function logic
  })
);
```

### What Sentry Captures
- Unhandled exceptions and promise rejections
- Execution timeouts
- Cold start latency profiling
- CPU bottleneck identification down to exact line of code

### Profiling Use Cases
- Identify if an inefficient Zod validation step in a Genkit flow causes latency spikes
- Detect unoptimized Firestore composite queries missing proper indexes
- Trace cold start durations per function
- Monitor memory usage patterns across container instances

## Client-Side Monitoring

### React Error Boundaries + Sentry
```typescript
import * as Sentry from '@sentry/react';

// Wrap routes/components that may crash on low-end devices
<Sentry.ErrorBoundary fallback={<CrashFallback />}>
  <BabylonSimulation />
</Sentry.ErrorBoundary>
```

**Critical crash scenarios to monitor:**
- Babylon.js simulation wrapper — memory exhaustion on Chromebooks
- KaTeX math renderer — malformed LaTeX in generated content
- Large data tables — exceeding available memory on 4GB devices

### Core Web Vitals
Track on real student devices to identify performance regressions:
- **LCP** (Largest Contentful Paint) — should be < 2.5s even on Chromebooks
- **INP** (Interaction to Next Paint) — should be < 200ms
- **CLS** (Cumulative Layout Shift) — should be < 0.1

## Artifact Registry Cleanup

### Problem
Firebase CLI retains Cloud Functions container images indefinitely. During aggressive /dev-pipeline iterations, images accumulate causing unexpected storage costs.

### Solution
```bash
# Set automatic cleanup policy — purge images older than 1 day
firebase functions:artifacts:setpolicy --keep-duration 1d

# Verify current policy
firebase functions:artifacts:getpolicy
```

Run this after any major deployment sprint. The deployment-monitor agent should verify this policy is active.

## Deployment Verification Checklist

### Post-Deploy Health Check
1. **Functions:** Check Cloud Functions logs for startup errors
   ```bash
   firebase functions:log --only <functionName> --limit 20
   ```
2. **Hosting:** Verify static assets are served correctly via CDN
3. **Firestore indexes:** Confirm all required composite indexes are built
   ```bash
   firebase firestore:indexes
   ```
4. **Security rules:** Validate rules haven't regressed
   ```bash
   firebase firestore:rules:get
   ```
5. **Client errors:** Check Sentry dashboard for new error spikes post-deploy

### Rollback Strategy
- Firebase Hosting supports instant rollback to previous deploy
  ```bash
  firebase hosting:channel:list
  firebase hosting:clone <source-site>:<source-channel> <target-site>:live
  ```
- Cloud Functions: redeploy previous version from git
  ```bash
  git checkout <previous-commit> -- functions/
  cd functions && npm run build && firebase deploy --only functions
  ```
