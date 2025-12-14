/**
 * =============================================================================
 * WebGPU Renderer Module (Experimental)
 * =============================================================================
 * 
 * WHAT THIS MODULE DOES:
 * ----------------------
 * This module provides an optional WebGPU rendering mode for the IFC Viewer.
 * When enabled, it renders the 3D model using WebGPU instead of WebGL.
 * 
 * WHY WEBGPU?
 * -----------
 * WebGPU is the next-generation graphics API that offers:
 * - Better performance (especially for complex models)
 * - More efficient GPU utilization
 * - Modern shader capabilities
 * 
 * However, WebGPU has trade-offs:
 * - Requires modern browser support (Chrome 113+, Edge 113+, Firefox Nightly)
 * - PostProduction effects (ambient occlusion, outlines) are NOT available
 * - This is experimental and may have visual differences
 * 
 * 
 * HOW IT WORKS (LAYMAN'S EXPLANATION):
 * ------------------------------------
 * Think of it like this: the IFC model is stored in a special format by OBC
 * (ThatOpen Components) that's optimized for WebGL rendering. WebGPU speaks
 * a slightly different "language", so we need to translate the model.
 * 
 * The translation process:
 * 
 * 1. GEOMETRY: We can't just copy the existing 3D meshes because OBC uses a
 *    special "Level of Detail" (LOD) system that WebGPU doesn't understand.
 *    Instead, we ask OBC for the raw geometry data (vertices, triangles) and
 *    rebuild each mesh from scratch in a WebGPU-compatible format.
 * 
 * 2. MATERIALS/COLORS: This was tricky! OBC has multiple ways to get colors:
 *    - `getItemsMaterialDefinition()` - BROKEN: only returns ~4 gray colors
 *    - `getMaterials()` - CORRECT: returns all 24+ real material colors
 *    
 *    To connect a mesh to its color, we use this chain:
 *    meshData.sampleId → model.getSamples() → sample.material → model.getMaterials()
 *    
 *    In plain English: each piece of geometry has a "sample ID", which points
 *    to a "sample", which tells us which material (color) to use.
 * 
 * 3. NORMALS: WebGPU is stricter about data formats. OBC stores normals as
 *    Int16 (compact, 6 bytes per vertex) but WebGPU requires Float32 with
 *    4-byte alignment (12 bytes per vertex). We convert them on the fly.
 * 
 * 4. LIGHTING: Since we render a separate "proxy scene", we need to copy
 *    the lights from the original scene, or add fallback lights.
 * 
 * 5. CONTROLS: We keep the original WebGL canvas active (but invisible) so
 *    that OrbitControls still work. The WebGPU canvas is visual-only.
 * 
 * 
 * ARCHITECTURE DECISIONS:
 * -----------------------
 * - "Proxy Scene": We build a completely separate THREE.Scene for WebGPU
 *   rather than trying to modify OBC's fragment meshes in-place. This avoids
 *   breaking OBC's internal state and makes cleanup easier.
 * 
 * - "Category Color Fallback": If the model has very few unique material colors
 *   (e.g., everything is gray), we fall back to category-based coloring that
 *   matches the ColorSplash feature (walls=yellow, beams=red, etc.).
 * 
 * - "Canvas Layering": Original canvas (opacity:0, pointer-events:auto) sits
 *   on top of WebGPU canvas (pointer-events:none) so controls work normally.
 * 
 * 
 * KNOWN LIMITATIONS:
 * ------------------
 * - No postprocessing effects (AO, outlines, custom passes)
 * - No section plane hatching (relies on postprocessing)
 * - Highlighting/selection may not work the same way
 * - Some custom OBC features may not render correctly
 * 
 * 
 * @see https://threejs.org/docs/#api/en/renderers/WebGPURenderer
 * =============================================================================
 */

import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type RendererMode = 'webgl' | 'webgpu';

export interface WebGPUStatus {
  available: boolean;
  reason?: string;
  browserInfo?: string;
}

/**
 * WebGPU Renderer Module
 * Provides experimental WebGPU rendering with fallback to WebGL
 */
export class WebGPURendererModule {
  private container: HTMLElement | null = null;
  private webgpuRenderer: any = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private animationFrameId: number | null = null;
  private isActive: boolean = false;
  private world: OBC.World | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private proxyScene: THREE.Scene | null = null;
  private components: OBC.Components | null = null;
  private proxySceneKind: 'in-place' | 'fragments' = 'in-place';

  // WebGPU mode swaps materials in-place to avoid cloning custom fragment geometries.
  // These maps allow restoring the original scene when WebGPU is disabled.
  private materialBackup = new Map<string, THREE.Material | THREE.Material[]>();
  private visibilityBackup = new Map<string, boolean>();
  private geometryBackup = new Map<string, THREE.BufferGeometry>();
  private createdGeometries: THREE.BufferGeometry[] = [];
  private onBeforeRenderBackup = new Map<string, THREE.Object3D['onBeforeRender']>();
  private onAfterRenderBackup = new Map<string, THREE.Object3D['onAfterRender']>();

  // Shadow settings
  private shadowsEnabled: boolean = true;
  private shadowLight: THREE.DirectionalLight | null = null;
  private shadowAngle: number = 45; // degrees (0-360)
  private shadowElevation: number = 45; // degrees (10-90)
  private sceneCenter: THREE.Vector3 = new THREE.Vector3();
  private sceneMaxDim: number = 100;

  // Ground plane settings
  private groundPlaneEnabled: boolean = true;
  private groundPlane: THREE.Mesh | null = null;

  // Edge/outline rendering settings
  private edgesEnabled: boolean = false;
  private edgeLines: THREE.LineSegments[] = [];
  private edgeThreshold: number = 15; // angle threshold in degrees

  // Performance stats settings
  private statsEnabled: boolean = false;
  private statsOverlay: HTMLDivElement | null = null;
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private fps: number = 0;
  private frameTime: number = 0;
  private lastFrameTime: number = 0;
  private triangleCount: number = 0;
  private vertexCount: number = 0;
  private drawCalls: number = 0;
  private meshCount: number = 0;
  private lineCount: number = 0;
  private lightCount: number = 0;
  private geometryCount: number = 0;
  private materialCount: number = 0;
  private textureCount: number = 0;
  private frameTimeHistory: number[] = [];
  private currentToneMapping: number = 4; // ACESFilmic default
  private gpuInfo: string = 'Unknown';
  private minFps: number = 999;
  private maxFps: number = 0;
  private visibleMeshCount: number = 0;
  private fpsHistory: number[] = [];
  
  // Performance optimization settings
  private frustumCullingEnabled: boolean = true;
  private geometryMergingEnabled: boolean = true;
  private shadowMapNeedsUpdate: boolean = true;
  private mergedMeshes: THREE.Mesh[] = [];
  private frustum: THREE.Frustum = new THREE.Frustum();
  private projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private lastCameraPosition: THREE.Vector3 = new THREE.Vector3();
  private lastCameraQuaternion: THREE.Quaternion = new THREE.Quaternion();
  private cameraMovedThreshold: number = 0.001;
  
  // Category visibility (for hiding spaces, etc.)
  private hiddenCategories: Set<string> = new Set();
  private meshCategoryMap: Map<THREE.Mesh, string> = new Map();

  constructor() {}

  /**
   * Check if WebGPU is available in the current browser
   */
  public static async checkWebGPUSupport(): Promise<WebGPUStatus> {
    // Get browser info safely
    const getBrowserInfo = (): string => {
      try {
        return (navigator as Navigator).userAgent || 'Unknown';
      } catch {
        return 'Unknown';
      }
    };

    // Check if running in browser
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return {
        available: false,
        reason: 'Not running in a browser environment.',
        browserInfo: 'Unknown'
      };
    }

    // Check if navigator.gpu exists
    const nav = navigator as any;
    if (!nav.gpu) {
      return {
        available: false,
        reason: 'WebGPU is not supported in this browser. Try Chrome 113+, Edge 113+, or Firefox Nightly.',
        browserInfo: getBrowserInfo()
      };
    }

    try {
      // Try to request an adapter
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) {
        return {
          available: false,
          reason: 'No WebGPU adapter found. Your GPU may not support WebGPU.',
          browserInfo: getBrowserInfo()
        };
      }

      // Try to request a device
      const device = await adapter.requestDevice();
      if (!device) {
        return {
          available: false,
          reason: 'Could not acquire WebGPU device.',
          browserInfo: getBrowserInfo()
        };
      }

      // Get adapter info for logging (if available)
      let gpuInfo = 'WebGPU Ready';
      try {
        if (adapter.requestAdapterInfo) {
          const info = await adapter.requestAdapterInfo();
          gpuInfo = `${info.vendor || 'Unknown'} - ${info.architecture || 'Unknown'}`;
        }
      } catch {
        // Adapter info not available in all browsers
      }
      
