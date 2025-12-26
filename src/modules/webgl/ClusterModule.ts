/**
 * CLUSTER MODULE (The "Organizer")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is one of the most advanced tools. It takes all the objects in the 
 * building and physically moves them into separate groups (clusters) based 
 * on their type. It's like taking a LEGO castle apart and putting all the 
 * red bricks in one pile and all the blue bricks in another.
 * 
 * HOW IT CONNECTS:
 * - ColorSplashModule: Often used to color the piles so they are easy to identify.
 * - PropertyTable: Shows the data for the objects in the currently selected pile.
 * - WorldManager: Moves the objects around in the 3D scene.
 * --------------------------------------------------------------------------------
 */

import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { WorldManager } from './WorldManager';
import { ModelTransformModule } from './ModelTransformModule';
import type { ClipperModule } from './ClipperModule';
import type { WebGPURendererModule } from '../webgpu/WebGPURendererModule';

// ==================================================================================
// 1. CLUSTER DATA CLASS
// ==================================================================================
/**
 * Represents a single cluster of IFC elements.
 * A cluster groups all elements of the same IFC type (e.g., all walls).
 */
class IFCCluster {
  /** The IFC category name (e.g., 'IFCWALL') */
  public readonly category: string;
  
  /** Array of local IDs belonging to this cluster */
  public readonly itemIds: number[];
  
  /** The bounding box encompassing all items in this cluster */
  public boundingBox: THREE.Box3 | null = null;
  
  /** Visual helper for the cluster (box edges) */
  public visualHelper: THREE.LineSegments | null = null;
  
  /** The model this cluster belongs to */
  public readonly modelId: string;

  /** Original positions of fragments before clustering */
  private originalPositions: Map<string, THREE.Vector3> = new Map();

  /** Target cluster position in 3D space */
  public clusterPosition: THREE.Vector3 | null = null;

    /** Cloned meshes for this cluster (for cleanup) */
  public clonedMeshes: THREE.Mesh[] = [];
  
  /** Text label sprite for this cluster */
  public label: THREE.Sprite | null = null;

  constructor(modelId: string, category: string, itemIds: number[]) {
    this.modelId = modelId;
    this.category = category;
    this.itemIds = itemIds;
  }

  /**
   * Get a human-readable label for this cluster
   */
  getLabel(): string {
    const cleanCategory = this.category.replace(/^IFC/, '');
    return `${cleanCategory} (${this.itemIds.length})`;
  }

  /**
   * Store original positions of fragments
   */
  storeOriginalPositions(fragments: Map<string, THREE.Vector3>): void {
    this.originalPositions = new Map(fragments);
  }

  /**
   * Get original positions
   */
  getOriginalPositions(): Map<string, THREE.Vector3> {
    return this.originalPositions;
  }

  /**
   * Clear stored positions
   */
  clearOriginalPositions(): void {
    this.originalPositions.clear();
  }
}

// ==================================================================================
// 2. CLUSTER VISUALIZATION CLASS
// ==================================================================================
/**
 * Handles the visual representation of clusters in the 3D scene.
 */
class ClusterVisualizer {
  private scene: THREE.Scene;
  public clusterGroup: THREE.Group;  // Made public so ClusterManager can access it
  private hiddenModels: Set<any> = new Set();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.clusterGroup = new THREE.Group();
    this.clusterGroup.name = 'IFC_Clusters';
    this.clusterGroup.userData.isClusterMesh = true;
    this.scene.add(this.clusterGroup);
  }

  /**
   * Create visual bounding box for a cluster
   */
  createClusterVisual(cluster: IFCCluster, color: THREE.Color): THREE.LineSegments {
    if (!cluster.boundingBox) {
      throw new Error('Cluster must have a bounding box before creating visual');
    }

    const box = cluster.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);
    
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);

    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({ 
      color: color,
      linewidth: 2,
      transparent: true,
      opacity: 0.8
    });

    const lineSegments = new THREE.LineSegments(edges, material);
    lineSegments.userData.isClusterMesh = true;
    lineSegments.frustumCulled = false;
    
    // Don't position here - will be positioned at cluster position in visualizeClusters()
    // The geometry is centered at origin, and we'll move the whole thing to clusterPosition

    this.clusterGroup.add(lineSegments);
    return lineSegments;
  }

  /**
   * Toggle visibility of the cluster group
   */
  toggleVisibility(visible: boolean): void {
    this.clusterGroup.visible = visible;
  }

  /**
   * Remove all cluster visualizations from the scene
   */
  clearVisuals(): void {
    while (this.clusterGroup.children.length > 0) {
      const child = this.clusterGroup.children[0];
      this.clusterGroup.remove(child);
      
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      } else if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    }
  }

  /**
   * Hide original model
   */
  hideModel(model: any): void {
    if (model.object) {
      model.object.visible = false;
      this.hiddenModels.add(model);
    }
  }

  /**
   * Show original model
   */
  showModel(model: any): void {
    if (model.object) {
      model.object.visible = true;
      this.hiddenModels.delete(model);
    }
  }

  /**
   * Restore all hidden models
   */
  restoreAllModels(): void {
    for (const model of this.hiddenModels) {
      if (model.object) {
        model.object.visible = true;
      }
    }
    this.hiddenModels.clear();
  }

  /**
   * Animate clusters entering the scene
   */
  animateEntry(duration: number = 500): void {
    const start = performance.now();
    const initialScale = 0.01;
    this.clusterGroup.scale.set(initialScale, initialScale, initialScale);
    
    const animate = () => {
      const now = performance.now();
      const progress = Math.min((now - start) / duration, 1);
      
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      
      const scale = initialScale + (1 - initialScale) * ease;
      this.clusterGroup.scale.set(scale, scale, scale);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }

  /**
   * Animate clusters exiting the scene
   */
  animateExit(duration: number = 400, onComplete?: () => void): void {
    const start = performance.now();
    
    const animate = () => {
      const now = performance.now();
      const progress = Math.min((now - start) / duration, 1);
      
      // Ease in cubic
      const ease = Math.pow(progress, 3);
      
      const scale = 1 - ease;
      // Prevent going to exactly 0 to avoid matrix singular warnings
      const safeScale = Math.max(scale, 0.001);
      this.clusterGroup.scale.set(safeScale, safeScale, safeScale);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        if (onComplete) onComplete();
        // Reset scale for next time
        this.clusterGroup.scale.set(1, 1, 1);
      }
    };
    
    requestAnimationFrame(animate);
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.clearVisuals();
    this.scene.remove(this.clusterGroup);
  }
}

// ==================================================================================
// 3. CLUSTER MANAGER CLASS
// ==================================================================================
/**
 * Main class that manages IFC element clustering operations.
 */
class ClusterManager {
  private fragmentsManager: OBC.FragmentsManager;
  private clusters: Map<string, IFCCluster[]> = new Map(); // modelId -> clusters[]
  private visualizer: ClusterVisualizer;
  private components: OBC.Components;
  private colorOverrides: Map<string, THREE.Color> = new Map(); // category -> custom color
  private webgpu: WebGPURendererModule | null = null;
  /** Flag to cancel pending animation callbacks */
  private animationCancelled: boolean = false;

