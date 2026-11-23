/**
 * On-device vision pipeline (MediaPipe Tasks, running locally in the browser).
 *
 * - face_detector + face_landmarker  -> face observation, geometry, blink liveness
 * - mobilenet_v3_small image embedder -> visual embeddings for face matching
 *   and object learning/retrieval
 * - hand_landmarker                  -> hand landmarks for gesture teaching
 *
 * Models are served by the local AURIX server from data/models; nothing is sent
 * to a third party for these operations.
 */
import type { FaceDetector, FaceLandmarker, HandLandmarker, ImageEmbedder } from "@mediapipe/tasks-vision";

type TasksModule = typeof import("@mediapipe/tasks-vision");
type WasmFileset = Awaited<ReturnType<TasksModule["FilesetResolver"]["forVisionTasks"]>>;

let tasksPromise: Promise<TasksModule> | null = null;
let filesetPromise: Promise<WasmFileset> | null = null;

async function tasks(): Promise<TasksModule> {
  if (!tasksPromise) tasksPromise = import("@mediapipe/tasks-vision");
  return tasksPromise;
}

async function fileset(): Promise<WasmFileset> {
  const mod = await tasks();
  if (!filesetPromise) filesetPromise = mod.FilesetResolver.forVisionTasks("/mediapipe/wasm");
  return filesetPromise;
}

let faceDetectorPromise: Promise<FaceDetector> | null = null;
let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;
let handLandmarkerPromise: Promise<HandLandmarker> | null = null;
let embedderPromise: Promise<ImageEmbedder> | null = null;

async function getFaceDetector(): Promise<FaceDetector> {
  if (!faceDetectorPromise) {
    faceDetectorPromise = (async () => {
      const mod = await tasks();
      return mod.FaceDetector.createFromOptions(await fileset(), {
        baseOptions: { modelAssetPath: "/api/vision/models/face_detector.tflite", delegate: "CPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.55,
      });
    })();
  }
  return faceDetectorPromise;
}

async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const mod = await tasks();
      return mod.FaceLandmarker.createFromOptions(await fileset(), {
        baseOptions: { modelAssetPath: "/api/vision/models/face_landmarker.task", delegate: "CPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    })();
  }
  return faceLandmarkerPromise;
}

async function getHandLandmarker(): Promise<HandLandmarker> {
  if (!handLandmarkerPromise) {
    handLandmarkerPromise = (async () => {
      const mod = await tasks();
      return mod.HandLandmarker.createFromOptions(await fileset(), {
        baseOptions: { modelAssetPath: "/api/vision/models/hand_landmarker.task", delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.55,
      });
    })();
  }
  return handLandmarkerPromise;
}

async function getEmbedder(): Promise<ImageEmbedder> {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      const mod = await tasks();
      return mod.ImageEmbedder.createFromOptions(await fileset(), {
        baseOptions: { modelAssetPath: "/api/vision/models/mobilenet_v3_small.tflite", delegate: "CPU" },
        runningMode: "IMAGE",
        l2Normalize: true,
        quantize: false,
      });
    })();
  }
  return embedderPromise;
}

const lastTimestamp = new Map<string, number>();
function nextTimestamp(key: string): number {
  const now = Math.round(performance.now());
  const previous = lastTimestamp.get(key) ?? 0;
  const value = now > previous ? now : previous + 1;
  lastTimestamp.set(key, value);
  return value;
}

export type VisionFailureCode =
  | "no-face"
  | "multiple-faces"
  | "no-landmarks"
  | "no-hand"
  | "model-unavailable"
  | "no-frames";

