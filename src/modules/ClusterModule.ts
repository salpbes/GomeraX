/**
 * ==================================================================================
 * IFC ELEMENT TYPE CLUSTERING FOR OPEN BIM COMPONENTS (OBC)
 * ==================================================================================
 * 
 * WHAT WE'RE TRYING TO DO:
 * ------------------------
 * We want to group (cluster) IFC elements by their IFC types (e.g., all IfcWall objects
 * together, all IfcDoor objects together, etc.) and visualize these clusters with 
 * bounding boxes in a 3D viewer. This is similar to Autodesk Tandem's 3D cluster feature.
 * 
 * WHAT WE FOUND IN OBC DOCUMENTATION:
 * -----------------------------------
 * 1. OBC uses a worker-based architecture where most data operations happen in a 
 *    separate thread for performance.
 * 
 * 2. Models are stored in a Map accessed via: fragmentsManager.list
 *    - Key: modelId (string)
 *    - Value: FragmentsModel instance
 * 
 * 3. FragmentsModel provides these key methods:
 *    - getAllItemsWithGeometry(): Returns array of local IDs for items with geometry
 *    - getItemsOfCategories(category): Returns items of a specific IFC category
 *    - getBoundingBoxes(itemIds): Returns bounding boxes for specified items
 *    - getMergedBoundingBox(itemIds): Returns single box encompassing all items
 *    - getCategories(): Returns all IFC categories in the model
 * 
 * 4. Items are referenced by "local IDs" (numbers) internally, not IFC express IDs
 * 
 * 5. IFC categories are uppercase strings like: 
 *    'IFCWALL', 'IFCDOOR', 'IFCWINDOW', 'IFCSLAB', 'IFCCOLUMN', etc.
 * 
 * KEY ARCHITECTURE DECISIONS:
 * ---------------------------
 * - We use a modular design with separate classes for cluster data, management, 
 *   and visualization
 * - Clustering is done per-model (each loaded IFC file is processed separately)
 * - All operations are async because OBC uses web workers
 * - Visualization uses Three.js primitives (boxes, edges) added to the scene
 * - Elements are temporarily moved to cluster positions and restored on toggle off
 * 
 * ==================================================================================
 */

