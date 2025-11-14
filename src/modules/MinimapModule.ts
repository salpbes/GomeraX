/**
 * MinimapModule
 * Provides a minimap overlay for first-person walking mode
 * Shows the user's position and viewing direction on a 2D floor plan
 */

import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { FloorPlanModule, StoreyInfo, FloorPlanSnapshot } from './FloorPlanModule';

const DEFAULT_PLANE_NORMAL = new THREE.Vector3(0, 1, 0);
const DEFAULT_PLANE_RIGHT = new THREE.Vector3(0, 0, 1);
const DEFAULT_PLANE_UP = new THREE.Vector3(1, 0, 0);

export interface MinimapConfig {
  width: number;
  height: number;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  zoom: number; // Camera zoom level for minimap
  opacity: number; // 0-1
}

export class MinimapModule {
  private components: OBC.Components;
  private world: OBC.World;
  private floorPlan: FloorPlanModule;
  private container: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private minimapCamera: THREE.OrthographicCamera | null = null;
  private minimapScene: THREE.Scene | null = null;
  private userMarker: THREE.Mesh | null = null;
  private viewCone: THREE.Mesh | null = null;
  private isEnabled: boolean = false;
  private animationFrameId: number | null = null;
  private currentStorey: StoreyInfo | null = null;
  private activeSnapshot: FloorPlanSnapshot | null = null;
  private geometryCenter: THREE.Vector3 = new THREE.Vector3(0, 0, 0); // Center of loaded geometry
  private lastDebugLog: number = 0;
  private mirrorHorizontalAxis = true;
  private floorPlanViewMargin = 0.85; // Reduce to zoom in more (was 1.15)
  private scratchPosition: THREE.Vector3 = new THREE.Vector3();
  private scratchDirection: THREE.Vector3 = new THREE.Vector3();
  private scratchOffset: THREE.Vector3 = new THREE.Vector3();
  private scratchProjected: THREE.Vector3 = new THREE.Vector3();
  private scratchPlane: THREE.Plane = new THREE.Plane();
  
  private config: MinimapConfig = {
    width: 300,
    height: 300,
    position: 'bottom-right',
    zoom: 50, // Orthographic camera size
    opacity: 0.9
  };

  constructor(components: OBC.Components, world: OBC.World, floorPlan: FloorPlanModule) {
    this.components = components;
    this.world = world;
    this.floorPlan = floorPlan;
  }

  /**
   * Initialize the minimap module
   */
  async initialize(): Promise<void> {
    console.log('🗺️ Initializing minimap module...');
    
    // Create minimap container
    this.createMinimapContainer();
    
    // Create minimap scene and camera
    this.setupMinimapScene();
    
    console.log('✅ Minimap module initialized');
  }

  /**
   * Create the HTML container for the minimap
   */
  private createMinimapContainer(): void {
    this.container = document.createElement('div');
    this.container.id = 'minimap-container';
    this.container.style.position = 'fixed';
    this.container.style.width = `${this.config.width}px`;
    this.container.style.height = `${this.config.height}px`;
    this.container.style.zIndex = '1000';
    this.container.style.borderRadius = '8px';
    this.container.style.overflow = 'hidden';
    this.container.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    this.container.style.border = '2px solid #4a5568';
    this.container.style.display = 'none'; // Hidden by default
    this.container.style.opacity = String(this.config.opacity);
    
    // Position based on config
    this.updateContainerPosition();
    
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    
    // Add title overlay
    const titleOverlay = document.createElement('div');
    titleOverlay.style.position = 'absolute';
    titleOverlay.style.top = '8px';
    titleOverlay.style.left = '8px';
    titleOverlay.style.background = 'rgba(0, 0, 0, 0.7)';
    titleOverlay.style.color = 'white';
    titleOverlay.style.padding = '4px 8px';
    titleOverlay.style.borderRadius = '4px';
    titleOverlay.style.fontSize = '12px';
    titleOverlay.style.fontWeight = 'bold';
    titleOverlay.textContent = 'Minimap';
    
    this.container.appendChild(this.canvas);
    this.container.appendChild(titleOverlay);
    document.body.appendChild(this.container);
  }

