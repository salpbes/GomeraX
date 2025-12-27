/**
 * WEBGPU RENDERER (The "Magic Turbo Supercharger")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is a high-performance 3D engine that uses the latest "WebGPU" technology. 
 * It's like putting a racing engine into the viewer—it can handle much larger 
 * buildings and more complex details than the standard WebGL engine.
 * 
 * HOW IT CONNECTS:
 * - WorldManager: It can take over the rendering duties from the standard engine.
 * - All WebGPU Sub-modules: It coordinates the shadows, outlines, and 
 *   optimizations specifically for WebGPU mode.
 * --------------------------------------------------------------------------------
 */

import * as THREE from 'three';
// ClippingGroup removed - sectioning not supported in WebGPU mode
import * as OBC from '@thatopen/components';
// NOTE: WebGPUAmbientOcclusion removed - see WebGPUAmbientOcclusion.ts for explanation
// WebGPUSectionManager removed - sectioning not supported in WebGPU mode

// Import modular managers for better code organization
import { 
  WebGPUStatsManager,
  WebGPUMaterialFactory,
  WebGPUCategoryPalette,
  WebGPUProxySceneBuilder,
  WebGPUShadowManager,
  WebGPUEdgeManager,
  WebGPULODManager,
  type LODSettings,
  type LODStats,
  WebGPUFog,
  type FogSettings,
  type FogType,
  WebGPUOutlineManager,
  type SelectionInfo,
  WebGPUColorPicker,
  type PickingResult,
  type ElementInfo,
  WebGPUElementSelector,
  type ElementSelectionInfo,
  WebGPUOptimizations,
  WebGPUStatsOverlay,
  type StatsOverlayConfig,
  IFC_CATEGORY_COLORS,
  getOrCreateCategoryMaterial 
} from './managers';

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

  // Edge/outline rendering settings
  // (Managed by WebGPUEdgeManager)

  // Performance stats settings
  // (Managed by WebGPUStatsManager)
  
  // Performance optimization settings
  // (Managed by WebGPUOptimizations)

  // When section clipping is active, WebGPU shadow + clipping interactions can
  // produce view-dependent artifacts. We temporarily disable shadows.
  private shadowMapEnabledBeforeClipping: boolean | null = null;

  // Sectioning/clipping is NOT supported in WebGPU mode
  // ClippingGroup-based clipping has issues with edge lines and material compatibility
  private isClippingEnabled(): boolean {
    return false;  // Always false - sectioning disabled in WebGPU mode
  }
  
  // Category visibility (for hiding spaces, etc.)
  private hiddenCategories: Set<string> = new Set();
  private meshCategoryMap: Map<THREE.Mesh, string> = new Map();
  
  // Element visibility tracking
  private hiddenElements: Map<string, Set<number>> = new Map();
  private isolatedElements: Map<string, Set<number>> | null = null;
  private ghostMaterial: THREE.MeshStandardMaterial | null = null;
  
  // Model loading listener
  private modelLoadListener: any = null;
  private fragmentsManager: OBC.FragmentsManager | null = null;
  private knownModelIds: Set<string> = new Set();

  // Outline/selection highlighting
  // (Managed by WebGPUOutlineManager)

  // GPU Color Picking for individual element selection
  // (Managed by WebGPUColorPicker)

  // Element selector for individual element highlighting in merged geometry
  // (Managed by WebGPUElementSelector)

  // NOTE: Ambient Occlusion (GTAO) was removed - see WebGPUAmbientOcclusion.ts for explanation
  // The GTAONode requires non-multisampled depth textures, but our WebGPU renderer uses MSAA

  // Fog effect
  // (Managed by WebGPUFog)

  // Level of Detail (LOD) system
  // (Managed by WebGPULODManager)

  // Color Splash support
  private colorSplashActive: boolean = false;
  private colorSplashColors: Map<string, THREE.Color> = new Map();

  // Slicer coloring
  private slicerActive: boolean = false;
  private slicerColors: Map<string, Map<number, THREE.Color>> = new Map(); // modelId -> expressId -> color

  // Cluster support
  private clusterGroup: THREE.Group | null = null;
  private modelsVisible: boolean = true;
  private modelGroups: THREE.Group[] = [];

  // Sectioning is NOT supported in WebGPU mode (ClippingGroup has compatibility issues)
  // sectionManager and clippingGroup removed


  // Sectioning-related state removed (sectioning not supported in WebGPU mode)
  // originalMaterialSides, isClippingActive, originalAlphaToCoverage, edgesWereVisibleBeforeClipping removed

  // Missing properties restored for compilation
  private selectionPointerDownHandler: ((e: PointerEvent) => void) | null = null;
  private selectionClickHandler: ((e: Event) => void) | null = null;
  private selectionEscHandler: ((e: KeyboardEvent) => void) | null = null;
  private selectionEventTarget: HTMLElement | Window | null = null;
  private elementSelectionHandlersSet: boolean = false;
  private pointerDownPos = new THREE.Vector2();
  private ghostModeActive: boolean = true;
  private currentToneMapping: THREE.ToneMapping = THREE.NoToneMapping;
  private gpuInfo: string = '';
  private frameCount: number = 0;

  // =========================================================================
  // MODULAR MANAGERS
  // =========================================================================
  // These managers were extracted from this class for better maintainability
  private statsManager: WebGPUStatsManager;
  private materialFactory: WebGPUMaterialFactory;
  private categoryPalette: WebGPUCategoryPalette;
  private proxySceneBuilder: WebGPUProxySceneBuilder;
  private shadowManager: WebGPUShadowManager;
  private edgeManager: WebGPUEdgeManager;
  private outlineManager: WebGPUOutlineManager;
  private colorPicker: WebGPUColorPicker;
  private elementSelector: WebGPUElementSelector;
  private fogManager: WebGPUFog;
  private lodManager: WebGPULODManager;
  private optimizations: WebGPUOptimizations;
  private statsOverlay: WebGPUStatsOverlay;

  constructor() {
    // Initialize modular managers
    this.statsManager = new WebGPUStatsManager();
    this.materialFactory = new WebGPUMaterialFactory();
    this.categoryPalette = new WebGPUCategoryPalette();
    this.proxySceneBuilder = new WebGPUProxySceneBuilder(this.materialFactory, this.categoryPalette);
    this.shadowManager = new WebGPUShadowManager();
    this.edgeManager = new WebGPUEdgeManager();
    this.outlineManager = new WebGPUOutlineManager();
    this.colorPicker = new WebGPUColorPicker();
    this.elementSelector = new WebGPUElementSelector();
    this.fogManager = new WebGPUFog();
    this.lodManager = new WebGPULODManager();
    this.optimizations = new WebGPUOptimizations();
    this.statsOverlay = new WebGPUStatsOverlay();
  }

  /**
   * Set Color Splash state for WebGPU
   */
  public async setColorSplash(active: boolean, colors?: Map<string, THREE.Color>): Promise<void> {
    this.colorSplashActive = active;
    if (colors) {
      this.colorSplashColors = colors;
    }
    
    console.log(`🎨 WebGPU Color Splash ${active ? 'enabled' : 'disabled'}`);
    
    // Rebuild scene to apply colors
    if (this.isActive) {
      await this.rebuildProxyScene();
    }
  }

  /**
   * Set Slicer Colors for WebGPU
   */
  public async setSlicerColors(active: boolean, colors?: Map<string, Map<number, THREE.Color>>): Promise<void> {
    this.slicerActive = active;
    if (colors) {
      this.slicerColors = colors;
    } else {
      this.slicerColors.clear();
    }
    
    console.log(`📊 WebGPU Slicer Colors ${active ? 'enabled' : 'disabled'}`);
    
    // Rebuild scene to apply colors
    if (this.isActive) {
      await this.rebuildProxyScene();
    }
  }

  /**
   * Set Cluster Group for WebGPU
   */
  public setClusterGroup(group: THREE.Group | null): void {
    // Remove old group if exists
    if (this.clusterGroup) {
      this.clusterGroup.removeFromParent();
    }
    
    this.clusterGroup = group;
    
    // Add new group if exists
    if (this.clusterGroup && this.proxyScene) {
      // Disable frustum culling for all meshes in the cluster group
      // to ensure they are always rendered in WebGPU mode
      this.clusterGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.frustumCulled = false;
        }
      });
      
      // Add to proxy scene
      this.proxyScene.add(this.clusterGroup);
      console.log('🔷 WebGPU Cluster Group added to scene');
    }
  }

  /**
   * Set visibility of main models in WebGPU
   */
  public setModelsVisible(visible: boolean): void {
    this.modelsVisible = visible;
    
    for (const group of this.modelGroups) {
      group.visible = visible;
    }
    
    console.log(`👁️ WebGPU Models ${visible ? 'visible' : 'hidden'}`);
  }

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
    if (!this.proxySceneBuilder || !this.components) return;

    // Reset builder tracking
    this.proxySceneBuilder.clear();

    // Reset color picker before building scene to clear old IDs
    if (this.colorPicker) {
      this.colorPicker.reset();
    }

    // Preferred path: rebuild IFC geometry from OBC typed arrays (WebGPU-safe)
    const result = await this.proxySceneBuilder.tryBuildProxySceneFromFragments(originalScene, this.components, {
      frustumCulling: this.optimizations?.isFrustumCullingEnabled() ?? true,
      shadows: this.shadowManager.isShadowsEnabled(),
      modelsVisible: this.modelsVisible,
      geometryMerging: this.optimizations?.isGeometryMergingEnabled() ?? true,
      colorPickingEnabled: this.colorPicker?.isEnabled() ?? true,
      colorPicker: this.colorPicker,
      elementSelector: this.elementSelector,
      ghostModeActive: this.ghostModeActive,
      getGhostMaterial: () => this.getOrCreateGhostMaterial(),
      colorSplashActive: this.colorSplashActive,
      colorSplashColors: this.colorSplashColors,
      hiddenCategories: this.hiddenCategories,
      hiddenElements: this.hiddenElements,
      isolatedElements: this.isolatedElements,
      slicerActive: this.slicerActive,
      slicerColors: this.slicerColors,
      setupShadowLight: (scene) => this.setupShadowLight(scene),
      updateShadowBounds: () => this.updateShadowBounds(),
    });

    if (result) {
      this.proxyScene = result.scene;
      this.proxySceneKind = result.kind;
      this.createdGeometries = this.proxySceneBuilder.createdGeometries;
      this.optimizations?.setMergedMeshes(this.proxySceneBuilder.mergedMeshes);
      this.modelGroups = this.proxySceneBuilder.modelGroups;
      return;
    }

    // Fallback path: in-place material swap
    const success = await this.proxySceneBuilder.tryBuildProxySceneInPlace(originalScene, {
      frustumCulling: this.optimizations?.isFrustumCullingEnabled() ?? true,
      materialBackup: this.materialBackup,
      visibilityBackup: this.visibilityBackup,
      geometryBackup: this.geometryBackup,
      onBeforeRenderBackup: this.onBeforeRenderBackup,
      onAfterRenderBackup: this.onAfterRenderBackup,
    });

    if (success) {
      this.proxyScene = originalScene;
      this.proxySceneKind = 'in-place';
      this.createdGeometries = this.proxySceneBuilder.createdGeometries;
    }
  }

  /**
   * Setup a directional light optimized for shadow casting.
   * The shadow camera is configured to cover the model's bounding box.
   */
  private setupShadowLight(scene: THREE.Scene): void {
    this.shadowManager.setupShadowLight(scene);
  }

  /**
   * Update shadow camera to fit the current scene bounds.
   * Also sets up the ground plane.
   * Call this after the proxy scene is fully built.
   */
  public updateShadowBounds(): void {
    if (!this.proxyScene) return;
    this.shadowManager.updateShadowBounds(this.proxyScene);
  }

  /**
   * Enable or disable ground plane at runtime
   */
  public setGroundPlaneEnabled(enabled: boolean): void {
    this.shadowManager.setGroundPlaneEnabled(enabled);
  }

  /**
   * Get current ground plane state
   */
  public isGroundPlaneEnabled(): boolean {
    return this.shadowManager.isGroundPlaneEnabled();
  }

  /**
   * Set visibility for specific elements in WebGPU mode
   */
  public setElementVisibility(modelId: string, localIds: number[], visible: boolean): void {
    if (!this.hiddenElements.has(modelId)) {
      this.hiddenElements.set(modelId, new Set());
    }
    
    const hiddenSet = this.hiddenElements.get(modelId)!;
    for (const id of localIds) {
      if (visible) {
        hiddenSet.delete(id);
      } else {
        hiddenSet.add(id);
      }
    }
    
    // Rebuild proxy scene to reflect changes
    this.rebuildProxyScene();
  }

  /**
   * Isolate specific elements in WebGPU mode
   */
  public isolateElements(modelId: string, localIds: number[]): void {
    this.isolatedElements = new Map();
    this.isolatedElements.set(modelId, new Set(localIds));
    
    // Rebuild proxy scene to reflect changes
    this.rebuildProxyScene();
  }

  /**
   * Set isolated elements for multiple models
   */
  public setIsolatedElements(isolated: Map<string, Set<number>> | null): void {
    this.isolatedElements = isolated;
    
    // Rebuild proxy scene to reflect changes
    this.rebuildProxyScene();
  }

  /**
   * Show all elements in WebGPU mode (clear isolation and hidden elements)
   */
  public showAllElements(): void {
    this.isolatedElements = null;
    this.hiddenElements.clear();
    
    // Rebuild proxy scene to reflect changes
    this.rebuildProxyScene();
  }

  /**
   * Get or create a ghost material for non-isolated elements
   * Delegates to material factory for better code organization
   */
  private getOrCreateGhostMaterial(): THREE.MeshStandardMaterial {
    if (!this.ghostMaterial && this.materialFactory) {
      this.ghostMaterial = this.materialFactory.getOrCreateGhostMaterial();
    }
    return this.ghostMaterial!;
  }

  /**
   * Enable or disable shadows at runtime
   */
  public setShadowsEnabled(enabled: boolean): void {
    this.shadowManager.setShadowsEnabled(enabled);
  }

  /**
   * Set shadow light angle (horizontal rotation around the model)
   * @param angle - Angle in degrees (0-360). 0=North, 90=East, 180=South, 270=West
   */
  public setShadowAngle(angle: number): void {
    this.shadowManager.setShadowAngle(angle);
  }

  /**
   * Get current shadow angle
   */
  public getShadowAngle(): number {
    return this.shadowManager.getShadowAngle();
  }

  /**
   * Set shadow light elevation (vertical angle)
   * @param elevation - Angle in degrees (10-90). Higher = more overhead sun
   */
  public setShadowElevation(elevation: number): void {
    this.shadowManager.setShadowElevation(elevation);
  }

  /**
   * Get current shadow elevation
   */
  public getShadowElevation(): number {
    return this.shadowManager.getShadowElevation();
  }

  /**
   * Get current shadow state
   */
  public isShadowsEnabled(): boolean {
    return this.shadowManager.isShadowsEnabled();
  }

  /**
   * Enable or disable edge/outline rendering
   */
  public async setEdgesEnabled(enabled: boolean): Promise<void> {
    if (!this.edgeManager) return;
    await this.edgeManager.setEdgesEnabled(
      enabled, 
      this.proxyScene, 
      this.ghostMaterial, 
      this.isolatedElements !== null
    );
  }

  /**
   * Get current edge rendering state
   */
  public isEdgesEnabled(): boolean {
    return this.edgeManager?.isEdgesEnabled() ?? false;
  }

  /**
   * Set edge detection threshold angle (in degrees)
   * Lower = more edges, Higher = fewer edges (only sharp angles)
   */
  public async setEdgeThreshold(degrees: number): Promise<void> {
    if (!this.edgeManager) return;
    await this.edgeManager.setEdgeThreshold(
      degrees, 
      this.proxyScene, 
      this.ghostMaterial, 
      this.isolatedElements !== null
    );
  }

  /**
   * Get current edge threshold
   */
  public getEdgeThreshold(): number {
    return this.edgeManager?.getEdgeThreshold() ?? 15;
  }

  /**
   * Create edge lines for all meshes in the proxy scene
   */
  private async createEdges(): Promise<void> {
    if (!this.proxyScene || !this.edgeManager) return;
    await this.edgeManager.createEdges(this.proxyScene, this.ghostMaterial, this.isolatedElements !== null);
  }

  /**
   * Remove all edge lines
   */
  private removeEdges(): void {
    this.edgeManager?.removeEdges();
  }

  // =========================================================================
  // OUTLINE/SELECTION HIGHLIGHTING
  // =========================================================================

  /**
   * Initialize the outline manager for selection highlighting
   */
  private initializeColorPicker(): void {
    if (!this.proxyScene || !this.camera || !this.container || !this.webgpuRenderer) return;
    
    if (this.colorPicker) {
      this.colorPicker.initialize(this.webgpuRenderer, this.proxyScene, this.camera, this.container);
      this.colorPicker.buildPickingScene();
    }
  }

  private initializeOutlineManager(): void {
    if (!this.proxyScene || !this.camera || !this.container) return;
    
    if (this.outlineManager) {
      this.outlineManager.initialize(this.proxyScene, this.camera, this.container);
    }

    // Initialize Element Selector with the current scene
    if (this.elementSelector) {
      this.elementSelector.initialize(this.proxyScene, this.camera, this.container);
    }
    
    // Set up selection callback to log selections
    this.outlineManager.setOnSelect((mesh, info) => {
      // Selection handled by element selector
    });
    
    // Set up hover callback (optional)
    this.outlineManager.setOnHover((mesh) => {
      // Could update cursor or show tooltip here
    });
    
    // If element selector is active, disable outline manager's click handling
    // (element selector provides individual element selection)
    if (this.elementSelector) {
      this.outlineManager.setEnabled(false);
      console.log('🎯 Outline manager disabled (using element selector instead)');
    } else {
      console.log('🎯 Outline/selection highlighting initialized');
    }
    
    // Ensure element selection handlers are set up
    this.setupElementSelectionHandlers();
  }

  /**
   * Set up click/hover handlers that use GPU color picking for element selection
   */
  private setupElementSelectionHandlers(): void {
    if (!this.container || !this.colorPicker || !this.elementSelector) return;
    if (this.elementSelectionHandlersSet) return;

    // Disable hover for performance (geometry extraction on every mouse move is expensive)
    this.elementSelector.setShowHover(false);

    // Disable outline manager if it exists (we're using element selector instead)
    if (this.outlineManager) {
      this.outlineManager.setEnabled(false);
    }

    // Find the original canvas (which receives pointer events)
    let eventTarget: HTMLElement = this.container;
    const originalCanvas = this.container.querySelector('canvas:not(#webgpu-canvas)') as HTMLElement | null;
    if (originalCanvas) {
      eventTarget = originalCanvas;
    }

    // Click handler for selection
    const handleClick = async (event: MouseEvent) => {
      if (!this.colorPicker || !this.elementSelector) return;

      // Check for modifier keys
      const isMultiSelect = event.shiftKey;
      const isToggle = event.ctrlKey || event.metaKey;

      // Use GPU color picker to identify the element
      const result = await this.colorPicker.pick(event.clientX, event.clientY);

      if (result) {
        const info = this.colorPicker.getElementInfo(result.elementId);
        if (info) {
          if (isToggle && this.elementSelector.isElementSelected(result.elementId)) {
            // Toggle off
            this.elementSelector.deselectElement(result.elementId);
          } else if (isMultiSelect) {
            // Add to selection
            this.elementSelector.selectElement(result, info);
          } else {
            // Single selection - clear others first
            this.elementSelector.clearSelection();
            this.elementSelector.selectElement(result, info);
          }
        }
      } else if (!isMultiSelect && !isToggle) {
        // Clicked on nothing - clear selection
        this.elementSelector.clearSelection();
      }
    };

    // Pointer down handler to track start position
    this.selectionPointerDownHandler = (e: PointerEvent) => {
      if (e.button === 0) {
        this.pointerDownPos.x = e.clientX;
        this.pointerDownPos.y = e.clientY;
      }
    };

    // Add event listeners (wrapped to handle pointer events)
    this.selectionClickHandler = (e: Event) => {
      if (e instanceof PointerEvent || e instanceof MouseEvent) {
        const mouseEvent = e as MouseEvent;
        // Only trigger selection on left click (button 0)
        if (mouseEvent.button === 0) {
          // Check distance from pointer down to avoid accidental selection during rotation
          const dx = mouseEvent.clientX - this.pointerDownPos.x;
          const dy = mouseEvent.clientY - this.pointerDownPos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // If moved more than 5 pixels, consider it a drag/rotate, not a click
          if (distance < 5) {
            handleClick(mouseEvent);
          }
        }
      }
    };
    
    this.selectionEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.elementSelector) {
        this.elementSelector.clearSelection();
        console.log('🎯 Selection cleared via ESC key');
      }
    };
    
    // Only listen for clicks, not hover (hover is disabled for performance)
    eventTarget.addEventListener('pointerdown', this.selectionPointerDownHandler, { capture: true });
    eventTarget.addEventListener('pointerup', this.selectionClickHandler, { capture: true });
    window.addEventListener('keydown', this.selectionEscHandler);

    this.selectionEventTarget = eventTarget;
    this.elementSelectionHandlersSet = true;
    console.log('🎯 Element selection handlers attached (GPU color picking + ESC key)');
  }

  /**
   * Enable or disable outline/selection highlighting
   */
  public setOutlineEnabled(enabled: boolean): void {
    this.outlineManager?.setEnabled(enabled);
  }

  /**
   * Get current outline highlighting state
   */
  public isOutlineEnabled(): boolean {
    return this.outlineManager?.isEnabled() ?? true;
  }

  /**
   * Set the outline color for selected objects
   * @param color Hex color value (e.g., 0x00aaff for blue)
   */
  public setOutlineSelectionColor(color: number | string): void {
    this.outlineManager?.setSelectionColor(color);
    this.elementSelector?.setSelectionColor(color);
    console.log(`🎯 Selection color changed`);
  }

  /**
   * Set the outline color for hovered objects
   * @param color Hex color value (e.g., 0xffff00 for yellow)
   */
  public setOutlineHoverColor(color: number | string): void {
    this.outlineManager?.setHoverColor(color);
    this.elementSelector?.setHoverColor(color);
    console.log(`🎯 Hover color changed`);
  }

  /**
   * Set the outline thickness
   * @param thickness Value between 0.01 and 0.2 (default: 0.03)
   */
  public setOutlineThickness(thickness: number): void {
    this.outlineManager?.setThickness(thickness);
    console.log(`🎯 Outline thickness set to ${thickness}`);
  }

  /**
   * Enable or disable hover highlighting
   */
  public setOutlineHoverEnabled(enabled: boolean): void {
    if (this.outlineManager) {
      this.outlineManager.setShowHover(enabled);
      console.log(`🎯 Hover highlighting ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Clear all current selections
   */
  public clearOutlineSelection(): void {
    this.outlineManager?.clearSelection();
    this.elementSelector?.clearSelection();
    console.log('🎯 Selection cleared');
  }

  /**
   * Get currently selected meshes
   */
  public getSelectedMeshes(): THREE.Mesh[] {
    return this.outlineManager?.getSelectedMeshes() ?? [];
  }

  /**
   * Get selection info for currently selected meshes
   */
  public getSelectionInfo(): SelectionInfo[] {
    return this.outlineManager?.getSelectionInfo() ?? [];
  }

  /**
   * Programmatically select meshes matching a name pattern
   * @param pattern String or RegExp to match against mesh names
   */
  public selectMeshesByName(pattern: string | RegExp): void {
    if (this.outlineManager) {
      this.outlineManager.selectByName(pattern);
    }
  }

  /**
   * Debug outline/selection state - call this from console for troubleshooting
   */
  public debugOutlineState(): void {
    console.log('🎯 ==========================================');
    console.log('🎯 WebGPU Outline Debug');
    console.log('🎯 ==========================================');
    console.log('🎯 Outline manager exists:', !!this.outlineManager);
    console.log('🎯 Outline enabled:', this.outlineManager?.isEnabled());
    console.log('🎯 Proxy scene exists:', !!this.proxyScene);
    console.log('🎯 Camera exists:', !!this.camera);
    console.log('🎯 Container exists:', !!this.container);
    
    if (this.outlineManager) {
      this.outlineManager.debugSceneState();
      this.outlineManager.testRaycastCenter();
    }
    console.log('🎯 ==========================================');
  }

  /**
   * Get the outline manager instance (for advanced usage)
   */
  public getOutlineManager(): WebGPUOutlineManager | null {
    return this.outlineManager;
  }

  // =========================================================================
  // GPU COLOR PICKING API - Individual Element Selection
  // =========================================================================

  /**
   * Enable or disable GPU color picking for individual element selection
   * Note: This affects the next scene rebuild, not immediately
   */
  public setColorPickingEnabled(enabled: boolean): void {
    this.colorPicker?.setEnabled(enabled);
  }

  /**
   * Check if GPU color picking is enabled
   */
  public isColorPickingEnabled(): boolean {
    return this.colorPicker?.isEnabled() ?? true;
  }

  /**
   * Pick an element at the given screen coordinates
   * @param x Screen X coordinate (relative to container)
   * @param y Screen Y coordinate (relative to container)
   * @returns Promise resolving to picking result or null
   */
  public async pickElementAt(x: number, y: number): Promise<PickingResult | null> {
    if (!this.colorPicker) {
      console.warn('GPU color picker not initialized');
      return null;
    }
    return this.colorPicker.pick(x, y);
  }

  /**
   * Pick an element at the center of the screen
   * @returns Promise resolving to picking result or null
   */
  public async pickElementAtCenter(): Promise<PickingResult | null> {
    if (!this.colorPicker || !this.container) return null;
    
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    return this.pickElementAt(centerX, centerY);
  }

  /**
   * Get element info by local IFC element ID
   * @param localId The IFC element ID (ExpressID)
   * @returns Element info or undefined
   */
  public getElementInfoByLocalId(localId: number): ElementInfo | undefined {
    if (!this.colorPicker) return undefined;
    
    // Search through all elements for the matching localId
    const info = this.colorPicker.getElementInfo(localId);
    return info;
  }

  /**
   * Get the total number of pickable elements registered
   */
  public getPickableElementCount(): number {
    return this.colorPicker?.getElementCount() ?? 0;
  }

  /**
   * Set callback for GPU picking click events
   * @param callback Function called when an element is clicked
   */
  public setOnColorPickClick(callback: ((result: PickingResult | null) => void) | null): void {
    if (this.colorPicker) {
      this.colorPicker.setOnSelect(callback);
    }
  }

  /**
   * Set callback for GPU picking hover events
   * @param callback Function called when hovering over an element
   */
  public setOnColorPickHover(callback: ((result: PickingResult | null) => void) | null): void {
    if (this.colorPicker) {
      this.colorPicker.setOnHover(callback);
    }
  }

  /**
   * Get the color picker instance (for advanced usage)
   */
  public getColorPicker(): WebGPUColorPicker | null {
    return this.colorPicker;
  }

  /**
   * Debug GPU color picker state
   */
  public debugColorPickerState(): void {
    console.log('🎯 ==========================================');
    console.log('🎯 GPU Color Picker Debug');
    console.log('🎯 ==========================================');
    console.log('🎯 Color picker exists:', !!this.colorPicker);
    console.log('🎯 Color picking enabled:', this.colorPicker?.isEnabled());
    
    if (this.colorPicker) {
      console.log('🎯 Registered elements:', this.colorPicker.getElementCount());
      console.log('🎯 Picking scene ready:', !!this.colorPicker);
    }
    console.log('🎯 ==========================================');
  }

  // =========================================================================
  // ELEMENT SELECTOR API - Individual Element Highlighting
  // =========================================================================

  /**
   * Get the element selector instance (for advanced usage)
   */
  public getElementSelector(): WebGPUElementSelector | null {
    return this.elementSelector;
  }

  /**
   * Clear all element selections
   */
  public clearElementSelection(): void {
    if (this.elementSelector) {
      this.elementSelector.clearSelection();
    }
  }

  /**
   * Get currently selected elements
   */
  public getSelectedElements(): ElementSelectionInfo[] {
    return this.elementSelector?.getSelectedElements() ?? [];
  }

  /**
   * Get selected element count
   */
  public getSelectedElementCount(): number {
    return this.elementSelector?.getSelectedCount() ?? 0;
  }

  /**
   * Set element selection color
   */
  public setElementSelectionColor(color: number | string): void {
    if (this.elementSelector) {
      this.elementSelector.setSelectionColor(color);
    }
  }

  /**
   * Set element hover color
   */
  public setElementHoverColor(color: number | string): void {
    if (this.elementSelector) {
      this.elementSelector.setHoverColor(color);
    }
  }

  /**
   * Set callback for element selection events
   */
  public setOnElementSelect(callback: ((info: ElementSelectionInfo | null) => void) | null): void {
    if (this.elementSelector) {
      this.elementSelector.setOnSelect(callback);
    }
  }

  /**
   * Set callback for element hover events
   */
  public setOnElementHover(callback: ((info: ElementSelectionInfo | null) => void) | null): void {
    if (this.elementSelector) {
      this.elementSelector.setOnHover(callback);
    }
  }

  /**
   * Debug element selector state
   */
  public debugElementSelectorState(): void {
    console.log('🎯 ==========================================');
    console.log('🎯 Element Selector Debug');
    console.log('🎯 ==========================================');
    console.log('🎯 Element selector exists:', !!this.elementSelector);
    
    if (this.elementSelector) {
      this.elementSelector.debugStats();
    }
    console.log('🎯 ==========================================');
  }

  // =========================================================================
  // AMBIENT OCCLUSION (GTAO)
  // =========================================================================

  // =========================================================================
  // NOTE: AMBIENT OCCLUSION (GTAO) WAS REMOVED
  // =========================================================================
  // 
  // We attempted to implement Screen-Space Ambient Occlusion (SSAO) using
  // Three.js GTAONode (Ground Truth Ambient Occlusion) for WebGPU.
  // 
  // WHY IT DOESN'T WORK:
  // --------------------
  // 1. Our WebGPU renderer uses MSAA (Multi-Sample Anti-Aliasing) with 
  //    `antialias: true` which creates multisampled depth textures.
  // 
  // 2. GTAONode's WGSL shader expects `texture_depth_2d` type for depth sampling,
  //    but the MSAA-enabled renderer provides `texture_depth_multisampled_2d`.
  // 
  // 3. The WGSL shader error was:
  //    "no matching call to textureDimensions(texture_depth_multisampled_2d, abstract-int)"
  //    The shader tried to call textureDimensions with 2 arguments on a multisampled
  //    texture, but multisampled textures only accept 1 argument.
  // 
  // 4. WGSL multisampled depth textures cannot be sampled directly - they require
  //    textureLoad() with explicit sample index, not texture sampling operations.
  // 
  // POTENTIAL SOLUTIONS (not implemented):
  // --------------------------------------
  // - Disable MSAA when AO is enabled (would lose anti-aliasing quality)
  // - Use a separate non-MSAA render pass for AO depth (complex, performance cost)
  // - Wait for Three.js to add MSAA-compatible GTAO
  // - Implement custom WGSL shader that handles multisampled depth
  // 
  // We chose to use Fog instead, which works at the scene level without
  // post-processing and is fully compatible with MSAA.
  // 
  // See: WebGPUAmbientOcclusion.ts for the original implementation attempt
  // =========================================================================

  // =========================================================================
  // FOG EFFECT
  // =========================================================================

  /**
   * Initialize the fog effect system
   */
  private initializeFog(): void {
    if (!this.proxyScene) {
      console.log('⚠️ Cannot initialize Fog: scene not ready');
      return;
    }
    
    if (this.fogManager) {
      this.fogManager.initialize(this.proxyScene);
      console.log('🌫️ Fog effect initialized (disabled by default)');
    }
  }

  /**
   * Enable or disable fog effect
   */
  public setFogEnabled(enabled: boolean): void {
    this.fogManager?.setEnabled(enabled);
  }

  /**
   * Check if fog is enabled
   */
  public isFogEnabled(): boolean {
    return this.fogManager?.isEnabled() ?? false;
  }

  /**
   * Set fog type (linear, exponential, exponential2)
   */
  public setFogType(type: FogType): void {
    this.fogManager?.setType(type);
  }

  /**
   * Set fog color
   * @param hexColor Hex color string (e.g., '#e0e8f0')
   */
  public setFogColor(hexColor: string): void {
    this.fogManager?.setColor(hexColor);
  }

  /**
   * Set fog density (for exponential fog)
   * @param density Density value (0.0001-0.1)
   */
  public setFogDensity(density: number): void {
    this.fogManager?.setDensity(density);
  }

  /**
   * Set fog near distance (for linear fog)
   */
  public setFogNear(near: number): void {
    this.fogManager?.setNear(near);
  }

  /**
   * Set fog far distance (for linear fog)
   */
  public setFogFar(far: number): void {
    this.fogManager?.setFar(far);
  }

  /**
   * Apply a fog preset
   */
  public applyFogPreset(preset: 'light' | 'medium' | 'heavy' | 'blue' | 'warm'): void {
    if (this.fogManager) {
      this.fogManager.applyPreset(preset);
    }
  }

  /**
   * Auto-configure fog based on model bounds
   */
  public autoConfigureFog(): void {
    if (!this.fogManager || !this.proxyScene) return;
    
    // Calculate scene bounding box
    const boundingBox = new THREE.Box3();
    this.proxyScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        obj.geometry.computeBoundingBox();
        if (obj.geometry.boundingBox) {
          boundingBox.expandByObject(obj);
        }
      }
    });
    
    if (!boundingBox.isEmpty()) {
      this.fogManager.autoConfigureFromBounds(boundingBox);
    }
  }

  /**
   * Get fog settings
   */
  public getFogSettings(): FogSettings | null {
    return this.fogManager?.getSettings() ?? null;
  }

  /**
   * Get the fog manager instance (for advanced usage)
   */
  public getFogManager(): WebGPUFog | null {
    return this.fogManager;
  }

  // =========================================================================
  // LEVEL OF DETAIL (LOD) SYSTEM
  // =========================================================================

  /**
   * Initialize the LOD system
   */
  private initializeLOD(): void {
    if (!this.proxyScene || !this.camera) {
      console.log('⚠️ Cannot initialize LOD: scene or camera not ready');
      return;
    }
    
    if (this.lodManager) {
      this.lodManager.initialize(this.proxyScene, this.camera);
      console.log('📐 LOD system initialized (disabled by default)');
    }
  }

  /**
   * Initialize the stats manager for performance monitoring
   */
  private initializeStatsManager(): void {
    if (!this.container || !this.statsManager) {
      console.log('⚠️ Cannot initialize stats manager: container not ready');
      return;
    }
    
    this.statsManager.initialize({
      container: this.container,
      getRenderer: () => this.webgpuRenderer,
      getCamera: () => this.camera,
      getScene: () => this.proxyScene,
      getSettings: () => ({
        frustumCullingEnabled: this.optimizations?.isFrustumCullingEnabled() ?? true,
        geometryMergingEnabled: this.optimizations?.isGeometryMergingEnabled() ?? true,
        shadowsEnabled: this.shadowManager.isShadowsEnabled(),
        edgesEnabled: this.edgeManager.isEdgesEnabled(),
        groundPlaneEnabled: this.shadowManager.isGroundPlaneEnabled(),
        hiddenCategories: this.hiddenCategories,
        currentToneMapping: this.currentToneMapping,
        lodEnabled: this.lodManager?.isEnabled() ?? false,
        shadowLight: this.shadowManager.getShadowLight(),
        mergedMeshes: this.optimizations?.getMergedMeshes() ?? [],
        lodManager: this.lodManager,
      }),
    });
    
    // Transfer GPU info if available
    if (this.gpuInfo && this.gpuInfo !== 'Unknown') {
      this.statsManager.setGPUInfo(this.gpuInfo);
    }
    
    // Set scene center for distance calculations
    this.statsManager.setSceneCenter(this.shadowManager.getSceneCenter());
    
    console.log('📊 Stats manager initialized');
  }

  /**
   * Enable or disable LOD system
   */
  public setLODEnabled(enabled: boolean): void {
    if (this.lodManager) {
      if (enabled && !this.lodManager.isInitialized()) {
        this.initializeLOD();
      }
      
      // Process scene to create LOD objects if enabling for first time
      if (enabled && this.lodManager.getStats().totalObjects === 0) {
        this.lodManager.processScene();
      }
      
      this.lodManager.setEnabled(enabled);
    }
  }

  /**
   * Check if LOD is enabled
   */
  public isLODEnabled(): boolean {
    return this.lodManager?.isEnabled() ?? false;
  }

  /**
   * Set LOD high distance threshold (full detail up to this distance)
   */
  public setLODHighDistance(distance: number): void {
    this.lodManager?.setHighDistance(distance);
  }

  /**
   * Set LOD medium distance threshold
   */
  public setLODMediumDistance(distance: number): void {
    this.lodManager?.setMediumDistance(distance);
  }

  /**
   * Set LOD low distance threshold
   */
  public setLODLowDistance(distance: number): void {
    this.lodManager?.setLowDistance(distance);
  }

  /**
   * Toggle impostor visibility (bounding boxes for very far objects)
   */
  public setLODShowImpostors(show: boolean): void {
    this.lodManager?.setShowImpostors(show);
  }

  /**
   * Get LOD statistics
   */
  public getLODStats(): LODStats | null {
    return this.lodManager?.getStats() ?? null;
  }

  /**
   * Get LOD settings
   */
  public getLODSettings(): LODSettings | null {
    return this.lodManager?.getSettings() ?? null;
  }

  /**
   * Refresh LOD (reprocess scene)
   */
  public refreshLOD(): void {
    if (this.lodManager?.isEnabled()) {
      this.lodManager?.refresh();
    }
  }

  /**
   * Get the LOD manager instance (for advanced usage)
   */
  public getLODManager(): WebGPULODManager | null {
    return this.lodManager;
  }

  // =========================================================================
  // PERFORMANCE OPTIMIZATION CONTROLS
  // =========================================================================

  /**
   * Enable or disable frustum culling optimization
   * When enabled, objects outside the camera view are hidden (not rendered)
   */
  public setFrustumCullingEnabled(enabled: boolean): void {
    this.optimizations?.setFrustumCullingEnabled(enabled);
    
    // If disabling, make all meshes visible again
    if (!enabled && this.proxyScene && this.optimizations) {
      this.optimizations.resetVisibility(this.proxyScene);
    }
  }

  /**
   * Get current frustum culling state
   */
  public isFrustumCullingEnabled(): boolean {
    return this.optimizations?.isFrustumCullingEnabled() ?? true;
  }

  /**
   * Enable or disable geometry merging optimization
   * When enabled, meshes with same material are merged to reduce draw calls
   * Note: This only affects newly loaded models, not existing ones
   */
  public setGeometryMergingEnabled(enabled: boolean): void {
    this.optimizations?.setGeometryMergingEnabled(enabled);
  }

  /**
   * Get current geometry merging state
   */
  public isGeometryMergingEnabled(): boolean {
    return this.optimizations?.isGeometryMergingEnabled() ?? true;
  }

  /**
   * Set shadow map resolution
   * Lower values = better performance but lower shadow quality
   * Common values: 512, 1024, 2048, 4096
   */
  public setShadowMapResolution(resolution: number): void {
    if (!this.proxyScene) return;
    this.shadowManager.setShadowMapResolution(this.proxyScene, resolution);
  }

  /**
   * Get current shadow map resolution
   */
  public getShadowMapResolution(): number {
    return this.shadowManager.getShadowMapResolution();
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
    const wasEdgesEnabled = this.edgeManager.isEdgesEnabled();
    const wasGroundPlaneEnabled = this.shadowManager.isGroundPlaneEnabled();
    
    // PERFORMANCE OPTIMIZATION: Don't dispose old resources until the new scene is ready.
    // This prevents the "empty screen" or "lost model" effect during long rebuilds.
    const oldGeometries = [...this.createdGeometries];
    const oldGroundPlane = this.shadowManager.getGroundPlane();
    const oldProxyScene = this.proxyScene;
    const oldEdgeLines = [...this.edgeManager.getEdgeLines()];
    
    // Reset tracking arrays for the NEW scene
    this.createdGeometries = [];
    this.modelGroups = [];
    this.edgeManager.clearEdgeLines(); // Clear this so createEdges() starts fresh
    this.meshCategoryMap.clear();
    
    // Reset builder tracking without disposing (old resources still in use)
    this.proxySceneBuilder.clear();
    
    // Reset color picker before building scene to clear old IDs
    if (this.colorPicker) {
      this.colorPicker.reset();
    }

    // Build new proxy scene (this also sets up ground plane via updateShadowBounds)
    if (!this.components) return;
    const result = await this.proxySceneBuilder.tryBuildProxySceneFromFragments(this.scene, this.components, {
      frustumCulling: this.optimizations?.isFrustumCullingEnabled() ?? true,
      shadows: this.shadowManager.isShadowsEnabled(),
      modelsVisible: this.modelsVisible,
      geometryMerging: this.optimizations?.isGeometryMergingEnabled() ?? true,
      colorPickingEnabled: this.colorPicker?.isEnabled() ?? true,
      colorPicker: this.colorPicker,
      elementSelector: this.elementSelector,
      ghostModeActive: this.ghostModeActive,
      getGhostMaterial: () => this.getOrCreateGhostMaterial(),
      colorSplashActive: this.colorSplashActive,
      colorSplashColors: this.colorSplashColors,
      hiddenCategories: this.hiddenCategories,
      hiddenElements: this.hiddenElements,
      isolatedElements: this.isolatedElements,
      slicerActive: this.slicerActive,
      slicerColors: this.slicerColors,
      setupShadowLight: (scene) => this.setupShadowLight(scene),
      updateShadowBounds: () => this.updateShadowBounds(),
    });
    
    if (result) {
      // Update proxy scene reference
      this.proxyScene = result.scene;
      this.proxySceneKind = result.kind;
      this.createdGeometries = this.proxySceneBuilder.createdGeometries;
      this.modelGroups = this.proxySceneBuilder.modelGroups;

      // Re-initialize managers with new scene
      this.initializeOutlineManager();
      this.initializeColorPicker();
      this.initializeFog();
      this.initializeLOD();

      // Dispose old proxy scene resources NOW that the new one is ready
      
      // Clean up old edges from the old scene
      if (oldProxyScene) {
        for (const line of oldEdgeLines) {
          oldProxyScene.remove(line);
          line.geometry.dispose();
          (line.material as THREE.Material).dispose();
        }
      }
      
      for (const geo of oldGeometries) {
        geo.dispose();
      }
      
      // Update optimizations with new merged meshes
      this.optimizations?.setMergedMeshes(this.proxySceneBuilder.mergedMeshes);
      
      if (oldGroundPlane && oldGroundPlane !== this.shadowManager.getGroundPlane()) {
        oldGroundPlane.geometry.dispose();
        (oldGroundPlane.material as THREE.Material).dispose();
      }
      
      // Restore edges
      if (wasEdgesEnabled) {
        await this.createEdges();
      }
      
      // Re-attach cluster group if active
      if (this.clusterGroup && this.proxyScene) {
        this.proxyScene.add(this.clusterGroup);
      }
      
      console.log('✅ WebGPU proxy scene rebuilt');
    } else {
      // If failed, restore the old geometries to the tracking array so they can be disposed later
      this.createdGeometries = oldGeometries;
      console.error('❌ Failed to rebuild WebGPU proxy scene');
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
   * Dispose proxy scene
   */
  private disposeProxyScene(): void {
    if (this.proxySceneBuilder) {
      this.proxySceneBuilder.dispose();
    }

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
        // Opaque canvas prevents accumulation/trail artifacts while moving camera.
        // We don't need transparency because the WebGL canvas above is opacity:0.
        alpha: false,
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

      // Be explicit about clearing behavior (WebGPU can otherwise look like it "smears"
      // when the camera moves if the frame isn't fully cleared).
      try {
        this.webgpuRenderer.autoClear = true;
        this.webgpuRenderer.autoClearColor = true;
        this.webgpuRenderer.autoClearDepth = true;
        this.webgpuRenderer.autoClearStencil = true;
      } catch {
        // Some properties may not exist depending on three/webgpu version.
      }

      // Tone mapping for better color/brightness balance
      // Neutral tone mapping provides a more accurate color representation
      this.webgpuRenderer.toneMapping = THREE.NeutralToneMapping;
      this.webgpuRenderer.toneMappingExposure = 1.0;

      // Enable shadow mapping
      if (this.shadowManager.isShadowsEnabled()) {
        this.webgpuRenderer.shadowMap.enabled = true;
        this.webgpuRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }

      // Initialize GPU color picker BEFORE proxy scene is built
      // This allows elements to be registered during geometry creation
      if (this.colorPicker?.isEnabled()) {
        // Already instantiated in constructor, will be initialized after proxy scene is ready
      }
      
      // Create proxy scene with compatible materials
      await this.createProxyScene(this.scene);

      // Enable local clipping for section planes - MUST be set for material clipping to work
      this.webgpuRenderer.localClippingEnabled = true;
      console.log('✂️ WebGPU local clipping enabled');

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
      
      // Setup model load listener to update proxy scene when new models are added
      this.setupModelLoadListener();

      // Initialize Color Picker (CRITICAL: Must be initialized before OutlineManager)
      this.initializeColorPicker();

      // Initialize outline/selection highlighting
      this.initializeOutlineManager();

      // Initialize Fog effect
      this.initializeFog();

      // Initialize LOD system
      this.initializeLOD();

      // Initialize stats manager for performance monitoring
      this.initializeStatsManager();

      // NOTE: Ambient Occlusion initialization removed - see comment in FOG EFFECT section

      // Sectioning is NOT supported in WebGPU mode (ClippingGroup has compatibility issues)
      // Section manager initialization removed

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

    // Dispose material factory (MUST be before renderer disposal to avoid usedTimes error)
    if (this.materialFactory) {
      this.materialFactory.dispose();
    }

    // Dispose managers that have materials
    if (this.edgeManager) {
      this.edgeManager.dispose();
    }
    if (this.outlineManager) {
      this.outlineManager.dispose();
    }
    if (this.elementSelector) {
      this.elementSelector.dispose();
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

    // Remove selection event listeners
    if (this.selectionEventTarget) {
      if (this.selectionClickHandler) {
        this.selectionEventTarget.removeEventListener('pointerup', this.selectionClickHandler as EventListener, { capture: true });
      }
      if (this.selectionPointerDownHandler) {
        this.selectionEventTarget.removeEventListener('pointerdown', this.selectionPointerDownHandler as EventListener, { capture: true });
      }
    }
    if (this.selectionEscHandler) {
      window.removeEventListener('keydown', this.selectionEscHandler);
    }
    this.selectionClickHandler = null;
    this.selectionPointerDownHandler = null;
    this.selectionEscHandler = null;
    this.selectionEventTarget = null;
    this.elementSelectionHandlersSet = false;

    // Dispose color picker
    if (this.colorPicker) {
      this.colorPicker.dispose();
    }

    // Dispose element selector
    if (this.elementSelector) {
      this.elementSelector.dispose();
    }

    // Dispose fog
    if (this.fogManager) {
      this.fogManager.dispose();
    }

    // Dispose LOD
    if (this.lodManager) {
      this.lodManager.dispose();
    }

    // Dispose stats manager
    if (this.statsManager) {
      this.statsManager.dispose();
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
    
    // Remove model load listener
    this.removeModelLoadListener();
    
    // Dispose outline manager
    if (this.outlineManager) {
      this.outlineManager.dispose();
    }
    
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

      // Track frame time for stats - use stats manager if available
      if (this.statsManager) {
        this.statsManager.updateFrame(currentTime);
      }

      // Update camera world matrix before rendering.
      // OrbitControls modifies camera position/rotation, but we need to
      // ensure the world matrix is current for accurate rendering.
      this.camera.updateMatrixWorld();
      
      // Check if camera has moved significantly
      const cameraMoved = this.optimizations?.hasCameraMoved(this.camera) ?? true;
      
      // Ensure cluster group is in the scene if it exists
      // We do this before frustum culling so cluster meshes are correctly handled
      if (this.clusterGroup && this.proxyScene) {
        if (this.clusterGroup.parent !== this.proxyScene) {
          this.proxyScene.add(this.clusterGroup);
          console.log('🔷 WebGPU: Cluster group attached to proxy scene');
        }
        
        // Force visibility and update matrix world for clusters
        this.clusterGroup.visible = true;
        this.clusterGroup.renderOrder = 1000;
        
        // Ensure scale is correct (in case animation is stuck or hasn't started)
        if (this.clusterGroup.scale.x < 0.1) {
          // If it's very small, it might be the start of an animation or a bug
          // We'll let the animation handle it, but if it stays small for many frames, 
          // that would be a problem.
        }
        
        this.clusterGroup.updateMatrixWorld(true);
        
        // Debug: Log first child info occasionally
        if (this.frameCount % 120 === 0 && this.clusterGroup.children.length > 0) {
          const firstChild = this.clusterGroup.children[0];
          console.log('📊 WebGPU Cluster Debug:', {
            children: this.clusterGroup.children.length,
            visible: this.clusterGroup.visible,
            scale: this.clusterGroup.scale.x.toFixed(2),
            firstChildPos: firstChild.position.toArray().map(v => v.toFixed(2))
          });
        }
      }
      
      // Apply frustum culling for performance
      // Sectioning not supported in WebGPU mode, so no need to bypass culling
      if (cameraMoved && this.optimizations && this.proxyScene && this.camera) {
        this.optimizations.performFrustumCulling(this.proxyScene, this.camera);
      }
      
      // Only update shadow map when needed (static scene optimization)
      this.shadowManager.updateShadowMap(cameraMoved);

      // Render the proxy scene
      try {
        // Force full clear every frame to avoid camera-motion artifacts.
        if (typeof this.webgpuRenderer.clear === 'function') {
          this.webgpuRenderer.clear();
        }
        
        // Update LOD based on camera distance - pass current camera to ensure fresh reference
        if (this.lodManager && this.camera) {
          this.lodManager.update(this.camera);
        }
        
        // Standard render (AO was removed - see FOG EFFECT section comment)
        this.webgpuRenderer.render(this.proxyScene, this.camera);

        // Render element selection overlay (shader-based individual element highlighting)
        if (this.elementSelector) {
          this.elementSelector.render(this.webgpuRenderer);
        }
      } catch (e) {
        console.error("Render error", e);
      }

      // Continue loop
      this.animationFrameId = requestAnimationFrame(render);
    };

    render();
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
   * Setup listener for new model loads to update proxy scene
   */
  private setupModelLoadListener(): void {
    if (!this.components) return;
    
    try {
      this.fragmentsManager = this.components.get(OBC.FragmentsManager);
      if (!this.fragmentsManager) return;
      
      // Track currently known models
      this.knownModelIds.clear();
      for (const [modelId] of this.fragmentsManager.list) {
        this.knownModelIds.add(modelId);
      }
      
      // Listen for new models
      this.modelLoadListener = this.fragmentsManager.list.onItemSet.add(async ({ key: modelId }: any) => {
        // Check if this is a new model we haven't seen
        if (!this.knownModelIds.has(modelId)) {
          console.log('🆕 WebGPU: New model detected, rebuilding proxy scene...', modelId);
          this.knownModelIds.add(modelId);
          
          // Wait a bit for model geometry to fully load
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Rebuild proxy scene to include new model
          if (this.isActive) {
            await this.rebuildProxyScene();
          }
        }
      });
      
      console.log('✅ WebGPU model load listener setup');
    } catch (e) {
      console.warn('⚠️ Could not setup model load listener:', e);
    }
  }

  /**
   * Remove model load listener
   */
  private removeModelLoadListener(): void {
    if (this.modelLoadListener && this.fragmentsManager) {
      try {
        this.fragmentsManager.list.onItemSet.remove(this.modelLoadListener);
      } catch (e) {
        // Ignore cleanup errors
      }
      this.modelLoadListener = null;
    }
    this.fragmentsManager = null;
    this.knownModelIds.clear();
  }

  /**
   * Set clipping planes - NOT SUPPORTED in WebGPU mode
   * 
   * WebGPU ClippingGroup has compatibility issues:
   * - LineBasicMaterial (edge lines) don't clip
   * - Material-level clipping causes camera-space artifacts
   * - Complex workarounds still don't work reliably
   * 
   * This method is a no-op stub. Sectioning is disabled in WebGPU mode.
   */
  public setClippingPlanes(_planes: THREE.Plane[]): void {
    console.warn('⚠️ Sectioning/clipping is not supported in WebGPU mode');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION PLANES API (NOT SUPPORTED IN WEBGPU MODE)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sectioning is NOT SUPPORTED in WebGPU mode.
   * ClippingGroup has compatibility issues with edge lines and materials.
   * Use WebGL mode for sectioning functionality.
   */
  
  /** @deprecated Sectioning not supported in WebGPU mode */
  public getSectionManager(): null {
    console.warn('⚠️ Sectioning is not supported in WebGPU mode');
    return null;
  }

  /** @deprecated Sectioning not supported in WebGPU mode */
  public createXAxisSectionPlane(): string {
    console.warn('⚠️ Sectioning is not supported in WebGPU mode');
    return '';
  }

  /** @deprecated Sectioning not supported in WebGPU mode */
  public createYAxisSectionPlane(): string {
    console.warn('⚠️ Sectioning is not supported in WebGPU mode');
    return '';
  }

  /** @deprecated Sectioning not supported in WebGPU mode */
  public createZAxisSectionPlane(): string {
    console.warn('⚠️ Sectioning is not supported in WebGPU mode');
    return '';
  }

  /** @deprecated Sectioning not supported in WebGPU mode */
  public deleteAllSectionPlanes(): void {
    console.warn('⚠️ Sectioning is not supported in WebGPU mode');
  }

  /** @deprecated Sectioning not supported in WebGPU mode */
  public flipSectionPlanes(): void {
    console.warn('⚠️ Sectioning is not supported in WebGPU mode');
  }

  /** @deprecated Sectioning not supported in WebGPU mode */
  public toggleSectionPlanesVisibility(): void {
    console.warn('⚠️ Sectioning is not supported in WebGPU mode');
  }

  /** @deprecated Sectioning not supported in WebGPU mode */
  public toggleSectionPlanesEnabled(): void {
    console.warn('⚠️ Sectioning is not supported in WebGPU mode');
  }

  /** @deprecated Sectioning not supported in WebGPU mode */
  public setSectionModeEnabled(_enabled: boolean): void {
    console.warn('⚠️ Sectioning is not supported in WebGPU mode');
  }

  /** Sectioning is not supported in WebGPU mode - always returns false */
  public isSectionModeEnabled(): boolean {
    return false;
  }

  /** Sectioning is not supported in WebGPU mode - always returns 0 */
  public getSectionPlaneCount(): number {
    return 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get scene center for positioning
   */
  private getSceneCenter(): THREE.Vector3 {
    const center = new THREE.Vector3();
    
    if (this.proxyScene) {
      const box = new THREE.Box3();
      let meshCount = 0;
      this.proxyScene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry && 
            obj.name !== 'webgpu-ground-plane') {
          obj.geometry.computeBoundingBox();
          if (obj.geometry.boundingBox) {
            const meshBox = obj.geometry.boundingBox.clone();
            meshBox.applyMatrix4(obj.matrixWorld);
            box.union(meshBox);
            meshCount++;
          }
        }
      });
      
      if (!box.isEmpty()) {
        box.getCenter(center);
      }
    }
    
    return center;
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
   * Note: Uses WebGPUStatsManager for modular stats handling when available
   */
  public setStatsEnabled(enabled: boolean): void {
    this.statsManager?.setEnabled(enabled);
  }

  /**
   * Check if stats are enabled
   */
  public isStatsEnabled(): boolean {
    return this.statsManager?.isEnabled() ?? false;
  }

  /**
   * Create the stats overlay element
   */
  // Stats overlay methods removed - now handled by WebGPUStatsManager

  // Stats display methods removed - now handled by WebGPUStatsManager
  
  // Battery status method removed - now handled by WebGPUStatsManager

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
            this.gpuInfo = info.description || info.device || info.vendor || 'WebGPU Adapter';
            console.log('🎮 GPU detected:', this.gpuInfo);
            this.statsManager?.setGPUInfo(this.gpuInfo);
          }
        }
      }
    } catch (e) {
      console.warn('Could not get GPU info:', e);
      this.gpuInfo = 'WebGPU Adapter';
    }
  }

  // Scene counting methods removed - now handled by WebGPUStatsManager
}
