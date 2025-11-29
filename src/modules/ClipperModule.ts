/**
 * Clipper Module
 * 
 * Provides sectioning/clipping functionality to cut through the model
 * and view the interior of the BIM model
 */

import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { WorldManager } from './WorldManager';
import type { ClipStylerModule } from './ClipStylerModule';

export class ClipperModule {
  private clipper: OBC.Clipper | null = null;
  private world: OBC.World | null = null;
  private container: HTMLElement | null = null;
  private isEnabled: boolean = false;
  private clipStyler: ClipStylerModule | null = null;
  
  // 3D Flip button meshes
  private flipButtons: Map<string, THREE.Group> = new Map();
  private flipButtonRaycaster: THREE.Raycaster = new THREE.Raycaster();
  private animationFrameId: number | null = null;
  private hoveredFlipButton: THREE.Group | null = null;
  
  // Colors matching the section arrow
  private static readonly FLIP_BUTTON_COLOR = 0xBB00FF; // Same as section arrow
  private static readonly FLIP_BUTTON_HOVER_COLOR = 0x00BFFF; // Cyan on hover

  constructor(private worldManager: WorldManager) {}

  /**
   * Initializes the clipper functionality
   * @param world - The OBC world instance
   * @param container - The HTML container element
   */
  public async initialize(world: OBC.World, container: HTMLElement): Promise<void> {
    try {
      this.world = world;
      this.container = container;

      const components = this.worldManager.getComponents();
      
      // Initialize Raycaster for detecting mouse intersections
      const casters = components.get(OBC.Raycasters);
      casters.get(world);

      // Get the Clipper component
      this.clipper = components.get(OBC.Clipper);
      this.clipper.enabled = false; // Start disabled, user can enable via UI

      // Setup event listeners
      this.setupEventListeners();
      
      // Setup flip button click handler
      this.setupFlipButtonClickHandler();
      
      // Hook into render loop to continuously update flip button positions and scale
      if (world.renderer && 'onBeforeUpdate' in world.renderer) {
        (world.renderer as any).onBeforeUpdate.add(() => {
          if (this.flipButtons.size > 0) {
            this.updateAllFlipButtonPositions();
          }
        });
      }

      console.log('✅ Clipper initialized (disabled by default)');
    } catch (error) {
      console.error('❌ Failed to initialize clipper:', error);
      throw error;
    }
  }

  /**
   * Sets up event listeners for creating and deleting clipping planes
   */
  private setupEventListeners(): void {
    if (!this.container || !this.world) return;

    // Double-click to create clipping plane
    this.container.addEventListener('dblclick', () => {
      if (this.clipper?.enabled && this.world) {
        this.createClippingPlane();
        // Disable raycast on newly created plane helpers
        this.disableClippingPlaneRaycast();
      }
    });

    // Delete/Backspace to remove clipping plane
    window.addEventListener('keydown', (event) => {
      if ((event.code === 'Delete' || event.code === 'Backspace') && 
          this.clipper?.enabled && this.world) {
        this.deleteClippingPlane();
      }
    });

    console.log('✅ Clipper event listeners setup');
  }

  /**
   * Creates a new clipping plane at the point of intersection with the model
   */
  private createClippingPlane(): void {
    if (!this.clipper || !this.world) return;

    try {
      this.clipper.create(this.world);
      console.log('✂️ Clipping plane created');
    } catch (error) {
      console.error('Failed to create clipping plane:', error);
    }
  }

  /**
   * Deletes the clipping plane under the mouse cursor
   */
  private deleteClippingPlane(): void {
    if (!this.clipper || !this.world) return;

    try {
      this.clipper.delete(this.world);
      console.log('🗑️ Clipping plane deleted');
    } catch (error) {
      console.error('Failed to delete clipping plane:', error);
    }
  }

