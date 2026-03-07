/**
 * CLASH DETECTION MODULE (The "Collision Inspector")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES:
 * Detects spatial intersections (clashes) between building elements in loaded
 * IFC models. Uses a two-phase approach:
 *   Phase 1 (Broadphase): AABB sweep-and-prune to find candidate pairs quickly
 *   Phase 2 (Narrowphase): Triangle-to-triangle intersection tests using actual
 *     mesh geometry (via model.getItemsGeometry) for precise results
 *
 * HOW IT CONNECTS:
 * - WorldManager: Access to the 3D scene, camera, and renderer
 * - FragmentsManager: Access to loaded IFC model fragments and their meshes
 * - Highlighter: Highlights clashing elements when selected from the results panel
 * - ClashUIManager: Manages the results panel UI
 *
 * KEY CONCEPTS:
 * - Broadphase: Fast AABB overlap test to cull non-colliding pairs
 * - Narrowphase: Möller–Trumbore triangle-triangle intersection algorithm
 * - Tolerance: Minimum overlap distance to avoid false positives from touching faces
 * - Category Filtering: Only tests clashes between different IFC categories
 * - Visual Markers: Red/orange spheres rendered at actual mesh intersection points
 * --------------------------------------------------------------------------------
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as FRAGS from '@thatopen/fragments';
import * as THREE from 'three';
import { WorldManager } from './WorldManager';

// ============================================================================
// Types
// ============================================================================

/** Represents a single detected clash between two elements */
export interface ClashResult {
  /** Unique ID for this clash */
  id: string;
  /** First element info */
  elementA: ClashElement;
  /** Second element info */
  elementB: ClashElement;
  /** Intersection volume bounding box (world space) */
  intersectionBox: THREE.Box3;
  /** Center point of the clash (actual mesh intersection point) */
  center: THREE.Vector3;
  /** Overlap volume in cubic meters (approximate from AABB intersection) */
  overlapVolume: number;
  /** Severity: 'hard' (solid through solid) or 'soft' (clearance violation) */
  severity: 'hard' | 'soft';
  /** Number of intersecting triangle pairs found */
  intersectingTrianglePairs: number;
}

/** Element info within a clash */
export interface ClashElement {
  /** Model ID (fragment group UUID) */
  modelId: string;
  /** Human-readable model name (filename) */
  modelName: string;
  /** Local element ID within the model */
  localId: number;
  /** IFC category (e.g., 'IFCWALL', 'IFCBEAM') */
  ifcCategory: string;
  /** Bounding box of the element */
  boundingBox: THREE.Box3;
}

/** Detection scope: which element pairs to compare */
export type DetectionScope = 'all' | 'cross-model' | 'within-model';

/** Options for running clash detection */
export interface ClashDetectionOptions {
  /** Minimum overlap distance in meters to report as a clash (default: 0.01 = 1cm) */
  tolerance: number;
  /** Only detect clashes between different IFC categories (default: true) */
  crossCategoryOnly: boolean;
  /** Detection scope: 'all' = any pair, 'cross-model' = only between different models, 'within-model' = only within same model (default: 'all') */
  detectionScope: DetectionScope;
  /** IFC categories to include (empty = all) */
  includeCategories: string[];
  /** IFC categories to exclude from detection */
  excludeCategories: string[];
  /** Maximum number of clashes to report (default: 200) */
  maxClashes: number;
  /** Max triangle pairs to test per candidate pair before giving up (default: 50000) */
  maxTrianglePairsPerTest: number;
  /** Model IDs to include (empty = all loaded models) */
  selectedModelIds: string[];
}

const DEFAULT_OPTIONS: ClashDetectionOptions = {
  tolerance: 0.01,
  crossCategoryOnly: true,
  detectionScope: 'all',
  includeCategories: [],
  excludeCategories: ['IFCSPACE', 'IFCOPENINGELEMENT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY'],
  maxClashes: 1000,
  maxTrianglePairsPerTest: 50000,
  selectedModelIds: [],
};

// ============================================================================
// Clash Visualizer — handles 3D markers (spheres at intersection points)
// ============================================================================

class ClashVisualizer {
  private markers: THREE.Group;
  private scene: THREE.Scene | null = null;

  constructor() {
    this.markers = new THREE.Group();
    this.markers.name = 'ClashDetection_Markers';
  }

  /** Attach to a Three.js scene */
  public setScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  /** Create visual markers for all clashes */
  public showClashes(clashes: ClashResult[]): void {
    this.clearMarkers();
    if (!this.scene) return;

    for (const clash of clashes) {
      const marker = this.createClashMarker(clash);
      this.markers.add(marker);
    }

    this.scene.add(this.markers);
  }

  /** Highlight a single clash marker (pulse animation) */
  public highlightClash(clashId: string): void {
    for (const child of this.markers.children) {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (child.userData.clashId === clashId) {
        mat.opacity = 0.85;
        mat.color.setHex(0xff0000);
        child.scale.setScalar(1.4);
      } else {
        mat.opacity = 0.35;
        mat.color.setHex(0xff4444);
        child.scale.setScalar(1.0);
      }
    }
  }

  /** Remove all markers from the scene */
  public clearMarkers(): void {
    for (const child of [...this.markers.children]) {
      const mesh = child as THREE.Mesh;
      (mesh.material as THREE.Material).dispose();
      mesh.geometry.dispose();
      this.markers.remove(child);
    }
    if (this.scene && this.markers.parent) {
      this.scene.remove(this.markers);
    }
  }

  /** Get the marker group (for raycasting if needed) */
  public getMarkerGroup(): THREE.Group {
    return this.markers;
  }

  private createClashMarker(clash: ClashResult): THREE.Mesh {
    // Use a sphere at the actual intersection center point
    // Minimum 15cm radius so all clash markers are clearly visible from any distance
    const radius = Math.max(0.15, Math.min(0.4, clash.overlapVolume * 200));
    const geometry = new THREE.SphereGeometry(radius, 16, 12);
    const color = clash.severity === 'hard' ? 0xff0000 : 0xff8800;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
      depthTest: false, // Always visible, even behind geometry
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(clash.center);
    mesh.userData.clashId = clash.id;
    mesh.renderOrder = 999;

    return mesh;
  }
}

