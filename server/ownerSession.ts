/**
 * Owner-session guard shared by every personal-data route.
 *
 * Mirrors the rule already used by the biometric training memory: personal
 * data is readable while the owner session is unlocked, and while no owner
 * credential exists yet (fresh install). As soon as a PIN, face or voice
 * credential is enrolled and the session is locked, personal endpoints answer
 * 423 and refuse the request.
 */
import { getBiometricSession, getEnrollmentSummary } from "./biometricStore";
import { getSecurityStatus } from "./db";

export function ownerSessionOpen(): boolean {
  if (getBiometricSession().status === "unlocked") return true;
  const enrollment = getEnrollmentSummary();
  return !(enrollment.face.enrolled || enrollment.voice.enrolled || getSecurityStatus().hasPin);
}