      return {
        available: true,
        browserInfo: gpuInfo,
      };
    } catch (error) {
      return {
        available: false,
        reason: `WebGPU initialization failed: ${error}`,
        browserInfo: getBrowserInfo()
      };
    }
  }

  // Store original console methods for restoration
  private originalConsoleWarn: typeof console.warn | null = null;

  /**
   * Suppress known WebGPU material compatibility warnings
   */
  private suppressMaterialWarnings(): void {
    if (this.originalConsoleWarn) return; // Already suppressed
    
    this.originalConsoleWarn = console.warn;
    const suppressedPatterns = ['NodeMaterial:', 'is not compatible', 'Material "ShaderMaterial"'];
    
    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      if (suppressedPatterns.some(p => message.includes(p))) {
        return; // Suppress expected WebGPU warnings
      }
      this.originalConsoleWarn?.apply(console, args);
    };
  }

  /**
   * Restore console.warn to original
   */
  private restoreConsoleWarn(): void {
    if (this.originalConsoleWarn) {
      console.warn = this.originalConsoleWarn;
      this.originalConsoleWarn = null;
    }
  }

  /**
   * Create a proxy scene for WebGPU rendering
   * This ensures only compatible objects are rendered
   */
  private async createProxyScene(originalScene: THREE.Scene): Promise<void> {
    // Preferred path: rebuild IFC geometry from OBC typed arrays (WebGPU-safe)
    // instead of touching fragment meshes whose attributes may not expose TypedArray storage.
    const built = await this.tryBuildProxySceneFromFragments(originalScene);
    if (built) return;

    console.log('🔄 Preparing WebGPU scene (in-place material swap)...');

    // IMPORTANT: do not clone geometries (Fragments can use custom/interleaved layouts).
    // We keep the original scene/camera and only swap materials to WebGPU-safe ones.
    this.proxyScene = originalScene;
    this.proxySceneKind = 'in-place';

    // Clear any previous backups (in case enable() is called twice without disable())
    this.materialBackup.clear();
    this.visibilityBackup.clear();
    this.geometryBackup.clear();
    this.createdGeometries = [];
    this.onBeforeRenderBackup.clear();
    this.onAfterRenderBackup.clear();

    const isTypedArrayView = (value: any): boolean => {
      return !!value && ArrayBuffer.isView(value) && !(value instanceof DataView);
    };

    const toFloat32Array = (value: any): Float32Array | null => {
      if (value === undefined || value === null) return null;
      if (isTypedArrayView(value)) return new Float32Array(value as any);
      if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) {
        return new Float32Array(value as any);
      }
      if (Array.isArray(value)) return new Float32Array(value);
      return null;
    };

    const toUint32Array = (value: any): Uint32Array | null => {
      if (value === undefined || value === null) return null;
      if (isTypedArrayView(value)) return new Uint32Array(value as any);
      if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) {
        return new Uint32Array(value as any);
      }
      if (Array.isArray(value)) return new Uint32Array(value);
      return null;
    };

    const copyAttributeAsFloat32 = (attr: any): THREE.BufferAttribute | null => {
      if (!attr) return null;

      const itemSize: number = attr.itemSize;
      const count: number = attr.count;
      if (!itemSize || !count) return null;

      // InterleavedBufferAttribute (or interleaved-like): de-interleave from underlying data array.
      // This avoids calling BufferAttribute.getComponent(), which can throw if `.array` is missing.
      if ((attr.isInterleavedBufferAttribute || attr.data?.stride !== undefined) && attr.data) {
        const raw = attr.data.array;
        const src = toFloat32Array(raw);
        const stride: number = attr.data.stride;
        const offset: number = attr.offset;

        if (src === null) return null;
        if (!stride && stride !== 0) return null;
        if (offset === undefined || offset === null) return null;

        const out = new Float32Array(count * itemSize);
        for (let i = 0; i < count; i++) {
          const base = i * stride + offset;
          for (let k = 0; k < itemSize; k++) {
            out[i * itemSize + k] = (src as any)[base + k] ?? 0;
          }
        }
        return new THREE.BufferAttribute(out, itemSize, !!attr.normalized);
      }

      // Fast path: attribute has array-like storage
      {
        const direct = toFloat32Array(attr.array);
        if (direct) {
          return new THREE.BufferAttribute(direct, itemSize, !!attr.normalized);
        }
      }

      // If array is missing, don't attempt getComponent() (it can crash inside Three.js)
      if (attr.array === undefined || attr.array === null) {
        return null;
      }

      // Fallback: sample via getComponent (works for some custom attrs)
      if (typeof attr.getComponent === 'function') {
        try {
          const out = new Float32Array(count * itemSize);
          for (let i = 0; i < count; i++) {
            for (let k = 0; k < itemSize; k++) {
              out[i * itemSize + k] = attr.getComponent(i, k);
            }
          }
          return new THREE.BufferAttribute(out, itemSize, !!attr.normalized);
        } catch {
          return null;
        }
      }

      return null;
    };

    const sanitizeGeometryForWebGPU = (src: THREE.BufferGeometry): THREE.BufferGeometry | null => {
      const position = copyAttributeAsFloat32(src.getAttribute('position'));
      if (!position || position.count === 0) return null;

      const next = new THREE.BufferGeometry();
      next.setAttribute('position', position);

      const normal = copyAttributeAsFloat32(src.getAttribute('normal'));
      if (normal && normal.count === position.count) {
        next.setAttribute('normal', normal);
      }

      const uv = copyAttributeAsFloat32(src.getAttribute('uv'));
      if (uv && uv.count === position.count) {
        next.setAttribute('uv', uv);
      }

      // Copy index if valid and typed
      const idx: any = src.getIndex();
      if (idx && idx.count > 0) {
        const idxArray = toUint32Array(idx.array);
        if (idxArray) {
          next.setIndex(new THREE.BufferAttribute(idxArray, 1));
        } else if (typeof idx.getX === 'function') {
          try {
            const out = new Uint32Array(idx.count);
            for (let i = 0; i < idx.count; i++) out[i] = idx.getX(i);
            next.setIndex(new THREE.BufferAttribute(out, 1));
          } catch {
            // Skip index if it's not readable; WebGPU can still draw non-indexed.
          }
        }
      }

      next.computeBoundingBox();
      next.computeBoundingSphere();
      return next;
    };

    const createCompatibleMaterial = (original: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] => {
      const base = Array.isArray(original) ? original[0] : original;

      // Extract a best-effort color
      let color: any = 0x888888;
      if (base && (base as any).color) color = (base as any).color;
      else if (base && (base as any).uniforms?.diffuse?.value) color = (base as any).uniforms.diffuse.value;

      return new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: !!(base && (base as any).transparent),
        opacity: (base && typeof (base as any).opacity === 'number') ? (base as any).opacity : 1.0,
        wireframe: !!(base && (base as any).wireframe)
      });
    };

    let swapped = 0;
    let hiddenUnsupported = 0;

    // Ensure matrices are up-to-date
    originalScene.updateMatrixWorld(true);

    originalScene.traverse((obj) => {
      // Some OBC/scene objects attach renderer-specific callbacks (LOD, postprocessing hooks, etc.)
      // that assume WebGL internals and can crash WebGPURenderer. Disable them in WebGPU mode.
      if (typeof (obj as any).onBeforeRender === 'function') {
        if (!this.onBeforeRenderBackup.has(obj.uuid)) {
          this.onBeforeRenderBackup.set(obj.uuid, (obj as any).onBeforeRender);
        }
        (obj as any).onBeforeRender = () => {};
      }
      if (typeof (obj as any).onAfterRender === 'function') {
        if (!this.onAfterRenderBackup.has(obj.uuid)) {
          this.onAfterRenderBackup.set(obj.uuid, (obj as any).onAfterRender);
        }
        (obj as any).onAfterRender = () => {};
      }

      // Hide unsupported primitive types for now (Lines/Points can be handled later)
      if (obj instanceof THREE.Line || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
        if (!this.visibilityBackup.has(obj.uuid)) {
          this.visibilityBackup.set(obj.uuid, obj.visible);
        }
        obj.visible = false;
        hiddenUnsupported++;
        return;
      }

      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        const mesh = obj as THREE.Mesh;

        // Sanitize geometry attributes: WebGPU node builder requires typed arrays.
        // Some fragment geometries expose attributes without a proper `.array`.
        if (mesh.geometry && mesh.geometry instanceof THREE.BufferGeometry) {
          try {
            if (!this.geometryBackup.has(mesh.uuid)) {
              this.geometryBackup.set(mesh.uuid, mesh.geometry);
            }

            const sanitized = sanitizeGeometryForWebGPU(mesh.geometry);
            if (!sanitized) {
              if (!this.visibilityBackup.has(mesh.uuid)) {
                this.visibilityBackup.set(mesh.uuid, mesh.visible);
              }
              mesh.visible = false;
              hiddenUnsupported++;
              const srcPos = (mesh.geometry as any).getAttribute?.('position');
              console.warn(
                '⚠️ Hiding mesh due to incompatible geometry:',
                mesh.name || mesh.uuid,
                {
                  geometryType: (mesh.geometry as any)?.type,
                  positionAttrType: srcPos?.constructor?.name,
                  hasArray: srcPos ? srcPos.array !== undefined && srcPos.array !== null : false,
                  isInterleaved: !!srcPos?.isInterleavedBufferAttribute,
                  hasDataArray: !!srcPos?.data?.array,
                }
              );
              return;
            }

            mesh.geometry = sanitized;
            this.createdGeometries.push(sanitized);
          } catch (e) {
            if (!this.visibilityBackup.has(mesh.uuid)) {
              this.visibilityBackup.set(mesh.uuid, mesh.visible);
            }
            mesh.visible = false;
            hiddenUnsupported++;
            console.warn('⚠️ Geometry sanitization failed, hiding mesh:', mesh.name || mesh.uuid, e);
            return;
          }
        }

        if (!this.materialBackup.has(mesh.uuid)) {
          this.materialBackup.set(mesh.uuid, mesh.material);
        }
        try {
          mesh.material = createCompatibleMaterial(mesh.material as any) as any;
          swapped++;
        } catch (e) {
          // If material swap fails, hide the mesh to avoid crashing WebGPU
          if (!this.visibilityBackup.has(mesh.uuid)) {
            this.visibilityBackup.set(mesh.uuid, mesh.visible);
          }
          mesh.visible = false;
          hiddenUnsupported++;
          console.warn('⚠️ Failed to swap material for mesh, hiding it:', mesh.name || mesh.uuid, e);
        }

        // Avoid culling surprises in WebGPU mode
        mesh.frustumCulled = false;
      }
    });

    console.log(`✅ WebGPU scene prepared: swappedMaterials=${swapped}, hiddenUnsupported=${hiddenUnsupported}`);
  }

  /**
   * Setup a directional light optimized for shadow casting.
   * The shadow camera is configured to cover the model's bounding box.
   */
  private setupShadowLight(scene: THREE.Scene): void {
    // Create shadow-casting directional light
    const shadowLight = new THREE.DirectionalLight(0xffffff, 0.8);
    shadowLight.name = 'webgpu-shadow-light';
    
    // Position light at an angle for nice shadows
    shadowLight.position.set(50, 100, 50);
    shadowLight.target.position.set(0, 0, 0);
    
    if (this.shadowsEnabled) {
      shadowLight.castShadow = true;
      
      // Shadow map size - higher = sharper shadows but more expensive
      shadowLight.shadow.mapSize.width = 2048;
      shadowLight.shadow.mapSize.height = 2048;
      
      // Shadow camera frustum - will be adjusted to fit the scene
      const shadowCam = shadowLight.shadow.camera;
      shadowCam.left = -100;
      shadowCam.right = 100;
      shadowCam.top = 100;
      shadowCam.bottom = -100;
      shadowCam.near = 1;
      shadowCam.far = 500;
      
      // Reduce shadow artifacts
      shadowLight.shadow.bias = -0.0005;
      shadowLight.shadow.normalBias = 0.02;
    }
    
    scene.add(shadowLight);
    scene.add(shadowLight.target);
    this.shadowLight = shadowLight;
  }

  /**
   * Update shadow camera to fit the current scene bounds.
   * Also sets up the ground plane.
   * Call this after the proxy scene is fully built.
   */
  public updateShadowBounds(): void {
    if (!this.proxyScene) return;
    
    // Ensure all world matrices are up to date
    this.proxyScene.updateMatrixWorld(true);
    
    // Calculate scene bounding box (excluding ground plane)
    const box = new THREE.Box3();
    this.proxyScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry && obj.name !== 'webgpu-ground-plane') {
        obj.geometry.computeBoundingBox();
        if (obj.geometry.boundingBox) {
          const meshBox = obj.geometry.boundingBox.clone();
          meshBox.applyMatrix4(obj.matrixWorld);
          box.union(meshBox);
        }
      }
    });
    
    if (box.isEmpty()) return;
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    console.log('📦 Bounding box:', {
      min: box.min.toArray().map(v => v.toFixed(1)),
      max: box.max.toArray().map(v => v.toFixed(1)),
      center: center.toArray().map(v => v.toFixed(1)),
    });
    
    // Store scene bounds for shadow angle updates
    this.sceneCenter.copy(center);
    this.sceneMaxDim = maxDim;
    
    // Update shadow light if available
    if (this.shadowLight) {
      // Adjust shadow camera to fit scene
      const shadowCam = this.shadowLight.shadow.camera;
      const padding = maxDim * 0.5;
      shadowCam.left = -maxDim - padding;
      shadowCam.right = maxDim + padding;
      shadowCam.top = maxDim + padding;
      shadowCam.bottom = -maxDim - padding;
      shadowCam.near = 1;
      shadowCam.far = maxDim * 4;
      shadowCam.updateProjectionMatrix();
      
      // Position light based on current angle settings
      this.updateShadowLightPosition();
    }
    
    // Setup ground plane
    this.setupGroundPlane(this.proxyScene, box);
    
    console.log('🌤️ Shadow bounds updated:', {
      center: center.toArray().map(v => v.toFixed(1)),
      size: size.toArray().map(v => v.toFixed(1)),
      maxDim: maxDim.toFixed(1)
    });
  }

  /**
   * Setup a ground plane that receives shadows.
   * Positioned below the model based on its bounding box.
   */
  private setupGroundPlane(scene: THREE.Scene, boundingBox: THREE.Box3): void {
    if (!this.groundPlaneEnabled) return;
    
    // Remove existing ground plane if any
    if (this.groundPlane) {
      scene.remove(this.groundPlane);
      this.groundPlane.geometry.dispose();
      (this.groundPlane.material as THREE.Material).dispose();
      this.groundPlane = null;
    }
    
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z) * 2; // Make it larger than the model
    
    // Create ground plane geometry
    const geometry = new THREE.PlaneGeometry(maxDim, maxDim);
    
    // Use MeshStandardMaterial for WebGPU compatibility
    // ShadowMaterial is not compatible with WebGPU
    const material = new THREE.MeshStandardMaterial({
      color: 0x909090,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    
    this.groundPlane = new THREE.Mesh(geometry, material);
    this.groundPlane.name = 'webgpu-ground-plane';
    
    // Rotate to be horizontal (PlaneGeometry is vertical by default)
    this.groundPlane.rotation.x = -Math.PI / 2;
    
    // Position slightly below ground level to avoid z-fighting with floor elements
    this.groundPlane.position.set(center.x, -0.5, center.z);
    
    // Only receive shadows, don't cast
    this.groundPlane.receiveShadow = true;
    this.groundPlane.castShadow = false;
    
    scene.add(this.groundPlane);
    
    console.log('🏗️ Ground plane added:', {
      position: `(${center.x.toFixed(1)}, -0.5, ${center.z.toFixed(1)})`,
      size: maxDim.toFixed(1)
    });
  }

  /**
   * Enable or disable ground plane at runtime
   */
  public setGroundPlaneEnabled(enabled: boolean): void {
    this.groundPlaneEnabled = enabled;
    
    if (this.groundPlane) {
      this.groundPlane.visible = enabled;
    }
    
    console.log(`🏗️ Ground plane ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current ground plane state
   */
  public isGroundPlaneEnabled(): boolean {
    return this.groundPlaneEnabled;
  }

  /**
   * Enable or disable shadows at runtime
   */
  public setShadowsEnabled(enabled: boolean): void {
    this.shadowsEnabled = enabled;
    
    // Simply toggle the shadow light - no need to update every mesh
    // The renderer will handle the rest
    if (this.shadowLight) {
      this.shadowLight.castShadow = enabled;
      this.shadowLight.visible = enabled;
    }
    
    console.log(`🌤️ Shadows ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set shadow light angle (horizontal rotation around the model)
   * @param angle - Angle in degrees (0-360). 0=North, 90=East, 180=South, 270=West
   */
  public setShadowAngle(angle: number): void {
    this.shadowAngle = angle % 360;
    this.updateShadowLightPosition();
  }

  /**
   * Get current shadow angle
   */
  public getShadowAngle(): number {
    return this.shadowAngle;
  }

  /**
   * Set shadow light elevation (vertical angle)
   * @param elevation - Angle in degrees (10-90). Higher = more overhead sun
   */
  public setShadowElevation(elevation: number): void {
    this.shadowElevation = Math.max(10, Math.min(90, elevation));
    this.updateShadowLightPosition();
  }

  /**
   * Get current shadow elevation
   */
  public getShadowElevation(): number {
    return this.shadowElevation;
  }

  /**
   * Update shadow light position based on angle and elevation
   */
  private updateShadowLightPosition(): void {
    if (!this.shadowLight) return;
    
    const angleRad = (this.shadowAngle * Math.PI) / 180;
    const elevRad = (this.shadowElevation * Math.PI) / 180;
    const distance = this.sceneMaxDim * 1.5;
    
    // Calculate position using spherical coordinates
    const x = this.sceneCenter.x + distance * Math.cos(elevRad) * Math.sin(angleRad);
    const y = this.sceneCenter.y + distance * Math.sin(elevRad);
    const z = this.sceneCenter.z + distance * Math.cos(elevRad) * Math.cos(angleRad);
    
    this.shadowLight.position.set(x, y, z);
    this.shadowLight.target.position.copy(this.sceneCenter);
    this.shadowLight.target.updateMatrixWorld();
  }

  /**
   * Get current shadow state
   */
  public isShadowsEnabled(): boolean {
    return this.shadowsEnabled;
  }

  /**
   * Enable or disable edge/outline rendering
   */
  public setEdgesEnabled(enabled: boolean): void {
    this.edgesEnabled = enabled;
    
    if (enabled && this.proxyScene && this.edgeLines.length === 0) {
      // Create edges if not already created
      this.createEdges();
    }
    
    // Toggle visibility of existing edge lines
    for (const line of this.edgeLines) {
      line.visible = enabled;
    }
    
    console.log(`✏️ Edges ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current edge rendering state
   */
  public isEdgesEnabled(): boolean {
    return this.edgesEnabled;
  }

  /**
   * Set edge detection threshold angle (in degrees)
   * Lower = more edges, Higher = fewer edges (only sharp angles)
   */
  public setEdgeThreshold(degrees: number): void {
    this.edgeThreshold = Math.max(1, Math.min(90, degrees));
    
    // Recreate edges with new threshold if enabled
    if (this.edgesEnabled && this.proxyScene) {
      this.removeEdges();
      this.createEdges();
    }
    
    console.log(`✏️ Edge threshold set to ${this.edgeThreshold}°`);
  }

  /**
   * Get current edge threshold
   */
  public getEdgeThreshold(): number {
    return this.edgeThreshold;
  }

  /**
   * Create edge lines for all meshes in the proxy scene
   */
  private createEdges(): void {
    if (!this.proxyScene) return;
    
    const thresholdRadians = (this.edgeThreshold * Math.PI) / 180;
    let edgeCount = 0;
    
    // Create a shared material for all edges
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      linewidth: 1, // Note: linewidth > 1 only works on some platforms
      transparent: true,
      opacity: 0.8,
    });
    
    this.proxyScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry && obj.name !== 'webgpu-ground-plane') {
        try {
          // Create edges geometry from mesh geometry
          const edgesGeometry = new THREE.EdgesGeometry(obj.geometry, thresholdRadians * (180 / Math.PI));
          
          if (edgesGeometry.attributes.position && edgesGeometry.attributes.position.count > 0) {
            const lineSegments = new THREE.LineSegments(edgesGeometry, edgeMaterial);
            
            // Copy transform from the mesh
            lineSegments.position.copy(obj.position);
            lineSegments.rotation.copy(obj.rotation);
            lineSegments.scale.copy(obj.scale);
            lineSegments.matrix.copy(obj.matrix);
            lineSegments.matrixWorld.copy(obj.matrixWorld);
            lineSegments.matrixAutoUpdate = false;
            
            lineSegments.name = 'edge-line';
            lineSegments.visible = this.edgesEnabled;
            
            // Add to same parent as mesh or to scene
            if (obj.parent) {
              obj.parent.add(lineSegments);
            } else {
              this.proxyScene!.add(lineSegments);
            }
            
            this.edgeLines.push(lineSegments);
            edgeCount++;
          }
        } catch (e) {
          // Skip meshes that can't have edges computed
        }
      }
    });
    
    console.log(`✏️ Created ${edgeCount} edge outlines`);
  }

  /**
   * Remove all edge lines
   */
  private removeEdges(): void {
    for (const line of this.edgeLines) {
      if (line.parent) {
        line.parent.remove(line);
      }
      line.geometry.dispose();
    }
    this.edgeLines = [];
  }

  // =========================================================================
  // PERFORMANCE OPTIMIZATION CONTROLS
  // =========================================================================

  /**
   * Enable or disable frustum culling optimization
   * When enabled, objects outside the camera view are hidden (not rendered)
   */
  public setFrustumCullingEnabled(enabled: boolean): void {
    this.frustumCullingEnabled = enabled;
    
    // If disabling, make all meshes visible again
    if (!enabled && this.proxyScene) {
      this.proxyScene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.visible = true;
        }
      });
    }
    
    console.log(`🔍 Frustum culling ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current frustum culling state
   */
  public isFrustumCullingEnabled(): boolean {
    return this.frustumCullingEnabled;
  }

  /**
   * Enable or disable geometry merging optimization
   * When enabled, meshes with same material are merged to reduce draw calls
   * Note: This only affects newly loaded models, not existing ones
   */
  public setGeometryMergingEnabled(enabled: boolean): void {
    this.geometryMergingEnabled = enabled;
    console.log(`🔗 Geometry merging ${enabled ? 'enabled' : 'disabled'} (applies to next model load)`);
  }

  /**
   * Get current geometry merging state
   */
  public isGeometryMergingEnabled(): boolean {
    return this.geometryMergingEnabled;
  }

  /**
   * Set shadow map resolution
   * Lower values = better performance but lower shadow quality
   * Common values: 512, 1024, 2048, 4096
   */
  public setShadowMapResolution(resolution: number): void {
    if (this.shadowLight && this.shadowLight.shadow) {
      this.shadowLight.shadow.mapSize.set(resolution, resolution);
      
      // Force shadow map recreation
      if (this.shadowLight.shadow.map) {
        this.shadowLight.shadow.map.dispose();
        this.shadowLight.shadow.map = null as any;
      }
      
      this.shadowMapNeedsUpdate = true;
      console.log(`🌑 Shadow map resolution set to ${resolution}x${resolution}`);
    }
  }

  /**
   * Get current shadow map resolution
   */
  public getShadowMapResolution(): number {
    return this.shadowLight?.shadow?.mapSize?.x ?? 2048;
  }

  /**
   * Apply performance preset
   * 'low' = Maximum performance (for complex models)
   * 'medium' = Balanced
   * 'high' = Maximum quality
   */
  public applyPerformancePreset(preset: 'low' | 'medium' | 'high'): void {
    switch (preset) {
      case 'low':
        this.setFrustumCullingEnabled(true);
        this.setGeometryMergingEnabled(true);
        this.setShadowMapResolution(512);
        this.setShadowsEnabled(false);
        this.setEdgesEnabled(false);
        console.log('⚡ Applied LOW quality preset (maximum performance)');
        break;
        
      case 'medium':
        this.setFrustumCullingEnabled(true);
        this.setGeometryMergingEnabled(true);
        this.setShadowMapResolution(1024);
        this.setShadowsEnabled(true);
        this.setEdgesEnabled(false);
        console.log('⚖️ Applied MEDIUM quality preset (balanced)');
        break;
        
      case 'high':
        this.setFrustumCullingEnabled(true);
        this.setGeometryMergingEnabled(true);
        this.setShadowMapResolution(2048);
        this.setShadowsEnabled(true);
        this.setEdgesEnabled(true);
        console.log('✨ Applied HIGH quality preset (maximum quality)');
        break;
    }
  }

  // =========================================================================
  // CATEGORY VISIBILITY (Hide Spaces, etc.)
  // =========================================================================

  /**
   * Hide or show IFC Spaces in the WebGPU scene
   * When spaces are hidden, they will be excluded when rebuilding the proxy scene
   */
  public async setSpacesVisible(visible: boolean): Promise<void> {
    if (visible) {
      this.hiddenCategories.delete('IFCSPACE');
    } else {
      this.hiddenCategories.add('IFCSPACE');
    }
    
    console.log(`${visible ? '👁️' : '🙈'} WebGPU spaces ${visible ? 'shown' : 'hidden'}`);
    
    // Rebuild proxy scene to apply the change
    if (this.isActive && this.world) {
      await this.rebuildProxyScene();
    }
  }

  /**
   * Check if spaces are currently visible
   */
  public areSpacesVisible(): boolean {
    return !this.hiddenCategories.has('IFCSPACE');
  }

  /**
   * Hide or show a specific IFC category
   */
  public async setCategoryVisible(category: string, visible: boolean): Promise<void> {
    const upperCategory = category.toUpperCase();
    if (visible) {
      this.hiddenCategories.delete(upperCategory);
    } else {
      this.hiddenCategories.add(upperCategory);
    }
    
    console.log(`${visible ? '👁️' : '🙈'} WebGPU category ${upperCategory} ${visible ? 'shown' : 'hidden'}`);
    
    // Rebuild proxy scene to apply the change
    if (this.isActive && this.world) {
      await this.rebuildProxyScene();
    }
  }

  /**
   * Rebuild the proxy scene (used when visibility changes)
   */
  private async rebuildProxyScene(): Promise<void> {
    if (!this.world || !this.scene) return;
    
    console.log('🔄 Rebuilding WebGPU proxy scene...');
    
    // Store current settings
    const wasEdgesEnabled = this.edgesEnabled;
    const wasGroundPlaneEnabled = this.groundPlaneEnabled;
    
    // Dispose old proxy scene resources
    this.removeEdges();
    for (const geo of this.createdGeometries) {
      geo.dispose();
    }
    this.createdGeometries = [];
    this.mergedMeshes = [];
    this.meshCategoryMap.clear();
    
    // Remove old ground plane
    if (this.groundPlane && this.proxyScene) {
      this.proxyScene.remove(this.groundPlane);
      this.groundPlane.geometry.dispose();
      (this.groundPlane.material as THREE.Material).dispose();
      this.groundPlane = null;
    }
    
    // Temporarily enable ground plane so it gets created during rebuild
    this.groundPlaneEnabled = wasGroundPlaneEnabled;
    
    // Build new proxy scene (this also sets up ground plane via updateShadowBounds)
    const success = await this.tryBuildProxySceneFromFragments(this.scene);
    
    if (success && this.proxyScene) {
      // Restore edges
      if (wasEdgesEnabled) {
        this.createEdges();
      }
      
      console.log('✅ WebGPU proxy scene rebuilt');
    }
  }

  /**
   * Set tone mapping type
   * Options: NoToneMapping, LinearToneMapping, ReinhardToneMapping, 
   *          CineonToneMapping, ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping
   */
  public setToneMapping(type: THREE.ToneMapping): void {
    if (this.webgpuRenderer) {
      this.webgpuRenderer.toneMapping = type;
      this.currentToneMapping = type;
      console.log('🎨 Tone mapping set to:', this.getToneMappingName(type));
    }
  }

  /**
   * Set exposure level for tone mapping (default 1.0)
   * Higher = brighter, Lower = darker
   */
  public setExposure(value: number): void {
    if (this.webgpuRenderer) {
      this.webgpuRenderer.toneMappingExposure = value;
      console.log('🎨 Exposure set to:', value.toFixed(2));
    }
  }

  /**
   * Get current exposure value
   */
  public getExposure(): number {
    return this.webgpuRenderer?.toneMappingExposure ?? 1.0;
  }

  /**
   * Get readable name for tone mapping type
   */
  private getToneMappingName(type: THREE.ToneMapping): string {
    switch (type) {
      case THREE.NoToneMapping: return 'None';
      case THREE.LinearToneMapping: return 'Linear';
      case THREE.ReinhardToneMapping: return 'Reinhard';
      case THREE.CineonToneMapping: return 'Cineon';
      case THREE.ACESFilmicToneMapping: return 'ACES Filmic';
      case THREE.AgXToneMapping: return 'AgX';
      case THREE.NeutralToneMapping: return 'Neutral';
      default: return 'Unknown';
    }
  }

  /**
   * Try to clone fragment meshes directly from the original scene, preserving
   * the actual rendered materials/colors. This produces exact visual parity with WebGL.
   */
  private async tryCloneFragmentMeshes(
    originalScene: THREE.Scene,
    fragments: any
  ): Promise<boolean> {
    const proxy = new THREE.Scene();
    const bg = originalScene.background as any;
    proxy.background = bg instanceof THREE.Color ? bg.clone() : bg;

    // Copy lights (but we'll add our own shadow light)
    let copiedLights = 0;
    originalScene.traverse((obj) => {
      if ((obj as any).isLight) {
        try {
          const light = obj.clone(true) as THREE.Light;
          // Disable shadows on copied lights - we use our own shadow light
          (light as any).castShadow = false;
          proxy.add(light);
          if ((light as any).isDirectionalLight && (light as any).target) {
            proxy.add((light as any).target);
          }
          copiedLights++;
        } catch { /* ignore */ }
      }
    });

    // Always add ambient light for fill
    proxy.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Add shadow-casting directional light
    this.setupShadowLight(proxy);

    const root = new THREE.Group();
    root.name = 'webgpu-fragments-cloned';
    proxy.add(root);

    let clonedMeshes = 0;
    let skippedMeshes = 0;
    const materialCache = new Map<string, THREE.MeshStandardMaterial>();

    // Helper to convert any material to WebGPU-compatible MeshStandardMaterial
    const toStandardMaterial = (mat: THREE.Material): THREE.MeshStandardMaterial => {
      const c = (mat as any).color as THREE.Color | undefined;
      const r = c ? Math.round(c.r * 255) : 200;
      const g = c ? Math.round(c.g * 255) : 200;
      const b = c ? Math.round(c.b * 255) : 200;
      const opacity = typeof (mat as any).opacity === 'number' ? (mat as any).opacity : 1;
      const transparent = !!(mat as any).transparent || opacity < 1;
      const side = (mat as any).side ?? THREE.DoubleSide;

      const key = `${r},${g},${b},${opacity.toFixed(3)},${transparent ? 1 : 0},${side}`;
      const cached = materialCache.get(key);
      if (cached) return cached;

      const newMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(r / 255, g / 255, b / 255),
        roughness: 1,
        metalness: 0,
        opacity,
        transparent,
        side,
      });
      materialCache.set(key, newMat);
      return newMat;
    };

    // Iterate over fragment models
    for (const [modelId, model] of fragments.list as Map<string, any>) {
      const modelObj = model?.object as THREE.Object3D | undefined;
      if (!modelObj) continue;

      const modelGroup = new THREE.Group();
      modelGroup.name = `webgpu-clone-${modelId}`;
      modelObj.updateMatrixWorld(true);
      modelGroup.position.copy(modelObj.position);
      modelGroup.quaternion.copy(modelObj.quaternion);
      modelGroup.scale.copy(modelObj.scale);
      root.add(modelGroup);

      // Traverse the model's scene graph and clone meshes
      modelObj.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;

        const srcGeo = child.geometry as THREE.BufferGeometry;
        if (!srcGeo) {
          skippedMeshes++;
          return;
        }

        const srcPos = srcGeo.getAttribute('position');
        if (!srcPos) {
          skippedMeshes++;
          return;
        }

        // We need the raw array. If it's an InterleavedBufferAttribute or lacks .array, skip.
        let posArray: Float32Array | null = null;
        if (srcPos.array instanceof Float32Array) {
          posArray = srcPos.array;
        } else if (srcPos.array instanceof Float64Array) {
          posArray = new Float32Array(srcPos.array);
        } else if ((srcPos as any).data?.array) {
          // Interleaved: extract into flat array
          const data = (srcPos as any).data.array;
          const itemSize = srcPos.itemSize;
          const offset = (srcPos as any).offset ?? 0;
          const stride = (srcPos as any).data.stride ?? itemSize;
          const count = srcPos.count;
          posArray = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            posArray[i * 3] = data[i * stride + offset];
            posArray[i * 3 + 1] = data[i * stride + offset + 1];
            posArray[i * 3 + 2] = data[i * stride + offset + 2];
          }
        }

        if (!posArray || posArray.length === 0) {
          skippedMeshes++;
          return;
        }

        // Build a new geometry
        const newGeo = new THREE.BufferGeometry();
        newGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));

        // Normals
        const srcNorm = srcGeo.getAttribute('normal');
        if (srcNorm) {
          let normArray: Float32Array | null = null;
          if (srcNorm.array instanceof Float32Array) {
            normArray = srcNorm.array;
          } else if (srcNorm.array instanceof Float64Array) {
            normArray = new Float32Array(srcNorm.array);
          } else if (srcNorm.array instanceof Int16Array) {
            // Packed normals
            const n = srcNorm.array;
            normArray = new Float32Array(n.length);
            const scale = 1 / 32767;
            for (let i = 0; i < n.length; i++) normArray[i] = n[i] * scale;
          } else if ((srcNorm as any).data?.array) {
            const data = (srcNorm as any).data.array;
            const itemSize = srcNorm.itemSize;
            const offset = (srcNorm as any).offset ?? 0;
            const stride = (srcNorm as any).data.stride ?? itemSize;
            const count = srcNorm.count;
            normArray = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
              normArray[i * 3] = data[i * stride + offset];
              normArray[i * 3 + 1] = data[i * stride + offset + 1];
              normArray[i * 3 + 2] = data[i * stride + offset + 2];
            }
          }
          if (normArray && normArray.length > 0) {
            newGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normArray, 3));
          } else {
            newGeo.computeVertexNormals();
          }
        } else {
          newGeo.computeVertexNormals();
        }

        // Index
        const srcIdx = srcGeo.getIndex();
        if (srcIdx && srcIdx.array) {
          newGeo.setIndex(new THREE.Uint32BufferAttribute(new Uint32Array(srcIdx.array), 1));
        }

        // Material
        const srcMat = Array.isArray(child.material) ? child.material[0] : child.material;
        const newMat = toStandardMaterial(srcMat);

        const newMesh = new THREE.Mesh(newGeo, newMat);

        // Apply world transform relative to model
        child.updateMatrixWorld(true);
        const localMatrix = new THREE.Matrix4().copy(modelObj.matrixWorld).invert().multiply(child.matrixWorld);
        newMesh.applyMatrix4(localMatrix);

        newMesh.frustumCulled = false;
        newMesh.castShadow = this.shadowsEnabled;
        newMesh.receiveShadow = this.shadowsEnabled;
        modelGroup.add(newMesh);
        this.createdGeometries.push(newGeo);
        clonedMeshes++;
      });
    }

    if (clonedMeshes === 0) {
      console.log('⚠️ tryCloneFragmentMeshes: no meshes cloned');
      return false;
    }

    console.log(`✅ WebGPU cloned fragment meshes: cloned=${clonedMeshes}, skipped=${skippedMeshes}, lights=${copiedLights}`);

    this.proxyScene = proxy;
    this.proxySceneKind = 'fragments';
    
    // Adjust shadow camera to fit the model
    this.updateShadowBounds();
    
    return true;
  }

  /**
   * ==========================================================================
   * BUILD PROXY SCENE FROM FRAGMENTS
   * ==========================================================================
   * 
   * This is the core method that translates OBC's fragment model to WebGPU.
   * 
   * WHY WE NEED THIS:
   * OBC stores geometry in a special LOD (Level of Detail) format optimized
   * for WebGL. WebGPU can't directly render these meshes, so we rebuild them.
   * 
   * THE PROCESS:
   * 1. Get all items with geometry from the model
   * 2. For each item, get its raw geometry data (positions, normals, indices)
   * 3. Build new THREE.BufferGeometry from this data
   * 4. Look up the correct material color using: sampleId → sample → material
   * 5. Create a new mesh and add it to our proxy scene
   * 
   * COLOR RESOLUTION CHAIN:
   * meshData.sampleId → model.getSamples().get(sampleId).material → model.getMaterials().get(materialId)
   * 
   * This gives us the actual IFC material colors (20+ unique colors) instead
   * of the broken getItemsMaterialDefinition() which only returns ~4 grays.
   */
  private async tryBuildProxySceneFromFragments(originalScene: THREE.Scene): Promise<boolean> {
    if (!this.components) return false;

    let fragments: any = null;
    try {
      fragments = this.components.get(OBC.FragmentsManager);
    } catch {
      return false;
    }

    if (!fragments?.list || fragments.list.size === 0) {
      return false;
    }

    // =====================================================================
    // Build a WebGPU proxy scene from FragmentsModel typed geometry arrays.
    // OBC's fragment meshes use a special LOD/tiled structure that doesn't
    // expose standard BufferGeometry, so we rebuild from getItemsGeometry().
    // =====================================================================

    const proxy = new THREE.Scene();
    const bg = originalScene.background as any;
    proxy.background = bg instanceof THREE.Color ? bg.clone() : bg;

    // -------------------------------------------------------------------------
    // STEP 1: Copy lights from original scene
    // MeshStandardMaterial requires lights. Since we're rendering a separate
    // proxy scene, we must copy lights (camera headlight won't be traversed).
    // -------------------------------------------------------------------------
    let copiedLights = 0;
    originalScene.traverse((obj) => {
      if ((obj as any).isLight) {
        try {
          const light = obj.clone(true) as THREE.Light;
          // Disable shadows on copied lights - we use our own shadow light
          (light as any).castShadow = false;
          proxy.add(light);

          // DirectionalLight has a target object that must be in the scene.
          if ((light as any).isDirectionalLight && (light as any).target) {
            proxy.add((light as any).target);
          }

          copiedLights++;
        } catch {
          // ignore
        }
      }
    });

    // Always add ambient light for fill
    proxy.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Add shadow-casting directional light
    this.setupShadowLight(proxy);

    const root = new THREE.Group();
    root.name = 'webgpu-fragments-proxy';
    proxy.add(root);

    // Fallback material for meshes without color info
    const sharedMaterial = new THREE.MeshStandardMaterial({
      color: 0xbfc8d4,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    const materialCache = new Map<string, THREE.MeshStandardMaterial>();
    const getOrCreateMaterialFromDefinition = (definition: any): THREE.MeshStandardMaterial => {
      const rawColor = definition?.color;
      const color = (() => {
        if (!rawColor) return null;
        // THREE.Color or THREE-like
        if (typeof rawColor === 'object' && typeof rawColor.r === 'number' && typeof rawColor.g === 'number' && typeof rawColor.b === 'number') {
          const r = rawColor.r;
          const g = rawColor.g;
          const b = rawColor.b;
          // r/g/b are typically 0..1
          if (r <= 1 && g <= 1 && b <= 1) return new THREE.Color(r, g, b);
          // sometimes serialized as 0..255
          return new THREE.Color(r / 255, g / 255, b / 255);
        }
        if (Array.isArray(rawColor) && rawColor.length >= 3) {
          const [r, g, b] = rawColor;
          if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') {
            if (r <= 1 && g <= 1 && b <= 1) return new THREE.Color(r, g, b);
            return new THREE.Color(r / 255, g / 255, b / 255);
          }
        }
        if (typeof rawColor === 'number') {
          return new THREE.Color(rawColor);
        }
        return null;
      })();

      const opacity = typeof definition?.opacity === 'number' ? definition.opacity : 1;
      const transparent = !!definition?.transparent || opacity < 1;
      const renderedFaces = definition?.renderedFaces;
      const side = renderedFaces === 0 ? THREE.FrontSide : THREE.DoubleSide; // RenderedFaces.ONE=0, TWO=1

      const r = color ? Math.round(color.r * 255) : 191;
      const g = color ? Math.round(color.g * 255) : 200;
      const b = color ? Math.round(color.b * 255) : 212;
      const key = `${r},${g},${b},${opacity.toFixed(3)},${transparent ? 1 : 0},${side}`;

      const cached = materialCache.get(key);
      if (cached) return cached;

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(r / 255, g / 255, b / 255),
        roughness: 1,
        metalness: 0,
        opacity,
        transparent,
        side,
      });
      materialCache.set(key, mat);
      return mat;
    };

    let modelCount = 0;
    let itemCount = 0;
    let meshCount = 0;
    let itemsWithNoGeometry = 0;

    const getItemIdsWithGeometry = async (model: any): Promise<number[]> => {
      // Current API (FragmentsModel)
      if (typeof model?.getItemsIdsWithGeometry === 'function') {
        const ids = await model.getItemsIdsWithGeometry();
        return Array.isArray(ids) ? ids : [];
      }

      // Older/alternative API variants (defensive)
      if (typeof model?.getItemsWithGeometry === 'function') {
        const result = await model.getItemsWithGeometry();
        if (Array.isArray(result)) {
          // Some versions return Item[] objects, others return localId numbers.
          if (result.length === 0) return [];
          if (typeof result[0] === 'number') return result as number[];
          return (result as any[])
            .map((it) => (typeof it === 'number' ? it : it?.localId ?? it?.id ?? null))
            .filter((v) => typeof v === 'number') as number[];
        }
      }

      // Legacy name used in some code/comments
      if (typeof model?.getAllItemsWithGeometry === 'function') {
        const ids = await model.getAllItemsWithGeometry();
        return Array.isArray(ids) ? ids : [];
      }

      return [];
    };

    for (const [modelId, model] of fragments.list as Map<string, any>) {
      modelCount++;

      const modelGroup = new THREE.Group();
      modelGroup.name = `webgpu-model-${modelId}`;
      root.add(modelGroup);

      const modelObj = model?.object as THREE.Object3D | undefined;
      if (modelObj) {
        modelObj.updateMatrixWorld(true);
        modelGroup.position.copy(modelObj.position);
        modelGroup.quaternion.copy(modelObj.quaternion);
        modelGroup.scale.copy(modelObj.scale);
      }

      let itemIds: number[] = [];
      try {
        itemIds = await getItemIdsWithGeometry(model);
      } catch (e) {
        console.warn(`⚠️ WebGPU: failed to get item IDs with geometry for model ${modelId}`, e);
        continue;
      }

      // Fetch per-item material definitions (colors/opacity/sidedness) in bulk.
      const localIdToMaterialDef = new Map<number, any>();
      const forEachNumericId = (ids: any, cb: (id: number) => void): void => {
        if (!ids) return;
        if (Array.isArray(ids)) {
          for (const v of ids) if (typeof v === 'number') cb(v);
          return;
        }
        if (ids instanceof Set) {
          for (const v of ids) if (typeof v === 'number') cb(v);
          return;
        }
        // TypedArrays
        if (ArrayBuffer.isView(ids) && !(ids instanceof DataView)) {
          const view = ids as unknown as ArrayLike<number>;
          for (let i = 0; i < view.length; i++) {
            const v = (view as any)[i];
            if (typeof v === 'number') cb(v);
          }
          return;
        }
        // Generic iterable
        if (typeof ids[Symbol.iterator] === 'function') {
          for (const v of ids as Iterable<any>) if (typeof v === 'number') cb(v);
        }
      };

      const addMaterialDefsForIds = async (ids: number[]): Promise<void> => {
        if (typeof model?.getItemsMaterialDefinition !== 'function') return;
        const pending = ids.filter((id) => typeof id === 'number' && !localIdToMaterialDef.has(id));
        if (pending.length === 0) return;

        // Chunk requests defensively; some implementations may return partial results for huge lists.
        const chunkSize = 250;
        for (let i = 0; i < pending.length; i += chunkSize) {
          const chunk = pending.slice(i, i + chunkSize);
          try {
            const defs = await model.getItemsMaterialDefinition(chunk);
            if (!Array.isArray(defs)) continue;
            for (const entry of defs) {
              const def = entry?.definition;
              const localIds = entry?.localIds;
              if (!def || !localIds) continue;
              forEachNumericId(localIds, (id) => localIdToMaterialDef.set(id, def));
            }
          } catch {
            // ignore; fall back to shared material
          }
        }
      };

      if (itemIds.length > 0) {
        await addMaterialDefsForIds(itemIds);
      }

      // If definitions end up effectively uniform (common when models have no true material colors),
      // fall back to category-based colors to match the app's "color by type" behavior.
      const uniqueDefKeys = new Set<string>();
      const uniqueRgbKeys = new Set<string>();
      let minRgb = 255;
      let maxRgb = 0;

      for (const def of localIdToMaterialDef.values()) {
        const mat = getOrCreateMaterialFromDefinition(def);
        const c = mat.color;
        const r = Math.round(c.r * 255);
        const g = Math.round(c.g * 255);
        const b = Math.round(c.b * 255);

        uniqueRgbKeys.add(`${r},${g},${b}`);
        uniqueDefKeys.add(`${r},${g},${b},${mat.opacity.toFixed(3)},${mat.transparent ? 1 : 0},${mat.side}`);

        minRgb = Math.min(minRgb, r, g, b);
        maxRgb = Math.max(maxRgb, r, g, b);

        if (uniqueDefKeys.size >= 64 && uniqueRgbKeys.size >= 16) break;
      }

      const rgbSpread = maxRgb - minRgb;
      // Prefer category colors when material colors are not meaningfully varied.
      // If the model only has a handful of distinct RGB values (e.g. all gray), category
      // coloring (matching ColorSplash) gives a far more informative visual.
      // Threshold: <=8 unique RGB values means "effectively monochrome", use categories.
      const shouldUseCategoryColors = uniqueRgbKeys.size <= 8;
      const localIdToCategory = new Map<number, string>();
      const categoryMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
      const getOrCreateCategoryMaterial = (category: string): THREE.MeshStandardMaterial => {
        const cached = categoryMaterialCache.get(category);
        if (cached) return cached;

        // Match the app's existing WebGL ColorSplash palette.
        const palette: Record<string, number> = {
          'IFCWALL': 0xFFE066,
          'IFCWALLSTANDARDCASE': 0xFFD700,
          'IFCSLAB': 0xB0B0B0,
          'IFCBEAM': 0xFF3366,
          'IFCCOLUMN': 0x00D9FF,
          'IFCDOOR': 0x8B4513,
          'IFCWINDOW': 0x00BFFF,
          'IFCROOF': 0xDC143C,
          'IFCSTAIR': 0xFF6F00,
          'IFCSTAIRFLIGHT': 0xFF8C00,
          'IFCRAILING': 0xE0E0E0,
          'IFCFURNISHINGELEMENT': 0xAB47BC,
          'IFCFOOTING': 0x795548,
          'IFCRAMP': 0xFFA726,
          'IFCRAMPFLIGHT': 0xFF9800,
          'IFCCURTAINWALL': 0x26C6DA,
          'IFCPLATE': 0x90CAF9,
          'IFCCOVERING': 0xFFAB91,

          'IFCDUCTFITTING': 0x2196F3,
          'IFCDUCTSEGMENT': 0x42A5F5,
          'IFCDUCT': 0x1976D2,
          'IFCAIRTERM': 0x03A9F4,
          'IFCAIRTERMINAL': 0x00B0FF,
          'IFCDAMPER': 0x0288D1,
          'IFCFAN': 0x00E5FF,
          'IFCCOIL': 0x2979FF,
          'IFCCHILLER': 0x00C853,
          'IFCBOILER': 0xFF5722,
          'IFCHEATER': 0xFF6E40,
          'IFCHUMIDIFIER': 0x26C6DA,

          'IFCPIPEFITTING': 0x00E676,
          'IFCPIPESEGMENT': 0x4CAF50,
          'IFCPIPE': 0x2E7D32,
          'IFCVALVE': 0x00FF00,
          'IFCPUMP': 0x1DE9B6,
          'IFCFLOWMETER': 0x00BFA5,
          'IFCFILTER': 0x64DD17,
          'IFCTANK': 0x00897B,

          'IFCCABLEFITTING': 0xFFAB00,
          'IFCCABLESEGMENT': 0xFF9100,
          'IFCCABLE': 0xFFD600,
          'IFCCABLECARRIERFITTING': 0xFFEA00,
          'IFCCABLECARRIERSEGMENT': 0xFFC107,
          'IFCCABLETRAY': 0xFFB300,
          'IFCRACEWAY': 0xFFD54F,
          'IFCLIGHTFIXTURE': 0xFFFF00,
          'IFCLIGHT': 0xFFFF8D,
          'IFCOUTLET': 0xFF6F00,
          'IFCSWITCH': 0xFF9800,
          'IFCTRANSFORMER': 0xF57C00,
          'IFCMOTOR': 0xFF4081,
          'IFCPROTECTIVEDEVICE': 0xE91E63,
          'IFCJUNCTIONBOX': 0xFFB74D,

          'IFCSENSOR': 0xE040FB,
          'IFCCONTROLLER': 0xAB47BC,
          'IFCACTUATOR': 0x9C27B0,
          'IFCALARM': 0xFF1744,

          'IFCEQUIPMENT': 0x9E9E9E,
          'IFCFLOWFITTING': 0x757575,
          'IFCFLOWSEGMENT': 0xBDBDBD,
          'IFCFLOWTERMINAL': 0x78909C,
          'IFCFLOWCONTROLLER': 0x546E7A,
          'IFCDISTRIBUTIONELEMENT': 0x90A4AE,

          'IFCSPACE': 0xE3F2FD,
          'IFCSITE': 0x8D6E63,
          'IFCBUILDING': 0xBCAAA4,
          'IFCBUILDINGSTOREY': 0xD7CCC8,
        };

        const colorHex = palette[category] ?? 0x9E9E9E;
        const color = new THREE.Color(colorHex);

        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 1,
          metalness: 0,
          opacity: 1,
          transparent: false,
          side: THREE.DoubleSide,
        });
        categoryMaterialCache.set(category, mat);
        return mat;
      };

      // Always load categories for hidden category checking (e.g., IFCSPACE)
      // This is needed even if we're not using category colors
      if (typeof model?.getItemsWithGeometryCategories === 'function') {
        try {
          const cats = await model.getItemsWithGeometryCategories();
          if (Array.isArray(cats) && cats.length > 0) {
            const n = Math.min(itemIds.length, cats.length);
            for (let i = 0; i < n; i++) {
              const id = itemIds[i];
              const cat = cats[i];
              if (typeof id === 'number' && typeof cat === 'string' && cat.length) {
                localIdToCategory.set(id, cat);
              }
            }
          }
        } catch {
          // ignore
        }
      }

      let coloredMeshesInModel = 0;
      let categoryColoredMeshesInModel = 0;
      let missingMaterialDefsInModel = 0;

      // =====================================================================
      // STEP 2: Load REAL material colors using model.getMaterials()
      // =====================================================================
      // 
      // IMPORTANT: getItemsMaterialDefinition() is BROKEN - it only returns
      // ~4 gray colors even when the model has 24+ materials with 20+ unique colors.
      // 
      // The CORRECT way to get material colors:
      // 1. model.getMaterials() → Map<materialId, {r, g, b, a}> (the real colors!)
      // 2. model.getSamples() → Map<sampleId, {material: materialId, ...}>
      // 3. meshData.sampleId → look up in samples → get materialId → get color
      //
      // This chain: sampleId → sample.material → realMaterialsMap gives us the
      // actual IFC material colors that match what WebGL renders.
      // =====================================================================
      const realMaterialsMap = new Map<number, { r: number; g: number; b: number; a?: number }>();
      try {
        if (typeof model?.getMaterials === 'function') {
          const allMats = await model.getMaterials();
          if (allMats instanceof Map) {
            for (const [matId, rawMat] of allMats) {
              const r = (rawMat as any)?.r ?? 200;
              const g = (rawMat as any)?.g ?? 200;
              const b = (rawMat as any)?.b ?? 200;
              const a = (rawMat as any)?.a;
              realMaterialsMap.set(matId, { r, g, b, a });
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ Failed to load materials from model.getMaterials():', e);
      }

      // =====================================================================
      // STEP 3: Build sampleId → materialId mapping
      // Each mesh has a sampleId; each sample points to a materialId
      // =====================================================================
      const sampleToMaterialId = new Map<number, number>();
      try {
        if (typeof model?.getSamples === 'function') {
          const allSamples = await model.getSamples();
          if (allSamples instanceof Map) {
            for (const [sampleId, sample] of allSamples) {
              const matId = (sample as any)?.material;
              if (typeof matId === 'number') {
                sampleToMaterialId.set(sampleId, matId);
              }
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ Failed to load samples from model.getSamples():', e);
      }

      console.log('✅ WebGPU materials loaded:', realMaterialsMap.size, 'samples:', sampleToMaterialId.size);

      // Helper to create MeshStandardMaterial from raw color data
      const realMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
      const getOrCreateRealMaterial = (matId: number): THREE.MeshStandardMaterial | null => {
        const rawMat = realMaterialsMap.get(matId);
        if (!rawMat) return null;

        const { r, g, b, a } = rawMat;
        const opacity = typeof a === 'number' ? a / 255 : 1;
        const transparent = opacity < 1;
        const key = `${r},${g},${b},${opacity.toFixed(3)}`;

        const cached = realMaterialCache.get(key);
        if (cached) return cached;

        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(r / 255, g / 255, b / 255),
          roughness: 1,
          metalness: 0,
          opacity,
          transparent,
          side: THREE.DoubleSide,
        });
        realMaterialCache.set(key, mat);
        return mat;
      };

      // Helper to get material from sampleId (the key to correct colors!)
      const getMaterialFromSampleId = (sampleId: number): THREE.MeshStandardMaterial | null => {
        const matId = sampleToMaterialId.get(sampleId);
        if (typeof matId !== 'number') return null;
        return getOrCreateRealMaterial(matId);
      };

      // =====================================================================
      // STEP 4: Build geometry for each item
      // =====================================================================
      // For each IFC item:
      // 1. Get raw geometry data via model.getItemsGeometry()
      // 2. meshData contains: positions, normals, indices, transform, sampleId, localId
      // 3. Build a new THREE.BufferGeometry from this data
      // 4. Look up color using meshData.sampleId → getMaterialFromSampleId()
      // 5. Handle normals carefully (WebGPU requires Float32, not Int16)
      // =====================================================================
      
      // PERFORMANCE OPTIMIZATION: Collect geometries by material for batching
      // Instead of creating thousands of individual meshes (one per IFC item),
      // we group geometries by material and merge them into fewer large meshes.
      // This dramatically reduces draw calls (e.g., 10000 → 50).
      const geometriesByMaterial = new Map<string, { 
        geometries: THREE.BufferGeometry[]; 
        material: THREE.Material;
      }>();
      
      // Helper to get material key for batching
      const getMaterialKey = (mat: THREE.Material): string => {
        if (mat instanceof THREE.MeshStandardMaterial) {
          const c = mat.color;
          return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${mat.opacity.toFixed(3)},${mat.transparent ? 1 : 0}`;
        }
        return mat.uuid;
      };
      
      // Track skipped items for hidden categories
      let skippedByCategory = 0;
      
      for (const itemId of itemIds) {
        itemCount++;
        
        // Check if this item's category should be hidden
        const itemCategory = localIdToCategory.get(itemId);
        if (itemCategory && this.hiddenCategories.has(itemCategory)) {
          skippedByCategory++;
          continue; // Skip this item - it's in a hidden category
        }

        let geometries: any[] | null = null;
        try {
          const geometriesArray = await model.getItemsGeometry([itemId]);
          geometries = geometriesArray?.[0] || null;
        } catch {
          geometries = null;
        }

        if (!geometries || geometries.length === 0) {
          try {
            const children = await model.getItemsChildren([itemId]);
            if (children && children.length > 0) {
              // Ensure children materials are also available
              await addMaterialDefsForIds(children);
              const childrenGeometriesArray = await model.getItemsGeometry(children);
              geometries = childrenGeometriesArray.flat();
            }
          } catch {
            // ignore
          }
        }

        if (!geometries || geometries.length === 0) {
          itemsWithNoGeometry++;
          continue;
        }

        for (const meshData of geometries) {
          if (!meshData?.positions) continue;

          const localIdForMesh = typeof meshData.localId === 'number' ? meshData.localId : itemId;
          
          // Try to get material from meshData.sampleId → sample.material → realMaterialsMap
          let materialForMesh: THREE.Material = sharedMaterial;
          const sampleId = (meshData as any).sampleId;
          
          if (typeof sampleId === 'number' && sampleToMaterialId.size > 0) {
            const realMat = getMaterialFromSampleId(sampleId);
            if (realMat) {
              materialForMesh = realMat;
              coloredMeshesInModel++;
            }
          }
          
          // Fall back to category colors if no real material found
          if (materialForMesh === sharedMaterial && shouldUseCategoryColors) {
            const cat = localIdToCategory.get(localIdForMesh) || localIdToCategory.get(itemId);
            if (cat) {
              materialForMesh = getOrCreateCategoryMaterial(cat);
              categoryColoredMeshesInModel++;
            } else {
              // Fall back to definition if category missing
              const defForMesh = localIdToMaterialDef.get(localIdForMesh);
              if (defForMesh) {
                materialForMesh = getOrCreateMaterialFromDefinition(defForMesh);
              } else {
                missingMaterialDefsInModel++;
              }
            }
          } else if (materialForMesh === sharedMaterial) {
            const defForMesh = localIdToMaterialDef.get(localIdForMesh);
            if (defForMesh) {
              materialForMesh = getOrCreateMaterialFromDefinition(defForMesh);
            } else {
              missingMaterialDefsInModel++;
            }
          }

          // -----------------------------------------------------------------
          // BUILD GEOMETRY
          // -----------------------------------------------------------------
          const geometry = new THREE.BufferGeometry();
          
          // Positions: ensure Float32 (WebGPU prefers this)
          const posArray = meshData.positions instanceof Float64Array
            ? new Float32Array(meshData.positions)
            : (meshData.positions as Float32Array | Float64Array);
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));

          // -----------------------------------------------------------------
          // NORMALS: Critical WebGPU compatibility fix!
          // -----------------------------------------------------------------
          // OBC stores normals as Int16Array (packed, 6 bytes per vertex).
          // WebGPU requires vertex buffer stride to be a multiple of 4 bytes.
          // Int16 vec3 = 6 bytes → INVALID for WebGPU → causes pipeline error!
          // Solution: Convert to Float32 vec3 = 12 bytes → valid for WebGPU.
          // -----------------------------------------------------------------
          if (meshData.normals && meshData.normals.length > 0) {
            const n = meshData.normals;
            const out = new Float32Array(n.length);
            const scale = 1 / 32767; // Int16 normalized range
            for (let i = 0; i < n.length; i++) out[i] = n[i] * scale;
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(out, 3));
          } else {
            geometry.computeVertexNormals();
          }

          // Indices
          if (meshData.indices) {
            geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.indices, 1));
          }

          // GEOMETRY MERGING OPTIMIZATION:
          // Instead of creating a mesh immediately, apply transform to geometry
          // and collect it for later merging with other geometries using same material.
          // This reduces draw calls dramatically.
          if (this.geometryMergingEnabled) {
            // Apply transform to geometry vertices directly (bake transform)
            if (meshData.transform) {
              geometry.applyMatrix4(meshData.transform);
            }
            
            // Compute bounding sphere now for frustum culling later
            geometry.computeBoundingSphere();
            
            // Group by material for later merging
            const matKey = getMaterialKey(materialForMesh);
            if (!geometriesByMaterial.has(matKey)) {
              geometriesByMaterial.set(matKey, { geometries: [], material: materialForMesh });
            }
            geometriesByMaterial.get(matKey)!.geometries.push(geometry);
            meshCount++;
          } else {
            // Original path: create individual mesh per item
            const mesh = new THREE.Mesh(geometry, materialForMesh);
            mesh.castShadow = this.shadowsEnabled;
            mesh.receiveShadow = this.shadowsEnabled;
            
            if (meshData.transform) {
              mesh.applyMatrix4(meshData.transform);
            }

            modelGroup.add(mesh);
            this.createdGeometries.push(geometry);
            meshCount++;
          }
        }

        // Yield to UI every 200 items to prevent freezing
        if (itemCount % 200 === 0) {
          await new Promise<void>((r) => setTimeout(() => r(), 0));
        }
      }
      
      // =====================================================================
      // STEP 5: Merge geometries by material (PERFORMANCE OPTIMIZATION)
      // =====================================================================
      // After collecting all geometries grouped by material, merge each group
      // into a single large mesh. This is the key optimization that reduces
      // draw calls from thousands to tens.
      // =====================================================================
      if (this.geometryMergingEnabled && geometriesByMaterial.size > 0) {
        let mergedMeshCount = 0;
        const MAX_VERTICES_PER_MERGE = 65535 * 3; // ~65K vertices per merged mesh (WebGPU limit friendly)
        
        for (const [matKey, { geometries, material }] of geometriesByMaterial) {
          if (geometries.length === 0) continue;
          
          // Split into chunks if too many vertices (prevent GPU memory issues)
          let currentBatch: THREE.BufferGeometry[] = [];
          let currentVertexCount = 0;
          
          const flushBatch = () => {
            if (currentBatch.length === 0) return;
            
            try {
              const merged = currentBatch.length === 1 
                ? currentBatch[0] 
                : mergeGeometries(currentBatch, false);
              
              if (merged) {
                const mesh = new THREE.Mesh(merged, material);
                mesh.castShadow = this.shadowsEnabled;
                mesh.receiveShadow = this.shadowsEnabled;
                mesh.name = `merged-batch-${matKey}-${mergedMeshCount}`;
                modelGroup.add(mesh);
                this.createdGeometries.push(merged);
                this.mergedMeshes.push(mesh);
                mergedMeshCount++;
              }
            } catch (e) {
              // Fallback: add geometries individually if merge fails
              console.warn('⚠️ Geometry merge failed, adding individually:', e);
              for (const geo of currentBatch) {
                const mesh = new THREE.Mesh(geo, material);
                mesh.castShadow = this.shadowsEnabled;
                mesh.receiveShadow = this.shadowsEnabled;
                modelGroup.add(mesh);
                this.createdGeometries.push(geo);
                mergedMeshCount++;
              }
            }
            
            currentBatch = [];
            currentVertexCount = 0;
          };
          
          for (const geo of geometries) {
            const vertexCount = geo.attributes.position?.count || 0;
            
            if (currentVertexCount + vertexCount > MAX_VERTICES_PER_MERGE && currentBatch.length > 0) {
              flushBatch();
            }
            
            currentBatch.push(geo);
            currentVertexCount += vertexCount;
          }
          
          // Flush remaining
          flushBatch();
        }
        
        console.log(`✅ WebGPU geometry merging: ${meshCount} geometries → ${mergedMeshCount} merged meshes (${geometriesByMaterial.size} material groups)`);
      }

      // Log color statistics for debugging
      console.log('🎨 WebGPU proxy color stats', {
        modelId,
        mappedLocalIds: localIdToMaterialDef.size,
        coloredMeshes: coloredMeshesInModel,
        categoryColoredMeshes: categoryColoredMeshesInModel,
        missingMaterialDefs: missingMaterialDefsInModel,
        uniqueMaterialDefsSampled: uniqueDefKeys.size,
        uniqueRgbSampled: uniqueRgbKeys.size,
        rgbSpread,
        usingCategoryColors: shouldUseCategoryColors,
        totalMeshesSoFar: meshCount,
      });
    }

    console.log('✅ WebGPU fragments proxy built', {
      modelCount,
      itemCount,
      meshCount,
      itemsWithNoGeometry,
      copiedLights,
    });

    this.proxyScene = proxy;
    this.proxySceneKind = 'fragments';

    // Adjust shadow camera to fit the model
    this.updateShadowBounds();

    return true;
  }

  /**
   * Dispose proxy scene
   */
  private disposeProxyScene(): void {
    if (this.proxySceneKind === 'fragments') {
      this.proxyScene = null;
      this.proxySceneKind = 'in-place';
      console.log('🗑️ WebGPU proxy scene cleared (fragments mode)');
      return;
    }

    // In WebGPU mode we render the original scene and only swap materials.
    // Disposing materials here can crash WebGPURenderer internal caches (seen as `usedTimes` errors).
    // We only restore references and let GC/renderer lifecycle handle cleanup.
    if (this.proxyScene) {
      this.proxyScene = null;
    }

    // Restore materials
    if (this.scene) {
      this.scene.traverse((obj) => {
        const before = this.onBeforeRenderBackup.get(obj.uuid);
        if (before) {
          (obj as any).onBeforeRender = before;
        }
        const after = this.onAfterRenderBackup.get(obj.uuid);
        if (after) {
          (obj as any).onAfterRender = after;
        }

        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          const originalMat = this.materialBackup.get(obj.uuid);
          if (originalMat) {
            (obj as any).material = originalMat as any;
          }

          const originalGeo = this.geometryBackup.get(obj.uuid);
          if (originalGeo) {
            (obj as any).geometry = originalGeo as any;
          }
        }
        const originalVisible = this.visibilityBackup.get(obj.uuid);
        if (typeof originalVisible === 'boolean') {
          obj.visible = originalVisible;
        }
      });
    }

    this.materialBackup.clear();
    this.visibilityBackup.clear();
    this.geometryBackup.clear();
    this.onBeforeRenderBackup.clear();
    this.onAfterRenderBackup.clear();

    console.log('🗑️ WebGPU scene state restored');
  }

  /**
   * Initialize and activate WebGPU renderer
   */
  public async enable(world: OBC.World, container: HTMLElement, components?: OBC.Components): Promise<boolean> {
    // Check WebGPU support first
    const status = await WebGPURendererModule.checkWebGPUSupport();
    if (!status.available) {
      console.warn('⚠️ WebGPU not available:', status.reason);
      return false;
    }

    console.log('🚀 WebGPU supported! GPU Info:', status.browserInfo);

    // Suppress material compatibility warnings before any WebGPU operations
    this.suppressMaterialWarnings();

    try {
      this.world = world;
      this.container = container;
      this.components = components ?? null;
      this.scene = world.scene?.three as THREE.Scene;
      this.camera = world.camera?.three as THREE.Camera;
      
      if (!this.scene || !this.camera) {
        console.error('❌ Scene or camera not available');
        return false;
      }

      // Dynamically import WebGPURenderer from three/webgpu
      const threeWebGPU = await import('three/webgpu');
      const WebGPURenderer = threeWebGPU.WebGPURenderer;
      
      // IMPORTANT: WebGPU renderer needs access to THREE global for node system
      // This fixes the "Cannot read properties of undefined (reading 'constructor')" error
      // which happens when WebGPU nodes try to access THREE types
      (window as any).THREE = THREE;
      
      if (!WebGPURenderer) {
        console.error('❌ WebGPURenderer not found in three/webgpu');
        return false;
      }
      
      // Create WebGPU renderer
      this.webgpuRenderer = new WebGPURenderer({
        antialias: true,
        alpha: true,
      });

      // Initialize the renderer (WebGPU requires async init)
      await this.webgpuRenderer.init();
      
      // Capture GPU info for stats
      await this.captureGPUInfo();

      // Configure renderer
      const { width, height } = container.getBoundingClientRect();
      this.webgpuRenderer.setSize(width, height);
      this.webgpuRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.webgpuRenderer.setClearColor(new THREE.Color(0xd1dee9), 1);

      // Tone mapping for better color/brightness balance
      // ACES Filmic gives a cinematic look with natural highlights
      this.webgpuRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.webgpuRenderer.toneMappingExposure = 1.0;

      // Enable shadow mapping
      if (this.shadowsEnabled) {
        this.webgpuRenderer.shadowMap.enabled = true;
        this.webgpuRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      
      // Create proxy scene with compatible materials
      await this.createProxyScene(this.scene);

      // Enable local clipping for section planes
      if ('localClippingEnabled' in this.webgpuRenderer) {
        this.webgpuRenderer.localClippingEnabled = true;
      }
      if ('clippingPlanes' in this.webgpuRenderer) {
        this.webgpuRenderer.clippingPlanes = [];
      }

      // Hide the original canvas but keep it interactive for controls
      const originalCanvas = container.querySelector('canvas');
      if (originalCanvas) {
        const canvasEl = originalCanvas as HTMLElement;
        // We use opacity 0 instead of display none so it can still receive events
        canvasEl.style.opacity = '0';
        canvasEl.style.pointerEvents = 'auto'; // Ensure it captures events
        canvasEl.style.position = 'absolute';
        canvasEl.style.top = '0';
        canvasEl.style.left = '0';
        canvasEl.style.width = '100%';
        canvasEl.style.height = '100%';
        canvasEl.style.zIndex = '2'; // On top of WebGPU canvas (higher z-index)
      }
      
      // Ensure container has position relative for absolute positioning to work
      const computedStyle = window.getComputedStyle(container);
      if (computedStyle.position === 'static') {
        container.style.position = 'relative';
      }

      // Pause the original WebGL renderer to prevent conflicts
      if (this.world && this.world.renderer) {
        // Stop the main loop of the original renderer
        // We access the private 'renderer' property of the SimpleRenderer or PostproductionRenderer
        // This is a hack but necessary to stop the WebGL loop
        const renderer = this.world.renderer as any;
        if (renderer.enabled !== undefined) {
          renderer.enabled = false;
        }
      }

      // Add WebGPU canvas
      const gpuCanvas = this.webgpuRenderer.domElement as HTMLCanvasElement;
      gpuCanvas.style.position = 'absolute';
      gpuCanvas.style.top = '0';
      gpuCanvas.style.left = '0';
      gpuCanvas.style.width = '100%';
      gpuCanvas.style.height = '100%';
      gpuCanvas.style.pointerEvents = 'none'; // Let events pass through to original canvas
      gpuCanvas.style.zIndex = '0'; // Behind original canvas
      gpuCanvas.id = 'webgpu-canvas';
      container.appendChild(gpuCanvas);

      // Start render loop
      this.isActive = true;
      this.startRenderLoop();

      // Handle resize
      this.setupResizeHandler();

      console.log('✅ WebGPU renderer enabled successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to enable WebGPU renderer:', error);
      this.disable();
      return false;
    }
  }

  /**
   * Disable WebGPU renderer and restore WebGL
   */
  public disable(): void {
    if (!this.isActive && !this.webgpuRenderer) return;

    // Stop render loop
    this.isActive = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Remove WebGPU canvas
    if (this.container) {
      const webgpuCanvas = this.container.querySelector('#webgpu-canvas');
      if (webgpuCanvas) {
        webgpuCanvas.remove();
      }
    }

    // Dispose renderer
    if (this.webgpuRenderer) {
      try {
        this.webgpuRenderer.dispose();
      } catch (e) {
        console.warn('Warning during WebGPU cleanup:', e);
      }
      this.webgpuRenderer = null;
    }

    // Show original canvas
    if (this.container) {
      const originalCanvas = this.container.querySelector('canvas:not(#webgpu-canvas)');
      if (originalCanvas) {
        const canvasEl = originalCanvas as HTMLElement;
        canvasEl.style.display = '';
        canvasEl.style.opacity = '';
        canvasEl.style.pointerEvents = '';
        canvasEl.style.position = '';
        canvasEl.style.zIndex = '';
      }
    }

    // Resume the original WebGL renderer
    if (this.world && this.world.renderer) {
      const renderer = this.world.renderer as any;
      if (renderer.enabled !== undefined) {
        renderer.enabled = true;
      }
    }

    // Restore console.warn
    this.restoreConsoleWarn();

    // Dispose proxy scene
    this.disposeProxyScene();

    // Dispose any temporary geometries created for WebGPU (after renderer disposal)
    for (const g of this.createdGeometries) {
      try {
        g.dispose();
      } catch {
        // ignore
      }
    }
    this.createdGeometries = [];
    this.components = null;

    console.log('✅ WebGPU renderer disabled, WebGL restored');
  }

  /**
   * Check if WebGPU mode is currently active
   */
  public isEnabled(): boolean {
    return this.isActive;
  }

  /**
   * Get current renderer mode
   */
  public getMode(): RendererMode {
    return this.isActive ? 'webgpu' : 'webgl';
  }

  /**
   * Check if WebGPU renderer is currently active
   */
  public isWebGPUActive(): boolean {
    return this.isActive;
  }

  /**
   * Get renderer statistics
   */
  public getStats(): { triangles: number; drawCalls: number; geometries: number; textures: number } | null {
    if (!this.webgpuRenderer || !this.isActive) return null;
    
    try {
      return {
        triangles: this.webgpuRenderer.info?.render?.triangles || 0,
        drawCalls: this.webgpuRenderer.info?.render?.calls || 0,
        geometries: this.webgpuRenderer.info?.memory?.geometries || 0,
        textures: this.webgpuRenderer.info?.memory?.textures || 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Start the WebGPU render loop
   */
  private startRenderLoop(): void {
    const render = (currentTime: number = 0) => {
      if (!this.isActive || !this.webgpuRenderer || !this.proxyScene || !this.camera) {
        return;
      }

      // Track frame time for stats
      if (this.statsEnabled) {
        const delta = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;
        this.frameTime = delta;
        this.frameCount++;
        
        // Update FPS every 500ms
        if (currentTime - this.lastFpsUpdate >= 500) {
          this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
          this.frameCount = 0;
          this.lastFpsUpdate = currentTime;
          this.updateStatsDisplay();
        }
      }

      // Update camera world matrix before rendering.
      // OrbitControls modifies camera position/rotation, but we need to
      // ensure the world matrix is current for accurate rendering.
      this.camera.updateMatrixWorld();
      
      // Check if camera has moved significantly
      const cameraMoved = this.hasCameraMoved();
      
      // Apply frustum culling for performance
      if (this.frustumCullingEnabled && cameraMoved) {
        this.performFrustumCulling();
      }
      
      // Only update shadow map when needed (static scene optimization)
      if (this.shadowLight && this.shadowsEnabled) {
        // Update shadow map less frequently if camera hasn't moved much
        if (cameraMoved || this.shadowMapNeedsUpdate) {
          this.shadowLight.shadow.needsUpdate = true;
          this.shadowMapNeedsUpdate = false;
        } else {
          this.shadowLight.shadow.needsUpdate = false;
        }
      }

      // Render the proxy scene
      try {
        this.webgpuRenderer.render(this.proxyScene, this.camera);
      } catch (e) {
        console.error("Render error", e);
      }

      // Continue loop
      this.animationFrameId = requestAnimationFrame(render);
    };

    render();
  }
  
  /**
   * Check if camera has moved significantly since last frame
   */
  private hasCameraMoved(): boolean {
    if (!this.camera) return true;
    
    const pos = this.camera.position;
    const quat = this.camera.quaternion;
    
    const posDiff = pos.distanceToSquared(this.lastCameraPosition);
    const quatDiff = Math.abs(1 - Math.abs(quat.dot(this.lastCameraQuaternion)));
    
    const moved = posDiff > this.cameraMovedThreshold || quatDiff > 0.0001;
    
    if (moved) {
      this.lastCameraPosition.copy(pos);
      this.lastCameraQuaternion.copy(quat);
    }
    
    return moved;
  }
  
  /**
   * Perform frustum culling to hide objects outside camera view
   */
  private performFrustumCulling(): void {
    if (!this.proxyScene || !this.camera) return;
    
    // Update frustum from camera
    this.projScreenMatrix.multiplyMatrices(
      (this.camera as THREE.PerspectiveCamera).projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    
    // Cull meshes outside frustum
    this.proxyScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name !== 'webgpu-ground-plane') {
        // Use bounding sphere for fast culling
        if (!obj.geometry.boundingSphere) {
          obj.geometry.computeBoundingSphere();
        }
        
        if (obj.geometry.boundingSphere) {
          const sphere = obj.geometry.boundingSphere.clone();
          sphere.applyMatrix4(obj.matrixWorld);
          obj.visible = this.frustum.intersectsSphere(sphere);
        }
      }
    });
  }

  /**
   * Setup resize handler
   */
  private setupResizeHandler(): void {
    if (!this.container) return;

    this.resizeObserver = new ResizeObserver((entries) => {
      if (!this.webgpuRenderer || !this.isActive) return;

      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.webgpuRenderer.setSize(width, height);
        }
      }
    });

    this.resizeObserver.observe(this.container);
  }

  /**
   * Update clipping planes (for section tool compatibility)
   */
  public setClippingPlanes(planes: THREE.Plane[]): void {
    if (this.webgpuRenderer && 'clippingPlanes' in this.webgpuRenderer) {
      this.webgpuRenderer.clippingPlanes = planes;
    }
  }

  /**
   * Set background color
   */
  public setBackgroundColor(color: THREE.Color | string | number): void {
    if (this.webgpuRenderer) {
      this.webgpuRenderer.setClearColor(color);
    }
  }

  /**
   * Force a single frame render
   */
  public renderOnce(): void {
    if (this.webgpuRenderer && this.scene && this.camera) {
      this.webgpuRenderer.render(this.scene, this.camera);
    }
  }

  /**
   * Enable or disable performance stats overlay
   */
  public setStatsEnabled(enabled: boolean): void {
    this.statsEnabled = enabled;
    
    if (enabled) {
      this.createStatsOverlay();
      this.countSceneObjects();
      this.lastFpsUpdate = performance.now();
      this.lastFrameTime = performance.now();
      this.frameCount = 0;
    } else {
      this.removeStatsOverlay();
    }
    
    console.log(`📊 Stats ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current stats enabled state
   */
  public isStatsEnabled(): boolean {
    return this.statsEnabled;
  }

  /**
   * Create the stats overlay element
   */
  private createStatsOverlay(): void {
    if (this.statsOverlay) return;
    
    this.statsOverlay = document.createElement('div');
    this.statsOverlay.id = 'webgpu-stats-overlay';
    this.statsOverlay.innerHTML = `
      <div class="stats-header">📊 WebGPU Performance</div>
      
      <div class="stats-section-title">⚡ Timing</div>
      <div class="stats-row">
        <span class="stats-label">FPS:</span>
        <span class="stats-value" id="stats-fps">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Frame Time:</span>
        <span class="stats-value" id="stats-frametime">-- ms</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Avg Frame:</span>
        <span class="stats-value" id="stats-avgframe">-- ms</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Min/Max FPS:</span>
        <span class="stats-value" id="stats-minmaxfps">--/--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">🎨 Scene</div>
      <div class="stats-row">
        <span class="stats-label">Meshes:</span>
        <span class="stats-value" id="stats-meshes">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Visible:</span>
        <span class="stats-value" id="stats-visible">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Triangles:</span>
        <span class="stats-value" id="stats-triangles">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Vertices:</span>
        <span class="stats-value" id="stats-vertices">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Draw Calls:</span>
        <span class="stats-value" id="stats-drawcalls">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Lines:</span>
        <span class="stats-value" id="stats-lines">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Lights:</span>
        <span class="stats-value" id="stats-lights">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">📦 Memory</div>
      <div class="stats-row">
        <span class="stats-label">Geometries:</span>
        <span class="stats-value" id="stats-geometries">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Materials:</span>
        <span class="stats-value" id="stats-materials">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Textures:</span>
        <span class="stats-value" id="stats-textures">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">JS Heap:</span>
        <span class="stats-value" id="stats-jsheap">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">🚀 Optimizations</div>
      <div class="stats-row">
        <span class="stats-label">Frustum Cull:</span>
        <span class="stats-value" id="stats-frustum">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Geo Merging:</span>
        <span class="stats-value" id="stats-merging">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Merged Meshes:</span>
        <span class="stats-value" id="stats-mergedcount">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Shadow Res:</span>
        <span class="stats-value" id="stats-shadowres">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">⚙️ Settings</div>
      <div class="stats-row">
        <span class="stats-label">Shadows:</span>
        <span class="stats-value" id="stats-shadows">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Edges:</span>
        <span class="stats-value" id="stats-edges">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Ground:</span>
        <span class="stats-value" id="stats-ground">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Tone Map:</span>
        <span class="stats-value" id="stats-tonemap">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Spaces:</span>
        <span class="stats-value" id="stats-spaces">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">📷 Camera</div>
      <div class="stats-row">
        <span class="stats-label">Position:</span>
        <span class="stats-value stats-small" id="stats-campos">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Distance:</span>
        <span class="stats-value" id="stats-camdist">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">FOV:</span>
        <span class="stats-value" id="stats-fov">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">🖥️ Display</div>
      <div class="stats-row">
        <span class="stats-label">Resolution:</span>
        <span class="stats-value" id="stats-resolution">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Pixel Ratio:</span>
        <span class="stats-value" id="stats-pixelratio">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-row">
        <span class="stats-label">Renderer:</span>
        <span class="stats-value stats-highlight" id="stats-renderer">WebGPU</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">GPU:</span>
        <span class="stats-value stats-small" id="stats-gpu">--</span>
      </div>
    `;
    
    // Apply styles
    Object.assign(this.statsOverlay.style, {
      position: 'absolute',
      top: '10px',
      left: '10px',
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      color: '#fff',
      padding: '12px 16px',
      borderRadius: '10px',
      fontFamily: 'Monaco, Consolas, monospace',
      fontSize: '11px',
      lineHeight: '1.6',
      zIndex: '10000',
      minWidth: '160px',
      maxHeight: 'calc(100vh - 100px)',
      overflowY: 'auto',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      border: '1px solid rgba(255,255,255,0.1)',
      cursor: 'move',
      userSelect: 'none',
    });
    
    // Make draggable
    this.makeStatsDraggable();
    
    // Style the header
    const header = this.statsOverlay.querySelector('.stats-header') as HTMLElement;
    if (header) {
      Object.assign(header.style, {
        fontWeight: 'bold',
        fontSize: '12px',
        marginBottom: '8px',
        paddingBottom: '6px',
        borderBottom: '1px solid rgba(255,255,255,0.2)',
        color: '#69db7c',
        position: 'sticky',
        top: '-12px',
        background: 'rgba(0, 0, 0, 0.9)',
        marginTop: '-12px',
        paddingTop: '12px',
        zIndex: '1',
      });
    }
    
    // Add custom scrollbar styles
    const styleId = 'webgpu-stats-scrollbar-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        #webgpu-stats-overlay::-webkit-scrollbar {
          width: 6px;
        }
        #webgpu-stats-overlay::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
        }
        #webgpu-stats-overlay::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }
        #webgpu-stats-overlay::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `;
      document.head.appendChild(style);
    }
    
    // Style the rows
    const rows = this.statsOverlay.querySelectorAll('.stats-row');
    rows.forEach(row => {
      Object.assign((row as HTMLElement).style, {
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
      });
    });
    
    // Style dividers
    const dividers = this.statsOverlay.querySelectorAll('.stats-divider');
    dividers.forEach(divider => {
      Object.assign((divider as HTMLElement).style, {
        height: '1px',
        background: 'rgba(255,255,255,0.1)',
        margin: '6px 0',
      });
    });
    
    // Style labels
    const labels = this.statsOverlay.querySelectorAll('.stats-label');
    labels.forEach(label => {
      Object.assign((label as HTMLElement).style, {
        color: 'rgba(255,255,255,0.6)',
      });
    });
    
    // Style values
    const values = this.statsOverlay.querySelectorAll('.stats-value');
    values.forEach(value => {
      Object.assign((value as HTMLElement).style, {
        color: '#fff',
        fontWeight: '600',
      });
    });
    
    // Style section titles
    const sectionTitles = this.statsOverlay.querySelectorAll('.stats-section-title');
    sectionTitles.forEach(title => {
      Object.assign((title as HTMLElement).style, {
        fontSize: '10px',
        fontWeight: '600',
        color: '#69db7c',
        marginTop: '4px',
        marginBottom: '4px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      });
    });
    
    // Style small values
    const smallValues = this.statsOverlay.querySelectorAll('.stats-small');
    smallValues.forEach(val => {
      Object.assign((val as HTMLElement).style, {
        fontSize: '9px',
        maxWidth: '90px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      });
    });
    
    // Style highlighted values
    const highlights = this.statsOverlay.querySelectorAll('.stats-highlight');
    highlights.forEach(hl => {
      Object.assign((hl as HTMLElement).style, {
        color: '#69db7c',
        fontWeight: '700',
      });
    });
    
    // Add to container
    if (this.container) {
      this.container.appendChild(this.statsOverlay);
    } else {
      document.body.appendChild(this.statsOverlay);
    }
  }

  /**
   * Remove the stats overlay
   */
  private removeStatsOverlay(): void {
    if (this.statsOverlay) {
      // Clean up drag handlers
      if ((this.statsOverlay as any)._dragCleanup) {
        (this.statsOverlay as any)._dragCleanup();
      }
      this.statsOverlay.remove();
      this.statsOverlay = null;
    }
  }

  /**
   * Make the stats overlay draggable
   */
  private makeStatsDraggable(): void {
    if (!this.statsOverlay) return;
    
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    
    const overlay = this.statsOverlay;
    
    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = overlay.getBoundingClientRect();
      const parentRect = overlay.parentElement?.getBoundingClientRect() || { left: 0, top: 0 };
      initialLeft = rect.left - parentRect.left;
      initialTop = rect.top - parentRect.top;
      
      overlay.style.transition = 'none';
      overlay.style.opacity = '0.9';
      
      e.preventDefault();
    };
    
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;
      
      // Constrain to container bounds
      const parent = overlay.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        
        const maxLeft = parentRect.width - overlayRect.width;
        const maxTop = parentRect.height - overlayRect.height;
        
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));
      }
      
      overlay.style.left = `${newLeft}px`;
      overlay.style.top = `${newTop}px`;
    };
    
    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        overlay.style.opacity = '1';
      }
    };
    
    overlay.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    // Store cleanup function
    (overlay as any)._dragCleanup = () => {
      overlay.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  /**
   * Update the stats display with current values
   */
  private updateStatsDisplay(): void {
    if (!this.statsOverlay) return;
    
    // Track frame time for average calculation
    if (this.frameTime > 0) {
      this.frameTimeHistory.push(this.frameTime);
      if (this.frameTimeHistory.length > 60) {
        this.frameTimeHistory.shift();
      }
    }
    const avgFrameTime = this.frameTimeHistory.length > 0 
      ? this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length 
      : 0;
    
    // Track min/max FPS
    if (this.fps > 0) {
      this.fpsHistory.push(this.fps);
      if (this.fpsHistory.length > 120) { // Track over ~1 minute
        this.fpsHistory.shift();
      }
      if (this.fps < this.minFps && this.fps > 0) this.minFps = this.fps;
      if (this.fps > this.maxFps) this.maxFps = this.fps;
    }
    
    // Count visible meshes for frustum culling stats
    this.visibleMeshCount = 0;
    if (this.proxyScene) {
      this.proxyScene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.visible && obj.name !== 'webgpu-ground-plane') {
          this.visibleMeshCount++;
        }
      });
    }
    
    // Timing stats
    const fpsEl = this.statsOverlay.querySelector('#stats-fps');
    const frametimeEl = this.statsOverlay.querySelector('#stats-frametime');
    const avgframeEl = this.statsOverlay.querySelector('#stats-avgframe');
    const minmaxfpsEl = this.statsOverlay.querySelector('#stats-minmaxfps');
    
    if (fpsEl) {
      fpsEl.textContent = this.fps.toString();
      // Color code FPS
      (fpsEl as HTMLElement).style.color = this.fps >= 55 ? '#69db7c' : this.fps >= 30 ? '#fbbf24' : '#f87171';
    }
    
    if (frametimeEl) {
      frametimeEl.textContent = `${this.frameTime.toFixed(1)} ms`;
    }
    
    if (avgframeEl) {
      avgframeEl.textContent = `${avgFrameTime.toFixed(1)} ms`;
    }
    
    if (minmaxfpsEl) {
      minmaxfpsEl.textContent = `${this.minFps === 999 ? '--' : this.minFps}/${this.maxFps === 0 ? '--' : this.maxFps}`;
    }
    
    // Scene stats
    const meshesEl = this.statsOverlay.querySelector('#stats-meshes');
    const visibleEl = this.statsOverlay.querySelector('#stats-visible');
    const trianglesEl = this.statsOverlay.querySelector('#stats-triangles');
    const verticesEl = this.statsOverlay.querySelector('#stats-vertices');
    const drawcallsEl = this.statsOverlay.querySelector('#stats-drawcalls');
    const linesEl = this.statsOverlay.querySelector('#stats-lines');
    const lightsEl = this.statsOverlay.querySelector('#stats-lights');
    
    if (meshesEl) {
      meshesEl.textContent = this.formatNumber(this.meshCount);
    }
    
    if (visibleEl) {
      visibleEl.textContent = this.formatNumber(this.visibleMeshCount);
      // Color code: green if frustum culling is saving work
      const culledPercent = this.meshCount > 0 ? ((this.meshCount - this.visibleMeshCount) / this.meshCount) * 100 : 0;
      (visibleEl as HTMLElement).style.color = culledPercent > 10 ? '#69db7c' : 'inherit';
    }
    
    if (trianglesEl) {
      trianglesEl.textContent = this.formatNumber(this.triangleCount);
    }
    
    if (verticesEl) {
      verticesEl.textContent = this.formatNumber(this.vertexCount);
    }
    
    if (drawcallsEl) {
      drawcallsEl.textContent = this.formatNumber(this.drawCalls);
    }
    
    if (linesEl) {
      linesEl.textContent = this.formatNumber(this.lineCount);
    }
    
    if (lightsEl) {
      lightsEl.textContent = this.lightCount.toString();
    }
    
    // Memory stats
    const geometriesEl = this.statsOverlay.querySelector('#stats-geometries');
    const materialsEl = this.statsOverlay.querySelector('#stats-materials');
    const texturesEl = this.statsOverlay.querySelector('#stats-textures');
    const jsheapEl = this.statsOverlay.querySelector('#stats-jsheap');
    
    if (geometriesEl) {
      geometriesEl.textContent = this.formatNumber(this.geometryCount);
    }
    
    if (materialsEl) {
      materialsEl.textContent = this.formatNumber(this.materialCount);
    }
    
    if (texturesEl) {
      texturesEl.textContent = this.textureCount.toString();
    }
    
    // JS Heap (only available in Chrome)
    if (jsheapEl) {
      const perf = (performance as any);
      if (perf.memory) {
        const usedMB = perf.memory.usedJSHeapSize / (1024 * 1024);
        const totalMB = perf.memory.jsHeapSizeLimit / (1024 * 1024);
        jsheapEl.textContent = `${usedMB.toFixed(0)}/${totalMB.toFixed(0)} MB`;
      } else {
        jsheapEl.textContent = 'N/A';
      }
    }
    
    // Optimization stats
    const frustumEl = this.statsOverlay.querySelector('#stats-frustum');
    const mergingEl = this.statsOverlay.querySelector('#stats-merging');
    const mergedcountEl = this.statsOverlay.querySelector('#stats-mergedcount');
    const shadowresEl = this.statsOverlay.querySelector('#stats-shadowres');
    
    if (frustumEl) {
      frustumEl.textContent = this.frustumCullingEnabled ? 'ON' : 'OFF';
      (frustumEl as HTMLElement).style.color = this.frustumCullingEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)';
    }
    
    if (mergingEl) {
      mergingEl.textContent = this.geometryMergingEnabled ? 'ON' : 'OFF';
      (mergingEl as HTMLElement).style.color = this.geometryMergingEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)';
    }
    
    if (mergedcountEl) {
      mergedcountEl.textContent = this.mergedMeshes.length.toString();
    }
    
    if (shadowresEl) {
      const res = this.shadowLight?.shadow?.mapSize?.x ?? 2048;
      shadowresEl.textContent = `${res}x${res}`;
    }
    
    // Settings stats
    const shadowsEl = this.statsOverlay.querySelector('#stats-shadows');
    const edgesEl = this.statsOverlay.querySelector('#stats-edges');
    const groundEl = this.statsOverlay.querySelector('#stats-ground');
    const tonemapEl = this.statsOverlay.querySelector('#stats-tonemap');
    const spacesEl = this.statsOverlay.querySelector('#stats-spaces');
    
    if (shadowsEl) {
      shadowsEl.textContent = this.shadowsEnabled ? 'ON' : 'OFF';
      (shadowsEl as HTMLElement).style.color = this.shadowsEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)';
    }
    
    if (edgesEl) {
      edgesEl.textContent = this.edgesEnabled ? 'ON' : 'OFF';
      (edgesEl as HTMLElement).style.color = this.edgesEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)';
    }
    
    if (groundEl) {
      groundEl.textContent = this.groundPlaneEnabled ? 'ON' : 'OFF';
      (groundEl as HTMLElement).style.color = this.groundPlaneEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)';
    }
    
    if (tonemapEl) {
      tonemapEl.textContent = this.getToneMappingName(this.currentToneMapping as THREE.ToneMapping);
    }
    
    if (spacesEl) {
      const spacesVisible = !this.hiddenCategories.has('IFCSPACE');
      spacesEl.textContent = spacesVisible ? 'Visible' : 'Hidden';
      (spacesEl as HTMLElement).style.color = spacesVisible ? '#69db7c' : '#fbbf24';
    }
    
    // Camera stats
    const camposEl = this.statsOverlay.querySelector('#stats-campos');
    const camdistEl = this.statsOverlay.querySelector('#stats-camdist');
    const fovEl = this.statsOverlay.querySelector('#stats-fov');
    
    if (this.camera && camposEl) {
      const pos = this.camera.position;
      camposEl.textContent = `${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}`;
    }
    
    if (this.camera && camdistEl) {
      const dist = this.camera.position.distanceTo(this.sceneCenter);
      camdistEl.textContent = `${dist.toFixed(1)}m`;
    }
    
    if (fovEl && this.camera) {
      const cam = this.camera as THREE.PerspectiveCamera;
      if (cam.fov) {
        fovEl.textContent = `${cam.fov.toFixed(0)}°`;
      } else {
        fovEl.textContent = 'N/A';
      }
    }
    
    // Display stats
    const resolutionEl = this.statsOverlay.querySelector('#stats-resolution');
    const pixelratioEl = this.statsOverlay.querySelector('#stats-pixelratio');
    
    if (resolutionEl && this.webgpuRenderer) {
      const size = this.webgpuRenderer.getSize(new THREE.Vector2());
      resolutionEl.textContent = `${Math.round(size.x)}x${Math.round(size.y)}`;
    }
    
    if (pixelratioEl && this.webgpuRenderer) {
      pixelratioEl.textContent = this.webgpuRenderer.getPixelRatio().toFixed(1);
    }
    
    // GPU info
    const gpuEl = this.statsOverlay.querySelector('#stats-gpu');
    if (gpuEl) {
      gpuEl.textContent = this.gpuInfo;
    }
  }

  /**
   * Capture GPU information from WebGPU adapter
   */
  private async captureGPUInfo(): Promise<void> {
    try {
      const nav = navigator as any;
      if (nav.gpu) {
        const adapter = await nav.gpu.requestAdapter();
        if (adapter) {
          // Try to get adapter info
          if (adapter.requestAdapterInfo) {
            const info = await adapter.requestAdapterInfo();
            const vendor = info.vendor || '';
            const device = info.device || '';
            const arch = info.architecture || '';
            const desc = info.description || '';
            
            // Build a readable GPU name
            if (desc) {
              this.gpuInfo = desc;
            } else if (device) {
              this.gpuInfo = `${vendor} ${device}`.trim();
            } else if (arch) {
              this.gpuInfo = `${vendor} ${arch}`.trim();
            } else if (vendor) {
              this.gpuInfo = vendor;
            } else {
              this.gpuInfo = 'WebGPU Adapter';
            }
            
            console.log('🎮 GPU detected:', this.gpuInfo);
          } else {
            // Fallback: try info property directly
            const info = adapter.info;
            if (info) {
              this.gpuInfo = `${info.vendor || ''} ${info.device || info.architecture || ''}`.trim() || 'WebGPU Adapter';
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not get GPU info:', e);
      this.gpuInfo = 'WebGPU Adapter';
    }
  }

  /**
   * Count objects in the scene for stats
   */
  private countSceneObjects(): void {
    if (!this.proxyScene) return;
    
    this.meshCount = 0;
    this.triangleCount = 0;
    this.vertexCount = 0;
    this.drawCalls = 0;
    this.lineCount = 0;
    this.lightCount = 0;
    
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    
    this.proxyScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        this.meshCount++;
        this.drawCalls++;
        
        const geometry = obj.geometry;
        if (geometry) {
          geometries.add(geometry);
          const index = geometry.index;
          const position = geometry.attributes.position;
          
          if (index) {
            this.triangleCount += Math.floor(index.count / 3);
          } else if (position) {
            this.triangleCount += Math.floor(position.count / 3);
          }
          
          if (position) {
            this.vertexCount += position.count;
          }
        }
        
        // Count materials and textures
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => {
          if (mat) {
            materials.add(mat);
            // Check for textures
            if ((mat as any).map) textures.add((mat as any).map);
            if ((mat as any).normalMap) textures.add((mat as any).normalMap);
            if ((mat as any).roughnessMap) textures.add((mat as any).roughnessMap);
            if ((mat as any).metalnessMap) textures.add((mat as any).metalnessMap);
            if ((mat as any).aoMap) textures.add((mat as any).aoMap);
          }
        });
        
      } else if (obj instanceof THREE.LineSegments || obj instanceof THREE.Line) {
        this.lineCount++;
        this.drawCalls++;
      } else if (obj instanceof THREE.Light) {
        this.lightCount++;
      }
    });
    
    this.geometryCount = geometries.size;
    this.materialCount = materials.size;
    this.textureCount = textures.size;
  }

  /**
   * Format large numbers with K/M suffix
   */
  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
}
