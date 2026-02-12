/**
 * TOOLBAR HANDLERS (The "Brain Behind the Buttons")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is the logic center for the menu bar. While the Builder creates the 
 * buttons, this file decides what happens when you click them—like opening 
 * a file, starting a measurement, or switching to the Slicer view.
 * 
 * HOW IT CONNECTS:
 * - WebGL/WebGPU Modules: Triggers 3D actions (like "Fit to View").
 * - Dashboards: Opens and closes the Slicer or Model dashboards.
 * - IFC Loader: Starts the process of importing a new 3D file.
 * --------------------------------------------------------------------------------
 */

import { 
  MeasurementModule, 
  MeasurementMode, 
  FloorPlanModule, 
  MinimapModule, 
  ModelTransformModule, 
  ClusterModule, 
  ColorSplashModule 
} from '../webgl';
import { IFCLoaderModule } from '../core/IFCLoaderModule';
import { PropertiesPanelModule } from '../core/PropertiesPanelModule';
import { NotificationHelper } from './NotificationHelper';
import { ModelDashboard } from './ModelDashboard';
import { SlicerDashboard } from './SlicerDashboard';
import { UIManager } from '../UIManager';
import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';

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
  private slicerDashboard: SlicerDashboard;
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
    this.slicerDashboard = new SlicerDashboard();
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
   * Sets the WebGPU renderer module
   */
  setWebGPURenderer(webgpu: any): void {
    if (this.slicerDashboard) {
      this.slicerDashboard.setWebGPURenderer(webgpu);
    }
    if (this.colorSplash) {
      this.colorSplash.setWebGPURenderer(webgpu);
    }
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
   * Helper to save file with user-selected filename and location
   * Uses File System Access API when available, falls back to download link
   */
  private async saveFileWithDialog(
    blob: Blob,
    defaultName: string,
    description: string,
    extension: string,
    mimeType: string
  ): Promise<boolean> {
    try {
      // Try using File System Access API (Chrome, Edge)
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: defaultName,
          types: [{
            description: description,
            accept: { [mimeType]: [`.${extension}`] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      }
    } catch (e: any) {
      // User cancelled or API not supported
      if (e.name === 'AbortError') {
        return false; // User cancelled
      }
      console.warn('File System Access API not available, using fallback');
    }
    
    // Fallback: prompt for filename and use download link
    const userFilename = prompt('Enter filename:', defaultName);
    if (!userFilename) return false; // User cancelled
    
    const finalName = userFilename.endsWith(`.${extension}`) 
      ? userFilename 
      : `${userFilename}.${extension}`;
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalName;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }

  /**
   * Handles export functionality - exports loaded models as fragments
   */
  async handleExport(): Promise<void> {
    // This is now just a fallback - the submenu handles individual exports
    await this.handleExportFragments();
  }

  /**
   * Export as Fragments (.frag) - fast loading format
   */
  async handleExportFragments(): Promise<void> {
    try {
      const models = this.ifcLoader.getLoadedModels();
      if (models.size === 0) {
        NotificationHelper.show({
          title: '📦 No Models',
          message: 'Please load an IFC model first',
          type: 'info',
          duration: 3000
        });
        return;
      }

      console.log('🔄 Exporting fragments...');
      const blob = await this.ifcLoader.exportFragments();
      
      if (!blob) {
        NotificationHelper.show({
          title: '⚠️ Export Failed',
          message: 'No fragments data available',
          type: 'warning',
          duration: 3000
        });
        return;
      }
      
      const saved = await this.saveFileWithDialog(
        blob,
        'model.frag',
        'Fragments File',
        'frag',
        'application/octet-stream'
      );
      
      if (saved) {
        NotificationHelper.show({
          title: '✅ Export Complete',
          message: 'Fragments (.frag) exported successfully',
          type: 'success',
          duration: 3000
        });
      }
    } catch (error) {
      console.error('❌ Error exporting fragments:', error);
      NotificationHelper.show({
        title: '❌ Export Failed',
        message: `${error}`,
        type: 'error',
        duration: 5000
      });
    }
  }

  /**
   * Helper to create exportable geometry from IFC mesh (handles instanced/interleaved buffers)
   */
  private createExportableGeometry(mesh: THREE.Mesh): THREE.BufferGeometry | null {
    try {
      const srcGeom = mesh.geometry;
      if (!srcGeom) return null;

      // Try to get position attribute - use attributes directly first (Fragment style)
      let posAttr = srcGeom.attributes?.position as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
      if (!posAttr) {
        posAttr = srcGeom.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
      }
      
      if (!posAttr || posAttr.count === 0) return null;
      
      // For InterleavedBufferAttribute, the array is on the data property
      let posArray: Float32Array;
      const isInterleaved = !!(posAttr as any).isInterleavedBufferAttribute;
      
      if (isInterleaved) {
        // Interleaved buffer - check if data.array exists
        const interleavedAttr = posAttr as THREE.InterleavedBufferAttribute;
        if (!interleavedAttr.data || !interleavedAttr.data.array) {
          // Try using getX/Y/Z which may work even without direct array access
          try {
            posArray = new Float32Array(posAttr.count * 3);
            for (let i = 0; i < posAttr.count; i++) {
              posArray[i * 3] = posAttr.getX(i);
              posArray[i * 3 + 1] = posAttr.getY(i);
              posArray[i * 3 + 2] = posAttr.getZ(i);
            }
          } catch {
            return null;
          }
        } else {
          posArray = new Float32Array(posAttr.count * 3);
          for (let i = 0; i < posAttr.count; i++) {
            posArray[i * 3] = posAttr.getX(i);
            posArray[i * 3 + 1] = posAttr.getY(i);
            posArray[i * 3 + 2] = posAttr.getZ(i);
          }
        }
      } else {
        // Standard BufferAttribute - check for array
        const bufferAttr = posAttr as THREE.BufferAttribute;
        const directArray = bufferAttr.array;
        if (!directArray || directArray.length === 0) {
          return null;
        }
        posArray = new Float32Array(directArray.length);
        for (let i = 0; i < directArray.length; i++) {
          posArray[i] = directArray[i] ?? 0;
        }
      }

      // Validate position data - check for NaN values and replace with 0
      let hasValidData = false;
      for (let i = 0; i < posArray.length; i++) {
        if (isNaN(posArray[i]) || !isFinite(posArray[i])) {
          posArray[i] = 0;
        } else {
          hasValidData = true;
        }
      }
      
      // Skip geometry if all values are invalid
      if (!hasValidData) {
        return null;
      }

      // Create new geometry with plain BufferAttributes
      const newGeom = new THREE.BufferGeometry();
      newGeom.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

      // Copy normal data if exists
      let normAttr = srcGeom.attributes?.normal as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
      if (!normAttr) {
        normAttr = srcGeom.getAttribute('normal') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
      }
      
      if (normAttr && normAttr.count > 0) {
        const normIsInterleaved = !!(normAttr as any).isInterleavedBufferAttribute;
        let normArray: Float32Array;
        
        if (normIsInterleaved) {
          normArray = new Float32Array(normAttr.count * 3);
          for (let i = 0; i < normAttr.count; i++) {
            normArray[i * 3] = normAttr.getX(i);
            normArray[i * 3 + 1] = normAttr.getY(i);
            normArray[i * 3 + 2] = normAttr.getZ(i);
          }
        } else {
          const directArray = (normAttr as THREE.BufferAttribute).array;
          if (directArray && directArray.length > 0) {
            normArray = new Float32Array(directArray.length);
            for (let i = 0; i < directArray.length; i++) {
              normArray[i] = directArray[i] ?? 0;
            }
          } else {
            newGeom.computeVertexNormals();
            normArray = null!;
          }
        }
        
        if (normArray) {
          // Validate normal data
          for (let i = 0; i < normArray.length; i++) {
            if (isNaN(normArray[i]) || !isFinite(normArray[i])) {
              normArray[i] = 0;
            }
          }
          newGeom.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
        }
      } else {
        newGeom.computeVertexNormals();
      }

      // Copy index if exists
      const indexAttr = srcGeom.getIndex();
      if (indexAttr && indexAttr.count > 0) {
        const indexArray = (indexAttr as THREE.BufferAttribute).array;
        if (indexArray && indexArray.length > 0) {
          const newIndexArray = new Uint32Array(indexArray.length);
          for (let i = 0; i < indexArray.length; i++) {
            newIndexArray[i] = indexArray[i] ?? 0;
          }
          newGeom.setIndex(new THREE.BufferAttribute(newIndexArray, 1));
        }
      }

      // Apply world matrix to vertices
      newGeom.applyMatrix4(mesh.matrixWorld);

      return newGeom;
    } catch (e) {
      console.warn('Failed to create exportable geometry:', e);
      return null;
    }
  }

  /**
   * Creates an export-safe material while preserving visible IFC colors/opacities
   */
  private createExportMaterial(
    sourceMaterial: THREE.Material | THREE.Material[] | undefined,
    preferStandardMaterial: boolean = false
  ): THREE.Material {
    const baseMaterial = Array.isArray(sourceMaterial) ? sourceMaterial[0] : sourceMaterial;

    if (!baseMaterial) {
      return new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.5,
        metalness: 0,
        side: THREE.DoubleSide,
      });
    }

    const matAny = baseMaterial as any;
    const color = matAny.color instanceof THREE.Color ? matAny.color.clone() : new THREE.Color(0xcccccc);
    const opacity = typeof matAny.opacity === 'number' ? matAny.opacity : 1;
    const transparent = !!matAny.transparent || opacity < 1;

    if (preferStandardMaterial) {
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent,
        opacity,
      });
    }

    if (
      baseMaterial instanceof THREE.MeshStandardMaterial ||
      baseMaterial instanceof THREE.MeshPhysicalMaterial ||
      baseMaterial instanceof THREE.MeshPhongMaterial ||
      baseMaterial instanceof THREE.MeshLambertMaterial ||
      baseMaterial instanceof THREE.MeshBasicMaterial
    ) {
      const cloned = baseMaterial.clone();
      cloned.side = THREE.DoubleSide;
      return cloned;
    }

    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent,
      opacity,
    });
  }

  private async getItemIdsWithGeometry(model: any): Promise<number[]> {
    if (typeof model?.getItemsIdsWithGeometry === 'function') {
      return await model.getItemsIdsWithGeometry();
    }
    if (typeof model?.getItemsWithGeometry === 'function') {
      const res = await model.getItemsWithGeometry();
      return Array.isArray(res)
        ? res
            .map((it: any) => (typeof it === 'number' ? it : it?.localId ?? it?.id))
            .filter((v: any) => typeof v === 'number')
        : [];
    }
    return [];
  }

  private async loadRealMaterials(model: any): Promise<Map<number, { r: number; g: number; b: number; a?: number }>> {
    const map = new Map<number, { r: number; g: number; b: number; a?: number }>();
    try {
      if (typeof model?.getMaterials === 'function') {
        const all = await model.getMaterials();
        if (all instanceof Map) {
          for (const [id, m] of all) {
            map.set(id, {
              r: (m as any).r ?? 200,
              g: (m as any).g ?? 200,
              b: (m as any).b ?? 200,
              a: (m as any).a,
            });
          }
        }
      }
    } catch {
      // ignore, fallback color is used
    }
    return map;
  }

  private async loadSamples(model: any): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    try {
      if (typeof model?.getSamples === 'function') {
        const all = await model.getSamples();
        if (all instanceof Map) {
          for (const [id, s] of all) {
            if (typeof (s as any).material === 'number') {
              map.set(id, (s as any).material);
            }
          }
        }
      }
    } catch {
      // ignore, fallback color is used
    }
    return map;
  }

  private async loadMaterialDefinitions(model: any, itemIds: number[]): Promise<Map<number, any>> {
    const map = new Map<number, any>();
    if (typeof model?.getItemsMaterialDefinition !== 'function') return map;

    const chunkSize = 250;
    for (let i = 0; i < itemIds.length; i += chunkSize) {
      try {
        const chunk = itemIds.slice(i, i + chunkSize);
        const defs = await model.getItemsMaterialDefinition(chunk);
        if (Array.isArray(defs)) {
          for (const entry of defs) {
            const def = entry?.definition;
            const ids = entry?.localIds;
            if (!def || !ids) continue;

            if (Array.isArray(ids)) {
              for (const id of ids) map.set(id, def);
            } else if (ids instanceof Set) {
              for (const id of ids) map.set(id, def);
            }
          }
        }
      } catch {
        // ignore this chunk
      }
    }

    return map;
  }

  private parseDefinitionColor(rawColor: any): THREE.Color | null {
    if (!rawColor) return null;
    if (rawColor instanceof THREE.Color) return rawColor.clone();
    if (Array.isArray(rawColor) && rawColor.length >= 3) {
      const [r, g, b] = rawColor;
      return new THREE.Color(Number(r), Number(g), Number(b));
    }
    if (typeof rawColor === 'number') {
      return new THREE.Color(rawColor);
    }
    if (typeof rawColor === 'object' && 'r' in rawColor && 'g' in rawColor && 'b' in rawColor) {
      return new THREE.Color(Number(rawColor.r), Number(rawColor.g), Number(rawColor.b));
    }
    return null;
  }

  private extractIfcValue(value: any): any {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'object') return value;

    if ('value' in value) {
      return (value as any).value;
    }

    return undefined;
  }

  private buildMeshMetadata(modelId: string, expressID: number, itemData: any): Record<string, any> {
    if (!itemData || typeof itemData !== 'object') {
      return {
        modelId,
        expressID,
      };
    }

    const metadata: Record<string, any> = {
      modelId,
      expressID,
      type: itemData.type || itemData._category?.value || 'UNKNOWN',
      globalId: this.extractIfcValue(itemData.GlobalId),
      name: this.extractIfcValue(itemData.Name),
      predefinedType: this.extractIfcValue(itemData.PredefinedType),
      objectType: this.extractIfcValue(itemData.ObjectType),
      tag: this.extractIfcValue(itemData.Tag),
      description: this.extractIfcValue(itemData.Description),
    };

    const basicAttributes: Record<string, any> = {};
    for (const [key, raw] of Object.entries(itemData)) {
      if (key.startsWith('_')) continue;
      if (Array.isArray(raw)) continue;
      const extracted = this.extractIfcValue(raw);
      if (extracted !== undefined && extracted !== null) {
        basicAttributes[key] = extracted;
      }
    }

    if (Object.keys(basicAttributes).length > 0) {
      metadata.attributes = basicAttributes;
    }

    return metadata;
  }

  private async loadItemMetadata(
    model: any,
    modelId: string,
    itemIds: number[]
  ): Promise<Map<number, Record<string, any>>> {
    const metadataMap = new Map<number, Record<string, any>>();

    // IMPORTANT:
    // For some IFC files, worker-side getItemsData can throw repeatedly
    // (e.g. "Cannot use 'in' operator ... in false"). To keep export stable,
    // we avoid metadata API calls here and build robust identity metadata only.
    for (const expressID of itemIds) {
      metadataMap.set(expressID, { modelId, expressID });
    }

    return metadataMap;
  }

  private async loadGeometryCategories(
    model: any,
    itemIds: number[]
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>();

    try {
      if (typeof model?.getItemsWithGeometryCategories === 'function') {
        const categories = await model.getItemsWithGeometryCategories();
        if (Array.isArray(categories)) {
          for (let i = 0; i < Math.min(itemIds.length, categories.length); i++) {
            const id = itemIds[i];
            const cat = categories[i];
            if (typeof id === 'number' && typeof cat === 'string' && cat.length > 0) {
              map.set(id, cat.toUpperCase());
            }
          }
          if (map.size > 0) return map;
        }
      }

      if (typeof model?.getCategories === 'function' && typeof model?.getItemsOfCategories === 'function') {
        const categories = await model.getCategories();
        if (Array.isArray(categories)) {
          for (const category of categories) {
            const categoryRegex = new RegExp(`^${category}$`);
            const items = await model.getItemsOfCategories([categoryRegex]);
            if (!items || typeof items !== 'object') continue;

            for (const key in items) {
              const ids = (items as any)[key];
              if (!Array.isArray(ids)) continue;
              for (const id of ids) {
                if (typeof id === 'number') {
                  map.set(id, String(category).toUpperCase());
                }
              }
            }
          }
        }
      }
    } catch {
      // ignore and use IFCITEM fallback
    }

    return map;
  }

  private buildMaterialFromIfcData(
    meshData: any,
    itemId: number,
    sampleToMaterialId: Map<number, number>,
    realMaterialsMap: Map<number, { r: number; g: number; b: number; a?: number }>,
    localIdToMaterialDef: Map<number, any>,
    preferStandardMaterial: boolean = false
  ): THREE.Material {
    const localIdForMesh = typeof meshData?.localId === 'number' ? meshData.localId : itemId;

    let color = new THREE.Color(0xcccccc);
    let opacity = 1;
    let transparent = false;

    const sampleId = (meshData as any)?.sampleId;
    const matId = sampleToMaterialId.get(sampleId);
    const rawMat = typeof matId === 'number' ? realMaterialsMap.get(matId) : undefined;

    if (rawMat) {
      color = new THREE.Color(rawMat.r / 255, rawMat.g / 255, rawMat.b / 255);
      opacity = typeof rawMat.a === 'number' ? rawMat.a / 255 : 1;
      transparent = opacity < 1;
    } else {
      const def = localIdToMaterialDef.get(localIdForMesh);
      if (def) {
        const parsedColor = this.parseDefinitionColor(def.color);
        if (parsedColor) color = parsedColor;
        if (typeof def.opacity === 'number') opacity = def.opacity;
        transparent = !!def.transparent || opacity < 1;
      }
    }

    return this.createExportMaterial(
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0,
        side: THREE.DoubleSide,
        opacity,
        transparent,
      }),
      preferStandardMaterial
    );
  }

  private async buildExportGroupFromItemsGeometry(
    models: Map<string, any>,
    preferStandardMaterial: boolean,
    bakeTransformIntoGeometry: boolean
  ): Promise<{ exportGroup: THREE.Group; meshCount: number; metadataByMeshName: Map<string, Record<string, any>> }> {
    const exportGroup = new THREE.Group();
    let meshCount = 0;
    const metadataByMeshName = new Map<string, Record<string, any>>();

    for (const [modelId, model] of models) {
      console.log(`📦 Processing model for export: ${modelId}`);

      try {
        const itemIds = await this.getItemIdsWithGeometry(model);
        console.log(`  📊 Found ${itemIds.length} items with geometry`);
        if (itemIds.length === 0) continue;

        const [realMaterialsMap, sampleToMaterialId, localIdToMaterialDef, localIdToCategory] = await Promise.all([
          this.loadRealMaterials(model),
          this.loadSamples(model),
          this.loadMaterialDefinitions(model, itemIds),
          this.loadGeometryCategories(model, itemIds),
        ]);

        const itemMetadataMap = await this.loadItemMetadata(model, modelId, itemIds);

        const batchSize = 100;
        for (let i = 0; i < itemIds.length; i += batchSize) {
          const batch = itemIds.slice(i, i + batchSize);
          const geometriesArray = await model.getItemsGeometry(batch);

          for (let j = 0; j < batch.length; j++) {
            const itemId = batch[j];
            const itemGeometries = geometriesArray[j];
            if (!itemGeometries) continue;

            for (const meshData of itemGeometries) {
              if (!meshData || !meshData.positions || !meshData.indices) continue;

              const geometry = new THREE.BufferGeometry();
              geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions, 3));

              if (meshData.normals) {
                const normalArray = new Float32Array(meshData.normals.length);
                for (let k = 0; k < meshData.normals.length; k++) {
                  normalArray[k] = meshData.normals[k] / 32767;
                }
                geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalArray, 3));
              } else {
                geometry.computeVertexNormals();
              }

              geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));

              const material = this.buildMaterialFromIfcData(
                meshData,
                itemId,
                sampleToMaterialId,
                realMaterialsMap,
                localIdToMaterialDef,
                preferStandardMaterial
              );

              const mesh = new THREE.Mesh(geometry, material);

              const metadataId = itemId;
              const localIdForMesh = typeof meshData?.localId === 'number' ? meshData.localId : itemId;
              const resolvedType =
                localIdToCategory.get(localIdForMesh) ||
                localIdToCategory.get(itemId) ||
                (typeof meshData?.category === 'string' ? meshData.category.toUpperCase() : 'IFCITEM');

              const meshMetadata = itemMetadataMap.get(metadataId) || {
                modelId,
                expressID: metadataId,
                type: resolvedType,
              };

              if (!meshMetadata.type || meshMetadata.type === 'IFCITEM') {
                meshMetadata.type = resolvedType;
              }

              const safeModelId = String(modelId).replace(/\s+/g, '_');
              const typeLabel = typeof meshMetadata.type === 'string' ? meshMetadata.type : 'IFCITEM';
              const expressLabel = typeof meshMetadata.expressID === 'number' ? meshMetadata.expressID : metadataId;
              mesh.name = `${safeModelId}_${typeLabel}_${expressLabel}_${meshCount}`;
              metadataByMeshName.set(mesh.name, meshMetadata);

              // Flat metadata at mesh level (exports to glTF node extras in most viewers)
              mesh.userData = {
                ...(mesh.userData || {}),
                ...meshMetadata,
              };

              // Mirror metadata on geometry level for viewers reading primitive extras
              geometry.userData = {
                ...(geometry.userData || {}),
                ...meshMetadata,
              };

              if (meshData.transform) {
                if (bakeTransformIntoGeometry) {
                  geometry.applyMatrix4(meshData.transform);
                  geometry.computeBoundingBox();
                } else {
                  mesh.applyMatrix4(meshData.transform);
                }
              }

              exportGroup.add(mesh);
              meshCount++;
            }
          }
        }
      } catch (e) {
        console.warn(`  ⚠️ Error processing model ${modelId}:`, e);
      }
    }

    return { exportGroup, meshCount, metadataByMeshName };
  }

  /**
   * Export as glTF (.gltf) - 3D interchange format
   */
  async handleExportGLTF(): Promise<void> {
    try {
      const models = this.ifcLoader.getLoadedModels();
      if (models.size === 0) {
        NotificationHelper.show({
          title: '📦 No Models',
          message: 'Please load an IFC model first',
          type: 'info',
          duration: 3000
        });
        return;
      }

      NotificationHelper.show({
        title: '⏳ Exporting GLTF',
        message: 'Preparing geometry and IFC colors...',
        type: 'info',
        duration: 3000
      });

      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const exporter = new GLTFExporter();

      const { exportGroup, meshCount, metadataByMeshName } = await this.buildExportGroupFromItemsGeometry(
        models,
        false,
        false
      );
      
      console.log(`📊 Export stats: ${meshCount} meshes prepared`);

      if (meshCount === 0) {
        NotificationHelper.show({
          title: '⚠️ Export Failed',
          message: 'No geometry data available for export',
          type: 'warning',
          duration: 3000
        });
        return;
      }

      console.log(`Exporting ${meshCount} meshes to GLTF...`);

      exporter.parse(
        exportGroup,
        async (gltf) => {
          const gltfJson = gltf as any;
          if (gltfJson && Array.isArray(gltfJson.nodes)) {
            for (const node of gltfJson.nodes) {
              if (!node || typeof node.name !== 'string') continue;
              const metadata = metadataByMeshName.get(node.name);
              if (!metadata) continue;
              node.extras = {
                ...(node.extras || {}),
                ...metadata,
              };

              if (typeof node.mesh === 'number' && Array.isArray(gltfJson.meshes) && gltfJson.meshes[node.mesh]) {
                gltfJson.meshes[node.mesh].extras = {
                  ...(gltfJson.meshes[node.mesh].extras || {}),
                  ...metadata,
                };
              }
            }
          }

          const output = JSON.stringify(gltf, null, 2);
          const blob = new Blob([output], { type: 'application/json' });
          
          const saved = await this.saveFileWithDialog(
            blob,
            'model.gltf',
            'glTF 3D Model',
            'gltf',
            'model/gltf+json'
          );

          // Clean up cloned objects
          exportGroup.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
            if (m.material) {
              if (Array.isArray(m.material)) {
                m.material.forEach(mat => mat.dispose());
              } else {
                m.material.dispose();
              }
            }
          });

          if (saved) {
            NotificationHelper.show({
              title: '✅ Export Complete',
              message: `glTF exported (${meshCount} meshes)`,
              type: 'success',
              duration: 3000
            });
          }
        },
        (error) => {
          throw error;
        },
        { binary: false }
      );
    } catch (error) {
      console.error('❌ Error exporting glTF:', error);
      NotificationHelper.show({
        title: '❌ Export Failed',
        message: `${error}`,
        type: 'error',
        duration: 5000
      });
    }
  }

  /**
   * Export as GLB (.glb) - Binary glTF format
   */
  async handleExportGLB(): Promise<void> {
    try {
      const models = this.ifcLoader.getLoadedModels();
      if (models.size === 0) {
        NotificationHelper.show({
          title: '📦 No Models',
          message: 'Please load an IFC model first',
          type: 'info',
          duration: 3000
        });
        return;
      }

      NotificationHelper.show({
        title: '⏳ Exporting GLB',
        message: 'Preparing geometry and IFC colors...',
        type: 'info',
        duration: 3000
      });

      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const exporter = new GLTFExporter();

      const { exportGroup, meshCount } = await this.buildExportGroupFromItemsGeometry(
        models,
        false,
        false
      );
      
      console.log(`📊 Export stats: ${meshCount} meshes prepared`);

      if (meshCount === 0) {
        NotificationHelper.show({
          title: '⚠️ Export Failed',
          message: 'No geometry data available for export',
          type: 'warning',
          duration: 3000
        });
        return;
      }

      console.log(`Exporting ${meshCount} meshes to GLB...`);

      exporter.parse(
        exportGroup,
        async (gltf) => {
          const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
          
          const saved = await this.saveFileWithDialog(
            blob,
            'model.glb',
            'GLB 3D Model',
            'glb',
            'model/gltf-binary'
          );

          // Clean up cloned objects
          exportGroup.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
            if (m.material) {
              if (Array.isArray(m.material)) {
                m.material.forEach(mat => mat.dispose());
              } else {
                m.material.dispose();
              }
            }
          });

          if (saved) {
            NotificationHelper.show({
              title: '✅ Export Complete',
              message: `GLB exported (${meshCount} meshes)`,
              type: 'success',
              duration: 3000
            });
          }
        },
        (error) => {
          throw error;
        },
        { binary: true }
      );
    } catch (error) {
      console.error('❌ Error exporting GLB:', error);
      NotificationHelper.show({
        title: '❌ Export Failed',
        message: `${error}`,
        type: 'error',
        duration: 5000
      });
    }
  }

  /**
   * Export as USDZ (.usdz) - Universal Scene Description (Apple format)
   */
  async handleExportUSDZ(): Promise<void> {
    try {
      const models = this.ifcLoader.getLoadedModels();
      if (models.size === 0) {
        NotificationHelper.show({
          title: '📦 No Models',
          message: 'Please load an IFC model first',
          type: 'info',
          duration: 3000
        });
        return;
      }

      NotificationHelper.show({
        title: '⏳ Exporting USDZ',
        message: 'Preparing geometry and IFC colors...',
        type: 'info',
        duration: 3000
      });

      const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js');
      const exporter = new USDZExporter();

      const { exportGroup, meshCount } = await this.buildExportGroupFromItemsGeometry(
        models,
        true,
        true
      );

      console.log(`📊 Export stats: ${meshCount} meshes prepared`);

      if (meshCount === 0) {
        NotificationHelper.show({
          title: '⚠️ Export Failed',
          message: 'No geometry data available for export',
          type: 'warning',
          duration: 3000
        });
        return;
      }

      // USDZ exporter requires proper scene hierarchy and matrix updates
      // USD uses Y-up coordinate system, IFC uses Z-up, so we need to rotate
      const rotationGroup = new THREE.Group();
      rotationGroup.rotation.x = Math.PI / 2; // Rotate +90° around X to convert Z-up to Y-up
      rotationGroup.add(exportGroup);
      
      // Update world matrices for all meshes
      rotationGroup.updateMatrixWorld(true);

      console.log(`Exporting ${meshCount} meshes to USDZ...`);

      const result = await exporter.parseAsync(rotationGroup);
      
      // Clean up cloned objects
      exportGroup.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          if (Array.isArray(m.material)) {
            m.material.forEach(mat => mat.dispose());
          } else {
            m.material.dispose();
          }
        }
      });

      const blob = new Blob([result], { type: 'application/octet-stream' });
      
      const saved = await this.saveFileWithDialog(
        blob,
        'model.usdz',
        'USDZ 3D Model',
        'usdz',
        'model/vnd.usdz+zip'
      );

      if (saved) {
        NotificationHelper.show({
          title: '✅ Export Complete',
          message: `USDZ exported (${meshCount} meshes)`,
          type: 'success',
          duration: 3000
        });
      }
    } catch (error) {
      console.error('❌ Error exporting USDZ:', error);
      NotificationHelper.show({
        title: '❌ Export Failed',
        message: `${error}`,
        type: 'error',
        duration: 5000
      });
    }
  }

  /**
   * Export Screenshot (PNG)
   */
  async handleExportScreenshot(): Promise<void> {
    try {
      const worlds = this.components.get(OBC.Worlds);
      const world = worlds.list.values().next().value;
      if (!world || !world.renderer) {
        throw new Error('Renderer not available');
      }

      // Get the canvas and convert to image
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        throw new Error('Canvas not found');
      }

      // Force a render
      if (world.renderer.three) {
        world.renderer.three.render(world.scene.three, world.camera.three);
      }

      const dataUrl = canvas.toDataURL('image/png');
      
      // Convert data URL to Blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      const saved = await this.saveFileWithDialog(
        blob,
        `screenshot_${Date.now()}.png`,
        'PNG Image',
        'png',
        'image/png'
      );

      if (saved) {
        NotificationHelper.show({
          title: '✅ Screenshot Saved',
          message: 'PNG screenshot exported successfully',
          type: 'success',
          duration: 3000
        });
      }
    } catch (error) {
      console.error('❌ Error exporting screenshot:', error);
      NotificationHelper.show({
        title: '❌ Export Failed',
        message: `${error}`,
        type: 'error',
        duration: 5000
      });
    }
  }

  /**
   * Export Properties as JSON
   */
  async handleExportJSON(): Promise<void> {
    try {
      const models = this.ifcLoader.getLoadedModels();
      if (models.size === 0) {
        NotificationHelper.show({
          title: '📦 No Models',
          message: 'Please load an IFC model first',
          type: 'info',
          duration: 3000
        });
        return;
      }

      const allProperties: { [modelId: string]: any } = {};

      for (const [modelId, model] of models) {
        try {
          // Get spatial structure
          const spatialStructure = await (model as any).getSpatialStructure();
          
          // Get categories
          const categories = await (model as any).getCategories();
          
          allProperties[modelId] = {
            spatialStructure,
            categories,
            exportedAt: new Date().toISOString()
          };
        } catch (e) {
          allProperties[modelId] = { error: String(e) };
        }
      }

      const jsonString = JSON.stringify(allProperties, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      const saved = await this.saveFileWithDialog(
        blob,
        'model_properties.json',
        'JSON Properties File',
        'json',
        'application/json'
      );

      if (saved) {
        NotificationHelper.show({
          title: '✅ Export Complete',
          message: 'Properties (JSON) exported successfully',
          type: 'success',
          duration: 3000
        });
      }
    } catch (error) {
      console.error('❌ Error exporting JSON:', error);
      NotificationHelper.show({
        title: '❌ Export Failed',
        message: `${error}`,
        type: 'error',
        duration: 5000
      });
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
   * Shows the interactive slicer dashboard for Power BI-style filtering
   */
  async handleShowSlicerDashboard(): Promise<void> {
    try {
      const models = this.ifcLoader.getLoadedModels();
      
      if (models.size === 0) {
        NotificationHelper.show({
          title: '📦 No Models Loaded',
          message: 'Please load an IFC model first to use slicers',
          type: 'info',
          duration: 3000
        });
        return;
      }

      await this.showLoadingCallback();

      // Get fragments manager and highlighter
      const fragmentsManager = this.components.get(OBC.FragmentsManager);
      
      // Collect property data from all models
      const slicerData = await this.collectSlicerData(fragmentsManager);
      
      // Get the first model ID for highlighting (most models only have one)
      let primaryModelId = 'default';
      for (const [modelId] of fragmentsManager.list) {
        primaryModelId = modelId;
        break;
      }
      
      // Show the slicer dashboard with model ID for highlighting
      this.slicerDashboard.show(slicerData, this.components, primaryModelId);
      
      console.log('🎛️ Slicer dashboard opened');
    } catch (error) {
      console.error('❌ Error showing slicer dashboard:', error);
      NotificationHelper.show({
        title: '❌ Error',
        message: `Failed to load slicer dashboard: ${error}`,
        type: 'error',
        duration: 5000
      });
    } finally {
      this.hideLoadingCallback();
    }
  }

  /**
   * Collects data from loaded models for the slicer dashboard
   * Now supports multiple models with unique element tracking
   */
  private async collectSlicerData(fragmentsManager: OBC.FragmentsManager): Promise<{
    categories: Map<string, Set<string>>; // Changed to Set<string> for "modelId:expressID" composite keys
    properties: Map<string, Map<string, Set<string>>>;
    numericProperties: Map<string, { min: number; max: number; values: Map<number, Set<string>> }>;
    modelElementMap: Map<string, { modelId: string, expressID: number }>; // Lookup table
  }> {
    const categories = new Map<string, Set<string>>();
    const properties = new Map<string, Map<string, Set<string>>>();
    const numericProperties = new Map<string, { min: number; max: number; values: Map<number, Set<string>> }>();
    const modelElementMap = new Map<string, { modelId: string, expressID: number }>();
    
    // Helper to create composite key
    const makeKey = (modelId: string, expressID: number): string => `${modelId}:${expressID}`;
    
    // Geometry categories filter - only include actual 3D elements
    const geometryPattern = /^IFC(WALL|BEAM|COLUMN|SLAB|DOOR|WINDOW|ROOF|STAIR|RAMP|RAILING|FOOTING|CURTAINWALL|PLATE|COVERING|DUCT|PIPE|CABLE|FITTING|SEGMENT|FLOWSEGMENT|FLOWTERMINAL|FLOWCONTROLLER|FLOWFITTING|OUTLET|VALVE|PUMP|FAN|DAMPER|SENSOR|LIGHT|FIXTURE|EQUIPMENT|FURNISH|MEMBER|PILE|BUILDING.*ELEMENT|OPENING|SPACE|SITE|PROXY|ANNOTATION|GRID|REINFORC)/i;
    
    // Use fragmentsManager.list to iterate over models
    for (const [modelId, model] of fragmentsManager.list) {
      console.log(`📊 Processing model for slicers: ${modelId}`);
      
      try {
        // Get all categories in the model
        const modelCategories = await (model as any).getCategories();
        console.log(`  Found ${modelCategories.length} total categories`);
        
        // Filter to only geometry categories
        const geometryCategories = modelCategories.filter((cat: string) => geometryPattern.test(cat));
        console.log(`  Filtered to ${geometryCategories.length} geometry categories`);
        
        // Track element count per category for synthetic properties
        const categoryElementCounts: { [category: string]: number[] } = {};
        
        // Collect IDs for space containment check
        const spaceIds: number[] = [];
        const elementIdsForContainment: number[] = [];

        for (const category of geometryCategories) {
          // Get items for this category
          const categoryRegex = new RegExp(`^${category}$`);
          const items = await (model as any).getItemsOfCategories([categoryRegex]);
          const categoryKey = Object.keys(items).find((key: string) => key.includes(category));
          
          if (!categoryKey || !items[categoryKey] || items[categoryKey].length === 0) {
            continue;
          }
          
          const itemIds: number[] = items[categoryKey];
          
          // Collect IDs for containment check
          if (category === 'IFCSPACE') {
            spaceIds.push(...itemIds);
          } else {
            elementIdsForContainment.push(...itemIds);
          }

          // Add to categories map with a cleaner display name
          const displayName = category.replace('IFC', '');
          if (!categories.has(displayName)) {
            categories.set(displayName, new Set());
          }
          for (const id of itemIds) {
            const key = makeKey(modelId, id);
            categories.get(displayName)!.add(key);
            modelElementMap.set(key, { modelId, expressID: id });
          }
          
          // Store for generating synthetic properties
          categoryElementCounts[displayName] = itemIds;
          
          // Try to get actual properties from a sample of elements
          // Increased sample size to improve chances of finding properties
          const sampleIds = itemIds.slice(0, Math.min(50, itemIds.length));
          
          for (const id of sampleIds) {
            const key = makeKey(modelId, id);
            try {
              // Try getting properties directly from model
              const allProps = await (model as any).getProperties(id);
              
              if (allProps) {
                // Log properties for the first element of the first category to debug
                if (id === sampleIds[0] && categories.size === 1) {
                  console.log(`🔍 Sample properties for element ${id}:`, Object.keys(allProps));
                }

                // Extract Name if available
                if (allProps.Name?.value) {
                  const propName = 'Name';
                  const value = String(allProps.Name.value);
                  if (!properties.has(propName)) {
                    properties.set(propName, new Map());
                  }
                  const propMap = properties.get(propName)!;
                  if (!propMap.has(value)) {
                    propMap.set(value, new Set());
                  }
                  propMap.get(value)!.add(key);
                }
                
                // Extract ObjectType if available
                if (allProps.ObjectType?.value) {
                  const propName = 'ObjectType';
                  const value = String(allProps.ObjectType.value);
                  if (!properties.has(propName)) {
                    properties.set(propName, new Map());
                  }
                  const propMap = properties.get(propName)!;
                  if (!propMap.has(value)) {
                    propMap.set(value, new Set());
                  }
                  propMap.get(value)!.add(key);
                }
                
                // Extract Description if available
                if (allProps.Description?.value) {
                  const propName = 'Description';
                  const value = String(allProps.Description.value);
                  if (!properties.has(propName)) {
                    properties.set(propName, new Map());
                  }
                  const propMap = properties.get(propName)!;
                  if (!propMap.has(value)) {
                    propMap.set(value, new Set());
                  }
                  propMap.get(value)!.add(key);
                }
                
                // Extract PredefinedType if available
                if (allProps.PredefinedType?.value) {
                  const propName = 'PredefinedType';
                  const value = String(allProps.PredefinedType.value);
                  if (!properties.has(propName)) {
                    properties.set(propName, new Map());
                  }
                  const propMap = properties.get(propName)!;
                  if (!propMap.has(value)) {
                    propMap.set(value, new Set());
                  }
                  propMap.get(value)!.add(key);
                }
                
                // Extract Material if available (via HasAssociations)
                // This is complex as it requires traversing relationships, skipping for now to keep it fast
              }
            } catch (err) {
              // Skip elements that can't be processed
              continue;
            }
          }
        }
        
        // Get IFC Building Storey information from spatial structure
        try {
          const spatialStructure = await (model as any).getSpatialStructure();
          if (spatialStructure) {
            console.log('📊 Spatial structure found, collecting storeys...');
            // Collect storey-to-element mappings
            const storeyElementMap = await this.collectStoreyElements(model, spatialStructure);
            console.log(`📊 Collected storeys:`, Array.from(storeyElementMap.keys()));
            
            if (storeyElementMap.size > 0) {
              if (!properties.has('Building Level')) {
                properties.set('Building Level', new Map());
              }
              const levelMap = properties.get('Building Level')!;
              
              for (const [storeyName, elementIds] of storeyElementMap) {
                // Prefix storey name with model name if multiple models
                const storeyKey = fragmentsManager.list.size > 1 ? `${modelId} - ${storeyName}` : storeyName;
                if (!levelMap.has(storeyKey)) {
                  levelMap.set(storeyKey, new Set());
                }
                for (const id of elementIds) {
                  const key = makeKey(modelId, id);
                  levelMap.get(storeyKey)!.add(key);
                  modelElementMap.set(key, { modelId, expressID: id });
                }
              }
              
              console.log(`📊 Collected ${storeyElementMap.size} building storeys with elements`);
            } else {
              console.warn('⚠️ No elements found in spatial structure storeys');
            }

            // Collect space-to-element mappings
            let spaceElementMap = await this.collectSpaceElements(model, spatialStructure);
            
            // If tree traversal failed to find elements in spaces, try geometric containment
            if (spaceElementMap.size === 0 && spaceIds.length > 0 && elementIdsForContainment.length > 0) {
              console.log('⚠️ No elements found in spaces via tree, trying geometric containment...');
              spaceElementMap = await this.computeSpaceContainment(model, spaceIds, elementIdsForContainment);
            }

            console.log(`📊 Collected spaces:`, Array.from(spaceElementMap.keys()));
            
            if (spaceElementMap.size > 0) {
              if (!properties.has('Space')) {
                properties.set('Space', new Map());
              }
              const spaceMap = properties.get('Space')!;
              
              for (const [spaceName, elementIds] of spaceElementMap) {
                // Prefix space name with model name if multiple models
                const spaceKey = fragmentsManager.list.size > 1 ? `${modelId} - ${spaceName}` : spaceName;
                if (!spaceMap.has(spaceKey)) {
                  spaceMap.set(spaceKey, new Set());
                }
                for (const id of elementIds) {
                  const key = makeKey(modelId, id);
                  spaceMap.get(spaceKey)!.add(key);
                  modelElementMap.set(key, { modelId, expressID: id });
                }
              }
              
              console.log(`📊 Collected ${spaceElementMap.size} spaces with elements`);
            }
          } else {
            console.warn('⚠️ No spatial structure returned from model');
          }
        } catch (err) {
          console.warn(`⚠️ Could not get spatial structure for model ${modelId}:`, err);
        }
        
      } catch (err) {
        console.warn(`⚠️ Error processing model ${modelId}:`, err);
      }
    }
    
    console.log(`📊 Collected ${categories.size} categories, ${properties.size} property types`);
    console.log(`📊 Properties found:`, Array.from(properties.keys()));
    console.log(`📊 Numeric properties found:`, Array.from(numericProperties.keys()));
    console.log(`📊 Total unique elements across all models: ${modelElementMap.size}`);
    return { categories, properties, numericProperties, modelElementMap };
  }

  /**
   * Recursively collects elements contained in each building storey from spatial structure
   */
  private async collectStoreyElements(model: any, node: any, currentStorey?: string): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    
    if (!node) return result;
    
    const category = node.category || node._category?.value || '';
    const localId = node.localId || node._localId?.value;
    
    // Case A: Building Storey Wrapper (Category Group for Storeys - no localId)
    if (category === 'IFCBUILDINGSTOREY' && !localId && node.children) {
      for (const child of node.children) {
        // Each child is a Storey. Resolve its name.
        const childId = child.localId || child._localId?.value;
        let childStoreyName = child.name || child.Name?.value;
        
        if (childId && !childStoreyName) {
          try {
            const [itemData] = await model.getItemsData([childId], {
              attributesDefault: false,
              attributes: ['Name', 'LongName'],
            });
            childStoreyName = itemData?.Name?.value || itemData?.LongName?.value;
          } catch {}
        }
        
        const storeyName = childStoreyName || `Storey ${childId}`;
        
        // Recurse with the resolved storey name
        const childResult = await this.collectStoreyElements(model, child, storeyName);
        for (const [s, ids] of childResult) {
          if (!result.has(s)) result.set(s, []);
          result.get(s)!.push(...ids);
        }
      }
      return result; // Done for this branch (wrapper)
    }
    
    // Case B: Actual Building Storey Node (encountered directly or via recursion)
    if (category === 'IFCBUILDINGSTOREY' && localId) {
      // Resolve name if not already passed (or override it)
      let storeyName = node.name || node.Name?.value;
      if (!storeyName) {
        try {
          const [itemData] = await model.getItemsData([localId], {
            attributesDefault: false,
            attributes: ['Name', 'LongName'],
          });
          storeyName = itemData?.Name?.value || itemData?.LongName?.value;
        } catch {}
      }
      currentStorey = storeyName || `Storey ${localId}`;
    }
    
    const geometryPattern = /^IFC(WALL|BEAM|COLUMN|SLAB|DOOR|WINDOW|ROOF|STAIR|RAMP|RAILING|FOOTING|CURTAINWALL|PLATE|COVERING|DUCT|PIPE|CABLE|FITTING|SEGMENT|FLOWSEGMENT|FLOWTERMINAL|FLOWCONTROLLER|FLOWFITTING|OUTLET|VALVE|PUMP|FAN|DAMPER|SENSOR|LIGHT|FIXTURE|EQUIPMENT|FURNISH|MEMBER|PILE|OPENING|SPACE|PROXY|REINFORC)/i;

    // Case C: We have a current storey, look for elements
    if (currentStorey) {
      // 1. Is this node itself an element?
      if (localId && geometryPattern.test(category)) {
        if (!result.has(currentStorey)) {
          result.set(currentStorey, []);
        }
        result.get(currentStorey)!.push(localId);
      }
      
      // 2. Is this a Category Group? (e.g. "Walls")
      // The children might be elements that don't have the category property set
      if (geometryPattern.test(category) && node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          const childCategory = child.category || child._category?.value;
          const childId = child.localId || child._localId?.value;
          
          // If child has ID but no category, assume it belongs to this group
          if (childId && !childCategory) {
            if (!result.has(currentStorey)) {
              result.set(currentStorey, []);
            }
            result.get(currentStorey)!.push(childId);
          }
        }
      }
    }
    
    // Process children recursively
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const childResult = await this.collectStoreyElements(model, child, currentStorey);
        for (const [storey, ids] of childResult) {
          if (!result.has(storey)) {
            result.set(storey, []);
          }
          result.get(storey)!.push(...ids);
        }
      }
    }
    
    return result;
  }

  /**
   * Computes space containment using geometric bounding boxes
   */
  private async computeSpaceContainment(model: any, spaceIds: number[], elementIds: number[]): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    
    console.log(`📐 Computing containment for ${spaceIds.length} spaces and ${elementIds.length} elements`);
    
    // Helper to get center of an element using OBC model API
    const getCenter = async (id: number): Promise<THREE.Vector3 | null> => {
      try {
        // Use OBC's getMergedBox method
        if (typeof model.getMergedBox === 'function') {
          const bbox = await model.getMergedBox([id]);
          if (bbox && !bbox.isEmpty()) {
            const center = new THREE.Vector3();
            bbox.getCenter(center);
            return center;
          }
        }
        
        // Fallback to getBoxes
        if (typeof model.getBoxes === 'function') {
          const boxes = await model.getBoxes([id]);
          if (boxes && boxes.length > 0 && boxes[0] && !boxes[0].isEmpty()) {
            const center = new THREE.Vector3();
            boxes[0].getCenter(center);
            return center;
          }
        }
      } catch (e) {}
      return null;
    };

    // Helper to get bbox of a space using OBC model API
    const getSpaceBox = async (id: number): Promise<THREE.Box3 | null> => {
      try {
        // Use OBC's getMergedBox method
        if (typeof model.getMergedBox === 'function') {
          const bbox = await model.getMergedBox([id]);
          if (bbox && !bbox.isEmpty()) {
            return bbox;
          }
        }
        
        // Fallback to getBoxes
        if (typeof model.getBoxes === 'function') {
          const boxes = await model.getBoxes([id]);
          if (boxes && boxes.length > 0 && boxes[0] && !boxes[0].isEmpty()) {
            return boxes[0];
          }
        }
        
        if (id === spaceIds[0]) {
          console.warn(`⚠️ Space ${id} has no geometry via getMergedBox or getBoxes`);
        }
      } catch (e) {
        if (id === spaceIds[0]) {
          console.error(`Error getting space box:`, e);
        }
      }
      return null;
    };

    // Pre-calculate space boxes
    const spaces: { id: number, name: string, box: THREE.Box3 }[] = [];
    
    for (const spaceId of spaceIds) {
      const box = await getSpaceBox(spaceId);
      if (box) {
        // Get space name
        let spaceName = `Space ${spaceId}`;
        try {
          const [itemData] = await model.getItemsData([spaceId], {
            attributesDefault: false,
            attributes: ['Name', 'LongName'],
          });
          spaceName = itemData?.Name?.value || itemData?.LongName?.value || spaceName;
        } catch {}
        
        spaces.push({ id: spaceId, name: spaceName, box });
      }
    }
    
    console.log(`📐 Found geometry for ${spaces.length} spaces`);

    // Debug: Log first space box info
    if (spaces.length > 0) {
      const firstSpace = spaces[0];
      const size = new THREE.Vector3();
      firstSpace.box.getSize(size);
      console.log(`📐 Sample space "${firstSpace.name}" box:`, {
        min: firstSpace.box.min.toArray(),
        max: firstSpace.box.max.toArray(),
        size: size.toArray()
      });
    }

    // If no spaces have geometry, bail early
    if (spaces.length === 0) {
      console.warn('⚠️ No spaces have geometry. Cannot compute containment.');
      return result;
    }

    // Check elements - process in batches for performance
    let matchCount = 0;
    let debuggedFirstElement = false;
    const batchSize = 100;
    
    for (let i = 0; i < elementIds.length; i += batchSize) {
      const batch = elementIds.slice(i, i + batchSize);
      
      for (const elementId of batch) {
        const center = await getCenter(elementId);
        if (!center) continue;
        
        // Debug first element
        if (!debuggedFirstElement) {
          console.log(`📐 Sample element ${elementId} center:`, center.toArray());
          debuggedFirstElement = true;
        }
        
        for (const space of spaces) {
          if (space.box.containsPoint(center)) {
            if (!result.has(space.name)) {
              result.set(space.name, []);
            }
            result.get(space.name)!.push(elementId);
            matchCount++;
            break; // Element can only be in one space
          }
        }
      }
    }
    
    console.log(`📐 Geometric containment found ${matchCount} element-space relationships`);
    return result;
  }

  /**
   * Recursively collects elements contained in each space from spatial structure
   */
  private async collectSpaceElements(model: any, node: any, currentSpace?: string): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    
    if (!node) return result;
    
    const category = node.category || node._category?.value || '';
    const localId = node.localId || node._localId?.value;
    
    // Case: Space Node
    if (category === 'IFCSPACE' && localId) {
      // Resolve name
      let spaceName = node.name || node.Name?.value;
      if (!spaceName) {
        try {
          const [itemData] = await model.getItemsData([localId], {
            attributesDefault: false,
            attributes: ['Name', 'LongName'],
          });
          spaceName = itemData?.Name?.value || itemData?.LongName?.value;
        } catch {}
      }
      currentSpace = spaceName || `Space ${localId}`;
    }
    
    const geometryPattern = /^IFC(WALL|BEAM|COLUMN|SLAB|DOOR|WINDOW|ROOF|STAIR|RAMP|RAILING|FOOTING|CURTAINWALL|PLATE|COVERING|DUCT|PIPE|CABLE|FITTING|SEGMENT|FLOWSEGMENT|FLOWTERMINAL|FLOWCONTROLLER|FLOWFITTING|OUTLET|VALVE|PUMP|FAN|DAMPER|SENSOR|LIGHT|FIXTURE|EQUIPMENT|FURNISH|MEMBER|PILE|OPENING|PROXY|REINFORC)/i;

    // If we are inside a space, collect elements
    if (currentSpace) {
      // 1. Is this node itself an element?
      if (localId && geometryPattern.test(category)) {
        if (!result.has(currentSpace)) {
          result.set(currentSpace, []);
        }
        result.get(currentSpace)!.push(localId);
      }
      
      // 2. Is this a Category Group?
      if (geometryPattern.test(category) && node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          const childCategory = child.category || child._category?.value;
          const childId = child.localId || child._localId?.value;
          
          if (childId && !childCategory) {
            if (!result.has(currentSpace)) {
              result.set(currentSpace, []);
            }
            result.get(currentSpace)!.push(childId);
          }
        }
      }
    }
    
    // Process children recursively
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const childResult = await this.collectSpaceElements(model, child, currentSpace);
        for (const [space, ids] of childResult) {
          if (!result.has(space)) {
            result.set(space, []);
          }
          result.get(space)!.push(...ids);
        }
      }
    }
    
    return result;
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
      await this.modelTransform.fitCameraToModels();
      
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
      await this.modelTransform.fitCameraToModels();
      
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

    // Exit cluster handler - reusable function for both button and property table
    const handleExitCluster = async () => {
      try {
        if (this.cluster) {
          await this.cluster.exitToColorView();
          exitClusterBtn.style.display = 'none';
          updateClusterBtn.style.display = 'none';
          this.isInClusterMode = false;
          this.selectedCategories.clear();
          
          if (this.colorSplash) {
            this.colorSplash.hidePropertyTable();
          }

          // Ensure all highlights are cleared when exiting cluster view
          try {
            const highlighter = this.components.get(OBF.Highlighter);
            if (highlighter) {
              highlighter.clear('select');
              highlighter.clear('translucent');
              highlighter.clear('slicer-transparent');
              
              // Clear any slicer-specific styles
              for (const styleName of Object.keys(highlighter.styles)) {
                if (styleName.startsWith('slicer-')) {
                  highlighter.clear(styleName);
                }
              }
            }
          } catch (e) {
            // Highlighter might not be initialized
          }
          
          const countSpan = document.getElementById('selectedCount');
          if (countSpan) {
            countSpan.textContent = '0';
          }
          viewSelectedBtn.style.display = 'none';
          
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
    };

    exitClusterBtn.addEventListener('click', handleExitCluster);

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
              await this.colorSplash.showPropertyTable(elementsByCategory, clusterScene, handleExitCluster);
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
              await this.colorSplash.showPropertyTable(elementsByCategory, clusterScene, handleExitCluster);
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
                    await this.colorSplash.showPropertyTable(elementsByCategory, clusterScene, handleExitCluster);
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

  /**
   * Handle color splash mode being disabled (called via callback from module)
   * Hides the color picker panel and updates button state
   */
  public handleColorSplashDisabled(): void {
    // Hide color picker panel
    this.hideColorPickerPanel();
    
    // Hide property table if visible
    if (this.colorSplash) {
      this.colorSplash.hidePropertyTable();
    }
    
    // Update button appearance
    const btn = document.getElementById('colorSplashMainBtn');
    if (btn) {
      btn.classList.remove('active');
    }
    
    console.log('🎨 Color splash UI cleaned up');
  }

  /**
   * Handle cluster mode being exited (called via callback from module)
   * Hides the cluster UI and updates button state
   */
  public handleClusterModeExited(): void {
    // Hide property table if visible
    if (this.colorSplash) {
      this.colorSplash.hidePropertyTable();
    }
    
    // Update button appearance
    const clusterBtn = document.getElementById('clusterMainBtn');
    if (clusterBtn) {
      clusterBtn.classList.remove('active');
    }
    
    // Also update the clusterBtn in the dropdown if it exists
    const clusterBtnDropdown = document.getElementById('clusterBtn');
    if (clusterBtnDropdown) {
      const label = clusterBtnDropdown.querySelector('.label');
      if (label) label.textContent = 'Cluster';
      clusterBtnDropdown.style.background = '';
      clusterBtnDropdown.style.color = '';
    }
    
    console.log('🎯 Cluster UI cleaned up');
  }
}
