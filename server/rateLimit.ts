import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Small in-memory fixed-window limiter for the expensive AI routes. This is a
 * single-process app, so a Map is sufficient and adds no infrastructure.
 */
export function rateLimit(options: { windowMs: number; max: number; label: string }) {
  const buckets = new Map<string, Bucket>();
  let lastPrune = Date.now();

  return function limiter(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    if (now - lastPrune > 60_000) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      lastPrune = now;
    }
    const key = `${options.label}:${req.ip || req.socket.remoteAddress || "local"}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: `Too many ${options.label} requests. Please wait ${retryAfter}s and try again.`,
      });
      return;
    }
    next();
  };
}
