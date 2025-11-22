/**
 * View Cube Module
 * 
 * Provides a 3D navigation cube for easy camera orientation
 */

import * as OBC from '@thatopen/components';
import * as BUI from '@thatopen/ui';
import * as THREE from 'three';
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

      // Augment the view cube with corners and edges
      this.augmentViewCube();
      
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
      
      // Try to find which face was clicked by checking the target element
      const path = e.composedPath();
      let clickedFace = null;
      
      for (const element of path) {
        if (element.className && typeof element.className === 'string') {
          const cls = element.className;
          
          // Corners
          if (cls.includes('corner-top-front-right')) clickedFace = 'top-front-right';
          else if (cls.includes('corner-top-front-left')) clickedFace = 'top-front-left';
          else if (cls.includes('corner-top-back-right')) clickedFace = 'top-back-right';
          else if (cls.includes('corner-top-back-left')) clickedFace = 'top-back-left';
          else if (cls.includes('corner-bottom-front-right')) clickedFace = 'bottom-front-right';
          else if (cls.includes('corner-bottom-front-left')) clickedFace = 'bottom-front-left';
          else if (cls.includes('corner-bottom-back-right')) clickedFace = 'bottom-back-right';
          else if (cls.includes('corner-bottom-back-left')) clickedFace = 'bottom-back-left';
          
          // Edges
          else if (cls.includes('edge-top-front')) clickedFace = 'top-front';
          else if (cls.includes('edge-top-back')) clickedFace = 'top-back';
          else if (cls.includes('edge-top-left')) clickedFace = 'top-left';
          else if (cls.includes('edge-top-right')) clickedFace = 'top-right';
          else if (cls.includes('edge-bottom-front')) clickedFace = 'bottom-front';
          else if (cls.includes('edge-bottom-back')) clickedFace = 'bottom-back';
          else if (cls.includes('edge-bottom-left')) clickedFace = 'bottom-left';
          else if (cls.includes('edge-bottom-right')) clickedFace = 'bottom-right';
          else if (cls.includes('edge-front-left')) clickedFace = 'front-left';
          else if (cls.includes('edge-front-right')) clickedFace = 'front-right';
          else if (cls.includes('edge-back-left')) clickedFace = 'back-left';
          else if (cls.includes('edge-back-right')) clickedFace = 'back-right';

          // Faces
          else if (cls.includes('face-front')) clickedFace = 'front';
          else if (cls.includes('face-back')) clickedFace = 'back';
          else if (cls.includes('face-left')) clickedFace = 'left';
          else if (cls.includes('face-right')) clickedFace = 'right';
          else if (cls.includes('face-top')) clickedFace = 'top';
          else if (cls.includes('face-bottom')) clickedFace = 'bottom';
          
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

        let position: THREE.Vector3;
        let target: THREE.Vector3;

        if (['front', 'back', 'left', 'right', 'top', 'bottom'].includes(clickedFace)) {
          // Use standard BoundingBoxer for cardinal directions
          const result = await boxer.getCameraOrientation(clickedFace as any);
          position = result.position;
          target = result.target;
        } else {
          // Handle corners and edges manually
          const box = boxer.get();
          const center = new THREE.Vector3();
          box.getCenter(center);
          target = center;

          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          
          // Calculate direction vector based on the clicked face name
          const direction = new THREE.Vector3();
          if (clickedFace.includes('top')) direction.y = 1;
          if (clickedFace.includes('bottom')) direction.y = -1;
          if (clickedFace.includes('front')) direction.z = 1;
          if (clickedFace.includes('back')) direction.z = -1;
          if (clickedFace.includes('right')) direction.x = 1;
          if (clickedFace.includes('left')) direction.x = -1;
          
          direction.normalize();
          
          // Calculate distance to fit the object
          // Using a factor of 1.5 * maxDim as a reasonable default
          const distance = maxDim * 1.5; 
          
          position = center.clone().add(direction.multiplyScalar(distance));
        }
        
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
   * Injects corners and edges into the view cube's shadow DOM
   */
  private async augmentViewCube(): Promise<void> {
    if (!this.viewCube) return;

    // Wait for shadow root and rendering
    let attempts = 0;
    while (attempts < 20) {
      if (this.viewCube.shadowRoot && this.viewCube.shadowRoot.querySelector('.cube')) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    const root = this.viewCube.shadowRoot;
    if (!root) return;

    const cube = root.querySelector('.cube') as HTMLElement;
    if (!cube) return;

    // Check if already augmented
    if (cube.querySelector('.corner-top-front-right')) return;

    console.log('🔧 Augmenting View Cube with corners and edges...');

    // Determine size. 
    const frontFace = cube.querySelector('.face-front') as HTMLElement;
    let size = 120; // Default to 120 as per library default
    if (frontFace) {
      if (frontFace.offsetWidth > 0) {
        size = frontFace.offsetWidth;
      }
    }
    
    const half = size / 2;
    const cornerSize = 20;
    const edgeThickness = 10;
    // Edge length should fill the gap between corners
    const edgeLength = size - cornerSize; 

    // CSS for the new elements
    const style = document.createElement('style');
    style.textContent = `
      .cube-interactive {
        position: absolute;
        left: 50%;
        top: 50%;
        transform-style: preserve-3d;
        cursor: pointer;
      }
      
      .cube-interactive .box-face {
        position: absolute;
        border: 1px solid rgba(255,255,255,0.5);
        box-sizing: border-box;
        transition: background-color 0.2s;
      }

      /* Corner Colors */
      .cube-corner .box-face { background-color: #FF6B6B; }
      .cube-corner:hover .box-face { background-color: #FFD93D; }

      /* Edge Colors */
      .cube-edge .box-face { background-color: #4D96FF; }
      .cube-edge:hover .box-face { background-color: #6BCB77; }
    `;
    root.appendChild(style);

    // Helper to create a 3D box
    const createBox = (cls: string, w: number, h: number, d: number, x: number, y: number, z: number, type: 'corner' | 'edge') => {
      const wrapper = document.createElement('div');
      wrapper.className = `cube-interactive ${cls} ${type === 'corner' ? 'cube-corner' : 'cube-edge'}`;
      wrapper.style.width = `${w}px`;
      wrapper.style.height = `${h}px`;
      
      // Position relative to center (left: 50%, top: 50%)
      wrapper.style.transform = `translate3d(${x}px, ${y}px, ${z}px) translate3d(-50%, -50%, 0)`;
      
      const faces = [
        { name: 'front',  w: w, h: h, tx: 0, ty: 0, tz: d/2, rx: 0, ry: 0 },
        { name: 'back',   w: w, h: h, tx: 0, ty: 0, tz: -d/2, rx: 0, ry: 180 },
        { name: 'right',  w: d, h: h, tx: w/2, ty: 0, tz: 0, rx: 0, ry: 90 },
        { name: 'left',   w: d, h: h, tx: -w/2, ty: 0, tz: 0, rx: 0, ry: -90 },
        { name: 'top',    w: w, h: d, tx: 0, ty: -h/2, tz: 0, rx: 90, ry: 0 },
        { name: 'bottom', w: w, h: d, tx: 0, ty: h/2, tz: 0, rx: -90, ry: 0 },
      ];

      faces.forEach(f => {
        const face = document.createElement('div');
        face.className = 'box-face';
        face.style.width = `${f.w}px`;
        face.style.height = `${f.h}px`;
        face.style.marginLeft = `${-f.w/2}px`;
        face.style.marginTop = `${-f.h/2}px`;
        face.style.left = '50%';
        face.style.top = '50%';
        face.style.transform = `translate3d(${f.tx}px, ${f.ty}px, ${f.tz}px) rotateX(${f.rx}deg) rotateY(${f.ry}deg)`;
        
        wrapper.appendChild(face);
      });

      cube.appendChild(wrapper);
    };

    // --- Corners ---
    // Coordinates relative to center:
    // Right: +half, Left: -half
    // Top: +half, Bottom: -half (Matching library's face positioning where Top is Y+ and Bottom is Y-)
    // Front: +half, Back: -half
    
    const cS = cornerSize;
    // Top (Y = +half)
    createBox('corner-top-front-right', cS, cS, cS, half, half, half, 'corner');
    createBox('corner-top-front-left', cS, cS, cS, -half, half, half, 'corner');
    createBox('corner-top-back-right', cS, cS, cS, half, half, -half, 'corner');
    createBox('corner-top-back-left', cS, cS, cS, -half, half, -half, 'corner');
    
    // Bottom (Y = -half)
    createBox('corner-bottom-front-right', cS, cS, cS, half, -half, half, 'corner');
    createBox('corner-bottom-front-left', cS, cS, cS, -half, -half, half, 'corner');
    createBox('corner-bottom-back-right', cS, cS, cS, half, -half, -half, 'corner');
    createBox('corner-bottom-back-left', cS, cS, cS, -half, -half, -half, 'corner');

    // --- Edges ---
    const eL = edgeLength;
    const eT = edgeThickness;
    
    // Top Edges (Y = +half)
    createBox('edge-top-front', eL, eT, eT, 0, half, half, 'edge');
    createBox('edge-top-back', eL, eT, eT, 0, half, -half, 'edge');
    createBox('edge-top-right', eT, eT, eL, half, half, 0, 'edge');
    createBox('edge-top-left', eT, eT, eL, -half, half, 0, 'edge');

    // Bottom Edges (Y = -half)
    createBox('edge-bottom-front', eL, eT, eT, 0, -half, half, 'edge');
    createBox('edge-bottom-back', eL, eT, eT, 0, -half, -half, 'edge');
    createBox('edge-bottom-right', eT, eT, eL, half, -half, 0, 'edge');
    createBox('edge-bottom-left', eT, eT, eL, -half, -half, 0, 'edge');    // Vertical Edges (Y = 0)
    createBox('edge-front-right', eT, eL, eT, half, 0, half, 'edge');
    createBox('edge-front-left', eT, eL, eT, -half, 0, half, 'edge');
    createBox('edge-back-right', eT, eL, eT, half, 0, -half, 'edge');
    createBox('edge-back-left', eT, eL, eT, -half, 0, -half, 'edge');
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
