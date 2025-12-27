/**
 * UIManager (The "Director of Screenplay")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is the "User Interface" boss. It manages all the buttons, menus, 
 * sidebars, and popups that you see on the screen. It makes sure that 
 * the right panels open when you click something.
 * 
 * WHY IT MATTERS: 
 * A 3D model is useless if you can't interact with it. The UIManager 
 * provides the controls that let you load files, change views, and 
 * see information about the building.
 * --------------------------------------------------------------------------------
 */

import * as BUI from "@thatopen/ui";
import * as CUI from "@thatopen/ui-obc";
import * as OBC from "@thatopen/components";
import * as THREE from "three";
import { 
  WorldManager, 
  MeasurementModule, 
  FloorPlanModule, 
  MinimapModule, 
  ModelTransformModule, 
  ClusterModule, 
  ColorSplashModule 
} from "./webgl";
import { IFCLoaderModule } from "./core/IFCLoaderModule";
import { getToolbarStyles, getLoadingIndicatorStyles, getLoadingScreenStyles, getPropertiesPanelStyles } from "./ui/UIStyles";
import { createToolbarHTML, createLoadingIndicatorHTML } from "./ui/ToolbarBuilder";
import { ToolbarHandlers } from "./ui/ToolbarHandlers";
import { NotificationHelper } from "./ui/NotificationHelper";
import { WebGPUUIManager } from './ui/WebGPUUIManager';
import { NavigationUIManager } from './ui/NavigationUIManager';
import { ClipperUIManager } from './ui/ClipperUIManager';
import { MeasurementUIManager } from './ui/MeasurementUIManager';
import { FloorPlanUIManager } from './ui/FloorPlanUIManager';
import { SelectionUIManager } from './ui/SelectionUIManager';
import { ClusterUIManager } from './ui/ClusterUIManager';
import { NotificationUIManager } from './ui/NotificationUIManager';
import { LoadingUIManager } from './ui/LoadingUIManager';
import { ModelAlignmentManager } from './ui/ModelAlignmentManager';
import { AIAssistantModule } from './core/AIAssistantModule';
import { AIAssistantUIManager } from './ui/AIAssistantUIManager';


export class UIManager {
  private worldManager: WorldManager;
  private ifcLoader: IFCLoaderModule;
  private modelTransform: ModelTransformModule;
  private toolbarHandlers: ToolbarHandlers;
  private isSubmenuOpen: boolean = false;
  private viewer: any; // Reference to IFCViewer for accessing all modules
  private floorPlanModule: FloorPlanModule | null = null;
  private minimapModule: MinimapModule | null = null;
  private clusterModule: ClusterModule | null = null;
  private colorSplashModule: ColorSplashModule | null = null;
  
  // Modular UI Managers
  private webgpuUI: WebGPUUIManager;
  private navigationUI: NavigationUIManager;
  private clipperUI: ClipperUIManager;
  private measurementUI: MeasurementUIManager;
  private floorPlanUI: FloorPlanUIManager;
  private selectionUI: SelectionUIManager;
  private clusterUI: ClusterUIManager;
  private notificationUI: NotificationUIManager;
  private loadingUI: LoadingUIManager;
  private alignmentManager: ModelAlignmentManager;
  private aiAssistantUI: AIAssistantUIManager;
  private aiAssistantModule: AIAssistantModule;
  