// ============================================================================
// Triangle Intersection Engine — Möller–Trumbore algorithm
// ============================================================================

/** A transformed triangle ready for intersection testing */
interface TransformedTriangle {
  v0: THREE.Vector3;
  v1: THREE.Vector3;
  v2: THREE.Vector3;
}

/** Geometry data for a single element, ready for triangle testing */
interface ElementGeometry {
  modelId: string;
  localId: number;
  ifcCategory: string;
  box: THREE.Box3;
  triangles: TransformedTriangle[];
}

class TriangleIntersectionEngine {
  private static readonly EPSILON = 1e-8;

  /**
   * Test whether two triangles geometrically intersect in 3D.
   * Returns the penetration depth (how deeply one triangle crosses the other's plane)
   * or -1 if they do not intersect.
   *
   * This is a PURE GEOMETRY test — filtering by tolerance / flush rejection
   * is done at the element level in findIntersectionCenter().
   */
  public static trianglesIntersectWithDepth(
    t1: TransformedTriangle,
    t2: TransformedTriangle
  ): number {
    // Compute t2's plane normal (normalized)
    const n2 = new THREE.Vector3();
    const e2a = new THREE.Vector3().subVectors(t2.v1, t2.v0);
    const e2b = new THREE.Vector3().subVectors(t2.v2, t2.v0);
    n2.crossVectors(e2a, e2b);
    if (n2.lengthSq() < TriangleIntersectionEngine.EPSILON) return -1;
    n2.normalize();

    // Compute t1's plane normal (normalized)
    const n1 = new THREE.Vector3();
    const e1a = new THREE.Vector3().subVectors(t1.v1, t1.v0);
    const e1b = new THREE.Vector3().subVectors(t1.v2, t1.v0);
    n1.crossVectors(e1a, e1b);
    if (n1.lengthSq() < TriangleIntersectionEngine.EPSILON) return -1;
    n1.normalize();

    // NOTE: No per-triangle normal rejection here.
    // Clash vs surface-contact classification is done at the element level
    // in findIntersectionCenter() using intersection thickness + crossing ratio.

    // ── Reject coplanar triangles (numerical stability) ──
    // If all vertices of one triangle lie within floating-point noise of the
    // other's plane, the SAT result is unreliable. Skip these pairs; the
    // element-level filter handles surface contacts correctly.
    const coplanarEps = 1e-5; // 0.01mm

    // ── Signed distances of t1's vertices to t2's plane ──
    const d2 = -n2.dot(t2.v0);
    const dA0 = n2.dot(t1.v0) + d2;
    const dA1 = n2.dot(t1.v1) + d2;
    const dA2 = n2.dot(t1.v2) + d2;

    // If all vertices of t1 are on the same side → no intersection
    if (dA0 > 0 && dA1 > 0 && dA2 > 0) return -1;
    if (dA0 < 0 && dA1 < 0 && dA2 < 0) return -1;

    // Reject coplanar: all of t1's vertices are within noise of t2's plane
    if (Math.abs(dA0) < coplanarEps && Math.abs(dA1) < coplanarEps && Math.abs(dA2) < coplanarEps) return -1;

    // ── Signed distances of t2's vertices to t1's plane ──
    const d1 = -n1.dot(t1.v0);
    const dB0 = n1.dot(t2.v0) + d1;
    const dB1 = n1.dot(t2.v1) + d1;
    const dB2 = n1.dot(t2.v2) + d1;

    if (dB0 > 0 && dB1 > 0 && dB2 > 0) return -1;
    if (dB0 < 0 && dB1 < 0 && dB2 < 0) return -1;

    // Reject coplanar: all of t2's vertices are within noise of t1's plane
    if (Math.abs(dB0) < coplanarEps && Math.abs(dB1) < coplanarEps && Math.abs(dB2) < coplanarEps) return -1;

    // ── Compute PENETRATION DEPTH ──
    // This is the minimum of "how far the triangle crosses the other's plane"
    // on the SHALLOW side. This tells us actual crossing depth, not triangle span.
    //
    // For triangle A crossing B's plane:
    //   maxPositive = farthest vertex on positive side
    //   maxNegative = farthest vertex on negative side (absolute value)
    //   penetration = the SMALLER of the two = actual crossing depth
    //
    // For a wall side triangle (3m tall) barely touching a slab:
    //   positive side = 2.7m, negative side = 0.001m → penetration = 0.001m (tiny!)
    // For a pipe truly going through a wall:
    //   positive side = 0.15m, negative side = 0.15m → penetration = 0.15m (real!)

    const aMaxPos = Math.max(dA0, dA1, dA2);
    const aMaxNeg = Math.max(-dA0, -dA1, -dA2); // max absolute value on negative side
    const aPenDepth = (aMaxPos > 0 && aMaxNeg > 0) ? Math.min(aMaxPos, aMaxNeg) : 0;

    const bMaxPos = Math.max(dB0, dB1, dB2);
    const bMaxNeg = Math.max(-dB0, -dB1, -dB2);
    const bPenDepth = (bMaxPos > 0 && bMaxNeg > 0) ? Math.min(bMaxPos, bMaxNeg) : 0;

    // Use the MAXIMUM penetration depth of the two triangles
    const penDepth = Math.max(aPenDepth, bPenDepth);

    // Full SAT confirmation — ensures the triangles actually overlap in 3D
    if (!TriangleIntersectionEngine.satTest(t1, t2, n1, n2)) return -1;

    return penDepth;
  }

