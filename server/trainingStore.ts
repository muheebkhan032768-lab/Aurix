/**
 * AURIX training memory: owner-approved examples only.
 *
 * Saving an example stores an image + metadata + an embedding for retrieval.
 * It does NOT retrain a model — retrieval matching happens locally against the
 * stored embeddings. Optional model fine-tuning is a separate, documented
 * process (see docs/AURIX_UPGRADE.md).
 */
import fs from "node:fs";
import path from "node:path";
import { db, uid, addAuditLog } from "./db";
import { cosineSimilarity, l2Normalize } from "./biometricMath";

const DATA_DIR = path.resolve(process.cwd(), "data");
const ASSET_DIR = path.join(DATA_DIR, "training");

if (!fs.existsSync(ASSET_DIR)) fs.mkdirSync(ASSET_DIR, { recursive: true });

db.exec(`
  CREATE TABLE IF NOT EXISTS training_examples (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    asset_file TEXT,
    embedding TEXT,
    descriptor TEXT,
    trigger TEXT,
    action TEXT,
    approved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export type TrainingKind = "object" | "gesture" | "voice_command" | "task";

export interface TrainingExample {
  id: string;
  kind: TrainingKind;
  label: string;
  description: string;
  category: string;
  assetUrl: string | null;
  trigger: string | null;
  action: { urls?: string[]; note?: string; requiresConfirmation?: boolean } | null;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toExample(row: Record<string, unknown>): TrainingExample {
  return {
    id: String(row.id),
    kind: String(row.kind) as TrainingKind,
    label: String(row.label),
    description: String(row.description),
    category: String(row.category),
    assetUrl: row.asset_file ? `/api/training/assets/${String(row.asset_file)}` : null,
    trigger: row.trigger ? String(row.trigger) : null,
    action: parseJson(row.action),
    approved: Number(row.approved) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listTrainingExamples(params: { query?: string; kind?: string; category?: string; since?: string } = {}): TrainingExample[] {
  const rows = db.prepare(`SELECT * FROM training_examples WHERE approved = 1 ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>;
  const query = String(params.query ?? "").trim().toLowerCase();
  return rows
    .map(toExample)
    .filter((example) => (params.kind ? example.kind === params.kind : true))
    .filter((example) => (params.category ? example.category.toLowerCase() === params.category.toLowerCase() : true))
    .filter((example) => (params.since ? new Date(example.createdAt).getTime() >= new Date(params.since).getTime() : true))
    .filter((example) =>
      query
        ? `${example.label} ${example.description} ${example.category} ${example.trigger ?? ""}`.toLowerCase().includes(query)
        : true
    );
}

function saveAsset(id: string, imageDataUrl?: string): string | null {
  if (!imageDataUrl || typeof imageDataUrl !== "string") return null;
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl);
  if (!match) throw new Error("Training image must be a JPEG, PNG or WebP data URL.");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 4 * 1024 * 1024) throw new Error("Training image is larger than 4 MB.");
  const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(ASSET_DIR, filename), buffer, { mode: 0o600 });
  return filename;
}

export interface SaveTrainingInput {
  kind: TrainingKind;
  label: string;
  description?: string;
  category?: string;
  imageDataUrl?: string;
  embedding?: number[];
  descriptor?: number[];
  trigger?: string;
  action?: { urls?: string[]; note?: string; requiresConfirmation?: boolean };
  approved?: boolean;
}