  constructor(components: OBC.Components, scene: THREE.Scene) {
    this.components = components;
    this.fragmentsManager = components.get(OBC.FragmentsManager);
    this.visualizer = new ClusterVisualizer(scene);
  }

  /**
   * Set WebGPU renderer module reference
   */
  setWebGPURenderer(webgpu: WebGPURendererModule): void {
    this.webgpu = webgpu;
    console.log('🎮 ClusterManager: WebGPU renderer set');
  }

  /**
   * Set custom colors for specific categories (from ColorSplashModule)
   * @param categoryColors Map of category name -> THREE.Color
   */
  setColorOverrides(categoryColors: Map<string, THREE.Color>): void {
    this.colorOverrides = categoryColors;
    console.log(`🎨 Applied ${categoryColors.size} custom category colors`);
  }

  /**
   * Clear custom color overrides
   */
  clearColorOverrides(): void {
    this.colorOverrides.clear();
  }

  /**
   * Generate clusters for all loaded models
   */
  async generateClusters(): Promise<void> {
    console.log('🔍 Starting cluster generation...');
    this.clusters.clear();

    for (const [modelId, model] of this.fragmentsManager.list) {
      try {
        console.log(`📊 Processing model: ${modelId}`);
        
        // Get all categories in the model
        const categories = await (model as any).getCategories();
        console.log(`  Found ${categories.length} categories`);

        const modelClusters: IFCCluster[] = [];

        // Only cluster geometry categories (skip metadata/property types)
        const geometryCategories = categories.filter((cat: string) => {
          return cat.match(/^IFC(WALL|BEAM|COLUMN|SLAB|DOOR|FURNISH|WINDOW|ROOF|STAIR|RAMP|RAILING|FOOTING|CURTAINWALL|PLATE|COVERING|DUCT|PIPE|CABLE|FITTING|SEGMENT|JUNCTION|FLOWSEGMENT|FLOWTERMINAL|FLOWCONTROLLER|FLOWFITTING|AIRTERM|OUTLET|VALVE|PUMP|FAN|DAMPER|SENSOR|CONTROLLER|ACTUATOR|ALARM|LIGHT|FIXTURE|EQUIPMENT|FLOWMETER|ENERGYCONVERSION|DISTRIB|HEATER|CHILLER|BOILER|COIL|HUMIDIFIER|EVAPORATOR|CONDENSER|TANK|FILTER|TRANSFORMER|MOTOR|SWITCH|PROTECTIVEDEVICE|JUNCTION|CABLE|TRAY|RACEWAY)/);
        });

        console.log(`  Filtering to ${geometryCategories.length} geometry categories`);

        // Create a cluster for each geometry category
        for (const category of geometryCategories) {
          // Convert category string to regex pattern for OBC API
          const categoryRegex = new RegExp(`^${category}$`);
          const items = await (model as any).getItemsOfCategories([categoryRegex]);
          const categoryKey = Object.keys(items).find(key => key.includes(category));
          
          if (!categoryKey || !items[categoryKey] || items[categoryKey].length === 0) {
            continue;
          }

          const itemIds = items[categoryKey];
          console.log(`  - ${category}: ${itemIds.length} items`);

          // Create cluster
          const cluster = new IFCCluster(modelId, category, itemIds);

          // Calculate bounding box using fragment-based approach
          try {
            const boundingBox = await this.calculateBoundingBoxForFragments(model, itemIds);
            if (boundingBox && !boundingBox.isEmpty()) {
              cluster.boundingBox = boundingBox;
              modelClusters.push(cluster);
            } else {
              console.warn(`  ⚠️ Empty bounding box for ${category}`);
            }
          } catch (error) {
            console.warn(`  ⚠️ Could not get bounding box for ${category}:`, error);
          }
        }

        if (modelClusters.length > 0) {
          this.clusters.set(modelId, modelClusters);
          console.log(`✅ Created ${modelClusters.length} clusters for model ${modelId}`);
        }
      } catch (error) {
        console.error(`❌ Error processing model ${modelId}:`, error);
      }
    }

    console.log(`✅ Total clusters generated: ${this.getTotalClusterCount()}`);
  }

  /**
   * Generate clusters for specific filtered elements (e.g., one IFC type from color splash)
   * Now supports multiple categories with separate clusters
   * @param filteredElementsByCategory Map of categoryName -> Map of modelId -> Set of localIds
   * @param categoryName Name(s) of the category for labeling (can be multiple)
   */
  async generateFilteredClusters(filteredElementsByCategory: Map<string, { [key: string]: Set<number> }>, categoryName: string): Promise<void> {
    console.log(`🔍 Generating clusters for filtered categories: ${categoryName}`);
    this.clusters.clear();

    // Process each category separately to create individual clusters
    for (const [category, filteredElements] of filteredElementsByCategory) {
      for (const [modelId, localIds] of Object.entries(filteredElements)) {
        const model = this.fragmentsManager.list.get(modelId);
        if (!model) {
          console.warn(`⚠️ Model ${modelId} not found`);
          continue;
        }

        try {
          const itemIds = Array.from(localIds);
          console.log(`  📊 Processing ${itemIds.length} items for ${category} in model ${modelId}`);

          // Create a cluster for this category
          const cluster = new IFCCluster(modelId, category, itemIds);

          // Calculate bounding box
          try {
            const boundingBox = await this.calculateBoundingBoxForFragments(model, itemIds);
            if (boundingBox && !boundingBox.isEmpty()) {
              cluster.boundingBox = boundingBox;
              
              // Add to model's cluster array (not replace)
              if (!this.clusters.has(modelId)) {
                this.clusters.set(modelId, []);
              }
              this.clusters.get(modelId)!.push(cluster);
              
              console.log(`✅ Created cluster for ${category} in model ${modelId}`);
            } else {
              console.warn(`  ⚠️ Empty bounding box for ${category}`);
            }
          } catch (error) {
            console.warn(`  ⚠️ Could not get bounding box for ${category}:`, error);
          }
        } catch (error) {
          console.error(`❌ Error processing filtered elements for ${modelId}:`, error);
        }
      }
    }

    console.log(`✅ Filtered clusters generated: ${this.getTotalClusterCount()} cluster(s)`);
  }

