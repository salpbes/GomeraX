/**
 * Properties Panel Module
 * 
 * Provides:
 * - Simple model tree view
 * - Entity selection via click
 * - Basic properties display
 * - Visual highlighting
 * 
 * Uses Three.js raycasting for object picking and displays
 * basic geometry/material information for selected objects.
 */

import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as FRAGS from '@thatopen/fragments';
import * as THREE from 'three';
import { WorldManager } from './WorldManager';
import { IFCLoaderModule } from './IFCLoaderModule';
import { ClusterModule } from './ClusterModule';

export class PropertiesPanelModule {
  private components: OBC.Components;
  private world: OBC.World | null = null;
  private fragmentsManager: OBC.FragmentsManager | null = null;
  private highlighter: OBCF.Highlighter | null = null;
  private raycasters: OBC.Raycasters | null = null;
  private mouse: THREE.Vector2;
  private selectedObject: any = null;
  private propertiesElement: HTMLDivElement | null = null;
  private treeContainer: HTMLDivElement | null = null;
  private modelLoadListener: any = null;
  private treeExpandTab: HTMLDivElement | null = null;
  private propsExpandTab: HTMLDivElement | null = null;
  private clusterModule: ClusterModule | null = null;
  private worldManager: WorldManager;
  
  // Store storey data for dashboard
  public storeyData: { [storeyName: string]: { [category: string]: number } } = {};

