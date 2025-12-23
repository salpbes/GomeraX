/**
 * FloorPlanModule
 * Manages creation and display of 2D floor plan views from IFC building storeys
 */

import * as OBC from '@thatopen/components';
import * as THREE from 'three';

export interface StoreyInfo {
  modelId: string;
  name: string;
  elevation: number;
  localId: number;
}

export interface FloorPlanOpenViewOptions {
  /** When false, skips switching camera navigation mode and manual controls */
  interactive?: boolean;
  /** When false, the world camera is not synchronized with the view camera */
  syncCamera?: boolean;
  /** Control if renderer postproduction/background tweaks are applied */
  applyPostproduction?: boolean;
  /** When false, the camera navigation mode is not changed */
  setNavigationMode?: boolean;
}

export interface FloorPlanSnapshotOptions {
  offset?: number;
  range?: number;
}

export interface FloorPlanSnapshot {
  texture: THREE.Texture;
  width: number;
  height: number;
  center: THREE.Vector3;
  planeRight: THREE.Vector3;
  planeUp: THREE.Vector3;
  cameraFrustum: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    zoom: number;
  };
  cameraPosition: THREE.Vector3;
  planeNormal: THREE.Vector3;
  planeConstant: number;
  viewMatrix: THREE.Matrix4;
  frustumCenter: { x: number; y: number };
  dispose: () => void;
}

interface FloorPlanWorldStateSnapshot {
  cameraPosition: THREE.Vector3;
  cameraTarget: THREE.Vector3;
  cameraMode: string | null;
  projection: string | null;
  controlsEnabled: boolean;
  userInputEnabled?: boolean;
  postproductionStyle?: number;
  background: THREE.Color | THREE.Texture | null;
  isFloorPlanMode?: boolean;
}

export class FloorPlanModule {
  private components: OBC.Components;
  private views: OBC.Views;
  private world: OBC.World;
  private manualControlsActive = false;
  private currentViewId: string | null = null;
  private currentViewCamera: any = null;

  constructor(components: OBC.Components, world: OBC.World) {
    this.components = components;
    this.world = world;
    this.views = components.get(OBC.Views);
    this.views.world = world;
    
    OBC.Views.defaultRange = 100;
    
    console.log('✅ FloorPlanModule initialized');
  }

  /**
   * Get all building storeys from loaded models
   */
  async getAllStoreys(): Promise<StoreyInfo[]> {
    const fragments = this.components.get(OBC.FragmentsManager);
    const allStoreys: StoreyInfo[] = [];
    
    for (const [modelId, model] of fragments.list) {
      try {
        const storeys = await model.getItemsOfCategories([/BUILDINGSTOREY/]);
        const categoryKey = Object.keys(storeys).find(key => key.includes('BUILDINGSTOREY'));
        
        if (!categoryKey || !storeys[categoryKey]) {
          console.warn(`⚠️ No building storeys found in model: ${modelId}`);
          continue;
        }
        
        const localIds = storeys[categoryKey];
        
        if (localIds.length === 0) {
          console.warn(`⚠️ No storey IDs found in model: ${modelId}`);
          continue;
        }
        
        const data = await model.getItemsData(localIds, {
          attributesDefault: false,
          attributes: ['Name', 'LongName', 'Elevation']
        });
        
        for (const attrs of data) {
          const nameAttr = attrs.Name as any;
          const longNameAttr = attrs.LongName as any;
          const elevationAttr = attrs.Elevation as any;
          const idValue = attrs.id as unknown as number;
          
          const name = nameAttr?.value || longNameAttr?.value || 'Unknown Storey';
          const elevation = elevationAttr?.value || 0;
          
          allStoreys.push({
            modelId,
            name,
            elevation,
            localId: idValue
          });
        }
        
        console.log(`📊 Found ${localIds.length} storeys in model: ${modelId}`);
      } catch (error) {
        console.error(`❌ Error getting storeys from model ${modelId}:`, error);
      }
    }
    
    allStoreys.sort((a, b) => a.elevation - b.elevation);
    
    console.log(`✅ Total storeys found: ${allStoreys.length}`, allStoreys);
    
    return allStoreys;
  }