  /**
   * Calculate merged bounding box using OBC's built-in methods
   * This uses the OBC API properly instead of trying to map meshes
   */
  private async calculateBoundingBoxForFragments(model: any, itemIds: number[]): Promise<THREE.Box3> {
    console.log(`  📦 Calculating bounding box for ${itemIds.length} items using OBC API`);
    
    try {
      // Try using OBC's getMergedBox (correct method name!)
      if (typeof model.getMergedBox === 'function') {
        const box = await model.getMergedBox(itemIds);
        if (box && !box.isEmpty()) {
          console.log(`  ✅ Got bounding box from getMergedBox`);
          return box;
        } else {
          console.warn(`  ⚠️ getMergedBox returned empty box`);
          
          // Fallback: Check for children if box is empty (e.g. for Curtain Walls)
          if (typeof model.getItemsChildren === 'function') {
             try {
               const children = await model.getItemsChildren(itemIds);
               if (children && children.length > 0) {
                  console.log(`  Found ${children.length} children, trying to get their box...`);
                  const childrenBox = await model.getMergedBox(children);
                  if (childrenBox && !childrenBox.isEmpty()) {
                     console.log(`  ✅ Got bounding box from children`);
                     return childrenBox;
                  }
               }
             } catch (childError) {
               console.warn(`  ⚠️ Failed to get children box:`, childError);
             }
          }
        }
      }
      
      // Try getBoxes as fallback
      if (typeof model.getBoxes === 'function') {
        const boxes = await model.getBoxes(itemIds);
        if (boxes && boxes.length > 0) {
          const mergedBox = new THREE.Box3();
          let validBoxCount = 0;
          for (const box of boxes) {
            if (box && !box.isEmpty()) {
              mergedBox.union(box);
              validBoxCount++;
            }
          }
          if (!mergedBox.isEmpty()) {
            console.log(`  ✅ Merged ${validBoxCount}/${boxes.length} valid bounding boxes from getBoxes`);
            return mergedBox;
          } else {
            console.warn(`  ⚠️ All boxes from getBoxes were empty (${boxes.length} total)`);
          }
        }
      }
      
      // Try to get geometry data directly from fragments
      if (model.object && model.object.children) {
        console.log(`  🔍 Attempting to calculate box from fragment geometry...`);
        const mergedBox = new THREE.Box3();
        let foundGeometry = false;
        
        model.object.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh && child.geometry) {
            // Check if this mesh belongs to one of our items
            const expressID = child.userData?.expressID;
            if (expressID && itemIds.includes(expressID)) {
              const childBox = new THREE.Box3().setFromObject(child);
              if (!childBox.isEmpty()) {
                mergedBox.union(childBox);
                foundGeometry = true;
              }
            }
          }
        });
        