  constructor(
    worldManager: WorldManager,
    ifcLoader: IFCLoaderModule,
    modelTransform: ModelTransformModule,
    viewer?: any,
    private propertiesPanel?: any
  ) {
    this.worldManager = worldManager;
    this.ifcLoader = ifcLoader;
    this.modelTransform = modelTransform;
    this.viewer = viewer;

    // Initialize modular UI managers
    this.webgpuUI = new WebGPUUIManager(this.viewer);
    this.navigationUI = new NavigationUIManager(this.viewer, this.worldManager, () => this.minimapModule);
    this.clipperUI = new ClipperUIManager(this.viewer, this.worldManager, () => this.clusterModule);
    this.measurementUI = new MeasurementUIManager(this.viewer, () => this.clusterModule);
    this.floorPlanUI = new FloorPlanUIManager(this.viewer, this.worldManager, () => this.clusterModule);
    this.selectionUI = new SelectionUIManager(this.viewer, this.worldManager);
    this.clusterUI = new ClusterUIManager(this.viewer, () => this.clusterModule);
    this.notificationUI = new NotificationUIManager(this);
    this.loadingUI = new LoadingUIManager(this.ifcLoader);
    this.alignmentManager = new ModelAlignmentManager(this.worldManager.getComponents(), this.ifcLoader);
    
    // Initialize AI Assistant
    this.aiAssistantModule = new AIAssistantModule(this.viewer);
    this.aiAssistantUI = new AIAssistantUIManager(this.aiAssistantModule);
    
    // Initialize handlers with callbacks and components
    const components = worldManager.getComponents();
    this.toolbarHandlers = new ToolbarHandlers(
      ifcLoader,
      modelTransform,
      () => this.showLoading(),
      () => this.hideLoading(),
      (progress, message) => this.updateLoadingProgress(progress, message),
      null,
      components,
      propertiesPanel,
      this  // Pass UIManager for error notifications
    );
  }

  /**
   * Initializes the UI library and creates all UI components
   */
  public initialize(): void {
    // Initialize the UI libraries (BUI for core UI, CUI for OBC components)
    BUI.Manager.init();
    CUI.Manager.init();

    // Create the modern bottom toolbar
    this.createBottomToolbar();

    // Add custom styles for the toolbar
    this.addToolbarStyles();

    // Create loading indicator
    this.createLoadingIndicator();
    
    // Initialize AI Assistant UI
    this.aiAssistantUI.createUI();
    this.aiAssistantUI.addStyles();
    
    // Set up callback to update model count when metadata is ready
    this.ifcLoader.setMetadataUpdateCallback(() => {
      this.updateModelCount();
    });

    // Set up callback to refresh color splash when new model is loaded
    this.ifcLoader.setOnModelLoaded(() => {
      if (this.colorSplashModule) {
        this.colorSplashModule.refreshColorSplash();
      }
    });

    // Set measurement module if available
    if (this.viewer) {
      const measurement = this.viewer.getMeasurement();
      if (measurement) {
        this.toolbarHandlers.setMeasurementModule(measurement);
      }
    }
    
    console.log('✅ UI initialized');
  }

  /**
   * Sets the measurement module for toolbar handlers
   */
  public setMeasurementModule(measurement: MeasurementModule): void {
    this.toolbarHandlers.setMeasurementModule(measurement);
    console.log('✅ Measurement module set in UI');
  }

  /**
   * Sets the floor plan module for toolbar handlers
   */
  public setFloorPlanModule(floorPlan: FloorPlanModule): void {
    this.floorPlanModule = floorPlan;
    this.floorPlanUI.setFloorPlanModule(floorPlan);
    this.toolbarHandlers.setFloorPlanModule(floorPlan);
    console.log('✅ Floor plan module set in UI');
  }

  /**
   * Sets the minimap module for toolbar handlers
   */
  public setMinimapModule(minimap: MinimapModule): void {
    this.minimapModule = minimap;
    this.toolbarHandlers.setMinimapModule(minimap);
    console.log('✅ Minimap module set in UI');
  }

  /**
   * Sets the cluster module for toolbar handlers
   */
  public setClusterModule(cluster: ClusterModule): void {
    this.clusterModule = cluster;
    this.toolbarHandlers.setClusterModule(cluster);
    
    // Set up loading callbacks
    cluster.onLoadingStart = () => {
      this.showLoading('Processing clusters...', 50);
    };
    
    cluster.onLoadingEnd = () => {
      this.hideLoading();
    };
    
    console.log('✅ Cluster module set in UI');
  }

  /**
   * Sets the WebGPU renderer module
   */
  public setWebGPURenderer(webgpu: any): void {
    this.toolbarHandlers.setWebGPURenderer(webgpu);
    console.log('✅ WebGPU renderer set in UI');
  }

