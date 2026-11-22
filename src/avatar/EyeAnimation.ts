import * as THREE from "three";
import { BLINK } from "./configuration/avatar.config";

/**
 * Eye animation: natural blinking at randomised intervals, plus small gaze
 * saccades that make the eyes feel alive while listening and speaking.
 * The eyes are real 3D rings/irises inside the neural face, not decals.
 */

export interface EyeAnimationInput {
  energy: number;
  speaking: boolean;
  listening: boolean;
  calm: boolean;
}

export interface EyeRig {
  group: THREE.Group;
  update: (dt: number, time: number, input: EyeAnimationInput) => void;
  setColor: (color: THREE.Color) => void;
}

function randomBlinkDelay(): number {
  return BLINK.minSeconds + Math.random() * (BLINK.maxSeconds - BLINK.minSeconds);
}

export function createEyes(parent: THREE.Object3D): EyeRig {
  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: "#00D9FF",
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const irisMaterial = new THREE.MeshBasicMaterial({
    color: "#9FF6FF",
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pupilMaterial = new THREE.MeshBasicMaterial({
    color: "#EAFDFF",
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const browMaterial = new THREE.LineBasicMaterial({
    color: "#7DE9FF",
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const eyeGeometry = new THREE.TorusGeometry(0.066, 0.0042, 6, 32);
  const irisGeometry = new THREE.RingGeometry(0.012, 0.04, 28);
  const pupilGeometry = new THREE.SphereGeometry(0.016, 10, 10);

  const group = new THREE.Group();
  const eyes: Array<{ socket: THREE.Group; iris: THREE.Mesh; pupil: THREE.Mesh }> = [];

  for (const side of [-1, 1]) {
    const socket = new THREE.Group();
    socket.position.set(side * 0.232, 0.095, 0.572);
    socket.rotation.y = side * 0.26;

    const ring = new THREE.Mesh(eyeGeometry, eyeMaterial);
    const iris = new THREE.Mesh(irisGeometry, irisMaterial);
    iris.position.z = 0.003;
    const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    pupil.position.z = 0.006;
    socket.add(ring, iris, pupil);
    group.add(socket);
    eyes.push({ socket, iris, pupil });

    const brow = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(side * 0.325, 0.188, 0.545),
        new THREE.Vector3(side * 0.232, 0.208, 0.6),
        new THREE.Vector3(side * 0.145, 0.188, 0.552),
      ]),
      browMaterial,
    );
    group.add(brow);
  }

  parent.add(group);

  let nextBlink = 2.4;
  let blinkClock = -1;
  let gazeX = 0;
  let gazeY = 0;
  let gazeTargetX = 0;
  let gazeTargetY = 0;
  let nextSaccade = 1.5;

  return {
    group,
    update(dt, time, input) {
      // Blink: a short eyelid sweep, then a fresh randomised interval.
      if (blinkClock < 0 && time > nextBlink) blinkClock = 0;
      if (blinkClock >= 0) {
        blinkClock += dt;
        if (blinkClock > BLINK.durationSeconds) {
          blinkClock = -1;
          nextBlink = time + randomBlinkDelay();
        }
      }
      const blink = blinkClock >= 0 ? Math.sin((blinkClock / BLINK.durationSeconds) * Math.PI) : 0;

      // Gaze: attentive micro-saccades while listening, calmer while speaking.
      if (!input.calm) {
        nextSaccade -= dt;
        if (nextSaccade <= 0) {
          const range = input.listening ? 0.55 : input.speaking ? 0.22 : 0.32;
          gazeTargetX = (Math.random() * 2 - 1) * range;
          gazeTargetY = (Math.random() * 2 - 1) * range * 0.5;
          nextSaccade = input.listening ? 1.2 + Math.random() * 2.2 : 2.2 + Math.random() * 3.4;
        }
      } else {
        gazeTargetX = 0;
        gazeTargetY = 0;
      }
      const ease = Math.min(1, dt * 6);
      gazeX += (gazeTargetX - gazeX) * ease;
      gazeY += (gazeTargetY - gazeY) * ease;

      for (const eye of eyes) {
        eye.socket.scale.y = 1 - blink * 0.9;
        eye.iris.position.x = gazeX * 0.012;
        eye.iris.position.y = gazeY * 0.008;
        eye.pupil.position.x = gazeX * 0.016;
        eye.pupil.position.y = gazeY * 0.01;
      }

      eyeMaterial.opacity = 0.7 + input.energy * 0.3 + (input.speaking ? 0.12 : 0);
      pupilMaterial.opacity = 0.95 - blink * 0.85;
    },
    setColor(color) {
      eyeMaterial.color.copy(color);
    },
  };
}
