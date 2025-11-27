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
  
  // Persistent state for color splash panel
  private selectedCategories: Set<string> = new Set();
  private isInClusterMode: boolean = false;

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
      this.updateMeasureButtonState(false);
      console.log('📏 Length measurement disabled');
      NotificationHelper.close();
    } else {
      // Enable length measurement
      this.measurement.setMode(MeasurementMode.LENGTH);
      this.updateMeasureButtonState(true);
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
      this.updateMeasureButtonState(false);
      console.log('📐 Area measurement disabled');
      NotificationHelper.close();
    } else {
      // Enable area measurement
      this.measurement.setMode(MeasurementMode.AREA);
      this.updateMeasureButtonState(true);
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
      this.updateMeasureButtonState(false);
      console.log('📦 Volume measurement disabled');
      NotificationHelper.close();
    } else {
      // Enable volume measurement
      this.measurement.setMode(MeasurementMode.VOLUME);
      this.updateMeasureButtonState(true);
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
    this.updateMeasureButtonState(false);
    NotificationHelper.close();
    console.log('✅ Measurement mode canceled');
  }

  /**
   * Updates the measurement button active state
   */
  private updateMeasureButtonState(isActive: boolean): void {
    const measureBtn = document.getElementById('measureBtn');
    if (measureBtn) {
      if (isActive) {
        measureBtn.classList.add('active');
      } else {
        measureBtn.classList.remove('active');
      }
    }
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
      
      // Update button appearance (now on main toolbar)
      const btn = document.getElementById('clusterMainBtn');
      if (btn) {
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
      
      // Update button appearance (now on main toolbar)
      const btn = document.getElementById('colorSplashMainBtn');
      if (btn) {
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
   * Cancel cluster mode and return to normal view
   */
  async handleCancelClusterMode(): Promise<void> {
    if (!this.cluster) {
      console.warn('⚠️ Cluster module not initialized');
      return;
    }

    try {
      // Exit cluster mode if active
      if (this.cluster.isClusteringActive()) {
        await this.cluster.toggleClusters(); // Turn off clustering
      }
      
      // Hide property table if visible
      if (this.colorSplash) {
        this.colorSplash.hidePropertyTable();
      }
      
      // Update button appearance
      const btn = document.getElementById('clusterMainBtn');
      if (btn) {
        btn.classList.remove('active');
      }
      
      // Fit view to show all models
      if (this.components.camera) {
        this.components.camera.fit();
      }
      
      console.log('✅ Exited cluster mode and fit view');
    } catch (error) {
      console.error('❌ Error canceling cluster mode:', error);
    }
  }

  /**
   * Cancel color splash mode and return to normal view
   */
  async handleCancelColorSplashMode(): Promise<void> {
    if (!this.colorSplash) {
      console.warn('⚠️ Color splash module not initialized');
      return;
    }

    try {
      // Exit color splash mode if active
      if (this.colorSplash.isColorSplashActive()) {
        await this.colorSplash.toggleColorSplash(); // Turn off color splash
      }
      
      // Hide property table
      this.colorSplash.hidePropertyTable();
      
      // Update button appearance
      const btn = document.getElementById('colorSplashMainBtn');
      if (btn) {
        btn.classList.remove('active');
      }
      
      // Hide color picker panel
      this.hideColorPickerPanel();
      
      // Fit view to show all models
      if (this.components.camera) {
        this.components.camera.fit();
      }
      
      console.log('✅ Exited color splash mode and fit view');
    } catch (error) {
      console.error('❌ Error canceling color splash mode:', error);
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
      background: linear-gradient(135deg, rgba(40, 40, 70, 0.95) 0%, rgba(30, 30, 50, 0.95) 100%);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 14px;
      max-height: 600px;
      overflow: hidden;
      z-index: 1000;
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      min-width: 320px;
      display: flex;
      flex-direction: column;
    `;

    // Add webkit scrollbar styles
    const style = document.createElement('style');
    style.textContent = `
      #colorPickerPanel .scrollable-content::-webkit-scrollbar {
        width: 10px;
      }
      #colorPickerPanel .scrollable-content::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 5px;
      }
      #colorPickerPanel .scrollable-content::-webkit-scrollbar-thumb {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.6) 0%, rgba(168, 85, 247, 0.6) 100%);
        border-radius: 5px;
        transition: background 0.2s;
      }
      #colorPickerPanel .scrollable-content::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.8) 0%, rgba(168, 85, 247, 0.8) 100%);
      }
    `;
    document.head.appendChild(style);
    (panel as any)._styleElement = style;

    // Create sticky header container
    const headerContainer = document.createElement('div');
    headerContainer.style.cssText = `
      padding: 18px 18px 0 18px;
      background: linear-gradient(135deg, rgba(40, 40, 70, 0.95) 0%, rgba(30, 30, 50, 0.95) 100%);
      position: sticky;
      top: 0;
      z-index: 10;
      cursor: move;
    `;

    const title = document.createElement('div');
    title.textContent = 'Category Colors';
    title.style.cssText = `
      font-size: 15px;
      font-weight: 700;
      background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      cursor: move;
      user-select: none;
      letter-spacing: 0.5px;
    `;
    headerContainer.appendChild(title);

    // Add sorting buttons
    const sortContainer = document.createElement('div');
    sortContainer.style.cssText = `
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `;

    const createSortButton = (text: string, icon: string) => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        flex: 1;
        padding: 6px 10px;
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        color: #e0e0ff;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
      `;
      btn.innerHTML = `<span style="font-size: 13px;">${icon}</span> ${text}`;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.25) 0%, rgba(118, 75, 162, 0.25) 100%)';
        btn.style.borderColor = 'rgba(255, 255, 255, 0.25)';
        btn.style.color = '#fff';
        btn.style.transform = 'translateY(-1px)';
        btn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)';
        btn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        btn.style.color = '#e0e0ff';
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = 'none';
      });
      return btn;
    };

    const sortAlphaBtn = createSortButton('A-Z', '🔤');
    const sortCountBtn = createSortButton('Count', '🔢');

    // Add refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(14, 165, 233, 0.2) 100%);
      border: 1px solid rgba(59, 130, 246, 0.4);
      border-radius: 8px;
      color: #bae6fd;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 10px;
      font-weight: 700;
      letter-spacing: 0.3px;
    `;
    refreshBtn.innerHTML = `<span style="font-size: 15px;">🔄</span> Refresh Categories`;
    
    refreshBtn.addEventListener('mouseenter', () => {
      refreshBtn.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(14, 165, 233, 0.3) 100%)';
      refreshBtn.style.borderColor = 'rgba(59, 130, 246, 0.6)';
      refreshBtn.style.color = '#e0f2fe';
      refreshBtn.style.transform = 'translateY(-1px)';
      refreshBtn.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)';
    });
    refreshBtn.addEventListener('mouseleave', () => {
      refreshBtn.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(14, 165, 233, 0.2) 100%)';
      refreshBtn.style.borderColor = 'rgba(59, 130, 246, 0.4)';
      refreshBtn.style.color = '#bae6fd';
      refreshBtn.style.transform = 'translateY(0)';
      refreshBtn.style.boxShadow = 'none';
    });

    refreshBtn.addEventListener('click', async () => {
      try {
        if (this.colorSplash) {
          // Show loading state
          const originalContent = refreshBtn.innerHTML;
          refreshBtn.innerHTML = `<span style="
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 2px solid rgba(170, 221, 255, 0.3);
            border-top-color: #aaddff;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          "></span> Loading...`;
          refreshBtn.style.cursor = 'wait';
          refreshBtn.disabled = true;
          
          // Add animation keyframes if not already present
          if (!document.getElementById('spin-animation')) {
            const style = document.createElement('style');
            style.id = 'spin-animation';
            style.textContent = `
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `;
            document.head.appendChild(style);
          }
          
          console.log('🔄 Refreshing color splash panel...');
          await this.colorSplash.refreshColorSplash();
          console.log('✅ Panel refreshed with latest categories');
          
          // Restore button state
          refreshBtn.innerHTML = originalContent;
          refreshBtn.style.cursor = 'pointer';
          refreshBtn.disabled = false;
        }
      } catch (error) {
        console.error('Error refreshing panel:', error);
        // Restore button on error too
        refreshBtn.innerHTML = `<span style="font-size: 14px;">🔄</span> Refresh Categories`;
        refreshBtn.style.cursor = 'pointer';
        refreshBtn.disabled = false;
      }
    });

    headerContainer.appendChild(refreshBtn);

    // Add exit cluster button (initially hidden)
    const exitClusterBtn = document.createElement('button');
    exitClusterBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.2) 100%);
      border: 1px solid rgba(239, 68, 68, 0.4);
      border-radius: 8px;
      color: #fecaca;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.3s;
      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 10px;
      font-weight: 700;
      letter-spacing: 0.3px;
    `;
    exitClusterBtn.innerHTML = `<span style="font-size: 15px;">✖</span> Exit Cluster View`;
    
    exitClusterBtn.addEventListener('mouseenter', () => {
      exitClusterBtn.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.3) 0%, rgba(220, 38, 38, 0.3) 100%)';
      exitClusterBtn.style.borderColor = 'rgba(239, 68, 68, 0.6)';
      exitClusterBtn.style.color = '#fee2e2';
      exitClusterBtn.style.transform = 'translateY(-1px)';
      exitClusterBtn.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.4)';
    });
    exitClusterBtn.addEventListener('mouseleave', () => {
      exitClusterBtn.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.2) 100%)';
      exitClusterBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      exitClusterBtn.style.color = '#fecaca';
      exitClusterBtn.style.transform = 'translateY(0)';
      exitClusterBtn.style.boxShadow = 'none';
    });

    exitClusterBtn.addEventListener('click', async () => {
      try {
        if (this.cluster) {
          await this.cluster.exitToColorView(); // Exit to color view (not toggle)
          exitClusterBtn.style.display = 'none'; // Hide the button
          updateClusterBtn.style.display = 'none'; // Hide update button too
          this.isInClusterMode = false; // Reset cluster mode flag
          this.selectedCategories.clear(); // Clear selections
          
          // Hide property table when exiting cluster mode
          if (this.colorSplash) {
            this.colorSplash.hidePropertyTable();
          }
          
          // Update UI
          const countSpan = document.getElementById('selectedCount');
          if (countSpan) {
            countSpan.textContent = '0';
          }
          viewSelectedBtn.style.display = 'none';
          
          // Uncheck all checkboxes
          const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
          checkboxes.forEach(cb => {
            (cb as HTMLInputElement).checked = false;
            (cb as HTMLInputElement).style.background = 'rgba(0, 0, 0, 0.3)';
            (cb as HTMLInputElement).style.borderColor = '#555';
          });
          
          console.log('✅ Exited cluster view, returned to color view');
        }
      } catch (error) {
        console.error('Error exiting cluster view:', error);
      }
    });

    headerContainer.appendChild(exitClusterBtn);

    // Add "Update Cluster" button (shown when in cluster mode with selections)
    const updateClusterBtn = document.createElement('button');
    updateClusterBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(20, 184, 166, 0.2) 100%);
      border: 1px solid rgba(16, 185, 129, 0.4);
      border-radius: 8px;
      color: #a7f3d0;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.3s;
      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 10px;
      font-weight: 700;
      letter-spacing: 0.3px;
    `;
    updateClusterBtn.innerHTML = `<span style="font-size: 15px;">🔄</span> Update Cluster View`;
    
    updateClusterBtn.addEventListener('mouseenter', () => {
      updateClusterBtn.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(20, 184, 166, 0.3) 100%)';
      updateClusterBtn.style.borderColor = 'rgba(16, 185, 129, 0.6)';
      updateClusterBtn.style.color = '#d1fae5';
      updateClusterBtn.style.transform = 'translateY(-1px)';
      updateClusterBtn.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
    });
    updateClusterBtn.addEventListener('mouseleave', () => {
      updateClusterBtn.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(20, 184, 166, 0.2) 100%)';
      updateClusterBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      updateClusterBtn.style.color = '#a7f3d0';
      updateClusterBtn.style.transform = 'translateY(0)';
      updateClusterBtn.style.boxShadow = 'none';
    });

    updateClusterBtn.addEventListener('click', async () => {
      try {
        if (this.colorSplash && this.cluster && this.selectedCategories.size > 0) {
          // Collect elements grouped by category for separate clusters
          const elementsByCategory = new Map<string, { [key: string]: Set<number> }>();
          const categoryNames: string[] = [];

          for (const selectionName of this.selectedCategories) {
            const elements = await this.colorSplash.getCategoryElements(selectionName);
            if (elements) {
              // Extract category name from selection name
              const categoryInfo = categories.find(c => c.selectionName === selectionName);
              if (categoryInfo) {
                // Store elements grouped by category name (not merged)
                elementsByCategory.set(categoryInfo.name, elements);
                categoryNames.push(categoryInfo.name);
              }
            }
          }

          if (elementsByCategory.size > 0) {
            // Pass custom colors to cluster module
            const categoryColors = this.colorSplash.getCategoryColors();
            this.cluster.setCustomColors(categoryColors);
            
            // Show clusters for selected categories (each in its own bounding box)
            const label = categoryNames.join(', ');
            await this.cluster.showFilteredClusters(elementsByCategory, label);
            
            // Update property table with visible elements
            if (this.colorSplash) {
              const clusterScene = this.cluster?.getClusterScene();
              await this.colorSplash.showPropertyTable(elementsByCategory, clusterScene);
            }
            
            console.log(`✅ Updated cluster view with ${categoryNames.length} categories`);
          }
        }
      } catch (error) {
        console.error('Error updating cluster:', error);
      }
    });

    headerContainer.appendChild(updateClusterBtn);

    // Add "View Selected" button (initially hidden)
    const viewSelectedBtn = document.createElement('button');
    viewSelectedBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%);
      border: 1px solid rgba(139, 92, 246, 0.4);
      border-radius: 8px;
      color: #e9d5ff;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.3s;
      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 10px;
      font-weight: 700;
      letter-spacing: 0.3px;
    `;
    viewSelectedBtn.innerHTML = `<span style="font-size: 15px;">📊</span> View Selected (<span id="selectedCount">0</span>)`;
    
    viewSelectedBtn.addEventListener('mouseenter', () => {
      viewSelectedBtn.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(236, 72, 153, 0.3) 100%)';
      viewSelectedBtn.style.borderColor = 'rgba(139, 92, 246, 0.6)';
      viewSelectedBtn.style.color = '#f3e8ff';
      viewSelectedBtn.style.transform = 'translateY(-1px)';
      viewSelectedBtn.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.4)';
    });
    viewSelectedBtn.addEventListener('mouseleave', () => {
      viewSelectedBtn.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)';
      viewSelectedBtn.style.borderColor = 'rgba(139, 92, 246, 0.4)';
      viewSelectedBtn.style.color = '#e9d5ff';
      viewSelectedBtn.style.transform = 'translateY(0)';
      viewSelectedBtn.style.boxShadow = 'none';
    });

    viewSelectedBtn.addEventListener('click', async () => {
      try {
        if (this.colorSplash && this.cluster && this.selectedCategories.size > 0) {
          // Collect elements grouped by category for separate clusters
          const elementsByCategory = new Map<string, { [key: string]: Set<number> }>();
          const categoryNames: string[] = [];

          for (const selectionName of this.selectedCategories) {
            const elements = await this.colorSplash.getCategoryElements(selectionName);
            if (elements) {
              // Extract category name from selection name
              const categoryInfo = categories.find(c => c.selectionName === selectionName);
              if (categoryInfo) {
                // Store elements grouped by category name (not merged)
                elementsByCategory.set(categoryInfo.name, elements);
                categoryNames.push(categoryInfo.name);
              }
            }
          }

          if (elementsByCategory.size > 0) {
            // Pass custom colors to cluster module
            const categoryColors = this.colorSplash.getCategoryColors();
            this.cluster.setCustomColors(categoryColors);
            
            // Show clusters for selected categories (each in its own bounding box)
            const label = categoryNames.join(', ');
            await this.cluster.showFilteredClusters(elementsByCategory, label);
            
            // Show property table with visible elements
            if (this.colorSplash) {
              const clusterScene = this.cluster?.getClusterScene();
              await this.colorSplash.showPropertyTable(elementsByCategory, clusterScene);
            }
            
            // Show the exit cluster button and mark as in cluster mode
            exitClusterBtn.style.display = 'flex';
            this.isInClusterMode = true;
            console.log(`✅ Showing cluster view for ${categoryNames.length} selected categories`);
          }
        }
      } catch (error) {
        console.error('Error showing selected clusters:', error);
      }
    });

    headerContainer.appendChild(viewSelectedBtn);

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
    headerContainer.appendChild(sortContainer);
    
    // Append header to panel
    panel.appendChild(headerContainer);
    
    // Create scrollable content container
    const scrollableContent = document.createElement('div');
    scrollableContent.className = 'scrollable-content';
    scrollableContent.style.cssText = `
      padding: 0 18px 18px 18px;
      overflow-y: auto;
      max-height: calc(600px - 280px);
      scrollbar-width: thin;
      scrollbar-color: rgba(139, 92, 246, 0.6) rgba(0, 0, 0, 0.2);
    `;
    panel.appendChild(scrollableContent);

    const rebuildPanel = (sortType: 'alpha' | 'count') => {
      // Remove all existing group containers from scrollable content
      const existingGroups = scrollableContent.querySelectorAll('.model-group-container');
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
          margin-bottom: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.03);
        `;

        // Create model header (expandable)
        const modelHeader = document.createElement('div');
        modelHeader.style.cssText = `
          padding: 10px 12px;
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
          cursor: pointer;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.3s;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        `;

        const modelTitle = document.createElement('div');
        modelTitle.style.cssText = `
          font-size: 13px;
          font-weight: 700;
          background: linear-gradient(135deg, #a5b4fc 0%, #c4b5fd 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: 0.3px;
        `;
        modelTitle.textContent = modelId;

        const expandIcon = document.createElement('span');
        expandIcon.textContent = '▼';
        expandIcon.style.cssText = `
          font-size: 11px;
          color: #a5b4fc;
          transition: transform 0.3s;
        `;

        modelHeader.appendChild(modelTitle);
        modelHeader.appendChild(expandIcon);

        // Create categories container
        const categoriesContainer = document.createElement('div');
        categoriesContainer.style.cssText = `
          max-height: 500px;
          overflow: hidden;
          transition: max-height 0.3s ease;
          background: rgba(0, 0, 0, 0.15);
        `;

        // Add color pickers for each category in this model
        sortedCategories.forEach(cat => {
          const row = document.createElement('div');
          row.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            background: rgba(255, 255, 255, 0.02);
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
            cursor: default;
            transition: background 0.2s;
          `;
          
          row.addEventListener('mouseenter', () => {
            row.style.background = 'rgba(255, 255, 255, 0.05)';
          });
          row.addEventListener('mouseleave', () => {
            row.style.background = 'rgba(255, 255, 255, 0.02)';
          });

          // Create checkbox for multi-selection
          const checkboxWrapper = document.createElement('div');
          checkboxWrapper.style.cssText = `
            position: relative;
            width: 16px;
            height: 16px;
            margin-right: 8px;
            flex-shrink: 0;
          `;

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.style.cssText = `
            width: 18px;
            height: 18px;
            cursor: pointer;
            appearance: none;
            -webkit-appearance: none;
            border: 2px solid rgba(139, 92, 246, 0.4);
            border-radius: 4px;
            background: rgba(0, 0, 0, 0.3);
            transition: all 0.3s;
            position: relative;
          `;
          checkbox.checked = this.selectedCategories.has(cat.selectionName);
          
          // Add checked state styling
          const updateCheckboxStyle = () => {
            if (checkbox.checked) {
              checkbox.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)';
              checkbox.style.borderColor = '#8b5cf6';
              checkbox.style.boxShadow = '0 2px 8px rgba(139, 92, 246, 0.5)';
            } else {
              checkbox.style.background = 'rgba(0, 0, 0, 0.3)';
              checkbox.style.borderColor = 'rgba(139, 92, 246, 0.4)';
              checkbox.style.boxShadow = 'none';
            }
          };
          updateCheckboxStyle();

          checkbox.addEventListener('mouseenter', () => {
            if (!checkbox.checked) {
              checkbox.style.borderColor = 'rgba(139, 92, 246, 0.6)';
              checkbox.style.background = 'rgba(139, 92, 246, 0.1)';
            }
          });
          checkbox.addEventListener('mouseleave', () => {
            if (!checkbox.checked) {
              checkbox.style.borderColor = 'rgba(139, 92, 246, 0.4)';
              checkbox.style.background = 'rgba(0, 0, 0, 0.3)';
            }
          });
          
          checkbox.addEventListener('change', () => {
            updateCheckboxStyle();
            
            if (checkbox.checked) {
              this.selectedCategories.add(cat.selectionName);
            } else {
              this.selectedCategories.delete(cat.selectionName);
            }
            
            // Update selected count
            const countSpan = document.getElementById('selectedCount');
            if (countSpan) {
              countSpan.textContent = this.selectedCategories.size.toString();
            }
            
            // Show/hide appropriate buttons based on state
            if (this.selectedCategories.size > 0) {
              if (this.isInClusterMode) {
                // In cluster mode: show update button instead of view button
                updateClusterBtn.style.display = 'flex';
                viewSelectedBtn.style.display = 'none';
              } else {
                // Not in cluster mode: show view button
                viewSelectedBtn.style.display = 'flex';
                updateClusterBtn.style.display = 'none';
              }
            } else {
              // No selection: hide both buttons
              viewSelectedBtn.style.display = 'none';
              updateClusterBtn.style.display = 'none';
            }
          });

          checkboxWrapper.appendChild(checkbox);

          const label = document.createElement('div');
          label.style.cssText = `
            font-size: 12px;
            color: #e0e0ff;
            flex: 1;
            margin-right: 10px;
            user-select: none;
            font-weight: 500;
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
          clusterBtn.innerHTML = '<i class="fas fa-cubes" style="font-size: 11px;"></i>';
          clusterBtn.title = 'View in cluster mode';
          clusterBtn.style.cssText = `
            width: 28px;
            height: 28px;
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 8px;
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(14, 165, 233, 0.15) 100%);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #60a5fa;
            transition: all 0.3s;
            padding: 0;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          `;

          clusterBtn.addEventListener('mouseenter', () => {
            clusterBtn.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(14, 165, 233, 0.25) 100%)';
            clusterBtn.style.borderColor = 'rgba(59, 130, 246, 0.5)';
            clusterBtn.style.color = '#93c5fd';
            clusterBtn.style.transform = 'translateY(-2px)';
            clusterBtn.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.5)';
          });
          clusterBtn.addEventListener('mouseleave', () => {
            clusterBtn.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(14, 165, 233, 0.15) 100%)';
            clusterBtn.style.borderColor = 'rgba(59, 130, 246, 0.3)';
            clusterBtn.style.color = '#60a5fa';
            clusterBtn.style.transform = 'translateY(0)';
            clusterBtn.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
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
                  
                  // Create map with single category
                  const elementsByCategory = new Map<string, { [key: string]: Set<number> }>();
                  elementsByCategory.set(cat.name, elements);
                  
                  // Show clusters for just this category
                  await this.cluster.showFilteredClusters(elementsByCategory, cat.name);
                  
                  // Show property table with visible elements
                  if (this.colorSplash) {
                    const clusterScene = this.cluster?.getClusterScene();
                    console.log('📊 ToolbarHandlers: Passing cluster scene:', !!clusterScene);
                    await this.colorSplash.showPropertyTable(elementsByCategory, clusterScene);
                  }
                  
                  // Show the exit cluster button and mark as in cluster mode
                  exitClusterBtn.style.display = 'flex';
                  this.isInClusterMode = true;
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
            width: 18px;
            height: 18px;
            border-radius: 50%;
            overflow: hidden;
            border: 2px solid rgba(255, 255, 255, 0.3);
            cursor: pointer;
            transition: all 0.3s;
            flex-shrink: 0;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          `;
          
          colorWrapper.addEventListener('mouseenter', () => {
            colorWrapper.style.borderColor = 'rgba(255, 255, 255, 0.6)';
            colorWrapper.style.transform = 'scale(1.15)';
            colorWrapper.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5)';
          });
          colorWrapper.addEventListener('mouseleave', () => {
            colorWrapper.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            colorWrapper.style.transform = 'scale(1)';
            colorWrapper.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
          });

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
          row.appendChild(checkboxWrapper);
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
        scrollableContent.appendChild(groupContainer);
      }
    };

    // Initial build with no sorting
    buildModelGroups('none');

    // Restore UI state after panel rebuild
    const countSpan = document.getElementById('selectedCount');
    if (countSpan) {
      countSpan.textContent = this.selectedCategories.size.toString();
    }
    
    if (this.selectedCategories.size > 0) {
      if (this.isInClusterMode) {
        updateClusterBtn.style.display = 'flex';
        viewSelectedBtn.style.display = 'none';
        exitClusterBtn.style.display = 'flex';
      } else {
        viewSelectedBtn.style.display = 'flex';
        updateClusterBtn.style.display = 'none';
        exitClusterBtn.style.display = 'none';
      }
    } else {
      viewSelectedBtn.style.display = 'none';
      updateClusterBtn.style.display = 'none';
      exitClusterBtn.style.display = this.isInClusterMode ? 'flex' : 'none';
    }

    // Make panel draggable
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const dragStart = (e: MouseEvent) => {
      // Only allow dragging from title or headerContainer, not from buttons or scrollable area
      const target = e.target as HTMLElement;
      if (target === title || target === headerContainer || target.classList.contains('brand-text')) {
        const rect = panel.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        isDragging = true;
        panel.style.cursor = 'grabbing';
        headerContainer.style.cursor = 'grabbing';
      }
    };

    const drag = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        const newX = e.clientX - offsetX;
        const newY = e.clientY - offsetY;
        
        panel.style.left = newX + 'px';
        panel.style.top = newY + 'px';
        panel.style.right = 'auto';
      }
    };

    const dragEnd = () => {
      isDragging = false;
      panel.style.cursor = 'default';
      headerContainer.style.cursor = 'move';
    };

    headerContainer.addEventListener('mousedown', dragStart);
    title.addEventListener('mousedown', dragStart);
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
