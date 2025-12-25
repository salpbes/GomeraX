/**
 * IFC Viewer Application
 * 
 * Main application class that orchestrates all modules:
 * - WorldManager: Handles the 3D scene setup
 * - IFCLoaderModule: Manages IFC file loading and conversion
 * - UIManager: Provides user interface controls
 * - PerformanceMonitor: Tracks performance metrics
 * - PropertiesPanelModule: Handles entity selection and properties display
 * 
 * This is the entry point that brings everything together.
 */

import { 
  WorldManager, 
  ViewCubeModule, 
  ClipperModule, 
  ClipStylerModule, 
  MeasurementModule, 
  FloorPlanModule, 
  MinimapModule, 
  AdaptiveQualityController,
  ModelTransformModule,
  SpaceVisibilityModule,
  FirstPersonControlsModule,
  ClusterModule,
  ColorSplashModule
} from './modules/webgl';
import { IFCLoaderModule } from './modules/core/IFCLoaderModule';
import { UIManager } from './modules/UIManager';
import { PerformanceMonitor } from './modules/core/PerformanceMonitor';
import { PropertiesPanelModule } from './modules/core/PropertiesPanelModule';
import { WebGPURendererModule } from './modules/webgpu';
import * as OBC from '@thatopen/components';
import * as THREE from 'three';

export class IFCViewer {
  private worldManager: WorldManager;
  private ifcLoader: IFCLoaderModule;
  private uiManager: UIManager | null = null;
  private performanceMonitor: PerformanceMonitor | null = null;
  private modelTransform: ModelTransformModule | null = null;
  private propertiesPanel: PropertiesPanelModule | null = null;
  private spaceVisibility: SpaceVisibilityModule | null = null;
  private viewCube: ViewCubeModule | null = null;
  private clipper: ClipperModule | null = null;
  private clipStyler: ClipStylerModule | null = null;
  private firstPersonControls: FirstPersonControlsModule | null = null;
  private measurement: MeasurementModule | null = null;
  private floorPlan: FloorPlanModule | null = null;
  private minimap: MinimapModule | null = null;
  private cluster: ClusterModule | null = null;
  private colorSplash: ColorSplashModule | null = null;
  private adaptiveQuality: AdaptiveQualityController | null = null;
  private webgpuRenderer: WebGPURendererModule | null = null;
  private container: HTMLElement | null = null;

  constructor() {
    // Initialize the world manager first (foundation of the viewer)
    this.worldManager = new WorldManager();
    
    // Initialize the IFC loader (depends on world manager)
    this.ifcLoader = new IFCLoaderModule(this.worldManager);
  }

