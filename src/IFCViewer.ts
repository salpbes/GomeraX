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
   * Cleanup method - call this when destroying the viewer
   * Essential for preventing memory leaks
   */
  public dispose(): void {
    console.log('🧹 Disposing IFC Viewer...');
    
    this.performanceMonitor?.dispose();
    this.propertiesPanel?.dispose();
    this.spaceVisibility?.dispose();
    this.viewCube?.dispose();
    this.clipper?.dispose();
    this.clipStyler?.dispose();
    this.firstPersonControls?.dispose();
    this.measurement?.dispose();
    this.ifcLoader.clearModels();
    this.worldManager.dispose();
    
    console.log('✅ IFC Viewer disposed');
  }
}
