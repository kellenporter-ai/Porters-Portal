# Educational Data Mining & Privacy Reference (2026)

## Bayesian Knowledge Tracing (BKT)

### Overview
BKT is a probabilistic model for estimating a learner's mastery of specific skills based on their sequence of correct/incorrect responses across assignments.

### Model Parameters
- **P(L0)** — Prior probability the student already knows the skill
- **P(T)** — Probability of transitioning from unlearned to learned after an opportunity
- **P(G)** — Probability of guessing correctly despite not knowing (typically 0.25 for MC)
- **P(S)** — Probability of slipping (answering incorrectly despite knowing)

### Update Rule
After each student response, update the probability of mastery:

```
If correct:
  P(L|correct) = P(L) * (1 - P(S)) / [P(L) * (1 - P(S)) + (1 - P(L)) * P(G)]

If incorrect:
  P(L|incorrect) = P(L) * P(S) / [P(L) * P(S) + (1 - P(L)) * (1 - P(G))]

Then apply transition:
  P(L_new) = P(L|obs) + (1 - P(L|obs)) * P(T)
```

### Portal Application
- Track skill mastery across lessons (e.g., "Newton's Second Law", "Free Body Diagrams")
- Feed sequential response data into Cloud Functions that periodically update `student_alerts`
- Use mastery probability to power the Early Warning System (EWS)
- Flag students as "At-Risk" when P(L) remains below threshold after N opportunities

### Why BKT over Deep Knowledge Tracing (DKT)
BKT is **interpretable** — the teacher can understand exactly why a student was flagged. DKT uses RNNs/transformers which are black boxes. For a single teacher-developer, interpretability matters more than marginal accuracy gains.

## Engagement Cluster Analysis

### Purpose
Group students by interaction patterns to:
- Suggest balanced quest parties
- Identify engagement archetypes (active learner, passive viewer, sprint player)
- Target interventions to specific clusters

### Privacy Requirement
Must use pseudonymized identifiers. Never cluster on personally identifiable data. The analysis output should reference student IDs, not names, until the teacher explicitly resolves them.

## Anomaly Detection (Academic Integrity)

### Telemetry Signals
- Keystroke dynamics (typing speed consistency)
- Paste detection (large text blocks inserted at once)
- Engagement time vs. response quality correlation
- Response timing patterns (suspiciously fast correct answers)

### Critical Privacy Constraints

**Ephemeral Processing:**
- Raw keystroke logs must NEVER be stored in Firestore
- Process raw behavioral inputs in-memory during the active session
- Calculate a single "integrity confidence score" (numeric)
- Permanently discard raw behavioral data after scoring
- Store only the resultant boolean flag or confidence score

**What to store:**
```typescript
// YES — store this
{ integrityScore: 0.85, flagged: false }

// NO — never store this
{ keystrokes: [...], pasteEvents: [...], mouseMovements: [...] }
```

## FERPA Compliance

### School Official Exception
The application operates under FERPA's "School Official" exception:
- Data collection must be restricted to what represents a "legitimate educational interest"
- No data collection beyond what's needed for educational purposes
- Cannot share student data with third parties without consent

### Practical Implications
- Do NOT send raw student responses to external LLM providers for analysis
- The /study-guide skill should use aggregated performance metrics, not raw scores
- Telemetry data used for integrity analysis must be anonymized/aggregated
- Students can only read their own telemetry profiles (enforce via Firestore rules)
- Only the `admin` custom claim grants full analytical oversight

## Privacy by Design Principles

1. **Data Minimization:** Collect only what's needed. Don't log for "future use."
2. **Purpose Limitation:** Telemetry collected for integrity cannot be repurposed for grading.
3. **Storage Limitation:** Set TTLs on transactional data (xp_events, session logs).
4. **Access Control:** Document-level Firestore rules enforcing student self-read only.
5. **Transparency:** Document for students how predictions influence recommendations (not grades).

## Predictive Modeling Governance

When forecasting exam performance based on XP trajectories and rubric scores:
- Predictions must be transparent — students should know predictions exist
- Predictions must NOT directly determine grades
- Use predictions only for intervention triggers (EWS alerts to teacher)
- Document the model's limitations and confidence intervals
