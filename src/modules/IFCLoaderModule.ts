/**
 * IFC Loader Module
 * 
 * This module handles:
 * - Loading IFC files (Industry Foundation Classes - standard BIM format)
 * - Converting IFC to Fragments (efficient binary format)
 * - Managing fragment models in the scene
 * - Exporting fragments for faster future loading
 * 
 * IFC files are large and complex. The conversion to Fragments makes
 * them much faster to load and work with in the browser.
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import { WorldManager } from './WorldManager';

/**
 * Coordinate system mode for loaded models
 */
enum CoordinateMode {
  /** Preserve original IFC coordinates - maintains multi-model alignment */
  PRESERVE_COORDS = 'PRESERVE_COORDS',
  /** Move all models to origin - used when models are >100km from origin */
  MOVE_TO_ORIGIN = 'MOVE_TO_ORIGIN',
  /** Not yet determined - first model not loaded */
  UNKNOWN = 'UNKNOWN'
}

export class IFCLoaderModule {
  private components: OBC.Components;
  private worldManager: WorldManager;
  private ifcLoader: OBC.IfcLoader | null = null;
  private fragments: OBC.FragmentsManager | null = null;
  private world: OBC.World | null = null;
  private modelMetadata: Map<string, { name: string; meshCount: number; vertexCount: number }> = new Map();
  private onMetadataUpdated: (() => void) | null = null;
  private onModelLoaded: (() => void) | null = null;
  
  // Smart coordinate mode tracking
  private currentCoordinateMode: CoordinateMode = CoordinateMode.UNKNOWN;
  private loadedModelsCount: number = 0;
  
  // UI callback for showing coordinate warnings
  private onCoordinateWarning: (() => void) | null = null;
  
  // Callback for showing alignment needed warning
  private onAlignmentNeeded: ((modelId: string) => void) | null = null;
  private lastLoadedModelId: string | null = null;
  
  // Store original coordinates of models before MOVE_TO_ORIGIN
  private originalCoordinates: Map<string, THREE.Vector3> = new Map();
  
