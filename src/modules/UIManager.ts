/**
 * UIManager class handles all UI-related functionality
 * Refactored into modular components for better maintainability
 * 
 * Layman's terms:
 * Think of this as the "Remote Control" or "Dashboard" of the viewer.
 * It manages everything you see on the screen that isn't the 3D model itself—
 * like buttons, menus, search bars, and loading screens. It connects your 
 * clicks and settings to the 3D engine so you can interact with the 
 * building data.
 * 
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
  
  // Auto rotate state
  private isAutoRotating: boolean = false;
  private autoRotateAnimationId: number | null = null;
  private autoRotateStartTime: number = 0;
  private autoRotateDuration: number = 60000; // Default 1 minute in ms
  private autoRotateClickHandler: ((e: MouseEvent) => void) | null = null;

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
        }
        
        this.handleToolbarAction(action || '');
      });
    });
    
    // Submenu buttons
    const submenuButtons = document.querySelectorAll('.submenu-btn');
    submenuButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (e.currentTarget as HTMLElement).dataset.action;
        this.handleToolbarAction(action || '');
        this.closeAllSubmenus();
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
  private setupWebGPUToggle(): void {
    const toggle = document.getElementById('webgpuToggle') as HTMLInputElement;
    const statusIcon = document.getElementById('webgpuStatusIcon');
    const statusText = document.getElementById('webgpuStatusText');
    const webgpuOptions = document.getElementById('webgpuOptions');
    
    if (!toggle || !statusIcon || !statusText) return;
    
    // Check WebGPU support
    const isSupported = this.viewer?.checkWebGPUSupport() ?? false;
    
    if (isSupported) {
      statusIcon.textContent = '✅';
      statusText.textContent = 'Available';
      statusText.style.color = '#4ade80';
      toggle.disabled = false;
    } else {
      statusIcon.textContent = '❌';
      statusText.textContent = 'Not Supported';
      statusText.style.color = '#f87171';
      toggle.disabled = true;
      toggle.checked = false;
    }
    
    // Store reference to viewer for use in async callback
    const viewer = this.viewer;
    
    // Setup WebGPU options handlers
    this.setupWebGPUOptions();
    
    // Handle toggle change
    toggle.addEventListener('change', async (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      
      if (!viewer) return;
      
      // Show loading state
      toggle.disabled = true;
      statusIcon.textContent = '⏳';
      statusText.textContent = enabled ? 'Loading...' : 'Switching...';
      statusText.style.color = '#fbbf24';
      
      try {
        const success = await viewer.toggleWebGPU(enabled);
        
        if (success) {
          if (enabled) {
            statusIcon.textContent = '🚀';
            statusText.textContent = 'Active';
            statusText.style.color = '#4ade80';
            // Show WebGPU options
            if (webgpuOptions) webgpuOptions.style.display = 'block';
            console.log('🚀 WebGPU renderer enabled');
            NotificationHelper.show({
              title: '🚀 WebGPU Mode Active',
              message: 'Experimental WebGPU. Some materials may not render correctly.',
              type: 'info',
              duration: 5000
            });
          } else {
            statusIcon.textContent = '✅';
            statusText.textContent = 'Available';
            statusText.style.color = '#4ade80';
            // Hide WebGPU options
            if (webgpuOptions) webgpuOptions.style.display = 'none';
            console.log('🔄 Switched back to WebGL');
            NotificationHelper.show({
              title: '🔄 WebGL Mode Active',
              message: 'Switched back to WebGL renderer with full effects.',
              type: 'success',
              duration: 4000
            });
          }
        } else {
          toggle.checked = false;
          statusIcon.textContent = '❌';
          statusText.textContent = 'Failed';
          statusText.style.color = '#f87171';
          // Hide WebGPU options
          if (webgpuOptions) webgpuOptions.style.display = 'none';
          NotificationHelper.show({
            title: '❌ WebGPU Failed',
            message: 'Could not initialize WebGPU. Your browser may not support it.',
            type: 'error',
            duration: 5000
          });
        }
      } catch (error) {
        console.error('WebGPU toggle error:', error);
        toggle.checked = false;
        statusIcon.textContent = '❌';
        statusText.textContent = 'Error';
        statusText.style.color = '#f87171';
        // Hide WebGPU options
        if (webgpuOptions) webgpuOptions.style.display = 'none';

        NotificationHelper.show({
          title: '❌ Error',
          message: 'An unexpected error occurred while switching renderers.',
          type: 'error',
          duration: 5000
        });
      }
      
      toggle.disabled = false;
    });
  }

  /**
   * Sets up WebGPU options (tone mapping, exposure, shadows, ground plane)
   */
  private setupWebGPUOptions(): void {
    const toneMappingSelect = document.getElementById('toneMappingSelect') as HTMLSelectElement;
    const exposureSlider = document.getElementById('exposureSlider') as HTMLInputElement;
    const exposureValue = document.getElementById('exposureValue');
    const shadowsToggle = document.getElementById('webgpuShadowsToggle') as HTMLInputElement;
    const shadowAngleSlider = document.getElementById('shadowAngleSlider') as HTMLInputElement;
    const shadowAngleValue = document.getElementById('shadowAngleValue');
    const shadowElevationSlider = document.getElementById('shadowElevationSlider') as HTMLInputElement;
    const shadowElevationValue = document.getElementById('shadowElevationValue');
    const groundPlaneToggle = document.getElementById('webgpuGroundPlaneToggle') as HTMLInputElement;
    const edgesToggle = document.getElementById('webgpuEdgesToggle') as HTMLInputElement;
    const edgeThresholdControl = document.getElementById('edgeThresholdControl');
    const edgeThresholdSlider = document.getElementById('edgeThresholdSlider') as HTMLInputElement;
    const edgeThresholdValue = document.getElementById('edgeThresholdValue');
    const statsToggle = document.getElementById('webgpuStatsToggle') as HTMLInputElement;
    const frustumCullingToggle = document.getElementById('webgpuFrustumCullingToggle') as HTMLInputElement;
    const shadowQualitySelect = document.getElementById('shadowQualitySelect') as HTMLSelectElement;
    const performancePresetSelect = document.getElementById('performancePresetSelect') as HTMLSelectElement;
    
    // Tone mapping change
    if (toneMappingSelect) {
      toneMappingSelect.addEventListener('change', () => {
        const value = parseInt(toneMappingSelect.value);
        this.viewer?.setWebGPUToneMapping(value);
      });
    }
    
    // Exposure slider change
    if (exposureSlider && exposureValue) {
      exposureSlider.addEventListener('input', () => {
        const value = parseFloat(exposureSlider.value);
        exposureValue.textContent = value.toFixed(1);
        this.viewer?.setWebGPUExposure(value);
      });
    }
    
    // Shadows toggle
    if (shadowsToggle) {
      shadowsToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUShadows(shadowsToggle.checked);
      });
    }
    
    // Shadow angle slider
    if (shadowAngleSlider && shadowAngleValue) {
      shadowAngleSlider.addEventListener('input', () => {
        const value = parseInt(shadowAngleSlider.value);
        shadowAngleValue.textContent = `${value}°`;
        this.viewer?.setWebGPUShadowAngle(value);
      });
    }
    
    // Shadow elevation slider
    if (shadowElevationSlider && shadowElevationValue) {
      shadowElevationSlider.addEventListener('input', () => {
        const value = parseInt(shadowElevationSlider.value);
        shadowElevationValue.textContent = `${value}°`;
        this.viewer?.setWebGPUShadowElevation(value);
      });
    }
    
    // Ground plane toggle
    if (groundPlaneToggle) {
      groundPlaneToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUGroundPlane(groundPlaneToggle.checked);
      });
    }
    
    // Edges toggle
    if (edgesToggle && edgeThresholdControl) {
      edgesToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUEdges(edgesToggle.checked);
        // Show/hide threshold slider
        edgeThresholdControl.style.display = edgesToggle.checked ? 'block' : 'none';
      });
    }
    
    // Edge threshold slider
    if (edgeThresholdSlider && edgeThresholdValue) {
      edgeThresholdSlider.addEventListener('input', () => {
        const value = parseInt(edgeThresholdSlider.value);
        edgeThresholdValue.textContent = `${value}°`;
        this.viewer?.setWebGPUEdgeThreshold(value);
      });
    }
    
    // Outline/Selection Highlight controls
    const outlineToggle = document.getElementById('webgpuOutlineToggle') as HTMLInputElement;
    const outlineSelectionColor = document.getElementById('outlineSelectionColor') as HTMLInputElement;
    
    if (outlineToggle) {
      outlineToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUOutlineEnabled(outlineToggle.checked);
      });
    }
    
    if (outlineSelectionColor) {
      outlineSelectionColor.addEventListener('change', () => {
        this.viewer?.setWebGPUOutlineSelectionColor(outlineSelectionColor.value);
      });
    }
    
    // Fog controls
    const fogToggle = document.getElementById('webgpuFogToggle') as HTMLInputElement;
    const fogTypeSelect = document.getElementById('fogTypeSelect') as HTMLSelectElement;
    const fogTypeControl = document.getElementById('fogTypeControl');
    const fogDensitySlider = document.getElementById('fogDensitySlider') as HTMLInputElement;
    const fogDensityValue = document.getElementById('fogDensityValue');
    const fogDensityControl = document.getElementById('fogDensityControl');
    const fogNearSlider = document.getElementById('fogNearSlider') as HTMLInputElement;
    const fogNearValue = document.getElementById('fogNearValue');
    const fogNearControl = document.getElementById('fogNearControl');
    const fogFarSlider = document.getElementById('fogFarSlider') as HTMLInputElement;
    const fogFarValue = document.getElementById('fogFarValue');
    const fogFarControl = document.getElementById('fogFarControl');
    const fogColorPicker = document.getElementById('fogColorPicker') as HTMLInputElement;
    const fogColorControl = document.getElementById('fogColorControl');
    const fogPresetSelect = document.getElementById('fogPresetSelect') as HTMLSelectElement;
    const fogPresetControl = document.getElementById('fogPresetControl');
    const fogAutoConfigBtn = document.getElementById('fogAutoConfigBtn') as HTMLButtonElement;
    const fogAutoConfigControl = document.getElementById('fogAutoConfigControl');
    
    // Helper to show/hide fog controls based on type
    const updateFogTypeControls = (type: string) => {
      const isLinear = type === 'linear';
      if (fogDensityControl) fogDensityControl.style.display = isLinear ? 'none' : 'block';
      if (fogNearControl) fogNearControl.style.display = isLinear ? 'block' : 'none';
      if (fogFarControl) fogFarControl.style.display = isLinear ? 'block' : 'none';
    };
    
    if (fogToggle) {
      fogToggle.addEventListener('change', () => {
        const enabled = fogToggle.checked;
        this.viewer?.setWebGPUFogEnabled(enabled);
        
        // Show/hide fog controls based on toggle
        if (fogTypeControl) fogTypeControl.style.display = enabled ? 'block' : 'none';
        if (fogColorControl) fogColorControl.style.display = enabled ? 'block' : 'none';
        if (fogPresetControl) fogPresetControl.style.display = enabled ? 'block' : 'none';
        if (fogAutoConfigControl) fogAutoConfigControl.style.display = enabled ? 'block' : 'none';
        
        if (enabled) {
          updateFogTypeControls(fogTypeSelect?.value || 'exponential2');
        } else {
          if (fogDensityControl) fogDensityControl.style.display = 'none';
          if (fogNearControl) fogNearControl.style.display = 'none';
          if (fogFarControl) fogFarControl.style.display = 'none';
        }
      });
    }
    
    if (fogTypeSelect) {
      fogTypeSelect.addEventListener('change', () => {
        const type = fogTypeSelect.value as 'linear' | 'exponential' | 'exponential2';
        this.viewer?.setWebGPUFogType(type);
        updateFogTypeControls(type);
      });
    }
    
    if (fogDensitySlider && fogDensityValue) {
      fogDensitySlider.addEventListener('input', () => {
        const value = parseFloat(fogDensitySlider.value);
        fogDensityValue.textContent = value.toFixed(4);
        this.viewer?.setWebGPUFogDensity(value);
      });
    }
    
    if (fogNearSlider && fogNearValue) {
      fogNearSlider.addEventListener('input', () => {
        const value = parseFloat(fogNearSlider.value);
        fogNearValue.textContent = value.toFixed(0);
        this.viewer?.setWebGPUFogNear(value);
      });
    }
    
    if (fogFarSlider && fogFarValue) {
      fogFarSlider.addEventListener('input', () => {
        const value = parseFloat(fogFarSlider.value);
        fogFarValue.textContent = value.toFixed(0);
        this.viewer?.setWebGPUFogFar(value);
      });
    }
    
    if (fogColorPicker) {
      fogColorPicker.addEventListener('change', () => {
        this.viewer?.setWebGPUFogColor(fogColorPicker.value);
      });
    }
    
    if (fogPresetSelect) {
      fogPresetSelect.addEventListener('change', () => {
        const preset = fogPresetSelect.value as 'light' | 'medium' | 'heavy' | 'blue' | 'warm' | '';
        if (preset) {
          this.viewer?.applyWebGPUFogPreset(preset);
        }
      });
    }
    
    if (fogAutoConfigBtn) {
      fogAutoConfigBtn.addEventListener('click', () => {
        this.viewer?.autoConfigureWebGPUFog();
      });
    }
    
    // LOD controls (2-tier system)
    const lodToggle = document.getElementById('webgpuLODToggle') as HTMLInputElement;
    const lodDetailDistanceSlider = document.getElementById('lodDetailDistanceSlider') as HTMLInputElement;
    const lodDetailDistanceValue = document.getElementById('lodDetailDistanceValue');
    const lodDetailDistanceControl = document.getElementById('lodDetailDistanceControl');
    const lodImpostorDistanceSlider = document.getElementById('lodImpostorDistanceSlider') as HTMLInputElement;
    const lodImpostorDistanceValue = document.getElementById('lodImpostorDistanceValue');
    const lodImpostorDistanceControl = document.getElementById('lodImpostorDistanceControl');
    const lodImpostorToggle = document.getElementById('webgpuLODImpostorToggle') as HTMLInputElement;
    const lodImpostorControl = document.getElementById('lodImpostorControl');
    const lodStatsDisplay = document.getElementById('lodStatsDisplay');
    const lodStatsText = document.getElementById('lodStatsText');
    
    // LOD stats update interval
    let lodStatsInterval: number | null = null;
    
    if (lodToggle) {
      lodToggle.addEventListener('change', () => {
        const enabled = lodToggle.checked;
        this.viewer?.setWebGPULODEnabled(enabled);
        
        // Show/hide LOD controls
        if (lodDetailDistanceControl) lodDetailDistanceControl.style.display = enabled ? 'block' : 'none';
        if (lodImpostorDistanceControl) lodImpostorDistanceControl.style.display = enabled ? 'block' : 'none';
        if (lodImpostorControl) lodImpostorControl.style.display = enabled ? 'flex' : 'none';
        if (lodStatsDisplay) lodStatsDisplay.style.display = enabled ? 'block' : 'none';
        
        // Start/stop stats update
        if (enabled) {
          const lodTriangleStats = document.getElementById('lodTriangleStats');
          lodStatsInterval = window.setInterval(() => {
            const stats = this.viewer?.getWebGPULODStats();
            if (stats && lodStatsText) {
              lodStatsText.textContent = `Full: ${stats.fullDetail} | Simplified: ${stats.simplified} | Impostor: ${stats.impostor}`;
              if (lodTriangleStats) {
                const savedPercent = stats.originalTriangles > 0 ? Math.round((stats.trianglesSaved / stats.originalTriangles) * 100) : 0;
                lodTriangleStats.textContent = `Tris: ${stats.originalTriangles.toLocaleString()} → ${stats.currentTriangles.toLocaleString()} (${savedPercent}% saved)`;
              }
            }
          }, 500);
        } else if (lodStatsInterval) {
          clearInterval(lodStatsInterval);
          lodStatsInterval = null;
        }
      });
    }
    
    if (lodDetailDistanceSlider && lodDetailDistanceValue) {
      lodDetailDistanceSlider.addEventListener('input', () => {
        const value = parseFloat(lodDetailDistanceSlider.value);
        lodDetailDistanceValue.textContent = value.toFixed(0);
        this.viewer?.setWebGPULODHighDistance(value); // Uses legacy method that maps to setDetailDistance
      });
    }
    
    if (lodImpostorDistanceSlider && lodImpostorDistanceValue) {
      lodImpostorDistanceSlider.addEventListener('input', () => {
        const value = parseFloat(lodImpostorDistanceSlider.value);
        lodImpostorDistanceValue.textContent = value.toFixed(0);
        this.viewer?.setWebGPULODMediumDistance(value); // Uses legacy method that maps to setImpostorDistance
      });
    }
    
    if (lodImpostorToggle) {
      lodImpostorToggle.addEventListener('change', () => {
        this.viewer?.setWebGPULODShowImpostors(lodImpostorToggle.checked);
      });
    }
    
    // Stats toggle
    if (statsToggle) {
      statsToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUStats(statsToggle.checked);
      });
    }
    
    // Frustum culling toggle
    if (frustumCullingToggle) {
      frustumCullingToggle.addEventListener('change', () => {
        this.viewer?.setWebGPUFrustumCulling(frustumCullingToggle.checked);
      });
    }
    
    // Shadow quality select
    if (shadowQualitySelect) {
      shadowQualitySelect.addEventListener('change', () => {
        const resolution = parseInt(shadowQualitySelect.value);
        this.viewer?.setWebGPUShadowQuality(resolution);
      });
    }
    
    // Performance preset select
    if (performancePresetSelect) {
      performancePresetSelect.addEventListener('change', () => {
        const preset = performancePresetSelect.value as 'low' | 'medium' | 'high' | '';
        if (preset) {
          this.viewer?.applyWebGPUPerformancePreset(preset);
          
          // Update UI to reflect preset settings
          if (preset === 'low') {
            if (shadowsToggle) shadowsToggle.checked = false;
            if (edgesToggle) edgesToggle.checked = false;
            if (shadowQualitySelect) shadowQualitySelect.value = '512';
          } else if (preset === 'medium') {
            if (shadowsToggle) shadowsToggle.checked = true;
            if (edgesToggle) edgesToggle.checked = false;
            if (shadowQualitySelect) shadowQualitySelect.value = '1024';
          } else if (preset === 'high') {
            if (shadowsToggle) shadowsToggle.checked = true;
            if (edgesToggle) edgesToggle.checked = true;
            if (edgeThresholdControl) edgeThresholdControl.style.display = 'block';
            if (shadowQualitySelect) shadowQualitySelect.value = '2048';
          }
        }
      });
    }
  }

  /**
   * Handles toolbar button actions
   */
  private handleToolbarAction(action: string): void {
    switch(action) {
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
    if (!this.viewer) {
      console.warn('⚠️ Viewer reference not available');
      return;
    }

    const spaceVisibility = this.viewer.getSpaceVisibility();
    if (!spaceVisibility) {
      console.warn('⚠️ Space visibility module not initialized');
      return;
    }

    try {
      const spacesHidden = await spaceVisibility.toggleSpaceVisibility();
      
      // Also update WebGPU if active
      if (this.viewer.isWebGPUActive()) {
        await this.viewer.setWebGPUSpacesVisible(!spacesHidden);
      }
      
      // Update button label
      const toggleBtn = document.getElementById('toggleSpacesBtn');
      if (toggleBtn) {
        const label = toggleBtn.querySelector('.label');
        if (label) {
          label.textContent = spacesHidden ? 'Show Spaces' : 'Hide Spaces';
        }
      }
    } catch (error) {
      console.error('❌ Error toggling spaces:', error);
    }
  }

  /**
   * Handles toggling grid visibility
   */
  private handleToggleGrid(): void {
    try {
      const currentlyVisible = this.worldManager.isGridVisible();
      this.worldManager.setGridVisible(!currentlyVisible);
      
      // Update button label
      const toggleBtn = document.getElementById('toggleGridBtn');
      if (toggleBtn) {
        const label = toggleBtn.querySelector('.label');
        if (label) {
          label.textContent = currentlyVisible ? 'Show Grid' : 'Hide Grid';
        }
      }
    } catch (error) {
      console.error('❌ Error toggling grid:', error);
    }
  }

  /**
   * Handles auto rotate - starts/stops gentle rotation of the 3D view
   */
  private handleAutoRotate(): void {
    if (this.isAutoRotating) {
      this.stopAutoRotate();
      return;
    }

    // Show duration picker dialog
    this.showAutoRotateDurationPicker();
  }

  /**
   * Shows a simple duration picker for auto rotate
   */
  private showAutoRotateDurationPicker(): void {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'autoRotateModal';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: rgba(40, 40, 70, 0.98);
      border-radius: 12px;
      padding: 24px;
      min-width: 280px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.1);
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: white; font-size: 16px; display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-sync-alt" style="color: #60a5fa;"></i>
        Auto Rotate
      </h3>
      <p style="color: #aaa; font-size: 13px; margin: 0 0 16px 0;">
        Set rotation duration (click anywhere to stop)
      </p>
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <input type="number" id="autoRotateMinutes" value="1" min="0.5" max="60" step="0.5"
          style="width: 80px; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);
                 background: rgba(0,0,0,0.3); color: white; font-size: 14px; text-align: center;">
        <span style="color: #aaa; font-size: 14px;">minutes</span>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="autoRotateCancel" style="padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);
                background: transparent; color: #aaa; cursor: pointer; font-size: 13px;">
          Cancel
        </button>
        <button id="autoRotateStart" style="padding: 8px 20px; border-radius: 6px; border: none;
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; cursor: pointer; font-size: 13px; font-weight: 600;">
          Start
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Event listeners
    const cancelBtn = document.getElementById('autoRotateCancel');
    const startBtn = document.getElementById('autoRotateStart');
    const minutesInput = document.getElementById('autoRotateMinutes') as HTMLInputElement;

    cancelBtn?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    startBtn?.addEventListener('click', () => {
      const minutes = parseFloat(minutesInput?.value || '1');
      this.autoRotateDuration = minutes * 60 * 1000; // Convert to ms
      overlay.remove();
      this.startAutoRotate();
    });

    // Focus on input
    minutesInput?.focus();
    minutesInput?.select();
  }

  /**
   * Starts the auto rotate animation
   */
  private startAutoRotate(): void {
    if (!this.viewer) {
      console.warn('⚠️ Viewer not available for auto rotate');
      return;
    }

    const world = this.worldManager.world;
    if (!world?.camera) {
      console.warn('⚠️ Camera not available');
      return;
    }

    const camera = world.camera as any;
    if (!camera.controls) {
      console.warn('⚠️ Camera controls not available');
      return;
    }

    // Get model center using BoundingBoxer
    const components = this.worldManager.getComponents();
    if (!components) {
      console.warn('⚠️ Components not available');
      return;
    }
    
    const bbox = components.get(OBC.BoundingBoxer);
    bbox.list.clear();
    bbox.addFromModels();
    const box = bbox.get();
    const modelCenter = box.getCenter(new THREE.Vector3());

    // Get current camera position
    const cameraPos = world.camera.three.position.clone();
    
    // Calculate distance from camera to current target
    const currentTarget = new THREE.Vector3();
    camera.controls.getTarget(currentTarget);
    const distance = cameraPos.distanceTo(currentTarget);

    // Set camera to look at model center, maintaining same distance
    const direction = cameraPos.clone().sub(currentTarget).normalize();
    const newCameraPos = modelCenter.clone().add(direction.multiplyScalar(distance));
    
    // Smoothly transition to the new position looking at model center
    camera.controls.setLookAt(
      newCameraPos.x, newCameraPos.y, newCameraPos.z,
      modelCenter.x, modelCenter.y, modelCenter.z,
      true // Enable smooth transition
    );

    this.isAutoRotating = true;
    this.autoRotateStartTime = Date.now();

    // Update button state
    const btn = document.getElementById('autoRotateBtn');
    if (btn) {
      btn.classList.add('active');
      const label = btn.querySelector('.label');
      if (label) label.textContent = 'Stop Rotate';
      const icon = btn.querySelector('.icon i');
      if (icon) icon.classList.add('fa-spin');
    }

    // Add click handler to stop rotation (with delay to avoid immediate stop)
    setTimeout(() => {
      this.autoRotateClickHandler = (e: MouseEvent) => {
        // Ignore clicks on the auto rotate button itself
        const target = e.target as HTMLElement;
        if (target.closest('#autoRotateBtn')) return;
        this.stopAutoRotate();
      };
      document.addEventListener('click', this.autoRotateClickHandler);
      document.addEventListener('mousedown', this.autoRotateClickHandler);
    }, 500);

    // Show notification
    const minutes = this.autoRotateDuration / 60000;
    import('./ui/NotificationHelper').then(({ NotificationHelper }) => {
      NotificationHelper.show({
        title: '🔄 Auto Rotate Started',
        message: `Rotating for ${minutes} minute${minutes !== 1 ? 's' : ''}. Click anywhere to stop.`,
        type: 'info',
        duration: 3000
      });
    });

    console.log(`🔄 Auto rotate started for ${minutes} minutes`);

    // Animation loop using CameraControls API
    const controls = camera.controls;
    const rotateSpeed = 0.02; // Radians per frame (gentle rotation)

    const animate = () => {
      if (!this.isAutoRotating) return;

      // Check if duration exceeded
      const elapsed = Date.now() - this.autoRotateStartTime;
      if (elapsed >= this.autoRotateDuration) {
        this.stopAutoRotate();
        return;
      }

      // Rotate camera using azimuthAngle (CameraControls property)
      if (typeof controls.azimuthAngle === 'number') {
        controls.azimuthAngle += rotateSpeed;
      }

      this.autoRotateAnimationId = requestAnimationFrame(animate);
    };

    this.autoRotateAnimationId = requestAnimationFrame(animate);
  }

  /**
   * Stops the auto rotate animation
   */
  private stopAutoRotate(): void {
    this.isAutoRotating = false;

    if (this.autoRotateAnimationId !== null) {
      cancelAnimationFrame(this.autoRotateAnimationId);
      this.autoRotateAnimationId = null;
    }

    // Remove click handler
    if (this.autoRotateClickHandler) {
      document.removeEventListener('click', this.autoRotateClickHandler);
      document.removeEventListener('mousedown', this.autoRotateClickHandler);
      this.autoRotateClickHandler = null;
    }

    // Update button state
    const btn = document.getElementById('autoRotateBtn');
    if (btn) {
      btn.classList.remove('active');
      const label = btn.querySelector('.label');
      if (label) label.textContent = 'Auto Rotate';
      const icon = btn.querySelector('.icon i');
      if (icon) icon.classList.remove('fa-spin');
    }

    console.log('🛑 Auto rotate stopped');
  }

  /**
   * Handles toggling first person camera mode
   */
  private async handleToggleFirstPerson(): Promise<void> {
    if (!this.viewer) {
      console.warn('⚠️ Viewer reference not available');
      return;
    }

    const worldManager = this.viewer.getWorldManager();
    if (!worldManager) {
      console.warn('⚠️ World manager not available');
      return;
    }

    try {
      const currentMode = worldManager.getNavigationMode();
      const newMode = currentMode === 'FirstPerson' ? 'Orbit' : 'FirstPerson';
      
      await worldManager.setNavigationMode(newMode);
      
      // Update button state
      this.updateFirstPersonButtonState(newMode === 'FirstPerson');
      
      console.log(`✅ Camera mode: ${newMode}`);
    } catch (error) {
      console.error('❌ Error toggling first person:', error);
    }
  }

  /**
   * Handles toggling keyboard walk controls (WASD)
   */
  private async handleToggleWalkControls(): Promise<void> {
    if (!this.viewer) {
      console.warn('⚠️ Viewer reference not available');
      return;
    }

    const firstPersonControls = this.viewer.getFirstPersonControls();
    if (!firstPersonControls) {
      console.warn('⚠️ First person controls not available');
      return;
    }

    try {
      const isActive = firstPersonControls.isActive();
      
      if (isActive) {
        firstPersonControls.disable();
      } else {
        firstPersonControls.enable();
      }
      
      // Update button state and show/hide speed slider
      this.updateWalkControlsButtonState(!isActive);
      
      console.log(`✅ Walk controls: ${!isActive ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('❌ Error toggling walk controls:', error);
    }
  }

  /**
   * Handles toggling the minimap display
   */
  private async handleToggleMinimap(): Promise<void> {
    if (!this.minimapModule) {
      console.warn('⚠️ Minimap module not available');
      this.showErrorNotification('Minimap Not Available', 'Minimap module is not initialized yet.');
      return;
    }

    try {
      const isActive = this.minimapModule.isActive();
      
      if (isActive) {
        this.minimapModule.disable();
      } else {
        // Enable minimap (will auto-detect current storey)
        await this.minimapModule.enable();
      }
      
      // Update button state
      this.updateMinimapButtonState(!isActive);
      
      console.log(`✅ Minimap: ${!isActive ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('❌ Error toggling minimap:', error);
      this.showErrorNotification('Minimap Error', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Updates the minimap button visual state
   */
  private updateMinimapButtonState(isActive: boolean): void {
    const minimapBtn = document.getElementById('minimapBtn');
    if (!minimapBtn) return;

    const label = minimapBtn.querySelector('.label');
    if (label) {
      label.textContent = isActive ? 'Hide Minimap' : 'Show Minimap';
    }

    if (isActive) {
      minimapBtn.style.background = 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)';
      minimapBtn.style.color = 'white';
    } else {
      minimapBtn.style.background = '';
      minimapBtn.style.color = '';
    }
  }

  /**
   * Updates the first person button visual state
   */
  private updateFirstPersonButtonState(isActive: boolean): void {
    const fpBtn = document.getElementById('firstPersonBtn');
    if (!fpBtn) return;

    if (isActive) {
      fpBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      fpBtn.style.color = 'white';
      const label = fpBtn.querySelector('.label');
      if (label) {
        label.textContent = 'Exit FP View';
      }
    } else {
      fpBtn.style.background = '';
      fpBtn.style.color = '';
      const label = fpBtn.querySelector('.label');
      if (label) {
        label.textContent = 'First Person';
      }
    }
  }

  /**
   * Updates the walk controls button visual state
   */
  private updateWalkControlsButtonState(isActive: boolean): void {
    const walkBtn = document.getElementById('walkControlsBtn');
    const speedContainer = document.getElementById('walkSpeedContainer');
    
    if (!walkBtn) return;

    if (isActive) {
      walkBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      walkBtn.style.color = 'white';
      const label = walkBtn.querySelector('.label');
      if (label) {
        label.textContent = 'Walking...';
      }
      // Show speed slider
      if (speedContainer) {
        speedContainer.style.display = 'block';
      }
    } else {
      walkBtn.style.background = '';
      walkBtn.style.color = '';
      const label = walkBtn.querySelector('.label');
      if (label) {
        label.textContent = 'Walk (WASD)';
      }
      // Hide speed slider
      if (speedContainer) {
        speedContainer.style.display = 'none';
      }
    }
  }

  /**
   * Handles toggling walk mode (merged: first person + keyboard controls)
   */
  private async handleToggleWalkMode(): Promise<void> {
    if (!this.viewer) {
      console.warn('⚠️ Viewer reference not available');
      return;
    }

    const worldManager = this.viewer.getWorldManager();
    const firstPersonControls = this.viewer.getFirstPersonControls();
    
    if (!worldManager || !firstPersonControls) {
      console.warn('⚠️ Walk mode components not available');
      return;
    }

    try {
      const currentMode = worldManager.getNavigationMode();
      const isWalking = currentMode === 'FirstPerson' && firstPersonControls.isActive();
      
      if (isWalking) {
        // Exit walk mode
        await worldManager.setNavigationMode('Orbit');
        firstPersonControls.disable();
      } else {
        // Enter walk mode (both first person camera + keyboard controls)
        await worldManager.setNavigationMode('FirstPerson');
        firstPersonControls.enable();
      }
      
      // Update button and show/hide speed panel
      this.updateWalkModeButtonState(!isWalking);
      
      console.log(`✅ Walk mode: ${!isWalking ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('❌ Error toggling walk mode:', error);
    }
  }

  /**
   * Handles canceling walk mode (returns to orbit mode)
   */
  private async handleCancelWalkMode(): Promise<void> {
    if (!this.viewer) {
      console.warn('⚠️ Viewer reference not available');
      return;
    }

    const worldManager = this.viewer.getWorldManager();
    const firstPersonControls = this.viewer.getFirstPersonControls();
    
    if (!worldManager || !firstPersonControls) {
      console.warn('⚠️ Walk mode components not available');
      return;
    }

    try {
      // Exit walk mode
      await worldManager.setNavigationMode('Orbit');
      firstPersonControls.disable();
      
      // Update button state
      this.updateWalkModeButtonState(false);
      
      console.log('✅ Walk mode canceled');
    } catch (error) {
      console.error('❌ Error canceling walk mode:', error);
    }
  }

  /**
   * Updates the walk mode button visual state
   */
  private updateWalkModeButtonState(isActive: boolean): void {
    const walkBtn = document.getElementById('walkModeBtn');
    const walkIndicator = document.getElementById('walkIndicator');
    const crosshair = document.getElementById('walkCrosshair');
    const helper = document.getElementById('walkHelper');
    
    if (!walkBtn) return;

    if (isActive) {
      walkBtn.classList.add('active');
      // Show indicator
      if (walkIndicator) {
        walkIndicator.style.display = 'block';
      }
      // Show crosshair
      if (crosshair) {
        crosshair.classList.add('visible');
      }
      // Show helper
      if (helper) {
        helper.classList.add('visible');
      }
    } else {
      walkBtn.classList.remove('active');
      // Hide indicator
      if (walkIndicator) {
        walkIndicator.style.display = 'none';
      }
      // Hide crosshair
      if (crosshair) {
        crosshair.classList.remove('visible');
      }
      // Hide helper
      if (helper) {
        helper.classList.remove('visible');
      }
    }
  }

  /**
   * Enforces safe visual style when sectioning is active
   * Pen styles (1, 2, 3, 5) cause freezes with sectioning, so we force Realistic (4)
   */
  private setSafeVisualStyle(enabled: boolean): void {
    const styleSelect = document.getElementById('visualStyleSelect') as HTMLSelectElement;
    if (!styleSelect) return;

    if (enabled) {
      // Store current style if needed, but for now just force Realistic
      // Check if current style is a Pen style (1, 2, 3, 5)
      const currentStyle = parseInt(styleSelect.value);
      const isPenStyle = [1, 2, 3, 5].includes(currentStyle);
      
      if (isPenStyle) {
        // Force switch to Realistic
        styleSelect.value = "4";
        this.worldManager.setPostproductionStyle(4);
        console.log('🛡️ Switched to Realistic style for safe sectioning');
        
        // Show notification
        import('./ui/NotificationHelper').then(({ NotificationHelper }) => {
          NotificationHelper.show({
            title: 'Visual Style Adjusted',
            message: 'Pen styles are disabled during sectioning to prevent performance issues.',
            type: 'info',
            duration: 4000
          });
        });
      }
      
      // Disable the options in the dropdown that are unsafe
      Array.from(styleSelect.options).forEach(option => {
        const val = parseInt(option.value);
        if ([1, 2, 3, 5].includes(val)) {
          option.disabled = true;
        }
      });
      
    } else {
      // Re-enable all options
      Array.from(styleSelect.options).forEach(option => {
        option.disabled = false;
      });
    }
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
    if (!this.viewer) {
      console.warn('⚠️ Viewer reference not available');
      return;
    }

    // Prevent enabling sectioning while in cluster mode
    if (this.clusterModule?.isClusteringActive()) {
      console.warn('⚠️ Sectioning is disabled while in cluster mode');
      // Show a notification to the user
      import('./ui/NotificationHelper').then(({ NotificationHelper }) => {
        NotificationHelper.show({
          title: 'Sectioning Unavailable',
          message: 'Sectioning is disabled in cluster mode. Exit cluster mode first.',
          type: 'warning',
          duration: 4000
        });
      });
      return;
    }

    // Sectioning is NOT supported in WebGPU mode
    if (this.isWebGPUMode()) {
      console.warn('⚠️ Sectioning is not supported in WebGPU mode');
      import('./ui/NotificationHelper').then(({ NotificationHelper }) => {
        NotificationHelper.show({
          title: 'Sectioning Unavailable',
          message: 'Sectioning is not supported in WebGPU mode. Switch to WebGL mode to use sectioning.',
          type: 'warning',
          duration: 4000
        });
      });
      return;
    }

    // WebGL mode - use OBC.Clipper
    const clipper = this.viewer.getClipper();
    if (!clipper) {
      console.warn('⚠️ Clipper module not initialized');
      return;
    }

    try {
      clipper.toggle();
      const isEnabled = clipper.getEnabled();
      
      // Enforce safe visual style
      this.setSafeVisualStyle(isEnabled);
      
      // Update button style to show active state
      this.updateClipperButtonState(isEnabled);
      
      console.log(`✂️ Clipper ${isEnabled ? 'enabled' : 'disabled'}`);
      if (isEnabled) {
        console.log(`   Double-click to create plane, Delete to remove`);
      }
    } catch (error) {
      console.error('❌ Error toggling clipper:', error);
    }
  }

  /**
   * Handles preset clipping planes (X, Y, Z axis)
   * NOTE: Sectioning is NOT supported in WebGPU mode
   */
  private handleClipperPreset(axis: 'x' | 'y' | 'z'): void {
    if (!this.viewer) {
      console.warn('⚠️ Viewer reference not available');
      return;
    }

    // Prevent enabling sectioning while in cluster mode
    if (this.clusterModule?.isClusteringActive()) {
      console.warn('⚠️ Sectioning is disabled while in cluster mode');
      import('./ui/NotificationHelper').then(({ NotificationHelper }) => {
        NotificationHelper.show({
          title: 'Sectioning Unavailable',
          message: 'Sectioning is disabled in cluster mode. Exit cluster mode first.',
          type: 'warning',
          duration: 4000
        });
      });
      return;
    }

    // Sectioning is NOT supported in WebGPU mode
    if (this.isWebGPUMode()) {
      console.warn('⚠️ Sectioning is not supported in WebGPU mode');
      import('./ui/NotificationHelper').then(({ NotificationHelper }) => {
        NotificationHelper.show({
          title: 'Sectioning Unavailable',
          message: 'Sectioning is not supported in WebGPU mode. Switch to WebGL mode to use sectioning.',
          type: 'warning',
          duration: 4000
        });
      });
      return;
    }

    // WebGL mode - use OBC.Clipper
    const clipper = this.viewer.getClipper();
    if (!clipper) {
      console.warn('⚠️ Clipper module not initialized');
      return;
    }

    try {
      // Enable clipper if not already enabled
      if (!clipper.getEnabled()) {
        clipper.setEnabled(true);
        this.updateClipperButtonState(true);
        this.setSafeVisualStyle(true);
      }

      // Create the preset plane
      switch(axis) {
        case 'x':
          clipper.createXAxisPlane();
          break;
        case 'y':
          clipper.createYAxisPlane();
          break;
        case 'z':
          clipper.createZAxisPlane();
          break;
      }
    } catch (error) {
      console.error(`❌ Error creating ${axis.toUpperCase()}-axis plane:`, error);
    }
  }

  /**
   * Enables surface click mode for creating clipping planes
   * Double-click on any surface to create a section plane at that point
   * Works with both WebGL and WebGPU modes
   */
  private handleClipperSurfaceMode(): void {
    if (!this.viewer) {
      console.warn('⚠️ Viewer reference not available');
      return;
    }

    // Check if in WebGPU mode
    if (this.isWebGPUMode()) {
      const webgpuRenderer = this.viewer.getWebGPURenderer();
      if (webgpuRenderer) {
        webgpuRenderer.setSectionModeEnabled(true);
        this.updateClipperButtonState(true);
        this.setSafeVisualStyle(true);
        
        const surfaceBtn = document.getElementById('clipperSurfaceBtn');
        if (surfaceBtn) {
          surfaceBtn.classList.add('active');
        }
        
        console.log('🎯 WebGPU surface section mode enabled - Double-click on any surface to create section plane');
        
        import('./ui/NotificationHelper').then(({ NotificationHelper }) => {
          NotificationHelper.show({
            title: '🎯 Click Surface Mode',
            message: 'Double-click on any surface to create a section plane at that point',
            type: 'info',
            duration: 3000
          });
        });
        return;
      }
    }

    // WebGL mode
    const clipper = this.viewer.getClipper();
    if (!clipper) {
      console.warn('⚠️ Clipper module not initialized');
      return;
    }

    try {
      // Enable clipper mode - this allows double-click to create planes on surfaces
      clipper.setEnabled(true);
      this.updateClipperButtonState(true);
      this.setSafeVisualStyle(true);
      
      // Update the surface button to show active state
      const surfaceBtn = document.getElementById('clipperSurfaceBtn');
      if (surfaceBtn) {
        surfaceBtn.classList.add('active');
      }
      
      console.log('🎯 Surface section mode enabled - Double-click on any surface to create section plane');
      
      // Show notification to guide the user
      import('./ui/NotificationHelper').then(({ NotificationHelper }) => {
        NotificationHelper.show({
          title: '🎯 Click Surface Mode',
          message: 'Double-click on any surface to create a section plane at that point',
          type: 'info',
          duration: 3000
        });
      });
    } catch (error) {
      console.error('❌ Error enabling surface section mode:', error);
    }
  }

  /**
   * Flips clipping planes to show the other side
   * Works with both WebGL and WebGPU modes
   */
  private handleClipperFlip(): void {
    if (!this.viewer) {
      console.warn('⚠️ Viewer reference not available');
      return;
    }

    // Check if in WebGPU mode
    if (this.isWebGPUMode()) {
      const webgpuRenderer = this.viewer.getWebGPURenderer();
      if (webgpuRenderer) {
        try {
          if (webgpuRenderer.getSectionPlaneCount() === 0) {
            console.warn('No section planes to flip');
            return;
          }
          webgpuRenderer.flipSectionPlanes();
          console.log('🔄 WebGPU section planes flipped');
        } catch (error) {
          console.error('❌ Error flipping WebGPU section planes:', error);
        }
        return;
      }
    }

    // WebGL mode
    const clipper = this.viewer.getClipper();
    if (!clipper) {
      console.warn('⚠️ Clipper module not initialized');
      return;
    }

    try {
      if (clipper.getPlaneCount() === 0) {
        console.warn('No clipping planes to flip');
        return;
      }
      
      clipper.flipClippingPlanes();
      console.log('🔄 Clipping planes flipped');
    } catch (error) {
      console.error('❌ Error flipping clipping planes:', error);
    }
  }

  /**
   * Handles canceling clipper mode (clears all planes and disables sectioning)
   * Works with both WebGL and WebGPU modes
   */
  private handleCancelClipperMode(): void {
    if (!this.viewer) {
      console.warn('⚠️ Viewer reference not available');
      return;
    }

    // Check if in WebGPU mode
    if (this.isWebGPUMode()) {
      const webgpuRenderer = this.viewer.getWebGPURenderer();
      if (webgpuRenderer) {
        try {
          // Clear all section planes
          webgpuRenderer.deleteAllSectionPlanes();
          console.log('🗑️ All WebGPU section planes cleared');
          
          // Disable section mode
          webgpuRenderer.setSectionModeEnabled(false);
          this.setSafeVisualStyle(false);
          
          // Update button states
          this.updateClipperButtonState(false);
          
          // Remove active state from surface button
          const surfaceBtn = document.getElementById('clipperSurfaceBtn');
          if (surfaceBtn) {
            surfaceBtn.classList.remove('active');
          }
          
          console.log('✅ WebGPU section mode canceled');
        } catch (error) {
          console.error('❌ Error canceling WebGPU section mode:', error);
        }
        return;
      }
    }

    // WebGL mode
    const clipper = this.viewer.getClipper();
    if (!clipper) {
      console.warn('⚠️ Clipper module not initialized');
      return;
    }

    try {
      // Clear all clipping planes first
      clipper.deleteAllPlanes();
      console.log('🗑️ All clipping planes cleared');
      
      // Then disable clipper
      clipper.setEnabled(false);
      this.setSafeVisualStyle(false);
      
      // Update button states
      this.updateClipperButtonState(false);
      
      // Remove active state from surface button
      const surfaceBtn = document.getElementById('clipperSurfaceBtn');
      if (surfaceBtn) {
        surfaceBtn.classList.remove('active');
      }
      
      console.log('✅ Clipper mode canceled');
    } catch (error) {
      console.error('❌ Error canceling clipper mode:', error);
    }
  }

  /**
   * Updates the clipper button visual state
   */
  private updateClipperButtonState(isEnabled: boolean): void {
    const clipperBtn = document.getElementById('clipperBtn');
    if (clipperBtn) {
      if (isEnabled) {
        clipperBtn.classList.add('active');
      } else {
        clipperBtn.classList.remove('active');
      }
    }
  }

  /**
   * Updates the measurement button state based on active measurement mode
   */
  private updateMeasurementButtonState(): void {
    const measureBtn = document.getElementById('measureBtn');
    if (!measureBtn) return;
    
    // Check if measurement module has an active mode
    const measurement = this.viewer?.getMeasurement?.();
    if (measurement) {
      const mode = measurement.getMode();
      // MeasurementMode.DISABLED = 'DISABLED', any other mode is active
      if (mode && mode !== 'DISABLED') {
        measureBtn.classList.add('active');
      } else {
        measureBtn.classList.remove('active');
      }
    } else {
      // No measurement module means not active
      measureBtn.classList.remove('active');
    }
  }

  /**
   * Toggles a submenu visibility
   */
  private toggleSubmenu(group: Element): void {
    const submenu = group.querySelector('.toolbar-submenu') as HTMLElement;
    if (!submenu) return;
    
    const isVisible = submenu.classList.contains('visible');
    
    // Close all other submenus and settings panel
    this.closeAllSubmenus(true);
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
    if (!skipShowTooltip && !this.isSubmenuOpen) {
      this.showModelTooltip();
    }
    
    // If all submenus are closed, update the flag
    if (!skipShowTooltip) {
      this.isSubmenuOpen = false;
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
  private showLoading(initialMessage: string = 'Initializing...', initialProgress: number = 0): Promise<void> {
    return new Promise((resolve) => {
      const indicator = document.getElementById('loadingIndicator');
      if (indicator) {
        indicator.style.display = 'flex';
        
        // Force browser to complete layout before updating progress
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Reset progress after layout is complete
            this.updateLoadingProgress(initialProgress, initialMessage);
            
            // Start rotating tips and jokes
            this.startLoadingRotation();
            
            // Resolve promise so file loading can start
            resolve();
          });
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Starts rotating tips and jokes every 3 seconds
   */
  private loadingRotationInterval: any = null;
  private isAnimating: boolean = false;
  
  private startLoadingRotation(): void {
    // Clear any existing interval
    if (this.loadingRotationInterval) {
      clearInterval(this.loadingRotationInterval);
    }
    
    // Wait a bit for DOM to be ready
    setTimeout(() => {
      const tipElement = document.getElementById('loadingTip');
      const jokeElement = document.getElementById('loadingJoke');
      
      if (!tipElement || !jokeElement) {
        return;
      }
      
      // Get tips and jokes from data attributes
      const tipsData = tipElement.getAttribute('data-tips');
      const jokesData = jokeElement.getAttribute('data-jokes');
      
      const tips = JSON.parse(tipsData || '[]');
      const jokes = JSON.parse(jokesData || '[]');
      
      let tipIndex = Math.floor(Math.random() * tips.length);
      let jokeIndex = Math.floor(Math.random() * jokes.length);
      
      this.loadingRotationInterval = setInterval(() => {
        const tip = document.getElementById('loadingTip');
        const joke = document.getElementById('loadingJoke');
        
        // Skip if already animating or elements don't exist
        if (!tip || !joke || this.isAnimating) {
          return;
        }
        
        this.isAnimating = true;
        tipIndex = (tipIndex + 1) % tips.length;
        jokeIndex = (jokeIndex + 1) % jokes.length;
        
        // Update content immediately without animation to prevent flickering
        tip.textContent = tips[tipIndex];
        joke.textContent = jokes[jokeIndex];
        
        // Mark animation complete
        this.isAnimating = false;
      }, 5000);
    }, 100);
  }

  /**
   * Updates loading progress with smooth animation
   */
  public updateLoadingProgress(progress: number, message: string): void {
    const progressFill = document.getElementById('loadingProgress');
    const progressText = document.getElementById('loadingProgressText');
    
    if (progressFill) {
      const targetProgress = Math.min(100, Math.max(0, progress));
      // Use transform instead of width for better performance and reliability
      const translateValue = -100 + targetProgress;
      progressFill.style.transform = `translateX(${translateValue}%)`;
    }
    
    if (progressText) {
      // Add more detailed progress messages
      let detailedMessage = message;
      if (progress < 10) {
        detailedMessage = 'Reading IFC file...';
      } else if (progress < 30) {
        detailedMessage = 'Parsing IFC structure...';
      } else if (progress < 50) {
        detailedMessage = 'Processing geometry...';
      } else if (progress < 70) {
        detailedMessage = 'Building 3D meshes...';
      } else if (progress < 90) {
        detailedMessage = 'Applying materials...';
      } else if (progress < 100) {
        detailedMessage = 'Finalizing model...';
      } else {
        detailedMessage = 'Complete!';
      }
      progressText.textContent = `${detailedMessage} ${Math.round(progress)}%`;
    }
  }

  /**
   * Hides the loading indicator
   */
  private hideLoading(): void {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
    
    // Clear rotation interval
    if (this.loadingRotationInterval) {
      clearInterval(this.loadingRotationInterval);
      this.loadingRotationInterval = null;
    }
    
    // Reset animation flag
    this.isAnimating = false;
  }

  /**
   * Updates the model count badge
   */
  private updateModelCount(): void {
    const countElement = document.getElementById('modelCount');
    const tooltipContent = document.getElementById('modelDetailsContent');
    
    if (countElement && tooltipContent) {
      const models = this.ifcLoader.getLoadedModels();
      const modelCount = models.size;
      countElement.textContent = modelCount.toString();
      
      // Update tooltip content
      if (modelCount === 0) {
        tooltipContent.innerHTML = '<div class="no-models">No models loaded</div>';
      } else {
        let html = '';
        for (const [uuid, model] of models) {
          const metadata = this.ifcLoader.getModelMetadata(uuid);
          const modelName = metadata?.name || uuid;
          
          // Get the model object's unique UUID
          const modelGuid = model.object?.uuid || uuid;
          
          html += `
            <div class="model-item">
              <div class="model-name">
                <span><i class="fas fa-cube"></i> ${modelName}</span>
                <span class="model-guid"><i class="fas fa-fingerprint"></i> ${modelGuid}</span>
              </div>
            </div>
          `;
        }
        tooltipContent.innerHTML = html;
      }
    }
  }

  /**
   * Shows a warning label for far-origin models
   */
  public showCoordinateWarning(): void {
    // Remove any existing warning
    this.hideCoordinateWarning();

    const warning = document.createElement('div');
    warning.className = 'coordinate-warning';
    warning.id = 'coordinate-warning';
    warning.innerHTML = `
      <div class="coordinate-warning-icon">⚠️</div>
      <div class="coordinate-warning-content">
        <div class="coordinate-warning-title">Far-Origin Model</div>
        <div class="coordinate-warning-message">Model coordinates >100km adjusted to origin</div>
      </div>
      <button class="coordinate-warning-close" title="Dismiss">×</button>
    `;

    // Add close button handler
    const closeBtn = warning.querySelector('.coordinate-warning-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideCoordinateWarning());
    }

    // Auto-dismiss after 10 seconds
    setTimeout(() => this.hideCoordinateWarning(), 10000);

    document.body.appendChild(warning);
  }

  /**
   * Hides the coordinate warning label
   */
  public hideCoordinateWarning(): void {
    const warning = document.getElementById('coordinate-warning');
    if (warning) {
      warning.remove();
    }
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
    // Remove any existing error notification
    this.hideErrorNotification();

    const errorNotification = document.createElement('div');
    errorNotification.className = 'error-notification';
    errorNotification.id = 'error-notification';
    
    const actionButtonHtml = actionButton 
      ? `<button class="error-notification-action">${actionButton.text}</button>`
      : '';
    
    errorNotification.innerHTML = `
      <div class="error-notification-icon">❌</div>
      <div class="error-notification-content">
        <div class="error-notification-title">${title}</div>
        <div class="error-notification-message">${message}</div>
        ${actionButtonHtml}
      </div>
      <button class="error-notification-close" title="Dismiss">×</button>
    `;

    // Add close button handler
    const closeBtn = errorNotification.querySelector('.error-notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideErrorNotification());
    }

    // Add action button handler
    if (actionButton) {
      const actionBtn = errorNotification.querySelector('.error-notification-action');
      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          actionButton.callback();
          this.hideErrorNotification();
        });
      }
    }

    // Auto-dismiss after specified duration
    setTimeout(() => this.hideErrorNotification(), duration);

    document.body.appendChild(errorNotification);
  }

  /**
   * Hides the error notification
   */
  public hideErrorNotification(): void {
    const notification = document.getElementById('error-notification');
    if (notification) {
      notification.remove();
    }
  }

  /**
   * Shows an alignment needed notification with an action button
   */
  public showAlignmentNeeded(modelId: string): void {
    this.showErrorNotification(
      'Models May Be Overlapping',
      'Multiple far-origin models detected. They may be overlapping at the origin. Would you like to try aligning them?',
      20000, // 20 seconds
      {
        text: 'Try to Align Models',
        callback: () => {
          console.log('🔄 Attempting to align models...');
          this.alignModels(modelId);
        }
      }
    );
  }

  /**
   * Aligns multiple far-origin models using IFC site coordinates and model positions
   */
  private async alignModels(secondModelId: string): Promise<void> {
    try {
      const components = this.worldManager.getComponents();
      if (!components) {
        throw new Error('Components not initialized');
      }

      const fragments = components.get(OBC.FragmentsManager) as OBC.FragmentsManager;
      const modelsList = fragments.core.models.list;
      
      if (modelsList.size < 2) {
        console.warn('⚠️ Need at least 2 models to align');
        return;
      }

      // Get all model IDs
      const modelIds = Array.from(modelsList.keys());
      const firstModelId = modelIds[0];
      
      console.log(`📐 Aligning models: ${firstModelId} and ${secondModelId}`);

      const firstModel = modelsList.get(firstModelId);
      const secondModel = modelsList.get(secondModelId);

      if (!firstModel || !secondModel) {
        console.error('❌ Could not find models for alignment');
        return;
      }

      // Log positions before alignment
      console.log(`📍 BEFORE alignment:`);
      console.log(`   First model position: (${firstModel.object.position.x.toFixed(2)}, ${firstModel.object.position.y.toFixed(2)}, ${firstModel.object.position.z.toFixed(2)})`);
      console.log(`   Second model position: (${secondModel.object.position.x.toFixed(2)}, ${secondModel.object.position.y.toFixed(2)}, ${secondModel.object.position.z.toFixed(2)})`);

      // Try to get original coordinates from IFCLoader
      const firstOriginalCoords = this.ifcLoader.getOriginalCoordinates(firstModelId);
      const secondOriginalCoords = this.ifcLoader.getOriginalCoordinates(secondModelId);

      if (firstOriginalCoords && secondOriginalCoords) {
        // We have the original IFC site coordinates before MOVE_TO_ORIGIN!
        console.log(`✅ Found original coordinates:`);
        console.log(`   First model original: (${firstOriginalCoords.x.toFixed(2)}, ${firstOriginalCoords.y.toFixed(2)}, ${firstOriginalCoords.z.toFixed(2)})`);
        console.log(`   Second model original: (${secondOriginalCoords.x.toFixed(2)}, ${secondOriginalCoords.y.toFixed(2)}, ${secondOriginalCoords.z.toFixed(2)})`);

        // Calculate the relative offset
        // Both models were moved to origin independently, so we need to position them relative to each other
        const offset = secondOriginalCoords.clone().sub(firstOriginalCoords);
        console.log(`� Calculated offset from original coordinates: (${offset.x.toFixed(2)}, ${offset.y.toFixed(2)}, ${offset.z.toFixed(2)})`);

        // Apply the offset to the second model
        // First model stays at (0,0,0), second model moves by the offset
        secondModel.object.position.copy(offset);
        
        console.log(`✅ Applied offset based on original IFC coordinates`);
        console.log(`📍 Second model new position: (${secondModel.object.position.x.toFixed(2)}, ${secondModel.object.position.y.toFixed(2)}, ${secondModel.object.position.z.toFixed(2)})`);

        // Update the scene
        fragments.core.update(true);

        // Show success notification
        this.showSuccessNotification(
          'Models Aligned',
          'Successfully aligned models using original coordinates.',
          5000
        );

        return;
      }

      // Fallback: Try using IFC site coordinates
      console.log(`⚠️ Original coordinates not available, trying IFC site coordinates...`);

      // Get site coordinates for both models
      const firstSiteCoords = await this.getSiteCoordinates(firstModel, firstModelId);
      const secondSiteCoords = await this.getSiteCoordinates(secondModel, secondModelId);

      console.log('📍 First model site coords:', firstSiteCoords);
      console.log('📍 Second model site coords:', secondSiteCoords);

      if (firstSiteCoords && secondSiteCoords) {
        // Calculate offset based on lat/long difference
        // Rough approximation: 1 degree latitude ≈ 111km, longitude varies by latitude
        const latDiff = (secondSiteCoords.latitude - firstSiteCoords.latitude) * 111000; // meters
        const lonDiff = (secondSiteCoords.longitude - firstSiteCoords.longitude) * 111000 * Math.cos(firstSiteCoords.latitude * Math.PI / 180); // meters
        
        // NOTE: We don't use elevation difference because MOVE_TO_ORIGIN already handles vertical positioning
        // The models are already at the correct relative heights after MOVE_TO_ORIGIN
        
        console.log(`📏 Calculated horizontal offset: X=${lonDiff.toFixed(2)}m, Z=${latDiff.toFixed(2)}m`);
        console.log(`ℹ️  Elevation difference: ${(secondSiteCoords.elevation - firstSiteCoords.elevation).toFixed(2)}m (ignored - already handled by MOVE_TO_ORIGIN)`);

        // Set second model position relative to first model + calculated offset
        const firstPosition = firstModel.object.position.clone();
        
        console.log(`📍 First model position: (${firstPosition.x.toFixed(2)}, ${firstPosition.y.toFixed(2)}, ${firstPosition.z.toFixed(2)})`);
        
        // Only apply horizontal offset if there's an actual lat/long difference
        if (Math.abs(latDiff) > 0.01 || Math.abs(lonDiff) > 0.01) {
          secondModel.object.position.set(
            firstPosition.x + lonDiff,
            firstPosition.y, // Keep same Y - elevation already correct
            firstPosition.z - latDiff // Negative because north is typically -Z in IFC
          );
          
          const newPos = secondModel.object.position;
          console.log(`📍 Second model new position: (${newPos.x.toFixed(2)}, ${newPos.y.toFixed(2)}, ${newPos.z.toFixed(2)})`);
          console.log(`✅ Aligned second model using geographic coordinates`);
        } else {
          // Models have same geo coordinates but may still be misaligned
          // Use bounding box centers to detect misalignment
          console.log(`⚠️ Models have identical site coordinates, checking bounding boxes...`);
          
          const bbox1 = new THREE.Box3().setFromObject(firstModel.object);
          const bbox2 = new THREE.Box3().setFromObject(secondModel.object);
          
          const center1 = new THREE.Vector3();
          const center2 = new THREE.Vector3();
          bbox1.getCenter(center1);
          bbox2.getCenter(center2);
          
          const min1 = bbox1.min;
          const max1 = bbox1.max;
          const min2 = bbox2.min;
          const max2 = bbox2.max;
          
          console.log(`📦 First model bbox: min(${min1.x.toFixed(2)}, ${min1.y.toFixed(2)}, ${min1.z.toFixed(2)}) max(${max1.x.toFixed(2)}, ${max1.y.toFixed(2)}, ${max1.z.toFixed(2)})`);
          console.log(`📦 Second model bbox: min(${min2.x.toFixed(2)}, ${min2.y.toFixed(2)}, ${min2.z.toFixed(2)}) max(${max2.x.toFixed(2)}, ${max2.y.toFixed(2)}, ${max2.z.toFixed(2)})`);
          
          // Check if second model has valid geometry
          const hasValidGeometry = isFinite(min2.x) && isFinite(min2.y) && isFinite(min2.z);
          
          if (!hasValidGeometry) {
            console.log(`⚠️ Second model has no valid geometry - showing manual offset controls`);
            this.showManualOffsetControls(firstModel, secondModel, firstModelId, secondModelId);
            return;
          }
          
          console.log(`📦 First model bbox center: (${center1.x.toFixed(2)}, ${center1.y.toFixed(2)}, ${center1.z.toFixed(2)})`);
          console.log(`📦 Second model bbox center: (${center2.x.toFixed(2)}, ${center2.y.toFixed(2)}, ${center2.z.toFixed(2)})`);
          
          const offset = center1.clone().sub(center2);
          console.log(`📏 Bounding box offset needed: (${offset.x.toFixed(2)}, ${offset.y.toFixed(2)}, ${offset.z.toFixed(2)}) - distance: ${offset.length().toFixed(2)}m`);
          
          // Only apply if there's significant offset (more than 1 meter)
          if (offset.length() > 1.0) {
            secondModel.object.position.add(offset);
            console.log(`✅ Aligned models using bounding box centers`);
            console.log(`📍 Second model new position: (${secondModel.object.position.x.toFixed(2)}, ${secondModel.object.position.y.toFixed(2)}, ${secondModel.object.position.z.toFixed(2)})`);
          } else {
            // Already well aligned
            secondModel.object.position.copy(firstPosition);
            console.log(`✅ Models already well aligned (offset < 1m)`);
          }
        }
      } else {
        // Fallback: just match positions
        console.warn('⚠️ Could not read site coordinates, using position matching fallback');
        const firstPosition = firstModel.object.position.clone();
        secondModel.object.position.copy(firstPosition);
      }
      
      // Update the scene
      fragments.core.update(true);

      // Show success notification
      this.showSuccessNotification(
        'Models Aligned',
        'Successfully aligned models using IFC site coordinates.',
        5000
      );

    } catch (error) {
      console.error('❌ Error aligning models:', error);
      this.showErrorNotification(
        'Alignment Failed',
        'Could not align models. Please try unloading and reloading them.',
        10000
      );
    }
  }

  /**
   * Extracts site coordinates from IFC model properties
   */
  private async getSiteCoordinates(
    model: any,
    modelId: string
  ): Promise<{ latitude: number; longitude: number; elevation: number } | null> {
    try {
      // Check if model has getSpatialStructure method
      if (typeof model.getSpatialStructure !== 'function') {
        console.warn('Model does not have getSpatialStructure method');
        return null;
      }

      // Get the spatial structure (IFCProject >> IFCSite >> IFCBuilding >> IFCBuildingStorey)
      const spatialStructure = await model.getSpatialStructure();
      if (!spatialStructure) {
        console.warn('Could not get spatial structure from model');
        return null;
      }

      // Find IFCSITE in the structure
      const siteNode = await this.findSiteInStructure(model, spatialStructure);
      
      if (siteNode) {
        console.log('📍 Found site node:', siteNode);
        const siteLocalId = siteNode.localId || siteNode._localId?.value;
        
        if (!siteLocalId) {
          console.warn('Site node found but no localId');
          console.log('Site node keys:', Object.keys(siteNode));
          
          // Try to find localId in children if this is a wrapper
          if (siteNode.children && siteNode.children.length > 0) {
            const firstChild = siteNode.children[0];
            const childLocalId = firstChild.localId || firstChild._localId?.value;
            if (childLocalId) {
              console.log('✅ Found localId in first child:', childLocalId);
              return await this.extractSiteCoordinates(model, childLocalId);
            }
          }
          
          return null;
        }

        // Get detailed site data
        return await this.extractSiteCoordinates(model, siteLocalId);
      }

      return null;
    } catch (error) {
      console.error('Error reading site coordinates:', error);
      return null;
    }
  }

  /**
   * Extracts coordinates from site entity
   */
  private async extractSiteCoordinates(model: any, siteLocalId: number): Promise<{ latitude: number; longitude: number; elevation: number } | null> {
    try {
      const siteData = await model.getItemsData([siteLocalId], {
        attributesDefault: true
      });

      if (siteData && siteData.length > 0) {
        const site = siteData[0];
        console.log('📍 Found IFCSITE data:', site);
        
        // Extract RefLatitude, RefLongitude, RefElevation
        let latitude = 0;
        let longitude = 0;
        let elevation = 0;

        // Handle value wrappers (property can be direct or wrapped in {value, type})
        const getNumericValue = (prop: any): number => {
          if (prop === undefined || prop === null) return 0;
          if (typeof prop === 'number') return prop;
          if (prop.value !== undefined) return typeof prop.value === 'number' ? prop.value : 0;
          return 0;
        };

        const getArrayValue = (prop: any): number[] | null => {
          if (prop === undefined || prop === null) return null;
          if (Array.isArray(prop)) return prop;
          if (prop.value !== undefined && Array.isArray(prop.value)) return prop.value;
          return null;
        };

        const latArray = getArrayValue(site.RefLatitude);
        if (latArray) {
          latitude = this.convertDMSToDecimal(latArray);
        }

        const lonArray = getArrayValue(site.RefLongitude);
        if (lonArray) {
          longitude = this.convertDMSToDecimal(lonArray);
        }

        elevation = getNumericValue(site.RefElevation);

        console.log(`📍 Extracted: lat=${latitude}, lon=${longitude}, elev=${elevation}`);

        return { latitude, longitude, elevation };
      }

      return null;
    } catch (error) {
      console.error('Error extracting site coordinates:', error);
      return null;
    }
  }

  /**
   * Recursively searches for IFCSITE node in spatial structure
   */
  private async findSiteInStructure(model: any, node: any): Promise<any> {
    if (!node) return null;

    const category = node.category || node._category?.value;
    
    if (category === 'IFCSITE') {
      return node;
    }

    // Search in children
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const result = await this.findSiteInStructure(model, child);
        if (result) return result;
      }
    }

    return null;
  }

  /**
   * Converts DMS (Degrees, Minutes, Seconds) array to decimal degrees
   */
  private convertDMSToDecimal(dmsArray: number[]): number {
    if (!Array.isArray(dmsArray) || dmsArray.length < 3) return 0;
    
    const degrees = dmsArray[0] || 0;
    const minutes = dmsArray[1] || 0;
    const seconds = dmsArray[2] || 0;
    const microseconds = dmsArray[3] || 0;
    
    return degrees + minutes / 60 + seconds / 3600 + microseconds / 3600000000;
  }

  /**
   * Shows a success notification popup
   */
  private showSuccessNotification(title: string, message: string, duration: number = 5000): void {
    // Remove any existing notifications
    const existing = document.getElementById('success-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'coordinate-warning'; // Reuse the yellow/green styling
    notification.id = 'success-notification';
    notification.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
    
    notification.innerHTML = `
      <div class="coordinate-warning-icon">✅</div>
      <div class="coordinate-warning-content">
        <div class="coordinate-warning-title">${title}</div>
        <div class="coordinate-warning-message">${message}</div>
      </div>
      <button class="coordinate-warning-close" title="Dismiss">×</button>
    `;

    const closeBtn = notification.querySelector('.coordinate-warning-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => notification.remove());
    }

    setTimeout(() => notification.remove(), duration);
    document.body.appendChild(notification);
  }

  /**
   * Show manual offset controls for model alignment
   */
  private showManualOffsetControls(
    firstModel: any,
    secondModel: any,
    firstModelId: string,
    secondModelId: string
  ): void {
    this.createModelAlignmentPanel();
  }

  /**
   * Create a reusable model alignment panel
   */
  public createModelAlignmentPanel(): void {
    // Remove any existing panel to force recreation with updated content
    const existing = document.getElementById('model-alignment-panel');
    if (existing) {
      existing.remove();
    }

    // Get all loaded models
    const fragments = this.ifcLoader ? (this.ifcLoader as any).components?.get?.(OBC.FragmentsManager) : null;
    if (!fragments) return;

    const models = Array.from(fragments.list) as Array<[string, any]>;

    // Create draggable panel
    const panel = document.createElement('div');
    panel.id = 'model-alignment-panel';
    panel.className = 'model-alignment-panel';
    
    panel.innerHTML = `
      <div class="model-alignment-header">
        <span class="model-alignment-title">Model Alignment</span>
        <div class="model-alignment-header-buttons">
          <button class="model-alignment-minimize" title="Minimize">−</button>
          <button class="model-alignment-close" title="Close">×</button>
        </div>
      </div>
      <div class="model-alignment-content">
        <div class="model-alignment-section">
          <label>Select Model:</label>
          <select id="alignment-model-select" class="model-alignment-select">
            ${models.map(([id, model]) => `<option value="${id}">${id}</option>`).join('')}
          </select>
        </div>
        <div class="model-alignment-section">
          <label>Position (meters):</label>
          <div class="model-alignment-inputs">
            <div class="model-alignment-input-group">
              <label>X</label>
              <input type="number" id="alignment-x" value="0" step="0.1" />
            </div>
            <div class="model-alignment-input-group">
              <label>Y</label>
              <input type="number" id="alignment-y" value="0" step="0.1" />
            </div>
            <div class="model-alignment-input-group">
              <label>Z</label>
              <input type="number" id="alignment-z" value="0" step="0.1" />
            </div>
          </div>
        </div>
        <div class="model-alignment-section">
          <label>Arrow Keys (step size):</label>
          <input type="number" id="alignment-step" value="1" step="0.1" min="0.1" />
          <div class="model-alignment-hint">
            • ←→ for X<br>
            • ↑↓ for Y<br>
            • Shift+↑↓ for Z (elevation)
          </div>
        </div>
        <div class="model-alignment-buttons">
          <button class="model-alignment-apply">Apply</button>
          <button class="model-alignment-reset">Reset</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // Make panel draggable
    this.makeDraggable(panel);

    // Get elements
    const modelSelect = panel.querySelector('#alignment-model-select') as HTMLSelectElement;
    const xInput = panel.querySelector('#alignment-x') as HTMLInputElement;
    const yInput = panel.querySelector('#alignment-y') as HTMLInputElement;
    const zInput = panel.querySelector('#alignment-z') as HTMLInputElement;
    const stepInput = panel.querySelector('#alignment-step') as HTMLInputElement;
    const applyBtn = panel.querySelector('.model-alignment-apply') as HTMLButtonElement;
    const resetBtn = panel.querySelector('.model-alignment-reset') as HTMLButtonElement;
    const closeBtn = panel.querySelector('.model-alignment-close') as HTMLButtonElement;
    const minimizeBtn = panel.querySelector('.model-alignment-minimize') as HTMLButtonElement;

    // Update inputs when model selection changes
    const updateInputsFromModel = () => {
      const selectedId = modelSelect.value;
      const model = fragments.list.get(selectedId);
      if (model) {
        xInput.value = model.object.position.x.toFixed(2);
        // Swap: Z input shows Three.js Y (elevation), Y input shows Three.js Z
        zInput.value = model.object.position.y.toFixed(2);
        yInput.value = model.object.position.z.toFixed(2);
      }
    };

    modelSelect?.addEventListener('change', updateInputsFromModel);

    // Initialize with first model's position
    updateInputsFromModel();

    // Apply button
    applyBtn?.addEventListener('click', () => {
      const selectedId = modelSelect.value;
      const model = fragments.list.get(selectedId);
      if (model) {
        const x = parseFloat(xInput.value) || 0;
        // Swap: Z input controls Three.js Y (elevation), Y input controls Three.js Z
        const y = parseFloat(zInput.value) || 0;
        const z = parseFloat(yInput.value) || 0;

        model.object.position.set(x, y, z);
        fragments.core.update(true);

        console.log(`✅ Applied offset to ${selectedId}: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
        this.showSuccessNotification('Position Updated', `Model moved to X:${x.toFixed(2)}, Z:${y.toFixed(2)}, Y:${z.toFixed(2)}`);
      }
    });

    // Reset button
    resetBtn?.addEventListener('click', () => {
      const selectedId = modelSelect.value;
      const model = fragments.list.get(selectedId);
      if (model) {
        model.object.position.set(0, 0, 0);
        xInput.value = '0';
        yInput.value = '0';
        zInput.value = '0';
        fragments.core.update(true);

        console.log(`✅ Reset ${selectedId} to origin`);
        this.showSuccessNotification('Position Reset', 'Model moved to origin (0, 0, 0)');
      }
    });

    // Close button
    closeBtn?.addEventListener('click', () => {
      panel.style.display = 'none';
    });

    // Minimize button
    const content = panel.querySelector('.model-alignment-content') as HTMLElement;
    minimizeBtn?.addEventListener('click', () => {
      if (content.style.display === 'none') {
        content.style.display = 'block';
        minimizeBtn.textContent = '−';
        minimizeBtn.title = 'Minimize';
      } else {
        content.style.display = 'none';
        minimizeBtn.textContent = '+';
        minimizeBtn.title = 'Expand';
      }
    });

    // Arrow key controls
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if panel is visible and not typing in an input
      if (panel.style.display === 'none') return;
      if (document.activeElement?.tagName === 'INPUT') return;

      const step = parseFloat(stepInput.value) || 1;
      const selectedId = modelSelect.value;
      const model = fragments.list.get(selectedId);
      if (!model) return;

      let updated = false;
      const pos = model.object.position;

      switch (e.key) {
        case 'ArrowLeft':
          pos.x -= step;
          xInput.value = pos.x.toFixed(2);
          updated = true;
          break;
        case 'ArrowRight':
          pos.x += step;
          xInput.value = pos.x.toFixed(2);
          updated = true;
          break;
        case 'ArrowUp':
          if (e.shiftKey) {
            // Shift+Up: Increase Z (elevation) - which is Three.js Y
            pos.y += step;
            zInput.value = pos.y.toFixed(2);
          } else {
            // Up: Increase Y (forward) - which is Three.js Z
            pos.z += step;
            yInput.value = pos.z.toFixed(2);
          }
          updated = true;
          break;
        case 'ArrowDown':
          if (e.shiftKey) {
            // Shift+Down: Decrease Z (elevation) - which is Three.js Y
            pos.y -= step;
            zInput.value = pos.y.toFixed(2);
          } else {
            // Down: Decrease Y (backward) - which is Three.js Z
            pos.z -= step;
            yInput.value = pos.z.toFixed(2);
          }
          updated = true;
          break;
      }

      if (updated) {
        e.preventDefault();
        fragments.core.update(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Clean up event listener when panel is removed
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node === panel) {
            document.removeEventListener('keydown', handleKeyDown);
            observer.disconnect();
          }
        });
      });
    });
    observer.observe(document.body, { childList: true });
  }

  /**
   * Make an element draggable
   */
  private makeDraggable(element: HTMLElement): void {
    const header = element.querySelector('.model-alignment-header') as HTMLElement;
    if (!header) return;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    header.style.cursor = 'move';

    header.onmousedown = dragMouseDown;

    function dragMouseDown(e: MouseEvent) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e: MouseEvent) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      element.style.top = (element.offsetTop - pos2) + 'px';
      element.style.left = (element.offsetLeft - pos1) + 'px';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  /**
   * Show floor plan creation modal with storey selection
   */
  async showFloorPlanModal(): Promise<void> {
    if (!this.floorPlanModule) {
      this.showErrorNotification(
        'Floor Plan Not Available',
        'Floor plan module is not initialized'
      );
      return;
    }

    try {
      // Get all storeys from loaded models
      const storeys = await this.floorPlanModule.getAllStoreys();
      
      if (storeys.length === 0) {
        this.showErrorNotification(
          'No Storeys Found',
          'No building storeys found in loaded models. Please load an IFC model with building storeys.'
        );
        return;
      }

      // Create modal panel
      const modal = document.createElement('div');
      modal.id = 'floor-plan-modal';
      modal.className = 'floor-plan-modal';
      
      modal.innerHTML = `
        <div class="floor-plan-modal-content">
          <div class="floor-plan-modal-header">
            <h3>Create Floor Plan View</h3>
            <button class="floor-plan-modal-close">×</button>
          </div>
          <div class="floor-plan-modal-body">
            <div class="floor-plan-info">
              Select a building storey to create a 2D floor plan view:
            </div>
            <div class="floor-plan-list">
              ${storeys.map((storey) => `
                <div class="floor-plan-item" data-storey="${storey.name}">
                  <div class="floor-plan-item-icon">
                    <i class="fas fa-layer-group"></i>
                  </div>
                  <div class="floor-plan-item-details">
                    <div class="floor-plan-item-name">${storey.name}</div>
                    <div class="floor-plan-item-info">
                      Elevation: ${storey.elevation.toFixed(2)}m
                      ${storey.modelId ? ` • Model: ${storey.modelId}` : ''}
                    </div>
                  </div>
                  <button class="floor-plan-item-create" data-storey="${storey.name}">
                    <i class="fas fa-eye"></i> View
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);

      // Event handlers
      const closeBtn = modal.querySelector('.floor-plan-modal-close');
      closeBtn?.addEventListener('click', () => modal.remove());

      // Close modal when clicking outside
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });

      const createButtons = modal.querySelectorAll('.floor-plan-item-create');
      createButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const storeyName = (e.currentTarget as HTMLElement).dataset.storey;
          if (!storeyName || !this.floorPlanModule) return;
          
          try {
            modal.remove();
            
            this.showSuccessNotification(
              'Creating Floor Plan',
              `Generating view for ${storeyName}...`
            );
            
            const view = await this.floorPlanModule.createFloorPlanView(storeyName);
            
            if (!view) {
              throw new Error('Failed to create floor plan view');
            }
            
            // Open view using its ID (which should be the storey name)
            const opened = await this.floorPlanModule.openView(view.id);
            
            if (!opened) {
              throw new Error(`Failed to open view: ${view.id}`);
            }
            
            this.showSuccessNotification(
              'Floor Plan Created',
              `Viewing floor plan: ${storeyName}. Use the clipper or close the view to return to 3D.`
            );
          } catch (error) {
            console.error('Error creating floor plan:', error);
            this.showErrorNotification(
              'Floor Plan Error',
              `Failed to create floor plan: ${error}`
            );
          }
        });
      });
    } catch (error) {
      console.error('Error showing floor plan modal:', error);
      this.showErrorNotification(
        'Error',
        `Failed to load storeys: ${error}`
      );
    }
  }
}