  /**
   * Sets the color splash module for toolbar handlers
   */
  public setColorSplashModule(colorSplash: ColorSplashModule): void {
    this.colorSplashModule = colorSplash;
    this.toolbarHandlers.setColorSplashModule(colorSplash);
    
    // Set up callback to show color picker when colors are applied
    colorSplash.onColorsApplied = (categories, modelGroups) => {
      this.toolbarHandlers.showColorPickerPanel(categories, modelGroups);
    };
    
    // Set up loading callbacks
    colorSplash.onLoadingStart = () => {
      this.showLoading('Applying colors...', 50);
    };
    
    colorSplash.onLoadingEnd = () => {
      this.hideLoading();
    };
    
    console.log('✅ Color splash module set in UI');
  }

  /**
   * Creates a modern bottom toolbar with icon buttons
   */
  private createBottomToolbar(): void {
    const toolbar = document.createElement('div');
    toolbar.className = 'bottom-toolbar';
    toolbar.innerHTML = createToolbarHTML();
    
    document.body.appendChild(toolbar);
    
    // Create and append crosshair directly to body (not inside toolbar)
    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    crosshair.id = 'walkCrosshair';
    document.body.appendChild(crosshair);
    
    // Create walk mode helper panel
    this.createWalkModeHelper();
    
    // Add event listeners
    this.attachToolbarListeners();
  }

