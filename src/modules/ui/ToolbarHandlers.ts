/**
 * ToolbarHandlers module
 * Contains all toolbar action handler functions
 */

import { IFCLoaderModule } from '../IFCLoaderModule';
import { ModelTransformModule } from '../ModelTransformModule';
import { MeasurementModule, MeasurementMode } from '../MeasurementModule';
import { FloorPlanModule } from '../FloorPlanModule';
import { MinimapModule } from '../MinimapModule';
import { ClusterModule } from '../ClusterModule';
import { ColorSplashModule } from '../ColorSplashModule';
import { PropertiesPanelModule } from '../PropertiesPanelModule';
import { NotificationHelper } from './NotificationHelper';
import { ModelDashboard } from './ModelDashboard';
import { UIManager } from '../UIManager';
import * as OBC from '@thatopen/components';

export class ToolbarHandlers {
  private ifcLoader: IFCLoaderModule;
  private modelTransform: ModelTransformModule;
  private measurement: MeasurementModule | null = null;
  private floorPlan: FloorPlanModule | null = null;
  private minimap: MinimapModule | null = null;
  private cluster: ClusterModule | null = null;
  private colorSplash: ColorSplashModule | null = null;
  private propertiesPanel: PropertiesPanelModule | null = null;
  private showLoadingCallback: () => Promise<void>;
  private hideLoadingCallback: () => void;
  private updateLoadingProgressCallback: (progress: number, message: string) => void;
  private modelDashboard: ModelDashboard;
  private components: OBC.Components;
  private uiManager: UIManager;

  constructor(
    ifcLoader: IFCLoaderModule,
    modelTransform: ModelTransformModule,
    showLoadingCallback: () => Promise<void>,
    hideLoadingCallback: () => void,
    updateLoadingProgressCallback: (progress: number, message: string) => void,
    measurement?: MeasurementModule | null,
    components?: OBC.Components,
    propertiesPanel?: PropertiesPanelModule,
    uiManager?: UIManager
  ) {
    this.ifcLoader = ifcLoader;
    this.modelTransform = modelTransform;
    this.showLoadingCallback = showLoadingCallback;
    this.hideLoadingCallback = hideLoadingCallback;
    this.updateLoadingProgressCallback = updateLoadingProgressCallback;
    this.measurement = measurement || null;
    this.modelDashboard = new ModelDashboard();
    this.components = components!;
    this.propertiesPanel = propertiesPanel || null;
    this.uiManager = uiManager!;
  }

  /**
   * Sets the measurement module (can be set after construction)
   */
  setMeasurementModule(measurement: MeasurementModule): void {
    this.measurement = measurement;
  }

  /**
   * Sets the floor plan module (can be set after construction)
   */
  setFloorPlanModule(floorPlan: FloorPlanModule): void {
    this.floorPlan = floorPlan;
  }

  /**
   * Sets the minimap module (can be set after construction)
   */
  setMinimapModule(minimap: MinimapModule): void {
    this.minimap = minimap;
  }

  /**
   * Sets the cluster module (can be set after construction)
   */
  setClusterModule(cluster: ClusterModule): void {
    this.cluster = cluster;
  }

  /**
   * Sets the color splash module (can be set after construction)
   */
  setColorSplashModule(colorSplash: ColorSplashModule): void {
    this.colorSplash = colorSplash;
  }

