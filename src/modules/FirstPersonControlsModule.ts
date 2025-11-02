/**
 * First Person Controls Module
 * 
 * Handles keyboard controls (WASD and Arrow keys) for first-person navigation.
 * Works in conjunction with the OrthoPerspectiveCamera's FirstPerson mode.
 * 
 * Controls:
 * - W / Arrow Up: Move forward
 * - S / Arrow Down: Move backward
 * - A / Arrow Left: Strafe left
 * - D / Arrow Right: Strafe right
 * - Space: Move up (increase height)
 * - Shift: Move down (decrease height)
 */

import * as THREE from 'three';
import * as OBC from '@thatopen/components';

export class FirstPersonControlsModule {
  private world: OBC.World | null = null;
  private fragmentsManager: OBC.FragmentsManager | null = null;
  private components: OBC.Components | null = null;
  private isEnabled: boolean = false;
  private moveSpeed: number = 0.3; // Default: slower speed (units per frame)
  private mouseSensitivity: number = 0.002; // Mouse look sensitivity
  private keys: Set<string> = new Set();
  private animationFrameId: number | null = null;
  
  // Mouse look variables
  private yaw: number = 0; // Horizontal rotation
  private pitch: number = 0; // Vertical rotation
  private isPointerLocked: boolean = false;
  
  // Collision detection
  private collisionDistance: number = 0.8; // Distance to check for collisions (in meters)
  private wallCategories: Set<string> = new Set(); // Store wall category names for quick lookup
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private originalCameraNear: number = 0.1; // Store original near plane value
  private doorCategories: Set<string> = new Set(); // Store door/window category names to exclude
  private windowCategories: Set<string> = new Set();

  /**
   * Initialize the first person controls
   * @param world - The world instance containing the camera
   * @param fragmentsManager - The fragments manager for accessing IFC data
   * @param components - The OBC components instance
   */
  public initialize(world: OBC.World, fragmentsManager: OBC.FragmentsManager, components: OBC.Components): void {
    this.world = world;
    this.fragmentsManager = fragmentsManager;
    this.components = components;
    
    // Store and adjust camera near plane to prevent clipping through walls
    if (world.camera) {
      const camera = world.camera.three as THREE.PerspectiveCamera;
      this.originalCameraNear = camera.near;
      camera.near = 0.5; // Increase near plane to prevent seeing through walls (50cm)
      camera.updateProjectionMatrix();
      
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      // Calculate initial yaw and pitch from camera direction
      this.yaw = Math.atan2(direction.x, direction.z);
      this.pitch = Math.asin(-direction.y);
    }
    
    console.log('✅ First person controls initialized');
  }

  /**
   * Update collision meshes from loaded models
   * Collects wall and door/window categories for category-based collision filtering
   */
  public async updateCollisionMeshes(): Promise<void> {
    if (!this.world?.scene || !this.fragmentsManager || !this.components) {
      console.warn('⚠️ Cannot update collision meshes: world, scene, fragmentsManager, or components not available');
      return;
    }

    // Clear previous collision data
    this.wallCategories.clear();
    this.doorCategories.clear();
    this.windowCategories.clear();
    
    console.log('🔍 Identifying wall and door/window categories for collision filtering...');

    // Iterate through all loaded Fragment models
    for (const [modelId, model] of this.fragmentsManager.list) {
      console.log(`📦 Processing model: ${modelId}`);
      
      try {
        // Get all categories in the model
        const categories = await (model as any).getCategories();
        
        // Find wall categories
        const wallCats = categories.filter((cat: string) => {
          const upper = cat.toUpperCase();
          return upper.includes('WALL') || upper === 'IFCWALLSTANDARDCASE';
        });
        
        // Find door categories
        const doorCats = categories.filter((cat: string) => {
          const upper = cat.toUpperCase();
          return upper.includes('DOOR');
        });
        
        // Find window categories
        const windowCats = categories.filter((cat: string) => {
          const upper = cat.toUpperCase();
          return upper.includes('WINDOW') || upper.includes('OPENING');
        });
        
        console.log(`   Wall categories:`, wallCats);
        console.log(`   Door categories:`, doorCats);
        console.log(`   Window categories:`, windowCats);
        
        // Store categories
        wallCats.forEach((cat: string) => this.wallCategories.add(cat));
        doorCats.forEach((cat: string) => this.doorCategories.add(cat));
        windowCats.forEach((cat: string) => this.windowCategories.add(cat));
        
      } catch (err) {
        console.warn(`   ⚠️ Error processing model ${modelId}:`, err);
        continue;
      }
    }

    console.log(`📊 Collision detection setup complete:`);
    console.log(`   Wall categories: ${Array.from(this.wallCategories).join(', ')}`);
    console.log(`   Door categories: ${Array.from(this.doorCategories).join(', ')}`);
    console.log(`   Window categories: ${Array.from(this.windowCategories).join(', ')}`);
    console.log(`🧱 Collision detection: ACTIVE (Fragment raycast-based with category filtering)`);
  }

