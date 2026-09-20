import * as admin from 'firebase-admin';
admin.initializeApp({ projectId: 'porters-portal', storageBucket: 'porters-portal.firebasestorage.app' });
const db = admin.firestore();
async function main(): Promise<void> {
  const snap = await db.collection('library_items').get();
  console.log('TOTAL:', snap.size);
  interface Row { [k: string]: unknown }
  const rows: Row[] = snap.docs.map((d) => {
    const x = d.data() as { [k: string]: any };
    const ts = (v: any): string => {
      if (!v) return '';
      if (v.toMillis) return new Date(v.toMillis()).toISOString().slice(0, 10);
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v);
    };
    return {
      id: d.id,
      title: x.title ?? '',
      hostingType: x.hostingType ?? '',
      untagged: x.untagged,
      subject: x.subject ?? '',
      suggestedCategory: x.suggestedCategory ?? x.category ?? '',
      tags: (x.tags ?? []).join('|'),
      status: x.status ?? '',
      sourceFingerprint: x.sourceFingerprint ?? '',
      contentUrl: String(x.contentUrl ?? '').slice(0, 140),
      visibility: x.visibility ?? '',
      classTypes: (x.classTypes ?? []).join('|'),
      description: String(x.description ?? '').slice(0, 220),
      sizeBytes: x.sizeBytes ?? x.size ?? '',
      createdAt: ts(x.createdAt),
      updatedAt: ts(x.updatedAt),
    };
  });
  rows.sort((a: Row, b: Row) => String(a.title).localeCompare(String(b.title)));
  const fields = ['id','title','hostingType','untagged','subject','suggestedCategory','tags','status','visibility','classTypes','sourceFingerprint','contentUrl','sizeBytes','createdAt','updatedAt','description'];
  console.log(JSON.stringify({ fields, rows }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
