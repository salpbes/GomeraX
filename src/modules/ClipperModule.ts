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

      // Delete all existing planes
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
    this.deleteAllPlanes();
    this.clipper = null;
    this.world = null;
    this.container = null;
    console.log('🧹 Clipper disposed');
  }
}