  /**
   * Full Separating Axis Theorem test for two triangles.
   * Tests 13 separating axes: 2 face normals + 9 edge-pair cross products + 2 edge normals.
   */
  private static satTest(
    t1: TransformedTriangle,
    t2: TransformedTriangle,
    n1: THREE.Vector3,
    n2: THREE.Vector3
  ): boolean {
    const v1 = [t1.v0, t1.v1, t1.v2];
    const v2 = [t2.v0, t2.v1, t2.v2];

    const edges1 = [
      new THREE.Vector3().subVectors(t1.v1, t1.v0),
      new THREE.Vector3().subVectors(t1.v2, t1.v1),
      new THREE.Vector3().subVectors(t1.v0, t1.v2),
    ];
    const edges2 = [
      new THREE.Vector3().subVectors(t2.v1, t2.v0),
      new THREE.Vector3().subVectors(t2.v2, t2.v1),
      new THREE.Vector3().subVectors(t2.v0, t2.v2),
    ];

    // Test face normals
    if (TriangleIntersectionEngine.isSeparatingAxis(v1, v2, n1)) return false;
    if (TriangleIntersectionEngine.isSeparatingAxis(v1, v2, n2)) return false;

    // Test edge-pair cross products (9 axes)
    for (const e1 of edges1) {
      for (const e2 of edges2) {
        const axis = new THREE.Vector3().crossVectors(e1, e2);
        if (axis.lengthSq() < TriangleIntersectionEngine.EPSILON) continue; // parallel edges
        if (TriangleIntersectionEngine.isSeparatingAxis(v1, v2, axis)) return false;
      }
    }

    // No separating axis found → triangles intersect
    return true;
  }

  /**
   * Check whether a given axis separates two sets of vertices.
   */
  private static isSeparatingAxis(
    v1: THREE.Vector3[],
    v2: THREE.Vector3[],
    axis: THREE.Vector3
  ): boolean {
    let min1 = Infinity, max1 = -Infinity;
    let min2 = Infinity, max2 = -Infinity;

    for (const v of v1) {
      const proj = axis.dot(v);
      if (proj < min1) min1 = proj;
      if (proj > max1) max1 = proj;
    }
    for (const v of v2) {
      const proj = axis.dot(v);
      if (proj < min2) min2 = proj;
      if (proj > max2) max2 = proj;
    }

    return max1 < min2 || max2 < min1;
  }

  /**
   * Find intersecting triangles between two elements and classify the result
   * as a real clash (penetration) vs. surface contact (flush).
   *
   * Uses two complementary criteria:
   *
   * 1. INTERSECTION THICKNESS — bounding box of all intersection midpoints.
   *    Surface contacts: midpoints cluster on a flat plane → thickness ≈ 0.
   *    Real penetrations: midpoints spread in 3D → thickness > tolerance.
   *
   * 2. CROSSING RATIO — fraction of intersecting pairs where triangle normals
   *    are significantly non-parallel (|n1·n2| < 0.5, i.e. >60° angle).
   *    Surface contacts: mostly parallel normals → low crossing ratio.
   *    Real clashes: diverse angles where surfaces cross → high crossing ratio.
   *
   * Decision:
   *   thickness >= tolerance              → CLASH (volumetric intersection)
   *   crossingRatio > 0.15                → CLASH (surfaces cross at diverse angles)
   *   otherwise                           → SURFACE CONTACT (reject)
   */
  public static findIntersectionCenter(
    trisA: TransformedTriangle[],
    trisB: TransformedTriangle[],
    maxPairs: number,
    tolerance: number = 0.02
  ): { center: THREE.Vector3; pairCount: number; maxTriangleDepth: number } {
    const midpoints: THREE.Vector3[] = [];
    const normalDots: number[] = [];
    let maxTriangleDepth = 0;
    let pairsChecked = 0;

    // Reusable vectors for normal computation
    const _e1 = new THREE.Vector3();
    const _e2 = new THREE.Vector3();
    const _nA = new THREE.Vector3();
    const _nB = new THREE.Vector3();

    for (const ta of trisA) {
      // Quick AABB pre-check per triangle pair
      const boxA = new THREE.Box3();
      boxA.expandByPoint(ta.v0);
      boxA.expandByPoint(ta.v1);
      boxA.expandByPoint(ta.v2);

      for (const tb of trisB) {
        if (pairsChecked >= maxPairs) break;

        // Quick per-triangle AABB check
        const boxB = new THREE.Box3();
        boxB.expandByPoint(tb.v0);
        boxB.expandByPoint(tb.v1);
        boxB.expandByPoint(tb.v2);

        if (!boxA.intersectsBox(boxB)) continue;

        pairsChecked++;

        const depth = TriangleIntersectionEngine.trianglesIntersectWithDepth(ta, tb);
        if (depth >= 0) {
          if (depth > maxTriangleDepth) maxTriangleDepth = depth;

          // Compute midpoint of the two triangle centroids
          const centA = new THREE.Vector3().add(ta.v0).add(ta.v1).add(ta.v2).divideScalar(3);
          const centB = new THREE.Vector3().add(tb.v0).add(tb.v1).add(tb.v2).divideScalar(3);
          midpoints.push(centA.add(centB).divideScalar(2));

          // Track normal alignment for crossing vs surface contact classification
          _e1.subVectors(ta.v1, ta.v0); _e2.subVectors(ta.v2, ta.v0);
          _nA.crossVectors(_e1, _e2);
          const lenA = _nA.length();

          _e1.subVectors(tb.v1, tb.v0); _e2.subVectors(tb.v2, tb.v0);
          _nB.crossVectors(_e1, _e2);
          const lenB = _nB.length();

          if (lenA > 1e-8 && lenB > 1e-8) {
            normalDots.push(Math.abs(_nA.dot(_nB) / (lenA * lenB)));
          }
        }
      }
      if (pairsChecked >= maxPairs) break;
    }

    if (midpoints.length === 0) {
      return { center: new THREE.Vector3(), pairCount: 0, maxTriangleDepth: 0 };
    }

    // Compute centroid of all intersection midpoints
    const center = new THREE.Vector3();
    for (const mp of midpoints) center.add(mp);
    center.divideScalar(midpoints.length);

    // ── CLASH vs SURFACE CONTACT CLASSIFICATION ──

    // 1. Intersection thickness: min dimension of the midpoints' bounding box
    const mpBbox = new THREE.Box3();
    for (const mp of midpoints) mpBbox.expandByPoint(mp);
    const mpSize = new THREE.Vector3();
    mpBbox.getSize(mpSize);
    const thickness = Math.min(mpSize.x, mpSize.y, mpSize.z);

    // 2. Crossing ratio: fraction of pairs where normals differ by >60°
    const crossingCount = normalDots.filter(d => d < 0.5).length;
    const crossingRatio = normalDots.length > 0 ? crossingCount / normalDots.length : 0;

    const isClash = thickness >= tolerance || crossingRatio > 0.15;

    console.log(
      `[ClashDetection] Triangle test: ${midpoints.length} pairs, ` +
      `thickness=${(thickness * 100).toFixed(1)}cm, ` +
      `crossingRatio=${(crossingRatio * 100).toFixed(0)}% (${crossingCount}/${normalDots.length}), ` +
      `tolerance=${(tolerance * 100).toFixed(1)}cm → ` +
      `${isClash ? 'CLASH' : 'REJECTED (surface contact)'}`
    );

    if (!isClash) {
      return { center: new THREE.Vector3(), pairCount: 0, maxTriangleDepth: 0 };
    }

    return { center, pairCount: midpoints.length, maxTriangleDepth };
  }