  /**
   * Set movement speed
   * @param speed - Speed multiplier (0.1 - 2.0)
   */
  public setMoveSpeed(speed: number): void {
    this.moveSpeed = Math.max(0.1, Math.min(2.0, speed));
  }

  /**
   * Enable keyboard controls
   */
  public enable(): void {
    if (this.isEnabled) return;
    
    this.isEnabled = true;
    this.keys.clear();
    
    // Add keyboard event listeners
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
    
    // Add pointer lock listeners
    document.addEventListener('click', this.requestPointerLock);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('mousemove', this.handleMouseMove);
    
    // Start animation loop
    this.startMovementLoop();
    
    console.log('✅ Keyboard controls enabled');
    console.log('  - WASD / Arrows: Move horizontally');
    console.log('  - Space: Move up | Shift: Move down');
    console.log('✅ Mouse look enabled - Click to lock pointer');
    
    if (this.wallCategories.size > 0) {
      console.log(`🧱 Wall collision detection active (${this.wallCategories.size} wall types)`);
    }
  }

  /**
   * Disable keyboard controls
   */
  public disable(): void {
    if (!this.isEnabled) return;
    
    this.isEnabled = false;
    this.keys.clear();
    
    // Restore original camera near plane
    if (this.world?.camera) {
      const camera = this.world.camera.three as THREE.PerspectiveCamera;
      camera.near = this.originalCameraNear;
      camera.updateProjectionMatrix();
    }
    
    // Remove keyboard event listeners
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    
    // Remove pointer lock listeners
    document.removeEventListener('click', this.requestPointerLock);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('mousemove', this.handleMouseMove);
    
    // Exit pointer lock if active
    if (this.isPointerLocked && document.pointerLockElement) {
      document.exitPointerLock();
    }
    
    // Stop animation loop
    this.stopMovementLoop();
    
    console.log('✅ Keyboard controls disabled');
  }

  /**
   * Check if controls are currently enabled
   */
  public isActive(): boolean {
    return this.isEnabled;
  }

  /**
   * Set movement speed
   * @param speed - Movement speed in units per frame
   */
  public setSpeed(speed: number): void {
    this.moveSpeed = speed;
  }

  /**
   * Handle keydown events
   */
  private handleKeyDown = (event: KeyboardEvent): void => {
    // Ignore if typing in an input field
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const key = event.key.toLowerCase();
    
    // Add key to active keys set
    if (this.isMovementKey(key)) {
      this.keys.add(key);
      event.preventDefault();
    }
  };

