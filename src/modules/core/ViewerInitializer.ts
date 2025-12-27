/**
 * VIEWER INITIALIZER (The "Acedemic Director")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This class orchestrates the full initialization of the IFCViewer.
 * It sets up:
 * - World and Renderer
 * - IFC Loader
 * - Properties Panel
 * - UI Manager
 * - Navigation Tools (ViewCube, Minimap, First-Person Controls)
 * - Analysis Tools (Clipper, Measurement, Clustering)
 * - Performance Monitoring
 * 
 * This separation keeps the main viewer API clean and focused. 

 */
import * as OBC from '@thatopen/components';
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
} from '../webgl';
import { IFCLoaderModule } from './IFCLoaderModule';
import { UIManager } from '../UIManager';
import { PerformanceMonitor } from './PerformanceMonitor';
import { PropertiesPanelModule } from './PropertiesPanelModule';
import { WebGPURendererModule } from '../webgpu';
import { IFCViewer } from '../../IFCViewer';

/**
 * ViewerInitializer handles the complex setup process for the IFCViewer.
 * This separates the initialization logic from the main API.
 */
export class ViewerInitializer {
  constructor(private viewer: any) {}

  /**
   * Orchestrates the full initialization sequence
   */
  public async initialize(
    containerId: string,
    enablePerformanceMonitor: boolean
  ): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with id "${containerId}" not found`);
    }

    // 1. Core Setup
    const world = await this.viewer.worldManager.createWorld(container);
    this.viewer.container = container;
    
    this.viewer.webgpuRenderer = new WebGPURendererModule();
    await this.viewer.ifcLoader.initialize(world);

    const components = this.viewer.worldManager.getComponents();
    const fragments = components.get(OBC.FragmentsManager);
    this.viewer.modelTransform = new ModelTransformModule(components, fragments, world);

    // 2. Properties & UI
    this.viewer.propertiesPanel = new PropertiesPanelModule(this.viewer.worldManager, this.viewer.ifcLoader);
    await this.viewer.propertiesPanel.initialize(world);

    if (this.viewer.webgpuRenderer) {
      this.viewer.propertiesPanel.setWebGPURenderer(this.viewer.webgpuRenderer);
    }

    const propertiesPanelElement = this.viewer.propertiesPanel.createPanel();
    document.body.appendChild(propertiesPanelElement);

    this.viewer.uiManager = new UIManager(
      this.viewer.worldManager, 
      this.viewer.ifcLoader, 
      this.viewer.modelTransform,
      this.viewer,
      this.viewer.propertiesPanel
    );
    this.viewer.uiManager.initialize();

    if (this.viewer.webgpuRenderer) {
      this.viewer.uiManager.setWebGPURenderer(this.viewer.webgpuRenderer);
    }

    // 3. Navigation & View Tools
    await this.initNavigationTools(world, container, components);
    
    // 4. Analysis & Data Tools
    await this.initAnalysisTools(world, components);

    // 5. Callbacks & Monitoring
    this.setupCallbacks();
    
    if (enablePerformanceMonitor) {
      this.initPerformanceTools();
    }
  }

  private async initNavigationTools(world: OBC.World, container: HTMLElement, components: OBC.Components): Promise<void> {
    this.viewer.spaceVisibility = new SpaceVisibilityModule(this.viewer.worldManager);
    await this.viewer.spaceVisibility.initialize();

    this.viewer.viewCube = new ViewCubeModule(this.viewer.worldManager);
    await this.viewer.viewCube.initialize(world, container);

    this.viewer.firstPersonControls = new FirstPersonControlsModule();
    this.viewer.firstPersonControls.initialize(world, components.get(OBC.FragmentsManager), components);

    this.viewer.floorPlan = new FloorPlanModule(components, world);
    if (this.viewer.uiManager) {
      this.viewer.uiManager.setFloorPlanModule(this.viewer.floorPlan);
    }

    this.viewer.minimap = new MinimapModule(components, world, this.viewer.floorPlan);
    await this.viewer.minimap.initialize();
    if (this.viewer.uiManager) {
      this.viewer.uiManager.setMinimapModule(this.viewer.minimap);
    }
  }

  private async initAnalysisTools(world: OBC.World, components: OBC.Components): Promise<void> {
    // Clipper & ClipStyler
    this.viewer.clipper = new ClipperModule(this.viewer.worldManager);
    await this.viewer.clipper.initialize(world, this.viewer.container!);

    this.viewer.clipStyler = new ClipStylerModule(this.viewer.worldManager);
    const clipperComponent = this.viewer.worldManager.getComponents().get(OBC.Clipper);
    await this.viewer.clipStyler.initialize(world, clipperComponent);
    this.viewer.clipper.setClipStylerModule(this.viewer.clipStyler);

    // Measurement
    this.viewer.measurement = new MeasurementModule(this.viewer.worldManager);
    await this.viewer.measurement.initialize(world, this.viewer.container!);
    if (this.viewer.clipper) {
      this.viewer.measurement.setClipperModule(this.viewer.clipper);
    }
    if (this.viewer.uiManager) {
      this.viewer.uiManager.setMeasurementModule(this.viewer.measurement);
    }

    // Cluster
    this.viewer.cluster = new ClusterModule(this.viewer.worldManager);
    await this.viewer.cluster.initialize();
    if (this.viewer.webgpuRenderer) {
      this.viewer.cluster.setWebGPURenderer(this.viewer.webgpuRenderer);
    }
    if (this.viewer.uiManager) {
      this.viewer.uiManager.setClusterModule(this.viewer.cluster);
    }
    if (this.viewer.propertiesPanel) {
      this.viewer.propertiesPanel.setClusterModule(this.viewer.cluster);
    }
    if (this.viewer.modelTransform) {
      this.viewer.cluster.setModelTransform(this.viewer.modelTransform);
    }
    if (this.viewer.clipper) {
      this.viewer.cluster.setClipperModule(this.viewer.clipper);
    }

    // Color Splash
    this.viewer.colorSplash = new ColorSplashModule(this.viewer.worldManager);
    if (this.viewer.webgpuRenderer) {
      this.viewer.colorSplash.setWebGPURenderer(this.viewer.webgpuRenderer);
    }
    if (this.viewer.uiManager) {
      this.viewer.uiManager.setColorSplashModule(this.viewer.colorSplash);
    }
  }

  private setupCallbacks(): void {
    this.viewer.ifcLoader.setModelLoadedCallback(async () => {
      await this.viewer.firstPersonControls?.updateCollisionMeshes();
    });
    
    this.viewer.ifcLoader.setOnCoordinateWarning(() => {
      this.viewer.uiManager?.showCoordinateWarning();
    });
    
    this.viewer.ifcLoader.setOnAlignmentNeeded((modelId: string) => {
      this.viewer.uiManager?.showAlignmentNeeded(modelId);
    });
  }

  private initPerformanceTools(): void {
    this.viewer.performanceMonitor = new PerformanceMonitor(this.viewer.worldManager);
    this.viewer.performanceMonitor.initialize();

    this.viewer.adaptiveQuality = new AdaptiveQualityController(
      this.viewer.performanceMonitor,
      this.viewer.worldManager,
      this.viewer.clipStyler || undefined
    );
    this.viewer.adaptiveQuality.enable();
  }

  /**
   * Cleanup method - call this when destroying the viewer
   */
  public dispose(): void {
    console.log('🧹 Disposing IFC Viewer...');
    
    this.viewer.webgpuRenderer?.disable();
    this.viewer.adaptiveQuality?.dispose();
    this.viewer.performanceMonitor?.dispose();
    this.viewer.propertiesPanel?.dispose();
    this.viewer.spaceVisibility?.dispose();
    this.viewer.viewCube?.dispose();
    this.viewer.clipper?.dispose();
    this.viewer.clipStyler?.dispose();
    this.viewer.firstPersonControls?.dispose();
    this.viewer.measurement?.dispose();
    this.viewer.minimap?.dispose();
    this.viewer.cluster?.dispose();
    this.viewer.colorSplash?.dispose();
    this.viewer.ifcLoader.clearModels();
    this.viewer.worldManager.dispose();
    
    console.log('✅ IFC Viewer disposed');
  }
}
