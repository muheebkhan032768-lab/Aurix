/**
 * Local model delivery for the on-device vision pipeline.
 *
 * MediaPipe task models are downloaded once into data/models and served from
 * the AURIX server, so the browser never talks to a third-party model host and
 * inference stays local after the first fetch.
 */
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";

const DATA_DIR = path.resolve(process.cwd(), "data");
const MODEL_DIR = path.join(DATA_DIR, "models");

export const MODEL_SOURCES: Record<string, string> = {
  "face_detector.tflite":
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "hand_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  "mobilenet_v3_small.tflite":
    "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite",
};

const inflight = new Map<string, Promise<string>>();

export function modelStatus(): Array<{ name: string; downloaded: boolean; bytes: number }> {
  return Object.keys(MODEL_SOURCES).map((name) => {
    const file = path.join(MODEL_DIR, name);
    const exists = fs.existsSync(file);
    return { name, downloaded: exists, bytes: exists ? fs.statSync(file).size : 0 };
  });
}

async function downloadModel(name: string): Promise<string> {
  const target = path.join(MODEL_DIR, name);
  if (fs.existsSync(target) && fs.statSync(target).size > 1024) return target;
  if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });
  const source = MODEL_SOURCES[name];
  if (!source) throw new Error(`Unknown AURIX vision model: ${name}`);

  const response = await fetch(source);
  if (!response.ok) throw new Error(`Model download failed for ${name}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const temp = `${target}.part`;
  fs.writeFileSync(temp, buffer);
  fs.renameSync(temp, target);
  return target;
}

export async function serveModel(req: Request, res: Response): Promise<void> {
  const name = String(req.params.name ?? "");
  if (!MODEL_SOURCES[name]) {
    res.status(404).json({ error: "Unknown model." });
    return;
  }
  try {
    let pending = inflight.get(name);
    if (!pending) {
      pending = downloadModel(name);
      inflight.set(name, pending);
      pending.finally(() => inflight.delete(name));
    }
    const file = await pending;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Model download failed." });
  }
}
