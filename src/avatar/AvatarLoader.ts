import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AVATAR_ASSET_PATH } from "./configuration/avatar.config";

/**
 * Optional GLB replacement path.
 *
 * The shipped avatar is generated procedurally (see FacialRig / NeuralMesh) so
 * it needs no binary asset and no network request. If a GLB is dropped at
 * `public/assets/avatar/aurix-face.glb`, its vertices are re-rendered as the
 * same blue neural cloud. The loader fails silently and the procedural face
 * stays in place — a missing or broken asset never breaks the interface.
 *
 * Authoring contract for the replacement model:
 *  - metres, +Y up, face looking down +Z, head centred on the origin
 *  - a single head+neck mesh is enough; the loader samples every mesh
 *  - morph targets named after the visemes (aa, ee, oh, oo, mm, fv, th, ss, nn)
 *    are reserved for a future adapter and are not applied yet
 */
export interface LoadedAvatarAsset {
  object: THREE.Group;
  source: "glb";
  pointCount: number;
}

const TARGET_HEIGHT = 2.42;

export async function loadAvatarAsset(path: string = AVATAR_ASSET_PATH): Promise<LoadedAvatarAsset | null> {
  try {
    const head = await fetch(path, { method: "HEAD" });
    if (!head.ok) return null;
    const type = head.headers.get("content-type") || "";
    // A SPA dev server answers unknown paths with index.html; that is not a model.
    if (!type || type.includes("text/html")) return null;

    const gltf = await new GLTFLoader().loadAsync(path);
    const root = gltf.scene;
    root.updateMatrixWorld(true);

    const positions: number[] = [];
    const edges: number[] = [];
    const vertex = new THREE.Vector3();

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const attribute = geometry.getAttribute("position");
      if (!attribute) return;
      const base = positions.length / 3;
      for (let i = 0; i < attribute.count; i += 1) {
        vertex.fromBufferAttribute(attribute as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
        positions.push(vertex.x, vertex.y, vertex.z);
      }
      const index = geometry.getIndex();
      if (!index) return;
      const stride = index.count > 90000 ? 2 : 1;
      for (let i = 0; i + 2 < index.count; i += 3 * stride) {
        const a = base + index.getX(i);
        const b = base + index.getX(i + 1);
        const c = base + index.getX(i + 2);
        edges.push(a, b, b, c, c, a);
      }
    });

    if (positions.length < 30) return null;

    // Centre and scale the model to the procedural head's framing.
    const box = new THREE.Box3();
    for (let i = 0; i < positions.length; i += 3) {
      box.expandByPoint(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = TARGET_HEIGHT / Math.max(0.0001, size.y);
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = (positions[i] - center.x) * scale;
      positions[i + 1] = (positions[i + 1] - center.y) * scale;
      positions[i + 2] = (positions[i + 2] - center.z) * scale;
    }

    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));

    const group = new THREE.Group();
    const points = new THREE.Points(
      pointGeometry,
      new THREE.PointsMaterial({
        color: "#22E7FF",
        size: 0.014,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    const lines = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({
        color: "#00A8FF",
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    group.add(points, lines);

    return { object: group, source: "glb", pointCount: positions.length / 3 };
  } catch {
    return null;
  }
}