  /**
   * Initializes and starts the IFC viewer application
   * @param containerId - ID of the HTML element to render the 3D scene
   * @param enablePerformanceMonitor - Whether to show performance stats
   */
  public async initialize(
    containerId: string = 'container',
    enablePerformanceMonitor: boolean = true
  ): Promise<void> {
    console.log('🚀 Initializing IFC Viewer...');

    try {
      // Get the container element
      const container = document.getElementById(containerId);
      if (!container) {
        throw new Error(`Container element with id "${containerId}" not found`);
      }

      // Step 1: Create the 3D world
      console.log('📐 Creating 3D world...');
      const world = await this.worldManager.createWorld(container);
      this.container = container;

      // Step 1.5: Initialize WebGPU module (experimental)
      console.log('🎮 Initializing WebGPU module...');
      this.webgpuRenderer = new WebGPURendererModule();

      // Step 2: Initialize the IFC loader
      console.log('📦 Initializing IFC loader...');
      await this.ifcLoader.initialize(world);

      // Step 2.5: Initialize model transform utilities
      console.log('📐 Initializing model transform utilities...');
      const components = this.worldManager.getComponents();
      const fragments = components.get(OBC.FragmentsManager);
      this.modelTransform = new ModelTransformModule(components, fragments, world);

      // Step 3.5: Setup properties panel first (needed by UIManager)
      console.log('📋 Initializing properties panel...');
      this.propertiesPanel = new PropertiesPanelModule(this.worldManager, this.ifcLoader);
      await this.propertiesPanel.initialize(world);

      // Connect WebGPU renderer to properties panel for visibility syncing
      if (this.webgpuRenderer) {
        this.propertiesPanel.setWebGPURenderer(this.webgpuRenderer);
      }

      // Create and add properties panel UI
      const propertiesPanelElement = this.propertiesPanel.createPanel();
      document.body.appendChild(propertiesPanelElement);

      // Step 4: Setup UI (now with properties panel reference)
      console.log('🎨 Setting up user interface...');
      this.uiManager = new UIManager(
        this.worldManager, 
        this.ifcLoader, 
        this.modelTransform,
        this, // Pass the viewer instance so UIManager can access all modules
        this.propertiesPanel // Pass properties panel for storey data
      );
      this.uiManager.initialize();

      // Step 4.5: Initialize space visibility module
      console.log('🏢 Initializing space visibility module...');
      this.spaceVisibility = new SpaceVisibilityModule(this.worldManager);
      await this.spaceVisibility.initialize();

      // Step 4.6: Initialize view cube
      console.log('🧊 Initializing view cube...');
      this.viewCube = new ViewCubeModule(this.worldManager);
      await this.viewCube.initialize(world, container);

      // Step 4.6: Initialize clipper for sectioning
      console.log('✂️ Initializing clipper...');
      this.clipper = new ClipperModule(this.worldManager);
      await this.clipper.initialize(world, container);

      // Step 4.6a: Initialize ClipStyler for section hatches
      console.log('🎨 Initializing section hatches...');
      this.clipStyler = new ClipStylerModule(this.worldManager);
      const clipperComponent = this.worldManager.getComponents().get(OBC.Clipper);
      await this.clipStyler.initialize(world, clipperComponent);

      // Connect ClipStyler to Clipper for raycast exclusion
      this.clipper.setClipStylerModule(this.clipStyler);

      // Step 4.7: Initialize first person controls
      console.log('🎮 Initializing first person controls...');
      this.firstPersonControls = new FirstPersonControlsModule();
      this.firstPersonControls.initialize(world, components.get(OBC.FragmentsManager), components);

      // Step 4.8: Initialize measurement module
      console.log('📏 Initializing measurement module...');
      this.measurement = new MeasurementModule(this.worldManager);
      await this.measurement.initialize(world, container);

      // Pass clipper reference to measurement module so it can disable clipper when active
      if (this.clipper) {
        this.measurement.setClipperModule(this.clipper);
      }

      // Pass measurement module to UI handlers
      if (this.uiManager) {
        this.uiManager.setMeasurementModule(this.measurement);
      }

      // Step 4.9: Initialize floor plan module
      console.log('🗺️ Initializing floor plan module...');
      this.floorPlan = new FloorPlanModule(components, world);

      // Pass floor plan module to UI manager
      if (this.uiManager) {
        this.uiManager.setFloorPlanModule(this.floorPlan);
      }

      // Step 4.10: Initialize minimap module
      console.log('🗺️ Initializing minimap module...');
      this.minimap = new MinimapModule(components, world, this.floorPlan);
      await this.minimap.initialize();

      // Pass minimap module to UI manager
      if (this.uiManager) {
        this.uiManager.setMinimapModule(this.minimap);
      }

      // Step 4.11: Initialize cluster module
      console.log('🔷 Initializing cluster module...');
      this.cluster = new ClusterModule(this.worldManager);
      await this.cluster.initialize();
      
      // Pass WebGPU renderer to cluster module
      if (this.webgpuRenderer) {
        this.cluster.setWebGPURenderer(this.webgpuRenderer);
      }

      // Pass cluster module to UI manager and properties panel
      if (this.uiManager) {
        this.uiManager.setClusterModule(this.cluster);
      }
      if (this.propertiesPanel) {
        this.propertiesPanel.setClusterModule(this.cluster);
      }
      if (this.modelTransform) {
        this.cluster.setModelTransform(this.modelTransform);
      }
      // Pass clipper module to cluster so it can disable sectioning in cluster mode
      if (this.clipper) {
        this.cluster.setClipperModule(this.clipper);
      }

      // Step 4.12: Initialize color splash module
      console.log('🎨 Initializing color splash module...');
      this.colorSplash = new ColorSplashModule(this.worldManager);
      
      // Pass WebGPU renderer to color splash module
      if (this.webgpuRenderer) {
        this.colorSplash.setWebGPURenderer(this.webgpuRenderer);
      }

      // Pass color splash module to UI manager
      if (this.uiManager) {
        this.uiManager.setColorSplashModule(this.colorSplash);
      }

      // Setup callback to update collision meshes when models are loaded
      this.ifcLoader.setModelLoadedCallback(async () => {
        console.log('🔄 Updating collision meshes after model load...');
        await this.firstPersonControls?.updateCollisionMeshes();
      });
      
      // Setup callback to show coordinate warning for far-origin models
      this.ifcLoader.setOnCoordinateWarning(() => {
        console.log('⚠️ Showing far-origin model warning...');
        this.uiManager?.showCoordinateWarning();
      });
      
      // Setup callback to show alignment option for multiple far-origin models
      this.ifcLoader.setOnAlignmentNeeded((modelId: string) => {
        console.log(`📍 Showing alignment option for model: ${modelId}`);
        this.uiManager?.showAlignmentNeeded(modelId);
      });

      // Step 5: Setup performance monitoring (optional)
      if (enablePerformanceMonitor) {
        console.log('📊 Initializing performance monitor...');
        this.performanceMonitor = new PerformanceMonitor(this.worldManager);
        this.performanceMonitor.initialize();
      }

      // Step 5.5: Initialize Adaptive Quality Controller
      if (this.performanceMonitor) {
        console.log('🎯 Initializing Adaptive Quality Controller...');
        this.adaptiveQuality = new AdaptiveQualityController(
          this.performanceMonitor,
          this.worldManager,
          this.clipStyler || undefined
        );
        // Enable by default for optimal performance
        this.adaptiveQuality.enable();
        console.log('✅ Adaptive Quality enabled (auto-adjusts based on FPS)');
      }

      console.log('✅ IFC Viewer initialized successfully!');
      console.log('📂 Ready to load IFC files');
      
      // Expose for debugging
      (window as any).viewer = this;
      (window as any).world = world;
      console.log('🐛 Debug: window.viewer and window.world exposed for console access');
    } catch (error) {
      console.error('❌ Failed to initialize IFC Viewer:', error);
      throw error;
    }
  }

