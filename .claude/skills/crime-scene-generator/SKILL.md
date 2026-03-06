---
name: crime-scene-generator
description: >
  Generates detailed, scientifically grounded forensic crime scene scenarios for 9th-grade
  forensic science students. Use this skill whenever you need a crime scene, mystery scenario,
  forensic evidence dossier, or investigative case for any content — assessments, 3D simulations,
  lesson activities, quests, or standalone classroom exercises. Triggers on requests involving
  forensic topics like arson, DNA analysis, trace evidence, toxicology, blood spatter, ballistics,
  fingerprinting, digital forensics, entomology, or any crime-scene-based learning activity.
  This skill is the foundation that other content-generating skills build on when the subject
  is Forensic Science.
argument-hint: "[forensic topic] [optional: context about downstream use]"
---

## What This Skill Does

Creates a comprehensive crime scene dossier structured as a JSON object that other skills and agents consume. The scenario forces students to analyze forensic evidence, navigate complex character motives, and debate who the culprit is. Scenarios are designed with intentional ambiguity — no single obvious answer.

**Output format:** Structured JSON (consumed by downstream skills/agents)
**Audience:** 9th-grade Forensic Science students
**Scope:** One scenario per invocation for maximum depth and realism

---

## Step 1: Parse Arguments

Extract from `<ARGUMENTS>`:

- **Forensic topic** — the primary forensic discipline to feature (e.g., "arson investigation", "blood spatter analysis", "trace evidence", "toxicology", "digital forensics", "entomology")
- **Downstream context** (optional) — what this scenario will be used for (assessment, 3D simulation, lesson activity, quest). This shapes how much detail goes into spatial layout vs. character backstory vs. evidence mechanics.

If no forensic topic is provided, ask: "What forensic topic should the crime scene focus on?"

If downstream context is provided, adapt emphasis:
- **Assessment** → Emphasize evidence analysis depth and debate triggers; include distractor evidence
- **3D simulation** → Emphasize spatial layout, object placement, environmental detail, and interactive elements
- **Lesson activity** → Balance all sections equally; include scaffolded discovery opportunities
- **Quest/gamification** → Emphasize character backstories, narrative hooks, and progressive revelation

---

## Step 2: Research the Forensic Science

Before writing, ground yourself in the real science of the requested topic. The scenario's credibility depends on accurate forensic methodology.

For the given topic, establish:
- What evidence this discipline actually produces at a crime scene
- What tools and methods investigators use to collect and analyze it
- Common mistakes or contamination risks in real investigations
- What conclusions the evidence can and cannot support (limitations matter — students should learn that forensic science has boundaries)

Use 9th-grade-appropriate terminology. Students should encounter real forensic vocabulary (e.g., "ridge detail" not "fingerprint lines", "accelerant" not "fire starter"), but explanations should be accessible.

---

## Step 3: Build the Scenario

Construct the scenario following these five components. Every component is mandatory.

### Component 1: The Scene & Setup

Write an immersive, detailed description of the crime scene environment. Include:

- **Location type and layout** — room dimensions, furniture placement, entry/exit points, adjacent areas
- **Environmental conditions** — time of day, weather, temperature, lighting, season
- **State upon discovery** — who found the scene, what was disturbed, what was preserved
- **Spatial evidence markers** — exact placement of every significant item (use compass directions or clock positions for precision)
- **Sensory details** — what investigators would see, smell, hear upon arrival

The scene description must be detailed enough that a 3D simulation could be built from it, or that students could sketch an accurate crime scene diagram.

### Component 2: Forensic Evidence (4-6 Pieces)

Each piece of evidence must include:

- **What it is** — physical description and location at the scene
- **How it's collected** — proper forensic collection procedure
- **What it suggests** — the analytical conclusion a student might draw
- **The ambiguity** — why this evidence doesn't tell the whole story

**The Contradiction Rule:** At least two pieces of evidence must point to different suspects. At least one piece must be genuinely ambiguous — interpretable multiple ways depending on assumptions. Include at least one potential contamination source or chain-of-custody concern.

Evidence should span multiple forensic sub-disciplines when possible (e.g., a blood spatter scene might also include trace fibers and a digital forensics angle from a phone).

### Component 3: The Cast of Characters

Create **1 victim** and **3-4 suspects**.

**The Moral Gray Rule:** No character is purely good or purely evil. For each character provide:

- **Name, age, relationship to victim**
- **Backstory** — enough personality to feel real, not a cardboard cutout
- **One selfless act** — a specific past instance where they helped someone, showed courage, or sacrificed something
- **One selfish act** — a specific past instance where they lied, manipulated, harmed, or acted from pure self-interest
- **Motive** — a plausible reason they might have committed the crime
- **Alibi** — a semi-solid alibi that has at least one gap or relies on a single corroborating witness