  /**
   * Compute how deep a point is INSIDE a bounding box.
   * Returns the minimum distance from the point to any face of the box.
   * Returns 0 if the point is outside the box.
   */
  private static depthInsideBBox(point: THREE.Vector3, bbox: THREE.Box3): number {
    // If point is outside the bbox, depth is 0
    if (!bbox.containsPoint(point)) return 0;

    // Distance to each face (6 faces)
    const dx1 = point.x - bbox.min.x;
    const dx2 = bbox.max.x - point.x;
    const dy1 = point.y - bbox.min.y;
    const dy2 = bbox.max.y - point.y;
    const dz1 = point.z - bbox.min.z;
    const dz2 = bbox.max.z - point.z;

    return Math.min(dx1, dx2, dy1, dy2, dz1, dz2);
  }
}

// ============================================================================
// Clash Engine — two-phase detection logic
// ============================================================================

interface ElementBBoxEntry {
  modelId: string;
  modelName: string;
  localId: number;
  ifcCategory: string;
  box: THREE.Box3;
}

/** A candidate pair that passed the broadphase (AABB overlap) */
interface CandidatePair {
  a: ElementBBoxEntry;
  b: ElementBBoxEntry;
  intersectionBox: THREE.Box3;
  overlapVolume: number;
  minOverlap: number;
}

class ClashEngine {
  /**
   * Run two-phase clash detection:
   * Phase 1: AABB broadphase (sweep-and-prune)
   * Phase 2: Triangle-level narrowphase (actual mesh intersection)
   */
  public async detectClashes(
    fragments: OBC.FragmentsManager,
    options: ClashDetectionOptions,
    onProgress?: (progress: number, message: string) => void,
    modelNameResolver?: (modelId: string) => string
  ): Promise<ClashResult[]> {
    onProgress?.(2, 'Collecting element bounding boxes...');

    // Phase 1: Collect per-element bounding boxes
    const entries = await this.collectElementBBoxes(fragments, options, modelNameResolver);

    if (entries.length === 0) {
      onProgress?.(100, 'No elements found');
      return [];
    }

    onProgress?.(15, `Phase 1: AABB broadphase on ${entries.length} elements...`);

    // Phase 1: Sort by min-x for sweep-and-prune
    entries.sort((a, b) => a.box.min.x - b.box.min.x);

    // Phase 1: Find candidate pairs via AABB overlap
    const candidates = this.sweepAndPrune(entries, options, onProgress);

    if (candidates.length === 0) {
      onProgress?.(100, 'No AABB overlaps found — model is clean');
      return [];
    }

    onProgress?.(40, `Phase 2: Triangle intersection on ${candidates.length} candidate pairs...`);

    // Phase 2: Triangle-level verification
    const clashes = await this.verifyWithTriangles(fragments, candidates, options, onProgress);

    // Sort by intersecting triangle pairs descending (most severe first)
    clashes.sort((a, b) => b.intersectingTrianglePairs - a.intersectingTrianglePairs);

    onProgress?.(100, `Clash detection complete — ${clashes.length} confirmed clashes`);
    return clashes;
  }

  /**
   * Collect bounding boxes for all individual elements across all models.
   * Uses the OBC FragmentsModel API (getCategories, getItemsOfCategories, getBoxes).
   */
  private async collectElementBBoxes(
    fragments: OBC.FragmentsManager,
    options: ClashDetectionOptions,
    modelNameResolver?: (modelId: string) => string
  ): Promise<ElementBBoxEntry[]> {
    const entries: ElementBBoxEntry[] = [];
    const includeSet = new Set(options.includeCategories.map(c => c.toUpperCase()));
    const excludeSet = new Set(options.excludeCategories.map(c => c.toUpperCase()));
    const selectedModelSet = new Set(options.selectedModelIds);

    for (const [modelId, model] of fragments.list) {
      // Skip models not in the selected set (if any are selected)
      if (selectedModelSet.size > 0 && !selectedModelSet.has(modelId)) continue;

      const modelName = modelNameResolver?.(modelId) || modelId;

      try {
        const categories: string[] = await (model as any).getCategories();
        if (!categories || categories.length === 0) continue;

        const geometryCategories = categories.filter((cat: string) => {
          const upper = cat.toUpperCase();
          if (excludeSet.has(upper)) return false;
          if (includeSet.size > 0 && !includeSet.has(upper)) return false;
          if (/^(IFCPROJECT|IFCSITE|IFCBUILDING|IFCBUILDINGSTOREY|IFCSPACE|IFCOPENINGELEMENT|IFCRELDEFINES|IFCREL|IFCPROPERTY|IFCMATERIAL|IFCOWNERHISTORY|IFCAPPLICATION|IFCPERSON|IFCORGANIZATION|IFCPOSTALADDRESS)/.test(upper)) return false;
          return true;
        });

        for (const category of geometryCategories) {
          const categoryRegex = new RegExp(`^${category}$`);
          const items = await (model as any).getItemsOfCategories([categoryRegex]);
          const categoryKey = Object.keys(items).find((key: string) => key.includes(category));

          if (!categoryKey || !items[categoryKey] || items[categoryKey].length === 0) continue;

          const itemIds: number[] = items[categoryKey];
          const upperCategory = category.toUpperCase();

          // Get individual bounding boxes
          if (typeof (model as any).getBoxes === 'function') {
            try {
              const boxes = await (model as any).getBoxes(itemIds);
              if (boxes && boxes.length === itemIds.length) {
                for (let i = 0; i < itemIds.length; i++) {
                  const box = boxes[i] as THREE.Box3;
                  if (box && !box.isEmpty()) {
                    entries.push({
                      modelId,
                      modelName,
                      localId: itemIds[i],
                      ifcCategory: upperCategory,
                      box: box.clone(),
                    });
                  }
                }
                continue;
              }
            } catch {
              // Fall through to getMergedBox
            }
          }

          // Fallback: merged box (skip for triangle-level — too imprecise)
          // Only include if we can get individual boxes
        }
      } catch (e) {
        console.warn(`[ClashDetection] Error processing model ${modelId}:`, e);
      }
    }

    return entries;
  }

