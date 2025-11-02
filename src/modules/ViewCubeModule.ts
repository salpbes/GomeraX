/**
 * View Cube Module
 * 
 * Provides a 3D navigation cube for easy camera orientation
 */

import * as OBC from '@thatopen/components';
import * as BUI from '@thatopen/ui';
import { WorldManager } from './WorldManager';

export class ViewCubeModule {
  private world: OBC.World | null = null;
  private viewCube: any = null;
  private container: HTMLElement | null = null;

  constructor(private worldManager: WorldManager) {}

  /**
   * Initializes the view cube
   * @param world - The OBC world instance
   * @param container - The HTML container element (same as renderer container)
   */
  public async initialize(world: OBC.World, container: HTMLElement): Promise<void> {
    try {
      this.world = world;
      this.container = container;

      // Create the view cube element (custom element from @thatopen/ui-obc)
      this.viewCube = document.createElement('bim-view-cube');
      
      if (!this.viewCube) {
        console.warn('⚠️ Could not create view cube element');
        return;
      }
      
      // Connect to the camera's Three.js instance
      this.viewCube.camera = world.camera.three;
      
      // Append to the same container as the renderer (critical for proper layering)
      container.appendChild(this.viewCube);
      
      // Keep the view cube orientation updated as the camera moves
      if (world.camera.controls) {
        world.camera.controls.addEventListener('update', () => {
          if (this.viewCube && typeof this.viewCube.updateOrientation === 'function') {
            this.viewCube.updateOrientation();
          }
        });
      }
      
      // Add face click event listeners for camera orientation
      this.setupFaceClickHandlers(world);
      
      // Style the view cube
      this.styleViewCube();
      
      console.log('✅ View Cube initialized');
    } catch (error) {
      console.error('❌ Failed to initialize view cube:', error);
      console.log('Continuing without view cube...');
    }
  }

  /**
   * Applies custom styling to the view cube
   */
  private styleViewCube(): void {
    if (!this.viewCube) return;
    
    // Position the view cube in the top-right corner of the container
    this.viewCube.style.position = 'absolute';
    this.viewCube.style.top = '20px';
    this.viewCube.style.right = '20px';
    this.viewCube.style.width = '120px';
    this.viewCube.style.height = '120px';
    this.viewCube.style.zIndex = '100';
    this.viewCube.style.pointerEvents = 'auto';
    
    // Ensure the container has position relative
    if (this.container) {
      const computedPosition = window.getComputedStyle(this.container).position;
      if (computedPosition === 'static') {
        this.container.style.position = 'relative';
      }
    }
  }

  /**
   * Sets up click event listeners for view cube faces to align camera
   */
  private setupFaceClickHandlers(world: OBC.World): void {
    if (!this.viewCube) return;

    console.log('🎯 Setting up view cube face handlers...');

    // Get the BoundingBoxer component to calculate camera orientations
    const components = this.worldManager.getComponents();
    const boxer = components.get(OBC.BoundingBoxer);
    const fragments = components.get(OBC.FragmentsManager);

    // Listen to the click event and determine which face was clicked
    this.viewCube.addEventListener('click', async (e: any) => {
      console.log('🖱️ View cube clicked');
      console.log('Event target:', e.target);
      console.log('Event detail:', e.detail);
      console.log('Event composedPath:', e.composedPath());
      
      // Try to find which face was clicked by checking the target element
      const path = e.composedPath();
      let clickedFace = null;
      
      for (const element of path) {
        if (element.className && typeof element.className === 'string') {
          console.log('Checking element class:', element.className);
          
          // Look for face class names
          if (element.className.includes('face-front')) clickedFace = 'front';
          else if (element.className.includes('face-back')) clickedFace = 'back';
          else if (element.className.includes('face-left')) clickedFace = 'left';
          else if (element.className.includes('face-right')) clickedFace = 'right';
          else if (element.className.includes('face-top')) clickedFace = 'top';
          else if (element.className.includes('face-bottom')) clickedFace = 'bottom';
          
          if (clickedFace) break;
        }
      }
      
      if (!clickedFace) {
        console.warn('Could not determine which face was clicked');
        return;
      }
      
      console.log(`🎯 Detected face: ${clickedFace}`);
      
      try {
        const camera = world.camera;
        if (!camera.hasCameraControls()) {
          console.warn('Camera controls not available');
          return;
        }

        // Check if there are any models loaded
        if (fragments.list.size === 0) {
          console.warn('No models loaded yet');
          return;
        }

        console.log(`Processing ${clickedFace} view for ${fragments.list.size} models`);

        // Clear previous boxes and add all loaded models to the boxer
        boxer.list.clear();
        boxer.addFromModels();

        // Get the optimal camera position and target for this orientation
        const { position, target } = await boxer.getCameraOrientation(clickedFace as any);
        
        console.log(`Camera position:`, position);
        console.log(`Camera target:`, target);
        
        // Smoothly animate camera to the new position
        await camera.controls.setLookAt(
          position.x,
          position.y,
          position.z,
          target.x,
          target.y,
          target.z,
          true // enable smooth transition
        );

        console.log(`📐 Camera aligned to ${clickedFace} view`);
      } catch (error) {
        console.error(`Failed to align camera to ${clickedFace}:`, error);
      }
    });

    console.log('✅ View cube click handler setup');
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    if (this.viewCube && this.viewCube.parentElement) {
      this.viewCube.parentElement.removeChild(this.viewCube);
    }
    this.viewCube = null;
    this.world = null;
    console.log('🧹 View Cube disposed');
  }
}