  /**
   * Update container position based on config
   */
  private updateContainerPosition(): void {
    if (!this.container) return;
    
    // Reset all positions
    this.container.style.top = '';
    this.container.style.bottom = '';
    this.container.style.left = '';
    this.container.style.right = '';
    
    const margin = '20px';
    
    switch (this.config.position) {
      case 'top-left':
        this.container.style.top = margin;
        this.container.style.left = margin;
        break;
      case 'top-right':
        this.container.style.top = margin;
        this.container.style.right = margin;
        break;
      case 'bottom-left':
        this.container.style.bottom = margin;
        this.container.style.left = margin;
        break;
      case 'bottom-right':
        this.container.style.bottom = margin;
        this.container.style.right = margin;
        break;
    }
  }

  /**
   * Setup minimap scene with camera and renderer
   */
  private setupMinimapScene(): void {
    if (!this.canvas) return;
    
    // Create minimap scene
    this.minimapScene = new THREE.Scene();
    this.minimapScene.background = new THREE.Color(0x222222); // Dark background
    
    // Add strong ambient light so everything is fully visible
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    this.minimapScene.add(ambientLight);
    
    // Add directional light from above
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(0, 100, 0);
    this.minimapScene.add(dirLight);
    
    // Create orthographic camera for top-down view
    const aspect = this.config.width / this.config.height;
    const size = this.config.zoom;
    this.minimapCamera = new THREE.OrthographicCamera(
      -size * aspect, // left
      size * aspect,  // right
      size,           // top
      -size,          // bottom
      -500,           // near (negative to see below)
      500             // far (increased range)
    );
    this.minimapCamera.position.set(0, 100, 0); // Top-down view
    this.minimapCamera.lookAt(0, 0, 0);
    
    // Add test geometries to verify rendering works
    const testBox = new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
    );
    testBox.position.set(0, 0, 0);
    this.minimapScene.add(testBox);
    console.log('🎯 Added test box at origin for debugging');
    