  /**
   * Loads an IFC file into the viewer
   * @param source - URL string or File object
   */
  public async loadIFC(source: string | File): Promise<void> {
    await this.ifcLoader.loadIFC(source);
  }

  /**
   * Loads a Fragments file into the viewer
   * @param source - URL string or File object
   */
  public async loadFragments(source: string | File): Promise<void> {
    await this.ifcLoader.loadFragments(source);
  }

  /**
   * Gets the world manager instance
   */
  public getWorldManager(): WorldManager {
    return this.worldManager;
  }

  /**
   * Gets the IFC loader instance
   */
  public getIFCLoader(): IFCLoaderModule {
    return this.ifcLoader;
  }

  /**
   * Gets the model transform instance
   */
  public getModelTransform(): ModelTransformModule | null {
    return this.modelTransform;
  }

  /**
   * Gets the space visibility instance
   */
  public getSpaceVisibility(): SpaceVisibilityModule | null {
    return this.spaceVisibility;
  }

  /**
   * Gets the clipper instance
   */
  public getClipper(): ClipperModule | null {
    return this.clipper;
  }

  /**
   * Gets the clip styler instance (section hatches)
   */
  public getClipStyler(): ClipStylerModule | null {
    return this.clipStyler;
  }

  /**
   * Gets the first person controls instance
   */
  public getFirstPersonControls(): FirstPersonControlsModule | null {
    return this.firstPersonControls;
  }

