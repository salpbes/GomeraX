/**
 * WEBGPU LOD MANAGER (The "Detail Optimizer")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * "LOD" stands for Level of Detail. This module is a performance trick: 
 * it shows high-quality details for objects close to the camera, but 
 * switches to simpler, "cheaper" versions for objects far away where you 
 * can't see the difference anyway.
 * 
 * HOW IT CONNECTS:
 * - WebGPURendererModule: Manages which version of each object is currently 
 *   being drawn to keep the frame rate high.
 * --------------------------------------------------------------------------------
 */


import * as THREE from 'three';

export interface LODSettings {
  enabled: boolean;
  // Distance threshold for LOD switching (in scene units)
  detailDistance: number;    // 0 to detailDistance = full detail, beyond = simplified
  
  // Simplification settings
  simplificationRatio: number;  // Target reduction (0.25 = 25% of original triangles)
  
  // Visual settings
  showImpostors: boolean;    // Show bounding boxes for very distant objects
  impostorDistance: number;  // Distance beyond which to show impostor
  impostorColor: number;     // Color for impostor boxes
  
  // Performance
  updateFrequency: number;   // How often to check LOD (frames)
  minTriangles: number;      // Minimum triangles before LOD is applied
}

export interface LODStats {
  totalObjects: number;
  fullDetail: number;
  simplified: number;
  impostor: number;
  trianglesSaved: number;
  originalTriangles: number;
  currentTriangles: number;
}

const DEFAULT_SETTINGS: LODSettings = {
  enabled: true,
  detailDistance: 30,
  simplificationRatio: 0.25,
  showImpostors: true,
  impostorDistance: 100,
  impostorColor: 0x4488ff,
  updateFrequency: 5,
  minTriangles: 500,
};

interface LODObject {
  original: THREE.Mesh;
  lod: THREE.LOD;
  worldPosition: THREE.Vector3;  // Cached world position
  levels: {
    full: THREE.Mesh;
    simplified: THREE.Mesh | null;
    impostor: THREE.Mesh | null;
  };
  originalTriangles: number;
}

/**
 * WebGPU LOD Manager
 * Provides automatic level-of-detail for performance optimization
 */
export class WebGPULODManager {
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private settings: LODSettings = { ...DEFAULT_SETTINGS };
  private lodObjects: Map<string, LODObject> = new Map();
  private initialized: boolean = false;
  private frameCount: number = 0;
  private stats: LODStats = {
    totalObjects: 0,
    fullDetail: 0,
    simplified: 0,
    impostor: 0,
    trianglesSaved: 0,
    originalTriangles: 0,
    currentTriangles: 0,
  };
  
  // Material for impostors (bounding boxes)
  private impostorMaterial: THREE.MeshBasicMaterial | null = null;
  
  // Reusable vector for calculations
  private tempVector: THREE.Vector3 = new THREE.Vector3();
  
  // Track previous distance for zoom direction
  private lastAvgDistance: number = 0;
  
  // Debug materials to visualize LOD levels (different colors for each level)
  private debugFullMaterial: THREE.MeshBasicMaterial | null = null;
  private debugSimplifiedMaterial: THREE.MeshBasicMaterial | null = null;
  private debugMode: boolean = false; // Set to true to see colored LOD levels (GREEN=full, RED=simplified, BLUE=impostor)

  constructor() {
    // No initialization needed
  }