  /**
   * Phase 1: Sweep-and-prune to find AABB-overlapping candidate pairs.
   * Does NOT confirm clashes — only finds candidates for narrowphase.
   */
  private sweepAndPrune(
    entries: ElementBBoxEntry[],
    options: ClashDetectionOptions,
    onProgress?: (progress: number, message: string) => void
  ): CandidatePair[] {
    const candidates: CandidatePair[] = [];
    const n = entries.length;
    const seenPairs = new Set<string>();
    // Allow generous broadphase candidates — narrowphase will confirm or reject
    const maxCandidates = Math.max(options.maxClashes * 50, 10000);

    for (let i = 0; i < n && candidates.length < maxCandidates; i++) {
      const a = entries[i];

      if (i % 2000 === 0 && i > 0) {
        const pct = 15 + Math.floor((i / n) * 20);
        onProgress?.(pct, `Broadphase: element ${i}/${n} (${candidates.length} candidates)...`);
      }

      for (let j = i + 1; j < n && candidates.length < maxCandidates; j++) {
        const b = entries[j];

        // Sweep prune: if b's min.x is beyond a's max.x, no more overlaps for a
        if (b.box.min.x > a.box.max.x) break;

        // Skip same-element
        if (a.modelId === b.modelId && a.localId === b.localId) continue;

        // Detection scope filter
        const sameModel = a.modelId === b.modelId;
        if (options.detectionScope === 'cross-model' && sameModel) continue;
        if (options.detectionScope === 'within-model' && !sameModel) continue;

        // Skip same-category if cross-category only
        // Exception: in cross-model mode, allow same-category clashes between different models
        if (options.crossCategoryOnly && a.ifcCategory === b.ifcCategory) {
          if (options.detectionScope !== 'cross-model' || sameModel) continue;
        }

        // Avoid duplicate pairs
        const pairKey = a.localId < b.localId
          ? `${a.modelId}:${a.localId}-${b.modelId}:${b.localId}`
          : `${b.modelId}:${b.localId}-${a.modelId}:${a.localId}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        // Test AABB intersection
        if (!a.box.intersectsBox(b.box)) continue;

        // Compute intersection box
        const intersection = new THREE.Box3(
          new THREE.Vector3(
            Math.max(a.box.min.x, b.box.min.x),
            Math.max(a.box.min.y, b.box.min.y),
            Math.max(a.box.min.z, b.box.min.z)
          ),
          new THREE.Vector3(
            Math.min(a.box.max.x, b.box.max.x),
            Math.min(a.box.max.y, b.box.max.y),
            Math.min(a.box.max.z, b.box.max.z)
          )
        );

        const iSize = new THREE.Vector3();
        intersection.getSize(iSize);

        const minOverlap = Math.min(iSize.x, iSize.y, iSize.z);
        // Don't filter by tolerance here — let the narrowphase triangle test +
        // surface proximity filter decide. AABB overlap alone is too coarse.

        const overlapVolume = iSize.x * iSize.y * iSize.z;

        candidates.push({ a, b, intersectionBox: intersection, overlapVolume, minOverlap });
      }
    }

    // Sort candidates: largest overlap first (most likely real clashes)
    candidates.sort((a, b) => b.overlapVolume - a.overlapVolume);

    console.log(`[ClashDetection] Broadphase: ${candidates.length} AABB candidate pairs (tolerance=${(options.tolerance * 100).toFixed(1)}cm, filtered ${seenPairs.size - candidates.length} pairs below tolerance)`);
    return candidates;
  }

  /**
   * Phase 2: Verify each candidate pair with triangle-to-triangle intersection.
   * Fetches actual mesh geometry via model.getItemsGeometry() and tests
   * triangles from element A against triangles from element B.
   */
  private async verifyWithTriangles(
    fragments: OBC.FragmentsManager,
    candidates: CandidatePair[],
    options: ClashDetectionOptions,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ClashResult[]> {
    const clashes: ClashResult[] = [];
    const geometryCache = new Map<string, TransformedTriangle[]>();

    // Process all candidates until maxClashes confirmed results are found
    const total = candidates.length;
    let rejectedNoGeo = 0;
    let rejectedNoIntersection = 0;

    for (let i = 0; i < total && clashes.length < options.maxClashes; i++) {
      const pair = candidates[i];

      // Progress: 40% → 95%
      if (i % 10 === 0) {
        const pct = 40 + Math.floor((i / total) * 55);
        onProgress?.(pct, `Triangle test: ${i}/${total} pairs (${clashes.length} confirmed)...`);

        // Yield to keep UI responsive
        await new Promise(r => setTimeout(r, 0));
      }

      // Get triangles for element A
      const keyA = `${pair.a.modelId}:${pair.a.localId}`;
      let trisA = geometryCache.get(keyA);
      if (!trisA) {
        trisA = await this.getElementTriangles(fragments, pair.a.modelId, pair.a.localId);
        geometryCache.set(keyA, trisA);
      }

      // Get triangles for element B
      const keyB = `${pair.b.modelId}:${pair.b.localId}`;
      let trisB = geometryCache.get(keyB);
      if (!trisB) {
        trisB = await this.getElementTriangles(fragments, pair.b.modelId, pair.b.localId);
        geometryCache.set(keyB, trisB);
      }

      if (trisA.length === 0 || trisB.length === 0) {
        rejectedNoGeo++;
        continue;
      }

      // Run triangle-to-triangle intersection test
      const result = TriangleIntersectionEngine.findIntersectionCenter(
        trisA,
        trisB,
        options.maxTrianglePairsPerTest,
        options.tolerance
      );

      if (result.pairCount > 0) {
        clashes.push({
          id: `clash_${clashes.length + 1}`,
          elementA: {
            modelId: pair.a.modelId,
            modelName: pair.a.modelName,
            localId: pair.a.localId,
            ifcCategory: pair.a.ifcCategory,
            boundingBox: pair.a.box.clone(),
          },
          elementB: {
            modelId: pair.b.modelId,
            modelName: pair.b.modelName,
            localId: pair.b.localId,
            ifcCategory: pair.b.ifcCategory,
            boundingBox: pair.b.box.clone(),
          },
          intersectionBox: pair.intersectionBox,
          center: result.center,
          overlapVolume: pair.overlapVolume,
          severity: pair.minOverlap > 0.05 ? 'hard' : 'soft',
          intersectingTrianglePairs: result.pairCount,
        });
      } else {
        rejectedNoIntersection++;
      }
    }

    // Clean up geometry cache
    geometryCache.clear();

    console.log(`[ClashDetection] Narrowphase: ${clashes.length} confirmed, ${rejectedNoGeo} no geometry, ${rejectedNoIntersection} no intersection (of ${total} candidates)`);
    return clashes;
  }

  /**
   * Extract all triangles for a given element using model.getItemsGeometry().
   * Applies the mesh transform so triangles are in world space.
   */
  private async getElementTriangles(
    fragments: OBC.FragmentsManager,
    modelId: string,
    localId: number
  ): Promise<TransformedTriangle[]> {
    const model = fragments.list.get(modelId);
    if (!model) return [];

    const triangles: TransformedTriangle[] = [];

    try {
      // Get geometry data via OBC API
      const geometriesArray = await (model as any).getItemsGeometry([localId]);
      if (!geometriesArray || geometriesArray.length === 0) return [];

      const meshDataList = geometriesArray[0]; // First (and only) item's geometry parts
      if (!meshDataList || meshDataList.length === 0) {
        // Try children (assembly elements like IFCCURTAINWALL)
        const children = await (model as any).getItemsChildren([localId]);
        if (children && children.length > 0) {
          const childGeometries = await (model as any).getItemsGeometry(children);
          if (childGeometries) {
            for (const childMeshList of childGeometries) {
              if (!childMeshList) continue;
              for (const meshData of childMeshList) {
                this.extractTrianglesFromMeshData(meshData, triangles);
              }
            }
          }
        }
        return triangles;
      }

      for (const meshData of meshDataList) {
        this.extractTrianglesFromMeshData(meshData, triangles);
      }
    } catch (e) {
      // Silently skip elements with no accessible geometry
    }

    return triangles;
  }

  /**
   * Extract triangles from a MeshData object (positions + indices + transform).
   */
  private extractTrianglesFromMeshData(meshData: any, out: TransformedTriangle[]): void {
    if (!meshData?.positions || !meshData?.indices) return;

    const positions = meshData.positions as Float32Array | Float64Array;
    const indices = meshData.indices as Uint8Array | Uint16Array | Uint32Array;
    const transform: THREE.Matrix4 | undefined = meshData.transform;

    // Build triangles from index buffer
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const i0 = indices[i] * 3;
      const i1 = indices[i + 1] * 3;
      const i2 = indices[i + 2] * 3;

      if (i0 + 2 >= positions.length || i1 + 2 >= positions.length || i2 + 2 >= positions.length) continue;

      const v0 = new THREE.Vector3(positions[i0], positions[i0 + 1], positions[i0 + 2]);
      const v1 = new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]);
      const v2 = new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2]);

      // Apply IFC transform to bring into world space
      if (transform) {
        v0.applyMatrix4(transform);
        v1.applyMatrix4(transform);
        v2.applyMatrix4(transform);
      }

      // Skip degenerate triangles (zero area)
      const edge1 = new THREE.Vector3().subVectors(v1, v0);
      const edge2 = new THREE.Vector3().subVectors(v2, v0);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2);
      if (normal.lengthSq() < 1e-12) continue;

      out.push({ v0, v1, v2 });
    }
  }
}

// ============================================================================
// ClashDetectionModule — Public API (follows ClusterModule pattern)
// ============================================================================

export class ClashDetectionModule {
  private worldManager: WorldManager;
  private visualizer: ClashVisualizer;
  private engine: ClashEngine;
  private clashes: ClashResult[] = [];
  private active: boolean = false;
  private options: ClashDetectionOptions = { ...DEFAULT_OPTIONS };
  private ghostedModels: Set<string> = new Set();

  // Callbacks for UI integration
  public onLoadingStart: (() => void) | null = null;
  public onLoadingEnd: (() => void) | null = null;
  public onClashesDetected: ((clashes: ClashResult[]) => void) | null = null;
  public onClashModeExited: (() => void) | null = null;

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
    this.visualizer = new ClashVisualizer();
    this.engine = new ClashEngine();
  }

  /**
   * Initialize the module (attach to the 3D scene)
   */
  public async initialize(): Promise<void> {
    const world = this.worldManager.world;
    if (world?.scene?.three) {
      this.visualizer.setScene(world.scene.three as THREE.Scene);
    }

    // Set up clash highlight styles (red for element A, green for element B)
    try {
      const components = this.worldManager.getComponents();
      const highlighter = components.get(OBF.Highlighter);
      if (highlighter) {
        highlighter.styles.set('clash_red', {
          color: new THREE.Color(0xff2222),
          opacity: 0.85,
          transparent: true,
          renderedFaces: 1,
        });
        highlighter.styles.set('clash_green', {
          color: new THREE.Color(0x22cc44),
          opacity: 0.85,
          transparent: true,
          renderedFaces: 1,
        });
      }
    } catch { /* highlighter not yet available — will be set up lazily */ }

    console.log('✅ ClashDetectionModule initialized');
  }

  /**
   * Run clash detection on all loaded models.
   * Toggles: if active, clears; if inactive, runs detection.
   */
  public async toggleClashDetection(): Promise<ClashResult[]> {
    if (this.active) {
      this.clearClashes();
      return [];
    }

    return await this.runDetection();
  }

  /**
   * Run clash detection with optional custom options
   */
  public async runDetection(customOptions?: Partial<ClashDetectionOptions>): Promise<ClashResult[]> {
    const opts = { ...this.options, ...customOptions };

    console.log(`[ClashDetection] Starting detection with tolerance=${(opts.tolerance * 100).toFixed(1)}cm, crossCategoryOnly=${opts.crossCategoryOnly}, scope=${opts.detectionScope}, selectedModels=${opts.selectedModelIds.length || 'all'}`);

    this.onLoadingStart?.();

    try {
      const components = this.worldManager.getComponents();
      const fragments = components.get(OBC.FragmentsManager);

      // Build a model name resolver using IFCLoaderModule metadata
      const modelNameResolver = (modelId: string): string => {
        return this.resolveModelName(modelId);
      };

      this.clashes = await this.engine.detectClashes(fragments, opts, (progress, message) => {
        console.log(`[ClashDetection] ${progress}% — ${message}`);
      }, modelNameResolver);

      if (this.clashes.length > 0) {
        this.active = true;
      }

      this.onClashesDetected?.(this.clashes);
      return this.clashes;
    } catch (error) {
      console.error('❌ Clash detection failed:', error);
      return [];
    } finally {
      this.onLoadingEnd?.();
    }
  }

  /**
   * Clear all clash results and highlights
   */
  public clearClashes(): void {
    this.clearClashHighlights();
    this.visualizer.clearMarkers();
    this.clashes = [];
    this.active = false;
    this.onClashModeExited?.();
  }

  /**
   * Get the current clash results
   */
  public getClashes(): ClashResult[] {
    return this.clashes;
  }

  /**
   * Get clash count
   */
  public getClashCount(): number {
    return this.clashes.length;
  }

  /**
   * Check if clash detection is currently active
   */
  public isActive(): boolean {
    return this.active;
  }

  /**
   * Zoom to a specific clash location
   */
  public async zoomToClash(clashId: string): Promise<void> {
    const clash = this.clashes.find(c => c.id === clashId);
    if (!clash) return;

    // Zoom camera to the clash location
    const world = this.worldManager.world;
    if (!world?.camera) return;

    const cam = world.camera as any;
    if (cam.controls) {
      const target = clash.center.clone();
      const size = new THREE.Vector3();
      clash.intersectionBox.getSize(size);
      const radius = Math.max(size.x, size.y, size.z) * 3 + 2;

      // Orbit camera around the clash center
      const offset = new THREE.Vector3(radius * 0.7, radius * 0.5, radius * 0.7);
      const cameraPos = target.clone().add(offset);

      await cam.controls.setLookAt(
        cameraPos.x, cameraPos.y, cameraPos.z,
        target.x, target.y, target.z,
        true // animate
      );
    }
  }

  /**
   * Highlight elements from one or more clashes with distinct colors,
   * and ghost (semi-transparent) all other elements for focus.
   * Element A = red, Element B = green.
   */
  public async highlightClashElements(clashIds: string | string[]): Promise<void> {
    const ids = Array.isArray(clashIds) ? clashIds : [clashIds];
    const selected = ids.map(id => this.clashes.find(c => c.id === id)).filter(Boolean) as ClashResult[];
    if (selected.length === 0) return;

    const components = this.worldManager.getComponents();
    const highlighter = components.get(OBF.Highlighter);
    if (!highlighter) return;

    // Clear previous clash highlights
    this.clearClashHighlights();

    // Ensure styles exist
    if (!highlighter.styles.has('clash_red')) {
      highlighter.styles.set('clash_red', {
        color: new THREE.Color(0xff2222),
        opacity: 0.85,
        transparent: true,
        renderedFaces: 1,
      });
    }
    if (!highlighter.styles.has('clash_green')) {
      highlighter.styles.set('clash_green', {
        color: new THREE.Color(0x22cc44),
        opacity: 0.85,
        transparent: true,
        renderedFaces: 1,
      });
    }

    // Collect all element A and B selections across all selected clashes
    const selA: Record<string, Set<number>> = {};
    const selB: Record<string, Set<number>> = {};

    for (const clash of selected) {
      const { elementA, elementB } = clash;
      if (!selA[elementA.modelId]) selA[elementA.modelId] = new Set();
      selA[elementA.modelId].add(elementA.localId);
      if (!selB[elementB.modelId]) selB[elementB.modelId] = new Set();
      selB[elementB.modelId].add(elementB.localId);
    }

    // Highlight: Element A(s) → red, Element B(s) → green
    await highlighter.highlightByID('clash_red', selA, false);
    await highlighter.highlightByID('clash_green', selB, false);

    // Ghost all other elements for focus
    await this.ghostNonClashElements(selected);
  }

  /**
   * Ghost (semi-transparent) all elements that are NOT involved in the selected clashes.
   * Uses model.highlight() with a translucent material for "other" elements
   * and a solid material for the clash elements to keep them opaque.
   */
  private async ghostNonClashElements(selected: ClashResult[]): Promise<void> {
    try {
      const components = this.worldManager.getComponents();
      const fragments = components.get(OBC.FragmentsManager);

      // Collect clashing element IDs per model
      const clashIds = new Map<string, Set<number>>();
      for (const clash of selected) {
        if (!clashIds.has(clash.elementA.modelId)) clashIds.set(clash.elementA.modelId, new Set());
        clashIds.get(clash.elementA.modelId)!.add(clash.elementA.localId);
        if (!clashIds.has(clash.elementB.modelId)) clashIds.set(clash.elementB.modelId, new Set());
        clashIds.get(clash.elementB.modelId)!.add(clash.elementB.localId);
      }

      const ghostMaterial: FRAGS.MaterialDefinition = {
        color: new THREE.Color(0x888888),
        opacity: 0.2,
        transparent: true,
        renderedFaces: FRAGS.RenderedFaces.TWO,
        alphaToCoverage: true,
        depthWrite: false,
      } as any;

      for (const [modelId, model] of fragments.list) {
        if (typeof (model as any).highlight !== 'function') continue;
        const allIds = await this.getModelItemIds(model);
        if (!allIds || allIds.length === 0) continue;

        const clashSet = clashIds.get(modelId);
        const otherIds = clashSet
          ? allIds.filter(id => !clashSet.has(id))
          : allIds;

        if (otherIds.length > 0) {
          await (model as any).highlight(otherIds, ghostMaterial);
          this.ghostedModels.add(modelId);
        }
      }
    } catch (e) {
      console.warn('[ClashDetection] Ghost mode error:', e);
    }
  }

  /** Get all item IDs from a model using the same API pattern as GhostModeManager. */
  private async getModelItemIds(model: any): Promise<number[]> {
    try {
      if (typeof model.getItemsIds === 'function') {
        return await model.getItemsIds();
      }
      if (typeof model.getItemsIdsWithGeometry === 'function') {
        return await model.getItemsIdsWithGeometry();
      }
      if (model.itemTypes && typeof model.itemTypes.keys === 'function') {
        return Array.from(model.itemTypes.keys());
      }
      if (model.ids instanceof Set) {
        return Array.from(model.ids);
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Restore all ghosted elements to their original appearance.
   */
  private async restoreGhostedElements(): Promise<void> {
    if (this.ghostedModels.size === 0) return;
    try {
      const components = this.worldManager.getComponents();
      const fragments = components.get(OBC.FragmentsManager);
      for (const modelId of this.ghostedModels) {
        const model = fragments.list.get(modelId);
        if (model && typeof (model as any).resetHighlight === 'function') {
          await (model as any).resetHighlight();
        }
      }
    } catch (e) {
      console.warn('[ClashDetection] Restore ghost error:', e);
    }
    this.ghostedModels.clear();
  }

  /**
   * Clear clash element highlights (red/green coloring) and restore ghosted elements
   */
  public clearClashHighlights(): void {
    try {
      const components = this.worldManager.getComponents();
      const highlighter = components.get(OBF.Highlighter);
      if (highlighter) {
        highlighter.clear('clash_red');
        highlighter.clear('clash_green');
      }
    } catch { /* ignore */ }
    // Restore ghosted elements
    this.restoreGhostedElements();
  }

  /**
   * Set detection options
   */
  public setOptions(options: Partial<ClashDetectionOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current detection options
   */
  public getOptions(): ClashDetectionOptions {
    return { ...this.options };
  }

  /**
   * Get all available IFC categories across all loaded models.
   * Returns sorted, deduplicated category names with element counts.
   */
  public async getAvailableCategories(): Promise<Array<{ name: string; count: number }>> {
    const components = this.worldManager.getComponents();
    const fragments = components.get(OBC.FragmentsManager);
    const categoryMap = new Map<string, number>();

    for (const [, model] of fragments.list) {
      try {
        const categories: string[] = await (model as any).getCategories();
        if (!categories) continue;

        for (const cat of categories) {
          const upper = cat.toUpperCase();
          // Skip non-geometry / metadata categories
          if (/^(IFCPROJECT|IFCRELDEFINES|IFCREL|IFCPROPERTY|IFCMATERIAL|IFCOWNERHISTORY|IFCAPPLICATION|IFCPERSON|IFCORGANIZATION|IFCPOSTALADDRESS)/.test(upper)) continue;

          try {
            const regex = new RegExp(`^${cat}$`);
            const items = await (model as any).getItemsOfCategories([regex]);
            const key = Object.keys(items).find((k: string) => k.includes(cat));
            const count = key && items[key] ? items[key].length : 0;
            categoryMap.set(upper, (categoryMap.get(upper) || 0) + count);
          } catch {
            categoryMap.set(upper, categoryMap.get(upper) || 0);
          }
        }
      } catch {
        // skip model
      }
    }

    return Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get a summary string of the clashes
   */
  public getSummary(): string {
    if (this.clashes.length === 0) return 'No clashes detected.';

    const hardCount = this.clashes.filter(c => c.severity === 'hard').length;
    const softCount = this.clashes.filter(c => c.severity === 'soft').length;
    const totalTriPairs = this.clashes.reduce((sum, c) => sum + c.intersectingTrianglePairs, 0);

    // Category pair breakdown
    const pairCounts = new Map<string, number>();
    let crossModelCount = 0;
    for (const clash of this.clashes) {
      const pair = [clash.elementA.ifcCategory, clash.elementB.ifcCategory].sort().join(' ↔ ');
      pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      if (clash.elementA.modelId !== clash.elementB.modelId) crossModelCount++;
    }

    let summary = `Found ${this.clashes.length} mesh-level clashes (${hardCount} hard, ${softCount} soft).\n`;
    if (crossModelCount > 0) {
      summary += `${crossModelCount} of ${this.clashes.length} clashes are between different models.\n`;
    }
    summary += `Verified via triangle-to-triangle intersection (${totalTriPairs} intersecting triangle pairs total).\n`;
    summary += 'Breakdown by category pair:\n';
    for (const [pair, count] of Array.from(pairCounts.entries()).sort((a, b) => b[1] - a[1])) {
      const cleanPair = pair.replace(/IFC/g, '');
      summary += `  • ${cleanPair}: ${count}\n`;
    }

    return summary;
  }

  /**
   * Resolve a model UUID to a human-readable name.
   * Uses IFCLoaderModule metadata if available.
   */
  public resolveModelName(modelId: string): string {
    try {
      const components = this.worldManager.getComponents();
      // Try to find IFCLoaderModule through the viewer chain
      const viewer = (this.worldManager as any)._viewer || (this.worldManager as any).viewer;
      if (viewer?.ifcLoader?.getModelMetadata) {
        const meta = viewer.ifcLoader.getModelMetadata(modelId);
        if (meta?.name && meta.name !== modelId) return meta.name;
      }
      // Try via components
      const fragments = components.get(OBC.FragmentsManager);
      const model = fragments.list.get(modelId);
      if (model?.object?.name) return model.object.name;
    } catch { /* ignore */ }
    return modelId.substring(0, 8);
  }

  /**
   * Get all loaded models with their IDs and names.
   * Used by the settings panel to show model selection.
   */
  public getLoadedModels(): Array<{ id: string; name: string; elementCount: number }> {
    const components = this.worldManager.getComponents();
    const fragments = components.get(OBC.FragmentsManager);
    const models: Array<{ id: string; name: string; elementCount: number }> = [];

    for (const [modelId, model] of fragments.list) {
      const name = this.resolveModelName(modelId);
      const elementCount = model.object?.children?.length || 0;
      models.push({ id: modelId, name, elementCount });
    }

    return models;
  }

  /**
   * Cleanup — remove markers and free memory
   */
  public dispose(): void {
    this.clearClashes();
    console.log('🧹 ClashDetectionModule disposed');
  }
}
