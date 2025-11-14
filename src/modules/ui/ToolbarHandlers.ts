/**
 * ToolbarHandlers module
 * Contains all toolbar action handler functions
 */

import { IFCLoaderModule } from '../IFCLoaderModule';
import { ModelTransformModule } from '../ModelTransformModule';
import { MeasurementModule, MeasurementMode } from '../MeasurementModule';
import { FloorPlanModule } from '../FloorPlanModule';
import { MinimapModule } from '../MinimapModule';
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
  private propertiesPanel: PropertiesPanelModule | null = null;
  private showLoadingCallback: () => void;
  private hideLoadingCallback: () => void;
  private modelDashboard: ModelDashboard;
  private components: OBC.Components;
  private uiManager: UIManager;

  constructor(
    ifcLoader: IFCLoaderModule,
    modelTransform: ModelTransformModule,
    showLoadingCallback: () => void,
    hideLoadingCallback: () => void,
    measurement?: MeasurementModule | null,
    components?: OBC.Components,
    propertiesPanel?: PropertiesPanelModule,
    uiManager?: UIManager
  ) {
    this.ifcLoader = ifcLoader;
    this.modelTransform = modelTransform;
    this.showLoadingCallback = showLoadingCallback;
    this.hideLoadingCallback = hideLoadingCallback;
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
   * Handles file upload button click - triggers file picker
   */
  async handleFileUpload(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ifc,.frag';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      this.showLoadingCallback();
      
      try {
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        
        if (fileExtension === 'ifc') {
          await this.ifcLoader.loadIFC(file);
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
}