  constructor(worldManager: WorldManager, private ifcLoader: IFCLoaderModule) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
    this.mouse = new THREE.Vector2();
  }

  /**
   * Set the cluster module reference
   */
  public setClusterModule(clusterModule: ClusterModule): void {
    this.clusterModule = clusterModule;
  }

  /**
   * Initializes the properties panel
   */
  public async initialize(world: OBC.World): Promise<void> {
    this.world = world;
    this.fragmentsManager = this.components.get(OBC.FragmentsManager);
    
    // Get the raycasters component for this world
    this.raycasters = this.components.get(OBC.Raycasters);
    
    // Listen for new models being added
    this.modelLoadListener = this.fragmentsManager.list.onItemSet.add((data) => {
      console.log('📦 Model loaded, updating tree...');
      
      // For far-origin models, wait longer to ensure geometry is ready
      // Check geometry after a delay, not immediately
      setTimeout(() => {
        const model = data?.value;
        const hasGeometry = model && model.object && model.object.children && model.object.children.length > 0;
        if (hasGeometry) {
          console.log('✅ Model has geometry, building tree...');
          this.buildTree();
        } else {
          console.log('⏭️ Skipping tree build - model has no geometry yet (likely far-origin retry in progress)');
        }
      }, 500);
      
      // Second attempt for complex/large models
      setTimeout(() => {
        const model = data?.value;
        const hasGeometry = model && model.object && model.object.children && model.object.children.length > 0;
        if (hasGeometry) {
          this.buildTree();
        }
      }, 2500);
    });
    
    // Setup Highlighter
    try {
      this.highlighter = this.components.get(OBCF.Highlighter);
      await this.highlighter.setup({ world });
      
      // Add translucent style for context
      this.highlighter.styles.set('translucent', {
        color: new THREE.Color(0xcccccc),
        transparent: true,
        opacity: 0.2,
        depthTest: true,
        renderedFaces: FRAGS.RenderedFaces.TWO
      });
    } catch (error) {
      console.warn('Highlighter not available');
    }

    this.setupSelection();
    console.log('✅ Properties panel initialized');
  }

  /**
   * Sets up click selection
   */
  private setupSelection(): void {
    if (!this.world) return;

    const container = this.world.renderer?.three.domElement;
    if (!container) return;

    // Middle mouse double click to fit view
    let lastMiddleClickTime = 0;
    container.addEventListener('mousedown', async (event) => {
      if (event.button === 1) { // Middle mouse button
        const currentTime = new Date().getTime();
        const timeDiff = currentTime - lastMiddleClickTime;
        
        if (timeDiff < 300) { // Double click detected (300ms threshold)
          console.log('🖱️ Middle mouse double click - Fitting to view');
          
          if (this.world?.camera?.controls && this.fragmentsManager) {
            // Get all models to calculate bounding box
            const bbox = new THREE.Box3();
            let hasModels = false;
            
            // Iterate over all models
            for (const model of this.fragmentsManager.list.values()) {
               if (model) {
                 try {
                   // @ts-ignore
                   const modelBox = await model.getMergedBox();
                   if (modelBox && !modelBox.isEmpty()) {
                     bbox.union(modelBox);
                     hasModels = true;
                   }
                 } catch (e) {
                   console.warn('Could not get model box', e);
                 }
               }
            }
            
            if (hasModels && !bbox.isEmpty()) {
               await this.world.camera.controls.fitToBox(bbox, true);
            }
          }
        }
        
        lastMiddleClickTime = currentTime;
      }
    });

    container.addEventListener('click', async (event) => {
      // Don't process clicks in floor plan mode to allow camera controls
      if ((window as any).isFloorPlanMode) {
        console.log('🚫 Click ignored - floor plan mode active');
        return;
      }
      
      // Check if we're in first-person mode with pointer locked
      // In that case, skip selection on click (use crosshair selection instead)
      const viewer = (window as any).viewer;
      const fpControls = viewer?.getFirstPersonControls?.();
      const isFirstPersonPointerLocked = fpControls?.isActive?.() && fpControls?.isPointerLockedMode?.();
      
      if (isFirstPersonPointerLocked) {
        // In first-person mode with pointer locked, we'll handle selection via center-screen raycast
        // This click is likely just the user pressing a button, not trying to select
        console.log('🎯 First-person mode - using crosshair selection');
        await this.performCenterScreenSelection();
        return;
      }
      
      console.log('🖱️ Click detected');
      
      // Clear previous selection first
      if (this.selectedObject && this.selectedObject.userData?.isClusterMesh && this.selectedObject instanceof THREE.Mesh) {
        if (this.selectedObject.userData.originalMaterial) {
          this.selectedObject.material = this.selectedObject.userData.originalMaterial;
        }
      }
      
      // First check if we clicked on a cluster mesh
      if (this.clusterModule && this.clusterModule.isClusteringActive()) {
        const clusterMeshHit = await this.checkClusterMeshClick(event);
        if (clusterMeshHit) {
          console.log('✅ Cluster mesh hit found:', clusterMeshHit);
          const { modelId, expressID, mesh, category } = clusterMeshHit;
          
          this.selectedObject = mesh;
          
          // Get and display IFC properties for the cluster item
          console.log(`🏗️ Getting IFC data for clustered item: model=${modelId}, expressID=${expressID}, category=${category}`);
          await this.showIfcProperties(modelId, expressID, mesh);
          
          // Highlight the object
          this.highlightObject(mesh, modelId, expressID);
          return;
        }
      }
      
      // Otherwise, use normal IFC raycasting
      const intersection = await this.castRay(event);
      
      if (intersection) {
        console.log('✅ Hit found:', intersection);
        const { modelId, localId, object } = intersection;
        
        this.selectedObject = object;
        
        // Get and display IFC properties
        console.log(`🏗️ Getting IFC data for model: ${modelId}, localId: ${localId}`);
        await this.showIfcProperties(modelId, localId, object);
        
        // Highlight the object with modelId and localId
        this.highlightObject(object, modelId, localId);
      } else {
        console.log('❌ No object found at click position');
        this.clearSelection();
      }
    });
  }

  /**
   * Perform selection using center-screen raycast (for first-person mode)
   * This allows selection in walking mode by aiming the crosshair at an object and clicking
   */
  private async performCenterScreenSelection(): Promise<void> {
    if (!this.world?.renderer?.three.domElement || !this.world.camera || !this.fragmentsManager) {
      return;
    }

    console.log('🎯 Performing center-screen selection for first-person mode');

    // Clear previous selection first
    if (this.selectedObject && this.selectedObject.userData?.isClusterMesh && this.selectedObject instanceof THREE.Mesh) {
      if (this.selectedObject.userData.originalMaterial) {
        this.selectedObject.material = this.selectedObject.userData.originalMaterial;
      }
    }

    const container = this.world.renderer.three.domElement;
    const rect = container.getBoundingClientRect();
    
    // Use center of screen for raycast
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Create a synthetic mouse event at screen center
    const syntheticEvent = {
      clientX: centerX,
      clientY: centerY
    } as MouseEvent;

    // First check for cluster meshes at center
    if (this.clusterModule && this.clusterModule.isClusteringActive()) {
      const clusterMeshHit = await this.checkClusterMeshClick(syntheticEvent);
      if (clusterMeshHit) {
        console.log('✅ Center-screen cluster mesh hit:', clusterMeshHit);
        const { modelId, expressID, mesh, category } = clusterMeshHit;
        
        this.selectedObject = mesh;
        await this.showIfcProperties(modelId, expressID, mesh);
        this.highlightObject(mesh, modelId, expressID);
        return;
      }
    }

    // Otherwise, use normal IFC raycasting at center
    const intersection = await this.castRay(syntheticEvent);
    
    if (intersection) {
      console.log('✅ Center-screen hit found:', intersection);
      const { modelId, localId, object } = intersection;
      
      this.selectedObject = object;
      await this.showIfcProperties(modelId, localId, object);
      this.highlightObject(object, modelId, localId);
    } else {
      console.log('❌ No object at center of screen');
      this.clearSelection();
    }
  }

  /**
   * Check if click intersects with a cluster mesh using THREE.js raycasting
   */
  private async checkClusterMeshClick(event: MouseEvent): Promise<{ modelId: string; expressID: number; mesh: THREE.Mesh; category: string } | null> {
    if (!this.world?.renderer?.three.domElement || !this.world.camera) {
      return null;
    }

    const container = this.world.renderer.three.domElement;
    const rect = container.getBoundingClientRect();
    
    // Convert mouse position to normalized device coordinates (-1 to +1)
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Create raycaster
    const raycaster = new THREE.Raycaster();
    const camera = this.world.camera.three;
    raycaster.setFromCamera(mouse, camera);

    // Get all cluster meshes from the scene
    const scene = this.world.scene.three;
    const allMeshes: THREE.Mesh[] = [];
    
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData?.isClusterMesh) {
        allMeshes.push(object);
      }
    });

    if (allMeshes.length === 0) {
      return null;
    }

    // Raycast against cluster meshes
    const intersects = raycaster.intersectObjects(allMeshes, false);
    
    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh;
      const meshData = this.clusterModule?.getClusterMeshData(mesh);
      
      if (meshData) {
        return {
          modelId: meshData.modelId,
          expressID: meshData.expressID,
          mesh: mesh,
          category: meshData.category
        };
      }
    }

    return null;
  }

  /**
   * Casts ray for mouse picking using OBC's model raycast
   * 
   * IMPORTANT CONCEPTS:
   * ===================
   * 
   * 1. RAYCASTING: Shoots an invisible ray from camera through mouse position
   *    - The ray continues until it hits 3D geometry
   *    - Returns information about what was hit (element ID, distance, point)
   *    - STOPS at first solid surface (can't pass through walls/roofs)
   * 
   * 2. CLIPPING PLANES INTEGRATION (v3.2.11+):
   *    - Fragment models now support `getClippingPlanesEvent` callback
   *    - This is set up in IFCLoaderModule when models are loaded
   *    - The Fragment raycaster uses these planes to filter results
   *    - Clipped geometry is automatically excluded from raycast results
   *    - Reference: https://docs.thatopen.com/Tutorials/Fragments/Fragments/FragmentsModels/BuildingConfigurator
   * 
   * 3. OBC FRAGMENT RAYCASTING:
   *    - FragmentsModel.raycast(): Returns FIRST visible hit (closest intersection)
   *    - FragmentsModel.raycastAll(): Returns ALL visible hits along the ray path
   *    - Works in Web Worker thread for performance
   *    - Uses optimized Fragment geometry (not raw THREE.js meshes)
   *    - Clipping planes are now respected via getClippingPlanesEvent
   * 
   * 4. BACKUP FILTERING:
   *    - We still keep manual clipping plane filtering as a backup
   *    - This handles edge cases where getClippingPlanesEvent might not work
   *    - isPointVisible() checks if a hit point is on the visible side of planes
   * 
   * CONNECTIONS TO OTHER CODE:
   * ==========================
   * - IFCLoaderModule: Sets up getClippingPlanesEvent on each model
   * - ClipperModule: Creates clipping planes (affects GPU rendering + raycasting)
   * - ClipStylerModule: Creates section fill meshes (visual only)
   * - isPointVisible(): Backup check if point is clipped
   * - Highlighter: Highlights selected element
   * - showIfcProperties(): Displays properties of selected element
   */
  private async castRay(event: MouseEvent): Promise<{ modelId: string; localId: number; object: THREE.Object3D } | null> {
    if (!this.world?.renderer?.three.domElement || !this.world.camera || !this.fragmentsManager) {
      return null;
    }

    const container = this.world.renderer.three.domElement;
    const mouse = new THREE.Vector2(event.clientX, event.clientY);

    console.log(`🎯 Raycasting with mouse position:`, { x: event.clientX, y: event.clientY });
    console.log(`📦 Available models:`, Array.from(this.fragmentsManager.list.keys()));

    // STEP 1: Check for active clipping planes
    // With getClippingPlanesEvent set up in IFCLoaderModule, Fragment raycasting
    // should now automatically filter out clipped geometry
    const clipper = this.components.get(OBC.Clipper);
    const hasActiveClipping = clipper && clipper.list.size > 0;
    
    if (hasActiveClipping) {
      console.log(`✂️ Active clipping planes detected: ${clipper.list.size}`);
      console.log(`   Fragment raycast should auto-filter via getClippingPlanesEvent`);
      console.log(`   Backup filtering also enabled for edge cases`);
    }

    // STEP 2: Collect all intersections from all models
    // We'll store: modelId, localId (IFC element ID), object, distance, point
    const allIntersections: Array<{ modelId: string; localId: number; object: THREE.Object3D; distance: number; point?: THREE.Vector3 }> = [];

    // STEP 3: Try raycasting on each Fragment model
    // Typically there's one model per loaded IFC file
    for (const [modelId, model] of this.fragmentsManager.list) {
      try {
        console.log(`🔍 Trying raycast on model: ${modelId}`);
        
        // STEP 3a: Use OBC Fragment raycast() - now with clipping plane awareness
        // 
        // With getClippingPlanesEvent configured (see IFCLoaderModule):
        // - Fragment raycaster knows about active clipping planes
        // - Results are automatically filtered to only return VISIBLE hits
        // - No need to manually filter afterwards (but we keep backup filtering)
        //
        // raycast() vs raycastAll():
        // - raycast(): Returns FIRST visible hit (optimized for most use cases)
        // - raycastAll(): Returns ALL visible hits (useful for special cases)
        // - Both now respect clipping planes via getClippingPlanesEvent
        //
        let results = null;
        if (typeof (model as any).raycastAll === 'function') {
          console.log('   Using OBC Fragment raycastAll() v3.2.11+');
          
          // Call raycastAll with camera, mouse position, and canvas
          results = await (model as any).raycastAll({
            camera: this.world.camera.three,   // THREE.js camera
            mouse: mouse,                       // Mouse position (Vector2)
            dom: container,                     // Canvas element
          });
          
          // Convert to array if single result returned
          if (results && !Array.isArray(results)) {
            results = [results];
          }
          
          console.log(`   ℹ️  raycastAll() returned ${results?.length || 0} result(s)`);
          if (results && results.length > 1) {
            console.log(`   ✅  Multiple results - raycastAll working correctly`);
          }
          if (results && results.length > 0) {
            results.forEach((r: any, idx: number) => {
              console.log(`     [${idx}] localId=${r.localId}, itemId=${r.itemId}, distance=${r.distance?.toFixed(2)}`);
              console.log(`          point: x=${r.point?.x.toFixed(2)}, y=${r.point?.y.toFixed(2)}, z=${r.point?.z.toFixed(2)}`);
            });
          }
        } else if (typeof (model as any).raycast === 'function') {
          // Fallback to regular raycast() if raycastAll() not available
          console.log('   Using OBC Fragment raycast() (raycastAll not available)');
          
          const result = await (model as any).raycast({
            camera: this.world.camera.three,
            mouse: mouse,
            dom: container,
          });
          
          // Convert single result to array format
          results = result ? [result] : [];
          
          console.log(`   ℹ️  OBC raycast() returned ${results.length} result(s)`);
          if (results.length > 0) {
            const r = results[0];
            console.log(`     localId=${r.localId}, itemId=${r.itemId}, distance=${r.distance?.toFixed(2)}`);
            console.log(`     point: x=${r.point?.x.toFixed(2)}, y=${r.point?.y.toFixed(2)}, z=${r.point?.z.toFixed(2)}`);
          }
        } else {
          // STEP 3b: Fallback to THREE.js raycaster (for very old OBC versions)
          // This shouldn't happen with OBC 3.2.11+, but kept for safety
          console.log('   Using THREE.js Raycaster (OBC raycast not available)');
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(mouse, this.world.camera.three);
          
          if (!model.object) {
            console.log(`   No object found in model ${modelId}`);
            continue;
          }
          
          // Raycast against all THREE.js objects in the model tree
          const intersects = raycaster.intersectObject(model.object, true);
          
          // Convert THREE.js intersections to OBC format
          results = intersects.map(intersect => ({
            localId: intersect.object.userData?.localId,
            object: intersect.object,
            distance: intersect.distance,
            point: intersect.point,
          })).filter(r => r.localId !== undefined);
        }

        // STEP 3c: Store all hits from this model
        if (results && Array.isArray(results) && results.length > 0) {
          console.log(`✅ Found ${results.length} hits in model ${modelId}`);
          
          // Add all results to our intersection list
          for (const result of results) {
            if (result && result.localId !== undefined) {
              console.log(`   Hit: localId=${result.localId}, distance=${result.distance?.toFixed(2)}, point=`, result.point);
              allIntersections.push({
                modelId,
                localId: result.localId,
                object: result.object || result,
                distance: result.distance || Infinity,
                point: result.point,
              });
            }
          }
        } else {
          console.log(`   No hits found in model ${modelId}`);
        }
      } catch (error) {
        console.warn(`⚠️ Raycast failed for model ${modelId}:`, error);
      }
    }

    // STEP 4: Display summary of ALL raycast hits
    if (allIntersections.length > 0) {
      console.log('\n📊 ALL RAYCAST HITS (sorted by distance):');
      console.table(allIntersections.map((hit, index) => ({
        '#': index + 1,
        'localId': hit.localId,
        'distance': hit.distance.toFixed(2),
        'point.x': hit.point?.x.toFixed(2),
        'point.y': hit.point?.y.toFixed(2),
        'point.z': hit.point?.z.toFixed(2),
      })));
    }

    // STEP 5: Backup filtering - check intersections against clipping planes
    // With getClippingPlanesEvent, Fragment raycasting should already filter results
    // This is kept as a backup for edge cases or older behavior
    const visibleIntersections = allIntersections.filter(intersection => {
      const isVisible = this.isPointVisible(intersection.point);  // Check against clipping planes
      if (!isVisible && intersection.point) {
        console.log(`❌ Backup filter removed: modelId=${intersection.modelId}, localId=${intersection.localId}, distance=${intersection.distance.toFixed(2)}`);
        console.log(`   Point was behind clipping plane (getClippingPlanesEvent may not have filtered this)`);
      }
      return isVisible;
    });

    // STEP 6: Display summary of VISIBLE hits after filtering
    if (visibleIntersections.length > 0 && visibleIntersections.length < allIntersections.length) {
      console.log('\n✅ VISIBLE HITS (after backup clipping plane filter):');
      console.table(visibleIntersections.map((hit, index) => ({
        '#': index + 1,
        'localId': hit.localId,
        'distance': hit.distance.toFixed(2),
        'point.x': hit.point?.x.toFixed(2),
        'point.y': hit.point?.y.toFixed(2),
        'point.z': hit.point?.z.toFixed(2),
      })));
    }

    // If we have visible intersections, return the closest one
    if (visibleIntersections.length > 0) {
      // Sort by distance (closest first)
      visibleIntersections.sort((a, b) => a.distance - b.distance);
      
      const closest = visibleIntersections[0];
      console.log(`🎯 Selected closest visible element: model=${closest.modelId}, distance=${closest.distance.toFixed(2)}`);
      console.log(`   (${visibleIntersections.length} visible hits from ${allIntersections.length} total)`);
      
      return {
        modelId: closest.modelId,
        localId: closest.localId,
        object: closest.object,
      };
    }

    if (allIntersections.length > 0) {
      console.log(`❌ Found ${allIntersections.length} intersections but all are on clipped side`);
      console.log(`ℹ️  NOTE: This shouldn't happen with getClippingPlanesEvent properly configured.`);
      console.log(`   Check that IFCLoaderModule sets model.getClippingPlanesEvent`);
      console.log(`   and that clipping planes are being returned correctly.`);
    } else {
      console.log('❌ No intersection found');
    }
    return null;
  }

  /**
   * Checks if a point is on the visible side of all active clipping planes
   * @param point - The point to check (intersection point from raycast)
   * @returns true if the point is visible (not clipped), false otherwise
   */
  private isPointVisible(point?: THREE.Vector3): boolean {
    if (!point) {
      console.log('⚠️ No point data available for visibility check');
      return true; // If no point data, assume visible
    }
    
    try {
      // Get the clipper component
      const clipper = this.components.get(OBC.Clipper);
      if (!clipper || clipper.list.size === 0) {
        // No clipping planes active, everything is visible
        console.log('✅ No clipping planes active, point is visible');
        return true;
      }

      console.log(`🔍 Checking point visibility: (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`);
      console.log(`   Active clipping planes: ${clipper.list.size}`);

      // Check the point against all active clipping planes
      let planeIndex = 0;
      for (const [, clippingPlane] of clipper.list) {
        planeIndex++;
        
        if (!clippingPlane.enabled) {
          console.log(`   Plane ${planeIndex}: DISABLED, skipping`);
          continue;
        }
        
        const plane = clippingPlane.three;
        if (!plane) {
          console.log(`   Plane ${planeIndex}: No THREE.Plane data, skipping`);
          continue;
        }

        // Calculate distance from point to plane
        // plane.normal is the direction the "visible" side points
        // plane.constant is the distance from origin along the normal
        const distance = plane.distanceToPoint(point);
        
        // Determine which axis this plane is on
        const absNormal = new THREE.Vector3(
          Math.abs(plane.normal.x),
          Math.abs(plane.normal.y),
          Math.abs(plane.normal.z)
        );
        let axis = 'unknown';
        if (absNormal.x > 0.9) axis = 'X';
        else if (absNormal.y > 0.9) axis = 'Y';
        else if (absNormal.z > 0.9) axis = 'Z';
        
        // Calculate plane position (point on the plane)
        const planePosition = plane.normal.clone().multiplyScalar(-plane.constant);
        
        console.log(`   Plane ${planeIndex} (${axis}-axis):`);
        console.log(`     Normal: (${plane.normal.x.toFixed(2)}, ${plane.normal.y.toFixed(2)}, ${plane.normal.z.toFixed(2)})`);
        console.log(`     Position: (${planePosition.x.toFixed(2)}, ${planePosition.y.toFixed(2)}, ${planePosition.z.toFixed(2)})`);
        console.log(`     Point: (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`);
        console.log(`     Distance: ${distance.toFixed(2)}`);
        
        // Standard THREE.js clipping logic:
        // - Plane normal points toward the VISIBLE side
        // - Points with distance < 0 are BEHIND the plane (clipped/removed)
        // - Points with distance >= 0 are IN FRONT of the plane (visible/kept)
        // Therefore: distance < 0 = clipped (reject), distance >= 0 = visible (accept)
        if (distance < 0) {
          console.log(`   ❌ REJECTED: Point is behind plane (distance < 0 = clipped)`);
          return false;
        } else {
          console.log(`   ✅ ACCEPTED: Point is in front of plane (distance >= 0 = visible)`);
        }
      }

      console.log(`✅ Point passed all clipping plane checks - VISIBLE`);
      return true;
    } catch (error) {
      console.warn('⚠️ Error checking clipping planes:', error);
      return true; // On error, assume visible
    }
  }

  /**
   * Highlights selected object
   */
  private highlightObject(object: THREE.Object3D, modelId?: string, localId?: number): void {
    if (!this.highlighter) return;

    try {
      this.highlighter.clear('select');
      
      // Check if this is a cluster mesh - highlight it directly
      if (object.userData?.isClusterMesh && object instanceof THREE.Mesh) {
        console.log(`🎨 Highlighting cluster mesh directly`);
        this.highlightClusterMesh(object);
        return;
      }
      
      // If modelId and localId are provided directly, use them
      if (modelId && localId !== undefined) {
        console.log(`🎨 Highlighting: modelId=${modelId}, localId=${localId}`);
        this.highlighter.highlightByID('select', { [modelId]: new Set([localId]) });
        return;
      }
      
      // Fallback: try to get from mesh fragment info
      const mesh = object as any;
      if (mesh.fragment && mesh.id !== undefined) {
        const fragmentID = mesh.fragment.id;
        const expressID = mesh.id;
        console.log(`🎨 Highlighting (fallback): modelId=${fragmentID}, localId=${expressID}`);
        this.highlighter.highlightByID('select', { [fragmentID]: new Set([expressID]) });
      }
    } catch (error) {
      console.warn('Could not highlight:', error);
    }
  }

  /**
   * Highlight a cluster mesh by changing its material
   */
  private highlightClusterMesh(mesh: THREE.Mesh): void {
    // Store original material if not already stored
    if (!mesh.userData.originalMaterial) {
      mesh.userData.originalMaterial = mesh.material;
    }
    
    // Create highlighted material
    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xb0e322, // Green highlight color
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.DoubleSide,
      emissive: 0xb0e322,
      emissiveIntensity: 0.3
    });
    
    mesh.material = highlightMaterial;
  }

  /**
   * Retrieves and displays IFC properties from the fragment model
   */
  private async showIfcProperties(modelId: string, localId: number, mesh: THREE.Object3D): Promise<void> {
    if (!this.propertiesElement || !this.fragmentsManager) {
      console.warn('⚠️ Properties element or fragments manager not available');
      this.showProperties(mesh); // Fallback
      return;
    }

    console.log(`📋 Fetching IFC data for model: ${modelId}, localId: ${localId}`);

    try {
      const model = this.fragmentsManager.list.get(modelId);
      if (!model) {
        console.warn('⚠️ Model not found in fragments list:', modelId);
        console.log('Available models:', Array.from(this.fragmentsManager.list.keys()));
        this.showProperties(mesh);
        return;
      }

      console.log('✅ Model found:', model);

      // Check if the model has getItemsData method
      if (typeof (model as any).getItemsData !== 'function') {
        console.warn('⚠️ Model does not have getItemsData method');
        console.log('Available methods:', Object.keys(model).filter(k => typeof (model as any)[k] === 'function'));
        this.showProperties(mesh);
        return;
      }

      // Get IFC data using OBC API
      const ifcDataArray = await (model as any).getItemsData([localId], {
        attributesDefault: true,
        relations: {
          IsDefinedBy: { attributes: true, relations: true },
          DefinesOcurrence: { attributes: false, relations: false },
        },
      });

      console.log('🏗️ IFC Data array retrieved:', ifcDataArray);

      if (!ifcDataArray || ifcDataArray.length === 0) {
        console.warn('⚠️ No IFC data found in response');
        this.showProperties(mesh);
        return;
      }

      const ifcData = ifcDataArray[0];
      console.log('🏗️ IFC Data item:', ifcData);

      // Display IFC properties
      this.displayIfcData(ifcData, mesh);
    } catch (error) {
      console.error('❌ Error fetching IFC data:', error);
      console.error('Error stack:', (error as Error).stack);
      this.showProperties(mesh); // Fallback to basic properties
    }
  }

  /**
   * Displays IFC data in the properties panel
   */
  private displayIfcData(ifcData: any, mesh: THREE.Object3D): void {
    if (!this.propertiesElement) return;

    let html = '<div class="property-groups">';

    // IFC Attributes Section
    html += '<div class="property-group">';
    html += '<div class="property-group-header">🏗️ IFC Information</div>';

    // Display all attributes
    for (const [key, value] of Object.entries(ifcData)) {
      if (key.startsWith('_') || Array.isArray(value)) continue; // Skip private fields and relations for now

      const attr = value as any;
      if (attr && typeof attr === 'object' && 'value' in attr && attr.value !== undefined && attr.value !== null) {
        html += `<div class="property-row">
          <span class="property-key">${key}:</span>
          <span class="property-value">${this.formatValue(attr.value)}</span>
        </div>`;
      }
    }

    html += '</div>';

    // Property Sets Section (IsDefinedBy relations)
    if (ifcData.IsDefinedBy && Array.isArray(ifcData.IsDefinedBy)) {
      html += '<div class="property-group">';
      html += '<div class="property-group-header">📐 Property Sets</div>';

      for (const pset of ifcData.IsDefinedBy) {
        const psetName = pset.Name?.value || 'Unknown PropertySet';
        html += `<div class="property-row" style="font-weight: 600; margin-top: 8px;">
          <span class="property-key">${psetName}</span>
        </div>`;

        if (pset.HasProperties && Array.isArray(pset.HasProperties)) {
          for (const prop of pset.HasProperties) {
            const propName = prop.Name?.value || 'Unknown';
            const propValue = prop.NominalValue?.value || 'N/A';
            html += `<div class="property-row" style="padding-left: 16px;">
              <span class="property-key">${propName}:</span>
              <span class="property-value">${this.formatValue(propValue)}</span>
            </div>`;
          }
        }
      }

      html += '</div>';
    }

    // Geometry Info (from THREE.js mesh)
    if (mesh instanceof THREE.Mesh && mesh.geometry) {
      html += '<div class="property-group">';
      html += '<div class="property-group-header">📦 Geometry</div>';

      const geometry = mesh.geometry;
      if (geometry.attributes.position) {
        html += `<div class="property-row">
          <span class="property-key">Vertices:</span>
          <span class="property-value">${geometry.attributes.position.count.toLocaleString()}</span>
        </div>`;
      }

      if (geometry.index) {
        html += `<div class="property-row">
          <span class="property-key">Faces:</span>
          <span class="property-value">${Math.floor(geometry.index.count / 3).toLocaleString()}</span>
        </div>`;
      }
      
      // Calculate bounding box
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox();
      }
      
      if (geometry.boundingBox) {
        const bbox = geometry.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        
        html += `<div class="property-row">
          <span class="property-key">BBox Size:</span>
          <span class="property-value">${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}</span>
        </div>`;
        
        html += `<div class="property-row">
          <span class="property-key">BBox Center:</span>
          <span class="property-value">${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}</span>
        </div>`;
      }

      html += '</div>';
    }

    // Transform
    html += '<div class="property-group">';
    html += '<div class="property-group-header">📍 Transform</div>';
    html += `<div class="property-row">
      <span class="property-key">Position:</span>
      <span class="property-value">${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)}</span>
    </div>`;
    
    // Rotation (in degrees)
    const rotX = THREE.MathUtils.radToDeg(mesh.rotation.x);
    const rotY = THREE.MathUtils.radToDeg(mesh.rotation.y);
    const rotZ = THREE.MathUtils.radToDeg(mesh.rotation.z);
    html += `<div class="property-row">
      <span class="property-key">Rotation (°):</span>
      <span class="property-value">${rotX.toFixed(1)}°, ${rotY.toFixed(1)}°, ${rotZ.toFixed(1)}°</span>
    </div>`;
    
    // Scale
    html += `<div class="property-row">
      <span class="property-key">Scale:</span>
      <span class="property-value">${mesh.scale.x.toFixed(2)}, ${mesh.scale.y.toFixed(2)}, ${mesh.scale.z.toFixed(2)}</span>
    </div>`;
    
    html += '</div>';

    html += '</div>';
    this.propertiesElement.innerHTML = html;

    console.log('✅ IFC properties displayed');
  }

  /**
   * Formats a value for display
   */
  private formatValue(value: any): string {
    if (typeof value === 'number') {
      return value.toFixed(2);
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'string') {
      return value.length > 50 ? value.substring(0, 50) + '...' : value;
    }
    return String(value);
  }

  /**
   * Shows properties for selected object
   */
  private showProperties(object: THREE.Object3D): void {
    if (!this.propertiesElement) {
      console.error('❌ Properties element not found!');
      return;
    }

    console.log('📋 Showing properties for:', object);
    console.log('📋 Object userData:', (object as any).userData);

    try {
      const mesh = object as any;
      
      let html = '<div class="property-groups">';
      
      // IFC Information Section (if available)
      const hasIfcData = mesh.userData && Object.keys(mesh.userData).length > 0;
      if (hasIfcData) {
        html += '<div class="property-group">';
        html += '<div class="property-group-header">🏗️ IFC Information</div>';
        
        // Check for common IFC properties
        if (mesh.userData.expressID !== undefined) {
          html += `<div class="property-row">
            <span class="property-key">Express ID:</span>
            <span class="property-value">${mesh.userData.expressID}</span>
          </div>`;
        }
        
        if (mesh.userData.type || mesh.userData.ifcType) {
          html += `<div class="property-row">
            <span class="property-key">IFC Type:</span>
            <span class="property-value">${mesh.userData.type || mesh.userData.ifcType}</span>
          </div>`;
        }
        
        if (mesh.userData.GlobalId) {
          html += `<div class="property-row">
            <span class="property-key">Global ID:</span>
            <span class="property-value small">${mesh.userData.GlobalId}</span>
          </div>`;
        }
        
        if (mesh.userData.Name) {
          html += `<div class="property-row">
            <span class="property-key">IFC Name:</span>
            <span class="property-value">${mesh.userData.Name}</span>
          </div>`;
        }
        
        if (mesh.userData.Description) {
          html += `<div class="property-row">
            <span class="property-key">Description:</span>
            <span class="property-value">${mesh.userData.Description}</span>
          </div>`;
        }
        
        html += '</div>';
      }
      
      // General Object Information
      html += '<div class="property-group">';
      html += '<div class="property-group-header">📦 Object Information</div>';
      
      html += `<div class="property-row">
        <span class="property-key">Type:</span>
        <span class="property-value">${object.type}</span>
      </div>`;
      
      if (object.name) {
        html += `<div class="property-row">
          <span class="property-key">Name:</span>
          <span class="property-value">${object.name}</span>
        </div>`;
      }
      
      if (mesh.id !== undefined) {
        html += `<div class="property-row">
          <span class="property-key">Mesh ID:</span>
          <span class="property-value">${mesh.id}</span>
        </div>`;
      }
      
      if (mesh.fragment) {
        html += `<div class="property-row">
          <span class="property-key">Fragment ID:</span>
          <span class="property-value small">${mesh.fragment.id}</span>
        </div>`;
      }
      
      // Add UUID
      if (object.uuid) {
        html += `<div class="property-row">
          <span class="property-key">UUID:</span>
          <span class="property-value small">${object.uuid.substring(0, 8)}...</span>
        </div>`;
      }
      
      html += '</div>';
      
      // Geometry info
      if (object instanceof THREE.Mesh && object.geometry) {
        html += '<div class="property-group">';
        html += '<div class="property-group-header">📐 Geometry</div>';
        
        const geometry = object.geometry;
        if (geometry.attributes.position) {
          const vertexCount = geometry.attributes.position.count;
          html += `<div class="property-row">
            <span class="property-key">Vertices:</span>
            <span class="property-value">${vertexCount.toLocaleString()}</span>
          </div>`;
        }
        
        if (geometry.index) {
          const faceCount = geometry.index.count / 3;
          html += `<div class="property-row">
            <span class="property-key">Faces:</span>
            <span class="property-value">${Math.floor(faceCount).toLocaleString()}</span>
          </div>`;
        }
        
        // Bounding box - with error handling
        try {
          if (!geometry.boundingBox) {
            geometry.computeBoundingBox();
          }
          if (geometry.boundingBox) {
            const bbox = geometry.boundingBox;
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const center = new THREE.Vector3();
            bbox.getCenter(center);
            
            html += `<div class="property-row">
              <span class="property-key">BBox Size:</span>
              <span class="property-value">${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}</span>
            </div>`;
            
            html += `<div class="property-row">
              <span class="property-key">BBox Center:</span>
              <span class="property-value">${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}</span>
            </div>`;
          }
        } catch (e) {
          console.warn('Could not compute bounding box:', e);
        }
        
        html += '</div>';
      }
      
      // Transform info
      html += '<div class="property-group">';
      html += '<div class="property-group-header">📍 Transform</div>';
      
      html += `<div class="property-row">
        <span class="property-key">Position:</span>
        <span class="property-value">${object.position.x.toFixed(2)}, ${object.position.y.toFixed(2)}, ${object.position.z.toFixed(2)}</span>
      </div>`;
      
      // Rotation (in degrees)
      const rotX = THREE.MathUtils.radToDeg(object.rotation.x);
      const rotY = THREE.MathUtils.radToDeg(object.rotation.y);
      const rotZ = THREE.MathUtils.radToDeg(object.rotation.z);
      html += `<div class="property-row">
        <span class="property-key">Rotation (°):</span>
        <span class="property-value">${rotX.toFixed(1)}°, ${rotY.toFixed(1)}°, ${rotZ.toFixed(1)}°</span>
      </div>`;
      
      // Scale
      html += `<div class="property-row">
        <span class="property-key">Scale:</span>
        <span class="property-value">${object.scale.x.toFixed(2)}, ${object.scale.y.toFixed(2)}, ${object.scale.z.toFixed(2)}</span>
      </div>`;
      
      html += '</div>';
      
      // Material info
      if (object instanceof THREE.Mesh && object.material) {
        html += '</div><div class="property-group">';
        html += '<div class="property-group-header">🎨 Material</div>';
        
        const material = object.material as THREE.Material;
        if (material.name) {
          html += `<div class="property-row">
            <span class="property-key">Name:</span>
            <span class="property-value">${material.name}</span>
          </div>`;
        }
        
        html += `<div class="property-row">
          <span class="property-key">Type:</span>
          <span class="property-value">${material.type}</span>
        </div>`;
        
        html += `<div class="property-row">
          <span class="property-key">Transparent:</span>
          <span class="property-value">${material.transparent ? 'Yes' : 'No'}</span>
        </div>`;
        
        if ((material as any).color) {
          const color = (material as any).color;
          html += `<div class="property-row">
            <span class="property-key">Color:</span>
            <span class="property-value">#${color.getHexString()}</span>
          </div>`;
        }
      }
      
      // Position info
      html += '</div><div class="property-group">';
      html += '<div class="property-group-header">📍 Transform</div>';
      
      html += `<div class="property-row">
        <span class="property-key">Position:</span>
        <span class="property-value">${object.position.x.toFixed(2)}, ${object.position.y.toFixed(2)}, ${object.position.z.toFixed(2)}</span>
      </div>`;
      
      html += `<div class="property-row">
        <span class="property-key">Rotation:</span>
        <span class="property-value">${(object.rotation.x * 180 / Math.PI).toFixed(1)}°, ${(object.rotation.y * 180 / Math.PI).toFixed(1)}°, ${(object.rotation.z * 180 / Math.PI).toFixed(1)}°</span>
      </div>`;
      
      html += `<div class="property-row">
        <span class="property-key">Scale:</span>
        <span class="property-value">${object.scale.x.toFixed(2)}, ${object.scale.y.toFixed(2)}, ${object.scale.z.toFixed(2)}</span>
      </div>`;
      
      html += '</div>';
      
      // Additional User Data Section (if any)
      if (mesh.userData && Object.keys(mesh.userData).length > 0) {
        html += '<div class="property-group">';
        html += '<div class="property-group-header">🔧 Additional Data</div>';
        html += '<pre style="font-size: 10px; overflow-x: auto; margin: 8px; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; max-height: 200px;">';
        html += JSON.stringify(mesh.userData, null, 2);
        html += '</pre>';
        html += '</div>';
      }
      
      html += '</div>';
      this.propertiesElement.innerHTML = html;
      
      console.log('✅ Properties displayed successfully');
      console.log('📋 Properties HTML length:', html.length);
      
    } catch (error) {
      console.error('❌ Error showing properties:', error);
      this.propertiesElement.innerHTML = '<div class="error">Error loading properties</div>';
    }
  }

  /**
   * Clears selection
   */
  private clearSelection(): void {
    // Restore original material for cluster mesh if it was highlighted
    if (this.selectedObject && this.selectedObject.userData?.isClusterMesh && this.selectedObject instanceof THREE.Mesh) {
      if (this.selectedObject.userData.originalMaterial) {
        this.selectedObject.material = this.selectedObject.userData.originalMaterial;
      }
    }
    
    this.selectedObject = null;
    if (this.highlighter) {
      this.highlighter.clear('select');
    }
    this.clearProperties();
  }

  /**
   * Clears properties display
   */
  private clearProperties(): void {
    if (this.propertiesElement) {
      this.propertiesElement.innerHTML = '<p class="no-selection">Click an element to view properties</p>';
    }
  }

  /**
   * Creates the IFC tree view panel (left side)
   */
  private createTreePanel(): HTMLElement {
    const treePanel = document.createElement('div');
    treePanel.id = 'ifc-tree-panel';
    treePanel.className = 'ifc-tree-panel collapsed'; // Start minimized

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <h3><i class="fas fa-sitemap"></i> IFC Tree</h3>
      <div class="header-actions">
        <button id="refresh-tree-btn" class="icon-btn" title="Refresh Tree">
          <i class="fas fa-sync-alt"></i>
        </button>
        <button id="collapse-tree-btn" class="icon-btn" title="Expand Panel">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    `;
    treePanel.appendChild(header);

    // Tree container
    const treeContainer = document.createElement('div');
    treeContainer.id = 'tree-container';
    treeContainer.className = 'tree-container';
    treePanel.appendChild(treeContainer);

    this.treeContainer = treeContainer;

    // Setup event listeners
    const refreshBtn = header.querySelector('#refresh-tree-btn');
    refreshBtn?.addEventListener('click', () => this.buildTree());

    const collapseBtn = header.querySelector('#collapse-tree-btn');
    
    // Create expand tab (visible when collapsed) - append to body
    const expandTab = document.createElement('div');
    expandTab.className = 'expand-tab expand-tab-left';
    expandTab.innerHTML = '<i class="fas fa-sitemap"></i>';
    expandTab.title = 'Show IFC Tree';
    expandTab.style.opacity = '1'; // Visible initially since panel starts collapsed
    expandTab.style.pointerEvents = 'auto';
    this.treeExpandTab = expandTab;
    
    collapseBtn?.addEventListener('click', () => {
      treePanel.classList.toggle('collapsed');
      const icon = collapseBtn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-minus');
        icon.classList.toggle('fa-plus');
      }
      // Toggle expand tab visibility
      if (this.treeExpandTab) {
        if (treePanel.classList.contains('collapsed')) {
          this.treeExpandTab.style.opacity = '1';
          this.treeExpandTab.style.pointerEvents = 'auto';
        } else {
          this.treeExpandTab.style.opacity = '0';
          this.treeExpandTab.style.pointerEvents = 'none';
        }
      }
    });
    
    expandTab.addEventListener('click', () => {
      treePanel.classList.remove('collapsed');
      const icon = collapseBtn?.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-plus');
        icon.classList.add('fa-minus');
      }
      // Hide expand tab
      expandTab.style.opacity = '0';
      expandTab.style.pointerEvents = 'none';
    });

    // Build initial tree
    this.buildTree();

    return treePanel;
  }

  /**
   * Creates the properties panel (right side)
   */
  private createPropertiesPanel(): HTMLElement {
    const propsPanel = document.createElement('div');
    propsPanel.id = 'ifc-properties-panel';
    propsPanel.className = 'ifc-properties-panel collapsed'; // Start minimized

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <h3><i class="fas fa-info-circle"></i> Properties</h3>
      <button id="collapse-props-btn" class="icon-btn" title="Expand Panel">
        <i class="fas fa-plus"></i>
      </button>
    `;
    propsPanel.appendChild(header);

    // Properties content
    const propsContent = document.createElement('div');
    propsContent.id = 'properties-content';
    propsContent.className = 'properties-content';
    propsContent.innerHTML = '<p class="no-selection">Click an element to view properties</p>';
    propsPanel.appendChild(propsContent);

    this.propertiesElement = propsContent;

    // Setup event listeners
    const collapseBtn = header.querySelector('#collapse-props-btn');
    
    // Create expand tab (visible when collapsed) - append to body
    const expandTab = document.createElement('div');
    expandTab.className = 'expand-tab expand-tab-right';
    expandTab.innerHTML = '<i class="fas fa-info-circle"></i>';
    expandTab.title = 'Show Properties';
    expandTab.style.opacity = '1'; // Visible initially since panel starts collapsed
    expandTab.style.pointerEvents = 'auto';
    this.propsExpandTab = expandTab;
    
    collapseBtn?.addEventListener('click', () => {
      propsPanel.classList.toggle('collapsed');
      const icon = collapseBtn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-minus');
        icon.classList.toggle('fa-plus');
      }
      // Toggle expand tab visibility
      if (this.propsExpandTab) {
        if (propsPanel.classList.contains('collapsed')) {
          this.propsExpandTab.style.opacity = '1';
          this.propsExpandTab.style.pointerEvents = 'auto';
        } else {
          this.propsExpandTab.style.opacity = '0';
          this.propsExpandTab.style.pointerEvents = 'none';
        }
      }
    });
    
    expandTab.addEventListener('click', () => {
      propsPanel.classList.remove('collapsed');
      const icon = collapseBtn?.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-plus');
        icon.classList.add('fa-minus');
      }
      // Hide expand tab
      expandTab.style.opacity = '0';
      expandTab.style.pointerEvents = 'none';
    });

    return propsPanel;
  }

  /**
   * Creates both panels (tree and properties)
   */
  public createPanel(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ifc-panels-container';

    // Create tree panel (left)
    const treePanel = this.createTreePanel();
    container.appendChild(treePanel);

    // Create properties panel (right)
    const propsPanel = this.createPropertiesPanel();
    container.appendChild(propsPanel);

    // Append expand tabs to body (so they stay fixed even when panels move)
    if (this.treeExpandTab) {
      document.body.appendChild(this.treeExpandTab);
    }
    if (this.propsExpandTab) {
      document.body.appendChild(this.propsExpandTab);
    }

    return container;
  }

  /**
   * Builds a hierarchical tree view of IFC entities with spatial structure
   */
  public async buildTree(): Promise<void> {
    if (!this.treeContainer || !this.fragmentsManager) {
      console.warn('⚠️ Tree container or fragments manager not available');
      return;
    }

    const models = Array.from(this.fragmentsManager.list.values());
    console.log(`🌲 Building tree with ${models.length} models`);
    
    if (models.length === 0) {
      this.treeContainer.innerHTML = '<div class="no-models">No models loaded</div>';
      return;
    }

    // Clear previous storey data
    this.storeyData = {};

    let html = '<ul class="tree-root">';
    
    for (const model of models) {
      const modelId = (model as any).modelId || 'Unknown';
      
      // Get the model name from metadata
      const modelName = this.ifcLoader?.getModelMetadata(modelId)?.name || modelId;
      
      try {
        console.log(`📦 Getting spatial structure for model: ${modelId} (${modelName})`);
        
        // Get the spatial structure (IFCProject >> IFCSite >> IFCBuilding >> IFCBuildingStorey)
        const spatialStructure = await (model as any).getSpatialStructure();
        
        // Build tree from spatial structure with model name wrapper
        html += await this.buildModelNode(model, modelId, modelName, spatialStructure);
        
      } catch (error) {
        console.error(`❌ Error building tree for model ${modelId}:`, error);
        // Fallback to category-based tree
        html += await this.buildCategoryBasedTree(model, modelId);
      }
    }
    
    html += '</ul>';
    this.treeContainer.innerHTML = html;
    
    // Setup tree interactions
    this.setupTreeInteractions();
    
    console.log('✅ Tree built successfully');
    console.log('📊 Storey data collected:', this.storeyData);
  }

  /**
   * Builds a model node wrapper around the spatial structure
   */
  private async buildModelNode(model: any, modelId: string, modelName: string, spatialStructure: any): Promise<string> {
    let html = `
      <li class="tree-node model-node expanded">
        <div class="tree-node-content" data-toggle="true">
          <span class="tree-toggle"><i class="fas fa-chevron-down"></i></span>
          <span class="tree-icon"><i class="fas fa-file-code"></i></span>
          <span class="tree-label" title="${modelName}">${modelName}</span>
        </div>
        <ul class="tree-children">
    `;
    
    // Build the spatial structure nodes inside the model node
    const { html: spatialHtml } = await this.buildSpatialNode(model, modelId, spatialStructure, 0);
    html += spatialHtml;
    
    html += `
        </ul>
      </li>
    `;
    
    return html;
  }

  /**
   * Builds a tree node from spatial structure recursively
   */
  private async buildSpatialNode(model: any, modelId: string, node: any, level: number = 0): Promise<{ html: string, ids: number[] }> {
    if (!node) return { html: '', ids: [] };
    
    const localId = node.localId || node._localId?.value;
    const category = node.category || node._category?.value || 'UNKNOWN';
    
    // If this is a building storey wrapper (category='IFCBUILDINGSTOREY' but localId=null),
    // its children are the actual storey nodes with localIds
    if (category === 'IFCBUILDINGSTOREY' && !localId && node.children) {
      for (const storeyChild of node.children) {
        const storeyLocalId = storeyChild.localId || storeyChild._localId?.value;
        if (storeyLocalId) {
          await this.gatherStoreyElementsFromTree(model, storeyChild, storeyLocalId);
        }
      }
    }
    
    // Also handle direct storey nodes (if they have both category and localId)
    if (category === 'IFCBUILDINGSTOREY' && localId) {
      await this.gatherStoreyElementsFromTree(model, node, localId);
    }
    
    // Try to get the name from multiple sources
    let name = node.name || node.Name?.value;
    
    // If no name and we have a localId, try to fetch the Name attribute
    if (!name && localId) {
      try {
        const [itemData] = await model.getItemsData([localId], {
          attributesDefault: false,
          attributes: ['Name', 'LongName', 'Description'],
        });
        
        if (itemData) {
          // Try Name first, then LongName, then Description
          name = itemData.Name?.value || 
                 itemData.LongName?.value || 
                 itemData.Description?.value;
        }
      } catch (error) {
        console.warn(`⚠️ Could not get name for localId ${localId}:`, error);
      }
    }
    
    // Final fallback: use category as display name
    if (!name || name === 'UNKNOWN') {
      // Make category more readable (e.g., "IFCBUILDINGSTOREY" -> "Building Storey")
      const cleanCategory = category.replace(/^IFC/, ''); // Remove IFC prefix
      // Insert space before capital letters (but not at the start)
      name = cleanCategory
        .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between lowercase and uppercase
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    
    const children = node.children || [];
    const icon = this.getCategoryIcon(category);
    
    // Collect IDs from this node and children
    let collectedIds: number[] = [];
    if (localId) collectedIds.push(localId);

    // Pre-fetch storey elements if applicable
    let storeyHtml = '';
    let storeyIds: number[] = [];
    if (category === 'IFCBUILDINGSTOREY' && localId) {
       const result = await this.addElementsForStorey(model, modelId, localId, name);
       storeyHtml = result.html;
       storeyIds = result.ids;
       collectedIds.push(...storeyIds);
    }

    const hasChildren = children.length > 0 || storeyIds.length > 0;
    const isExpanded = level < 2; // Auto-expand first 2 levels (Project, Site, Building)

    let childrenHtml = '';
    if (hasChildren) {
      childrenHtml += '<ul class="tree-children">';
      
      // Process children recursively
      for (const child of children) {
        const { html: childHtml, ids: childIds } = await this.buildSpatialNode(model, modelId, child, level + 1);
        childrenHtml += childHtml;
        collectedIds.push(...childIds);
        
        // If this is the IFCBUILDINGSTOREY grouping node, also add elements for each storey child
        if (category === 'IFCBUILDINGSTOREY' && !localId) {
          const storeyLocalId = child.localId || child._localId?.value;
          if (storeyLocalId) {
            // Note: Element counting for dashboard is handled by gatherStoreyElementsFromTree()
            // which is called during buildSpatialNode() when IFCBUILDINGSTOREY nodes are encountered
          }
        }
      }
      
      // Append the elements found in the storey
      childrenHtml += storeyHtml;

      childrenHtml += '</ul>';
    }
    
    let html = `
      <li class="tree-node spatial-node ${isExpanded ? 'expanded' : ''}">
        <div class="tree-node-content ${localId ? 'selectable' : ''}" ${hasChildren ? 'data-toggle="true"' : ''} data-model-id="${modelId}" ${localId ? `data-local-id="${localId}"` : ''} data-ids="${collectedIds.join(',')}">
          ${hasChildren ? `<span class="tree-toggle"><i class="fas fa-chevron-${isExpanded ? 'down' : 'right'}"></i></span>` : '<span class="tree-spacer"></span>'}
          <span class="tree-icon"><i class="${icon}"></i></span>
          <span class="tree-label" title="${name}">${name}</span>
          ${children.length > 0 ? `<span class="tree-count">(${children.length})</span>` : ''}
          
          <div class="tree-actions">
            <button class="tree-action-btn visibility-btn" title="Toggle Visibility" data-action="visibility">
              <i class="fas fa-eye"></i>
            </button>
            <button class="tree-action-btn isolate-btn" title="Isolate" data-action="isolate">
              <i class="fas fa-crosshairs"></i>
            </button>
          </div>
        </div>
    `;
    
    html += childrenHtml;
    html += '</li>';
    
    return { html, ids: collectedIds };
  }

  /**
   * Gathers storey element counts from the spatial tree structure
   */
  private async gatherStoreyElementsFromTree(model: any, storeyNode: any, storeyLocalId: number): Promise<void> {
    // Get storey name
    let storeyName = storeyNode.name || storeyNode.Name?.value;
    if (!storeyName) {
      try {
        const [itemData] = await model.getItemsData([storeyLocalId], {
          attributesDefault: false,
          attributes: ['Name', 'LongName'],
        });
        storeyName = itemData?.Name?.value || itemData?.LongName?.value || `Storey ${storeyLocalId}`;
      } catch (error) {
        storeyName = `Storey ${storeyLocalId}`;
      }
    }

    // Initialize storey data
    if (!this.storeyData[storeyName]) {
      this.storeyData[storeyName] = {};
    }

    // Count elements by category from the tree children
    // Each child is a category group (e.g., IFCDOOR group), and it has children which are the actual door elements
    if (storeyNode.children && Array.isArray(storeyNode.children)) {
      for (const categoryGroup of storeyNode.children) {
        const groupCategory = categoryGroup.category || categoryGroup._category?.value;
        
        // Skip spatial categories
        const spatialCategories = ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE'];
        if (!groupCategory || spatialCategories.includes(groupCategory)) {
          continue;
        }

        // Count how many elements are in this category group
        const elementCount = categoryGroup.children?.length || 0;
        
        if (elementCount > 0) {
          this.storeyData[storeyName][groupCategory] = elementCount;
        }
      }
    }
  }

  /**
   * Gathers element counts by category for a specific storey (data only, no HTML)
   */
  private async gatherElementsForStorey(model: any, modelId: string, storeyLocalId: number, storeyName: string): Promise<void> {
    try {
      // Get all categories
      const categories = await model.getCategories();
      
      // Filter out spatial categories
      const spatialCategories = ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE'];
      const elementCategories = categories.filter((cat: string) => !spatialCategories.includes(cat));
      
      if (elementCategories.length === 0) return;
      
      // Get items for each category
      const categoryRegexps = elementCategories.map((cat: string) => new RegExp(`^${cat}$`));
      const itemsByCategory = await model.getItemsOfCategories(categoryRegexps);
      
      // Initialize storey data
      if (!this.storeyData[storeyName]) {
        this.storeyData[storeyName] = {};
      }
      
      console.log(`📊 Processing ${elementCategories.length} categories for ${storeyName}`);
      
      // For each category, filter items that belong to this storey
      for (const [category, allLocalIds] of Object.entries(itemsByCategory)) {
        const ids = allLocalIds as number[];
        if (ids.length === 0) continue;
        
        console.log(`📊 Checking ${ids.length} ${category} items for storey ${storeyName}`);
        
        // Try multiple approaches to find items belonging to this storey
        const itemsInStorey: number[] = [];
        
        try {
          // Approach 1: Check ContainedInStructure relation
          const itemsData = await model.getItemsData(ids, {
            attributesDefault: false,
            attributes: [],
            relations: {
              ContainedInStructure: { attributes: false, relations: false },
            },
          });
          
          for (let i = 0; i < itemsData.length; i++) {
            const data = itemsData[i];
            const localId = ids[i];
            
            // Check if this item is contained in the current storey
            if (data.ContainedInStructure && Array.isArray(data.ContainedInStructure)) {
              const isInStorey = data.ContainedInStructure.some((rel: any) => {
                const relLocalId = rel._localId?.value || rel.localId;
                return relLocalId === storeyLocalId;
              });
              
              if (isInStorey) {
                itemsInStorey.push(localId);
              }
            }
          }
          
          console.log(`📊 Found ${itemsInStorey.length} ${category} items in ${storeyName} using ContainedInStructure`);
        } catch (error) {
          console.warn(`⚠️ Could not use ContainedInStructure for storey ${storeyName}, category ${category}:`, error);
        }
        
        // If ContainedInStructure didn't work, try checking if items reference this storey in their data
        if (itemsInStorey.length === 0) {
          try {
            const itemsData = await model.getItemsData(ids, {
              attributesDefault: false,
              attributes: [],
              relations: {
                ObjectPlacement: { attributes: false, relations: { PlacementRelTo: { attributes: false, relations: false } } },
              },
            });
            
            for (let i = 0; i < itemsData.length; i++) {
              const data = itemsData[i];
              const localId = ids[i];
              
              // Check ObjectPlacement -> PlacementRelTo chain for storey reference
              if (data.ObjectPlacement?.PlacementRelTo) {
                let currentPlacement = data.ObjectPlacement.PlacementRelTo;
                let depth = 0;
                while (currentPlacement && depth < 10) {
                  const placementId = currentPlacement._localId?.value || currentPlacement.localId;
                  if (placementId === storeyLocalId) {
                    itemsInStorey.push(localId);
                    break;
                  }
                  currentPlacement = currentPlacement.PlacementRelTo;
                  depth++;
                }
              }
            }
            
            console.log(`📊 Found ${itemsInStorey.length} ${category} items in ${storeyName} using ObjectPlacement`);
          } catch (error) {
            console.warn(`⚠️ Could not use ObjectPlacement for storey ${storeyName}, category ${category}:`, error);
          }
        }
        
        if (itemsInStorey.length > 0) {
          this.storeyData[storeyName][category] = (this.storeyData[storeyName][category] || 0) + itemsInStorey.length;
          console.log(`📊 Stored: ${storeyName} - ${category}: ${itemsInStorey.length}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Could not gather elements for storey ${storeyName}:`, error);
    }
  }

  /**
   * Adds IFC elements grouped by category for a specific storey
   */
  private async addElementsForStorey(model: any, modelId: string, storeyLocalId: number, storeyName?: string): Promise<{ html: string, ids: number[] }> {
    let html = '';
    let collectedIds: number[] = [];
    
    try {
      // Get all categories
      const categories = await model.getCategories();
      
      // Filter out spatial categories
      const spatialCategories = ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE'];
      const elementCategories = categories.filter((cat: string) => !spatialCategories.includes(cat));
      
      if (elementCategories.length === 0) return { html, ids: collectedIds };
      
      // Get items for each category
      const categoryRegexps = elementCategories.map((cat: string) => new RegExp(`^${cat}$`));
      const itemsByCategory = await model.getItemsOfCategories(categoryRegexps);
      
      console.log(`📊 [${storeyName}] Processing ${elementCategories.length} categories`);
      
      // Initialize storey data if storeyName is provided
      if (storeyName && !this.storeyData[storeyName]) {
        this.storeyData[storeyName] = {};
      }
      
      // For each category, filter items that belong to this storey
      for (const [category, allLocalIds] of Object.entries(itemsByCategory)) {
        const ids = allLocalIds as number[];
        // console.log(`📊 [${storeyName}] Category ${category}: ${ids.length} total items`);
        if (ids.length === 0) continue;
        
        // Check which items belong to this storey by checking their ContainedInStructure relation
        const itemsInStorey: number[] = [];
        
        try {
          const itemsData = await model.getItemsData(ids, {
            attributesDefault: false,
            attributes: ['Name', 'Tag', 'ObjectType'],
            relations: {
              ContainedInStructure: { attributes: false, relations: false },
            },
          });
          
          for (let i = 0; i < itemsData.length; i++) {
            const data = itemsData[i];
            const localId = ids[i];
            
            // Check if this item is contained in the current storey
            if (data.ContainedInStructure && Array.isArray(data.ContainedInStructure)) {
              const isInStorey = data.ContainedInStructure.some((rel: any) => {
                const relLocalId = rel._localId?.value || rel.localId;
                return relLocalId === storeyLocalId;
              });
              
              if (isInStorey) {
                itemsInStorey.push(localId);
              }
            }
          }
          
          // console.log(`📊 [${storeyName}] Found ${itemsInStorey.length} items in storey for ${category}`);
        } catch (error) {
          console.warn(`⚠️ [${storeyName}] Could not filter items for category ${category}:`, error);
        }
        
        if (itemsInStorey.length === 0) {
          continue;
        }

        // Add to collected IDs
        collectedIds.push(...itemsInStorey);
        
        // Store count in storeyData for dashboard
        if (storeyName) {
          this.storeyData[storeyName][category] = (this.storeyData[storeyName][category] || 0) + itemsInStorey.length;
        }
        
        // Add category node
        const categoryIcon = this.getCategoryIcon(category);
        html += `
          <li class="tree-node category-node">
            <div class="tree-node-content" data-toggle="true" data-model-id="${modelId}" data-category="${category}" data-ids="${itemsInStorey.join(',')}">
              <span class="tree-toggle"><i class="fas fa-chevron-right"></i></span>
              <span class="tree-icon"><i class="${categoryIcon}"></i></span>
              <span class="tree-label">${category}</span>
              <span class="tree-count">(${itemsInStorey.length})</span>
              
              <div class="tree-actions">
                <button class="tree-action-btn visibility-btn" title="Toggle Visibility" data-action="visibility">
                  <i class="fas fa-eye"></i>
                </button>
                <button class="tree-action-btn isolate-btn" title="Isolate" data-action="isolate">
                  <i class="fas fa-crosshairs"></i>
                </button>
              </div>
            </div>
            <ul class="tree-children">
        `;
        
        // Get item details
        try {
          const itemsData = await model.getItemsData(itemsInStorey, {
            attributesDefault: false,
            attributes: ['Name', 'Tag', 'ObjectType'],
          });
          
          for (let i = 0; i < itemsData.length; i++) {
            const itemData = itemsData[i];
            const localId = itemsInStorey[i];
            
            let itemName = '';
            if (itemData.Name?.value) {
              itemName = itemData.Name.value;
            } else if (itemData.Tag?.value) {
              itemName = `${category} [${itemData.Tag.value}]`;
            } else if (itemData.ObjectType?.value) {
              itemName = itemData.ObjectType.value;
            } else {
              itemName = `${category} #${localId}`;
            }
            
            html += `
              <li class="tree-node element-node">
                <div class="tree-node-content selectable" data-model-id="${modelId}" data-local-id="${localId}">
                  <span class="tree-spacer"></span>
                  <span class="tree-icon"><i class="fas fa-cube"></i></span>
                  <span class="tree-label">${itemName}</span>
                  
                  <div class="tree-actions">
                    <button class="tree-action-btn visibility-btn" title="Toggle Visibility" data-action="visibility">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button class="tree-action-btn isolate-btn" title="Isolate" data-action="isolate">
                      <i class="fas fa-crosshairs"></i>
                    </button>
                  </div>
                </div>
              </li>
            `;
          }
        } catch (error) {
          console.warn(`⚠️ Could not get item names for category ${category}:`, error);
        }
        
        html += `
            </ul>
          </li>
        `;
      }
    } catch (error) {
      console.warn(`⚠️ Could not add elements for storey ${storeyLocalId}:`, error);
    }
    
    return { html, ids: collectedIds };
  }

  /**
   * Fallback: Builds a category-based tree (if spatial structure fails)
   */
  private async buildCategoryBasedTree(model: any, modelId: string): Promise<string> {
    let html = '';
    
    try {
      console.log(`📦 Building category-based tree for model: ${modelId}`);
      
      // Get the model name from metadata
      const modelName = this.ifcLoader?.getModelMetadata(modelId)?.name || modelId;
      
      const categories = await model.getCategories();
      const categoryRegexps = categories.map((cat: string) => new RegExp(`^${cat}$`));
      const itemsByCategory = await model.getItemsOfCategories(categoryRegexps);
      
      let totalItems = 0;
      for (const ids of Object.values(itemsByCategory)) {
        totalItems += (ids as number[]).length;
      }
      
      html += `
        <li class="tree-node model-node expanded">
          <div class="tree-node-content" data-toggle="true">
            <span class="tree-toggle"><i class="fas fa-chevron-down"></i></span>
            <span class="tree-icon"><i class="fas fa-file-code"></i></span>
            <span class="tree-label" title="${modelName}">${modelName}</span>
            <span class="tree-count">(${totalItems} elements)</span>
          </div>
          <ul class="tree-children">
      `;
      
      for (const [category, localIds] of Object.entries(itemsByCategory)) {
        const ids = localIds as number[];
        if (ids.length === 0) continue;
        
        const categoryIcon = this.getCategoryIcon(category);
        
        html += `
          <li class="tree-node category-node">
            <div class="tree-node-content" data-toggle="true" data-model-id="${modelId}" data-category="${category}" data-ids="${ids.join(',')}">
              <span class="tree-toggle"><i class="fas fa-chevron-right"></i></span>
              <span class="tree-icon"><i class="${categoryIcon}"></i></span>
              <span class="tree-label">${category}</span>
              <span class="tree-count">(${ids.length})</span>
              
              <div class="tree-actions">
                <button class="tree-action-btn visibility-btn" title="Toggle Visibility" data-action="visibility">
                  <i class="fas fa-eye"></i>
                </button>
                <button class="tree-action-btn isolate-btn" title="Isolate" data-action="isolate">
                  <i class="fas fa-crosshairs"></i>
                </button>
              </div>
            </div>
            <ul class="tree-children">
        `;
        
        try {
          const itemsData = await model.getItemsData(ids, {
            attributesDefault: false,
            attributes: ['Name', 'Tag', 'ObjectType'],
          });
          
          for (let i = 0; i < itemsData.length; i++) {
            const itemData = itemsData[i];
            const localId = ids[i];
            
            let itemName = '';
            if (itemData.Name?.value) {
              itemName = itemData.Name.value;
            } else if (itemData.Tag?.value) {
              itemName = `${category} [${itemData.Tag.value}]`;
            } else if (itemData.ObjectType?.value) {
              itemName = itemData.ObjectType.value;
            } else {
              itemName = `${category} #${localId}`;
            }
            
            html += `
              <li class="tree-node element-node">
                <div class="tree-node-content selectable" data-model-id="${modelId}" data-local-id="${localId}">
                  <span class="tree-spacer"></span>
                  <span class="tree-icon"><i class="fas fa-cube"></i></span>
                  <span class="tree-label">${itemName}</span>
                  
                  <div class="tree-actions">
                    <button class="tree-action-btn visibility-btn" title="Toggle Visibility" data-action="visibility">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button class="tree-action-btn isolate-btn" title="Isolate" data-action="isolate">
                      <i class="fas fa-crosshairs"></i>
                    </button>
                  </div>
                </div>
              </li>
            `;
          }
        } catch (error) {
          console.warn(`⚠️ Could not get item data:`, error);
        }
        
        html += `
            </ul>
          </li>
        `;
      }
      
      html += `
          </ul>
        </li>
      `;
    } catch (error) {
      console.error(`❌ Error building category tree:`, error);
    }
    
    return html;
  }

  /**
   * Gets an appropriate icon for an IFC category
   */
  private getCategoryIcon(category: string): string {
    const iconMap: Record<string, string> = {
      // Spatial structure
      'IFCPROJECT': 'fas fa-project-diagram',
      'IFCSITE': 'fas fa-map-marked-alt',
      'IFCBUILDING': 'fas fa-building',
      'IFCBUILDINGSTOREY': 'fas fa-layer-group',
      'IFCSPACE': 'fas fa-vector-square',
      
      // Building elements
      'IFCWALL': 'fas fa-th-large',
      'IFCWALLSTANDARDCASE': 'fas fa-th-large',
      'IFCSLAB': 'fas fa-square',
      'IFCCOLUMN': 'fas fa-grip-lines-vertical',
      'IFCBEAM': 'fas fa-minus',
      'IFCDOOR': 'fas fa-door-closed',
      'IFCWINDOW': 'fas fa-window-maximize',
      'IFCROOF': 'fas fa-home',
      'IFCSTAIR': 'fas fa-stairs',
      'IFCRAILING': 'fas fa-grip-horizontal',
      'IFCFURNISHINGELEMENT': 'fas fa-chair',
      'IFCBUILDINGELEMENTPROXY': 'fas fa-cube',
      'IFCMEMBER': 'fas fa-ruler-combined',
      'IFCPLATE': 'fas fa-rectangle-landscape',
      'IFCCOVERING': 'fas fa-fill',
      'IFCFOOTING': 'fas fa-grip-horizontal',
      'IFCPILE': 'fas fa-arrow-down',
    };
    
    return iconMap[category] || 'fas fa-cube';
  }

  /**
   * Sets up tree expand/collapse and selection interactions
   */
  private setupTreeInteractions(): void {
    if (!this.treeContainer) return;

    // Expand/collapse functionality
    const toggles = this.treeContainer.querySelectorAll('[data-toggle="true"]');
    toggles.forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const node = (toggle as HTMLElement).closest('.tree-node');
        if (node) {
          node.classList.toggle('expanded');
          const icon = toggle.querySelector('.tree-toggle i');
          if (icon) {
            icon.classList.toggle('fa-chevron-right');
            icon.classList.toggle('fa-chevron-down');
          }
        }
      });
    });

    // Selection functionality for IFC elements
    const selectables = this.treeContainer.querySelectorAll('.selectable');
    selectables.forEach(selectable => {
      selectable.addEventListener('click', async (e) => {
        // Don't trigger selection if clicking action buttons
        if ((e.target as HTMLElement).closest('.tree-action-btn')) return;
        
        e.stopPropagation();
        
        // Remove previous selection highlight
        const previousSelected = this.treeContainer?.querySelector('.tree-node-content.selected');
        if (previousSelected) {
          previousSelected.classList.remove('selected');
        }
        
        // Add selection highlight to clicked item
        (selectable as HTMLElement).classList.add('selected');
        
        const modelId = (selectable as HTMLElement).dataset.modelId;
        const localIdStr = (selectable as HTMLElement).dataset.localId;
        
        if (modelId && localIdStr) {
          const localId = parseInt(localIdStr, 10);
          console.log(`🌲 Tree selection: modelId=${modelId}, localId=${localId}`);
          
          // Get the model
          const model = this.fragmentsManager?.list.get(modelId);
          if (!model) {
            console.warn('⚠️ Model not found:', modelId);
            return;
          }
          
          // Show IFC properties
          await this.showIfcProperties(modelId, localId, model.object);
          
          // Highlight the element
          if (this.highlighter) {
            this.highlighter.clear('select');
            this.highlighter.highlightByID('select', { [modelId]: new Set([localId]) });
          }
        }
      });
    });

    // Visibility toggle functionality
    const visibilityBtns = this.treeContainer.querySelectorAll('.visibility-btn');
    visibilityBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const button = e.currentTarget as HTMLElement;
        const content = button.closest('.tree-node-content') as HTMLElement;
        if (!content) return;

        const icon = button.querySelector('i');
        const isVisible = !button.classList.contains('hidden-state');
        
        // Helper to update a node's UI
        const updateNodeUI = (nodeContent: HTMLElement, hidden: boolean) => {
            if (hidden) {
                nodeContent.classList.add('node-hidden');
                const btn = nodeContent.querySelector('.visibility-btn');
                if (btn) {
                    btn.classList.add('hidden-state');
                    const i = btn.querySelector('i');
                    if (i) i.className = 'fas fa-eye-slash';
                }
            } else {
                nodeContent.classList.remove('node-hidden');
                const btn = nodeContent.querySelector('.visibility-btn');
                if (btn) {
                    btn.classList.remove('hidden-state');
                    const i = btn.querySelector('i');
                    if (i) i.className = 'fas fa-eye';
                }
            }
        };

        // Update current node and all descendants
        const parentLi = content.closest('.tree-node');
        if (parentLi) {
            const allNodes = parentLi.querySelectorAll('.tree-node-content');
            allNodes.forEach(node => {
                updateNodeUI(node as HTMLElement, isVisible);
            });
        } else {
            // Fallback if structure is weird
            updateNodeUI(content, isVisible);
        }

        // Get IDs to toggle
        const modelId = content.dataset.modelId;
        let idsToToggle: number[] = [];

        // Case 1: Category group OR Spatial node (has data-ids) - PREFER THIS
        if (content.dataset.ids) {
          idsToToggle = content.dataset.ids.split(',')
            .map(id => parseInt(id, 10))
            .filter(id => !isNaN(id));
        }
        // Case 2: Single element (fallback if no data-ids)
        else if (content.dataset.localId) {
          idsToToggle.push(parseInt(content.dataset.localId, 10));
        } 
        // Case 3: Fallback for Spatial node without data-ids
        else {
          const childElements = content.parentElement?.querySelectorAll('.element-node .tree-node-content[data-local-id]');
          childElements?.forEach(el => {
            const localId = (el as HTMLElement).dataset.localId;
            if (localId) idsToToggle.push(parseInt(localId, 10));
          });
        }

        console.log(`👁️ Toggling visibility for ${idsToToggle.length} items (visible: ${!isVisible})`);

        if (modelId && idsToToggle.length > 0) {
          const model = this.fragmentsManager?.list.get(modelId);
          if (model) {
            const hider = this.worldManager.getComponents().get(OBC.Hider);
            if (hider) {
              hider.set(!isVisible, { [modelId]: new Set(idsToToggle) });
            } else {
              await model.setVisible(idsToToggle, !isVisible);
            }
          }
        }
      });
    });

    // Isolate functionality
    const isolateBtns = this.treeContainer.querySelectorAll('.isolate-btn');
    isolateBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const button = e.currentTarget as HTMLElement;
        const content = button.closest('.tree-node-content') as HTMLElement;
        if (!content) return;

        // Toggle isolation state
        const isIsolated = button.classList.contains('active-isolation');
        
        // Reset all isolate buttons first
        this.treeContainer?.querySelectorAll('.isolate-btn').forEach(b => {
          b.classList.remove('active-isolation');
          b.innerHTML = '<i class="fas fa-crosshairs"></i>';
        });
        
        // Reset all node isolation styles
        this.treeContainer?.querySelectorAll('.node-isolated').forEach(node => {
          node.classList.remove('node-isolated');
        });

        const modelId = content.dataset.modelId;
        const model = modelId ? this.fragmentsManager?.list.get(modelId) : null;
        const hider = this.worldManager.getComponents().get(OBC.Hider);
        const highlighter = this.highlighter;

        // If already isolated, we want to exit isolation (Show All)
        if (isIsolated) {
          if (model && hider) {
            // Show everything
            hider.set(true); // true = visible
            
            // Clear highlights
            if (highlighter) {
              highlighter.clear('select');
              highlighter.clear('translucent');
            }
            
            // Reset camera to fit whole model
            if (this.worldManager.world?.camera?.controls) {
               const bbox = await (model as any).getMergedBox(); // Get full model box
               if (bbox && !bbox.isEmpty()) {
                 await this.worldManager.world.camera.controls.fitToBox(bbox, true);
               }
            }
          }
          return; // Exit
        }

        // Otherwise, activate isolation
        button.classList.add('active-isolation');
        content.classList.add('node-isolated');
        button.innerHTML = '<i class="fas fa-compress-arrows-alt"></i>'; // Change icon to indicate "exit"

        // Get IDs to isolate
        let idsToIsolate: number[] = [];

        // Case 1: Category group OR Spatial node (has data-ids) - PREFER THIS
        if (content.dataset.ids) {
          idsToIsolate = content.dataset.ids.split(',')
            .map(id => parseInt(id, 10))
            .filter(id => !isNaN(id));
        }
        // Case 2: Single element (fallback if no data-ids)
        else if (content.dataset.localId) {
          idsToIsolate.push(parseInt(content.dataset.localId, 10));
        } 
        // Case 3: Fallback for Spatial node without data-ids
        else {
          const childElements = content.parentElement?.querySelectorAll('.element-node .tree-node-content[data-local-id]');
          childElements?.forEach(el => {
            const localId = (el as HTMLElement).dataset.localId;
            if (localId) idsToIsolate.push(parseInt(localId, 10));
          });
        }

        if (modelId && idsToIsolate.length > 0 && model) {
          if (hider && highlighter) {
            try {
              // Get all items in the model
              let allIds: number[] = [];
              
              // Robust way to get all item IDs
              // @ts-ignore
              if (model.itemTypes && typeof model.itemTypes.keys === 'function') {
                 // @ts-ignore
                 allIds = Array.from(model.itemTypes.keys());
              } else if ((model as any).ids instanceof Set) {
                 allIds = Array.from((model as any).ids);
              } else if ((model as any).items instanceof Map) {
                 allIds = Array.from((model as any).items.keys());
              } else {
                 // Fallback: try getAllItemsWithGeometry
                 try {
                    const allItems = await (model as any).getAllItemsWithGeometry();
                    if (Array.isArray(allItems)) {
                        allIds = allItems;
                    } else if (allItems instanceof Set) {
                        allIds = Array.from(allItems);
                    } else if (typeof allItems === 'object') {
                        allIds = Object.values(allItems).flat() as number[];
                    }
                 } catch (e) {
                    console.warn('Could not get all items with geometry', e);
                 }
              }
              
              if (allIds.length > 0) {
                console.log(`👻 Ghost Mode: Found ${allIds.length} total items, isolating ${idsToIsolate.length} items`);
                const others = allIds.filter(id => !idsToIsolate.includes(id));
                
                // 1. Hide "others" (original meshes)
                hider.set(false, { [modelId]: new Set(others) });
                
                // 2. Ensure "selection" is visible (original meshes)
                hider.set(true, { [modelId]: new Set(idsToIsolate) });
                
                // 3. Highlight "others" with translucent style
                highlighter.clear('translucent');
                highlighter.highlightByID('translucent', { [modelId]: new Set(others) });
                
                // 4. Highlight "selection" with select style (optional, maybe just outline?)
                // If we want to keep original look, we might not want to overlay 'select' color on the whole face.
                // But the user probably expects the selection highlight.
                highlighter.clear('select');
                highlighter.highlightByID('select', { [modelId]: new Set(idsToIsolate) });
              } else {
                // Fallback if we can't get all IDs
                hider.isolate({ [modelId]: new Set(idsToIsolate) });
              }
            } catch (err) {
              console.warn('Error in ghost isolation:', err);
              hider.isolate({ [modelId]: new Set(idsToIsolate) });
            }
          } else if (hider) {
             hider.isolate({ [modelId]: new Set(idsToIsolate) });
          }
          
          // 2. Zoom to elements with Isometric View
          if (this.worldManager.world?.camera?.controls) {
             // Use getMergedBox
             const bbox = await (model as any).getMergedBox(idsToIsolate);
             if (bbox && !bbox.isEmpty()) {
               // Calculate isometric position
               const center = new THREE.Vector3();
               bbox.getCenter(center);
               const size = new THREE.Vector3();
               bbox.getSize(size);
               const maxDim = Math.max(size.x, size.y, size.z);
               const dist = maxDim * 1.5;
               
               // Isometric vector (1, 1, 1)
               const isoVector = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(dist);
               const cameraPos = center.clone().add(isoVector);
               
               // Set camera position and target
               await this.worldManager.world.camera.controls.setLookAt(
                 cameraPos.x, cameraPos.y, cameraPos.z,
                 center.x, center.y, center.z,
                 true
               );
             }
          }
        }
      });
    });
  }

  /**
   * Counts meshes in a model
   */
  private countMeshes(model: any): number {
    let count = 0;
    
    try {
      // Count all valid meshes in the scene
      if (this.world?.scene) {
        this.world.scene.three.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            // Only count meshes with valid geometry
            if (child.geometry && 
                child.geometry.attributes && 
                child.geometry.attributes.position &&
                child.geometry.attributes.position.count > 0) {
              count++;
            }
          }
        });
      }
    } catch (error) {
      console.warn('Error counting meshes:', error);
    }
    
    return count;
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    if (this.highlighter) {
      this.highlighter.clear('select');
    }
    this.propertiesElement = null;
    this.treeContainer = null;
    console.log('✅ Properties panel disposed');
  }
}