export function saveTrainingExample(input: SaveTrainingInput): TrainingExample {
  if (input.approved !== true) {
    throw new Error("A training example is only stored after explicit owner approval.");
  }
  const kind = input.kind;
  if (!["object", "gesture", "voice_command", "task"].includes(kind)) throw new Error("Unknown training kind.");
  const label = String(input.label ?? "").trim().slice(0, 120);
  if (!label) throw new Error("A label is required before saving a training example.");

  const id = uid("train");
  const assetFile = saveAsset(id, input.imageDataUrl);
  const embedding = Array.isArray(input.embedding) && input.embedding.length > 16 ? l2Normalize(input.embedding.map(Number)) : null;
  const descriptor = Array.isArray(input.descriptor) && input.descriptor.length > 3 ? input.descriptor.map(Number) : null;
  const ts = nowIso();
  db.prepare(`
    INSERT INTO training_examples (id, kind, label, description, category, asset_file, embedding, descriptor, trigger, action, approved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    kind,
    label,
    String(input.description ?? "").trim().slice(0, 2000),
    String(input.category ?? "general").trim().slice(0, 60) || "general",
    assetFile,
    embedding ? JSON.stringify(embedding) : null,
    descriptor ? JSON.stringify(descriptor) : null,
    input.trigger ? String(input.trigger).trim().slice(0, 160) : null,
    input.action ? JSON.stringify(input.action) : null,
    ts,
    ts
  );
  addAuditLog("TRAINING_EXAMPLE_SAVED", "Abdul Muheeb", `Approved ${kind} example saved: "${label}".`, "info");
  return getTrainingExample(id)!;
}

export function getTrainingExample(id: string): TrainingExample | null {
  const row = db.prepare(`SELECT * FROM training_examples WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? toExample(row) : null;
}

export function updateTrainingExample(id: string, patch: Partial<Pick<TrainingExample, "label" | "description" | "category" | "trigger">>): TrainingExample {
  const existing = getTrainingExample(id);
  if (!existing) throw new Error("Training example not found.");
  db.prepare(`UPDATE training_examples SET label = ?, description = ?, category = ?, trigger = ?, updated_at = ? WHERE id = ?`).run(
    String(patch.label ?? existing.label).trim().slice(0, 120) || existing.label,
    String(patch.description ?? existing.description).slice(0, 2000),
    String(patch.category ?? existing.category).slice(0, 60),
    patch.trigger !== undefined ? String(patch.trigger).slice(0, 160) : existing.trigger,
    nowIso(),
    id
  );
  addAuditLog("TRAINING_EXAMPLE_UPDATED", "Abdul Muheeb", `Training example "${existing.label}" updated.`, "info");
  return getTrainingExample(id)!;
}

export function deleteTrainingExample(id: string): void {
  const existing = getTrainingExample(id);
  if (!existing) return;
  if (existing.assetUrl) {
    const filename = existing.assetUrl.split("/").pop();
    if (filename) fs.rmSync(path.join(ASSET_DIR, filename), { force: true });
  }
  db.prepare(`DELETE FROM training_examples WHERE id = ?`).run(id);
  addAuditLog("TRAINING_EXAMPLE_DELETED", "Abdul Muheeb", `Training example "${existing.label}" deleted.`, "security");
}

export function clearTrainingMemory(): number {
  const count = Number((db.prepare(`SELECT COUNT(*) AS cnt FROM training_examples`).get() as { cnt: number }).cnt);
  db.prepare(`DELETE FROM training_examples`).run();
  for (const file of fs.readdirSync(ASSET_DIR)) {
    fs.rmSync(path.join(ASSET_DIR, file), { force: true });
  }
  addAuditLog("TRAINING_MEMORY_CLEARED", "Abdul Muheeb", `All ${count} training examples deleted at owner request.`, "security");
  return count;
}

export interface TrainingMatch {
  example: TrainingExample;
  score: number;
}

/** Retrieval against approved examples. Returns the closest stored examples. */
export function matchTrainingEmbedding(embedding: number[], kind: TrainingKind = "object", limit = 3): TrainingMatch[] {
  const query = l2Normalize(embedding.map(Number));
  const rows = db.prepare(`SELECT * FROM training_examples WHERE approved = 1 AND kind = ? AND embedding IS NOT NULL`).all(kind) as Array<
    Record<string, unknown>
  >;
  return rows
    .map((row) => {
      const stored = parseJson<number[]>(row.embedding) ?? [];
      return { example: toExample(row), score: cosineSimilarity(query, stored) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function matchGestureDescriptor(descriptor: number[], limit = 3): TrainingMatch[] {
  const rows = db.prepare(`SELECT * FROM training_examples WHERE approved = 1 AND kind = 'gesture' AND descriptor IS NOT NULL`).all() as Array<
    Record<string, unknown>
  >;
  return rows
    .map((row) => {
      const stored = parseJson<number[]>(row.descriptor) ?? [];
      const score = cosineSimilarity(l2Normalize(descriptor.map(Number)), l2Normalize(stored));
      return { example: toExample(row), score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function trainingStats() {
  const rows = db.prepare(`SELECT kind, COUNT(*) AS cnt FROM training_examples WHERE approved = 1 GROUP BY kind`).all() as Array<{
    kind: string;
    cnt: number;
  }>;
  const byKind: Record<string, number> = {};
  for (const row of rows) byKind[row.kind] = Number(row.cnt);
  return {
    total: rows.reduce((sum, row) => sum + Number(row.cnt), 0),
    byKind,
    storageDir: "data/training",
  };
}