export class VisionError extends Error {
  code: VisionFailureCode;
  constructor(code: VisionFailureCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface FaceObservation {
  embedding: number[];
  geometry: number[];
  box: { x: number; y: number; width: number; height: number };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Scale-invariant facial geometry: ratios between landmark distances. These
 * are stable for one face and differ between people, and they are combined
 * with the appearance embedding on the server.
 */
function faceGeometry(landmarks: Array<{ x: number; y: number }>): number[] {
  const p = (index: number) => landmarks[index] ?? { x: 0, y: 0 };
  const interOcular = Math.max(1e-6, distance(p(33), p(263)));
  const faceWidth = Math.max(1e-6, distance(p(234), p(454)));
  const faceHeight = Math.max(1e-6, distance(p(10), p(152)));
  const mouthWidth = Math.max(1e-6, distance(p(61), p(291)));
  return [
    interOcular / faceWidth,
    faceWidth / faceHeight,
    distance(p(10), p(152)) / faceHeight,
    mouthWidth / interOcular,
    distance(p(13), p(14)) / mouthWidth,
    distance(p(1), p(152)) / faceHeight,
    distance(p(33), p(1)) / interOcular,
    distance(p(263), p(1)) / interOcular,
    distance(p(70), p(300)) / interOcular,
    distance(p(33), p(61)) / interOcular,
    distance(p(234), p(152)) / faceWidth,
    distance(p(10), p(1)) / faceHeight,
  ];
}

function cropToCanvas(video: HTMLVideoElement, box: { x: number; y: number; width: number; height: number }, margin = 0.3): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 224;
  canvas.height = 224;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new VisionError("model-unavailable", "Canvas 2D is unavailable in this browser.");
  const mw = box.width * margin;
  const mh = box.height * margin;
  const sx = Math.max(0, box.x - mw);
  const sy = Math.max(0, box.y - mh);
  const sw = Math.min(video.videoWidth - sx, box.width + mw * 2);
  const sh = Math.min(video.videoHeight - sy, box.height + mh * 2);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function observeFace(video: HTMLVideoElement): Promise<FaceObservation> {
  if (!video.videoWidth) throw new VisionError("no-frames", "The camera has not produced a frame yet.");
  try {
    const detector = await getFaceDetector();
    const detection = detector.detectForVideo(video, nextTimestamp("face-detector"));
    const faces = detection.detections ?? [];
    if (faces.length === 0) throw new VisionError("no-face", "No face is visible. Look straight at the camera.");
    if (faces.length > 1) {
      throw new VisionError("multiple-faces", "More than one face is in view. Only the enrolled owner may verify.");
    }
    const box = faces[0].boundingBox ?? { originX: 0, originY: 0, width: video.videoWidth, height: video.videoHeight };
    const landmarker = await getFaceLandmarker();
    const landmarkResult = landmarker.detectForVideo(video, nextTimestamp("face-landmarker"));
    const landmarks = landmarkResult.faceLandmarks?.[0];
    if (!landmarks || landmarks.length < 400) {
      throw new VisionError("no-landmarks", "Face landmarks could not be read. Hold still and try again.");
    }
    const embedder = await getEmbedder();
    const canvas = cropToCanvas(video, {
      x: box.originX,
      y: box.originY,
      width: box.width,
      height: box.height,
    });
    const embeddingResult = embedder.embed(canvas);
    const embedding = embeddingResult.embeddings?.[0]?.floatEmbedding ?? [];
    if (embedding.length < 32) throw new VisionError("model-unavailable", "The face embedding model returned no data.");
    return {
      embedding,
      geometry: faceGeometry(landmarks),
      box: { x: box.originX, y: box.originY, width: box.width, height: box.height },
    };
  } catch (err) {
    if (err instanceof VisionError) throw err;
    throw new VisionError("model-unavailable", err instanceof Error ? err.message : "Face analysis failed.");
  }
}

export interface LivenessResult {
  blinkDetected: boolean;
  frames: number;
  maxBlinkScore: number;
}

/**
 * Liveness: requires a real blink during the capture window. A still photo of
 * the owner held to the camera never blinks, so it cannot unlock AURIX.
 */
export async function runLivenessCheck(video: HTMLVideoElement, durationMs = 2800): Promise<LivenessResult> {
  const landmarker = await getFaceLandmarker();
  const started = performance.now();
  let frames = 0;
  let blinkDetected = false;
  let maxBlinkScore = 0;
  while (performance.now() - started < durationMs) {
    if (!video.videoWidth) break;
    try {
      const result = landmarker.detectForVideo(video, nextTimestamp("face-landmarker"));
      frames += 1;
      const categories = result.faceBlendshapes?.[0]?.categories ?? [];
      const left = categories.find((category) => category.categoryName === "eyeBlinkLeft")?.score ?? 0;
      const right = categories.find((category) => category.categoryName === "eyeBlinkRight")?.score ?? 0;
      const both = Math.min(left, right);
      maxBlinkScore = Math.max(maxBlinkScore, both);
      if (both > 0.32) blinkDetected = true;
    } catch {
      // Ignore a single dropped frame; the window keeps running.
    }
    await new Promise((resolve) => setTimeout(resolve, 90));
  }
  return { blinkDetected, frames, maxBlinkScore };
}

export type GestureLabel = "open_palm" | "fist" | "thumb_up" | "victory" | "unknown";

export interface HandObservation {
  gesture: GestureLabel;
  descriptor: number[];
  landmarks: Array<{ x: number; y: number; z: number }>;
}

function classifyHand(landmarks: Array<{ x: number; y: number; z: number }>): GestureLabel {
  const wrist = landmarks[0];
  const palm = Math.max(1e-6, distance(wrist, landmarks[9] ?? wrist));
  const extended = (tip: number, pip: number) => distance(landmarks[tip], wrist) / palm > distance(landmarks[pip], wrist) / palm * 1.22;
  const thumbExtended = distance(landmarks[4], wrist) / palm > distance(landmarks[2], wrist) / palm * 1.35;
  const index = extended(8, 6);
  const middle = extended(12, 10);
  const ring = extended(16, 14);
  const pinky = extended(20, 18);
  const curledCount = [index, middle, ring, pinky].filter((value) => !value).length;
  if (index && middle && !ring && !pinky) return "victory";
  if (index && middle && ring && pinky) return "open_palm";
  if (curledCount === 4) return thumbExtended ? "thumb_up" : "fist";
  return "unknown";
}

export async function observeHand(video: HTMLVideoElement): Promise<HandObservation> {
  if (!video.videoWidth) throw new VisionError("no-frames", "The camera has not produced a frame yet.");
  const landmarker = await getHandLandmarker();
  const result = landmarker.detectForVideo(video, nextTimestamp("hand-landmarker"));
  const landmarks = result.landmarks?.[0];
  if (!landmarks || landmarks.length < 21) {
    throw new VisionError("no-hand", "No hand is visible in the camera frame.");
  }
  const wrist = landmarks[0];
  const scale = Math.max(1e-6, distance(wrist, landmarks[9]));
  const descriptor: number[] = [];
  for (const point of landmarks) {
    descriptor.push((point.x - wrist.x) / scale, (point.y - wrist.y) / scale, (point.z - wrist.z) / scale);
  }
  return {
    gesture: classifyHand(landmarks),
    descriptor,
    landmarks: landmarks.map((point) => ({ x: point.x, y: point.y, z: point.z })),
  };
}

export interface FrameEmbedding {
  embedding: number[];
  imageDataUrl: string;
}

/** Full-frame object embedding plus a JPEG snapshot for review/storage. */
export async function embedFrame(video: HTMLVideoElement): Promise<FrameEmbedding> {
  if (!video.videoWidth) throw new VisionError("no-frames", "The camera has not produced a frame yet.");
  const embedder = await getEmbedder();
  const square = document.createElement("canvas");
  square.width = 224;
  square.height = 224;
  const squareCtx = square.getContext("2d");
  const snapshot = document.createElement("canvas");
  const targetWidth = 640;
  snapshot.width = targetWidth;
  snapshot.height = Math.round((video.videoHeight / video.videoWidth) * targetWidth) || 480;
  const snapshotCtx = snapshot.getContext("2d");
  if (!squareCtx || !snapshotCtx) throw new VisionError("model-unavailable", "Canvas 2D is unavailable in this browser.");

  // Center-crop to a square so the embedding sees the object, not black bars.
  const side = Math.min(video.videoWidth, video.videoHeight);
  squareCtx.drawImage(
    video,
    (video.videoWidth - side) / 2,
    (video.videoHeight - side) / 2,
    side,
    side,
    0,
    0,
    square.width,
    square.height
  );
  snapshotCtx.drawImage(video, 0, 0, snapshot.width, snapshot.height);

  const result = embedder.embed(square);
  const embedding = result.embeddings?.[0]?.floatEmbedding ?? [];
  if (embedding.length < 16) throw new VisionError("model-unavailable", "The object embedding model returned no data.");
  return { embedding, imageDataUrl: snapshot.toDataURL("image/jpeg", 0.82) };
}

/** Warms the models so the first verification is not slow. */
export async function preloadVisionModels(): Promise<{ face: boolean; embedder: boolean; hand: boolean }> {
  const outcome = { face: false, embedder: false, hand: false };
  try {
    await getFaceDetector();
    await getFaceLandmarker();
    outcome.face = true;
  } catch {
    outcome.face = false;
  }
  try {
    await getEmbedder();
    outcome.embedder = true;
  } catch {
    outcome.embedder = false;
  }
  try {
    await getHandLandmarker();
    outcome.hand = true;
  } catch {
    outcome.hand = false;
  }
  return outcome;
}