        if (foundGeometry && !mergedBox.isEmpty()) {
          console.log(`  ✅ Calculated bounding box from fragment geometry`);
          return mergedBox;
        }
      }
    } catch (error) {
      console.warn('  ⚠️ Error getting bounding boxes from OBC:', error);
    }
    
    // Last resort: use model's entire bounding box (will be same for all categories)
    console.log(`  ⚠️ Falling back to entire model bounding box`);
    const box = new THREE.Box3();
    if (model.object) {
      box.setFromObject(model.object);
    }
    return box;
  }

  /**
   * Calculate cluster positions in a grid layout with proper spacing based on bounding box sizes
   * Groups clusters by model to keep each model's clusters together
   */
  private calculateClusterPositions(clusters: IFCCluster[]): void {
    const gap = 20; // meters gap between cluster bounding boxes
    const modelGap = 50; // larger gap between different models
    
    // Group clusters by modelId
    const clustersByModel = new Map<string, IFCCluster[]>();
    for (const cluster of clusters) {
      if (!clustersByModel.has(cluster.modelId)) {
        clustersByModel.set(cluster.modelId, []);
      }
      clustersByModel.get(cluster.modelId)!.push(cluster);
    }
    
    console.log(`  📐 Positioning ${clusters.length} clusters from ${clustersByModel.size} models...`);
    
    // Position each model's clusters in a row, separated by modelGap
    let currentModelZ = 0;
    
    for (const [modelId, modelClusters] of clustersByModel) {
      console.log(`  📦 Model ${modelId}: ${modelClusters.length} clusters`);
      
      // Calculate grid for this model's clusters
      const itemsPerRow = Math.ceil(Math.sqrt(modelClusters.length));
      let currentZ = currentModelZ;
      
      for (let row = 0; row < Math.ceil(modelClusters.length / itemsPerRow); row++) {
        let currentX = 0;
        let maxHeightInRow = 0;
        
        // Process each cluster in this row
        for (let col = 0; col < itemsPerRow; col++) {
          const index = row * itemsPerRow + col;
          if (index >= modelClusters.length) break;
          
          const cluster = modelClusters[index];
          if (!cluster.boundingBox) continue;
          
          const size = new THREE.Vector3();
          cluster.boundingBox.getSize(size);
          
          // Position cluster at current X, Z with its center
          cluster.clusterPosition = new THREE.Vector3(
            currentX + size.x / 2,
            0,
            currentZ + size.z / 2
          );
          
          // Move X position for next cluster (width + gap)
          currentX += size.x + gap;
          
          // Track max height (Z size) in this row
          maxHeightInRow = Math.max(maxHeightInRow, size.z);
        }
        
        // Move Z position for next row (max height in row + gap)
        currentZ += maxHeightInRow + gap;
      }
      
      // Move to next model position (add model gap)
      currentModelZ = currentZ + modelGap;
    }
    
    console.log(`  ✅ Positioned clusters grouped by model with ${gap}m cluster gap and ${modelGap}m model gap`);
  }

  /**
   * Move fragments to their cluster positions
   * Uses OBC's getItemsGeometry to extract actual geometry for each cluster
   * @param hideAllModels If true, hides ALL loaded models (for filtered clusters)
   */
  private async moveToClusterPositions(hideAllModels: boolean = false): Promise<void> {
    console.log('🚚 Creating clustered views with category filtering...');
    
    const totalStartTime = performance.now();
    
    // First pass: Create all cluster geometries in parallel and update bounding boxes
    const geometryPromises: Promise<void>[] = [];
    
    for (const [modelId, clusters] of this.clusters) {
      const model = this.fragmentsManager.list.get(modelId);
      if (!model || !model.object) continue;

      console.log(`  🎨 Processing ${clusters.length} clusters for ${modelId} in parallel...`);

      // Process all clusters for this model in parallel
      for (const cluster of clusters) {
        geometryPromises.push(this.createClusterGeometry(model, cluster));
      }
    }
    
    // Wait for all geometry creation to complete
    console.log(`  ⏳ Creating geometry for ${geometryPromises.length} clusters in parallel...`);
    await Promise.all(geometryPromises);
    console.log(`  ✅ All geometry created in ${(performance.now() - totalStartTime).toFixed(0)}ms`);
    
    // Second pass: Recalculate positions based on updated bounding boxes
    // Collect all clusters from all models to prevent overlap
    const allClusters: IFCCluster[] = [];
    for (const [, clusters] of this.clusters) {
      allClusters.push(...clusters);
    }
    this.calculateClusterPositions(allClusters);
    
    // Third pass: Position cluster groups and add labels
    for (const [modelId, clusters] of this.clusters) {
      const model = this.fragmentsManager.list.get(modelId);
      if (!model) continue;

      for (const cluster of clusters) {
        if (!cluster.clusterPosition || cluster.clonedMeshes.length === 0) continue;
        
        // Find the cluster group that was created (include modelId to handle multiple models)
        const clusterGroup = this.visualizer.clusterGroup.children.find(
          (child: any) => child.name === `Cluster_${cluster.modelId}_${cluster.category}`
        );
        
        if (clusterGroup) {
          // Position the group at the calculated cluster position
          clusterGroup.position.copy(cluster.clusterPosition);
          clusterGroup.updateMatrixWorld(true);
          
          // Add text label for this cluster at the cluster position
          this.addClusterLabel(cluster, cluster.clusterPosition);
        }
      }
    }
    
    // Hide models based on mode
    if (hideAllModels) {
      // In filtered cluster mode: hide ALL models
      console.log('  🙈 Hiding all models for filtered cluster view...');
      for (const [, model] of this.fragmentsManager.list) {
        this.visualizer.hideModel(model);
      }
    } else {
      // In full cluster mode: hide only models that have clusters
      for (const [modelId, clusters] of this.clusters) {
        const model = this.fragmentsManager.list.get(modelId);
        if (model) {
          this.visualizer.hideModel(model);
        }
      }
    }
    
    console.log('✅ Cluster views created with category filtering and labels');
  }

  /**
   * Create geometry for a single cluster using OBC Item API
   * This preserves the IFC grouping structure (e.g., doors with frames, leafs, handles as one object)
   */
  private async createClusterGeometry(model: any, cluster: IFCCluster): Promise<void> {
    console.log(`  📦 ${cluster.category}: ${cluster.itemIds.length} items`);

    // Create cluster group (initially at origin, will be positioned later)
    // Include modelId to avoid name conflicts when multiple models have same category
    const clusterGroup = new THREE.Group();
    clusterGroup.name = `Cluster_${cluster.modelId}_${cluster.category}`;
    clusterGroup.userData.modelId = cluster.modelId;
    clusterGroup.userData.category = cluster.category;
    clusterGroup.userData.isClusterMesh = true;
    
    // Get the color for this category
    const categoryColor = this.getCategoryColor(cluster.category);
    
    // OPTIMIZATION: Create shared material for all meshes in this cluster
    const sharedMaterial = new THREE.MeshStandardMaterial({
      color: categoryColor,
      metalness: 0.1,
      roughness: 0.8,
      side: THREE.DoubleSide,
      transparent: true, // Enable transparency by default for WebGPU compatibility
      opacity: 1.0,
      alphaToCoverage: false // Initial state is opaque
    });
    
    // Determine if this is a horizontal element (slabs, roofs, footings)
    const isHorizontalElement = ['IFCSLAB', 'IFCROOF', 'IFCFOOTING', 'IFCRAMPFLIGHT'].includes(cluster.category);
    
    let totalItems = 0;
    
    // Use OBC's Item API to preserve IFC structure
    // Each Item represents a complete IFC object (door with all its parts, etc.)
    const itemObjects: Array<{
      itemId: number;
      group: THREE.Group;
      box: THREE.Box3;
    }> = [];
    
    for (const itemId of cluster.itemIds) {
      try {
        // Get the Item object using OBC API - this preserves IFC grouping
        const item = model.getItem(itemId);
        if (!item) {
          console.warn(`  ⚠️ Item ${itemId} not found in model`);
          continue;
        }
        
        // Get all geometry parts for this item
        let geometries;
        try {
          // Try getting geometry directly using model API
          const geometriesArray = await model.getItemsGeometry([itemId]);
          if (geometriesArray && geometriesArray.length > 0) {
            geometries = geometriesArray[0];
          }
          
          // If no geometry, try getting children (e.g. for IFCCURTAINWALL which is an assembly)
          if (!geometries || geometries.length === 0) {
            const children = await model.getItemsChildren([itemId]);
            if (children && children.length > 0) {
              const childrenGeometriesArray = await model.getItemsGeometry(children);
              // Flatten the array of arrays to get all meshes from all children
              geometries = childrenGeometriesArray.flat();
            }
          }
        } catch (geomError) {
          console.warn(`  ⚠️ Item ${itemId} failed to get geometries:`, geomError);
          continue;
        }
        
        if (!geometries || geometries.length === 0) {
          console.warn(`  ⚠️ Item ${itemId} has no geometries`);
          continue;
        }
        
        // Create a group for this item (keeps all parts together)
        const itemGroup = new THREE.Group();
        itemGroup.name = `${cluster.category}_Item_${itemId}`;
        
        // Store IFC data on the group
        itemGroup.userData.isClusterMesh = true;
        itemGroup.userData.modelId = cluster.modelId;
        itemGroup.userData.expressID = itemId;
        itemGroup.userData.category = cluster.category;
        
        let meshCount = 0;
        
        // Create meshes for each geometry part
        for (const meshData of geometries) {
          if (!meshData || !meshData.positions || !meshData.indices) continue;
          
          // Create BufferGeometry
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions, 3));
          
          if (meshData.normals) {
            // WebGPU compatibility: Convert Int16 normals to Float32 and scale them
            const n = meshData.normals;
            const out = new Float32Array(n.length);
            const scale = 1 / 32767; // Int16 normalized range
            for (let i = 0; i < n.length; i++) out[i] = n[i] * scale;
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(out, 3));
          } else {
            geometry.computeVertexNormals();
          }
          
          geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.indices, 1));
          
          // Create mesh - Clone material to allow independent opacity/visibility control
          const mesh = new THREE.Mesh(geometry, sharedMaterial.clone());
          mesh.frustumCulled = false;
          
          // Apply the transform from IFC (this preserves the original positioning of parts)
          if (meshData.transform) {
            mesh.applyMatrix4(meshData.transform);
          }
          
          // Store IFC data on each mesh too for raycasting
          mesh.userData.isClusterMesh = true;
          mesh.userData.modelId = cluster.modelId;
          mesh.userData.expressID = itemId;
          mesh.userData.category = cluster.category;
          
          itemGroup.add(mesh);
          meshCount++;
        }
        
        // Skip items with no valid meshes
        if (meshCount === 0) {
          console.warn(`  ⚠️ Item ${itemId} has no valid meshes`);
          continue;
        }
        
        // Calculate bounding box for this complete item
        const itemBox = new THREE.Box3().setFromObject(itemGroup);
        
        // Apply horizontal rotation if needed (only for slabs, roofs, etc.)
        if (isHorizontalElement) {
          itemGroup.rotation.x = Math.PI / 2;
          // Recalculate box after rotation
          itemBox.setFromObject(itemGroup);
        }
        
        itemObjects.push({
          itemId,
          group: itemGroup,
          box: itemBox
        });
        
        totalItems++;
      } catch (error) {
        console.warn(`  ⚠️ Error processing item ${itemId}:`, error);
      }
    }
    
    console.log(`  ✅ Created ${totalItems} complete items for ${cluster.category}`);
    
    // Sort items from bigger to smaller based on bounding box volume
    itemObjects.sort((a, b) => {
      const volumeA = a.box.getSize(new THREE.Vector3()).x * a.box.getSize(new THREE.Vector3()).y * a.box.getSize(new THREE.Vector3()).z;
      const volumeB = b.box.getSize(new THREE.Vector3()).x * b.box.getSize(new THREE.Vector3()).y * b.box.getSize(new THREE.Vector3()).z;
      return volumeB - volumeA; // Descending order (bigger first)
    });
    console.log(`  📏 Sorted ${itemObjects.length} items by size (biggest first)`);
    
    // Grid layout: arrange items in a grid with proper spacing
    const itemsPerRow = Math.ceil(Math.sqrt(itemObjects.length));
    const padding = 2; // meters padding between items
    
    // Calculate row heights and column widths based on bounding boxes
    const rowHeights: number[] = [];
    const colWidths: number[] = [];
    
    for (let row = 0; row < Math.ceil(itemObjects.length / itemsPerRow); row++) {
      let maxHeight = 0;
      for (let col = 0; col < itemsPerRow; col++) {
        const idx = row * itemsPerRow + col;
        if (idx >= itemObjects.length) break;
        
        const size = itemObjects[idx].box.getSize(new THREE.Vector3());
        maxHeight = Math.max(maxHeight, size.z);
        
        if (row === 0) {
          colWidths[col] = Math.max(colWidths[col] || 0, size.x);
        }
      }
      rowHeights[row] = maxHeight;
    }
    
    // Calculate cumulative positions
    const rowPositions: number[] = [0];
    for (let i = 0; i < rowHeights.length - 1; i++) {
      rowPositions[i + 1] = rowPositions[i] + rowHeights[i] + padding;
    }
    
    const colPositions: number[] = [0];
    for (let i = 0; i < colWidths.length - 1; i++) {
      colPositions[i + 1] = colPositions[i] + colWidths[i] + padding;
    }
    
    // Calculate total grid size to center it
    const totalWidth = colPositions[colPositions.length - 1] + (colWidths[colWidths.length - 1] || 0);
    const totalDepth = rowPositions[rowPositions.length - 1] + (rowHeights[rowHeights.length - 1] || 0);
    
    // Position each item group in the grid
    for (let idx = 0; idx < itemObjects.length; idx++) {
      const itemObj = itemObjects[idx];
      const row = Math.floor(idx / itemsPerRow);
      const col = idx % itemsPerRow;
      
      // Calculate grid position (centered)
      const gridX = colPositions[col] + colWidths[col] / 2 - totalWidth / 2;
      const gridZ = rowPositions[row] + rowHeights[row] / 2 - totalDepth / 2;
      
      // Get item's current center
      const itemCenter = itemObj.box.getCenter(new THREE.Vector3());
      
      // Position the group so its center is at the grid position
      itemObj.group.position.set(
        gridX - itemCenter.x,
        -itemCenter.y,
        gridZ - itemCenter.z
      );
      
      // Add to cluster group
      clusterGroup.add(itemObj.group);
      cluster.clonedMeshes.push(itemObj.group as any);
    }
    
    console.log(`  ✅ Positioned ${itemObjects.length} items in ${totalWidth.toFixed(1)}m x ${totalDepth.toFixed(1)}m grid`);
    
    // Update cluster bounding box
    const margin = 2;
    cluster.boundingBox = new THREE.Box3(
      new THREE.Vector3(-totalWidth / 2 - margin, -5, -totalDepth / 2 - margin),
      new THREE.Vector3(totalWidth / 2 + margin, 10, totalDepth / 2 + margin)
    );
    
    this.visualizer.clusterGroup.add(clusterGroup);
  }

  /**
   * Add a text label above the cluster
   */
  private addClusterLabel(cluster: IFCCluster, offset: THREE.Vector3): void {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;

    // Set canvas size
    canvas.width = 512;
    canvas.height = 128;

    // Draw background
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text
    context.font = 'bold 48px Arial';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Format category name (remove IFC prefix, capitalize)
    const displayName = cluster.category.replace('IFC', '').replace('STANDARDCASE', '');
    context.fillText(displayName, canvas.width / 2, canvas.height / 2);
    
    // Add item count
    context.font = '32px Arial';
    context.fillStyle = '#aaaaaa';
    context.fillText(`${cluster.itemIds.length} items`, canvas.width / 2, canvas.height / 2 + 40);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // Create a plane geometry instead of sprite for better control
    const planeGeometry = new THREE.PlaneGeometry(15, 4);
    const planeMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false
    });
    
    const labelMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    labelMesh.userData.isClusterMesh = true;
    labelMesh.frustumCulled = false;
    
    // Position above the cluster
    const labelPosition = offset.clone();
    if (cluster.boundingBox) {
      const size = new THREE.Vector3();
      cluster.boundingBox.getSize(size);
      // Position label above the cluster
      labelPosition.y += size.y / 2 + 3;
    }
    labelMesh.position.copy(labelPosition);
    
    // Make label face upward (horizontal orientation like a floor sign)
    labelMesh.rotation.x = -Math.PI / 2;
    
    // Store reference (cast to any since label is typed as THREE.Sprite)
    cluster.label = labelMesh as any;
    this.visualizer.clusterGroup.add(labelMesh);
  }

  /**
   * Get color for category visualization
   * First checks for custom color overrides, then falls back to defaults
   */
  private getCategoryColor(category: string): number {
    // Check if there's a custom color override from ColorSplashModule
    if (this.colorOverrides.has(category)) {
      const customColor = this.colorOverrides.get(category)!;
      return customColor.getHex();
    }

    // Fall back to default colors
    const colors: { [key: string]: number } = {
      // Architectural - Primary Structure
      'IFCWALL': 0xcccccc,
      'IFCWALLSTANDARDCASE': 0xaaaaaa,
      'IFCSLAB': 0x888888,
      'IFCBEAM': 0xff6b6b,
      'IFCCOLUMN': 0x4ecdc4,
      'IFCDOOR': 0x8b4513,
      'IFCWINDOW': 0x87ceeb,
      'IFCROOF': 0x8b0000,
      'IFCSTAIR': 0xffd700,
      'IFCSTAIRFLIGHT': 0xffaa00,
      'IFCRAILING': 0xc0c0c0,
      'IFCFURNISHINGELEMENT': 0x9b59b6,
      'IFCFOOTING': 0x654321,
      'IFCRAMP': 0xff9900,
      'IFCRAMPFLIGHT': 0xff7700,
      
      // Architectural - Secondary Structure & Envelope
      'IFCCURTAINWALL': 0x26C6DA,
      'IFCPLATE': 0x90CAF9,
      'IFCPLATESTANDARDCASE': 0x64B5F6,
      'IFCCOVERING': 0xFFAB91,
      'IFCMEMBER': 0xFF8A65,
      'IFCMEMBERSTANDARDCASE': 0xFF7043,
      'IFCBUILDINGELEMENTPROXY': 0xBCAAA4,
      
      // Spatial Elements
      'IFCSPACE': 0xE3F2FD,
      'IFCSITE': 0x8D6E63,
      'IFCBUILDING': 0xBCAAA4,
      'IFCBUILDINGSTOREY': 0xD7CCC8,
      
      // MEP - HVAC (Blue tones)
      'IFCDUCTFITTING': 0x4169e1,
      'IFCDUCTSEGMENT': 0x6495ed,
      'IFCDUCT': 0x4682b4,
      'IFCAIRTERM': 0x87ceeb,
      'IFCAIRTERMINAL': 0x87ceeb,
      'IFCDAMPER': 0x5f9ea0,
      'IFCFAN': 0x00ced1,
      'IFCCOIL': 0x4169e1,
      'IFCCHILLER': 0x1e90ff,
      'IFCBOILER': 0xff4500,
      'IFCHEATER': 0xff6347,
      // MEP - Piping (Green/Cyan tones)
      'IFCPIPEFITTING': 0x20b2aa,
      'IFCPIPESEGMENT': 0x3cb371,
      'IFCPIPE': 0x2e8b57,
      'IFCVALVE': 0x00fa9a,
      'IFCPUMP': 0x40e0d0,
      'IFCFLOWMETER': 0x48d1cc,
      'IFCFILTER': 0x00ff7f,
      'IFCTANK': 0x5f9ea0,
      // MEP - Electrical (Yellow/Orange tones)
      'IFCCABLEFITTING': 0xffa500,
      'IFCCABLESEGMENT': 0xff8c00,
      'IFCCABLE': 0xffd700,
      'IFCCABLECARRIERFITTING': 0xffb90f,
      'IFCCABLECARRIERSEGMENT': 0xdaa520,
      'IFCCABLETRAY': 0xf0e68c,
      'IFCRACEWAY': 0xeee8aa,
      'IFCLIGHTFIXTURE': 0xffff00,
      'IFCLIGHT': 0xffffe0,
      'IFCOUTLET': 0xffa500,
      'IFCSWITCH': 0xff8c00,
      'IFCTRANSFORMER': 0xff4500,
      'IFCMOTOR': 0xdb7093,
      'IFCPROTECTIVEDEVICE': 0xff6347,
      'IFCJUNCTIONBOX': 0xcd853f,
      // MEP - Controls (Purple/Pink tones)
      'IFCSENSOR': 0xda70d6,
      'IFCCONTROLLER': 0xba55d3,
      'IFCACTUATOR': 0x9370db,
      'IFCALARM': 0xff1493,
      // MEP - General Equipment
      'IFCEQUIPMENT': 0x808080,
      'IFCFLOWFITTING': 0x696969,
      'IFCFLOWSEGMENT': 0x778899,
      'IFCFLOWTERMINAL': 0x708090,
      'IFCFLOWCONTROLLER': 0x2f4f4f,
      'IFCDISTRIBUTIONELEMENT': 0x696969,
    };
    return colors[category] || 0x808080;
  }

  /**
   * Restore fragments to their original positions
   */
  private async restoreOriginalPositions(): Promise<void> {
    console.log('🔄 Removing cloned geometry, labels, and restoring original...');
    
    // Restore original model visibility
    this.visualizer.restoreAllModels();
    
    // Collect unique materials to dispose (since they're shared per cluster)
    const materialsToDispose = new Set<THREE.Material>();
    
    // Remove all cloned meshes and labels
    for (const [, clusters] of this.clusters) {
      for (const cluster of clusters) {
        // Remove cloned meshes (can be Groups or Meshes)
        for (const object of cluster.clonedMeshes) {
          this.visualizer.clusterGroup.remove(object);
          
          // If it's a Group, dispose all meshes inside
          if (object instanceof THREE.Group) {
            object.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material instanceof THREE.Material) {
                  materialsToDispose.add(child.material);
                }
              }
            });
          }
          // If it's a direct Mesh
          else if (object instanceof THREE.Mesh) {
            if (object.geometry) object.geometry.dispose();
            if (object.material instanceof THREE.Material) {
              materialsToDispose.add(object.material);
            }
          }
        }
        cluster.clonedMeshes = [];
        
        // Remove label sprite
        if (cluster.label) {
          this.visualizer.clusterGroup.remove(cluster.label);
          if (cluster.label.material.map) {
            cluster.label.material.map.dispose();
          }
          cluster.label.material.dispose();
          cluster.label = null;
        }
      }
    }
    
    // Dispose shared materials once
    for (const material of materialsToDispose) {
      material.dispose();
    }
    
    console.log('✅ Original model restored');
  }

  /**
   * Visualize all clusters with bounding boxes
   * @param hideAllModels If true, hides ALL loaded models (for filtered clusters)
   */
  async visualizeClusters(hideAllModels: boolean = false): Promise<void> {
    console.log('🎨 Visualizing clusters...');

    // Prepare for animation (start small)
    this.visualizer.clusterGroup.scale.set(0.01, 0.01, 0.01);

    // Move geometry to cluster positions (this also calculates positions)
    await this.moveToClusterPositions(hideAllModels);

    // Create visual helpers
    const colors = this.generateColors(this.getTotalClusterCount());
    let colorIndex = 0;

    for (const clusters of this.clusters.values()) {
      for (const cluster of clusters) {
        if (!cluster.clusterPosition) continue;
        
        const color = colors[colorIndex % colors.length];
        const visual = this.visualizer.createClusterVisual(cluster, color);
        cluster.visualHelper = visual;

        // Position visual at cluster position
        visual.position.copy(cluster.clusterPosition);

        colorIndex++;
      }
    }

    // Animate clusters entering
    this.visualizer.toggleVisibility(true); // Ensure visible
    this.visualizer.animateEntry();

    // Update WebGPU if active and enabled
    if (this.webgpu?.isEnabled()) {
      console.log('🎮 ClusterManager: Passing cluster group to WebGPU:', this.visualizer.clusterGroup.children.length, 'children');
      this.webgpu.setClusterGroup(this.visualizer.clusterGroup);
      this.webgpu.setModelsVisible(false);
    }

    console.log('✅ Cluster visualization complete');
  }

  /**
   * Clear all cluster visualizations and restore original positions
   */
  async clearClusters(): Promise<void> {
    console.log('🧹 Clearing clusters...');
    
    return new Promise<void>((resolve) => {
      // Animate clusters exiting
      this.visualizer.animateExit(400, async () => {
        // Restore original positions
        await this.restoreOriginalPositions();

        // Clear visuals
        this.visualizer.clearVisuals();

        // Clear cluster data
        for (const clusters of this.clusters.values()) {
          for (const cluster of clusters) {
            cluster.visualHelper = null;
            cluster.clusterPosition = null;
          }
        }
        this.clusters.clear(); // Actually clear the map

        // Update WebGPU if active and enabled
        if (this.webgpu?.isEnabled()) {
          this.webgpu.setClusterGroup(null);
          this.webgpu.setModelsVisible(true);
        }

        console.log('✅ Clusters cleared');
        resolve();
      });
    });
  }

  /**
   * Clear clusters instantly without animation (for switching contexts)
   */
  async clearClustersInstant(): Promise<void> {
    console.log('🧹 Clearing clusters instantly...');
    
    // Cancel any pending hide animation to prevent race condition
    this.cancelPendingAnimations();
    
    // Restore original positions
    await this.restoreOriginalPositions();

    // Clear visuals
    this.visualizer.clearVisuals();

    // Clear cluster data
    for (const clusters of this.clusters.values()) {
      for (const cluster of clusters) {
        cluster.visualHelper = null;
        cluster.clusterPosition = null;
      }
    }
    this.clusters.clear();
    
    console.log('✅ Clusters cleared instantly');
  }

  /**
   * Check if clusters have been generated
   */
  areClustersGenerated(): boolean {
    return this.clusters.size > 0;
  }

  /**
   * Hide clusters without destroying them (fast toggle)
   * Returns a Promise that resolves when the animation is complete
   */
  hideClusters(): Promise<void> {
    console.log('🙈 Hiding clusters...');
    this.animationCancelled = false;
    
    return new Promise<void>((resolve) => {
      this.visualizer.animateExit(400, () => {
        // Check if animation was cancelled (e.g., by clearClustersInstant)
        if (this.animationCancelled) {
          console.log('🙈 Hide animation cancelled');
          resolve();
          return;
        }
        
        this.visualizer.toggleVisibility(false);
        this.visualizer.restoreAllModels();
        
        // Update WebGPU if active and enabled
        if (this.webgpu?.isEnabled()) {
          this.webgpu.setClusterGroup(null);
          this.webgpu.setModelsVisible(true);
        }
        resolve();
      });
    });
  }

  /**
   * Cancel any pending hide animation
   */
  cancelPendingAnimations(): void {
    this.animationCancelled = true;
  }

  /**
   * Show existing clusters (fast toggle)
   * @param hideAllModels If true, hides ALL loaded models
   */
  showClusters(hideAllModels: boolean = false): void {
    console.log('👁️ Showing existing clusters...');
    
    // Hide models
    if (hideAllModels) {
      for (const [, model] of this.fragmentsManager.list) {
        this.visualizer.hideModel(model);
      }
    } else {
      for (const [modelId, clusters] of this.clusters) {
        const model = this.fragmentsManager.list.get(modelId);
        if (model) {
          this.visualizer.hideModel(model);
        }
      }
    }

    this.visualizer.toggleVisibility(true);
    this.visualizer.animateEntry();
    
    // Update WebGPU if active and enabled
    if (this.webgpu?.isEnabled()) {
      this.webgpu.setClusterGroup(this.visualizer.clusterGroup);
      this.webgpu.setModelsVisible(false);
    }
  }

  /**
   * Generate distinct colors for clusters
   */
  private generateColors(count: number): THREE.Color[] {
    const colors: THREE.Color[] = [];
    const goldenRatioConjugate = 0.618033988749895;
    let hue = Math.random();

    for (let i = 0; i < count; i++) {
      hue += goldenRatioConjugate;
      hue %= 1;
      colors.push(new THREE.Color().setHSL(hue, 0.7, 0.6));
    }

    return colors;
  }

  /**
   * Get total number of clusters across all models
   */
  getTotalClusterCount(): number {
    let total = 0;
    for (const clusters of this.clusters.values()) {
      total += clusters.length;
    }
    return total;
  }

  /**
   * Get all clusters
   */
  getAllClusters(): Map<string, IFCCluster[]> {
    return this.clusters;
  }

  /**
   * Get the visualizer (for accessing cluster scene)
   */
  getVisualizer(): ClusterVisualizer {
    return this.visualizer;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.visualizer.dispose();
    this.clusters.clear();
  }
}