  /**
   * Create floor plan view for specific storey
   */
  async createFloorPlanView(storeyName: string, options?: {
    offset?: number;
    range?: number;
  }): Promise<OBC.View | null> {
    const offset = options?.offset ?? 1.5;
    const range = options?.range ?? 100;
    
    try {
      console.log(`🏗️ Creating floor plan view for storey: ${storeyName}`);
      
      if (this.views.list.has(storeyName)) {
        console.log(`ℹ️ View already exists for ${storeyName}, returning existing view`);
        return this.views.list.get(storeyName) || null;
      }
      
      const views = await this.views.createFromIfcStoreys({
        storeyNames: [new RegExp(storeyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))],
        world: this.world,
        offset
      });
      
      if (!views || views.length === 0) {
        console.error(`❌ Failed to create view for storey: ${storeyName}`);
        return null;
      }
      
      const [planView] = views;
      planView.range = range;
      planView.helpersVisible = false;
      
      console.log(`✅ Floor plan view created:`, {
        id: planView.id,
        storeyName,
        range,
        offset
      });
      
      const viewInList = this.views.list.has(planView.id);
      console.log(`📋 View "${planView.id}" in views list: ${viewInList}`);
      
      return planView;
    } catch (error) {
      console.error(`❌ Error creating floor plan view for ${storeyName}:`, error);
      throw error;
    }
  }


  /**
   * Open a floor plan view by ID
   */
  async openView(viewId: string, options: FloorPlanOpenViewOptions = {}): Promise<boolean> {
    try {
      console.log(`Opening floor plan view: ${viewId}`);

      const {
        interactive = true,
        syncCamera = true,
        applyPostproduction = true,
        setNavigationMode = interactive
      } = options;

      if (!this.views.list.has(viewId)) {
        console.error(`View not found: ${viewId}`);
        return false;
      }

      const camera = this.world.camera as any;
      const view = this.views.list.get(viewId) as any;

      if (!view) {
        console.error(`Could not get view object: ${viewId}`);
        return false;
      }

      if (syncCamera && camera.projection) {
        const currentProjection = camera.projection.current;
        if (currentProjection !== 'Orthographic') {
          await camera.projection.set('Orthographic');
          console.log('Switched to Orthographic projection');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const plane = view.plane;
      const normal = plane.normal as THREE.Vector3;
      const constant = plane.constant;
      const planePoint = new THREE.Vector3().copy(normal).multiplyScalar(-constant);

      console.log(`Plane normal: (${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)})`);
      console.log(`Plane constant: ${constant.toFixed(2)}`);
      console.log(`Plane point: (${planePoint.x.toFixed(2)}, ${planePoint.y.toFixed(2)}, ${planePoint.z.toFixed(2)})`);

      this.views.open(viewId);
      console.log('Opened view with clipping planes');

      if (syncCamera && view.camera) {
        const viewCam = view.camera;
        console.log('View camera type:', viewCam.constructor.name);

        if (viewCam.three) {
          const pos = viewCam.three.position;
          const target = new THREE.Vector3();
          viewCam.three.getWorldDirection(target);
          target.multiplyScalar(10).add(pos);

          console.log(`View camera position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
          console.log(`View camera target: (${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)})`);

          if (camera.controls?.setLookAt) {
            await camera.controls.setLookAt(
              pos.x, pos.y, pos.z,
              target.x, target.y, target.z,
              false
            );
          }
        }
      } else if (syncCamera) {
        console.log('View has no camera, using plane geometry for positioning');

        const cameraPos = new THREE.Vector3()
          .copy(normal)
          .multiplyScalar(-view.range / 2)
          .add(planePoint);

        console.log(`Camera position: (${cameraPos.x.toFixed(2)}, ${cameraPos.y.toFixed(2)}, ${cameraPos.z.toFixed(2)})`);

        if (camera.controls?.setLookAt) {
          await camera.controls.setLookAt(
            cameraPos.x, cameraPos.y, cameraPos.z,
            planePoint.x, planePoint.y, planePoint.z,
            false
          );
        }
      }

      if (applyPostproduction && this.world.renderer) {
        const renderer = this.world.renderer as any;
        const postProduction = renderer.postproduction;
        const simpleScene = this.world.scene as OBC.SimpleScene;
        const sceneThree = simpleScene.three as THREE.Scene;

        (window as any).originalPostproductionStyle = postProduction.style;
        (window as any).originalBackground = sceneThree.background;

        postProduction.style = 3;
        console.log('🎨 Set postproduction style to COLOR_PEN');

        sceneThree.background = new THREE.Color(0xFFFFFF);
        console.log('⚪ Set background to white');

        if (postProduction.updateCamera) {
          postProduction.updateCamera();
          console.log('📷 Updated postproduction camera');
        }

        renderer.update();
        console.log('Renderer updated with new settings');
      }

      if (!applyPostproduction && this.world.renderer) {
        const renderer = this.world.renderer as any;
        if (renderer.update) {
          renderer.update();
        }
      }

      if (interactive) {
        (window as any).isFloorPlanMode = true;

        if (setNavigationMode) {
          this.enableManualControls(camera);
        }

        this.currentViewId = viewId;
      }

      console.log(`Floor plan view ready: ${viewId}`);
      return true;
    } catch (error) {
      console.error(`Error opening view ${viewId}:`, error);
      return false;
    }
  }

  /**
   * Enable manual mouse controls for floor plan navigation
   */
  private enableManualControls(camera: any): void {
    // Switch to Plan navigation mode for floor plan interaction
    // Plan mode provides built-in pan/zoom controls optimized for 2D floor plans
    console.log('📍 Switching camera to Plan navigation mode');
    camera.set('Plan');
    
    // Ensure camera controls are enabled for Plan mode
    camera.controls.enabled = true;
    console.log('✅ Plan mode activated - pan/zoom controls are now active');
    
    this.manualControlsActive = true;
  }

  /**
   * Disable manual mouse controls
   */
  private disableManualControls(): void {
    const camera = this.world.camera as any;
    if (!camera || !this.manualControlsActive) return;

    // Switch back to Orbit navigation mode for 3D
    console.log('🔄 Switching camera back to Orbit navigation mode');
    camera.set('Orbit');
    
    this.manualControlsActive = false;
    console.log('✅ Orbit mode activated - 3D navigation restored');
  }

  /**
   * Close current view and return to 3D
   */
  async closeView(): Promise<void> {
    try {
      // Clear the current view ID first
      this.currentViewId = null;
      this.currentViewCamera = null;
      
      // Close the views (clipping planes)
      this.views.close();
      console.log(`✅ View clipping planes closed`);
      
      // Clear floor plan mode flag
      (window as any).isFloorPlanMode = false;
      console.log(`📷 Set isFloorPlanMode = false`);
      
      // Get camera reference
      const camera = this.world.camera as any;
      
      if (!camera) {
        console.error('❌ Camera not available');
        return;
      }
      
      // Mark controls as inactive immediately
      this.manualControlsActive = false;
      
      // Step 1: Disable Plan mode and switch to Orbit mode
      console.log(`🔄 Switching from Plan to Orbit mode...`);
      camera.set('Orbit');
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for mode switch
      console.log(`✅ Switched to Orbit mode`);
      
      // Step 2: Ensure user input is enabled
      if (camera.setUserInput) {
        camera.setUserInput(true);
        console.log(`✅ User input enabled`);
      }
      
      // Step 3: Ensure controls are enabled
      if (camera.controls) {
        camera.controls.enabled = true;
        // Re-initialize controls to clear any state from Plan mode
        if (camera.controls.dispose) {
          // Don't dispose, just ensure it's active
        }
        console.log(`✅ Controls enabled`);
      }
      
      // Step 4: Switch projection back to Perspective
      console.log(`📷 Switching to Perspective projection...`);
      if (camera.projection) {
        await camera.projection.set("Perspective");
        await new Promise(resolve => setTimeout(resolve, 50));
        console.log(`✅ Perspective projection activated`);
      }
      
      // Step 5: Restore postproduction settings
      if (this.world.renderer) {
        const renderer = this.world.renderer as any;
        const postProduction = renderer.postproduction;
        const simpleScene = this.world.scene as OBC.SimpleScene;
        const sceneThree = simpleScene.three as THREE.Scene;
        
        // Restore original postproduction style
        if ((window as any).originalPostproductionStyle !== undefined) {
          postProduction.style = (window as any).originalPostproductionStyle;
          console.log(`✅ Restored postproduction style to ${postProduction.style}`);
        }
        
        // Restore original background
        if ((window as any).originalBackground !== undefined) {
          sceneThree.background = (window as any).originalBackground;
          console.log(`✅ Restored background`);
        } else {
          // Set default background if not saved
          sceneThree.background = new THREE.Color(0x202932);
          console.log(`✅ Set default background`);
        }
        
        // Update postproduction camera to reflect perspective mode
        if (postProduction.updateCamera) {
          postProduction.updateCamera();
          console.log(`📷 Updated postproduction camera`);
        }
        
        // Update renderer
        renderer.update();
        console.log(`✅ Renderer updated`);
      }
      
      // Step 6: Fit camera to show all models
      await this.fitCameraToModels();
      
      console.log('✅ Closed floor plan view, returned to 3D with full controls restored');
    } catch (error) {
      console.error('❌ Error closing view:', error);
    }
  }

  /**
   * Fit camera to show all loaded models
   */
  private async fitCameraToModels(): Promise<void> {
    try {
      const fragments = this.components.get(OBC.FragmentsManager);
      const camera = this.world.camera as any;
      
      if (!camera || !camera.controls) {
        console.warn('⚠️ Camera controls not available');
        return;
      }

      const boundingBox = new THREE.Box3();
      for (const [, model] of fragments.list) {
        if ((model as any).object) {
          const modelBox = new THREE.Box3().setFromObject((model as any).object);
          boundingBox.union(modelBox);
        }
      }

      if (boundingBox.isEmpty()) {
        console.warn('⚠️ No models to fit camera to');
        return;
      }

      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      boundingBox.getCenter(center);
      boundingBox.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim * 1.5;
      const offset = distance / 1.414;
      
      await camera.controls.setLookAt(
        center.x + offset, center.y + offset, center.z + offset,
        center.x, center.y, center.z,
        true
      );
      
      console.log('📷 Camera fitted to models');
    } catch (error) {
      console.error('❌ Error fitting camera:', error);
    }
  }

  /**
   * Check if any view is currently open
   */
  hasOpenView(): boolean {
    return this.views.hasOpenViews;
  }

  /**
   * Get all created views
   */
  getCreatedViews(): Map<string, OBC.View> {
    return this.views.list;
  }

  /**
   * Delete a view
   */
  deleteView(storeyName: string): boolean {
    const deleted = this.views.list.delete(storeyName);
    if (deleted) {
      console.log(`🗑️ Deleted floor plan view: ${storeyName}`);
    }
    return deleted;
  }

  /**
   * Delete all views
   */
  deleteAllViews(): void {
    const count = this.views.list.size;
    this.views.list.clear();
    console.log(`🗑️ Deleted ${count} floor plan views`);
  }

  async captureFloorPlanSnapshot(storeyName: string, options?: FloorPlanSnapshotOptions): Promise<FloorPlanSnapshot | null> {
    const offset = options?.offset ?? 1.5;
    const range = options?.range ?? 100;

    try {
      const view = await this.createFloorPlanView(storeyName, { offset, range });
      if (!view) {
        console.warn(`⚠️ Unable to create floor plan view for snapshot: ${storeyName}`);
        return null;
      }

      const camera = this.world.camera as any;
      const renderer = this.world.renderer as any;
      const simpleScene = this.world.scene as OBC.SimpleScene;

      if (!camera || !renderer || !renderer.three || !simpleScene) {
        console.warn('⚠️ World renderer or camera unavailable for floor plan snapshot');
        return null;
      }

      const savedState = this.saveWorldStateForSnapshot(camera, renderer, simpleScene);
      let texture: THREE.CanvasTexture | null = null;

      try {
        // CRITICAL: Force orthographic projection FIRST
        if (camera.projection) {
          const currentProjection = camera.projection.current;
          console.log(`📷 Current projection before opening view: ${currentProjection}`);
          if (currentProjection !== 'Orthographic') {
            await camera.projection.set('Orthographic');
            await this.delay(100);
            console.log(`📷 Forced projection to Orthographic`);
          }
        }
        
        // Open floor plan view normally - let OBC handle the camera setup correctly
        const opened = await this.openView(view.id, {
          interactive: false,
          syncCamera: true,  // Let it sync - the view knows the correct orientation
          applyPostproduction: true,
          setNavigationMode: false
        });

        if (!opened) {
          console.warn(`⚠️ Failed to open floor plan view ${view.id} for snapshot capture`);
          return null;
        }

        console.log('📷 Floor plan view opened, waiting for render...');
        
        // Get the view camera (should be orthographic)
        const viewCamera = view.camera?.three as THREE.OrthographicCamera | undefined;
        if (!(viewCamera instanceof THREE.OrthographicCamera)) {
          console.warn('⚠️ Floor plan snapshot requires an orthographic camera');
          return null;
        }
        
        // Force projection back to orthographic if it switched
        if (camera.projection) {
          console.log(`📷 World camera projection after opening view: ${camera.projection.current}`);
          if (camera.projection.current !== 'Orthographic') {
            await camera.projection.set('Orthographic');
            await this.delay(50);
            console.log(`📷 Re-forced world camera projection to Orthographic`);
          }
        }
        
        console.log(`📷 View camera type: ${viewCamera.type}, isOrthographic: ${viewCamera.isOrthographicCamera}`);
        
        // Calculate floor plan center before rendering
        const plane = (view.plane as THREE.Plane) ?? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const floorCenter = new THREE.Vector3();
        const fragments = this.components.get(OBC.FragmentsManager);
        const floorBounds = new THREE.Box3();
        for (const [, model] of fragments.list) {
          if ((model as any).object) {
            floorBounds.union(new THREE.Box3().setFromObject((model as any).object));
          }
        }
        floorBounds.getCenter(floorCenter);
        plane.projectPoint(floorCenter, floorCenter);
        
        // Force camera to top-down position: directly above center, looking straight down
        const cameraHeight = Math.abs(plane.constant) + 50; // Height above the plane
        const targetCameraPos = new THREE.Vector3(floorCenter.x, floorCenter.y + cameraHeight, floorCenter.z);
        const targetLookAt = new THREE.Vector3(floorCenter.x, floorCenter.y, floorCenter.z);
        
        viewCamera.position.copy(targetCameraPos);
        viewCamera.lookAt(targetLookAt);
        viewCamera.up.set(0, 0, -1); // Set up vector for proper orientation
        viewCamera.updateMatrixWorld(true);
        
        console.log(`📷 Repositioned camera to: (${viewCamera.position.x.toFixed(2)}, ${viewCamera.position.y.toFixed(2)}, ${viewCamera.position.z.toFixed(2)})`);
        console.log(`📷 Looking at: (${floorCenter.x.toFixed(2)}, ${floorCenter.y.toFixed(2)}, ${floorCenter.z.toFixed(2)})`);
        
        // Give time for proper rendering - multiple animation frames
        await this.delay(100);
        
        // Force render using the view's orthographic camera
        const glRenderer: THREE.WebGLRenderer = renderer.three;
        const sceneObj = this.world.scene.three;
        
        // Re-apply camera position before each render (in case it gets reset)
        viewCamera.position.copy(targetCameraPos);
        viewCamera.lookAt(targetLookAt);
        viewCamera.updateMatrixWorld(true);
        glRenderer.render(sceneObj, viewCamera);
        
        await this.forceRendererUpdates(renderer);
        await this.delay(100);
        
        // Force multiple render frames to ensure scene is drawn with orthographic camera
        for (let i = 0; i < 3; i++) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          // Re-apply camera position before each render
          viewCamera.position.copy(targetCameraPos);
          viewCamera.lookAt(targetLookAt);
          viewCamera.updateMatrixWorld(true);
          glRenderer.render(sceneObj, viewCamera);
          if (renderer.update) renderer.update();
        }
        
        console.log('📷 Render completed, capturing canvas...');

        console.log(`📷 Capturing from camera at: (${viewCamera.position.x.toFixed(2)}, ${viewCamera.position.y.toFixed(2)}, ${viewCamera.position.z.toFixed(2)})`);

        const sourceCanvas = glRenderer.domElement;
        const snapshotCanvas = document.createElement('canvas');
        snapshotCanvas.width = sourceCanvas.width;
        snapshotCanvas.height = sourceCanvas.height;
        const ctx = snapshotCanvas.getContext('2d');

        if (!ctx) {
          console.warn('⚠️ Unable to access 2D context for floor plan snapshot');
          return null;
        }

        ctx.drawImage(sourceCanvas, 0, 0);

        texture = new THREE.CanvasTexture(snapshotCanvas);
        texture.needsUpdate = true;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.flipY = true;

        const zoom = viewCamera.zoom ?? 1;
        const width = (viewCamera.right - viewCamera.left) / zoom;
        const height = (viewCamera.top - viewCamera.bottom) / zoom;

        viewCamera.updateMatrixWorld(true);
        
        // Reuse the center we already calculated for camera positioning
        const center = floorCenter.clone();
        
        // Simple basis vectors for top-down view
        const planeRight = new THREE.Vector3(1, 0, 0);
        const planeUp = new THREE.Vector3(0, 0, -1);
        const planeNormal = plane.normal.clone().normalize();

        const snapshot: FloorPlanSnapshot = {
          texture,
          width,
          height,
          center: center.clone(),
          planeRight: planeRight.clone(),
          planeUp: planeUp.clone(),
          cameraFrustum: {
            left: viewCamera.left,
            right: viewCamera.right,
            top: viewCamera.top,
            bottom: viewCamera.bottom,
            zoom
          },
          cameraPosition: viewCamera.position.clone(),
          planeNormal: planeNormal.clone(),
          planeConstant: plane.constant,
          viewMatrix: viewCamera.matrixWorldInverse.clone(),
          frustumCenter: {
            x: (viewCamera.left + viewCamera.right) / (2 * zoom),
            y: (viewCamera.top + viewCamera.bottom) / (2 * zoom)
          },
          dispose: () => {
            if (texture) {
              texture.dispose();
              texture = null;
            }
          }
        };

        return snapshot;
      } finally {
        this.views.close();
        await this.restoreWorldStateAfterSnapshot(camera, renderer, simpleScene, savedState);
      }
    } catch (error) {
      console.error(`❌ Error capturing floor plan snapshot for ${storeyName}:`, error);
      return null;
    }
  }

  private saveWorldStateForSnapshot(camera: any, renderer: any, simpleScene: OBC.SimpleScene): FloorPlanWorldStateSnapshot {
    const savedTarget = new THREE.Vector3();
    if (camera.controls?.getTarget) {
      camera.controls.getTarget(savedTarget);
    } else if (camera.three?.getWorldDirection) {
      camera.three.getWorldDirection(savedTarget);
      savedTarget.multiplyScalar(10).add(camera.three.position);
    }

    const sceneThree = simpleScene.three as THREE.Scene;

    return {
      cameraPosition: camera.three?.position?.clone?.() ?? camera.position.clone(),
      cameraTarget: savedTarget.clone(),
      cameraMode: camera.mode?.id ?? null,
      projection: camera.projection?.current ?? null,
      controlsEnabled: camera.controls?.enabled ?? false,
      userInputEnabled: camera.userInputEnabled ?? true,
      postproductionStyle: renderer.postproduction?.style,
      background: sceneThree.background ?? null,
      isFloorPlanMode: (window as any).isFloorPlanMode
    };
  }

  private async restoreWorldStateAfterSnapshot(
    camera: any,
    renderer: any,
    simpleScene: OBC.SimpleScene,
    state: FloorPlanWorldStateSnapshot
  ): Promise<void> {
    try {
      if (camera.mode && state.cameraMode) {
        camera.set(state.cameraMode);
      }

      if (camera.projection && state.projection) {
        await camera.projection.set(state.projection);
      }

      if (camera.controls?.setLookAt) {
        await camera.controls.setLookAt(
          state.cameraPosition.x,
          state.cameraPosition.y,
          state.cameraPosition.z,
          state.cameraTarget.x,
          state.cameraTarget.y,
          state.cameraTarget.z,
          false
        );
        camera.controls.enabled = state.controlsEnabled;
      } else if (camera.three?.position) {
        camera.three.position.copy(state.cameraPosition);
        camera.three.lookAt(state.cameraTarget);
      }

      if (typeof camera.setUserInput === 'function' && typeof state.userInputEnabled === 'boolean') {
        camera.setUserInput(state.userInputEnabled);
      }

      const sceneThree = simpleScene.three as THREE.Scene;
      sceneThree.background = state.background ?? null;

      if (renderer.postproduction) {
        if (state.postproductionStyle !== undefined) {
          renderer.postproduction.style = state.postproductionStyle;
        }
        if (renderer.postproduction.updateCamera) {
          renderer.postproduction.updateCamera();
        }
      }

      if (renderer.update) {
        renderer.update();
      }

      (window as any).isFloorPlanMode = state.isFloorPlanMode;
    } catch (error) {
      console.warn('⚠️ Could not restore world state after snapshot:', error);
    }
  }

  private async forceRendererUpdates(renderer: any): Promise<void> {
    if (!renderer?.update) {
      await this.delay(200);
      return;
    }

    await this.delay(100);
    renderer.update();
    await this.delay(100);
    renderer.update();
    await this.delay(200);
    renderer.update();
  }

  private async delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private async alignSnapshotCamera(
    view: OBC.View,
    viewCamera: THREE.OrthographicCamera,
    worldCamera: any
  ): Promise<{
    center: THREE.Vector3;
    planeNormal: THREE.Vector3;
    planeConstant: number;
    planeRight: THREE.Vector3;
    planeUp: THREE.Vector3;
    frustumCenter: { x: number; y: number };
  }> {
    const plane = (view.plane as THREE.Plane) ?? null;
    const planeNormal = plane ? plane.normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const planeConstant = plane?.constant ?? 0;

    // Force top-down view - always use positive Y as normal (looking straight down)
    const normal = new THREE.Vector3(0, 1, 0);

    const bounds = this.getFragmentsBounds();
    const center = new THREE.Vector3();

    if (bounds) {
      center.copy(bounds.center);
    }

    // Project center onto the floor plan plane's Y coordinate if available
    if (plane && bounds) {
      const projectedCenter = new THREE.Vector3();
      plane.projectPoint(bounds.center, projectedCenter);
      center.x = bounds.center.x;
      center.y = projectedCenter.y;
      center.z = bounds.center.z;
    }

    if (center.lengthSq() === 0 && worldCamera?.controls?.getTarget) {
      worldCamera.controls.getTarget(center);
    }

    if (center.lengthSq() === 0 && bounds) {
      center.copy(bounds.center);
    }

    // Calculate distance above the floor plan - use building size
    const size = bounds?.size.length() ?? 10;
    const distance = Math.max(size * 1.5, 50);

    // Position camera directly above center, looking straight down
    const desiredPosition = center.clone();
    desiredPosition.y = center.y + distance;
    
    console.log(`📍 Alignment - Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
    console.log(`📍 Alignment - Desired camera position: (${desiredPosition.x.toFixed(2)}, ${desiredPosition.y.toFixed(2)}, ${desiredPosition.z.toFixed(2)})`);
    
    viewCamera.position.copy(desiredPosition);

    // Set up vector for proper orientation (Z- pointing up in viewport = north pointing up)
    const right = new THREE.Vector3(1, 0, 0);
    const upVector = new THREE.Vector3(0, 0, -1);

    // Force orthographic camera properties
    viewCamera.up.set(0, 0, -1);
    
    // Look directly down at center
    const lookTarget = center.clone();
    viewCamera.lookAt(lookTarget);
    
    // Verify the camera is actually looking down
    const direction = new THREE.Vector3();
    viewCamera.getWorldDirection(direction);
    console.log(`📍 Alignment - Camera direction after lookAt: (${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)})`);
    
    console.log(`📍 Alignment - Camera up vector: (${viewCamera.up.x.toFixed(2)}, ${viewCamera.up.y.toFixed(2)}, ${viewCamera.up.z.toFixed(2)})`);
    console.log(`📍 Alignment - Look target: (${lookTarget.x.toFixed(2)}, ${lookTarget.y.toFixed(2)}, ${lookTarget.z.toFixed(2)})`);
    
    viewCamera.updateMatrixWorld(true);

    if (bounds) {
      // For top-down view, use XZ extents directly with margin
      const margin = 1.15; // 15% margin
      const halfWidth = (bounds.size.x / 2) * margin;
      const halfHeight = (bounds.size.z / 2) * margin;
      
      viewCamera.left = -halfWidth;
      viewCamera.right = halfWidth;
      viewCamera.top = halfHeight;
      viewCamera.bottom = -halfHeight;
      viewCamera.zoom = 1;
      
      console.log(`📍 Set frustum for top-down view: width=${bounds.size.x.toFixed(2)}, height=${bounds.size.z.toFixed(2)}`);
      console.log(`📍 Camera frustum: left=${viewCamera.left.toFixed(2)}, right=${viewCamera.right.toFixed(2)}, top=${viewCamera.top.toFixed(2)}, bottom=${viewCamera.bottom.toFixed(2)}`);
      
      viewCamera.updateProjectionMatrix();
    }

    const cameraPosition = viewCamera.position.clone();
    const lookAtPromises: Promise<unknown>[] = [];

    const viewControls = (view.camera as any)?.controls;
    if (viewControls?.setLookAt) {
      lookAtPromises.push(
        viewControls.setLookAt(
          cameraPosition.x,
          cameraPosition.y,
          cameraPosition.z,
          center.x,
          center.y,
          center.z,
          false
        )
      );
    }

    if (worldCamera?.controls?.setLookAt) {
      lookAtPromises.push(
        worldCamera.controls.setLookAt(
          cameraPosition.x,
          cameraPosition.y,
          cameraPosition.z,
          center.x,
          center.y,
          center.z,
          false
        )
      );
    }

    if (lookAtPromises.length > 0) {
      await Promise.allSettled(lookAtPromises);
    } else {
      viewCamera.lookAt(center);
    }

    viewCamera.updateMatrixWorld(true);
    viewCamera.updateProjectionMatrix();

    const zoom = viewCamera.zoom ?? 1;
    const frustumCenter = {
      x: (viewCamera.left + viewCamera.right) / (2 * zoom),
      y: (viewCamera.top + viewCamera.bottom) / (2 * zoom)
    };

    return {
      center,
      planeNormal,
      planeConstant,
      planeRight: right.clone(),
      planeUp: upVector.clone(),
      frustumCenter
    };
  }

  private getFragmentsBounds(): { box: THREE.Box3; center: THREE.Vector3; size: THREE.Vector3 } | null {
    try {
      const fragments = this.components.get(OBC.FragmentsManager);
      const combined = new THREE.Box3();
      const temp = new THREE.Box3();

      for (const [, model] of fragments.list) {
        const modelBox = (model as any).box as THREE.Box3 | undefined;
        if (modelBox instanceof THREE.Box3) {
          combined.union(modelBox);
          continue;
        }

        if ((model as any).object) {
          temp.setFromObject((model as any).object);
          if (!temp.isEmpty()) {
            combined.union(temp);
          }
        }
      }

      if (combined.isEmpty()) {
        return null;
      }

      return {
        box: combined.clone(),
        center: combined.getCenter(new THREE.Vector3()),
        size: combined.getSize(new THREE.Vector3())
      };
    } catch (error) {
      console.warn('⚠️ Could not compute fragments bounds:', error);
      return null;
    }
  }

  private getBoundingBoxCorners(box: THREE.Box3): THREE.Vector3[] {
    const min = box.min;
    const max = box.max;

    return [
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(min.x, min.y, max.z),
      new THREE.Vector3(min.x, max.y, min.z),
      new THREE.Vector3(min.x, max.y, max.z),
      new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, max.z),
      new THREE.Vector3(max.x, max.y, min.z),
      new THREE.Vector3(max.x, max.y, max.z)
    ];
  }

  private computeCameraBoundsFromBox(
    box: THREE.Box3,
    camera: THREE.OrthographicCamera,
    marginRatio = 0.05
  ): { left: number; right: number; top: number; bottom: number } | null {
    const corners = this.getBoundingBoxCorners(box);
    if (corners.length === 0) {
      return null;
    }

    camera.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(camera.matrixWorld).invert();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const corner of corners) {
      const transformed = corner.clone().applyMatrix4(inverse);
      minX = Math.min(minX, transformed.x);
      maxX = Math.max(maxX, transformed.x);
      minY = Math.min(minY, transformed.y);
      maxY = Math.max(maxY, transformed.y);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return null;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const expandX = width * marginRatio;
    const expandY = height * marginRatio;

    const left = minX - expandX;
    const right = maxX + expandX;
    const bottom = minY - expandY;
    const top = maxY + expandY;

    return { left, right, top, bottom };
  }

  /**
   * Dispose the module and clean up resources
   */
  dispose(): void {
    this.deleteAllViews();
    console.log('✅ FloorPlanModule disposed');
  }
}
