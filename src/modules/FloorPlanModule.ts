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
  async openView(viewId: string): Promise<boolean> {
    try {
      console.log(`Opening floor plan view: ${viewId}`);
      
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

      // Switch to orthographic projection BEFORE opening the view
      if (camera.projection) {
        const currentProjection = camera.projection.current;
        if (currentProjection !== "Orthographic") {
          await camera.projection.set("Orthographic");
          console.log(`Switched to Orthographic projection`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Get the plane position and normal from the view
      const plane = view.plane;
      const normal = plane.normal as THREE.Vector3;
      const constant = plane.constant;
      
      // The plane position is along the normal
      const planePoint = new THREE.Vector3()
        .copy(normal)
        .multiplyScalar(-constant);
      
      console.log(`Plane normal: (${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)})`);
      console.log(`Plane constant: ${constant.toFixed(2)}`);
      console.log(`Plane point: (${planePoint.x.toFixed(2)}, ${planePoint.y.toFixed(2)}, ${planePoint.z.toFixed(2)})`);
      
      // Open the view FIRST (before positioning camera)
      // This initializes the view's internal camera
      this.views.open(viewId);
      console.log(`Opened view with clipping planes`);
      
      // Now sync world camera with view's camera
      if (view.camera) {
        console.log(`View has camera property`);
        const viewCam = view.camera;
        console.log(`View camera type:`, viewCam.constructor.name);
        
        // Copy view camera position and rotation to world camera
        if (viewCam.three) {
          const pos = viewCam.three.position;
          const target = new THREE.Vector3();
          viewCam.three.getWorldDirection(target);
          target.multiplyScalar(10).add(pos);
          
          console.log(`View camera position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
          console.log(`View camera target: (${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)})`);
          
          await camera.controls.setLookAt(
            pos.x, pos.y, pos.z,
            target.x, target.y, target.z,
            false
          );
        }
      } else {
        // Fallback: position camera perpendicular to plane
        console.log(`View has no camera, using plane geometry for positioning`);
        
        // Camera looks along the normal (perpendicular to the plane)
        const cameraPos = new THREE.Vector3()
          .copy(normal)
          .multiplyScalar(-view.range / 2)
          .add(planePoint);
        
        console.log(`Camera position: (${cameraPos.x.toFixed(2)}, ${cameraPos.y.toFixed(2)}, ${cameraPos.z.toFixed(2)})`);
        
        // Position camera to look at the clipping plane
        await camera.controls.setLookAt(
          cameraPos.x, cameraPos.y, cameraPos.z,
          planePoint.x, planePoint.y, planePoint.z,
          false
        );
      }
      
      console.log(`Camera positioned to view clipping plane`);
      
      // Configure postproduction for view display
      if (this.world.renderer) {
        const renderer = this.world.renderer as any;
        const postProduction = renderer.postproduction;
        const simpleScene = this.world.scene as OBC.SimpleScene;
        const sceneThree = simpleScene.three as THREE.Scene;
        
        // Save original settings for restoration
        (window as any).originalPostproductionStyle = postProduction.style;
        (window as any).originalBackground = sceneThree.background;
        
        // Use COLOR_PEN style (3) for optimal floor plan visibility
        // This shows actual geometry colors with outlines for clear architectural drawings
        postProduction.style = 3; // COLOR_PEN style - colors + outlines for perfect floor plan view
        console.log(`🎨 Set postproduction style to COLOR_PEN`);
        
        // Set white background for floor plans (better contrast than blue)
        sceneThree.background = new THREE.Color(0xFFFFFF);
        console.log(`⚪ Set background to white`);
        
        // Update postproduction camera
        if (postProduction.updateCamera) {
          postProduction.updateCamera();
          console.log(`📷 Updated postproduction camera`);
        }
        
        // Force renderer to update and display the clipped view
        renderer.update();
        console.log(`Renderer updated with new settings`);
      }
      
      // Set flag to prevent interference with other UI
      (window as any).isFloorPlanMode = true;
      
      // Enable Plan mode for interactive floor plan
      this.enableManualControls(camera);
      
      // Store current view ID
      this.currentViewId = viewId;
      
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

  /**
   * Dispose the module and clean up resources
   */
  dispose(): void {
    this.deleteAllViews();
    console.log('✅ FloorPlanModule disposed');
  }
}