  /**
   * Handles file upload button click - triggers file picker
   */
  async handleFileUpload(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ifc,.frag';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      await this.showLoadingCallback();
      
      try {
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        
        if (fileExtension === 'ifc') {
          // Show initial loading progress (0-50% is file loading phase with no callback)
          this.updateLoadingProgressCallback(0, 'Reading IFC file...');
          
          await this.ifcLoader.loadIFC(file, (progress) => {
            // Map processData progress (0→1) to second half (50→100)
            // The first half (0-50%) is file loading which doesn't report progress
            const adjustedProgress = 50 + (progress * 50);
            this.updateLoadingProgressCallback(adjustedProgress, `Processing IFC... ${Math.round(adjustedProgress)}%`);
          });
          console.log(`✅ Loaded IFC: ${file.name}`);
        } else if (fileExtension === 'frag') {
          await this.ifcLoader.loadFragments(file);
          console.log(`✅ Loaded Fragments: ${file.name}`);
        }
        
        // Model count will be updated automatically via callback
      } catch (error) {
        console.error('❌ Error loading file:', error);
        
        // Show user-friendly error message
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('Cannot load far-origin model')) {
          // Far-origin model blocked to preserve alignment
          this.uiManager.showErrorNotification(
            '🚫 Far-Origin Model Detected',
            'This model is >100km from origin and cannot be mixed with your existing models.\n\n' +
            '⚠️ Loading it would break the alignment of your current models!\n\n' +
            '💡 Solution:\n' +
            '1. Click "Unload All Models" to clear existing models\n' +
            '2. Then load this far-origin model first\n' +
            '3. All subsequent models must also be far-origin'
          );
        } else if (errorMessage.includes('Cannot load normal model')) {
          // Normal model blocked when far-origin models are loaded
          this.uiManager.showErrorNotification(
            '🚫 Normal Model Detected',
            'This model is near origin and cannot be mixed with your existing far-origin models.\n\n' +
            '⚠️ Loading it would break the coordinate system!\n\n' +
            '💡 Solution:\n' +
            '1. Click "Unload All Models" to clear existing models\n' +
            '2. Then load this normal model first'
          );
        } else if (errorMessage.includes('Failed to load second far-origin model')) {
          // Multiple far-origin models at different locations
          this.uiManager.showErrorNotification(
            '❌ Multiple Far-Origin Models',
            'This model is also >100km from origin but at a DIFFERENT location.\n' +
            'When multiple far-origin models are moved to origin, they overlap at (0,0,0).\n\n' +
            '⚠️ Your models are at different far-origin coordinates and cannot be combined!\n\n' +
            '💡 Solution:\n' +
            '1. Load only ONE far-origin model at a time, OR\n' +
            '2. Ensure all IFC files use the SAME coordinate system, OR\n' +
            '3. Use "Unload All Models" and load these models separately',
            20000  // Show for 20 seconds
          );
        } else if (errorMessage.includes('incompatible with existing models')) {
          // Generic coordinate mode incompatibility
          this.uiManager.showErrorNotification(
            '⚠️ Coordinate Mode Mismatch',
            errorMessage.replace('❌ ', '') + '\n\n' +
            '💡 Tip: Use "Unload All Models" button before loading this model.',
            15000
          );
        } else {
          // Generic error
          this.uiManager.showErrorNotification(
            'Error Loading File',
            errorMessage.substring(0, 500),  // Limit message length
            15000
          );
        }
      } finally {
        this.hideLoadingCallback();
      }
    };
    
    input.click();
  }

  /**
   * Loads a sample IFC file from the web
   */
  async handleLoadSample(): Promise<void> {
    this.showLoadingCallback();
    
    try {
      const sampleURL = 'https://thatopen.github.io/engine_components/resources/ifc/school_str.ifc';
      
      await this.ifcLoader.loadIFC(sampleURL);
      console.log('✅ Sample IFC loaded successfully');
      
      // Model count will be updated automatically via callback
    } catch (error) {
      console.error('❌ Error loading sample IFC:', error);
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('Cannot load far-origin model')) {
        // Far-origin model blocked to preserve alignment
        alert(
          '🚫 Far-Origin Sample Detected!\n\n' +
          'This sample is >100km from origin and cannot be mixed with your existing models.\n\n' +
          '⚠️ Loading it would break the alignment of your current models!\n\n' +
          '💡 Solution:\n' +
          '1. Click "Unload All Models" to clear existing models\n' +
          '2. Then load this sample'
        );
      } else if (errorMessage.includes('Cannot load normal model')) {
        // Normal model blocked when far-origin models are loaded
        alert(
          '🚫 Normal Sample Detected!\n\n' +
          'This sample is near origin and cannot be mixed with your existing far-origin models.\n\n' +
          '⚠️ Loading it would break the coordinate system!\n\n' +
          '💡 Solution:\n' +
          '1. Click "Unload All Models" to clear existing models\n' +
          '2. Then load this sample'
        );
      } else if (errorMessage.includes('incompatible with existing models')) {
        // Generic coordinate mode incompatibility
        alert(
          '⚠️ Cannot Load Sample - Coordinate Mode Mismatch\n\n' +
          errorMessage.replace('❌ ', '') + '\n\n' +
          '💡 Tip: Use "Unload All Models" button before loading this sample.'
        );
      } else {
        // Generic error
        alert(`Error loading sample: ${errorMessage}`);
      }
    } finally {
      this.hideLoadingCallback();
    }
  }

  /**
   * Handles export functionality - exports loaded models as fragments
   */
  async handleExport(): Promise<void> {
    try {
      const models = this.ifcLoader.getLoadedModels();
      if (models.size === 0) {
        alert('No models loaded to export');
        return;
      }

      console.log('🔄 Exporting fragments...');
      await this.ifcLoader.exportFragments();
      console.log('✅ Fragments exported successfully');
    } catch (error) {
      console.error('❌ Error exporting fragments:', error);
      alert(`Error exporting: ${error}`);
    }
  }

  /**
   * Centers all loaded models at the origin
   */
  handleCenterModels(): void {
    try {
      const models = this.ifcLoader.getLoadedModels();
      if (models.size === 0) {
        alert('No models loaded');
        return;
      }

      // Note: With COORDINATE_TO_ORIGIN = false, models are already in their correct positions
      alert('Models are using their original IFC coordinates for proper alignment');
      console.log('ℹ️ Models use original IFC coordinates');
    } catch (error) {
      console.error('❌ Error:', error);
      alert(`Error: ${error}`);
    }
  }

  /**
   * Fits the camera to show all loaded models
   */
  async handleFitCamera(): Promise<void> {
    try {
      const models = this.ifcLoader.getLoadedModels();
      if (models.size === 0) {
        alert('No models loaded');
        return;
      }

      await this.modelTransform.fitCameraToModels();
      console.log('✅ Camera fitted to models');
    } catch (error) {
      console.error('❌ Error fitting camera:', error);
      alert(`Error fitting camera: ${error}`);
    }
  }

  /**
   * Opens the model alignment panel
   */
  handleAlignModels(): void {
    try {
      const models = this.ifcLoader.getLoadedModels();
      if (models.size === 0) {
        NotificationHelper.show({
          title: '📦 No Models Loaded',
          message: 'Please load at least one IFC model to use alignment tools',
          type: 'info',
          duration: 3000
        });
        return;
      }

      // Open the alignment panel
      this.uiManager.createModelAlignmentPanel();
      console.log('✅ Opened model alignment panel');
    } catch (error) {
      console.error('❌ Error opening alignment panel:', error);
      alert(`Error: ${error}`);
    }
  }

  /**
   * Opens the floor plan creation modal
   */
  async handleCreateFloorPlan(): Promise<void> {
    try {
      const models = this.ifcLoader.getLoadedModels();
      if (models.size === 0) {
        NotificationHelper.show({
          title: '📦 No Models Loaded',
          message: 'Please load an IFC model first to create floor plans',
          type: 'info',
          duration: 3000
        });
        return;
      }

      if (!this.floorPlan) {
        NotificationHelper.show({
          title: '❌ Error',
          message: 'Floor plan module not initialized',
          type: 'error',
          duration: 3000
        });
        return;
      }

      // Show the floor plan modal
      await this.uiManager.showFloorPlanModal();
      console.log('✅ Opened floor plan modal');
      
      // Show close button, hide create button
      const createBtn = document.getElementById('createFloorPlanBtn');
      const closeBtn = document.getElementById('closeFloorPlanBtn');
      if (createBtn) createBtn.style.display = 'none';
      if (closeBtn) closeBtn.style.display = 'flex';
    } catch (error) {
      console.error('❌ Error showing floor plan modal:', error);
      NotificationHelper.show({
        title: '❌ Error',
        message: `Failed to load storeys: ${error}`,
        type: 'error',
        duration: 5000
      });
    }
  }

  /**
   * Closes the floor plan view and returns to 3D
   */
  async handleCloseFloorPlan(): Promise<void> {
    try {
      if (!this.floorPlan) {
        console.warn('⚠️ Floor plan module not initialized');
        return;
      }

      await this.floorPlan.closeView();
      
      // Hide close button, show create button
      const createBtn = document.getElementById('createFloorPlanBtn');
      const closeBtn = document.getElementById('closeFloorPlanBtn');
      if (createBtn) createBtn.style.display = 'flex';
      if (closeBtn) closeBtn.style.display = 'none';
      
      NotificationHelper.show({
        title: 'Success',
        message: 'Returned to 3D view',
        type: 'success',
        duration: 2000
      });
    } catch (error) {
      console.error('❌ Error closing floor plan:', error);
      NotificationHelper.show({
        title: '❌ Error',
        message: `Failed to close floor plan: ${error}`,
        type: 'error',
        duration: 3000
      });
    }
  }

  /**
   * Shows information about all loaded models
   */
  handleShowModelInfo(): void {
    try {
      const models = this.ifcLoader.getLoadedModels();
      
      if (models.size === 0) {
        NotificationHelper.show({
          title: '📦 No Models Loaded',
          message: 'Please load an IFC model first to view analytics',
          type: 'info',
          duration: 3000
        });
        return;
      }

      // Get fragments manager
      const fragmentsManager = this.components.get(OBC.FragmentsManager);
      
      // Get storey data from properties panel if available
      const storeyData = this.propertiesPanel?.storeyData || {};
      
      console.log('📊 Storey data passed to dashboard:', storeyData);
      console.log('📊 Storey data keys:', Object.keys(storeyData));
      console.log('📊 Storey data is empty?', Object.keys(storeyData).length === 0);
      
      // Show dashboard with IFC loader for metadata
      this.modelDashboard.show(models, fragmentsManager, storeyData, this.ifcLoader);
      
      console.log('📊 Model analytics dashboard opened');
    } catch (error) {
      console.error('❌ Error showing model info:', error);
      NotificationHelper.show({
        title: '❌ Error',
        message: `Failed to load model analytics: ${error}`,
        type: 'error',
        duration: 5000
      });
    }
  }

  /**
   * Clears all loaded models from the scene
   */
  handleClearModels(updateModelCountCallback: () => void): void {
    try {
      if (confirm('Are you sure you want to clear all models?')) {
        this.ifcLoader.clearModels();
        updateModelCountCallback();
        console.log('✅ All models cleared');
      }
    } catch (error) {
      console.error('❌ Error clearing models:', error);
      alert(`Error clearing models: ${error}`);
    }
  }

  /**
   * Enables length measurement mode
   */
  handleMeasureLength(): void {
    if (!this.measurement) {
      console.warn('Measurement module not initialized');
      return;
    }

    const currentMode = this.measurement.getMode();
    if (currentMode === MeasurementMode.LENGTH) {
      // Toggle off
      this.measurement.setMode(MeasurementMode.DISABLED);
      console.log('📏 Length measurement disabled');
      NotificationHelper.close();
    } else {
      // Enable length measurement
      this.measurement.setMode(MeasurementMode.LENGTH);
      console.log('📏 Length measurement enabled - Double-click to measure');
      NotificationHelper.show({
        title: '📏 Length Measurement Active',
        message: 'Double-click: Create measurement\nDelete/Backspace: Delete measurement\nDisplays X, Y, Z components',
        type: 'info',
        duration: 0 // Manual close only
      });
    }
  }

  /**
   * Enables area measurement mode
   */
  handleMeasureArea(): void {
    if (!this.measurement) {
      console.warn('Measurement module not initialized');
      return;
    }

    const currentMode = this.measurement.getMode();
    if (currentMode === MeasurementMode.AREA) {
      // Toggle off
      this.measurement.setMode(MeasurementMode.DISABLED);
      console.log('📐 Area measurement disabled');
      NotificationHelper.close();
    } else {
      // Enable area measurement
      this.measurement.setMode(MeasurementMode.AREA);
      console.log('📐 Area measurement enabled - Double-click to start, Enter to finish');
      NotificationHelper.show({
        title: '📐 Area Measurement Active',
        message: 'Double-click: Add points\nEnter: Finish measurement\nEscape: Cancel\nDelete/Backspace: Delete measurement',
        type: 'info',
        duration: 0 // Manual close only
      });
    }
  }

  /**
   * Enables volume measurement mode
   */
  handleMeasureVolume(): void {
    if (!this.measurement) {
      console.warn('Measurement module not initialized');
      return;
    }

    const currentMode = this.measurement.getMode();
    if (currentMode === MeasurementMode.VOLUME) {
      // Toggle off
      this.measurement.setMode(MeasurementMode.DISABLED);
      console.log('📦 Volume measurement disabled');
      NotificationHelper.close();
    } else {
      // Enable volume measurement
      this.measurement.setMode(MeasurementMode.VOLUME);
      console.log('📦 Volume measurement enabled - Double-click on object to measure');
      NotificationHelper.show({
        title: '📦 Volume Measurement Active',
        message: 'Double-click on object: Measure volume\nEscape: Cancel\nDelete/Backspace: Delete measurement',
        type: 'info',
        duration: 0 // Manual close only
      });
    }
  }

  /**
   * Clears all measurements
   */
  handleMeasureClear(): void {
    if (!this.measurement) {
      console.warn('Measurement module not initialized');
      return;
    }

    if (confirm('Clear all measurements?')) {
      this.measurement.clearAll();
      console.log('🗑️ All measurements cleared');
    }
  }

  /**
   * Exports all measurements to JSON
   */
  async handleMeasureExport(): Promise<void> {
    if (!this.measurement) {
      console.warn('Measurement module not initialized');
      return;
    }

    try {
      const counts = this.measurement.getMeasurementCounts();
      const total = counts.length + counts.area + counts.volume;

      if (total === 0) {
        alert('No measurements to export');
        return;
      }

      const json = await this.measurement.exportMeasurements();
      
      // Create a download link
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `measurements-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('📥 Measurements exported');
      alert(`✅ Exported ${total} measurement(s)\n\nLength: ${counts.length}\nArea: ${counts.area}\nVolume: ${counts.volume}`);
    } catch (error) {
      console.error('❌ Error exporting measurements:', error);
      alert(`Error exporting measurements: ${error}`);
    }
  }

  /**
   * Toggles perpendicular guides for measurements
   */
  handleTogglePerpGuides(): void {
    if (!this.measurement) {
      console.warn('Measurement module not initialized');
      return;
    }

    this.measurement.togglePerpendicularGuides();
    
    // Update button label
    const btn = document.getElementById('perpGuidesBtn');
    if (btn) {
      const label = btn.querySelector('.label');
      if (label) {
        const isEnabled = label.textContent?.includes('ON');
        label.textContent = isEnabled ? 'Guides: OFF' : 'Guides: ON';
      }
    }
  }

  /**
   * Cancels measurement mode (disables all measurement tools)
   */
  handleCancelMeasureMode(): void {
    if (!this.measurement) {
      console.warn('Measurement module not initialized');
      return;
    }

    this.measurement.setMode(MeasurementMode.DISABLED);
    NotificationHelper.close();
    console.log('✅ Measurement mode canceled');
  }

  /**
   * Toggles IFC element clustering view
   */
  async handleToggleCluster(): Promise<void> {
    if (!this.cluster) {
      console.warn('⚠️ Cluster module not initialized');
      alert('Cluster module is not available');
      return;
    }

    try {
      this.showLoadingCallback();
      
      await this.cluster.toggleClusters();
      
      const isActive = this.cluster.isClusteringActive();
      
      // Update button appearance
      const btn = document.getElementById('toggleClusterBtn');
      if (btn) {
        const label = btn.querySelector('.label');
        if (label) {
          label.textContent = isActive ? 'Exit Cluster' : 'Cluster View';
        }
        
        // Add/remove active class for visual feedback
        if (isActive) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }

      console.log(`✅ Cluster view ${isActive ? 'enabled' : 'disabled'}`);
      
    } catch (error) {
      console.error('❌ Error toggling cluster:', error);
      alert(`Error toggling cluster view: ${error}`);
    } finally {
      this.hideLoadingCallback();
    }
  }

  /**
   * Handles color splash toggle
   */
  async handleToggleColorSplash(): Promise<void> {
    if (!this.colorSplash) {
      console.warn('⚠️ Color splash module not initialized');
      return;
    }

    try {
      this.showLoadingCallback();
      
      await this.colorSplash.toggleColorSplash();
      
      const isActive = this.colorSplash.isColorSplashActive();
      
      // Update button appearance
      const btn = document.getElementById('toggleColorSplashBtn');
      if (btn) {
        const label = btn.querySelector('.label');
        if (label) {
          label.textContent = isActive ? 'Reset Colors' : 'Color by Type';
        }
        
        // Add/remove active class for visual feedback
        if (isActive) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
          // Hide color picker panel when disabled
          this.hideColorPickerPanel();
        }
      }

      console.log(`✅ Color splash ${isActive ? 'enabled' : 'disabled'}`);
      
    } catch (error) {
      console.error('❌ Error toggling color splash:', error);
      alert(`Error toggling color splash: ${error}`);
    } finally {
      this.hideLoadingCallback();
    }
  }

  /**
   * Show color picker panel for category colors
   */
  public showColorPickerPanel(
    categories: Array<{ name: string; color: string; selectionName: string; count: number }>,
    modelGroups: Map<string, Array<{ name: string; color: string; selectionName: string; count: number }>>
  ): void {
    // Remove existing panel if any
    this.hideColorPickerPanel();

    const panel = document.createElement('div');
    panel.id = 'colorPickerPanel';
    panel.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: rgba(30, 30, 30, 0.95);
      border: 1px solid #555;
      border-radius: 8px;
      padding: 15px;
      max-height: 600px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      min-width: 300px;
      cursor: move;
      scrollbar-width: thin;
      scrollbar-color: #555 rgba(0, 0, 0, 0.3);
    `;

    // Add webkit scrollbar styles
    const style = document.createElement('style');
    style.textContent = `
      #colorPickerPanel::-webkit-scrollbar {
        width: 8px;
      }
      #colorPickerPanel::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.3);
        border-radius: 4px;
      }
      #colorPickerPanel::-webkit-scrollbar-thumb {
        background: #555;
        border-radius: 4px;
        transition: background 0.2s;
      }
      #colorPickerPanel::-webkit-scrollbar-thumb:hover {
        background: #777;
      }
    `;
    document.head.appendChild(style);
    (panel as any)._styleElement = style;

    const title = document.createElement('div');
    title.textContent = 'Category Colors';
    title.style.cssText = `
      font-size: 14px;
      font-weight: bold;
      color: #fff;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #555;
      cursor: move;
      user-select: none;
    `;
    panel.appendChild(title);

    // Add sorting buttons
    const sortContainer = document.createElement('div');
    sortContainer.style.cssText = `
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #444;
    `;

    const createSortButton = (text: string, icon: string) => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        flex: 1;
        padding: 4px 8px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid #555;
        border-radius: 4px;
        color: #ccc;
        font-size: 10px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      `;
      btn.innerHTML = `<span style="font-size: 12px;">${icon}</span> ${text}`;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(255, 255, 255, 0.15)';
        btn.style.borderColor = '#777';
        btn.style.color = '#fff';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(255, 255, 255, 0.08)';
        btn.style.borderColor = '#555';
        btn.style.color = '#ccc';
      });
      return btn;
    };

    const sortAlphaBtn = createSortButton('A-Z', '🔤');
    const sortCountBtn = createSortButton('Count', '🔢');

    // Add exit cluster button (initially hidden)
    const exitClusterBtn = document.createElement('button');
    exitClusterBtn.style.cssText = `
      width: 100%;
      padding: 8px;
      background: rgba(255, 100, 100, 0.15);
      border: 1px solid rgba(255, 100, 100, 0.4);
      border-radius: 4px;
      color: #ffaaaa;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
      display: none;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-bottom: 8px;
      font-weight: 600;
    `;
    exitClusterBtn.innerHTML = `<span style="font-size: 14px;">✖</span> Exit Cluster View`;
    
    exitClusterBtn.addEventListener('mouseenter', () => {
      exitClusterBtn.style.background = 'rgba(255, 100, 100, 0.25)';
      exitClusterBtn.style.borderColor = 'rgba(255, 100, 100, 0.6)';
      exitClusterBtn.style.color = '#ffcccc';
    });
    exitClusterBtn.addEventListener('mouseleave', () => {
      exitClusterBtn.style.background = 'rgba(255, 100, 100, 0.15)';
      exitClusterBtn.style.borderColor = 'rgba(255, 100, 100, 0.4)';
      exitClusterBtn.style.color = '#ffaaaa';
    });

    exitClusterBtn.addEventListener('click', async () => {
      try {
        if (this.cluster) {
          await this.cluster.exitToColorView(); // Exit to color view (not toggle)
          exitClusterBtn.style.display = 'none'; // Hide the button
          console.log('✅ Exited cluster view, returned to color view');
        }
      } catch (error) {
        console.error('Error exiting cluster view:', error);
      }
    });

    panel.appendChild(exitClusterBtn);

    let currentSort: 'alpha' | 'count' | 'none' = 'none';

    sortAlphaBtn.addEventListener('click', () => {
      currentSort = 'alpha';
      rebuildPanel('alpha');
    });

    sortCountBtn.addEventListener('click', () => {
      currentSort = 'count';
      rebuildPanel('count');
    });

    sortContainer.appendChild(sortAlphaBtn);
    sortContainer.appendChild(sortCountBtn);
    panel.appendChild(sortContainer);

    const rebuildPanel = (sortType: 'alpha' | 'count') => {
      // Remove all existing group containers
      const existingGroups = panel.querySelectorAll('.model-group-container');
      existingGroups.forEach(g => g.remove());

      // Rebuild groups with sorted categories
      buildModelGroups(sortType);
    };

    const buildModelGroups = (sortType: 'alpha' | 'count' | 'none' = 'none') => {
      for (const [modelId, modelCategories] of modelGroups) {
        // Sort categories based on sortType
        let sortedCategories = [...modelCategories];
        if (sortType === 'alpha') {
          sortedCategories.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortType === 'count') {
          sortedCategories.sort((a, b) => b.count - a.count);
        }

        // Create model group container
        const groupContainer = document.createElement('div');
        groupContainer.className = 'model-group-container';
        groupContainer.style.cssText = `
          margin-bottom: 8px;
          border: 1px solid #444;
          border-radius: 4px;
          overflow: hidden;
        `;

        // Create model header (expandable)
        const modelHeader = document.createElement('div');
        modelHeader.style.cssText = `
          padding: 8px 10px;
          background: rgba(255, 255, 255, 0.08);
          cursor: pointer;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: background 0.2s;
        `;

        const modelTitle = document.createElement('div');
        modelTitle.style.cssText = `
          font-size: 12px;
          font-weight: 600;
          color: #fff;
        `;
        modelTitle.textContent = modelId;

        const expandIcon = document.createElement('span');
        expandIcon.textContent = '▼';
        expandIcon.style.cssText = `
          font-size: 10px;
          color: #999;
          transition: transform 0.2s;
        `;

        modelHeader.appendChild(modelTitle);
        modelHeader.appendChild(expandIcon);

        // Create categories container
        const categoriesContainer = document.createElement('div');
        categoriesContainer.style.cssText = `
          max-height: 500px;
          overflow: hidden;
          transition: max-height 0.3s ease;
          background: rgba(0, 0, 0, 0.2);
        `;

        // Add color pickers for each category in this model
        sortedCategories.forEach(cat => {
          const row = document.createElement('div');
          row.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.03);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            cursor: default;
          `;

          const label = document.createElement('div');
          label.style.cssText = `
            font-size: 11px;
            color: #ccc;
            flex: 1;
            margin-right: 10px;
            user-select: none;
          `;
          label.textContent = `${cat.name.replace('IFC', '')} (${cat.count})`;

          // Create controls container (cluster button + color picker)
          const controlsContainer = document.createElement('div');
          controlsContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
          `;

          // Create cluster button
          const clusterBtn = document.createElement('button');
          clusterBtn.innerHTML = '📊';
          clusterBtn.title = 'View in cluster mode';
          clusterBtn.style.cssText = `
            width: 20px;
            height: 20px;
            border: none;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.1);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            transition: all 0.2s;
            padding: 0;
          `;

          clusterBtn.addEventListener('mouseenter', () => {
            clusterBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            clusterBtn.style.transform = 'scale(1.1)';
          });
          clusterBtn.addEventListener('mouseleave', () => {
            clusterBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            clusterBtn.style.transform = 'scale(1)';
          });

          clusterBtn.addEventListener('click', async () => {
            try {
              if (this.colorSplash && this.cluster) {
                // Get the elements for this category
                const elements = await this.colorSplash.getCategoryElements(cat.selectionName);
                if (elements) {
                  // Pass custom colors to cluster module
                  const categoryColors = this.colorSplash.getCategoryColors();
                  this.cluster.setCustomColors(categoryColors);
                  
                  // Show clusters for just this category
                  await this.cluster.showFilteredClusters(elements, cat.name);
                  // Show the exit cluster button
                  exitClusterBtn.style.display = 'flex';
                  console.log(`✅ Showing cluster view for ${cat.name}`);
                }
              }
            } catch (error) {
              console.error('Error showing cluster:', error);
            }
          });

          // Create a wrapper for the circular color picker
          const colorWrapper = document.createElement('div');
          colorWrapper.style.cssText = `
            position: relative;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            overflow: hidden;
            border: 2px solid #666;
            cursor: pointer;
            transition: border-color 0.2s, transform 0.1s;
            flex-shrink: 0;
          `;

          const colorInput = document.createElement('input');
          colorInput.type = 'color';
          colorInput.value = cat.color;
          colorInput.style.cssText = `
            position: absolute;
            top: -6px;
            left: -6px;
            width: 28px;
            height: 28px;
            border: none;
            cursor: pointer;
            opacity: 1;
          `;

          colorInput.addEventListener('change', async (e) => {
            const newColor = (e.target as HTMLInputElement).value;
            try {
              if (this.colorSplash) {
                await this.colorSplash.updateCategoryColor(cat.selectionName, newColor);
              }
            } catch (error) {
              console.error('Error updating color:', error);
            }
          });

          // Hover effects
          colorWrapper.addEventListener('mouseenter', () => {
            colorWrapper.style.borderColor = '#999';
            colorWrapper.style.transform = 'scale(1.2)';
          });
          colorWrapper.addEventListener('mouseleave', () => {
            colorWrapper.style.borderColor = '#666';
            colorWrapper.style.transform = 'scale(1)';
          });

          colorWrapper.appendChild(colorInput);
          controlsContainer.appendChild(clusterBtn);
          controlsContainer.appendChild(colorWrapper);
          row.appendChild(label);
          row.appendChild(controlsContainer);
          categoriesContainer.appendChild(row);
        });

        // Toggle expand/collapse
        let isExpanded = true;
        modelHeader.addEventListener('click', () => {
          isExpanded = !isExpanded;
          if (isExpanded) {
            categoriesContainer.style.maxHeight = '500px';
            expandIcon.style.transform = 'rotate(0deg)';
          } else {
            categoriesContainer.style.maxHeight = '0';
            expandIcon.style.transform = 'rotate(-90deg)';
          }
        });

        // Hover effect on header
        modelHeader.addEventListener('mouseenter', () => {
          modelHeader.style.background = 'rgba(255, 255, 255, 0.12)';
        });
        modelHeader.addEventListener('mouseleave', () => {
          modelHeader.style.background = 'rgba(255, 255, 255, 0.08)';
        });

        groupContainer.appendChild(modelHeader);
        groupContainer.appendChild(categoriesContainer);
        panel.appendChild(groupContainer);
      }
    };

    // Initial build with no sorting
    buildModelGroups('none');

    // Make panel draggable
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;

    const dragStart = (e: MouseEvent) => {
      if (e.target === title || e.target === panel) {
        initialX = e.clientX - currentX;
        initialY = e.clientY - currentY;
        isDragging = true;
        panel.style.cursor = 'grabbing';
      }
    };

    const drag = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        panel.style.left = currentX + 'px';
        panel.style.top = currentY + 'px';
        panel.style.right = 'auto';
      }
    };

    const dragEnd = () => {
      isDragging = false;
      panel.style.cursor = 'move';
    };

    title.addEventListener('mousedown', dragStart);
    panel.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    // Store cleanup function
    (panel as any)._cleanup = () => {
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('mouseup', dragEnd);
    };

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      background: transparent;
      border: none;
      color: #999;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      line-height: 24px;
      text-align: center;
    `;
    closeBtn.addEventListener('click', () => this.hideColorPickerPanel());
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#fff');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = '#999');
    panel.appendChild(closeBtn);

    document.body.appendChild(panel);
  }

  /**
   * Hide color picker panel
   */
  private hideColorPickerPanel(): void {
    const panel = document.getElementById('colorPickerPanel');
    if (panel) {
      // Clean up event listeners
      if ((panel as any)._cleanup) {
        (panel as any)._cleanup();
      }
      // Remove associated style element
      const styleElement = (panel as any)._styleElement;
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
      }
      panel.remove();
    }
  }
}