The victim also gets the selfless/selfish treatment — students need to grapple with the complexity that victims aren't always saints, which affects how they evaluate motive.

### Component 4: Points of Failure (Debate Triggers)

Design **2-3 specific investigation pitfalls** where reasonable students will disagree. For each:

- **The split** — which evidence points to Suspect A, and which contradicts that theory and points to Suspect B
- **The assumption trap** — what unstated assumption a student must make to reach each conclusion
- **Why it matters** — what forensic principle this teaches (e.g., correlation vs. causation, transfer evidence limitations, timeline reconstruction)

These are the pedagogical core of the scenario. They force students to argue from evidence rather than gut feeling, and to confront the limits of forensic certainty.

### Component 5: The Truth (Teacher Key)

Reveal what actually happened. Include:

- **The true sequence of events** — a timeline of the crime
- **How each piece of evidence was created** — scientific explanation for why contradictory evidence exists (e.g., the suspect wore the victim's shoes, evidence was moved by a pet, a window changed the temperature timeline)
- **Which alibis hold and which break** — and why
- **The forensic lesson** — what principle students should take away (stated explicitly for the teacher)

The truth must be scientifically bulletproof. Every piece of evidence must be explainable without hand-waving.

---

## Step 4: Structure the Output

Output the scenario as a JSON object with this structure:

```json
{
  "scenario": {
    "title": "Case of the [Evocative Title]",
    "forensicTopic": "primary forensic discipline",
    "gradeLevel": "9th grade",
    "estimatedDuration": "minutes for classroom use",
    "scene": {
      "location": "type and name",
      "layout": "detailed spatial description",
      "environmentalConditions": {
        "timeOfDay": "",
        "weather": "",
        "temperature": "",
        "lighting": "",
        "season": ""
      },
      "discoveryContext": "who found it, when, what was disturbed",
      "sensoryDetails": "sight, smell, sound upon arrival",
      "spatialMarkers": [
        {
          "item": "description",
          "location": "precise placement",
          "significance": "why it matters"
        }
      ]
    },
    "evidence": [
      {
        "id": "E1",
        "name": "short label",
        "type": "forensic sub-discipline",
        "description": "physical description and scene location",
        "collectionMethod": "proper forensic procedure",
        "analysis": "what a student might conclude",
        "ambiguity": "why it's not definitive",
        "pointsToward": "suspect name or multiple suspects"
      }
    ],
    "characters": {
      "victim": {
        "name": "",
        "age": 0,
        "background": "",
        "selflessAct": "",
        "selfishAct": "",
        "relationshipsToSuspects": ""
      },
      "suspects": [
        {
          "name": "",
          "age": 0,
          "relationshipToVictim": "",
          "background": "",
          "selflessAct": "",
          "selfishAct": "",
          "motive": "",
          "alibi": "",
          "alibiWeakness": ""
        }
      ]
    },
    "debateTriggers": [
      {
        "id": "DT1",
        "title": "short descriptive name",
        "evidenceForSuspectA": "which evidence and why",
        "evidenceForSuspectB": "which evidence and why",
        "assumptionTrap": "the unstated assumption students must examine",
        "forensicPrinciple": "what this teaches"
      }
    ],
    "teacherKey": {
      "trueSequence": "timeline of what actually happened",
      "evidenceExplanations": [
        {
          "evidenceId": "E1",
          "explanation": "why this evidence exists and what it actually shows"
        }
      ],
      "alibiResolution": "which alibis hold and why",
      "forensicLesson": "the takeaway principle for students"
    },
    "portalIntegration": {
      "evidenceLockerItems": ["items suitable for the Evidence Locker feature"],
      "discoveryMilestones": ["key moments worth XP or narrative progression"],
      "narrativeHooks": ["threads that connect to RPG quest framing"]
    }
  }
}
```

---

## Quality Checklist

Before finalizing, verify:

- [ ] Evidence uses accurate forensic terminology at a 9th-grade level
- [ ] At least 2 pieces of evidence contradict each other
- [ ] Every suspect has a plausible motive AND a semi-solid alibi
- [ ] No character is purely good or purely evil
- [ ] The teacher key explains ALL contradictory evidence scientifically
- [ ] The scene description is spatially precise enough to sketch or model in 3D
- [ ] Debate triggers identify specific assumption traps, not just "students might disagree"
- [ ] The forensic science is accurate — no TV-show shortcuts or impossible lab results
