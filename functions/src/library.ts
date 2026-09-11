import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
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

/** "circuit-diagram-builder.html" -> "Circuit Diagram Builder" */
function titleFromFilename(path: string): string {
  const base = path.split("/").pop() ?? path;
  const stem = base.replace(/\.html?$/i, "").replace(/\.(pdf|pptx?|docx?)$/i, "");
  const spaced = stem.replace(/[-_]+/g, " ").trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase()) || path;
}

/**
 * Strip the `.html` extension so stub URLs match the firebase.json clean
 * rewrites (e.g. `/circuit-diagram-builder`). Directory-style paths ending in
 * `/` are kept as-is. Only used for the display `url` — `sourceFingerprint`
 * always keeps the raw manifest path so scan dedup is unaffected.
 */
function cleanUrlFromManifestPath(path: string): string {
  return path.replace(/\.html?$/i, "");
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

async function listStorageItems(correlationId: string): Promise<ScannedItem[]> {
  try {
    const [files] = await admin.storage().bucket().getFiles({ prefix: "resources/html/" });
    return files
      .filter((f) => !f.name.endsWith("/")) // skip folder placeholders
      .map((f) => {
        const encoded = encodeURIComponent(f.name);
        return {
          title: titleFromFilename(f.name),
          url: `https://storage.googleapis.com/${admin.storage().bucket().name}/${encoded}`,
          hostingType: "storage" as const,
          contentKind: guessContentKind(f.name),
          sourceFingerprint: f.name,
        };
      });
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