  /**
   * Gets the measurement module instance
   */
  public getMeasurement(): MeasurementModule | null {
    return this.measurement;
  }

  /**
   * Gets the minimap module instance
   */
  public getMinimap(): MinimapModule | null {
    return this.minimap;
  }

  /**
   * Gets the color splash module instance
   */
  public getColorSplash(): ColorSplashModule | null {
    return this.colorSplash;
  }

  /**
   * Gets the adaptive quality controller instance
   */
  public getAdaptiveQuality(): AdaptiveQualityController | null {
    return this.adaptiveQuality;
  }

  /**
   * Gets the WebGPU renderer module instance
   */
  public getWebGPURenderer(): WebGPURendererModule | null {
    return this.webgpuRenderer;
  }

  /**
   * Toggle WebGPU rendering mode (experimental)
   * @param force - Optional force state (true to enable, false to disable)
   * @returns Whether the operation was successful
   */
  public async toggleWebGPU(force?: boolean): Promise<boolean> {
    if (!this.webgpuRenderer || !this.worldManager.world || !this.container) {
      console.warn('⚠️ WebGPU toggle: Missing required components');
      return false;
    }

    const currentlyEnabled = this.webgpuRenderer.isEnabled();
    const targetState = force !== undefined ? force : !currentlyEnabled;

    if (!targetState) {
      // Disabling WebGPU
      if (currentlyEnabled) {
        this.webgpuRenderer.disable();
      }
      return true; // Successfully disabled (or already disabled)
    } else {
      // Enabling WebGPU
      if (currentlyEnabled) return true; // Already enabled
      
      const success = await this.webgpuRenderer.enable(
        this.worldManager.world,
        this.container,
        this.worldManager.getComponents()
      );
      return success;
    }
  }

  /**
   * Check if WebGPU is supported
   */
  public async checkWebGPUSupport(): Promise<{ available: boolean; reason?: string }> {
    return WebGPURendererModule.checkWebGPUSupport();
  }

  /**
   * Check if WebGPU mode is currently active
   */
  public isWebGPUEnabled(): boolean {
    return this.webgpuRenderer?.isEnabled() || false;
  }

  /**
   * Check if WebGPU renderer is currently active (alias for isWebGPUEnabled)
   */
  public isWebGPUActive(): boolean {
    return this.webgpuRenderer?.isWebGPUActive() || false;
  }

  /**
   * Set WebGPU tone mapping type
   * @param type - THREE.ToneMapping value (0=None, 1=Linear, 2=Reinhard, 3=Cineon, 4=ACESFilmic, 6=AgX, 7=Neutral)
   */
  public setWebGPUToneMapping(type: number): void {
    this.webgpuRenderer?.setToneMapping(type as THREE.ToneMapping);
  }

  /**
   * Set WebGPU exposure level
   * @param value - Exposure value (default 1.0, range 0.1-3.0)
   */
  public setWebGPUExposure(value: number): void {
    this.webgpuRenderer?.setExposure(value);
  }

  /**
   * Enable or disable WebGPU shadows
   */
  public setWebGPUShadows(enabled: boolean): void {
    this.webgpuRenderer?.setShadowsEnabled(enabled);
  }

  /**
   * Set WebGPU shadow angle (sun direction)
   * @param angle - Angle in degrees (0-360). 0=North, 90=East, 180=South, 270=West
   */
  public setWebGPUShadowAngle(angle: number): void {
    this.webgpuRenderer?.setShadowAngle(angle);
  }

  /**
   * Set WebGPU shadow elevation (sun height)
   * @param elevation - Angle in degrees (10-90). Higher = more overhead
   */
  public setWebGPUShadowElevation(elevation: number): void {
    this.webgpuRenderer?.setShadowElevation(elevation);
  }

  /**
   * Enable or disable WebGPU ground plane
   */
  public setWebGPUGroundPlane(enabled: boolean): void {
    this.webgpuRenderer?.setGroundPlaneEnabled(enabled);
  }

  /**
   * Enable or disable WebGPU edge/outline rendering
   */
  public setWebGPUEdges(enabled: boolean): void {
    this.webgpuRenderer?.setEdgesEnabled(enabled);
  }