  // Store coordination matrix from first model
  private coordinationMatrix: THREE.Matrix4 | null = null;

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
  }

  /**
   * Set callback for coordinate warnings
   */
  public setOnCoordinateWarning(callback: () => void): void {
    this.onCoordinateWarning = callback;
  }

  /**
   * Set callback for alignment needed warnings
   */
  public setOnAlignmentNeeded(callback: (modelId: string) => void): void {
    this.onAlignmentNeeded = callback;
  }

  /**
   * Sets a callback to be called when model metadata is updated
   */
  public setMetadataUpdateCallback(callback: () => void): void {
    this.onMetadataUpdated = callback;
  }

  /**
   * Sets a callback to be called when a new model is loaded
   */
  public setModelLoadedCallback(callback: () => void): void {
    this.onModelLoaded = callback;
  }

  /**
   * Initializes the IFC loader and fragments manager
   * Must be called before loading any IFC files
   */
  public async initialize(world: OBC.World): Promise<void> {
    this.world = world;

    // Setup the IFC Loader component
    this.ifcLoader = this.components.get(OBC.IfcLoader);
    
    // CRITICAL: Preserve original IFC coordinate system by default
    // This ensures models with the same IfcSite coordinates stay aligned
    // NOTE: web-ifc may skip objects >100km from origin as a safety measure
    if (this.ifcLoader.settings && this.ifcLoader.settings.webIfc) {
      this.ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = false;
      console.log('✅ IFC coordinate preservation enabled (maintains multi-model alignment)');
    }
    
    // Configure web-ifc (the core library for reading IFC files)
    await this.ifcLoader.setup({
      autoSetWasm: false,
      wasm: {
        // Using unpkg CDN for web-ifc WebAssembly files
        path: 'https://unpkg.com/web-ifc@0.0.72/',
        absolute: true,
      },
    });

    // Setup the Fragments Manager (handles converted IFC data)
    // Use local worker file to avoid CORS issues
    const workerUrl = '/worker.mjs';
    this.fragments = this.components.get(OBC.FragmentsManager);
    this.fragments.init(workerUrl);

    // Handle LOD materials for postproduction renderer
    // LOD (Level of Detail) materials need special handling in postproduction
    this.fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
      const isLod = 'isLodMaterial' in material && (material as any).isLodMaterial;
      if (isLod && world.renderer) {
        const renderer = world.renderer as OBF.PostproductionRenderer;
        renderer.postproduction.basePass.isolatedMaterials.push(material);
      }
    });

    // Update fragments when camera stops moving
    if (world.camera.controls) {
      world.camera.controls.addEventListener('rest', () => {
        this.fragments?.core.update(true);
      });
    }

    // Handle new fragment models when they're loaded
    this.fragments.list.onItemSet.add(({ value: model, key: uuid }: any) => {
      // Link the model to the world's camera for proper updates
      model.useCamera(world.camera.three);
      
      // Add the model to the scene
      world.scene.three.add(model.object);
      
      // Trigger an update to render the model
      this.fragments?.core.update(true);
      
      console.log(`✅ Model loaded: ${uuid}`);
      
      // Store metadata with multiple retries to ensure meshes are loaded
      const storeMeshCount = (attempt: number = 0) => {
        const meshCount = model.object && model.object.children ? model.object.children.length : 0;
        
        // Count vertices
        let vertexCount = 0;
        if (model.object) {
          model.object.traverse((child: any) => {
            if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
              vertexCount += child.geometry.attributes.position.count;
            }
          });
        }
        
        console.log(`Attempt ${attempt}: ${uuid} has ${meshCount} meshes`);
        
        if (meshCount > 0 || attempt >= 5) {
          this.modelMetadata.set(uuid, {
            name: uuid,
            meshCount: meshCount,
            vertexCount: vertexCount
          });
          console.log(`✅ Stored metadata: ${uuid} (${meshCount} meshes, ${vertexCount} vertices)`);
          
          // Update collision meshes AFTER meshes are loaded
          if (meshCount > 0 && this.onModelLoaded) {
            console.log('🔄 Meshes loaded, updating collision detection...');
            this.onModelLoaded();
          }
          
          // Notify metadata callback
          if (this.onMetadataUpdated) {
            this.onMetadataUpdated();
          }
        } else {
          // Try again after a delay
          setTimeout(() => storeMeshCount(attempt + 1), 100);
        }
      };
      
      // Start checking after a short delay
      setTimeout(() => storeMeshCount(0), 100);
    });

    console.log('✅ IFC Loader initialized');
  }

  /**
   * Loads an IFC file from a URL or File object
   * Smart coordinate handling:
   * - First model: Try PRESERVE_COORDS mode, detect if objects are skipped
   * - If skipped: Retry with MOVE_TO_ORIGIN mode
   * - Subsequent models: Must match the mode of already-loaded models
   * 
   * @param source - URL string or File object
   * @param progressCallback - Optional callback for loading progress
   * @returns Promise that resolves when loading is complete
   */
  public async loadIFC(
    source: string | File,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    if (!this.ifcLoader) {
      throw new Error('IFC Loader not initialized. Call initialize() first.');
    }

    try {
      let buffer: Uint8Array;
      let filename: string;

      if (typeof source === 'string') {
        // Load from URL
        console.log(`📥 Fetching IFC from: ${source}`);
        const response = await fetch(source);
        const data = await response.arrayBuffer();
        buffer = new Uint8Array(data);
        filename = source.split('/').pop()?.split('.')[0] || 'model';
      } else {
        // Load from File object
        console.log(`📥 Loading IFC file: ${source.name}`);
        const data = await source.arrayBuffer();
        buffer = new Uint8Array(data);
        filename = source.name.split('.')[0];
      }

      // Smart coordinate mode handling
      if (this.loadedModelsCount === 0) {
        // First model - try PRESERVE_COORDS mode first
        await this.loadWithSmartCoordinateDetection(buffer, filename, progressCallback);
      } else {
        // Subsequent models - must match existing coordinate mode
        await this.loadWithExistingCoordinateMode(buffer, filename, progressCallback);
      }

      this.loadedModelsCount++;
      console.log(`✅ IFC loaded successfully: ${filename}`);
    } catch (error) {
      console.error('❌ Error loading IFC:', error);
      throw error;
    }
  }

  /**
   * Loads the first model with automatic coordinate mode detection
   * Tries PRESERVE_COORDS first, switches to MOVE_TO_ORIGIN if objects are skipped
   */
  private async loadWithSmartCoordinateDetection(
    buffer: Uint8Array,
    filename: string,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    if (!this.ifcLoader) throw new Error('IFC Loader not initialized');

    // Try PRESERVE_COORDS mode first (better for multi-model alignment)
    console.log('📐 [First Model] Trying PRESERVE_COORDS mode (maintains alignment)...');
    
    if (this.ifcLoader.settings?.webIfc) {
      this.ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = false;
    }

    // Track the model ID before loading
    const modelIdsBefore = new Set(this.fragments?.core.models.list.keys() || []);
    
    await this.ifcLoader.load(buffer, false, filename, {
      processData: {
        progressCallback: (progress) => {
          console.log(`⏳ Processing: ${(progress * 100).toFixed(1)}%`);
          if (progressCallback) progressCallback(progress);
        },
      },
    });

    // Check if objects were loaded successfully
    // Wait for fragments to be created
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Find the newly loaded model
    const modelIdsAfter = new Set(this.fragments?.core.models.list.keys() || []);
    const newModelIds = Array.from(modelIdsAfter).filter(id => !modelIdsBefore.has(id));
    
    let hasGeometry = false;
    let originalCenter: THREE.Vector3 | null = null;
    
    if (newModelIds.length > 0) {
      const newModel = this.fragments?.core.models.list.get(newModelIds[0]);
      if (newModel && newModel.object) {
        // FIRST: Try to get coordinate reference BEFORE checking geometry
        // This works even if geometry was skipped (far-origin models)
        console.log('🔍 Attempting to capture original IFC coordinates...');
        originalCenter = await this.getModelCoordinateReference(newModel, newModelIds[0]);
        if (originalCenter) {
          console.log(`✅ Captured IFC coordinate reference: (${originalCenter.x.toFixed(2)}, ${originalCenter.y.toFixed(2)}, ${originalCenter.z.toFixed(2)})`);
        } else {
          console.log('⚠️ Could not capture IFC coordinate reference');
        }
        
        // THEN: Check if model has actual geometry (children meshes)
        const meshCount = newModel.object.children.length;
        
        // Also check for vertices in the meshes
        let totalVertices = 0;
        newModel.object.traverse((child: any) => {
          if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
            totalVertices += child.geometry.attributes.position.count;
          }
        });
        
        hasGeometry = totalVertices > 0;
        console.log(`📊 Model loaded: ${meshCount} meshes, ${totalVertices} vertices`);
      }
    }

    if (!hasGeometry) {
      // No geometry loaded - objects were skipped due to >100km distance
      console.warn('⚠️ No objects loaded - model is >100km from origin');
      
      // CRITICAL: Remove the failed model before retrying
      if (newModelIds.length > 0) {
        const failedModelId = newModelIds[0];
        const failedModel = this.fragments?.core.models.list.get(failedModelId);
        if (failedModel) {
          console.log('🗑️ Removing failed model before retry...');
          failedModel.dispose();
          this.fragments?.list.delete(failedModelId);
          this.modelMetadata.delete(failedModelId);
        }
      }
      
      console.log('🔄 Retrying with MOVE_TO_ORIGIN mode...');
      
      // Set MOVE_TO_ORIGIN mode for retry
      if (this.ifcLoader.settings?.webIfc) {
        this.ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;
      }

      // Temporarily store the callback and clear it to prevent premature tree building
      const tempCallback = this.onModelLoaded;
      this.onModelLoaded = null;

      // Fresh load with MOVE_TO_ORIGIN
      await this.ifcLoader.load(buffer, false, filename, {
        processData: {
          progressCallback: (progress) => {
            console.log(`⏳ Processing (retry): ${(progress * 100).toFixed(1)}%`);
            if (progressCallback) progressCallback(progress);
          },
        },
      });

      // Restore the callback
      this.onModelLoaded = tempCallback;

      // Wait for geometry to be created
      console.log('⏳ Waiting for geometry to be created...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify retry was successful
      const modelIdsAfterRetry = new Set(this.fragments?.core.models.list.keys() || []);
      const newModelIdsRetry = Array.from(modelIdsAfterRetry).filter(id => !modelIdsBefore.has(id));
      
      let retryHasGeometry = false;
      if (newModelIdsRetry.length > 0) {
        const retryModel = this.fragments?.core.models.list.get(newModelIdsRetry[0]);
        if (retryModel && retryModel.object) {
          const meshCount = retryModel.object.children.length;
          let totalVertices = 0;
          retryModel.object.traverse((child: any) => {
            if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
              totalVertices += child.geometry.attributes.position.count;
            }
          });
          retryHasGeometry = totalVertices > 0;
          console.log(`📊 Retry result: ${meshCount} meshes, ${totalVertices} vertices`);
        }
      }

      if (retryHasGeometry) {
        this.currentCoordinateMode = CoordinateMode.MOVE_TO_ORIGIN;
        console.log('✅ Mode set to MOVE_TO_ORIGIN (all future models will use this mode)');
        
        // For the FIRST model, mark it as the coordination reference
        if (this.loadedModelsCount === 0 && newModelIdsRetry.length > 0) {
          console.log('📐 First model set as coordination reference (COORDINATE_TO_ORIGIN was used)');
          console.log('   Subsequent models will NOT use COORDINATE_TO_ORIGIN to maintain relative positioning');
          this.coordinationMatrix = new THREE.Matrix4(); // Identity - first model is at origin
        }
        
        // Store original coordinates for first model (captured before MOVE_TO_ORIGIN)
        if (originalCenter && newModelIdsRetry.length > 0) {
          this.originalCoordinates.set(newModelIdsRetry[0], originalCenter);
          console.log(`💾 Stored original coordinates for first model: ${newModelIdsRetry[0]}`);
        }
        
        // Show warning label for far-origin model
        if (this.onCoordinateWarning) {
          this.onCoordinateWarning();
        }

        // Now trigger the model loaded callback after successful retry
        if (this.onModelLoaded) {
          console.log('🔔 Triggering model loaded callback after successful retry');
          this.onModelLoaded();
        }
      } else {
        throw new Error('Failed to load model even with MOVE_TO_ORIGIN mode. The model may be corrupted or empty.');
      }
    } else {
      // Geometry loaded successfully with PRESERVE_COORDS
      this.currentCoordinateMode = CoordinateMode.PRESERVE_COORDS;
      console.log('✅ Mode set to PRESERVE_COORDS (maintains multi-model alignment)');
      
      // Store original coordinates for first model
      if (originalCenter && newModelIds.length > 0) {
        this.originalCoordinates.set(newModelIds[0], originalCenter);
        console.log(`💾 Stored original coordinates for first model: ${newModelIds[0]}`);
      }
    }
  }

  /**
   * Loads subsequent models using the established coordinate mode
   * Prevents loading far-origin models if first model was near-origin (maintains alignment)
   */
  private async loadWithExistingCoordinateMode(
    buffer: Uint8Array,
    filename: string,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    if (!this.ifcLoader) throw new Error('IFC Loader not initialized');

    // For PRESERVE_COORDS mode, we need to detect far-origin models BEFORE loading
    if (this.currentCoordinateMode === CoordinateMode.PRESERVE_COORDS) {
      // Try to load with PRESERVE_COORDS first
      console.log(`📐 Checking if new model is compatible with PRESERVE_COORDS mode...`);
      
      if (this.ifcLoader.settings?.webIfc) {
        this.ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = false;
      }

      // Track model IDs before loading
      const modelIdsBefore = new Set(this.fragments?.core.models.list.keys() || []);

      await this.ifcLoader.load(buffer, false, filename, {
        processData: {
          progressCallback: (progress) => {
            console.log(`⏳ Processing: ${(progress * 100).toFixed(1)}%`);
            if (progressCallback) progressCallback(progress);
          },
        },
      });

      // Check if load was successful by checking geometry
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find the newly loaded model
      const modelIdsAfter = new Set(this.fragments?.core.models.list.keys() || []);
      const newModelIds = Array.from(modelIdsAfter).filter(id => !modelIdsBefore.has(id));
      
      let hasGeometry = false;
      if (newModelIds.length > 0) {
        const newModel = this.fragments?.core.models.list.get(newModelIds[0]);
        if (newModel && newModel.object) {
          const meshCount = newModel.object.children.length;
          let totalVertices = 0;
          newModel.object.traverse((child: any) => {
            if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
              totalVertices += child.geometry.attributes.position.count;
            }
          });
          hasGeometry = totalVertices > 0;
          console.log(`📊 Loaded model: ${meshCount} meshes, ${totalVertices} vertices`);
        }
      }

      if (!hasGeometry) {
        // Model is far from origin (>100km) - incompatible with PRESERVE_COORDS mode
        
        // Remove the failed model
        if (newModelIds.length > 0) {
          const failedModelId = newModelIds[0];
          const failedModel = this.fragments?.core.models.list.get(failedModelId);
          if (failedModel) {
            console.log('🗑️ Removing incompatible far-origin model...');
            failedModel.dispose();
            this.fragments?.list.delete(failedModelId);
            this.modelMetadata.delete(failedModelId);
          }
        }
        
        throw new Error(
          `❌ Cannot load far-origin model!\n\n` +
          `Current mode: PRESERVE_COORDS (maintains alignment)\n` +
          `This model is >100km from origin and cannot be mixed with existing models.\n\n` +
          `⚠️ Loading this model would break alignment of existing models!\n\n` +
          `Solution:\n` +
          `1. Use "Unload All Models" to clear existing models\n` +
          `2. Then load this far-origin model first`
        );
      }
      
      console.log('✅ Model compatible with PRESERVE_COORDS mode');
    } else {
      // MOVE_TO_ORIGIN mode - need to verify new model is also far-origin
      console.log(`📐 Checking if new model is compatible with MOVE_TO_ORIGIN mode...`);
      
      // First, try loading with PRESERVE_COORDS to detect normal models
      if (this.ifcLoader.settings?.webIfc) {
        this.ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = false;
      }

      const modelIdsBefore = new Set(this.fragments?.core.models.list.keys() || []);

      await this.ifcLoader.load(buffer, false, filename, {
        processData: {
          progressCallback: (progress) => {
            console.log(`⏳ Processing: ${(progress * 100).toFixed(1)}%`);
            if (progressCallback) progressCallback(progress);
          },
        },
      });

      // Check if model loaded with PRESERVE_COORDS (means it's a normal model)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const modelIdsAfter = new Set(this.fragments?.core.models.list.keys() || []);
      const newModelIds = Array.from(modelIdsAfter).filter(id => !modelIdsBefore.has(id));
      
      let hasGeometry = false;
      let originalCenter: THREE.Vector3 | null = null;
      
      if (newModelIds.length > 0) {
        const newModel = this.fragments?.core.models.list.get(newModelIds[0]);
        if (newModel && newModel.object) {
          // FIRST: Try to get coordinate reference BEFORE checking geometry
          console.log('🔍 Attempting to capture original IFC coordinates for second model...');
          originalCenter = await this.getModelCoordinateReference(newModel, newModelIds[0]);
          if (originalCenter) {
            console.log(`✅ Captured IFC coordinate reference: (${originalCenter.x.toFixed(2)}, ${originalCenter.y.toFixed(2)}, ${originalCenter.z.toFixed(2)})`);
          } else {
            console.log('⚠️ Could not capture IFC coordinate reference');
          }
          
          // THEN: Check if geometry loaded
          let totalVertices = 0;
          newModel.object.traverse((child: any) => {
            if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
              totalVertices += child.geometry.attributes.position.count;
            }
          });
          hasGeometry = totalVertices > 0;
        }
      }

      if (hasGeometry) {
        // Model loaded successfully with PRESERVE_COORDS - it's a NORMAL model!
        // This is incompatible with existing far-origin models
        
        // Remove the loaded normal model
        if (newModelIds.length > 0) {
          const normalModelId = newModelIds[0];
          const normalModel = this.fragments?.core.models.list.get(normalModelId);
          if (normalModel) {
            console.log('🗑️ Removing incompatible normal model...');
            normalModel.dispose();
            this.fragments?.list.delete(normalModelId);
            this.modelMetadata.delete(normalModelId);
          }
        }
        
        throw new Error(
          `❌ Cannot load normal model!\n\n` +
          `Current mode: MOVE_TO_ORIGIN (for far-origin models >100km)\n` +
          `This model is near origin and cannot be mixed with existing far-origin models.\n\n` +
          `⚠️ Loading this model would break the coordinate system!\n\n` +
          `Solution:\n` +
          `1. Use "Unload All Models" to clear existing models\n` +
          `2. Then load this normal model first`
        );
      }
      
      // Model didn't load with PRESERVE_COORDS - it's far-origin
      // Remove the failed model before retrying
      if (newModelIds.length > 0) {
        const failedModelId = newModelIds[0];
        const failedModel = this.fragments?.core.models.list.get(failedModelId);
        if (failedModel) {
          console.log('🗑️ Removing failed model before MOVE_TO_ORIGIN retry...');
          failedModel.dispose();
          this.fragments?.list.delete(failedModelId);
          this.modelMetadata.delete(failedModelId);
        }
      }
      
      // Store the original center if we captured it (for future alignment)
      const capturedOriginalCenter = originalCenter;
      
      console.log('🔄 Model is far-origin, loading with MOVE_TO_ORIGIN mode...');
      
      if (this.ifcLoader.settings?.webIfc) {
        // For far-origin models, we MUST use COORDINATE_TO_ORIGIN = true for ALL models
        // Otherwise they won't have any geometry (web-ifc skips geometry >100km from origin)
        // We'll handle alignment manually using the captured original coordinates
        this.ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;
        console.log('📐 Set COORDINATE_TO_ORIGIN = true');
        console.log('📐 Verified: COORDINATE_TO_ORIGIN =', this.ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN);
        
        // CRITICAL: Reinitialize web-ifc with the new setting
        console.log('🔄 Reinitializing web-ifc with new COORDINATE_TO_ORIGIN setting...');
        await this.ifcLoader.setup({
          autoSetWasm: false,
          wasm: {
            path: 'https://unpkg.com/web-ifc@0.0.72/',
            absolute: true,
          },
        });
        console.log('✅ Web-ifc reinitialized');
      } else {
        console.error('❌ Could not access ifcLoader.settings.webIfc!');
      }
      
      // Add a small delay to ensure settings are applied
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('🔄 About to call ifcLoader.load() with COORDINATE_TO_ORIGIN =', this.ifcLoader.settings?.webIfc?.COORDINATE_TO_ORIGIN);
      console.log('   Buffer size:', buffer.length, 'bytes');
      console.log('   Filename:', filename);
      
      // CRITICAL: Use a different filename for the retry to prevent caching issues
      const retryFilename = filename + '_retry';
      console.log('   Using retry filename:', retryFilename);

      await this.ifcLoader.load(buffer, false, retryFilename, {
        processData: {
          progressCallback: (progress) => {
            console.log(`⏳ Processing (MOVE_TO_ORIGIN): ${(progress * 100).toFixed(1)}%`);
            if (progressCallback) progressCallback(progress);
          },
        },
      });

      console.log('✅ ifcLoader.load() completed, waiting for fragments to be created...');
      
      // Wait longer for geometry to be created
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Get the newly loaded model ID
      const modelIdsAfterRetry = new Set(this.fragments?.core.models.list.keys() || []);
      const newModelIdsRetry = Array.from(modelIdsAfterRetry).filter(id => !modelIdsBefore.has(id));
      
      console.log('📊 Models after retry:', Array.from(modelIdsAfterRetry));
      console.log('📊 New model IDs:', newModelIdsRetry);
      
      if (newModelIdsRetry.length > 0) {
        this.lastLoadedModelId = newModelIdsRetry[0];
        console.log(`✅ Second far-origin model loaded: ${this.lastLoadedModelId}`);
        
        // Verify the model has geometry
        const loadedModel = this.fragments?.core.models.list.get(this.lastLoadedModelId);
        if (loadedModel) {
          let vertexCount = 0;
          loadedModel.object.traverse((child: any) => {
            if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
              vertexCount += child.geometry.attributes.position.count;
            }
          });
          console.log(`📊 Second model geometry check: ${loadedModel.object.children.length} meshes, ${vertexCount} vertices`);
          
          if (vertexCount === 0) {
            console.error('❌ Second model has NO GEOMETRY! COORDINATE_TO_ORIGIN may not have been applied correctly.');
          }
        }
        
        // Store the original coordinates for this model
        if (capturedOriginalCenter) {
          this.originalCoordinates.set(this.lastLoadedModelId, capturedOriginalCenter);
          console.log(`💾 Stored original coordinates for ${this.lastLoadedModelId}: (${capturedOriginalCenter.x.toFixed(2)}, ${capturedOriginalCenter.y.toFixed(2)}, ${capturedOriginalCenter.z.toFixed(2)})`);
        } else {
          console.error(`❌ Could not store original coordinates - capturedOriginalCenter is null!`);
        }
      }

      console.log('✅ Model loaded with MOVE_TO_ORIGIN mode');
      console.warn('⚠️ Multiple far-origin models detected - they may overlap at origin!');
      
      // Trigger alignment needed callback for second and subsequent far-origin models
      // loadedModelsCount is still 0 for the second model (incremented after this method)
      if (this.lastLoadedModelId && this.onAlignmentNeeded) {
        console.log('📍 Triggering alignment needed callback...');
        this.onAlignmentNeeded(this.lastLoadedModelId);
      }
      
      // Show warning label for subsequent far-origin model
      if (this.onCoordinateWarning) {
        this.onCoordinateWarning();
      }
    }
  }

  /**
   * Loads a pre-converted Fragments file (much faster than IFC)
   * @param source - URL string or File object pointing to .frag file
   */
  public async loadFragments(source: string | File): Promise<void> {
    if (!this.fragments) {
      throw new Error('Fragments Manager not initialized');
    }

    try {
      let buffer: ArrayBuffer;
      let modelId: string;

      if (typeof source === 'string') {
        console.log(`📥 Fetching Fragments from: ${source}`);
        const response = await fetch(source);
        buffer = await response.arrayBuffer();
        modelId = source.split('/').pop()?.split('.')[0] || 'model';
      } else {
        console.log(`📥 Loading Fragments file: ${source.name}`);
        buffer = await source.arrayBuffer();
        modelId = source.name.split('.')[0];
      }

      // Load the fragments directly (no conversion needed)
      await this.fragments.core.load(buffer, { modelId });
      
      console.log(`✅ Fragments loaded successfully: ${modelId}`);
    } catch (error) {
      console.error('❌ Error loading Fragments:', error);
      throw error;
    }
  }

  /**
   * Exports the loaded model as Fragments file
   * This allows saving the converted model for faster loading next time
   * @param filename - Name for the downloaded file
   */
  public async exportFragments(filename: string = 'model.frag'): Promise<void> {
    if (!this.fragments || this.fragments.list.size === 0) {
      console.warn('⚠️ No models loaded to export');
      return;
    }

    try {
      // Get the first model from the list
      const [model] = this.fragments.list.values();
      
      // Convert model to binary buffer
      const fragsBuffer = await model.getBuffer(false);
      
      // Create and download the file
      const file = new File([fragsBuffer], filename);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(link.href);
      
      console.log(`✅ Fragments exported: ${filename}`);
    } catch (error) {
      console.error('❌ Error exporting Fragments:', error);
      throw error;
    }
  }

  /**
   * Gets the current list of loaded models
   */
  public getLoadedModels(): Map<string, any> {
    return this.fragments?.list || new Map();
  }

  /**
   * Gets metadata for a specific model
   */
  public getModelMetadata(uuid: string): { name: string; meshCount: number; vertexCount: number } | undefined {
    return this.modelMetadata.get(uuid);
  }

  /**
   * Gets the original coordinates of a model before MOVE_TO_ORIGIN was applied
   */
  public getOriginalCoordinates(modelId: string): THREE.Vector3 | undefined {
    return this.originalCoordinates.get(modelId);
  }

  /**
   * Gets all stored original coordinates
   */
  public getAllOriginalCoordinates(): Map<string, THREE.Vector3> {
    return this.originalCoordinates;
  }

  /**
   * Gets the coordinate reference point from IFC model
   * This reads the actual IFC coordinates before any transformation
   */
  private async getModelCoordinateReference(model: any, modelId: string): Promise<THREE.Vector3 | null> {
    console.log(`🔍 getModelCoordinateReference called for model: ${modelId}`);
    try {
      // Get the spatial structure to find IfcBuilding (more specific than IfcSite)
      const spatialStructure = await model.getSpatialStructure();
      console.log('🔍 Got spatial structure:', spatialStructure ? 'SUCCESS' : 'NULL');
      
      if (!spatialStructure) {
        console.warn('Could not get spatial structure');
        return null;
      }

      // Try to find IfcBuilding first (more specific placement than site)
      let targetNode = await this.findNodeByCategory(spatialStructure, 'IFCBUILDING');
      
      // Fallback to IfcSite or IfcProject if no building found
      if (!targetNode) {
        targetNode = await this.findNodeByCategory(spatialStructure, 'IFCSITE');
      }
      if (!targetNode) {
        targetNode = await this.findNodeByCategory(spatialStructure, 'IFCPROJECT');
      }
      
      if (!targetNode) {
        console.warn('Could not find IFCBUILDING, IFCSITE or IFCPROJECT node');
        return null;
      }

      console.log(`📦 Found node of type: ${targetNode.category || targetNode._category?.value}`);

      // Get the localId
      let localId = targetNode.localId || targetNode._localId?.value;
      
      // If no direct localId, check first child
      if (!localId && targetNode.children && targetNode.children.length > 0) {
        const firstChild = targetNode.children[0];
        localId = firstChild.localId || firstChild._localId?.value;
      }

      if (!localId) {
        console.warn('Could not find localId for building/site/project');
        return null;
      }

      // Try to get ObjectPlacement using the IFC API directly
      try {
        console.log('🔍 Checking model managers...');
        console.log('🔍 Model._dataManager:', model._dataManager ? 'EXISTS' : 'NULL');
        console.log('🔍 Model._coordinatesManager:', model._coordinatesManager ? 'EXISTS' : 'NULL');
        
        // Try to get the raw IFC file data
        if (model._dataManager) {
          console.log('� DataManager keys:', Object.keys(model._dataManager));
          
          // Try to get properties through the data manager
          const propsData = await model._dataManager.getItemsProperties([localId]);
          console.log('� Properties from DataManager:', propsData);
        }
        
        // Check if we can get coordinate info from coordinates manager
        if (model._coordinatesManager) {
          console.log('� CoordinatesManager keys:', Object.keys(model._coordinatesManager));
        }
      } catch (error) {
        console.log('⚠️ Could not get data from managers:', error);
      }

      // Try getItemsData with specific attributes to get ObjectPlacement
      console.log('🔍 Trying getItemsData without attributesDefault...');
      const entityData = await model.getItemsData([localId], {
        attributesDefault: false,
        attributes: ["ObjectPlacement"]
      });

      if (entityData && entityData.length > 0) {
        const entity = entityData[0];
        console.log('📦 Found entity via getItemsData:', entity);
        console.log('📦 Entity keys:', Object.keys(entity));

        // Try to get ObjectPlacement coordinates
        if (entity.ObjectPlacement) {
          const placement = entity.ObjectPlacement;
          console.log('📍 ObjectPlacement found:', placement);
          console.log('📍 ObjectPlacement keys:', Object.keys(placement));
          
          // Extract coordinates from placement
          // IFC ObjectPlacement contains the transformation matrix
          if (placement.RelativePlacement) {
            const relPlacement = placement.RelativePlacement;
            console.log('📍 RelativePlacement found:', relPlacement);
            console.log('📍 RelativePlacement keys:', Object.keys(relPlacement));
            
            if (relPlacement.Location) {
              const location = relPlacement.Location;
              console.log('📍 Location found:', location);
              console.log('📍 Location keys:', Object.keys(location));
              
              // Location.Coordinates contains [X, Y, Z]
              if (location.Coordinates && Array.isArray(location.Coordinates)) {
                const coords = location.Coordinates;
                console.log('📍 Coordinates array:', coords);
                const x = this.extractNumericValue(coords[0]);
                const y = this.extractNumericValue(coords[1]);
                const z = coords.length > 2 ? this.extractNumericValue(coords[2]) : 0;
                
                console.log(`✅ Extracted IFC placement coordinates: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
                return new THREE.Vector3(x, y, z);
              } else {
                console.log('⚠️ Location.Coordinates not found or not an array');
              }
            } else {
              console.log('⚠️ RelativePlacement.Location not found');
            }
          } else {
            console.log('⚠️ ObjectPlacement.RelativePlacement not found');
          }
        } else {
          console.log('⚠️ Entity.ObjectPlacement not found');
        }

        // Fallback: Check RefLatitude/RefLongitude and convert to meters
        if (entity.RefLatitude && entity.RefLongitude) {
          console.log('Using RefLatitude/RefLongitude as fallback');
          // These are in degrees, convert to approximate meters
          // This is a rough approximation for alignment purposes
          const latArray = entity.RefLatitude.value || entity.RefLatitude;
          const lonArray = entity.RefLongitude.value || entity.RefLongitude;
          
          if (Array.isArray(latArray) && Array.isArray(lonArray)) {
            const lat = this.convertDMSToDecimal(latArray);
            const lon = this.convertDMSToDecimal(lonArray);
            const elev = entity.RefElevation?.value || entity.RefElevation || 0;
            
            // Convert to meters (very rough approximation)
            const y = typeof elev === 'number' ? elev : 0;
            const z = lat * 111000; // 1 degree ≈ 111km
            const x = lon * 111000 * Math.cos(lat * Math.PI / 180);
            
            console.log(`✅ Converted geographic coordinates to meters: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
            return new THREE.Vector3(x, y, z);
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting coordinate reference:', error);
      return null;
    }
  }

  /**
   * Recursively finds a node by category in spatial structure
   */
  private async findNodeByCategory(node: any, category: string): Promise<any> {
    if (!node) return null;

    const nodeCategory = node.category || node._category?.value;
    if (nodeCategory === category) {
      return node;
    }

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const result = await this.findNodeByCategory(child, category);
        if (result) return result;
      }
    }

    return null;
  }

  /**
   * Extracts numeric value from IFC property (handles wrapped values)
   */
  private extractNumericValue(prop: any): number {
    if (prop === undefined || prop === null) return 0;
    if (typeof prop === 'number') return prop;
    if (prop.value !== undefined) return typeof prop.value === 'number' ? prop.value : 0;
    return 0;
  }

  /**
   * Converts DMS (Degrees, Minutes, Seconds) to decimal degrees
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
   * Clears all loaded models from the scene
   * Resets coordinate mode to allow loading new models with different coordinates
   */
  public clearModels(): void {
    if (!this.fragments) return;
    
    for (const [, model] of this.fragments.list) {
      model.dispose();
    }
    
    this.modelMetadata.clear();
    
    // Reset coordinate mode tracking
    this.currentCoordinateMode = CoordinateMode.UNKNOWN;
    this.loadedModelsCount = 0;
    
    console.log('✅ All models cleared - coordinate mode reset');
  }

  /**
   * Gets the current coordinate mode being used
   * @returns Current coordinate mode or "UNKNOWN" if no models loaded
   */
  public getCoordinateMode(): string {
    return this.currentCoordinateMode;
  }

  /**
   * Gets the number of models loaded in current session
   */
  public getLoadedModelsCount(): number {
    return this.loadedModelsCount;
  }
}