import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { WorldManager } from './WorldManager';
import { ModelTransformModule } from './ModelTransformModule';

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
    const geometry = new THREE.BoxGeometry(
      box.max.x - box.min.x,
      box.max.y - box.min.y,
      box.max.z - box.min.z
    );

    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({ 
      color: color,
      linewidth: 2,
      transparent: true,
      opacity: 0.8
    });

    const lineSegments = new THREE.LineSegments(edges, material);
    
    // Position the box at the center of the bounding box
    const center = new THREE.Vector3();
    box.getCenter(center);
    lineSegments.position.copy(center);

    this.clusterGroup.add(lineSegments);
    return lineSegments;
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

  constructor(components: OBC.Components, scene: THREE.Scene) {
    this.components = components;
    this.fragmentsManager = components.get(OBC.FragmentsManager);
    this.visualizer = new ClusterVisualizer(scene);
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
        }
      }
      
      // Try getBoxes as fallback
      if (typeof model.getBoxes === 'function') {
        const boxes = await model.getBoxes(itemIds);
        if (boxes && boxes.length > 0) {
          const mergedBox = new THREE.Box3();
          for (const box of boxes) {
            mergedBox.union(box);
          }
          console.log(`  ✅ Merged ${boxes.length} bounding boxes from getBoxes`);
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
   */
  private calculateClusterPositions(clusters: IFCCluster[]): void {
    const gap = 20; // meters gap between cluster bounding boxes
    const itemsPerRow = Math.ceil(Math.sqrt(clusters.length));

    // Calculate positions row by row
    let currentZ = 0;
    
    for (let row = 0; row < Math.ceil(clusters.length / itemsPerRow); row++) {
      let currentX = 0;
      let maxHeightInRow = 0;
      
      // Process each cluster in this row
      for (let col = 0; col < itemsPerRow; col++) {
        const index = row * itemsPerRow + col;
        if (index >= clusters.length) break;
        
        const cluster = clusters[index];
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
    
    console.log(`  📐 Positioned ${clusters.length} clusters in grid layout with ${gap}m gaps`);
  }

  /**
   * Move fragments to their cluster positions
   * Uses OBC's getItemsGeometry to extract actual geometry for each cluster
   */
  private async moveToClusterPositions(): Promise<void> {
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
    for (const [, clusters] of this.clusters) {
      this.calculateClusterPositions(clusters);
    }
    
    // Third pass: Position cluster groups and add labels
    for (const [modelId, clusters] of this.clusters) {
      const model = this.fragmentsManager.list.get(modelId);
      if (!model) continue;

      for (const cluster of clusters) {
        if (!cluster.clusterPosition || cluster.clonedMeshes.length === 0) continue;
        
        // Find the cluster group that was created
        const clusterGroup = this.visualizer.clusterGroup.children.find(
          (child: any) => child.name === `Cluster_${cluster.category}`
        );
        
        if (clusterGroup) {
          // Position the group at the calculated cluster position
          clusterGroup.position.copy(cluster.clusterPosition);
          clusterGroup.updateMatrixWorld(true);
          
          // Add text label for this cluster at the cluster position
          this.addClusterLabel(cluster, cluster.clusterPosition);
        }
      }
      
      // Hide the original model completely
      this.visualizer.hideModel(model);
    }
    
    console.log('✅ Cluster views created with category filtering and labels');
  }

  /**
   * Create geometry for a single cluster
   */
  private async createClusterGeometry(model: any, cluster: IFCCluster): Promise<void> {
    const center = new THREE.Vector3();
    if (cluster.boundingBox) {
      cluster.boundingBox.getCenter(center);
    }
    
    console.log(`  📦 ${cluster.category}: ${cluster.itemIds.length} items`);

    // Create cluster group (initially at origin, will be positioned later)
    const clusterGroup = new THREE.Group();
    clusterGroup.name = `Cluster_${cluster.category}`;
    
    // Get the color for this category
    const categoryColor = this.getCategoryColor(cluster.category);
    
    // OPTIMIZATION: Create shared material for all meshes in this cluster
    const sharedMaterial = new THREE.MeshStandardMaterial({
      color: categoryColor,
      metalness: 0.1,
      roughness: 0.8,
      side: THREE.DoubleSide
    });
    
    // Determine if this is a horizontal element (slabs, roofs, footings)
    const isHorizontalElement = ['IFCSLAB', 'IFCROOF', 'IFCFOOTING', 'IFCRAMPFLIGHT'].includes(cluster.category);
    
    let totalMeshes = 0;
    let totalVertices = 0;
      
      // OPTIMIZATION: Batch fetch all geometries at once
      console.log(`  📦 Fetching geometry batch for ${cluster.itemIds.length} items...`);
      const batchStartTime = performance.now();
      const allGeometriesData = await model.getItemsGeometry(cluster.itemIds);
      console.log(`  ✅ Batch fetch completed in ${(performance.now() - batchStartTime).toFixed(0)}ms`);
      
      if (!allGeometriesData || allGeometriesData.length === 0) {
        console.warn(`  ⚠️ No geometry data returned for ${cluster.category}`);
        return;
      }
      
      // First pass: collect all item geometries with their sizes
      const itemGeometries: Array<{
        itemId: number;
        meshDataArray: any;
        size: THREE.Vector3;
        center: THREE.Vector3;
      }> = [];
      
      for (let idx = 0; idx < cluster.itemIds.length; idx++) {
        const itemId = cluster.itemIds[idx];
        const geometryDataArray = allGeometriesData[idx];
        
        try {
              if (!geometryDataArray || geometryDataArray.length === 0) continue;
              
              // Calculate bounding box for this item to determine its size
              let itemMin = new THREE.Vector3(Infinity, Infinity, Infinity);
              let itemMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
              
              // Handle both array and non-array responses
              const dataArrayToProcess = Array.isArray(geometryDataArray) ? geometryDataArray : [geometryDataArray];
              
              for (const meshDataGroup of dataArrayToProcess) {
                if (!meshDataGroup) continue;
                
                // meshDataGroup might be an array or a single object
                const meshDataList = Array.isArray(meshDataGroup) ? meshDataGroup : [meshDataGroup];
                
                for (const meshData of meshDataList) {
                  if (!meshData || !meshData.positions) continue;
                  
                  for (let i = 0; i < meshData.positions.length; i += 3) {
                    itemMin.x = Math.min(itemMin.x, meshData.positions[i]);
                    itemMin.y = Math.min(itemMin.y, meshData.positions[i + 1]);
                    itemMin.z = Math.min(itemMin.z, meshData.positions[i + 2]);
                    itemMax.x = Math.max(itemMax.x, meshData.positions[i]);
                    itemMax.y = Math.max(itemMax.y, meshData.positions[i + 1]);
                    itemMax.z = Math.max(itemMax.z, meshData.positions[i + 2]);
                  }
                }
              }
              
              const itemSize = new THREE.Vector3().subVectors(itemMax, itemMin);
              const itemCenter = new THREE.Vector3().addVectors(itemMin, itemMax).multiplyScalar(0.5);
              
              // For horizontal elements, swap Y and Z in size calculation after rotation
              if (isHorizontalElement) {
                const tempY = itemSize.y;
                itemSize.y = itemSize.z;
                itemSize.z = tempY;
              }
              
              itemGeometries.push({
                itemId,
                meshDataArray: geometryDataArray,
                size: itemSize,
                center: itemCenter
              });
        } catch (itemError) {
          console.warn(`  ⚠️ Error processing item ${itemId}:`, itemError);
        }
      }
      
      // Second pass: pack items in a grid with proper spacing
      const itemsPerRow = Math.ceil(Math.sqrt(itemGeometries.length));
      const padding = 2; // meters padding between items
      
      // Calculate row heights and column widths
      const rowHeights: number[] = [];
      const colWidths: number[] = [];
      
      for (let row = 0; row < Math.ceil(itemGeometries.length / itemsPerRow); row++) {
        let maxHeight = 0;
        for (let col = 0; col < itemsPerRow; col++) {
          const idx = row * itemsPerRow + col;
          if (idx >= itemGeometries.length) break;
          maxHeight = Math.max(maxHeight, itemGeometries[idx].size.z);
          
          if (row === 0) {
            colWidths[col] = Math.max(colWidths[col] || 0, itemGeometries[idx].size.x);
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
      
      // Third pass: create meshes at calculated positions
      for (let idx = 0; idx < itemGeometries.length; idx++) {
        const itemData = itemGeometries[idx];
        const row = Math.floor(idx / itemsPerRow);
        const col = idx % itemsPerRow;
        
        // Calculate position (centered in grid)
        const offsetX = colPositions[col] + colWidths[col] / 2 - totalWidth / 2;
        const offsetZ = rowPositions[row] + rowHeights[row] / 2 - totalDepth / 2;
        
        // Process each mesh data in the array
        // Handle both array and non-array responses
        const dataArrayToProcess = Array.isArray(itemData.meshDataArray) ? itemData.meshDataArray : [itemData.meshDataArray];
        
        for (const meshDataGroup of dataArrayToProcess) {
          if (!meshDataGroup) continue;
          
          // meshDataGroup might be an array or a single object
          const meshDataList = Array.isArray(meshDataGroup) ? meshDataGroup : [meshDataGroup];
          
          for (const meshData of meshDataList) {
            if (!meshData || !meshData.positions || !meshData.indices) continue;
            
            // Create BufferGeometry from the extracted data
            const geometry = new THREE.BufferGeometry();
            
            // Clone the positions array so we can modify it
            const positions = new Float32Array(meshData.positions);
            const normals = meshData.normals ? new Float32Array(meshData.normals) : null;
            
            // For horizontal elements (slabs, roofs, footings), always rotate to lay flat
            const applyRotation = isHorizontalElement;
            
            // Translate vertices to be centered and positioned in grid
            for (let i = 0; i < positions.length; i += 3) {
              let x = positions[i] - itemData.center.x;
              let y = positions[i + 1] - itemData.center.y;
              let z = positions[i + 2] - itemData.center.z;
              
              // Apply rotation if needed (rotate 90 degrees around X axis to make horizontal)
              if (applyRotation) {
                const tempY = y;
                y = -z;  // Y becomes -Z
                z = tempY; // Z becomes Y
              }
              
              positions[i] = x + offsetX;     // X - center item, then offset in grid
              positions[i + 1] = y;            // Y - center item (with rotation if applied)
              positions[i + 2] = z + offsetZ; // Z - center item, then offset in grid (with rotation if applied)
            }
            
            // Also rotate normals if we rotated the positions
            if (applyRotation && normals) {
              for (let i = 0; i < normals.length; i += 3) {
                const nx = normals[i];
                const ny = normals[i + 1];
                const nz = normals[i + 2];
                
                // Rotate normals around X axis by 90 degrees
                normals[i] = nx;      // X unchanged
                normals[i + 1] = -nz; // Y becomes -Z
                normals[i + 2] = ny;  // Z becomes Y
              }
            }
            
            // Update position attribute with translated positions
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            
            // Set normal attribute (rotated if applicable)
            if (normals) {
              geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            } else if (meshData.normals) {
              geometry.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.normals, 3));
            }
            
            // Set index
            geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.indices, 1));
            
            // Compute normals if not provided
            if (!meshData.normals && !normals) {
              geometry.computeVertexNormals();
            }
            
            // OPTIMIZATION: Use shared material instead of creating new one per mesh
            // Create mesh at grid position
            const mesh = new THREE.Mesh(geometry, sharedMaterial);
            mesh.name = `${cluster.category}_Item_${itemData.itemId}_Mesh_${totalMeshes}`;
            
            // Store IFC data for selection and properties display
            mesh.userData.isClusterMesh = true;
            mesh.userData.modelId = cluster.modelId;
            mesh.userData.expressID = itemData.itemId;
            mesh.userData.category = cluster.category;
            
            clusterGroup.add(mesh);
            cluster.clonedMeshes.push(mesh);
            totalMeshes++;
            totalVertices += meshData.positions.length / 3;
          }
        }
      }
      
      console.log(`  ✅ Created ${totalMeshes} meshes from ${itemGeometries.length} items (${totalWidth.toFixed(1)}m x ${totalDepth.toFixed(1)}m grid) for ${cluster.category}`);
      
      // Update cluster bounding box to match the actual packed geometry size
      // Add some margin for the bounding box visualization
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
   */
  private getCategoryColor(category: string): number {
    const colors: { [key: string]: number } = {
      // Architectural
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
        // Remove cloned meshes
        for (const mesh of cluster.clonedMeshes) {
          this.visualizer.clusterGroup.remove(mesh);
          mesh.geometry.dispose();
          // Collect material for later disposal (shared among meshes)
          if (mesh.material instanceof THREE.Material) {
            materialsToDispose.add(mesh.material);
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
   */
  async visualizeClusters(): Promise<void> {
    console.log('🎨 Visualizing clusters...');
    
    // Calculate cluster positions
    for (const clusters of this.clusters.values()) {
      this.calculateClusterPositions(clusters);
    }

    // Move geometry to cluster positions
    await this.moveToClusterPositions();

    // Create visual helpers
    const colors = this.generateColors(this.getTotalClusterCount());
    let colorIndex = 0;

    for (const clusters of this.clusters.values()) {
      for (const cluster of clusters) {
        const color = colors[colorIndex % colors.length];
        const visual = this.visualizer.createClusterVisual(cluster, color);
        cluster.visualHelper = visual;

        // Update visual position to cluster position
        if (cluster.clusterPosition) {
          visual.position.copy(cluster.clusterPosition);
        }

        colorIndex++;
      }
    }

    console.log('✅ Cluster visualization complete');
  }

  /**
   * Clear all cluster visualizations and restore original positions
   */
  async clearClusters(): Promise<void> {
    console.log('🧹 Clearing clusters...');
    
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

    console.log('✅ Clusters cleared');
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

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
    this.world = worldManager.world!;
  }

  /**
   * Set the model transform module reference
   */
  public setModelTransform(modelTransform: ModelTransformModule): void {
    this.modelTransform = modelTransform;
  }

  /**
   * Initialize the cluster module
   */
  async initialize(): Promise<void> {
    const scene = this.world.scene.three as THREE.Scene;
    this.clusterManager = new ClusterManager(this.components, scene);
    console.log('✅ ClusterModule initialized');
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
      // Turn off clustering - restore original view
      await this.clusterManager.clearClusters();
      this.isActive = false;
      console.log('✅ Cluster view disabled');
      
      // Fit camera to view all models after exiting cluster view
      if (this.modelTransform) {
        console.log('📷 Fitting camera to models...');
        await this.modelTransform.fitCameraToModels();
      }
    } else {
      // Turn on clustering - generate and visualize
      await this.clusterManager.generateClusters();
      
      if (this.clusterManager.getTotalClusterCount() === 0) {
        console.warn('⚠️ No clusters generated. Make sure models are loaded.');
        return;
      }

      await this.clusterManager.visualizeClusters();
      this.isActive = true;
      console.log('✅ Cluster view enabled');
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