  /**
   * Set WebGPU edge detection threshold (in degrees)
   */
  public setWebGPUEdgeThreshold(degrees: number): void {
    this.webgpuRenderer?.setEdgeThreshold(degrees);
  }

  /**
   * Enable or disable WebGPU performance stats overlay
   */
  public setWebGPUStats(enabled: boolean): void {
    this.webgpuRenderer?.setStatsEnabled(enabled);
  }

  /**
   * Enable or disable frustum culling optimization
   */
  public setWebGPUFrustumCulling(enabled: boolean): void {
    this.webgpuRenderer?.setFrustumCullingEnabled(enabled);
  }

  /**
   * Enable or disable outline/selection highlighting
   */
  public setWebGPUOutlineEnabled(enabled: boolean): void {
    this.webgpuRenderer?.setOutlineEnabled(enabled);
  }

  /**
   * Enable or disable hover highlighting
   */
  public setWebGPUOutlineHoverEnabled(enabled: boolean): void {
    this.webgpuRenderer?.setOutlineHoverEnabled(enabled);
  }

  /**
   * Set outline thickness (0.01 - 0.2)
   */
  public setWebGPUOutlineThickness(thickness: number): void {
    this.webgpuRenderer?.setOutlineThickness(thickness);
  }

  /**
   * Set selection outline color
   */
  public setWebGPUOutlineSelectionColor(color: number | string): void {
    this.webgpuRenderer?.setOutlineSelectionColor(color);
  }

  /**
   * Set hover outline color
   */
  public setWebGPUOutlineHoverColor(color: number | string): void {
    this.webgpuRenderer?.setOutlineHoverColor(color);
  }

  /**
   * Clear all current selections in WebGPU mode
   */
  public clearWebGPUSelection(): void {
    this.webgpuRenderer?.clearOutlineSelection();
  }

  /**
   * Debug WebGPU outline/selection state - use from browser console
   */
  public debugWebGPUOutline(): void {
    this.webgpuRenderer?.debugOutlineState();
  }

  /**
   * Set visibility for specific elements in WebGPU mode
   */
  public setWebGPUElementVisibility(modelId: string, localIds: number[], visible: boolean): void {
    this.webgpuRenderer?.setElementVisibility(modelId, localIds, visible);
  }

  /**
   * Isolate specific elements in WebGPU mode
   */
  public isolateWebGPUElements(modelId: string, localIds: number[]): void {
    this.webgpuRenderer?.isolateElements(modelId, localIds);
  }

  /**
   * Show all elements in WebGPU mode
   */
  public showAllWebGPUElements(): void {
    this.webgpuRenderer?.showAllElements();
  }

  /**
   * Set shadow map resolution for quality/performance trade-off
   */
  public setWebGPUShadowQuality(resolution: number): void {
    this.webgpuRenderer?.setShadowMapResolution(resolution);
  }

  /**
   * Apply a performance preset (low, medium, high)
   */
  public applyWebGPUPerformancePreset(preset: 'low' | 'medium' | 'high'): void {
    this.webgpuRenderer?.applyPerformancePreset(preset);
  }

  /**
   * Set WebGPU space visibility (hide/show IFCSPACE elements)
   */
  public async setWebGPUSpacesVisible(visible: boolean): Promise<void> {
    await this.webgpuRenderer?.setSpacesVisible(visible);
  }

  /**
   * Check if WebGPU spaces are visible
   */
  public areWebGPUSpacesVisible(): boolean {
    return this.webgpuRenderer?.areSpacesVisible() ?? true;
  }

  // =========================================================================
  // FOG EFFECT
  // =========================================================================

  /**
   * Enable or disable fog effect in WebGPU mode
   */
  public setWebGPUFogEnabled(enabled: boolean): void {
    this.webgpuRenderer?.setFogEnabled(enabled);
  }

  /**
   * Check if fog is enabled
   */
  public isWebGPUFogEnabled(): boolean {
    return this.webgpuRenderer?.isFogEnabled() ?? false;
  }

