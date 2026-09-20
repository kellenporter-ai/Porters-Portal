import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { generateCorrelationId, logWithCorrelation, verifyAdmin } from "./core";

// ==========================================
// HOSTED CONTENT LIBRARY — Scan
// ==========================================

/** Known hosting origins for the deployed app. */
const HOSTING_ORIGINS = [
  "https://porters-portal.web.app",
  "https://porters-portal.firebaseapp.com",
];

const CONTENT_KINDS = ["activity", "tool", "textbook", "deck", "document", "utility"] as const;
type ContentKind = (typeof CONTENT_KINDS)[number];

interface ManifestItem {
  path: string;
  fingerprint?: string;
  sizeBytes?: number;
}

interface ScannedItem {
  title: string;
  url: string;
  hostingType: "bundled" | "storage";
  contentKind: ContentKind;
  sourceFingerprint: string;
}

/** "p5a77av_circuit-diagram-builder.html" -> "Circuit Diagram Builder" */
function titleFromFilename(path: string): string {
  const base = path.split("/").pop() ?? path;
  const stem = base.replace(/\.html?$/i, "").replace(/\.(pdf|pptx?|docx?)$/i, "");
  // Strip the 7-char random upload prefix that Storage objects carry
  // (e.g. "p5a77av_circuit-diagram-builder" -> "circuit-diagram-builder").
  const stripped = stem.replace(/^[a-z0-9]{7}[_-]/, "");
  const spaced = stripped.replace(/[-_]+/g, " ").trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase()) || path;
}

/**
 * Clean-URL rewrites from firebase.json `hosting.rewrites`. Keep in sync with
 * firebase.json — the stripped form of a bundled manifest path is only usable
 * as a display URL when Firebase actually rewrites it to a real file.
 */
const CLEAN_URL_REWRITES = new Set([
  "/privacy",
  "/codeword",
  "/circuit-diagram-builder",
  "/electroscope-charge-assessment",
  "/tools/bar-chart",
  "/tools/force-diagram",
  "/textbook/ch2-kinematics-1d",
  "/texas-blackout-articles",
  "/forensic-branches",
  "/texas-grid-blackout",
  "/ap1-kinematics-practice",
  "/linearization-practice",
  "/guess-who",
]);

/**
 * Strip the `.html` extension ONLY when the stripped path is one of the
 * firebase.json clean-URL rewrites (e.g. `/circuit-diagram-builder`). Other
 * paths (e.g. `/games/guess-who-evidence.html`) are served as static files at
 * their literal `.html` path, so stripping would yield a URL that matches the
 * SPA catch-all instead. Only used for the display `url` — `sourceFingerprint`
 * always keeps the raw manifest path so scan dedup is unaffected.
 */
function cleanUrlFromManifestPath(path: string): string {
  const stripped = path.replace(/\.html?$/i, "");
  return CLEAN_URL_REWRITES.has(stripped) ? stripped : path;
}