// ==================================================================================
// 4. MAIN CLUSTER MODULE (PUBLIC API)
// ==================================================================================
/**
 * Main cluster module that provides the public API for IFC element clustering.
 * Similar to other modules in the OBC-IFCViewer architecture.
 */
export class ClusterModule {
  private worldManager: WorldManager;
  private components: OBC.Components;
  private world: OBC.World;
  private clusterManager: ClusterManager | null = null;
  private isActive: boolean = false;
  private modelTransform: ModelTransformModule | null = null;
  private clipperModule: ClipperModule | null = null;
  private clipperWasEnabled: boolean = false; // Track if clipper was enabled before cluster mode
  private webgpu: WebGPURendererModule | null = null;

  // Callbacks for loading state
  public onLoadingStart: (() => void) | null = null;
  public onLoadingEnd: (() => void) | null = null;

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
    this.world = worldManager.world!;
  }

  /**
   * Set WebGPU renderer module reference
   */
  public setWebGPURenderer(webgpu: WebGPURendererModule): void {
    this.webgpu = webgpu;
    // Also pass to ClusterManager
    if (this.clusterManager) {
      this.clusterManager.setWebGPURenderer(webgpu);
    }
  }

  /**
   * Set the model transform module reference
   */
  public setModelTransform(modelTransform: ModelTransformModule): void {
    this.modelTransform = modelTransform;
  }

  /**
   * Set the clipper module reference (to disable sectioning in cluster mode)
   */
  public setClipperModule(clipperModule: ClipperModule): void {
    this.clipperModule = clipperModule;
  }

  /**
   * Set custom colors for categories (from ColorSplashModule)
   * @param categoryColors Map of category name -> THREE.Color
   */
  public setCustomColors(categoryColors: Map<string, THREE.Color>): void {
    if (this.clusterManager) {
      this.clusterManager.setColorOverrides(categoryColors);
    }
  }

  /**
   * Initialize the cluster module
   */
  async initialize(): Promise<void> {
    const scene = this.world.scene.three as THREE.Scene;
    this.clusterManager = new ClusterManager(this.components, scene);
    
    // Pass WebGPU reference if already set
    if (this.webgpu && this.clusterManager) {
      this.clusterManager.setWebGPURenderer(this.webgpu);
    }
    
    console.log('✅ ClusterModule initialized');
  }

  /**
   * Fit camera to view all clusters
   */
  private async fitToClusters(): Promise<void> {
    if (!this.clusterManager || !this.world.camera.controls) return;
    
    const clusterGroup = this.clusterManager.getVisualizer().clusterGroup;
    if (clusterGroup.children.length === 0) return;
    
    // Temporarily reset scale to 1 to get correct bounding box
    // (Animation might have set it to ~0.01)
    const currentScale = clusterGroup.scale.clone();
    clusterGroup.scale.set(1, 1, 1);
    clusterGroup.updateMatrixWorld(true);
    
    const box = new THREE.Box3().setFromObject(clusterGroup);
    
    // Restore scale so animation continues smoothly
    clusterGroup.scale.copy(currentScale);
    clusterGroup.updateMatrixWorld(true);
    
    if (box.isEmpty()) return;
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.5; // Increased zoom factor for better overview
    
    const cameraPos = new THREE.Vector3(
      center.x + distance * 0.7,
      center.y + distance * 0.5,
      center.z + distance * 0.7
    );

    await this.world.camera.controls.setLookAt(
      cameraPos.x, cameraPos.y, cameraPos.z,
      center.x, center.y, center.z,
      true // animate
    );
  }

  /**
   * Toggle cluster view on/off
   */
  async toggleClusters(): Promise<void> {
    if (!this.clusterManager) {
      console.error('❌ ClusterManager not initialized');
      return;
    }

    if (this.isActive) {
      // Turn off clustering - hide instead of clear for performance
      this.clusterManager.hideClusters();
      this.isActive = false;
      console.log('✅ Cluster view disabled (hidden)');
      
      // Re-enable sectioning if it was enabled before cluster mode
      if (this.clipperModule && this.clipperWasEnabled) {
        this.clipperModule.setEnabled(true);
        console.log('✂️ Sectioning re-enabled after cluster mode');
      }
      
      // Fit camera to view all models after exiting cluster view
      if (this.modelTransform) {
        console.log('📷 Fitting camera to models...');
        await this.modelTransform.fitCameraToModels();
      }
    } else {
      // Disable sectioning while in cluster mode (it doesn't work properly with clusters)
      if (this.clipperModule) {
        this.clipperWasEnabled = this.clipperModule.getEnabled();
        if (this.clipperWasEnabled) {
          this.clipperModule.setEnabled(false);
          console.log('✂️ Sectioning temporarily disabled for cluster mode');
        }
      }
      
      if (this.onLoadingStart) this.onLoadingStart();
      
      // Small delay to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Turn on clustering
      if (this.clusterManager.areClustersGenerated()) {
        // Fast path: just show existing clusters
        this.clusterManager.showClusters(false);
      } else {
        // Slow path: generate for the first time
        await this.clusterManager.generateClusters();
        
        if (this.clusterManager.getTotalClusterCount() === 0) {
          console.warn('⚠️ No clusters generated. Make sure models are loaded.');
          if (this.onLoadingEnd) this.onLoadingEnd();
          return;
        }

        await this.clusterManager.visualizeClusters();
      }
      
      this.isActive = true;
      
      // Fit camera to clusters
      await this.fitToClusters();
      
      console.log('✅ Cluster view enabled');
      
      if (this.onLoadingEnd) this.onLoadingEnd();
    }
  }

  /**
   * Show clusters for specific filtered elements (e.g., one or more IFC types)
   * @param filteredElementsByCategory Map of categoryName -> Map of modelId -> Set of localIds
   * @param categoryName Name(s) of the category for labeling
   */
  async showFilteredClusters(filteredElementsByCategory: Map<string, { [key: string]: Set<number> }>, categoryName: string): Promise<void> {
    if (!this.clusterManager) {
      console.error('❌ ClusterManager not initialized');
      return;
    }

    // Disable sectioning while in cluster mode (if not already in cluster mode)
    if (!this.isActive && this.clipperModule) {
      this.clipperWasEnabled = this.clipperModule.getEnabled();
      if (this.clipperWasEnabled) {
        this.clipperModule.setEnabled(false);
        console.log('✂️ Sectioning temporarily disabled for cluster mode');
      }
    }

    if (this.onLoadingStart) this.onLoadingStart();
    
    // Small delay to allow UI to update
    await new Promise(resolve => setTimeout(resolve, 100));

    // Always clear existing clusters when showing a specific filtered view
    // If we are active, we animate out. If not (hidden), we clear instantly.
    if (this.isActive) {
      await this.clusterManager.clearClusters();
    } else if (this.clusterManager.areClustersGenerated()) {
      await this.clusterManager.clearClustersInstant();
    }

    console.log(`🎯 Showing clusters for ${categoryName}...`);

    // Generate clusters for the filtered elements
    await this.clusterManager.generateFilteredClusters(filteredElementsByCategory, categoryName);
    
    const totalClusters = this.clusterManager.getTotalClusterCount();
    if (totalClusters === 0) {
      console.warn(`⚠️ No clusters generated for ${categoryName}.`);
      alert(`Cannot visualize ${categoryName}\n\nThe ${categoryName} elements in this model cannot be visualized in cluster view due to geometry data limitations in the IFC file.\n\nYou can still view the property table for these ${filteredElementsByCategory.get(categoryName)?.expressIDs?.size || 0} elements.`);
      if (this.onLoadingEnd) this.onLoadingEnd();
      return;
    }

    // Pass hideAllModels=true to hide all models (not just the filtered one)
    await this.clusterManager.visualizeClusters(true);
    this.isActive = true;
    
    // Fit camera to clusters
    await this.fitToClusters();
    
    console.log(`✅ Cluster view enabled for ${categoryName}`);
    
    if (this.onLoadingEnd) this.onLoadingEnd();
  }

  /**
   * Exit cluster mode and restore the color view (not just toggle)
   */
  async exitToColorView(): Promise<void> {
    if (!this.clusterManager) {
      console.error('❌ ClusterManager not initialized');
      return;
    }

    if (this.isActive) {
      // Hide clusters instead of clearing to allow fast re-entry
      // Await the animation to complete before proceeding
      await this.clusterManager.hideClusters();
      this.isActive = false;
      
      // Re-enable sectioning if it was enabled before cluster mode
      if (this.clipperModule && this.clipperWasEnabled) {
        this.clipperModule.setEnabled(true);
        console.log('✂️ Sectioning re-enabled after cluster mode');
      }
      
      // Fit camera to view all models
      if (this.modelTransform) {
        await this.modelTransform.fitCameraToModels();
      }
      
      console.log('✅ Exited cluster view, restored color view');
    }
  }

  /**
   * Check if clustering is currently active
   */
  isClusteringActive(): boolean {
    return this.isActive;
  }

  /**
   * Check if a mesh is a cluster mesh
   */
  isClusterMesh(mesh: THREE.Object3D): boolean {
    return mesh.userData?.isClusterMesh === true;
  }

  /**
   * Get cluster mesh data (modelId and expressID)
   */
  getClusterMeshData(mesh: THREE.Object3D): { modelId: string; expressID: number; category: string } | null {
    if (!this.isClusterMesh(mesh)) return null;
    return {
      modelId: mesh.userData.modelId,
      expressID: mesh.userData.expressID,
      category: mesh.userData.category
    };
  }

  /**
   * Get the cluster manager (for advanced usage)
   */
  getClusterManager(): ClusterManager | null {
    return this.clusterManager;
  }

  /**
   * Get the cluster scene group for filtering
   */
  getClusterScene(): THREE.Group | null {
    const scene = this.clusterManager?.getVisualizer()?.clusterGroup || null;
    console.log('📊 ClusterModule.getClusterScene():', !!scene, scene?.name, 'children:', scene?.children.length);
    return scene;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.clusterManager) {
      this.clusterManager.dispose();
      this.clusterManager = null;
    }
    this.isActive = false;
  }
}