    // Create WebGL renderer for minimap
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false // Disable alpha for solid background
    });
    this.renderer.setSize(this.config.width, this.config.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0xffffff, 1); // White background for floor plan
    this.renderer.localClippingEnabled = true; // Enable clipping planes for floor plan view
    
    // Create user position marker (circle)
    const markerGeometry = new THREE.CircleGeometry(1, 32);
    const markerMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, // Bright red for visibility
      side: THREE.DoubleSide 
    });
    this.userMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.userMarker.rotation.x = -Math.PI / 2; // Lay flat on XZ plane
    this.userMarker.renderOrder = 10; // Render on top of everything
    this.minimapScene.add(this.userMarker);
    
    // Create view direction cone
    const coneShape = new THREE.Shape();
    coneShape.moveTo(0, 0);
    coneShape.lineTo(-2, -4);
    coneShape.lineTo(2, -4);
    coneShape.lineTo(0, 0);
    
    const coneGeometry = new THREE.ShapeGeometry(coneShape);
    const coneMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, // Bright red for visibility
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    this.viewCone = new THREE.Mesh(coneGeometry, coneMaterial);
    this.viewCone.rotation.x = -Math.PI / 2; // Lay flat on XZ plane
    this.viewCone.renderOrder = 10; // Render on top of everything
    this.minimapScene.add(this.viewCone);
    
    console.log('✅ Minimap scene created');
  }

  /**
   * Enable the minimap display
   * @param storeyName - Optional storey name to display, auto-detects if not provided
   */
  async enable(storeyName?: string): Promise<void> {
    if (this.isEnabled) {
      console.log('ℹ️ Minimap already enabled');
      return;
    }
    
    console.log('🗺️ Enabling minimap...');
    
    // Resolve storey information
    if (!storeyName) {
      const detectedStorey = await this.detectCurrentStorey();
      if (!detectedStorey) {
        console.warn('⚠️ Could not determine current storey for minimap');
        return;
      }
      this.currentStorey = detectedStorey;
      storeyName = detectedStorey.name;
    } else {
      const storeys = await this.floorPlan.getAllStoreys();
      this.currentStorey = storeys.find((storey) => storey.name === storeyName) || null;
      if (!this.currentStorey) {
        console.warn(`⚠️ Storey not found for minimap: ${storeyName}`);
        return;
      }
    }
    
    const loaded = await this.loadFloorPlanToMinimap(storeyName);
    if (!loaded) {
      console.error(`❌ Unable to prepare minimap snapshot for storey: ${storeyName}`);
      return;
    }
    
    // Show container
    if (this.container) {
      this.container.style.display = 'block';
    }
    
    this.isEnabled = true;
    this.startUpdateLoop();
    
    console.log(`✅ Minimap enabled for storey: ${storeyName}`);
  }

  /**
   * Disable the minimap display
   */
  disable(): void {
    if (!this.isEnabled) return;
    
    console.log('🗺️ Disabling minimap...');
    
    this.isEnabled = false;
    this.stopUpdateLoop();
    
    if (this.container) {
      this.container.style.display = 'none';
    }
    
    // Clear floor plan geometry from minimap scene
    this.clearMinimapScene();
    
    console.log('✅ Minimap disabled');
  }

  /**
   * Toggle minimap on/off
   */
  async toggle(storeyName?: string): Promise<void> {
    if (this.isEnabled) {
      this.disable();
    } else {
      await this.enable(storeyName);
    }
  }

  /**
   * Detect current storey based on camera height
   */
  private async detectCurrentStorey(): Promise<StoreyInfo | null> {
    const storeys = await this.floorPlan.getAllStoreys();
    if (storeys.length === 0) return null;
    
    const cameraY = this.world.camera?.three.position.y || 0;
    
    // Find the storey whose elevation is closest to camera Y position
    let closestStorey = storeys[0];
    let minDiff = Math.abs(cameraY - closestStorey.elevation);
    
    for (const storey of storeys) {
      const diff = Math.abs(cameraY - storey.elevation);
      if (diff < minDiff) {
        minDiff = diff;
        closestStorey = storey;
      }
    }
    
    this.currentStorey = closestStorey;
    return closestStorey;
  }

  /**
   * Load floor plan view into minimap by capturing snapshot from FloorPlanModule
   */
  private async loadFloorPlanToMinimap(storeyName: string): Promise<boolean> {
    if (!this.minimapScene) return false;

    console.log(`🖼️ Preparing minimap snapshot for storey: ${storeyName}`);

    // Clear any existing floor plan geometry and textures
    this.clearMinimapScene();

    const snapshot = await this.floorPlan.captureFloorPlanSnapshot(storeyName, {
      offset: 1.5,
      range: 100
    });

    if (!snapshot) {
      console.warn('⚠️ Floor plan snapshot could not be captured');
      return false;
    }

    this.activeSnapshot = snapshot;

    const planeGeometry = new THREE.PlaneGeometry(snapshot.width, snapshot.height);
    const planeMaterial = new THREE.MeshBasicMaterial({
      map: snapshot.texture,
      side: THREE.DoubleSide,
      transparent: false
    });

    const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    planeMesh.rotation.x = -Math.PI / 2;
    planeMesh.position.set(snapshot.center.x, 0, snapshot.center.z);
    planeMesh.userData.isMinimapObject = true;
    this.minimapScene.add(planeMesh);

    this.geometryCenter.copy(snapshot.center);

    console.log(`📐 Floor plan mesh: width=${snapshot.width.toFixed(2)}, height=${snapshot.height.toFixed(2)}`);
    console.log(`📐 Floor plan mesh position: (${snapshot.center.x.toFixed(2)}, 0, ${snapshot.center.z.toFixed(2)})`);
    console.log(`📐 Floor plan covers X: [${(snapshot.center.x - snapshot.width/2).toFixed(2)}, ${(snapshot.center.x + snapshot.width/2).toFixed(2)}]`);
    console.log(`📐 Floor plan covers Z: [${(snapshot.center.z - snapshot.height/2).toFixed(2)}, ${(snapshot.center.z + snapshot.height/2).toFixed(2)}]`);

    this.updateMinimapCamera(snapshot);

    console.log('✅ Minimap floor plan snapshot integrated');
    return true;
  }

  private updateMinimapCamera(snapshot: FloorPlanSnapshot): void {
    const near = 0.1;
    const far = 1000;
    const zoom = (snapshot.cameraFrustum.zoom ?? 1) * 2.5; // Increased zoom multiplier for more zoom

    // Calculate the snapshot's aspect ratio
    const snapshotWidth = Math.abs(snapshot.cameraFrustum.right - snapshot.cameraFrustum.left);
    const snapshotHeight = Math.abs(snapshot.cameraFrustum.top - snapshot.cameraFrustum.bottom);
    const snapshotAspect = snapshotWidth / snapshotHeight;
    
    // Minimap aspect ratio (should be 1.0 for square minimap)
    const minimapAspect = this.config.width / this.config.height;
    
    // Adjust frustum to maintain snapshot aspect ratio within minimap
    let left = snapshot.cameraFrustum.left;
    let right = snapshot.cameraFrustum.right;
    let top = snapshot.cameraFrustum.top;
    let bottom = snapshot.cameraFrustum.bottom;
    
    if (snapshotAspect > minimapAspect) {
      // Snapshot is wider - adjust height
      const targetHeight = snapshotWidth / minimapAspect;
      const heightDiff = (targetHeight - snapshotHeight) / 2;
      top += heightDiff;
      bottom -= heightDiff;
    } else {
      // Snapshot is taller - adjust width  
      const targetWidth = snapshotHeight * minimapAspect;
      const widthDiff = (targetWidth - snapshotWidth) / 2;
      right += widthDiff;
      left -= widthDiff;
    }

    if (!this.minimapCamera) {
      this.minimapCamera = new THREE.OrthographicCamera(
        left,
        right,
        top,
        bottom,
        near,
        far
      );
    } else {
      this.minimapCamera.left = left;
      this.minimapCamera.right = right;
      this.minimapCamera.top = top;
      this.minimapCamera.bottom = bottom;
      this.minimapCamera.near = near;
      this.minimapCamera.far = far;
    }

    this.minimapCamera.zoom = zoom;
    this.minimapCamera.updateProjectionMatrix();

    const cameraHeight = Math.max(Math.abs(snapshot.cameraPosition.y || 0), 50);

    this.minimapCamera.position.set(
      this.geometryCenter.x,
      cameraHeight,
      this.geometryCenter.z
    );
    this.minimapCamera.lookAt(this.geometryCenter.x, 0, this.geometryCenter.z);
    this.minimapCamera.updateProjectionMatrix();
  }
  
  /**
   * This method is no longer needed - keeping for reference
   */
  private async cloneFloorPlanGeometry(floorY: number): Promise<void> {
    // Disabled - we now capture the actual floor plan render
  }

  /**
   * Clear floor plan geometry from minimap scene
   */
  private clearMinimapScene(): void {
    if (this.activeSnapshot) {
      this.activeSnapshot.dispose();
      this.activeSnapshot = null;
    }

    if (!this.minimapScene) return;

    // Remove all meshes except user marker and view cone
    const objectsToRemove: THREE.Object3D[] = [];
    
    this.minimapScene.traverse((object) => {
      if (object !== this.userMarker && 
          object !== this.viewCone && 
          object.type === 'Mesh') {
        objectsToRemove.push(object);
      }
    });
    
    objectsToRemove.forEach(obj => {
      this.minimapScene!.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  private mapWorldToMinimapPosition(source: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    const snapshot = this.activeSnapshot;
    if (!snapshot) {
      return target.copy(source);
    }

    // Map world coordinates directly - the floor plan mesh is already positioned at snapshot.center
    // and the minimap camera is also looking at the same center, so coordinates should match
    target.set(source.x, 0.1, source.z);
    return target;
  }

  /**
   * Start the update loop for minimap
   */
  private startUpdateLoop(): void {
    if (this.animationFrameId !== null) return;
    
    const update = () => {
      if (!this.isEnabled) return;
      
      this.updateMinimapView();
      this.renderMinimap();
      
      this.animationFrameId = requestAnimationFrame(update);
    };
    
    this.animationFrameId = requestAnimationFrame(update);
  }

  /**
   * Stop the update loop
   */
  private stopUpdateLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Update minimap camera and user marker based on main camera position
   */
  private updateMinimapView(): void {
    if (!this.world.camera || !this.userMarker || !this.viewCone) {
      return;
    }
    
    const mainCamera = this.world.camera.three;
    const position = mainCamera.position;
    const minimapPosition = this.mapWorldToMinimapPosition(position, this.scratchPosition);

    // Update user marker position in minimap coordinates (Y=0.1 for overlay visibility)
    this.userMarker.position.set(minimapPosition.x, 0.1, minimapPosition.z);
    this.viewCone.position.set(minimapPosition.x, 0.1, minimapPosition.z);
    
    // Log occasionally for debugging
    const now = Date.now();
    if (!this.lastDebugLog || now - this.lastDebugLog > 5000) {
      console.log(`User marker position (minimap): (${minimapPosition.x.toFixed(2)}, ${minimapPosition.z.toFixed(2)}), Floor plan center: (${this.geometryCenter.x.toFixed(2)}, ${this.geometryCenter.z.toFixed(2)})`);
    }
    
    // Get camera forward direction for view cone rotation
    const direction = this.scratchDirection;
    mainCamera.getWorldDirection(direction);

    // Simple heading calculation in world XZ plane
    const heading = Math.atan2(direction.x, direction.z);
    this.viewCone.rotation.z = heading;
  }

  /**
   * Render the minimap scene
   */
  private renderMinimap(): void {
    if (!this.renderer || !this.minimapCamera || !this.minimapScene) {
      return;
    }
    
    try {
      // Debug log occasionally
      const now = Date.now();
      if (!this.lastDebugLog || now - this.lastDebugLog > 3000) {
        console.log('Minimap rendering:', {
          sceneChildren: this.minimapScene.children.length,
          cameraPos: `(${this.minimapCamera.position.x.toFixed(1)}, ${this.minimapCamera.position.y.toFixed(1)}, ${this.minimapCamera.position.z.toFixed(1)})`,
          objects: this.minimapScene.children.map(c => `${c.type} at (${c.position.x.toFixed(1)}, ${c.position.y.toFixed(1)}, ${c.position.z.toFixed(1)})`)
        });
        this.lastDebugLog = now;
      }
      
      // Render our minimap scene (texture + user marker)
      this.renderer.render(this.minimapScene, this.minimapCamera);
      
    } catch (error) {
      console.error('Error rendering minimap:', error);
    }
  }

  /**
   * Update minimap configuration
   */
  updateConfig(config: Partial<MinimapConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.container) {
      this.container.style.width = `${this.config.width}px`;
      this.container.style.height = `${this.config.height}px`;
      this.container.style.opacity = String(this.config.opacity);
      this.updateContainerPosition();
    }
    
    if (this.canvas && this.renderer) {
      this.canvas.width = this.config.width;
      this.canvas.height = this.config.height;
      this.renderer.setSize(this.config.width, this.config.height);
    }
    
    if (this.minimapCamera) {
      const aspect = this.config.width / this.config.height;
      const size = this.config.zoom;
      this.minimapCamera.left = -size * aspect;
      this.minimapCamera.right = size * aspect;
      this.minimapCamera.top = size;
      this.minimapCamera.bottom = -size;
      this.minimapCamera.updateProjectionMatrix();
    }
  }

  /**
   * Set minimap zoom level
   */
  setZoom(zoom: number): void {
    this.updateConfig({ zoom });
  }

  /**
   * Set minimap opacity
   */
  setOpacity(opacity: number): void {
    this.updateConfig({ opacity: Math.max(0, Math.min(1, opacity)) });
  }

  /**
   * Set minimap position
   */
  setPosition(position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'): void {
    this.updateConfig({ position });
  }

  /**
   * Check if minimap is currently enabled
   */
  isActive(): boolean {
    return this.isEnabled;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    console.log('🗺️ Disposing minimap module...');
    
    this.disable();
    
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    this.clearMinimapScene();
    
    this.minimapScene = null;
    this.minimapCamera = null;
    this.userMarker = null;
    this.viewCone = null;
    
    console.log('✅ Minimap module disposed');
  }
}