  /**
   * Set fog type (linear, exponential, exponential2)
   */
  public setWebGPUFogType(type: 'linear' | 'exponential' | 'exponential2'): void {
    this.webgpuRenderer?.setFogType(type);
  }

  /**
   * Set fog color
   */
  public setWebGPUFogColor(hexColor: string): void {
    this.webgpuRenderer?.setFogColor(hexColor);
  }

  /**
   * Set fog density (for exponential fog types)
   */
  public setWebGPUFogDensity(density: number): void {
    this.webgpuRenderer?.setFogDensity(density);
  }

  /**
   * Set fog near distance (for linear fog)
   */
  public setWebGPUFogNear(near: number): void {
    this.webgpuRenderer?.setFogNear(near);
  }

  /**
   * Set fog far distance (for linear fog)
   */
  public setWebGPUFogFar(far: number): void {
    this.webgpuRenderer?.setFogFar(far);
  }

  /**
   * Apply a fog preset
   */
  public applyWebGPUFogPreset(preset: 'light' | 'medium' | 'heavy' | 'blue' | 'warm'): void {
    this.webgpuRenderer?.applyFogPreset(preset);
  }

  /**
   * Auto-configure fog based on model bounds
   */
  public autoConfigureWebGPUFog(): void {
    this.webgpuRenderer?.autoConfigureFog();
  }

  // =========================================================================
  // LEVEL OF DETAIL (LOD)
  // =========================================================================

  /**
   * Enable or disable LOD system in WebGPU mode
   */
  public setWebGPULODEnabled(enabled: boolean): void {
    this.webgpuRenderer?.setLODEnabled(enabled);
  }

  /**
   * Check if LOD is enabled
   */
  public isWebGPULODEnabled(): boolean {
    return this.webgpuRenderer?.isLODEnabled() ?? false;
  }

  /**
   * Set LOD high distance (full detail up to this distance)
   */
  public setWebGPULODHighDistance(distance: number): void {
    this.webgpuRenderer?.setLODHighDistance(distance);
  }

  /**
   * Set LOD medium distance threshold
   */
  public setWebGPULODMediumDistance(distance: number): void {
    this.webgpuRenderer?.setLODMediumDistance(distance);
  }

  /**
   * Set LOD low distance threshold
   */
  public setWebGPULODLowDistance(distance: number): void {
    this.webgpuRenderer?.setLODLowDistance(distance);
  }

  /**
   * Toggle impostor visibility (bounding boxes for very far objects)
   */
  public setWebGPULODShowImpostors(show: boolean): void {
    this.webgpuRenderer?.setLODShowImpostors(show);
  }

  /**
   * Get LOD statistics
   */
  public getWebGPULODStats(): { 
    totalObjects: number; 
    fullDetail: number;
    simplified: number;
    impostor: number;
    trianglesSaved: number;
    originalTriangles: number;
    currentTriangles: number;
  } | null {
    return this.webgpuRenderer?.getLODStats() ?? null;
  }

  /**
   * Refresh LOD (reprocess scene after model changes)
   */
  public refreshWebGPULOD(): void {
    this.webgpuRenderer?.refreshLOD();
  }

  /**
   * Cleanup method - call this when destroying the viewer
   * Essential for preventing memory leaks
   */
  public dispose(): void {
    console.log('🧹 Disposing IFC Viewer...');
    
    this.webgpuRenderer?.disable();
    this.adaptiveQuality?.dispose();
    this.performanceMonitor?.dispose();
    this.propertiesPanel?.dispose();
    this.spaceVisibility?.dispose();
    this.viewCube?.dispose();
    this.clipper?.dispose();
    this.clipStyler?.dispose();
    this.firstPersonControls?.dispose();
    this.measurement?.dispose();
    this.minimap?.dispose();
    this.cluster?.dispose();
    this.colorSplash?.dispose();
    this.ifcLoader.clearModels();
    this.worldManager.dispose();
    
    console.log('✅ IFC Viewer disposed');
  }
}
