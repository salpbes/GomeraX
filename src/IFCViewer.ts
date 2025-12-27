/**
 * IFC Viewer Application (The "Concrete Master Builder")
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
import { WebGPURendererModule, ViewerWebGPUAPI } from './modules/webgpu';
import { ViewerInitializer } from './modules/core/ViewerInitializer';
import * as OBC from '@thatopen/components';
import * as THREE from 'three';

export class IFCViewer {
  // Core modules (public for internal access by ViewerInitializer)
  public worldManager: WorldManager;
  public ifcLoader: IFCLoaderModule;
  public uiManager: UIManager | null = null;
  public performanceMonitor: PerformanceMonitor | null = null;
  public modelTransform: ModelTransformModule | null = null;
  public propertiesPanel: PropertiesPanelModule | null = null;
  public spaceVisibility: SpaceVisibilityModule | null = null;
  public viewCube: ViewCubeModule | null = null;
  public clipper: ClipperModule | null = null;
  public clipStyler: ClipStylerModule | null = null;
  public firstPersonControls: FirstPersonControlsModule | null = null;
  public measurement: MeasurementModule | null = null;
  public floorPlan: FloorPlanModule | null = null;
  public minimap: MinimapModule | null = null;
  public cluster: ClusterModule | null = null;
  public colorSplash: ColorSplashModule | null = null;
  public adaptiveQuality: AdaptiveQualityController | null = null;
  public webgpuRenderer: WebGPURendererModule | null = null;
  public container: HTMLElement | null = null;

  // API Managers
  public webgpu: ViewerWebGPUAPI;
  private initializer: ViewerInitializer;

  constructor() {
    // Initialize the world manager first (foundation of the viewer)
    this.worldManager = new WorldManager();
    
    // Initialize the IFC loader (depends on world manager)
    this.ifcLoader = new IFCLoaderModule(this.worldManager);

    // Initialize API managers
    this.webgpu = new ViewerWebGPUAPI(
      () => this.webgpuRenderer,
      () => this.worldManager,
      () => this.container
    );

    // Initialize the helper that handles the complex setup
    this.initializer = new ViewerInitializer(this);
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
      await this.initializer.initialize(containerId, enablePerformanceMonitor);

      console.log('✅ IFC Viewer initialized successfully!');
      console.log('📂 Ready to load IFC files');
      
      // Expose for debugging
      (window as any).viewer = this;
      (window as any).world = this.worldManager.world;
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
    return this.webgpu.toggle(force);
  }

  /**
   * Check if WebGPU is supported
   */
  public async checkWebGPUSupport(): Promise<{ available: boolean; reason?: string }> {
    return this.webgpu.checkSupport();
  }

  /**
   * Check if WebGPU mode is currently active
   */
  public isWebGPUEnabled(): boolean {
    return this.webgpu.isEnabled();
  }

  /**
   * Check if WebGPU renderer is currently active (alias for isWebGPUEnabled)
   */
  public isWebGPUActive(): boolean {
    return this.webgpu.isActive();
  }

  /**
   * Set WebGPU tone mapping type
   * @param type - THREE.ToneMapping value (0=None, 1=Linear, 2=Reinhard, 3=Cineon, 4=ACESFilmic, 6=AgX, 7=Neutral)
   */
  public setWebGPUToneMapping(type: number): void {
    this.webgpu.setToneMapping(type);
  }

  /**
   * Set WebGPU exposure level
   * @param value - Exposure value (default 1.0, range 0.1-3.0)
   */
  public setWebGPUExposure(value: number): void {
    this.webgpu.setExposure(value);
  }

  /**
   * Enable or disable WebGPU shadows
   */
  public setWebGPUShadows(enabled: boolean): void {
    this.webgpu.setShadows(enabled);
  }

  /**
   * Set WebGPU shadow angle (sun direction)
   * @param angle - Angle in degrees (0-360). 0=North, 90=East, 180=South, 270=West
   */
  public setWebGPUShadowAngle(angle: number): void {
    this.webgpu.setShadowAngle(angle);
  }

  /**
   * Set WebGPU shadow elevation (sun height)
   * @param elevation - Angle in degrees (10-90). Higher = more overhead
   */
  public setWebGPUShadowElevation(elevation: number): void {
    this.webgpu.setShadowElevation(elevation);
  }

  /**
   * Enable or disable WebGPU ground plane
   */
  public setWebGPUGroundPlane(enabled: boolean): void {
    this.webgpu.setGroundPlane(enabled);
  }

  /**
   * Enable or disable WebGPU edge/outline rendering
   */
  public setWebGPUEdges(enabled: boolean): void {
    this.webgpu.setEdges(enabled);
  }

  /**
   * Set WebGPU edge detection threshold (in degrees)
   */
  public setWebGPUEdgeThreshold(degrees: number): void {
    this.webgpu.setEdgeThreshold(degrees);
  }

  /**
   * Enable or disable WebGPU performance stats overlay
   */
  public setWebGPUStats(enabled: boolean): void {
    this.webgpu.setStats(enabled);
  }

  /**
   * Enable or disable frustum culling optimization
   */
  public setWebGPUFrustumCulling(enabled: boolean): void {
    this.webgpu.setFrustumCulling(enabled);
  }

  /**
   * Enable or disable outline/selection highlighting
   */
  public setWebGPUOutlineEnabled(enabled: boolean): void {
    this.webgpu.setOutlineEnabled(enabled);
  }

  /**
   * Enable or disable hover highlighting
   */
  public setWebGPUOutlineHoverEnabled(enabled: boolean): void {
    this.webgpu.setOutlineHoverEnabled(enabled);
  }

  /**
   * Set outline thickness (0.01 - 0.2)
   */
  public setWebGPUOutlineThickness(thickness: number): void {
    this.webgpu.setOutlineThickness(thickness);
  }

  /**
   * Set selection outline color
   */
  public setWebGPUOutlineSelectionColor(color: number | string): void {
    this.webgpu.setOutlineSelectionColor(color);
  }

  /**
   * Set hover outline color
   */
  public setWebGPUOutlineHoverColor(color: number | string): void {
    this.webgpu.setOutlineHoverColor(color);
  }

  /**
   * Clear all current selections in WebGPU mode
   */
  public clearWebGPUSelection(): void {
    this.webgpu.clearSelection();
  }

  /**
   * Debug WebGPU outline/selection state - use from browser console
   */
  public debugWebGPUOutline(): void {
    this.webgpu.debugOutline();
  }

  /**
   * Set visibility for specific elements in WebGPU mode
   */
  public setWebGPUElementVisibility(modelId: string, localIds: number[], visible: boolean): void {
    this.webgpu.setElementVisibility(modelId, localIds, visible);
  }

  /**
   * Isolate specific elements in WebGPU mode
   */
  public isolateWebGPUElements(modelId: string, localIds: number[]): void {
    this.webgpu.isolateElements(modelId, localIds);
  }

  /**
   * Show all elements in WebGPU mode
   */
  public showAllWebGPUElements(): void {
    this.webgpu.showAllElements();
  }

  /**
   * Set shadow map resolution for quality/performance trade-off
   */
  public setWebGPUShadowQuality(resolution: number): void {
    this.webgpu.setShadowQuality(resolution);
  }

  /**
   * Apply a performance preset (low, medium, high)
   */
  public applyWebGPUPerformancePreset(preset: 'low' | 'medium' | 'high'): void {
    this.webgpu.applyPerformancePreset(preset);
  }

  /**
   * Set WebGPU space visibility (hide/show IFCSPACE elements)
   */
  public async setWebGPUSpacesVisible(visible: boolean): Promise<void> {
    await this.webgpu.setSpacesVisible(visible);
  }

  /**
   * Check if WebGPU spaces are visible
   */
  public areWebGPUSpacesVisible(): boolean {
    return this.webgpu.areSpacesVisible();
  }

  // =========================================================================
  // FOG EFFECT
  // =========================================================================

  /**
   * Enable or disable fog effect in WebGPU mode
   */
  public setWebGPUFogEnabled(enabled: boolean): void {
    this.webgpu.setFogEnabled(enabled);
  }

  /**
   * Check if fog is enabled
   */
  public isWebGPUFogEnabled(): boolean {
    return this.webgpu.isFogEnabled();
  }

  /**
   * Set fog type (linear, exponential, exponential2)
   */
  public setWebGPUFogType(type: 'linear' | 'exponential' | 'exponential2'): void {
    this.webgpu.setFogType(type);
  }

  /**
   * Set fog color
   */
  public setWebGPUFogColor(hexColor: string): void {
    this.webgpu.setFogColor(hexColor);
  }

  /**
   * Set fog density (for exponential fog types)
   */
  public setWebGPUFogDensity(density: number): void {
    this.webgpu.setFogDensity(density);
  }

  /**
   * Set fog near distance (for linear fog)
   */
  public setWebGPUFogNear(near: number): void {
    this.webgpu.setFogNear(near);
  }

  /**
   * Set fog far distance (for linear fog)
   */
  public setWebGPUFogFar(far: number): void {
    this.webgpu.setFogFar(far);
  }

  /**
   * Apply a fog preset
   */
  public applyWebGPUFogPreset(preset: 'light' | 'medium' | 'heavy' | 'blue' | 'warm'): void {
    this.webgpu.applyFogPreset(preset);
  }

  /**
   * Auto-configure fog based on model bounds
   */
  public autoConfigureWebGPUFog(): void {
    this.webgpu.autoConfigureFog();
  }

  // =========================================================================
  // LEVEL OF DETAIL (LOD)
  // =========================================================================

  /**
   * Enable or disable LOD system in WebGPU mode
   */
  public setWebGPULODEnabled(enabled: boolean): void {
    this.webgpu.setLODEnabled(enabled);
  }

  /**
   * Check if LOD is enabled
   */
  public isWebGPULODEnabled(): boolean {
    return this.webgpu.isLODEnabled();
  }

  /**
   * Set LOD high distance (full detail up to this distance)
   */
  public setWebGPULODHighDistance(distance: number): void {
    this.webgpu.setLODHighDistance(distance);
  }

  /**
   * Set LOD medium distance threshold
   */
  public setWebGPULODMediumDistance(distance: number): void {
    this.webgpu.setLODMediumDistance(distance);
  }

  /**
   * Set LOD low distance threshold
   */
  public setWebGPULODLowDistance(distance: number): void {
    this.webgpu.setLODLowDistance(distance);
  }

  /**
   * Toggle impostor visibility (bounding boxes for very far objects)
   */
  public setWebGPULODShowImpostors(show: boolean): void {
    this.webgpu.setLODShowImpostors(show);
  }

  /**
   * Get LOD statistics
   */
  public getWebGPULODStats() {
    return this.webgpu.getLODStats();
  }

  /**
   * Refresh LOD (reprocess scene after model changes)
   */
  public refreshWebGPULOD(): void {
    this.webgpu.refreshLOD();
  }

  /**
   * Cleanup method - call this when destroying the viewer
   * Essential for preventing memory leaks
   */
  public dispose(): void {
    this.initializer.dispose();
  }
}