  /**
   * Initialize the LOD system
   */
  public initialize(scene: THREE.Scene, camera: THREE.Camera): boolean {
    this.scene = scene;
    this.camera = camera;
    
    // Create impostor material (blue wireframe for far objects)
    this.impostorMaterial = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.5,
      wireframe: true,
    });
    
    // Debug materials to visualize LOD switching
    this.debugFullMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00, // GREEN = full detail
      wireframe: false,
      transparent: true,
      opacity: 0.8,
    });
    
    this.debugSimplifiedMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000, // RED = simplified
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    });
    
    this.initialized = true;
    console.log('📐 LOD Manager initialized (DEBUG MODE: Green=Full, Red=Simplified, Blue=Impostor)');
    
    return true;
  }

  /**
   * Process scene and create LOD versions for all eligible meshes
   */
  public processScene(): void {
    if (!this.initialized || !this.scene) {
      console.warn('📐 LOD Manager not initialized');
      return;
    }
    
    console.log('📐 Processing scene for LOD...');
    
    // Collect meshes to process
    const meshesToProcess: THREE.Mesh[] = [];
    
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        const triangles = this.getTriangleCount(obj.geometry);
        if (triangles >= this.settings.minTriangles) {
          meshesToProcess.push(obj);
        }
      }
    });
    
    console.log(`📐 Found ${meshesToProcess.length} meshes eligible for LOD (${this.settings.minTriangles}+ triangles)`);
    
    // Process each mesh
    for (const mesh of meshesToProcess) {
      this.createLODForMesh(mesh);
    }
    
    console.log(`📐 Created LOD for ${this.lodObjects.size} objects`);
    this.updateStats();
  }

  /**
   * Create LOD levels for a single mesh
   */
  private createLODForMesh(mesh: THREE.Mesh): void {
    if (!this.scene) return;
    
    const id = mesh.uuid;
    
    // Skip if already processed
    if (this.lodObjects.has(id)) return;
    
    const originalTriangles = this.getTriangleCount(mesh.geometry);
    
    // For IFC fragments, geometry vertices are in world space, so mesh position is often (0,0,0)
    // We need to get the GEOMETRY's center, not the mesh's position
    mesh.geometry.computeBoundingBox();
    const bbox = mesh.geometry.boundingBox;
    if (!bbox) return;
    
    // Calculate geometry center in local space
    const geometryCenter = new THREE.Vector3();
    bbox.getCenter(geometryCenter);
    
    // Transform to world space (handles any mesh transform)
    mesh.updateWorldMatrix(true, false);
    const worldPosition = geometryCenter.clone().applyMatrix4(mesh.matrixWorld);
    
    // Create LOD object at the geometry's world center
    const lod = new THREE.LOD();
    lod.position.copy(worldPosition);
    lod.name = `LOD_${mesh.name || mesh.uuid}`;
    
    console.log(`📐 Creating LOD for "${mesh.name}" at world pos (${worldPosition.x.toFixed(1)}, ${worldPosition.y.toFixed(1)}, ${worldPosition.z.toFixed(1)})`);
    
    // Full Detail: Clone geometry BUT translate it so it's centered at origin (LOD handles world position)
    const fullGeom = mesh.geometry.clone();
    fullGeom.translate(-geometryCenter.x, -geometryCenter.y, -geometryCenter.z);
    // Use debug material (GREEN) or original material
    const fullMaterial = this.debugMode ? this.debugFullMaterial! : mesh.material;
    const fullMesh = new THREE.Mesh(fullGeom, fullMaterial);
    fullMesh.castShadow = mesh.castShadow;
    fullMesh.receiveShadow = mesh.receiveShadow;
    
    // Simplified: Reduced geometry (also centered) - use debug material (RED)
    const simplifiedMesh = this.createSimplifiedMeshCentered(mesh, this.settings.simplificationRatio, geometryCenter);
    
    // Impostor: Bounding box (also centered)
    const impostorMesh = this.settings.showImpostors ? this.createImpostorMeshCentered(mesh, geometryCenter) : null;
    
    // Add levels to LOD (distance 0 = full, detailDistance = simplified, impostorDistance = impostor)
    lod.addLevel(fullMesh, 0);
    if (simplifiedMesh) {
      lod.addLevel(simplifiedMesh, this.settings.detailDistance);
    }
    if (impostorMesh) {
      lod.addLevel(impostorMesh, this.settings.impostorDistance);
    }
    
    // Enable auto-update so LOD switches levels during rendering
    lod.autoUpdate = true;
    
    // Store LOD object info
    this.lodObjects.set(id, {
      original: mesh,
      lod,
      worldPosition,
      levels: {
        full: fullMesh,
        simplified: simplifiedMesh,
        impostor: impostorMesh,
      },
      originalTriangles,
    });
    
    // Add LOD to scene root (it has world position baked in)
    this.scene.add(lod);
    
    // Hide original mesh
    mesh.visible = false;
  }

  /**
   * Create a simplified version of a mesh
   */
  private createSimplifiedMesh(mesh: THREE.Mesh, targetReduction: number): THREE.Mesh | null {
    try {
      const geometry = mesh.geometry;
      if (!geometry) return null;
      
      // Simple decimation: reduce triangles by skipping
      const simplified = this.simplifyGeometry(geometry, targetReduction);
      if (!simplified) return null;
      
      const simplifiedMesh = new THREE.Mesh(simplified, mesh.material);
      simplifiedMesh.castShadow = mesh.castShadow;
      simplifiedMesh.receiveShadow = mesh.receiveShadow;
      
      return simplifiedMesh;
    } catch (e) {
      console.warn('📐 Failed to simplify mesh:', e);
      return null;
    }
  }

  /**
   * Simple geometry simplification
   * Uses triangle decimation by taking every Nth triangle
   */
  private simplifyGeometry(geometry: THREE.BufferGeometry, targetRatio: number): THREE.BufferGeometry | null {
    try {
      const indexAttr = geometry.getIndex();
      
      // For indexed geometry
      if (indexAttr) {
        const indices = Array.from(indexAttr.array);
        const originalTriangleCount = indices.length / 3;
        const targetTriangles = Math.max(4, Math.floor(originalTriangleCount * targetRatio));
        
        // Calculate step to achieve target triangle count
        const step = Math.max(1, Math.floor(originalTriangleCount / targetTriangles));
        const newIndices: number[] = [];
        
        for (let i = 0; i < indices.length; i += 3 * step) {
          if (i + 2 < indices.length) {
            newIndices.push(indices[i], indices[i + 1], indices[i + 2]);
          }
        }
        
        if (newIndices.length < 9) return null; // Need at least 3 triangles
        
        // Create new geometry with reduced indices
        const simplified = geometry.clone();
        simplified.setIndex(newIndices);
        
        return simplified;
      } else {
        // Non-indexed geometry: reduce vertices directly
        const positionAttr = geometry.getAttribute('position');
        if (!positionAttr) return null;
        
        const positions = Array.from(positionAttr.array);
        const originalTriangleCount = positions.length / 9; // 9 values per triangle
        const targetTriangles = Math.max(4, Math.floor(originalTriangleCount * targetRatio));
        const step = Math.max(1, Math.floor(originalTriangleCount / targetTriangles));
        
        const newPositions: number[] = [];
        
        for (let i = 0; i < positions.length; i += step * 9) {
          if (i + 8 < positions.length) {
            for (let j = 0; j < 9; j++) {
              newPositions.push(positions[i + j]);
            }
          }
        }
        
        if (newPositions.length < 27) return null; // Need at least 3 triangles
        
        const simplified = new THREE.BufferGeometry();
        simplified.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
        simplified.computeVertexNormals();
        
        return simplified;
      }
    } catch (e) {
      console.warn('📐 Geometry simplification failed:', e);
      return null;
    }
  }

  /**
   * Create an impostor (bounding box) mesh
   */
  private createImpostorMesh(mesh: THREE.Mesh): THREE.Mesh | null {
    try {
      const geometry = mesh.geometry;
      if (!geometry) return null;
      
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      if (!bbox) return null;
      
      const size = new THREE.Vector3();
      bbox.getSize(size);
      
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      
      const boxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      const impostor = new THREE.Mesh(boxGeometry, this.impostorMaterial!);
      impostor.position.copy(center);
      
      return impostor;
    } catch (e) {
      return null;
    }
  }

  /**
   * Create a simplified mesh centered at origin (for use with LOD positioned at geometry center)
   */
  private createSimplifiedMeshCentered(mesh: THREE.Mesh, targetReduction: number, geometryCenter: THREE.Vector3): THREE.Mesh | null {
    try {
      const geometry = mesh.geometry;
      if (!geometry) return null;
      
      // Simple decimation: reduce triangles by skipping
      const simplified = this.simplifyGeometry(geometry, targetReduction);
      if (!simplified) return null;
      
      // Translate geometry to be centered at origin
      simplified.translate(-geometryCenter.x, -geometryCenter.y, -geometryCenter.z);
      
      // Use debug material (RED wireframe) or original material
      const material = this.debugMode ? this.debugSimplifiedMaterial! : mesh.material;
      const simplifiedMesh = new THREE.Mesh(simplified, material);
      simplifiedMesh.castShadow = mesh.castShadow;
      simplifiedMesh.receiveShadow = mesh.receiveShadow;
      
      return simplifiedMesh;
    } catch (e) {
      console.warn('📐 Failed to simplify mesh:', e);
      return null;
    }
  }

  /**
   * Create an impostor mesh centered at origin (for use with LOD positioned at geometry center)
   */
  private createImpostorMeshCentered(mesh: THREE.Mesh, geometryCenter: THREE.Vector3): THREE.Mesh | null {
    try {
      const geometry = mesh.geometry;
      if (!geometry) return null;
      
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      if (!bbox) return null;
      
      const size = new THREE.Vector3();
      bbox.getSize(size);
      
      // Create box centered at origin (LOD handles world positioning)
      const boxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      const impostor = new THREE.Mesh(boxGeometry, this.impostorMaterial!);
      // Box is already at origin, no need to offset
      
      return impostor;
    } catch (e) {
      return null;
    }
  }

  /**
   * Update LOD levels based on camera distance
   * Should be called each frame (or every N frames)
   * @param camera - Current camera (passed fresh each frame to avoid stale references)
   */
  public update(camera?: THREE.Camera): void {
    // Use passed camera or fall back to stored reference
    const activeCamera = camera || this.camera;
    
    if (!this.settings.enabled || !this.initialized || !activeCamera) return;
    
    // Update stored camera reference if a new one is passed
    if (camera) {
      this.camera = camera;
    }
    
    this.frameCount++;
    
    // Ensure camera matrix is up to date
    activeCamera.updateMatrixWorld();
    
    // Track distance for debugging
    let minDist = Infinity;
    let maxDist = 0;
    
    // Update all LOD objects every frame for responsive switching
    for (const lodObj of this.lodObjects.values()) {
      // Ensure LOD world matrix is current before distance calculation
      lodObj.lod.updateMatrixWorld();
      
      // Calculate distance manually for debugging
      lodObj.lod.getWorldPosition(this.tempVector);
      const distance = activeCamera.position.distanceTo(this.tempVector);
      minDist = Math.min(minDist, distance);
      maxDist = Math.max(maxDist, distance);
      
      // Call THREE.LOD update
      lodObj.lod.update(activeCamera);
      
      // Debug every 30 frames: show current level and visibility
      if (this.frameCount % 30 === 0) {
        const currentLevel = lodObj.lod.getCurrentLevel();
        const children = lodObj.lod.children;
        const visibleIdx = children.findIndex(c => c.visible);
        console.log(`📐 LOD[${lodObj.original.name?.substring(0,15) || 'unnamed'}] dist=${distance.toFixed(1)} level=${currentLevel} visibleChild=${visibleIdx}/${children.length} levels=[${lodObj.lod.levels.map(l => l.distance).join(',')}]`);
      }
    }
    
    // Log camera movement every 30 frames
    if (this.frameCount % 30 === 0 && this.lodObjects.size > 0) {
      const avgDist = (minDist + maxDist) / 2;
      const zoomDir = avgDist < this.lastAvgDistance ? '🔍 ZOOM IN' : avgDist > this.lastAvgDistance ? '🔭 ZOOM OUT' : '⏸️ STATIC';
      const distChange = avgDist - this.lastAvgDistance;
      console.log(`📐 ${zoomDir} | Camera pos=(${activeCamera.position.x.toFixed(1)}, ${activeCamera.position.y.toFixed(1)}, ${activeCamera.position.z.toFixed(1)}) | dist=${avgDist.toFixed(1)} (${distChange >= 0 ? '+' : ''}${distChange.toFixed(1)}) | threshold=${this.settings.detailDistance}`);
      this.lastAvgDistance = avgDist;
    }
    
    // Update stats every 30 frames
    if (this.frameCount % 30 === 0) {
      this.updateStats();
    }
  }

  /**
   * Update LOD statistics
   */
  private updateStats(): void {
    this.stats.totalObjects = this.lodObjects.size;
    this.stats.fullDetail = 0;
    this.stats.simplified = 0;
    this.stats.impostor = 0;
    this.stats.originalTriangles = 0;
    this.stats.currentTriangles = 0;
    
    if (!this.camera) return;
    
    for (const lodObj of this.lodObjects.values()) {
      this.stats.originalTriangles += lodObj.originalTriangles;
      
      // Get distance to camera
      lodObj.lod.getWorldPosition(this.tempVector);
      const distance = this.camera.position.distanceTo(this.tempVector);
      
      // Determine which level is active based on distance
      if (distance < this.settings.detailDistance) {
        this.stats.fullDetail++;
        this.stats.currentTriangles += lodObj.originalTriangles;
      } else if (distance < this.settings.impostorDistance || !lodObj.levels.impostor) {
        this.stats.simplified++;
        this.stats.currentTriangles += Math.floor(lodObj.originalTriangles * this.settings.simplificationRatio);
      } else {
        this.stats.impostor++;
        this.stats.currentTriangles += 12; // Box has 12 triangles
      }
    }
    
    this.stats.trianglesSaved = this.stats.originalTriangles - this.stats.currentTriangles;
  }

  /**
   * Get triangle count for a geometry
   */
  private getTriangleCount(geometry: THREE.BufferGeometry): number {
    const index = geometry.getIndex();
    if (index) {
      return index.count / 3;
    }
    const position = geometry.getAttribute('position');
    if (position) {
      return position.count / 3;
    }
    return 0;
  }

  /**
   * Enable or disable LOD
   */
  public setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
    
    // Show/hide LOD objects based on enabled state
    for (const lodObj of this.lodObjects.values()) {
      lodObj.lod.visible = enabled;
      lodObj.original.visible = !enabled;
    }
    
    console.log(`📐 LOD ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if LOD is enabled
   */
  public isEnabled(): boolean {
    return this.settings.enabled;
  }

  /**
   * Set detail distance threshold (full detail up to this distance)
   */
  public setDetailDistance(distance: number): void {
    this.settings.detailDistance = distance;
    
    // Update all LOD objects with new distance
    for (const lodObj of this.lodObjects.values()) {
      if (lodObj.lod.levels.length > 1 && lodObj.levels.simplified) {
        lodObj.lod.levels[1].distance = distance;
      }
    }
    
    console.log(`📐 LOD detail distance: ${distance}`);
  }

  /**
   * Set impostor distance threshold
   */
  public setImpostorDistance(distance: number): void {
    this.settings.impostorDistance = distance;
    
    // Update all LOD objects with new distance
    for (const lodObj of this.lodObjects.values()) {
      if (lodObj.lod.levels.length > 2 && lodObj.levels.impostor) {
        lodObj.lod.levels[2].distance = distance;
      }
    }
    
    console.log(`📐 LOD impostor distance: ${distance}`);
  }

  /**
   * Legacy method - maps to setDetailDistance
   */
  public setHighDistance(distance: number): void {
    this.setDetailDistance(distance);
  }

  /**
   * Legacy method - maps to setImpostorDistance
   */
  public setMediumDistance(distance: number): void {
    this.setImpostorDistance(distance);
  }

  /**
   * Legacy method - no longer used (2-tier system)
   */
  public setLowDistance(distance: number): void {
    // No-op: 2-tier system doesn't have a low distance
    console.log(`📐 Note: LOD now uses 2-tier system (Full Detail + Simplified)`);
  }

  /**
   * Toggle impostor visibility
   */
  public setShowImpostors(show: boolean): void {
    this.settings.showImpostors = show;
    console.log(`📐 Impostors ${show ? 'shown' : 'hidden'}`);
  }

  /**
   * Get current statistics
   */
  public getStats(): LODStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get settings
   */
  public getSettings(): LODSettings {
    return { ...this.settings };
  }

  /**
   * Check if LOD is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Force refresh of all LOD objects
   */
  public refresh(): void {
    // Clear existing LOD objects
    this.dispose();
    
    // Reinitialize
    if (this.scene && this.camera) {
      this.initialized = true;
      this.impostorMaterial = new THREE.MeshBasicMaterial({
        color: this.settings.impostorColor,
        transparent: true,
        opacity: 0.3,
        wireframe: true,
      });
      this.processScene();
    }
  }

  /**
   * Dispose LOD resources
   */
  public dispose(): void {
    // Restore original meshes and remove LOD objects
    for (const lodObj of this.lodObjects.values()) {
      // Restore original mesh visibility
      lodObj.original.visible = true;
      
      // Remove LOD from scene
      if (lodObj.lod.parent) {
        lodObj.lod.removeFromParent();
      }
      
      // Dispose geometries
      if (lodObj.levels.full) lodObj.levels.full.geometry?.dispose();
      if (lodObj.levels.simplified) lodObj.levels.simplified.geometry?.dispose();
      if (lodObj.levels.impostor) lodObj.levels.impostor.geometry?.dispose();
    }
    
    this.lodObjects.clear();
    
    if (this.impostorMaterial) {
      this.impostorMaterial.dispose();
      this.impostorMaterial = null;
    }
    
    this.initialized = false;
    console.log('📐 LOD Manager disposed');
  }
}
