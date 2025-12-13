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

import { WorldManager } from './modules/WorldManager';
import { IFCLoaderModule } from './modules/IFCLoaderModule';
import { UIManager } from './modules/UIManager';
import { PerformanceMonitor } from './modules/PerformanceMonitor';
import { ModelTransformModule } from './modules/ModelTransformModule';
import { PropertiesPanelModule } from './modules/PropertiesPanelModule';
import { SpaceVisibilityModule } from './modules/SpaceVisibilityModule';
import { ViewCubeModule } from './modules/ViewCubeModule';
import { ClipperModule } from './modules/ClipperModule';
import { ClipStylerModule } from './modules/ClipStylerModule';
import { FirstPersonControlsModule } from './modules/FirstPersonControlsModule';
import { MeasurementModule } from './modules/MeasurementModule';
import { FloorPlanModule } from './modules/FloorPlanModule';
import { MinimapModule } from './modules/MinimapModule';
import { ClusterModule } from './modules/ClusterModule';
import { ColorSplashModule } from './modules/ColorSplashModule';
import { AdaptiveQualityController } from './modules/AdaptiveQualityController';
import { WebGPURendererModule } from './modules/WebGPURendererModule';
import * as OBC from '@thatopen/components';

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
   * @returns Whether WebGPU is now enabled
   */
  public async toggleWebGPU(): Promise<boolean> {
    if (!this.webgpuRenderer || !this.worldManager.world || !this.container) {
      console.warn('⚠️ WebGPU toggle: Missing required components');
      return false;
    }

    if (this.webgpuRenderer.isEnabled()) {
      this.webgpuRenderer.disable();
      return false;
    } else {
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
   * Set WebGPU tone mapping type
   * @param type - THREE.ToneMapping value (0=None, 1=Linear, 2=Reinhard, 3=Cineon, 4=ACESFilmic, 6=AgX, 7=Neutral)
   */
  public setWebGPUToneMapping(type: number): void {
    this.webgpuRenderer?.setToneMapping(type);
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