/** Best-effort contentKind guess from the file path. */
function guessContentKind(path: string): ContentKind {
  const lower = path.toLowerCase();
  if (lower.includes("textbook/")) return "textbook";
  if (lower.includes("tools/")) return "tool";
  if (lower.includes("assessment") || lower.includes("activity") || lower.includes("practice")) return "activity";
  if (lower.includes("deck") || lower.endsWith(".pptx")) return "deck";
  if (lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx")) return "document";
  return "utility";
}

async function fetchBundledManifest(correlationId: string): Promise<ScannedItem[]> {
  const results = await Promise.allSettled(
    HOSTING_ORIGINS.map(async (origin) => {
      const res = await fetch(`${origin}/library-manifest.json`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ items?: ManifestItem[] }>;
    })
  );
  const manifest = results.find((r) => r.status === "fulfilled")?.value;
  if (!manifest?.items) {
    logWithCorrelation("error", "Failed to fetch library-manifest.json from all hosting origins", correlationId, {
      errors: results.map((r) => (r.status === "rejected" ? String(r.reason) : "ok")),
    });
    throw new HttpsError("internal", "Could not fetch the deployed content manifest. Deploy the app first.");
  }
  return manifest.items.map((item) => ({
    title: titleFromFilename(item.path),
    url: cleanUrlFromManifestPath(item.path),
    hostingType: "bundled" as const,
    contentKind: guessContentKind(item.path),
    sourceFingerprint: item.fingerprint ?? item.path,
  }));
}

/**
 * Ensure a Firebase download token exists on a Storage object and return the
 * anonymous-access URL (`https://firebasestorage.googleapis.com/v0/b/...`).
 * Raw `storage.googleapis.com` URLs require GCS auth and 403 for anonymous
 * callers. Reuses the first existing token; only mints one when absent, so it
 * never rotates tokens already embedded in other stored URLs. Metadata merge
 * preserves any other custom metadata on the object.
 */
export async function ensureStorageDownloadUrl(objectName: string): Promise<string> {
  // Explicit bucket name — Admin SDK bucket resolution can fail without it
  // outside the Functions runtime (proven by repair-script run, pipeline 55faaaa8).
  const bucket = admin.storage().bucket("porters-portal.firebasestorage.app");
  const file = bucket.file(objectName);
  const [metadata] = await file.getMetadata();
  const custom = metadata.metadata ?? {};
  let token = custom.firebaseStorageDownloadTokens;
  if (!token) {
    token = randomUUID();
    await file.setMetadata({ metadata: { ...custom, firebaseStorageDownloadTokens: token } });
  }
  const firstToken = String(token).split(",")[0].trim();
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectName)}?alt=media&token=${firstToken}`;
}

async function listStorageItems(correlationId: string): Promise<ScannedItem[]> {
  try {
    const [files] = await admin.storage().bucket("porters-portal.firebasestorage.app").getFiles({ prefix: "resources/html/" });
    const items: ScannedItem[] = [];
    for (const f of files) {
      if (f.name.endsWith("/")) continue; // skip folder placeholders
      items.push({
        title: titleFromFilename(f.name),
        url: await ensureStorageDownloadUrl(f.name),
        hostingType: "storage" as const,
        contentKind: guessContentKind(f.name),
        sourceFingerprint: f.name,
      });
    }
    return items;
  } catch (error) {
    logWithCorrelation("error", "Failed to list storage objects under resources/html/", correlationId, { error });
    // Storage listing is best-effort — bundled content still scans without it.
    return [];
  }
}

/**
 * Teacher-only callable: detects new hosted content (bundled public/ files via
 * the deployed library-manifest.json + Firebase Storage uploads under
 * resources/html/) and inserts untagged library_items docs for anything not
 * already registered by sourceFingerprint. Never modifies curated docs.
 */
export const scanLibraryItems = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  const correlationId = generateCorrelationId();
  await verifyAdmin(request.auth);

  const [bundled, storage] = await Promise.all([
    fetchBundledManifest(correlationId),
    listStorageItems(correlationId),
  ]);
  const scanned = [...bundled, ...storage];

  const db = admin.firestore();
  const existingSnap = await db.collection("library_items").get();
  const known = new Set(existingSnap.docs.map((d) => {
    const fp = d.data().sourceFingerprint;
    return typeof fp === "string" ? fp : d.id;
  }));

  let batch = db.batch();
  let batchCount = 0;
  let added = 0;
  const addedItems: string[] = [];
  let alreadyKnown = 0;

  for (const item of scanned) {
    if (known.has(item.sourceFingerprint)) {
      alreadyKnown++;
      continue;
    }
    const ref = db.collection("library_items").doc(); // auto-ID (hotspot-safe)
    // Merge-only stub fields: a concurrent scan that lost the fingerprint
    // race, or a doc curated mid-scan, is never clobbered — merge leaves
    // curated fields (title/description/tags/subject) untouched.
    batch.set(ref, {
      title: item.title,
      description: "",
      url: item.url,
      hostingType: item.hostingType,
      contentKind: item.contentKind,
      tags: [],
      suggestedCategory: "Supplemental",
      untagged: true,
      status: "active",
      sourceFingerprint: item.sourceFingerprint,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    batchCount++;
    added++;
    addedItems.push(item.sourceFingerprint);
    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();

  logWithCorrelation("info", "scanLibraryItems complete", correlationId, {
    scanned: scanned.length,
    added,
    alreadyKnown,
  });

  return { added, alreadyKnown, items: addedItems };
});