  /**
   * Disables raycasting on all clipping plane helper meshes
   * This allows users to select building elements through/behind the clipping planes
   */
  private disableClippingPlaneRaycast(): void {
    if (!this.clipper) return;

    try {
      // Iterate through all clipping planes
      for (const [, plane] of this.clipper.list) {
        // Access the plane's mesh/helper objects
        // OBC clipping planes typically have a 'planeMesh' or helper geometry
        if ((plane as any).planeMesh) {
          const planeMesh = (plane as any).planeMesh as THREE.Mesh;
          // Disable raycasting by overriding the raycast method
          planeMesh.raycast = () => {};
        }
        
        // Also check for helper objects in the plane's children
        if ((plane as any).three && (plane as any).three.parent) {
          const parent = (plane as any).three.parent as THREE.Object3D;
          parent.traverse((child: THREE.Object3D) => {
            // Disable raycast for any mesh children (plane helpers, arrows, etc.)
            if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
              child.raycast = () => {};
            }
          });
        }
      }
      
      // Also disable raycasting on section fill meshes created by ClipStyler
      if (this.clipStyler) {
        this.clipStyler.disableSectionFillRaycast();
      }
      
      console.log('🎯 Clipping plane raycasting disabled - objects can now be selected through planes');
    } catch (error) {
      console.warn('⚠️ Could not disable clipping plane raycast:', error);
    }
  }

  /**
   * Sets the ClipStyler module reference
   * @param clipStyler - The ClipStylerModule instance
   */
  public setClipStylerModule(clipStyler: ClipStylerModule): void {
    this.clipStyler = clipStyler;
  }

  /**
   * Sets up click handler for 3D flip buttons
   */
  private setupFlipButtonClickHandler(): void {
    if (!this.container || !this.world) return;

    // Click handler
    this.container.addEventListener('click', (event) => {
      if (!this.world?.camera || this.flipButtons.size === 0) return;

      const rect = this.container!.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      this.flipButtonRaycaster.setFromCamera(mouse, this.world.camera.three);
      
      // Collect all meshes from all flip button groups for raycasting
      const allMeshes: THREE.Object3D[] = [];
      for (const group of this.flipButtons.values()) {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            allMeshes.push(child);
          }
        });
      }
      
      const intersects = this.flipButtonRaycaster.intersectObjects(allMeshes, false);

      if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        const planeId = clickedObject.userData.planeId;
        
        if (planeId) {
          this.flipSinglePlane(planeId);
          event.stopPropagation();
        }
      }
    });
    
    // Hover handler for color change
    this.container.addEventListener('mousemove', (event) => {
      if (!this.world?.camera || this.flipButtons.size === 0) return;

      const rect = this.container!.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      this.flipButtonRaycaster.setFromCamera(mouse, this.world.camera.three);
      
      // Collect all meshes from all flip button groups for raycasting
      const allMeshes: THREE.Object3D[] = [];
      for (const group of this.flipButtons.values()) {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            allMeshes.push(child);
          }
        });
      }
      
      const intersects = this.flipButtonRaycaster.intersectObjects(allMeshes, false);

      if (intersects.length > 0) {
        const hitObject = intersects[0].object;
        const planeId = hitObject.userData.planeId;
        const hoveredGroup = planeId ? this.flipButtons.get(planeId) : null;
        
        if (hoveredGroup && hoveredGroup !== this.hoveredFlipButton) {
          // Reset previous hovered button
          if (this.hoveredFlipButton) {
            this.setFlipButtonColor(this.hoveredFlipButton, ClipperModule.FLIP_BUTTON_COLOR);
          }
          // Set new hovered button to hover color
          this.setFlipButtonColor(hoveredGroup, ClipperModule.FLIP_BUTTON_HOVER_COLOR);
          this.hoveredFlipButton = hoveredGroup;
          this.container!.style.cursor = 'pointer';
        }
      } else {
        // Reset hovered button when not hovering
        if (this.hoveredFlipButton) {
          this.setFlipButtonColor(this.hoveredFlipButton, ClipperModule.FLIP_BUTTON_COLOR);
          this.hoveredFlipButton = null;
          this.container!.style.cursor = '';
        }
      }
    });
  }
  
  /**
   * Sets the color of all arrow meshes in a flip button group
   */
  private setFlipButtonColor(buttonGroup: THREE.Group, color: number): void {
    buttonGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
        // Change color of all arrow parts
        if (child.userData.isArrow) {
          child.material.color.setHex(color);
        }
      }
    });
  }

  /**
   * Creates a 3D flip button as double arrows pointing in opposite directions
   */
  private createFlipButton(planeId: string, clipping: OBC.SimplePlane): void {
    if (!this.world?.scene) return;

    const buttonGroup = new THREE.Group();
    
    // Arrow dimensions - make them bigger and more visible
    const coneRadius = 0.08;
    const coneHeight = 0.15;
    const stemRadius = 0.025;
    const stemHeight = 0.12;
    const spacing = 0.12; // Space between the two arrows on Z axis (perpendicular to both Y and X)
    
    // Material for arrows - same color as section arrow, always visible
    const arrowMaterial = new THREE.MeshBasicMaterial({ 
      color: ClipperModule.FLIP_BUTTON_COLOR,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    
    // === First arrow pointing UP (on negative Z) ===
    const stem1Geometry = new THREE.CylinderGeometry(stemRadius, stemRadius, stemHeight, 8);
    const stem1 = new THREE.Mesh(stem1Geometry, arrowMaterial.clone());
    stem1.position.set(0, stemHeight / 2, -spacing);
    stem1.renderOrder = 999;
    stem1.userData.isArrow = true;
    buttonGroup.add(stem1);
    
    const cone1Geometry = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
    const cone1 = new THREE.Mesh(cone1Geometry, arrowMaterial.clone());
    cone1.position.set(0, stemHeight + coneHeight / 2, -spacing);
    cone1.renderOrder = 999;
    cone1.userData.isArrow = true;
    buttonGroup.add(cone1);
    
    // === Second arrow pointing DOWN (on positive Z) ===
    const stem2Geometry = new THREE.CylinderGeometry(stemRadius, stemRadius, stemHeight, 8);
    const stem2 = new THREE.Mesh(stem2Geometry, arrowMaterial.clone());
    stem2.position.set(0, -stemHeight / 2, spacing);
    stem2.renderOrder = 999;
    stem2.userData.isArrow = true;
    buttonGroup.add(stem2);
    
    const cone2Geometry = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
    const cone2 = new THREE.Mesh(cone2Geometry, arrowMaterial.clone());
    cone2.position.set(0, -(stemHeight + coneHeight / 2), spacing);
    cone2.rotation.x = Math.PI; // Flip upside down
    cone2.renderOrder = 999;
    cone2.userData.isArrow = true;
    buttonGroup.add(cone2);
    
    // Set high render order on the group itself
    buttonGroup.renderOrder = 999;
    
    // Store reference to plane ID on all meshes for raycasting
    buttonGroup.userData.planeId = planeId;
    buttonGroup.userData.isFlipButton = true;
    buttonGroup.traverse((child) => {
      child.userData.planeId = planeId;
      child.userData.isFlipButton = true;
    });

    this.world.scene.three.add(buttonGroup);
    this.flipButtons.set(planeId, buttonGroup);
    
    // Position the button next to the arrow
    this.updateFlipButtonPosition(planeId, clipping);

    console.log(`🔄 Flip button created for plane ${planeId}, children: ${buttonGroup.children.length}`);
  }
  
  /**
   * Updates a single flip button position to be next to the clipping plane arrow
   */
  private updateFlipButtonPosition(planeId: string, clipping: OBC.SimplePlane): void {
    const flipButton = this.flipButtons.get(planeId);
    if (!flipButton || !clipping.three) return;

    try {
      const helper = clipping.helper;
      if (helper) {
        // Get the helper's world position (this is where the arrow is)
        const helperWorldPos = new THREE.Vector3();
        helper.getWorldPosition(helperWorldPos);
        
        const plane = clipping.three;
        const normal = plane.normal.clone().normalize();
        
        // Calculate scale based on camera distance (same behavior as section arrow)
        let scaleFactor = 1;
        if (this.world?.camera?.three) {
          const camera = this.world.camera.three;
          const cameraPos = new THREE.Vector3();
          camera.getWorldPosition(cameraPos);
          const distance = cameraPos.distanceTo(helperWorldPos);
          // Scale factor: bigger when far away, smaller when close
          // Base scale at distance 10, adjust proportionally
          scaleFactor = Math.max(0.3, Math.min(3, distance / 10));
        }
        
        // Apply scale to flip button
        flipButton.scale.setScalar(scaleFactor);
        
        // Calculate perpendicular offset direction (to the side of the arrow)
        let sideDir = new THREE.Vector3();
        const upVector = new THREE.Vector3(0, 1, 0);
        
        // If normal is nearly parallel to up, use a different reference
        if (Math.abs(normal.dot(upVector)) > 0.9) {
          sideDir.crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize();
        } else {
          sideDir.crossVectors(normal, upVector).normalize();
        }
        
        // Position: at the helper position + offset to the side + forward offset along normal
        // Scale offsets with distance so they remain proportional
        const sideOffset = sideDir.clone().multiplyScalar(0.4 * scaleFactor);
        const forwardOffset = normal.clone().multiplyScalar(0.4 * scaleFactor); // Push more in front of the plane
        flipButton.position.copy(helperWorldPos).add(sideOffset).add(forwardOffset);
        
        // Rotate to align with the plane normal direction
        // The arrows (built along Y axis) should point along the normal
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        flipButton.quaternion.copy(quaternion);
      }
    } catch (error) {
      // Fallback: position based on plane math
      const plane = clipping.three;
      const point = plane.normal.clone().multiplyScalar(-plane.constant);
      flipButton.position.copy(point);
      
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), plane.normal.clone().normalize());
      flipButton.quaternion.copy(quaternion);
    }
  }

  /**
   * Updates all flip button positions to follow their clipping planes
   */
  private updateAllFlipButtonPositions(): void {
    if (!this.clipper) return;

    for (const [planeId, clipping] of this.clipper.list) {
      if (clipping.three) {
        this.updateFlipButtonPosition(planeId, clipping);
      }
    }
  }
  
  /**
   * Starts continuous position updates for flip buttons (called during dragging)
   */
  private startFlipButtonUpdates(): void {
    if (this.animationFrameId !== null) return;
    
    const update = () => {
      this.updateAllFlipButtonPositions();
      this.animationFrameId = requestAnimationFrame(update);
    };
    this.animationFrameId = requestAnimationFrame(update);
  }
  
  /**
   * Stops continuous position updates for flip buttons
   */
  private stopFlipButtonUpdates(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Removes flip button for a specific plane
   */
  private removeFlipButton(planeId: string): void {
    const buttonGroup = this.flipButtons.get(planeId);
    if (buttonGroup && this.world?.scene) {
      this.world.scene.three.remove(buttonGroup);
      
      // Dispose all geometries and materials in the group
      buttonGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      
      this.flipButtons.delete(planeId);
    }
  }

  /**
   * Removes all flip buttons
   */
  private removeAllFlipButtons(): void {
    for (const planeId of this.flipButtons.keys()) {
      this.removeFlipButton(planeId);
    }
  }

  /**
   * Flips a single clipping plane by its ID
   */
  private flipSinglePlane(planeId: string): void {
    if (!this.clipper || !this.world) return;

    const clipping = this.clipper.list.get(planeId);
    if (!clipping?.three) return;

    try {
      const plane = clipping.three;
      const flippedNormal = plane.normal.clone().negate();
      const point = plane.normal.clone().multiplyScalar(-plane.constant);

      // Delete the old plane
      this.clipper.delete(this.world, planeId);
      this.removeFlipButton(planeId);

      // Create new plane with flipped normal
      this.clipper.createFromNormalAndCoplanarPoint(this.world, flippedNormal, point);

      // Disable raycast and create new flip button
      setTimeout(() => {
        this.disableClippingPlaneRaycast();
        this.createFlipButtonsForAllPlanes();
      }, 100);

      console.log(`🔄 Flipped plane ${planeId}`);
    } catch (error) {
      console.error('Failed to flip plane:', error);
    }
  }

  /**
   * Creates flip buttons for all existing clipping planes and subscribes to drag events
   */
  private createFlipButtonsForAllPlanes(): void {
    if (!this.clipper) return;

    // Remove existing buttons first
    this.removeAllFlipButtons();

    for (const [planeId, clipping] of this.clipper.list) {
      if (clipping.three) {
        this.createFlipButton(planeId, clipping);
        
        // Subscribe to drag events to update flip button position
        clipping.onDraggingStarted.add(() => {
          this.startFlipButtonUpdates();
        });
        
        clipping.onDraggingEnded.add(() => {
          this.stopFlipButtonUpdates();
          // Final position update
          this.updateFlipButtonPosition(planeId, clipping);
        });
      }
    }
  }

  /**
   * Enables or disables the clipper
   */
  public setEnabled(enabled: boolean): void {
    if (this.clipper) {
      this.clipper.enabled = enabled;
      this.isEnabled = enabled;
      console.log(`✂️ Clipper ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Toggles clipper enabled state
   */
  public toggle(): void {
    this.setEnabled(!this.isEnabled);
  }

  /**
   * Returns whether the clipper is currently enabled
   */
  public getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Creates a preset clipping plane along the X axis
   */
  public createXAxisPlane(): void {
    if (!this.clipper || !this.world) return;

    try {
      const components = this.worldManager.getComponents();
      const fragments = components.get(OBC.FragmentsManager);
      
      if (fragments.list.size === 0) {
        console.warn('No models loaded');
        return;
      }

      // Delete any existing planes before creating new one
      this.deleteAllPlanes();

      // Get model center
      const bbox = components.get(OBC.BoundingBoxer);
      bbox.list.clear();
      bbox.addFromModels();
      const box = bbox.get();
      const center = box.getCenter(new THREE.Vector3());

      // Create plane perpendicular to X axis (normal points in X direction)
      const normal = new THREE.Vector3(1, 0, 0);
      this.clipper.createFromNormalAndCoplanarPoint(this.world, normal, center);
      
      // Disable raycast on plane helpers to allow selecting objects behind them
      this.disableClippingPlaneRaycast();
      
      // Create flip button after a short delay to ensure plane is ready
      setTimeout(() => this.createFlipButtonsForAllPlanes(), 100);
      
      console.log('✂️ X-axis clipping plane created');
    } catch (error) {
      console.error('Failed to create X-axis plane:', error);
    }
  }

  /**
   * Creates a preset clipping plane along the Y axis (horizontal section)
   */
  public createYAxisPlane(): void {
    if (!this.clipper || !this.world) return;

    try {
      const components = this.worldManager.getComponents();
      const fragments = components.get(OBC.FragmentsManager);
      
      if (fragments.list.size === 0) {
        console.warn('No models loaded');
        return;
      }

      // Delete any existing planes before creating new one
      this.deleteAllPlanes();

      // Get model center
      const bbox = components.get(OBC.BoundingBoxer);
      bbox.list.clear();
      bbox.addFromModels();
      const box = bbox.get();
      const center = box.getCenter(new THREE.Vector3());

      // Create plane perpendicular to Z axis (horizontal cut - top view section)
      const normal = new THREE.Vector3(0, 0, 1);
      this.clipper.createFromNormalAndCoplanarPoint(this.world, normal, center);
      
      // Disable raycast on plane helpers to allow selecting objects behind them
      this.disableClippingPlaneRaycast();
      
      // Create flip button after a short delay to ensure plane is ready
      setTimeout(() => this.createFlipButtonsForAllPlanes(), 100);
      
      console.log('✂️ Y-axis clipping plane created (horizontal section)');
    } catch (error) {
      console.error('Failed to create Y-axis plane:', error);
    }
  }

  /**
   * Creates a preset clipping plane along the Z axis (vertical section)
   */
  public createZAxisPlane(): void {
    if (!this.clipper || !this.world) return;

    try {
      const components = this.worldManager.getComponents();
      const fragments = components.get(OBC.FragmentsManager);
      
      if (fragments.list.size === 0) {
        console.warn('No models loaded');
        return;
      }

      // Delete any existing planes before creating new one
      this.deleteAllPlanes();

      // Get model center
      const bbox = components.get(OBC.BoundingBoxer);
      bbox.list.clear();
      bbox.addFromModels();
      const box = bbox.get();
      const center = box.getCenter(new THREE.Vector3());

      // Create plane perpendicular to Y axis (vertical cut - front view section)
      const normal = new THREE.Vector3(0, 1, 0);
      this.clipper.createFromNormalAndCoplanarPoint(this.world, normal, center);
      
      // Disable raycast on plane helpers to allow selecting objects behind them
      this.disableClippingPlaneRaycast();
      
      // Create flip button after a short delay to ensure plane is ready
      setTimeout(() => this.createFlipButtonsForAllPlanes(), 100);
      
      console.log('✂️ Z-axis clipping plane created (vertical section)');
    } catch (error) {
      console.error('Failed to create Z-axis plane:', error);
    }
  }

  /**
   * Toggles the visibility of all clipping planes
   */
  public toggleClippingPlanesVisibility(): void {
    if (!this.clipper) return;

    for (const [, clipping] of this.clipper.list) {
      clipping.visible = !clipping.visible;
    }
    console.log('👁️ Clipping planes visibility toggled');
  }

  /**
   * Toggles whether clipping planes are actively cutting the model
   */
  public toggleClippingPlanesEnabled(): void {
    if (!this.clipper) return;

    for (const [, clipping] of this.clipper.list) {
      clipping.enabled = !clipping.enabled;
    }
    console.log('✂️ Clipping planes enabled state toggled');
  }

  /**
   * Flips all clipping planes to show the other side
   */
  public flipClippingPlanes(): void {
    if (!this.clipper || !this.world) return;

    try {
      // Store current plane information before deleting
      const planeData: Array<{ normal: THREE.Vector3; point: THREE.Vector3 }> = [];
      
      for (const [, clipping] of this.clipper.list) {
        if (clipping.three) {
          const plane = clipping.three;
          // Store the flipped normal and a point on the plane
          const flippedNormal = plane.normal.clone().negate();
          const point = plane.normal.clone().multiplyScalar(-plane.constant);
          planeData.push({ normal: flippedNormal, point });
        }
      }

      // Delete all existing planes (this also removes flip buttons)
      this.deleteAllPlanes();

      // Create new planes with flipped normals
      for (const data of planeData) {
        this.clipper.createFromNormalAndCoplanarPoint(
          this.world,
          data.normal,
          data.point
        );
      }

      // Disable raycast on recreated plane helpers
      this.disableClippingPlaneRaycast();
      
      // Recreate flip buttons for the new planes
      setTimeout(() => this.createFlipButtonsForAllPlanes(), 150);

      console.log('🔄 Clipping planes flipped');
    } catch (error) {
      console.error('Failed to flip clipping planes:', error);
    }
  }

  /**
   * Deletes all clipping planes
   */
  public deleteAllPlanes(): void {
    if (!this.clipper || !this.world) return;

    try {
      // Remove all flip buttons first
      this.removeAllFlipButtons();
      
      // Get all plane IDs before deleting
      const planeIds = Array.from(this.clipper.list.keys());
      
      // Delete each plane by ID
      for (const planeId of planeIds) {
        this.clipper.delete(this.world, planeId);
      }
      
      console.log('🗑️ All clipping planes deleted');
    } catch (error) {
      console.error('Error deleting planes:', error);
      // If that fails, try disposing all planes
      try {
        for (const [, plane] of this.clipper.list) {
          plane.enabled = false;
          plane.visible = false;
        }
        this.clipper.list.clear();
        console.log('🗑️ Clipping planes cleared (fallback method)');
      } catch (e) {
        console.error('Failed to clear planes:', e);
      }
    }
  }

  /**
   * Returns the number of active clipping planes
   */
  public getPlaneCount(): number {
    return this.clipper?.list.size || 0;
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    // Stop any ongoing animation updates
    this.stopFlipButtonUpdates();
    
    // Remove all planes and flip buttons
    this.deleteAllPlanes();
    
    this.clipper = null;
    this.world = null;
    this.container = null;
    console.log('🧹 Clipper disposed');
  }
}
