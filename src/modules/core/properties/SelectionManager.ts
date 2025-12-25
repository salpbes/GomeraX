import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';
import { WorldManager, ClusterModule } from '../../webgl';

export interface PropertiesContext {
  components: OBC.Components;
  world: OBC.World | null;
  fragmentsManager: OBC.FragmentsManager | null;
  highlighter: OBCF.Highlighter | null;
  worldManager: WorldManager;
  clusterModule: ClusterModule | null;
  webgpuRenderer: any;
  
  // Methods needed from other managers or the coordinator
  showIfcProperties(modelId: string, localId: number, mesh: THREE.Object3D): Promise<void>;
  clearSelection(): void;
  isPointVisible(point?: THREE.Vector3): boolean;
}

export class SelectionManager {
  private pointerDownPos = { x: 0, y: 0 };

  constructor(private context: PropertiesContext) {}

  /**
   * Sets up click selection
   */
  public setupSelection(): void {
    if (!this.context.world) return;

    const container = this.context.world.renderer?.three.domElement;
    if (!container) return;

    // Middle mouse double click to fit view
    let lastMiddleClickTime = 0;
    container.addEventListener('mousedown', async (event) => {
      // Record position for drag threshold
      if (event.button === 0) {
        this.pointerDownPos.x = event.clientX;
        this.pointerDownPos.y = event.clientY;
      }

      if (event.button === 1) { // Middle mouse button
        const currentTime = new Date().getTime();
        const timeDiff = currentTime - lastMiddleClickTime;
        
        if (timeDiff < 300) { // Double click detected (300ms threshold)
          console.log('🖱️ Middle mouse double click - Fitting to view');
          
          if (this.context.world?.camera?.controls && this.context.fragmentsManager) {
            // Get all models to calculate bounding box
            const bbox = new THREE.Box3();
            let hasModels = false;
            
            // Iterate over all models
            for (const model of this.context.fragmentsManager.list.values()) {
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
               await this.context.world.camera.controls.fitToBox(bbox, true);
            }
          }
        }
        
        lastMiddleClickTime = currentTime;
      }
    });

    container.addEventListener('click', async (event) => {
      // Check distance from pointer down to avoid accidental selection during rotation
      const dx = event.clientX - this.pointerDownPos.x;
      const dy = event.clientY - this.pointerDownPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // If moved more than 5 pixels, consider it a drag/rotate, not a click
      if (distance >= 5) {
        console.log('🖱️ Click ignored - drag detected');
        return;
      }

      // Don't process clicks in floor plan mode to allow camera controls
      if ((window as any).isFloorPlanMode) {
        console.log('🚫 Click ignored - floor plan mode active');
        return;
      }
      
      // Check if we're in first-person mode with pointer locked
      const viewer = (window as any).viewer;
      const fpControls = viewer?.getFirstPersonControls?.();
      const isFirstPersonPointerLocked = fpControls?.isActive?.() && fpControls?.isPointerLockedMode?.();
      
      if (isFirstPersonPointerLocked) {
        console.log('🎯 First-person mode - using crosshair selection');
        await this.performCenterScreenSelection();
        return;
      }
      
      console.log('🖱️ Click detected');
      
      // First check if we clicked on a cluster mesh
      if (this.context.clusterModule && this.context.clusterModule.isClusteringActive()) {
        const clusterMeshHit = await this.checkClusterMeshClick(event);
        if (clusterMeshHit) {
          console.log('✅ Cluster mesh hit found:', clusterMeshHit);
          const { modelId, expressID, mesh, category } = clusterMeshHit;
          
          // Get and display IFC properties for the cluster item
          console.log(`🏗️ Getting IFC data for clustered item: model=${modelId}, expressID=${expressID}, category=${category}`);
          await this.context.showIfcProperties(modelId, expressID, mesh);
          
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
        
        // Get and display IFC properties
        console.log(`🏗️ Getting IFC data for model: ${modelId}, localId: ${localId}`);
        await this.context.showIfcProperties(modelId, localId, object);
        
        // Highlight the object with modelId and localId
        this.highlightObject(object, modelId, localId);
      } else {
        console.log('❌ No object found at click position');
        this.context.clearSelection();
      }
    });
  }

  /**
   * Perform selection using center-screen raycast (for first-person mode)
   */
  public async performCenterScreenSelection(): Promise<void> {
    if (!this.context.world?.renderer?.three.domElement || !this.context.world.camera || !this.context.fragmentsManager) {
      return;
    }

    console.log('🎯 Performing center-screen selection for first-person mode');

    const container = this.context.world.renderer.three.domElement;
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
    if (this.context.clusterModule && this.context.clusterModule.isClusteringActive()) {
      const clusterMeshHit = await this.checkClusterMeshClick(syntheticEvent);
      if (clusterMeshHit) {
        console.log('✅ Center-screen cluster mesh hit:', clusterMeshHit);
        const { modelId, expressID, mesh } = clusterMeshHit;
        
        await this.context.showIfcProperties(modelId, expressID, mesh);
        this.highlightObject(mesh, modelId, expressID);
        return;
      }
    }

    // Otherwise, use normal IFC raycasting at center
    const intersection = await this.castRay(syntheticEvent);
    
    if (intersection) {
      console.log('✅ Center-screen hit found:', intersection);
      const { modelId, localId, object } = intersection;
      
      await this.context.showIfcProperties(modelId, localId, object);
      this.highlightObject(object, modelId, localId);
    } else {
      console.log('❌ No object at center of screen');
      this.context.clearSelection();
    }
  }

  /**
   * Check if click intersects with a cluster mesh using THREE.js raycasting
   */
  public async checkClusterMeshClick(event: MouseEvent): Promise<{ modelId: string; expressID: number; mesh: THREE.Mesh; category: string } | null> {
    if (!this.context.world?.renderer?.three.domElement || !this.context.world.camera) {
      return null;
    }

    const container = this.context.world.renderer.three.domElement;
    const rect = container.getBoundingClientRect();
    
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    const camera = this.context.world.camera.three;
    raycaster.setFromCamera(mouse, camera);

    const scene = this.context.world.scene.three;
    const allMeshes: THREE.Mesh[] = [];
    
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData?.isClusterMesh) {
        allMeshes.push(object);
      }
    });

    if (allMeshes.length === 0) {
      return null;
    }

    const intersects = raycaster.intersectObjects(allMeshes, false);
    
    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh;
      const meshData = this.context.clusterModule?.getClusterMeshData(mesh);
      
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
   */
  public async castRay(event: MouseEvent): Promise<{ modelId: string; localId: number; object: THREE.Object3D } | null> {
    if (!this.context.world?.renderer?.three.domElement || !this.context.world.camera || !this.context.fragmentsManager) {
      return null;
    }

    const container = this.context.world.renderer.three.domElement;
    const mouse = new THREE.Vector2(event.clientX, event.clientY);

    const clipper = this.context.components.get(OBC.Clipper);
    const hasActiveClipping = clipper && clipper.list.size > 0;
    
    const allIntersections: Array<{ modelId: string; localId: number; object: THREE.Object3D; distance: number; point?: THREE.Vector3 }> = [];

    for (const [modelId, model] of this.context.fragmentsManager.list) {
      try {
        let results = null;
        if (typeof (model as any).raycastAll === 'function') {
          results = await (model as any).raycastAll({
            camera: this.context.world.camera.three,
            mouse: mouse,
            dom: container,
          });
          
          if (results && !Array.isArray(results)) {
            results = [results];
          }
        } else if (typeof (model as any).raycast === 'function') {
          const result = await (model as any).raycast({
            camera: this.context.world.camera.three,
            mouse: mouse,
            dom: container,
          });
          results = result ? [result] : [];
        } else {
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(mouse, this.context.world.camera.three);
          
          if (!model.object) continue;
          
          const intersects = raycaster.intersectObject(model.object, true);
          results = intersects.map(intersect => ({
            localId: intersect.object.userData?.localId,
            object: intersect.object,
            distance: intersect.distance,
            point: intersect.point,
          })).filter(r => r.localId !== undefined);
        }

        if (results && Array.isArray(results) && results.length > 0) {
          for (const result of results) {
            if (result && result.localId !== undefined) {
              allIntersections.push({
                modelId,
                localId: result.localId,
                object: result.object || result,
                distance: result.distance || Infinity,
                point: result.point,
              });
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Raycast failed for model ${modelId}:`, error);
      }
    }

    const visibleIntersections = allIntersections.filter(intersection => {
      return this.context.isPointVisible(intersection.point);
    });

    if (visibleIntersections.length > 0) {
      visibleIntersections.sort((a, b) => a.distance - b.distance);
      const closest = visibleIntersections[0];
      return {
        modelId: closest.modelId,
        localId: closest.localId,
        object: closest.object,
      };
    }

    return null;
  }

  /**
   * Highlights selected object
   */
  public highlightObject(object: THREE.Object3D, modelId?: string, localId?: number): void {
    if (!this.context.highlighter) return;

    try {
      this.context.highlighter.clear('select');
      
      if (object.userData?.isClusterMesh && object instanceof THREE.Mesh) {
        this.highlightClusterMesh(object);
        return;
      }
      
      if (modelId && localId !== undefined) {
        this.context.highlighter.highlightByID('select', { [modelId]: new Set([localId]) });
        return;
      }
      
      const mesh = object as any;
      if (mesh.fragment && mesh.id !== undefined) {
        const fragmentID = mesh.fragment.id;
        const expressID = mesh.id;
        this.context.highlighter.highlightByID('select', { [fragmentID]: new Set([expressID]) });
      }
    } catch (error) {
      console.warn('Could not highlight:', error);
    }
  }

  /**
   * Highlight a cluster mesh by changing its material
   */
  public highlightClusterMesh(mesh: THREE.Mesh): void {
    if (!mesh.userData.originalMaterial) {
      mesh.userData.originalMaterial = mesh.material;
    }
    
    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xb0e322,
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.DoubleSide,
      emissive: 0xb0e322,
      emissiveIntensity: 0.3
    });
    
    mesh.material = highlightMaterial;
  }

  /**
   * Helper to zoom to elements
   */
  public async zoomToElements(model: any, ids: number[]): Promise<void> {
    if (this.context.worldManager.world?.camera?.controls) {
       const bbox = await (model as any).getMergedBox(ids);
       if (bbox && !bbox.isEmpty()) {
         const center = new THREE.Vector3();
         bbox.getCenter(center);
         const size = new THREE.Vector3();
         bbox.getSize(size);
         const maxDim = Math.max(size.x, size.y, size.z);
         const dist = maxDim * 2.5;
         
         const isoVector = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(dist);
         const cameraPos = center.clone().add(isoVector);
         
         await this.context.worldManager.world.camera.controls.setLookAt(
           cameraPos.x, cameraPos.y, cameraPos.z,
           center.x, center.y, center.z,
           true
         );
       }
    }
  }
}
