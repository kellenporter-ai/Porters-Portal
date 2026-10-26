#!/usr/bin/env node
/**
 * validate-ap1-q1-review.mjs
 *
 * Deterministic validator for the AP1 Q1 review package (skills / practice / mock).
 * Built BEFORE review content exists, so every check degrades to a clean MISSING
 * report when content files are absent.
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — validation failure (missing content, schema violations, exam overlap, ...)
 *   2 — unexpected script/IO error (unparsable JSON, unreadable exam source, ...)
 *
 * Usage:
 *   node scripts/validate-ap1-q1-review.mjs [--self-test] [--json <reportPath>]
 *     [--review-root <dir>] [--skills <file>] [--practice <file>]
 *     [--mock <file>] [--exam-source <file>]
 *
 * Stdlib only. No dependencies.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORTAL_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_REVIEW_ROOT = join(PORTAL_ROOT, 'public', 'ap1-q1-review');
const DEFAULT_EXAM_SOURCE = '/home/kp/Desktop/Executive Assistant/assets/school/AP Physics Exams/Q1 Quarterly/exam-source.json';

const EXPECTED_SKILLS = 10;
const EXPECTED_PRACTICE = 80;
const PRACTICE_PER_SKILL = 8;
const EXPECTED_MOCK_MC = 30;
const EXPECTED_FRQ_PARTS = 5;
const MOCK_BLUEPRINT = { 2: 6, 3: 16, 4: 8 };
const EXPECTED_MULTI_SELECT = 4;

const POSITION_BIAS_LIMIT = 0.30; // 30%
const RUN_LENGTH = 6;             // shared normalized-word run
const JACCARD_LIMIT = 0.5;        // content-word Jaccard
const JACCARD_MIN_CONTENT = 5;    // only for strings with >= 5 content words
const OUT_OF_SCOPE_PATTERN = /projectile|coefficients? of (?:static|kinetic) friction|μs|μk|mu_s|mu_k/i;

// Spipped FRQ signature values (crate-on-ramp, T = 69 N, 10.0 kg, 30.0 deg)
const FRQ_SIGNATURE_VALUES = ['69', '30', '10']; // paired with crate/ramp wording check below

const STOPWORDS = new Set(
  ('a an the and or but if then else of to in on at for with by from as is are was were be been being ' +
   'it its this that these those which who whom what when where why how do does did done can could will would ' +
   'shall should may might must not no yes than then so such into over under above below between about through ' +
   'during before after each all any both few more most other some only own same very you your he she we they ' +
   'i me him her us them his hers our their mine yours ours theirs here there out up down off again once just ' +
   'also has have had having get got getting make made makes take takes taken choose select best following ' +
   'true false respectively of the a an to in on at for with by from as is are was were').split(/\s+/)
);

const NUMBER_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
  nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15',
  sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30',
  forty: '40', fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90', hundred: '100'
};

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    selfTest: false,
    jsonPath: null,
    reviewRoot: DEFAULT_REVIEW_ROOT,
    skills: null,
    practice: null,
    mock: null,
    examSource: DEFAULT_EXAM_SOURCE,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--self-test': opts.selfTest = true; break;
      case '--json': opts.jsonPath = argv[++i]; break;
      case '--review-root': opts.reviewRoot = resolve(argv[++i]); break;
      case '--skills': opts.skills = resolve(argv[++i]); break;
      case '--practice': opts.practice = resolve(argv[++i]); break;
      case '--mock': opts.mock = resolve(argv[++i]); break;
      case '--exam-source': opts.examSource = resolve(argv[++i]); break;
      default:
        console.error(`Unknown argument: ${a}`);
        process.exit(2);
    }
  }
  opts.skills = opts.skills || join(opts.reviewRoot, 'data', 'skills.json');
  opts.practice = opts.practice || join(opts.reviewRoot, 'data', 'practice.json');
  opts.mock = opts.mock || join(opts.reviewRoot, 'data', 'mock.json');
  return opts;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeText(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.toLowerCase();
  s = s.replace(/[°º]/g, ' degrees ')
       .replace(/[−–—]/g, '-')
       .replace(/[‘’`]/g, "'")
       .replace(/[“”]/g, '"')
       .replace(/µ/g, 'u');
  s = s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/g,
    (m) => NUMBER_WORDS[m] || m);
  s = s.replace(/\b(\d+)\.\d+\b/g, '$1');
  s = s.replace(/^\s*(?:\(?[a-e]\)?[\.\):]\s*|choice\s+[a-e]\s*[:\-]?\s*|answer\s*[:\-]\s*)/i, ' ');
  s = s.replace(/\b(?:in|on|from|as shown|shown in|see|in the)\s+(?:the\s+)?(?:figure|diagram|graph|chart|picture|image|table|plot|drawing|sketch)\b/g, ' ');
  s = s.replace(/\b(?:the\s+)?(?:figure|diagram|graph|chart|picture|image|table|plot|drawing|sketch)\s+(?:above|below|shown|to the (?:left|right))\b/g, ' ');
  s = s.replace(/\b(?:kg|newtons?|n\b|meters?|metres?|m\/s\^?2|m\/s|cm|mm|km|seconds?|minutes?|hours?|mph|joules?|watts?|degrees?|deg)\b/g, ' ');
  s = s.replace(/[^\w\s]/g, ' ');
  s = s.replace(/\b\d+\b/g, (m) => String(parseInt(m, 10)));
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function contentWords(normalized) {
  return normalized.split(' ').filter((w) => w.length > 0 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function wordNGrams(normalized, n) {
  const words = normalized.split(' ').filter(Boolean);
  const grams = new Set();
  if (words.length < n) return grams;
  for (let i = 0; i <= words.length - n; i++) {
    grams.add(words.slice(i, i + n).join(' '));
  }
  return grams;
}

function jaccard(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  return inter / (setA.size + setB.size - inter);
}

// ---------------------------------------------------------------------------
// Shipped exam extraction
// ---------------------------------------------------------------------------

function loadExamSource(path) {
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  const ids = new Set();
  const figureBasenames = new Set();
  const figureAbsolutePaths = new Set();
  const strings = [];

  function addString(text, where) {
    if (typeof text === 'string' && text.trim().length > 0) strings.push({ text, where });
  }

  for (const section of data.sections || []) {
    for (const q of section.questions || []) {
      if (q.id) ids.add(String(q.id));
      addString(q.stem, `exam ${q.id} stem`);
      for (const opt of q.options || []) {
        addString(typeof opt === 'string' ? opt : (opt && (opt.text || opt.label)), `exam ${q.id} option`);
      }
      if (q.fig) {
        figureAbsolutePaths.add(String(q.fig));
        figureBasenames.add(basename(String(q.fig)));
      }
    }
    if (section.prompt) addString(section.prompt, 'exam FRQ prompt');
    for (const part of section.parts || []) {
      if (part.prompt) addString(part.prompt, `exam FRQ part ${part.label || ''}`);
      if (part.response) addString(part.response, `exam FRQ part ${part.label || ''} response`);
    }
  }
  return { ids, figureBasenames, figureAbsolutePaths, strings };
}

// ---------------------------------------------------------------------------
// Review data extraction (all student-facing strings)
// ---------------------------------------------------------------------------

function extractReviewStrings(data, label, out) {
  const FIGURE_LIKE = /^[a-z0-9][a-z0-9\-_.:\/\\ ]*\.(?:png|jpg|jpeg|svg|gif|webp|mp4|webm)$/i;
  const ID_LIKE = /^[a-z0-9][a-z0-9\-_.]*$/i;
  function walk(node, path) {
    if (typeof node === 'string') {
      const t = node.trim();
      if (t.length === 0) return;
      if (FIGURE_LIKE.test(t)) return;
      if (ID_LIKE.test(t) && t.length <= 40 && !/\s/.test(t)) return;
      out.push({ text: node, where: `${label} ${path}` });
    } else if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    }
  }
  walk(data, label);
}

// ---------------------------------------------------------------------------
// Schema / content checks
// ---------------------------------------------------------------------------

function checkSkills(skills, failures) {
  const tag = 'skills.json';
  if (!Array.isArray(skills)) { failures.push(`${tag}: root is not an array`); return new Set(); }
  const ids = new Set();
  for (const s of skills) {
    if (!s || typeof s !== 'object') { failures.push(`${tag}: non-object skill entry`); continue; }
    for (const f of ['id', 'label', 'chapter', 'description']) {
      if (s[f] === undefined || s[f] === null || String(s[f]).trim() === '') {
        failures.push(`${tag}: skill ${s.id || '(no id)'} missing/empty field "${f}"`);
      }
    }
    if (s.id !== undefined) ids.add(String(s.id));
  }
  if (ids.size !== EXPECTED_SKILLS) {
    failures.push(`${tag}: expected exactly ${EXPECTED_SKILLS} unique skills, found ${ids.size}`);
  }
  return ids;
}

function normalizeAnswer(ans) {
  const toIndex = (v) => {
    if (typeof v === 'number' && Number.isInteger(v)) return v;
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (/^[a-e]$/.test(t)) return t.charCodeAt(0) - 97;
      if (/^\d+$/.test(t)) return parseInt(t, 10);
    }
    return null;
  };
  if (Array.isArray(ans)) return ans.map(toIndex).filter((v) => v !== null);
  const single = toIndex(ans);
  return single === null ? [] : [single];
}

function optionText(opt) {
  if (typeof opt === 'string') return opt;
  if (opt && typeof opt === 'object') return String(opt.text ?? opt.label ?? opt.value ?? '');
  return '';
}

function validateItem(item, ctx, failures) {
  const id = item && item.id;
  const tag = `${ctx.tag} item ${id || '(no id)'}`;
  if (!id) { failures.push(`${ctx.tag}: item without id`); return null; }

  const skillRef = item.skill ?? item.skillId ?? item.skill_id;
  if (skillRef === undefined || skillRef === null) {
    failures.push(`${tag}: missing skill reference`);
  } else if (ctx.skillIds && ctx.skillIds.size && !ctx.skillIds.has(String(skillRef))) {
    failures.push(`${tag}: unknown skill ref "${skillRef}"`);
  }

  const type = String(item.type || 'mc').toLowerCase();
  const isMS = type === 'multi-select' || type === 'multiselect' || type === 'ms';
  const options = Array.isArray(item.options) ? item.options.map(optionText) : null;
  if (!options || options.length < 3) {
    failures.push(`${tag}: needs >= 3 options (MC/multi-select), found ${options ? options.length : 'none'}`);
  }

  if (options && options.length === 2) {
    const tf = new Set(['true', 'false']);
    if (options.every((o) => tf.has(normalizeText(o).trim()))) {
      failures.push(`${tag}: true/false item not allowed`);
    }
  }

  const scored = item.scored !== false;
  const chapter = Number(item.chapter);
  const rec = {
    id: String(id), skillRef: skillRef === undefined ? undefined : String(skillRef),
    chapter: Number.isFinite(chapter) ? chapter : undefined,
    answerIdx: [], options: options || [], isMS, scored,
  };
  if (!scored) return rec;

  if (typeof item.stem !== 'string' || item.stem.trim() === '') {
    failures.push(`${tag}: missing/empty stem`);
  } else if (OUT_OF_SCOPE_PATTERN.test(item.stem)) {
    failures.push(`${tag}: out-of-scope projectile or friction-coefficient calculation`);
  }

  const answers = normalizeAnswer(item.answer ?? item.answers ?? item.correct ?? item.correctAnswers);
  if (answers.length === 0) {
    failures.push(`${tag}: missing/invalid correct answer(s)`);
  }
  if (options) {
    for (const a of answers) {
      if (a < 0 || a >= options.length) failures.push(`${tag}: answer index ${a} out of range`);
    }
  }
  if (isMS && answers.length < 2) failures.push(`${tag}: multi-select must have >= 2 correct answers`);
  if (!isMS && answers.length > 1) failures.push(`${tag}: single-answer MC has multiple correct answers`);

  if (typeof item.explanation !== 'string' || item.explanation.trim() === '') {
    failures.push(`${tag}: missing/empty explanation`);
  }

  if (options) {
    const fb = item.feedback ?? item.distractorFeedback ?? item.wrongFeedback;
    if (fb === undefined || fb === null) {
      failures.push(`${tag}: missing distractor feedback`);
    } else {
      const distractors = new Set(options.map((_, i) => i));
      answers.forEach((a) => distractors.delete(a));
      const fbFor = (i) => {
        if (Array.isArray(fb)) return fb[i];
        if (typeof fb === 'object') {
          return fb[i] ?? fb[String(i)] ?? fb[String.fromCharCode(97 + i)] ?? fb[String.fromCharCode(65 + i)];
        }
        return undefined;
      };
      const feedbackTexts = [];
      for (const i of distractors) {
        const f = fbFor(i);
        if (typeof f !== 'string' || f.trim() === '') {
          failures.push(`${tag}: missing feedback for distractor ${String.fromCharCode(65 + i)}`);
        } else {
          feedbackTexts.push(normalizeText(f).trim());
        }
      }
      if (distractors.size > 1 && new Set(feedbackTexts).size !== feedbackTexts.length) {
        failures.push(`${tag}: distractor feedback must be specific to each wrong option`);
      }
    }
  }

  rec.answerIdx = answers;
  return rec;
}

function checkPractice(practice, skillIds, failures) {
  const tag = 'practice.json';
  if (!Array.isArray(practice)) { failures.push(`${tag}: root is not an array`); return []; }
  if (practice.length !== EXPECTED_PRACTICE) {
    failures.push(`${tag}: expected exactly ${EXPECTED_PRACTICE} items, found ${practice.length}`);
  }
  const seen = new Set();
  const items = [];
  const perSkill = new Map();
  for (const raw of practice) {
    const v = validateItem(raw, { tag, skillIds }, failures);
    if (!v) continue;
    if (seen.has(v.id)) failures.push(`${tag}: duplicate id "${v.id}"`);
    seen.add(v.id);
    if (v.skillRef) perSkill.set(v.skillRef, (perSkill.get(v.skillRef) || 0) + 1);
    items.push(v);
  }
  if (skillIds && skillIds.size === EXPECTED_SKILLS) {
    for (const sid of skillIds) {
      const n = perSkill.get(String(sid)) || 0;
      if (n !== PRACTICE_PER_SKILL) {
        failures.push(`${tag}: skill "${sid}" has ${n} items, expected ${PRACTICE_PER_SKILL}`);
      }
    }
  }
  return items;
}

function checkMock(mock, skillIds, skillChapterMap, failures) {
  const tag = 'mock.json';
  if (!mock || typeof mock !== 'object' || Array.isArray(mock)) {
    failures.push(`${tag}: root must be an object with mc/items + frq`);
    return { mcItems: [], frq: null };
  }
  const mc = mock.mc ?? mock.items ?? (Array.isArray(mock.questions) ? mock.questions : null);
  const frq = mock.frq ?? mock.freeResponse ?? null;
  if (!Array.isArray(mc)) { failures.push(`${tag}: missing "mc" array`); return { mcItems: [], frq }; }
  if (mc.length !== EXPECTED_MOCK_MC) {
    failures.push(`${tag}: expected exactly ${EXPECTED_MOCK_MC} MC/multi-select items, found ${mc.length}`);
  }
  const seen = new Set();
  const mcItems = [];
  let msCount = 0;
  const chapterCounts = { 2: 0, 3: 0, 4: 0 };
  for (const raw of mc) {
    const v = validateItem(raw, { tag, skillIds }, failures);
    if (!v) continue;
    if (seen.has(v.id)) failures.push(`${tag}: duplicate id "${v.id}"`);
    seen.add(v.id);
    if (v.isMS) msCount++;
    let ch = v.chapter;
    if (ch === undefined && v.skillRef && skillChapterMap.has(v.skillRef)) ch = skillChapterMap.get(v.skillRef);
    if (![2, 3, 4].includes(ch)) {
      failures.push(`${tag} item ${v.id}: chapter must be 2, 3, or 4 (got ${ch === undefined ? 'unset' : ch})`);
    } else {
      chapterCounts[ch]++;
    }
    mcItems.push(v);
  }
  for (const [ch, expected] of Object.entries(MOCK_BLUEPRINT)) {
    if (chapterCounts[ch] !== expected) {
      failures.push(`${tag}: blueprint chapter ${ch} has ${chapterCounts[ch]} items, expected ${expected}`);
    }
  }
  if (msCount !== EXPECTED_MULTI_SELECT) {
    failures.push(`${tag}: expected exactly ${EXPECTED_MULTI_SELECT} multi-select items, found ${msCount}`);
  }

  if (!frq || typeof frq !== 'object') {
    failures.push(`${tag}: missing FRQ object`);
  } else {
    if (typeof frq.prompt !== 'string' || frq.prompt.trim() === '') {
      failures.push(`${tag}: FRQ missing/empty prompt`);
    }
    const parts = frq.parts;
    if (!Array.isArray(parts) || parts.length !== EXPECTED_FRQ_PARTS) {
      failures.push(`${tag}: FRQ must have exactly ${EXPECTED_FRQ_PARTS} parts, found ${Array.isArray(parts) ? parts.length : 'none'}`);
    } else {
      parts.forEach((p, i) => {
        if (!p || typeof p.prompt !== 'string' || p.prompt.trim() === '') {
          failures.push(`${tag}: FRQ part ${i + 1} missing/empty prompt`);
        }
      });
    }
  }
  return { mcItems, frq };
}

function checkAnswerPositionBalance(scoredItems, failures) {
  const eligible = scoredItems.filter((it) => it.scored && it.options.length > 0 && it.answerIdx.length > 0);
  if (eligible.length === 0) return;
  const posCount = new Map();
  let longest = 0, shortest = 0;
  for (const it of eligible) {
    for (const a of it.answerIdx) posCount.set(a, (posCount.get(a) || 0) + 1);
    const norm = it.options.map((o) => normalizeText(o));
    const correctLen = it.answerIdx.reduce((s, a) => s + (norm[a] ? norm[a].length : 0), 0);
    const unsel = norm.map((_, i) => i).filter((i) => !it.answerIdx.includes(i));
    if (unsel.length === 0) continue;
    if (correctLen > Math.max(...unsel.map((i) => norm[i].length))) longest++;
    if (correctLen < Math.min(...unsel.map((i) => norm[i].length))) shortest++;
  }
  const total = [...posCount.values()].reduce((a, b) => a + b, 0);
  for (const [pos, n] of [...posCount.entries()].sort((a, b) => a[0] - b[0])) {
    const share = n / total;
    if (share > POSITION_BIAS_LIMIT) {
      failures.push(`answer-position balance: position ${String.fromCharCode(65 + pos)} carries ${(share * 100).toFixed(1)}% of correct answers (> ${POSITION_BIAS_LIMIT * 100}%)`);
    }
  }
  const longestShare = longest / eligible.length;
  const shortestShare = shortest / eligible.length;
  if (longestShare > POSITION_BIAS_LIMIT) {
    failures.push(`answer-position balance: correct option text is longest in ${(longestShare * 100).toFixed(1)}% of items (> ${POSITION_BIAS_LIMIT * 100}%)`);
  }
  if (shortestShare > POSITION_BIAS_LIMIT) {
    failures.push(`answer-position balance: correct option text is shortest in ${(shortestShare * 100).toFixed(1)}% of items (> ${POSITION_BIAS_LIMIT * 100}%)`);
  }
}

function checkFigures(allRaws, reviewRoot, shippedBasenames, shippedAbsPaths, failures) {
  const tag = 'figures';
  const figuresDir = join(reviewRoot, 'figures');
  for (const raw of allRaws) {
    if (!raw || typeof raw !== 'object') continue;
    const fig = raw.figure ?? raw.fig ?? raw.image;
    if (fig === undefined || fig === null) continue;
    const figStr = String(fig);
    const base = basename(figStr);
    if (shippedBasenames.has(base)) {
      failures.push(`${tag}: item ${raw.id} uses shipped exam figure basename "${base}"`);
    }
    if (shippedAbsPaths.has(figStr)) {
      failures.push(`${tag}: item ${raw.id} references shipped exam figure absolute path`);
    }
    const expectedPrefix = join(reviewRoot, 'figures');
    const absFig = isAbsolute(figStr) ? figStr : resolve(reviewRoot, figStr);
    if (!absFig.startsWith(expectedPrefix + '/') && absFig !== expectedPrefix) {
      failures.push(`${tag}: item ${raw.id} figure "${figStr}" does not point inside public/ap1-q1-review/figures/`);
    }
    if (!existsSync(absFig)) {
      failures.push(`${tag}: item ${raw.id} figure missing on disk: ${figStr}`);
    }
    void figuresDir;
  }
}

// ---------------------------------------------------------------------------
// Exam-overlap checks
// ---------------------------------------------------------------------------

function checkExamIdLeak(shippedIds, reviewStrings, allRaws, failures) {
  const tag = 'exam-protection ids';
  for (const { text, where } of reviewStrings) {
    for (const id of shippedIds) {
      if (text.includes(id)) {
        failures.push(`${tag}: shipped exam question id "${id}" appears in ${where}`);
        break;
      }
    }
  }
  function scan(node, path, rootRaw) {
    if (typeof node === 'string') {
      for (const id of shippedIds) {
        if (node.includes(id)) {
          failures.push(`${tag}: shipped exam question id "${id}" in item ${rootRaw.id || '(no id)'} field ${path}`);
          return;
        }
      }
    } else if (Array.isArray(node)) {
      node.forEach((v, i) => scan(v, `${path}[${i}]`, rootRaw));
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) scan(v, `${path}.${k}`, rootRaw);
    }
  }
  for (const raw of allRaws) scan(raw, '', raw);
  void tag;
}

function checkReviewFigureContent(allRaws, reviewRoot, failures) {
  // Guards the review's OWN figure files against answer-key artifacts.
  // checkFigureLeak only protects shipped *exam* figures, so an answer-key page
  // cropped from a textbook answer PDF used to sail straight through.
  //
  // OCR is fuzzy: tesseract reads "Answer: C" as "Answer G", turns "A) a
  // horizontal..." into "Aahonzonsiaightine.", and drops punctuation. Exact
  // string matching therefore passes leaking figures silently, so the tests
  // below are deliberately shape-based, not literal.
  const tag = 'figure-content';
  const seen = new Set();
  for (const raw of allRaws) {
    if (!raw || typeof raw !== 'object') continue;
    const fig = raw.figure ?? raw.fig ?? raw.image;
    if (typeof fig !== 'string') continue;
    const abs = isAbsolute(fig) ? fig : resolve(reviewRoot, fig);
    if (seen.has(abs)) continue;
    seen.add(abs);

    let text;
    if (abs.endsWith('.svg')) {
      text = readFileSync(abs, 'utf8');
    } else {
      try {
        text = execFileSync('tesseract', [abs, '-', '--psm', '6'], {
          encoding: 'utf8',
          timeout: 60000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch {
        continue;
      }
    }
    const flat = text.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

    // 1. Answer marker: "answer" followed by a letter, tolerant of OCR noise
    //    ("Answer: C" -> "answerc", "Answer G" -> "answerg").
    if (/answer[a-e]?\b/.test(flat) && flat.includes('answer')) {
      failures.push(`${tag}: ${basename(abs)} contains an answer marker (OCR/key text)`);
    }
    // 2. Publisher/copyright lines.
    if (flat.includes('pearson') || flat.includes('copyright')) {
      failures.push(`${tag}: ${basename(abs)} contains a publisher or copyright line`);
    }
    // 3. Question-block shape: a numbered stem ("76)") or 3+ option rows.
    const numberedStem = /^\s*\d{1,3}\s*\)/m.test(text);
    const optionRows = (text.match(/^\s*[A-E]\s*[).]\s/gm) || []).length;
    if (numberedStem || optionRows >= 3) {
      failures.push(
        `${tag}: ${basename(abs)} looks like a question/answer block ` +
          `(numbered stem=${numberedStem}, option rows=${optionRows}), not a diagram`,
      );
    }
  }
}

function checkFigureLeak(shippedBasenames, shippedAbsPaths, reviewStrings, allRaws, failures) {
  const tag = 'exam-protection figures';
  const haystacks = [
    ...reviewStrings.map((s) => ({ text: s.text, where: s.where })),
    ...allRaws.map((r) => ({ text: JSON.stringify(r), where: `item ${r && r.id}` })),
  ];
  for (const { text, where } of haystacks) {
    for (const b of shippedBasenames) {
      if (text.includes(b)) {
        failures.push(`${tag}: shipped exam figure basename "${b}" appears in ${where}`);
        break;
      }
    }
    for (const abs of shippedAbsPaths) {
      if (text.includes(abs)) {
        failures.push(`${tag}: shipped exam figure absolute path appears in ${where}`);
        break;
      }
    }
  }
}

function checkFrqScenarioSignature(reviewStrings, frq, failures) {
  const tag = 'exam-protection frq-signature';
  const texts = reviewStrings.map((s) => s.text);
  if (frq && typeof frq.prompt === 'string') texts.push(frq.prompt);
  if (frq && Array.isArray(frq.parts)) {
    for (const p of frq.parts) if (p && typeof p.prompt === 'string') texts.push(p.prompt);
  }
  for (const raw of texts) {
    const n = normalizeText(raw);
    const hasCrate = /\bcrate\b/.test(n);
    const hasRamp = /\bramp\b/.test(n);
    const hasTension = /\b69\b/.test(n);
    const hasMass = /\b10\b/.test(n);
    const hasAngle = /\b30\b/.test(n);
    if (hasCrate && hasRamp && (hasTension || (hasMass && hasAngle))) {
      failures.push(`${tag}: review text matches shipped FRQ crate-on-ramp scenario signature (69 N / 10 kg / 30 degrees)`);
      return;
    }
  }
}

function checkStringOverlap(shippedStrings, reviewStrings, failures, limit = Infinity) {
  const tag = 'exam-protection overlap';
  // Pre-normalize shipped strings + index n-grams
  const shippedNorm = shippedStrings.map((s) => ({ ...s, norm: normalizeText(s.text) }));
  const gramIndex = new Map(); // gram -> array of shipped idx
  shippedNorm.forEach((s, i) => {
    for (const g of wordNGrams(s.norm, RUN_LENGTH)) {
      if (!gramIndex.has(g)) gramIndex.set(g, []);
      gramIndex.get(g).push(i);
    }
  });
  const shippedContent = shippedNorm.map((s) => contentWords(s.norm));

  let found = 0;
  for (const r of reviewStrings) {
    if (found >= limit) break;
    const rn = normalizeText(r.text);
    if (!rn) continue;
    // Check A: shared n-gram run
    const rGrams = wordNGrams(rn, RUN_LENGTH);
    let hitRun = null;
    for (const g of rGrams) {
      if (gramIndex.has(g)) {
        const si = gramIndex.get(g)[0];
        hitRun = { gram: g, shipped: shippedNorm[si].where, review: r.where };
        break;
      }
    }
    if (hitRun) {
      failures.push(`${tag}: shared run of ${RUN_LENGTH} normalized words "${hitRun.gram}" — review ${hitRun.review} vs shipped ${hitRun.shipped}`);
      found++;
      continue;
    }
    // Check B: Jaccard
    const rc = contentWords(rn);
    if (rc.length >= JACCARD_MIN_CONTENT) {
      for (let i = 0; i < shippedNorm.length; i++) {
        const sc = shippedContent[i];
        if (sc.length < JACCARD_MIN_CONTENT) continue;
        const j = jaccard(rc, sc);
        if (j >= JACCARD_LIMIT) {
          failures.push(`${tag}: content-word Jaccard ${j.toFixed(2)} >= ${JACCARD_LIMIT} — review ${r.where} vs shipped ${shippedNorm[i].where}`);
          found++;
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Self-test: inject a contaminated fixture and verify detection
// ---------------------------------------------------------------------------

function selfTest(shipped, failures) {
  console.log('SELF-TEST: injecting deliberately copied shipped exam stem into review strings...');
  const contaminated = [{ text: shipped.strings[0].text, where: 'self-test contaminated fixture' }];
  const before = failures.length;
  checkStringOverlap(shipped.strings, contaminated, failures, 5);
  const detected = failures.length > before;
  if (detected) failures.splice(before);
  if (detected) {
    console.log('SELF-TEST PASS: contaminated fixture rejected by overlap checks.');
  } else {
    console.log('SELF-TEST FAIL: contaminated fixture was NOT rejected.');
  }
  return detected;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv);
  const failures = [];
  const missing = [];
  const report = { startedAt: new Date().toISOString(), checks: [], failures, missing };

  // 0. Exam source (required even for MISSING report)
  let shipped = null;
  try {
    shipped = loadExamSource(opts.examSource);
  } catch (e) {
    console.error(`ERROR: cannot load exam source at ${opts.examSource}: ${e.message}`);
    return 2;
  }
  report.checks.push(`exam-source: loaded ${shipped.ids.size} question ids, ${shipped.strings.length} strings, ${shipped.figureBasenames.size} figures`);

  // 1. Content files — MISSING report if absent
  const files = { skills: opts.skills, practice: opts.practice, mock: opts.mock };
  let allPresent = true;
  for (const [name, path] of Object.entries(files)) {
    if (!existsSync(path)) {
      missing.push(`${name}: MISSING (${path})`);
      allPresent = false;
    }
  }
  if (!allPresent) {
    console.log('AP1 Q1 review validation — content files not yet generated:');
    for (const m of missing) console.log(`  ${m}`);
    console.log('All exam-protection scaffolding loaded successfully; re-run after content exists.');
    report.summary = 'MISSING content files';
    finish(report, 1, opts);
  }

  // 2. Parse JSON
  let skills, practice, mock;
  try {
    skills = JSON.parse(readFileSync(opts.skills, 'utf8'));
    practice = JSON.parse(readFileSync(opts.practice, 'utf8'));
    mock = JSON.parse(readFileSync(opts.mock, 'utf8'));
  } catch (e) {
    console.error(`ERROR: failed to parse content JSON: ${e.message}`);
    return 2;
  }

  // 3. Schema/content checks
  const skillIds = checkSkills(skills, failures);
  const skillChapterMap = new Map();
  if (Array.isArray(skills)) {
    for (const s of skills) {
      if (s && s.id !== undefined) skillChapterMap.set(String(s.id), Number(s.chapter));
    }
  }
  const practiceItems = checkPractice(practice, skillIds, failures);
  const { mcItems, frq } = checkMock(mock, skillIds, skillChapterMap, failures);
  const scoredItems = [
    ...practiceItems.filter((i) => i.scored),
    ...mcItems.filter((i) => i.scored),
  ];
  checkAnswerPositionBalance(scoredItems, failures);

  const allRaws = [
    ...(Array.isArray(practice) ? practice : []),
    ...((mock && (mock.mc ?? mock.items ?? mock.questions)) || []),
  ];
  checkFigures(allRaws, opts.reviewRoot, shipped.figureBasenames, shipped.figureAbsolutePaths, failures);

  // 4. Exam-protection checks
  const reviewStrings = [];
  extractReviewStrings(skills, 'skills', reviewStrings);
  extractReviewStrings(practice, 'practice', reviewStrings);
  extractReviewStrings(mock, 'mock', reviewStrings);

  checkExamIdLeak(shipped.ids, reviewStrings, allRaws, failures);
  checkReviewFigureContent(allRaws, opts.reviewRoot, failures);
  checkFigureLeak(shipped.figureBasenames, shipped.figureAbsolutePaths, reviewStrings, allRaws, failures);
  checkFrqScenarioSignature(reviewStrings, frq, failures);
  checkStringOverlap(shipped.strings, reviewStrings, failures);

  // 5. Self-test (optional): run BEFORE final verdict, does not persist fixture
  let selfTestOk = true;
  if (opts.selfTest) {
    selfTestOk = selfTest(shipped, failures);
    report.checks.push(`self-test: ${selfTestOk ? 'PASS' : 'FAIL'}`);
  }

  // 6. Verdict
  const ok = failures.length === 0 && selfTestOk;
  report.summary = ok ? 'PASS' : 'FAIL';
  report.checks.push(`scored MC items evaluated for position balance: ${scoredItems.length}`);
  report.checks.push(`review strings extracted for overlap: ${reviewStrings.length}`);
  finish(report, ok ? 0 : 1, opts);
}

function finish(report, code, opts) {
  console.log('');
  console.log(`AP1 Q1 review validation: ${report.summary || (code === 0 ? 'PASS' : 'FAIL')}`);
  for (const c of report.checks) console.log(`  ✓ ${c}`);
  if (report.missing && report.missing.length) {
    for (const m of report.missing) console.log(`  ! ${m}`);
  }
  if (report.failures.length) {
    console.log('');
    console.log(`Failures (${report.failures.length}):`);
    for (const f of report.failures) console.log(`  ✗ ${f}`);
  }
  report.exitCode = code;
  if (opts.jsonPath) {
    try {
      writeFileSync(opts.jsonPath, JSON.stringify(report, null, 2));
      console.log(`\nJSON report written to ${opts.jsonPath}`);
    } catch (e) {
      console.error(`ERROR: cannot write JSON report: ${e.message}`);
      process.exit(2);
    }
  }
  process.exit(code);
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`ERROR: unexpected failure: ${e.stack || e.message}`);
  process.exit(2);
}