  /**
   * Handle keyup events
   */
  private handleKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    this.keys.delete(key);
  };

  /**
   * Request pointer lock for mouse look
   */
  private requestPointerLock = (): void => {
    if (!this.isEnabled) return;
    
    // Don't lock if clicking on UI elements
    const target = event?.target as HTMLElement;
    if (target?.closest('.toolbar-container') || 
        target?.closest('.properties-panel') || 
        target?.closest('.model-count-badge')) {
      return;
    }
    
    document.body.requestPointerLock();
  };

  /**
   * Handle pointer lock state changes
   */
  private handlePointerLockChange = (): void => {
    this.isPointerLocked = document.pointerLockElement === document.body;
    
    if (this.isPointerLocked) {
      console.log('🔒 Pointer locked - Move mouse to look around (ESC to exit)');
    } else {
      console.log('🔓 Pointer unlocked');
    }
  };

  /**
   * Handle mouse movement for looking around
   */
  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.isPointerLocked || !this.world?.camera) return;

    // Update yaw (horizontal) and pitch (vertical)
    this.yaw -= event.movementX * this.mouseSensitivity;
    this.pitch -= event.movementY * this.mouseSensitivity;

    // Clamp pitch to prevent over-rotation (looking too far up/down)
    const maxPitch = Math.PI / 2 - 0.1; // 89 degrees
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    // Apply rotation to camera
    this.updateCameraRotation();
  };

  /**
   * Update camera rotation based on yaw and pitch
   */
  private updateCameraRotation(): void {
    if (!this.world?.camera) return;

    const camera = this.world.camera.three as THREE.PerspectiveCamera;
    
    // Calculate look direction from yaw and pitch
    const direction = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    // Set camera target
    const controls = (this.world.camera as OBC.OrthoPerspectiveCamera).controls;
    if (controls) {
      const target = new THREE.Vector3().copy(camera.position).add(direction);
      controls.setLookAt(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        target.x,
        target.y,
        target.z,
        false // Don't animate
      );
    }
  }


  /**
   * Check if a key is a movement key
   */
  private isMovementKey(key: string): boolean {
    return ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'].includes(key);
  }

  /**
   * Start the movement animation loop
   */
  private startMovementLoop(): void {
    if (this.animationFrameId !== null) return;
    
    const loop = async () => {
      if (!this.isEnabled) return;
      
      await this.updateMovement();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    
    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stop the movement animation loop
   */
  private stopMovementLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Update camera position based on active keys
   */
  private async updateMovement(): Promise<void> {
    if (!this.world?.camera || this.keys.size === 0) return;

    const camera = this.world.camera.three as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    
    // Get camera's forward and right vectors
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    
    camera.getWorldDirection(forward);
    forward.y = 0; // Keep movement horizontal
    forward.normalize();
    
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    
    // Calculate movement direction
    const movement = new THREE.Vector3();
    
    // Forward/Backward
    if (this.keys.has('w') || this.keys.has('arrowup')) {
      movement.add(forward);
    }
    if (this.keys.has('s') || this.keys.has('arrowdown')) {
      movement.sub(forward);
    }
    
    // Left/Right
    if (this.keys.has('a') || this.keys.has('arrowleft')) {
      movement.sub(right);
    }
    if (this.keys.has('d') || this.keys.has('arrowright')) {
      movement.add(right);
    }
    
    // Up/Down (vertical movement)
    if (this.keys.has(' ')) { // Space key
      movement.y += 1;
    }
    if (this.keys.has('shift')) { // Shift key
      movement.y -= 1;
    }
    
    // Normalize to prevent faster diagonal movement
    if (movement.length() > 0) {
      movement.normalize().multiplyScalar(this.moveSpeed);
      
      // Check for collisions before moving (async)
      const hasCollision = await this.checkCollision(camera.position, movement);
      
      // Adjust camera near plane based on proximity to walls
      this.adjustCameraNearPlane(camera, movement);
      
      if (hasCollision) {
        return; // Don't move if collision detected
      }
      
      // Update camera position
      camera.position.add(movement);
      
      // Update camera controls target (look-at point)
      const controls = (this.world.camera as OBC.OrthoPerspectiveCamera).controls;
      if (controls) {
        const target = new THREE.Vector3();
        controls.getTarget(target);
        target.add(movement);
        controls.setLookAt(
          camera.position.x,
          camera.position.y,
          camera.position.z,
          target.x,
          target.y,
          target.z,
          false // Don't animate
        );
      }
    }
  }

  /**
   * Adjust camera near plane dynamically based on wall proximity
   */
  private adjustCameraNearPlane(camera: THREE.Camera, movement: THREE.Vector3): void {
    // For now, use a fixed near plane since we're using Fragment raycast for collision
    const perspCamera = camera as THREE.PerspectiveCamera;
    perspCamera.near = 0.5;
    perspCamera.updateProjectionMatrix();
  }

  /**
   * Check for collisions using Fragment's raycast API with category filtering
   * @param position - Current camera position
   * @param movement - Intended movement vector
   * @returns true if collision detected with a wall (not door/window), false otherwise
   */
  private async checkCollision(position: THREE.Vector3, movement: THREE.Vector3): Promise<boolean> {
    if (!this.fragmentsManager || !this.world?.camera || !this.world?.renderer?.three.domElement) {
      return false;
    }

    // Cast a ray in the movement direction
    const direction = movement.clone().normalize();
    const rayEnd = position.clone().add(direction.multiplyScalar(this.collisionDistance));
    
    // Convert 3D positions to screen coordinates for Fragment raycast
    const camera = this.world.camera.three;
    const dom = this.world.renderer.three.domElement;
    
    // Project the ray end point to screen space
    const screenPos = rayEnd.clone().project(camera);
    const mouse = new THREE.Vector2(
      ((screenPos.x + 1) / 2) * dom.clientWidth,
      ((-screenPos.y + 1) / 2) * dom.clientHeight
    );

    try {
      // Raycast all models
      for (const [modelId, model] of this.fragmentsManager.list) {
        const result = await (model as any).raycast({
          camera: camera,
          mouse: mouse,
          dom: dom,
        });

        if (result && result.localId !== undefined && result.distance < this.collisionDistance) {
          // Get the category of the hit item
          const itemData = await (model as any).getItemsData([result.localId], {
            attributesDefault: false,
            attributes: [],
          });
          
          if (itemData && itemData.length > 0) {
            const category = itemData[0]._category?.value || '';
            
            // Check if it's a wall (not a door or window)
            const isWall = this.wallCategories.has(category);
            const isDoor = this.doorCategories.has(category);
            const isWindow = this.windowCategories.has(category);
            
            // Only block if it's a wall, allow passage through doors and windows
            if (isWall && !isDoor && !isWindow) {
              return true; // Collision with wall
            }
          }
        }
      }
    } catch (error) {
      // If raycasting fails, allow movement (fail open)
      return false;
    }

    return false; // No wall collision
  }

  /**
   * Cleanup - remove event listeners
   */
  public dispose(): void {
    this.disable();
    this.world = null;
    console.log('✅ First person controls disposed');
  }
}
