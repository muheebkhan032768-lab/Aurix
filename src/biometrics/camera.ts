/**
 * Camera lifecycle for DEX MADE.
 *
 * One stream at a time, always user-initiated, always released when stopped so
 * the OS camera indicator turns off. The returned status is what the UI shows —
 * there is no separate "pretend" flag.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { patchRuntime, type SensorState } from "./runtime";

export interface CameraApi {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: SensorState;
  error: string | null;
  start: () => Promise<HTMLVideoElement | null>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export function useCamera(): CameraApi {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<SensorState>("off");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("off");
    patchRuntime({ camera: "off" });
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("This browser does not expose a camera API.");
      patchRuntime({ camera: "error" });
      return null;
    }
    try {
      setStatus("active");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);
      }
      patchRuntime({ camera: "active" });
      return video;
    } catch (err) {
      const message =
        err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")
          ? "Camera permission was denied. Allow the camera for this page, or use voice/PIN verification instead."
          : err instanceof Error
            ? `Camera unavailable: ${err.message}`
            : "Camera unavailable.";
      setStatus("error");
      setError(message);
      patchRuntime({ camera: "error" });
      return null;
    }
  }, []);

  const pause = useCallback(() => {
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = false;
    });
    setStatus("paused");
    patchRuntime({ camera: "paused" });
  }, []);

  const resume = useCallback(() => {
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = true;
    });
    setStatus("active");
    patchRuntime({ camera: "active" });
  }, []);

  return { videoRef, status, error, start, pause, resume, stop };
}

/** Waits until the video element has real frames to read. */
export async function waitForVideo(video: HTMLVideoElement, timeoutMs = 4000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (video.videoWidth > 0 && video.readyState >= 2) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return video.videoWidth > 0;
}