  /**
   * Creates the walk mode helper panel with keyboard controls
   */
  private createWalkModeHelper(): void {
    const helper = document.createElement('div');
    helper.className = 'walk-helper';
    helper.id = 'walkHelper';
    helper.innerHTML = `
      <div class="walk-helper-header">
        <span class="walk-helper-title">
          <i class="fas fa-keyboard"></i> Walk Mode Controls
        </span>
        <button class="walk-helper-toggle" id="walkHelperToggle" title="Minimize">
          <i class="fas fa-minus"></i>
        </button>
      </div>
      <div class="walk-helper-content" id="walkHelperContent">
        <div class="walk-helper-section">
          <div class="walk-helper-label">Movement</div>
          <div class="walk-helper-keys">
            <div class="walk-helper-key-group">
              <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>
              <span class="walk-helper-desc">Move</span>
            </div>
            <div class="walk-helper-key-group">
              <kbd>Space</kbd>
              <span class="walk-helper-desc">Up</span>
            </div>
            <div class="walk-helper-key-group">
              <kbd>Shift</kbd>
              <span class="walk-helper-desc">Down</span>
            </div>
            <div class="walk-helper-key-group">
              <kbd>G</kbd>
              <span class="walk-helper-desc">Toggle Gravity</span>
            </div>
          </div>
        </div>
        <div class="walk-helper-section">
          <div class="walk-helper-label">Look & Select</div>
          <div class="walk-helper-keys">
            <div class="walk-helper-key-group">
              <i class="fas fa-mouse"></i>
              <span class="walk-helper-desc">Right-click to look</span>
            </div>
            <div class="walk-helper-key-group">
              <i class="fas fa-hand-pointer"></i>
              <span class="walk-helper-desc">Left-click to select</span>
            </div>
            <div class="walk-helper-key-group">
              <kbd>ESC</kbd>
              <span class="walk-helper-desc">Exit pointer lock</span>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(helper);
    
    // Add toggle functionality
    const toggleBtn = document.getElementById('walkHelperToggle');
    const content = document.getElementById('walkHelperContent');
    let isMinimized = false;
    
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      isMinimized = !isMinimized;
      
      if (isMinimized) {
        content?.style.setProperty('display', 'none');
        toggleBtn.innerHTML = '<i class="fas fa-plus"></i>';
        toggleBtn.title = 'Expand';
        helper.classList.add('minimized');
      } else {
        content?.style.setProperty('display', 'block');
        toggleBtn.innerHTML = '<i class="fas fa-minus"></i>';
        toggleBtn.title = 'Minimize';
        helper.classList.remove('minimized');
      }
    });
  }

  /**
   * Attaches event listeners to toolbar buttons
   */
  private attachToolbarListeners(): void {
    // Main toolbar buttons
    const buttons = document.querySelectorAll('.toolbar-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (e.currentTarget as HTMLElement).dataset.action;
        
        // Handle expandable groups (show submenu without triggering action)
        if (action === 'upload' || action === 'toggleView' || action === 'toggleInfo' || action === 'toggleWalkMode' || action === 'toggleMeasure' || action === 'toggleCluster' || action === 'toggleColorSplash' || action === 'toggleExport' || action === 'toggleWebGPUPanel') {
          const group = (e.currentTarget as HTMLElement).closest('.toolbar-group');
          if (group) {
            this.toggleSubmenu(group);
          }
          // For walk mode, also toggle the walk state
          if (action === 'toggleWalkMode') {
            this.handleToolbarAction(action);
          }
          // For measurement, also toggle the measurement state
          if (action === 'toggleMeasure') {
            this.handleToggleMeasure();
          }
          // For cluster and color splash, also toggle their state
          if (action === 'toggleCluster' || action === 'toggleColorSplash') {
            this.handleToolbarAction(action);
          }
          return;
        }
        
        // Handle toggleClipper - toggle submenu AND enable clipper
        if (action === 'toggleClipper') {
          const group = (e.currentTarget as HTMLElement).closest('.toolbar-group');
          if (group) {
            this.toggleSubmenu(group);
          }
          // Also toggle the clipper state
          this.handleToggleClipper();
          return;
        }
        
        this.handleToolbarAction(action || '');
      });
    });
    
    // Submenu buttons - attach click handlers with event delegation as backup
    const submenuButtons = document.querySelectorAll('.submenu-btn');
    submenuButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const button = (e.currentTarget as HTMLElement);
        const clickedAction = button.dataset.action;
        console.log('Submenu button clicked:', clickedAction);
        if (clickedAction) {
          this.handleToolbarAction(clickedAction);
          setTimeout(() => this.closeAllSubmenus(), 100);
        }
      });
    });
    
    // Also use event delegation on the toolbar container as a backup
    const toolbarContainer = document.querySelector('.toolbar-container');
    if (toolbarContainer) {
      toolbarContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const submenuBtn = target.closest('.submenu-btn') as HTMLElement;
        if (submenuBtn) {
          e.stopPropagation();
          const clickedAction = submenuBtn.dataset.action;
          console.log('Submenu button clicked (delegation):', clickedAction);
          if (clickedAction) {
            this.handleToolbarAction(clickedAction);
            setTimeout(() => this.closeAllSubmenus(), 100);
          }
        }
      });
    }
    
    // Prevent clicks on the submenu background from closing it
    const submenus = document.querySelectorAll('.toolbar-submenu');
    submenus.forEach(menu => {
      menu.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });
    
    // Close submenus when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.toolbar-group') && !target.closest('.toolbar-container')) {
        this.closeAllSubmenus();
      }
    });
    
    // Settings panel listeners
    this.attachSettingsListeners();
  }

  /**
   * Attaches event listeners to settings panel controls
   */
  private attachSettingsListeners(): void {
    document.getElementById('bgColorPicker')?.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      this.worldManager.setBackgroundColor(color);
    });
    
    let dirLightIntensity = 5;
    let ambLightIntensity = 2;
    
    document.getElementById('dirLightSlider')?.addEventListener('input', (e) => {
      dirLightIntensity = parseFloat((e.target as HTMLInputElement).value);
      this.worldManager.setLightingIntensity(dirLightIntensity, ambLightIntensity);
    });
    
    document.getElementById('ambLightSlider')?.addEventListener('input', (e) => {
      ambLightIntensity = parseFloat((e.target as HTMLInputElement).value);
      this.worldManager.setLightingIntensity(dirLightIntensity, ambLightIntensity);
    });

    // Adaptive Quality toggle listener
    document.getElementById('adaptiveQualityToggle')?.addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      const adaptiveQuality = this.viewer?.getAdaptiveQuality();
      if (adaptiveQuality) {
        if (enabled) {
          adaptiveQuality.enable();
          console.log('🎯 Adaptive Quality enabled - auto-adjusts based on FPS');
        } else {
          adaptiveQuality.disable();
          console.log('⏸️ Adaptive Quality disabled - manual quality control');
        }
      }
    });

    // Double-Sided Rendering toggle listener
    document.getElementById('doubleSidedRenderingToggle')?.addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      this.ifcLoader.setDoubleSidedRendering(enabled);
    });

    // Visual Style selector listener
    document.getElementById('visualStyleSelect')?.addEventListener('change', (e) => {
      const style = parseInt((e.target as HTMLSelectElement).value);
      this.worldManager.setPostproductionStyle(style);
      console.log(`🎨 Visual style changed to: ${style === 0 ? 'Basic' : 'Realistic'}`);
    });

    // Section Fills toggle listener (clean cuts without hatch lines)
    document.getElementById('sectionHatchesToggle')?.addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      const clipStyler = this.viewer?.getClipStyler();
      if (clipStyler) {
        clipStyler.setHatchesVisibility(enabled);
        console.log(`🎨 Section fills ${enabled ? 'enabled' : 'disabled'}`);
      }
    });

    // Fill Opacity selector listener
    document.getElementById('hatchPerformanceModeSelect')?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as 'high' | 'balanced' | 'performance';
      const clipStyler = this.viewer?.getClipStyler();
      if (clipStyler) {
        clipStyler.setPerformanceMode(mode);
        console.log(`🎨 Fill opacity mode: ${mode}`);
      }
    });

    // Section Fill Color picker listener
    document.getElementById('sectionFillColorPicker')?.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      const clipStyler = this.viewer?.getClipStyler();
      if (clipStyler) {
        clipStyler.setFillColor(color);
        // Update preset dropdown to "Custom"
        const preset = document.getElementById('sectionFillColorPreset') as HTMLSelectElement;
        if (preset) preset.value = 'custom';
        console.log(`🎨 Section fill color: ${color}`);
      }
    });

    // Section Fill Color preset listener
    document.getElementById('sectionFillColorPreset')?.addEventListener('change', (e) => {
      const preset = (e.target as HTMLSelectElement).value;
      if (preset === 'custom') return; // User selecting custom, let them use color picker
      
      const clipStyler = this.viewer?.getClipStyler();
      if (clipStyler) {
        clipStyler.setFillColor(preset);
        // Update color picker to match preset
        const picker = document.getElementById('sectionFillColorPicker') as HTMLInputElement;
        if (picker) picker.value = preset;
        console.log(`🎨 Section fill preset: ${preset}`);
      }
    });

    // Walk speed slider listener
    document.getElementById('walkSpeedSlider')?.addEventListener('input', (e) => {
      const speed = parseFloat((e.target as HTMLInputElement).value);
      const firstPersonControls = this.viewer?.getFirstPersonControls();
      if (firstPersonControls) {
        firstPersonControls.setSpeed(speed);
        console.log(`🚶 Walk speed set to: ${speed.toFixed(1)}`);
      }
    });

    // WebGPU toggle listener
    this.setupWebGPUToggle();
  }

  /**
   * Sets up WebGPU toggle with support detection
   */
  private async setupWebGPUToggle(): Promise<void> {
    await this.webgpuUI.setupWebGPUToggle();
  }


  /**
   * Handles toolbar button actions
   */
  private handleToolbarAction(action: string): void {
    switch(action) {
      case 'toggleAI':
        this.aiAssistantUI.toggle();
        break;
      case 'upload':
        this.toolbarHandlers.handleFileUpload();
        break;
      case 'sample':
        this.toolbarHandlers.handleLoadSample();
        break;
      case 'export':
        this.toolbarHandlers.handleExport();
        break;
      case 'exportFragments':
        this.toolbarHandlers.handleExportFragments();
        break;
      case 'exportGLTF':
        this.toolbarHandlers.handleExportGLTF();
        break;
      case 'exportGLB':
        this.toolbarHandlers.handleExportGLB();
        break;
      case 'exportUSDZ':
        this.toolbarHandlers.handleExportUSDZ();
        break;
      case 'exportScreenshot':
        this.toolbarHandlers.handleExportScreenshot();
        break;
      case 'exportJSON':
        this.toolbarHandlers.handleExportJSON();
        break;
      case 'center':
        this.toolbarHandlers.handleCenterModels();
        break;
      case 'fit':
        this.toolbarHandlers.handleFitCamera();
        break;
      case 'autoRotate':
        this.handleAutoRotate();
        break;
      case 'toggleSpaces':
        this.handleToggleSpaces();
        break;
      case 'toggleGrid':
        this.handleToggleGrid();
        break;
      case 'alignModels':
        this.toolbarHandlers.handleAlignModels();
        break;
      case 'createFloorPlan':
        this.toolbarHandlers.handleCreateFloorPlan();
        break;
      case 'closeFloorPlan':
        this.toolbarHandlers.handleCloseFloorPlan();
        break;
      case 'toggleWalkMode':
        this.handleToggleWalkMode();
        break;
      case 'toggleMeasure':
        this.handleToggleMeasure();
        break;
      case 'toggleMinimap':
        this.handleToggleMinimap();
        break;
      case 'toggleCluster':
        this.toolbarHandlers.handleToggleCluster();
        break;
      case 'cancelWalkMode':
        this.handleCancelWalkMode();
        break;
      case 'toggleFirstPerson':
        this.handleToggleFirstPerson();
        break;
      case 'toggleWalkControls':
        this.handleToggleWalkControls();
        break;
      case 'toggleClipper':
        this.handleToggleClipper();
        break;
      case 'clipperX':
        this.handleClipperPreset('x');
        break;
      case 'clipperY':
        this.handleClipperPreset('y');
        break;
      case 'clipperZ':
        this.handleClipperPreset('z');
        break;
      case 'clipperSurface':
        this.handleClipperSurfaceMode();
        break;
      case 'clipperFlip':
        this.handleClipperFlip();
        break;
      case 'cancelClipperMode':
        this.handleCancelClipperMode();
        break;
      case 'measureLength':
        this.toolbarHandlers.handleMeasureLength();
        break;
      case 'measureArea':
        this.toolbarHandlers.handleMeasureArea();
        break;
      case 'measureVolume':
        this.toolbarHandlers.handleMeasureVolume();
        break;
      case 'measureClear':
        this.toolbarHandlers.handleMeasureClear();
        break;
      case 'measureExport':
        this.toolbarHandlers.handleMeasureExport();
        break;
      case 'togglePerpGuides':
        this.toolbarHandlers.handleTogglePerpGuides();
        break;
      case 'cancelMeasureMode':
        this.toolbarHandlers.handleCancelMeasureMode();
        break;
      case 'cancelClusterMode':
        this.toolbarHandlers.handleCancelClusterMode();
        break;
      case 'cancelColorSplashMode':
        this.toolbarHandlers.handleCancelColorSplashMode();
        break;
      case 'modelinfo':
        this.toolbarHandlers.handleShowModelInfo();
        break;
      case 'openSlicer':
        this.toolbarHandlers.handleShowSlicerDashboard();
        break;
      case 'clear':
        this.toolbarHandlers.handleClearModels(() => this.updateModelCount());
        break;
      case 'settings':
        this.toggleSettingsPanel();
        break;
      case 'toggleColorSplash':
        this.toolbarHandlers.handleToggleColorSplash();
        break;
    }
  }

  /**
   * Toggles the settings panel visibility
   */
  private toggleSettingsPanel(): void {
    const panel = document.getElementById('settingsPanel');
    if (panel) {
      const isVisible = panel.style.display === 'block';
      this.closeAllSubmenus();
      panel.style.display = isVisible ? 'none' : 'block';
    }
  }

  /**
   * Handles toggling space visibility
   */
  private async handleToggleSpaces(): Promise<void> {
    await this.selectionUI.handleToggleSpaces();
  }

  /**
   * Handles toggling grid visibility
   */
  private handleToggleGrid(): void {
    this.selectionUI.handleToggleGrid();
  }

  /**
   * Handles auto rotate - starts/stops gentle rotation of the 3D view
   */
  private handleAutoRotate(): void {
    this.navigationUI.handleAutoRotate();
  }

  /**
   * Handles toggling first person camera mode
   */
  private async handleToggleFirstPerson(): Promise<void> {
    await this.navigationUI.handleToggleFirstPerson();
  }

  /**
   * Handles toggling keyboard walk controls (WASD)
   */
  private async handleToggleWalkControls(): Promise<void> {
    await this.navigationUI.handleToggleWalkControls();
  }

  /**
   * Handles toggling the minimap display
   */
  private async handleToggleMinimap(): Promise<void> {
    await this.navigationUI.handleToggleMinimap();
  }

  /**
   * Updates the minimap button visual state
   */
  private updateMinimapButtonState(isActive: boolean): void {
    this.navigationUI.updateMinimapButtonState(isActive);
  }

  private updateFirstPersonButtonState(isActive: boolean): void {
    this.navigationUI.updateFirstPersonButtonState(isActive);
  }

  private updateWalkControlsButtonState(isActive: boolean): void {
    this.navigationUI.updateWalkControlsButtonState(isActive);
  }

  /**
   * Handles toggling walk mode (merged: first person + keyboard controls)
   */
  private async handleToggleWalkMode(): Promise<void> {
    await this.navigationUI.handleToggleWalkMode();
  }

  private async handleCancelWalkMode(): Promise<void> {
    await this.navigationUI.handleCancelWalkMode();
  }

  private updateWalkModeButtonState(isActive: boolean): void {
    this.navigationUI.updateWalkModeButtonState(isActive);
  }

  /**
   * Handles toggling measurement mode
   */
  private handleToggleMeasure(): void {
    this.measurementUI.handleToggleMeasurement();
  }



  /**
   * Check if WebGPU mode is currently active
   */
  private isWebGPUMode(): boolean {
    if (!this.viewer) return false;
    const webgpuRenderer = this.viewer.getWebGPURenderer?.();
    return webgpuRenderer?.isEnabled?.() || false;
  }

  /**
   * Handles clipper toggle - enables/disables sectioning mode
   * NOTE: Sectioning is NOT supported in WebGPU mode
   */
  private handleToggleClipper(): void {
    this.clipperUI.handleToggleClipper();
  }

  /**
   * Handles preset clipping planes (X, Y, Z axis)
   * NOTE: Sectioning is NOT supported in WebGPU mode
   */
  private handleClipperPreset(axis: 'x' | 'y' | 'z'): void {
    this.clipperUI.handleClipperPreset(axis);
  }

  /**
   * Enables surface click mode for creating clipping planes
   * Double-click on any surface to create a section plane at that point
   * Works with both WebGL and WebGPU modes
   */
  private handleClipperSurfaceMode(): void {
    this.clipperUI.handleClipperSurfaceMode();
  }

  /**
   * Flips clipping planes to show the other side
   * Works with both WebGL and WebGPU modes
   */
  private handleClipperFlip(): void {
    this.clipperUI.handleClipperFlip();
  }

  /**
   * Handles canceling clipper mode (clears all planes and disables sectioning)
   * Works with both WebGL and WebGPU modes
   */
  private handleCancelClipperMode(): void {
    this.clipperUI.handleCancelClipperMode();
  }

  /**
   * Updates the clipper button visual state
   */
  private updateClipperButtonState(isEnabled: boolean): void {
    this.clipperUI.updateClipperButtonState(isEnabled);
  }

  /**
   * Updates the measurement button state based on active measurement mode
   */
  private updateMeasurementButtonState(): void {
    const measurement = this.viewer?.getMeasurement();
    // Check if measurement mode is active (not 'none', 'DISABLED', or undefined)
    const currentMode = measurement?.getMode();
    const isEnabled = currentMode !== undefined && 
                      currentMode !== 'none' && 
                      currentMode !== 'DISABLED';
    this.measurementUI.updateMeasurementButtonState(isEnabled);
  }

  /**
   * Toggles a submenu visibility
   */
  private toggleSubmenu(group: Element): void {
    const submenu = group.querySelector('.toolbar-submenu') as HTMLElement;
    if (!submenu) return;
    
    const isVisible = submenu.classList.contains('visible');
    
    // Close all other submenus first
    const allSubmenus = document.querySelectorAll('.toolbar-submenu');
    allSubmenus.forEach(menu => {
      if (menu !== submenu) {
        menu.classList.remove('visible');
      }
    });
    
    const settingsPanel = document.getElementById('settingsPanel');
    if (settingsPanel) settingsPanel.style.display = 'none';
    
    // Get the parent button to manage active state
    const button = group.querySelector('.toolbar-btn') as HTMLElement;
    const action = button?.dataset.action;
    
    // Toggle this submenu
    if (!isVisible) {
      submenu.classList.add('visible');
      this.isSubmenuOpen = true;
      this.hideModelTooltip();
      
      // Add active class for information button only (measurement handled by mode state)
      if (button && action === 'toggleInfo') {
        button.classList.add('active');
      }
    } else {
      submenu.classList.remove('visible');
      this.isSubmenuOpen = false;
      this.showModelTooltip();
      
      // Remove active class for information button only
      if (button && action === 'toggleInfo') {
        button.classList.remove('active');
      }
    }
    
    // Always update measurement button state based on actual mode
    this.updateMeasurementButtonState();
  }

  /**
   * Closes all submenus
   */
  private closeAllSubmenus(skipShowTooltip: boolean = false): void {
    const submenus = document.querySelectorAll('.toolbar-submenu');
    submenus.forEach(menu => {
      menu.classList.remove('visible');
    });
    
    // Only remove active class from info button (not measurement - it should stay active if mode is active)
    const infoBtn = document.querySelector('[data-action="toggleInfo"]');
    if (infoBtn) infoBtn.classList.remove('active');
    
    // Update measurement button state based on actual mode
    this.updateMeasurementButtonState();
    
    // Restore tooltip visibility only if no submenu is currently open
    if (!skipShowTooltip) {
      this.isSubmenuOpen = false;
      this.showModelTooltip();
    }
  }

  /**
   * Hides the model tooltip
   */
  private hideModelTooltip(): void {
    const badge = document.querySelector('.model-count-badge') as HTMLElement;
    if (badge) {
      badge.classList.add('submenu-open');
    }
  }

  /**
   * Shows the model tooltip
   */
  private showModelTooltip(): void {
    const badge = document.querySelector('.model-count-badge') as HTMLElement;
    if (badge) {
      badge.classList.remove('submenu-open');
    }
  }

  /**
   * Adds custom CSS styles for the toolbar
   */
  private addToolbarStyles(): void {
    const style = document.createElement('style');
    style.textContent = getToolbarStyles() + getPropertiesPanelStyles() + getLoadingScreenStyles();
    document.head.appendChild(style);
  }

  /**
   * Creates a loading indicator overlay
   */
  private createLoadingIndicator(): void {
    const indicator = document.createElement('div');
    indicator.id = 'loadingIndicator';
    indicator.style.cssText = getLoadingIndicatorStyles();
    indicator.innerHTML = createLoadingIndicatorHTML();
    document.body.appendChild(indicator);
  }

  /**
   * Shows the loading indicator
   */
  /**
   * Shows the loading indicator
   */
  private async showLoading(initialMessage: string = 'Initializing...', initialProgress: number = 0): Promise<void> {
    await this.loadingUI.showLoading();
    this.loadingUI.updateLoadingProgress(initialProgress, initialMessage);
  }

  /**
   * Updates loading progress with smooth animation
   */
  public updateLoadingProgress(progress: number, message: string): void {
    this.loadingUI.updateLoadingProgress(progress, message);
  }

  /**
   * Hides the loading indicator
   */
  private hideLoading(): void {
    this.loadingUI.hideLoading();
  }

  /**
   * Updates the model count badge
   */
  private updateModelCount(): void { 
    this.loadingUI.updateModelCount();
  }

  /**
   * Shows a warning label for far-origin models
   */
  public showCoordinateWarning(): void {
    this.notificationUI.showCoordinateWarning();
  }

  /**
   * Hides the coordinate warning label
   */
  public hideCoordinateWarning(): void {
    this.notificationUI.hideCoordinateWarning();
  }

  /**
   * Shows an error notification popup
   */
  public showErrorNotification(
    title: string, 
    message: string, 
    duration: number = 15000,
    actionButton?: { text: string; callback: () => void }
  ): void {
    this.notificationUI.showErrorNotification(title, message, duration, actionButton);
  }

  /**
   * Hides the error notification
   */
  public hideErrorNotification(): void {
    this.notificationUI.hideErrorNotification();
  }

  /**
   * Shows an alignment needed notification with an action button
   */
  public showAlignmentNeeded(modelId: string): void {
    this.notificationUI.showAlignmentNeeded(modelId);
  }

  private async alignModels(secondModelId: string): Promise<void> {
    await this.alignmentManager.alignModels(secondModelId);
  }

  /**
   * Creates and shows the model alignment panel
   */
  public createModelAlignmentPanel(): void {
    this.alignmentManager.createModelAlignmentPanel();
  }

  /**
   * Show floor plan creation modal with storey selection
   */
  async showFloorPlanModal(): Promise<void> {
    await this.floorPlanUI.showFloorPlanModal();
  }
}
