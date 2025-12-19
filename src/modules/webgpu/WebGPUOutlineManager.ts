/**
 * =============================================================================
 * WebGPU Outline Manager
 * =============================================================================
 * 
 * This module provides outline/selection highlighting for WebGPU mode.
 * 
 * HOW IT WORKS:
 * -------------
 * The outline effect is achieved using a multi-pass rendering approach:
 * 
 * 1. SELECTION TRACKING: Track which objects are currently "selected" by the user
 *    via raycasting clicks on the proxy scene.
 * 
 * 2. OUTLINE RENDERING: For selected objects, we:
 *    - Render selected meshes with a special outline material
 *    - Use scaled-up back-face rendering to create an outline effect
 *    - The outline color is configurable (default: blue)
 * 
 * 3. HOVER EFFECT: Objects under mouse cursor get a subtle highlight
 * 
 * INTEGRATION:
 * -----------
 * - Listens for click events to select objects
 * - Provides methods to programmatically select/deselect objects
 * - Integrates with WebGPURendererModule's render loop
 * 
 * @see https://threejs.org/docs/#api/en/renderers/WebGPURenderer
 * =============================================================================
 */

import * as THREE from 'three';

export interface OutlineSettings {
  /** Outline color for selected objects */
  selectionColor: THREE.Color;
  /** Outline color for hovered objects */
  hoverColor: THREE.Color;
  /** Outline thickness (scale factor for back-face method) */
  thickness: number;
  /** Enable/disable outline effect */
  enabled: boolean;
  /** Show hover highlight */
  showHover: boolean;
}

export interface SelectionInfo {
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
  expressId?: number;
  modelId?: string;
}

/**
 * WebGPU Outline Manager
 * Provides selection highlighting with outline effect for WebGPU mode
 */
export class WebGPUOutlineManager {
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private container: HTMLElement | null = null;
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouse: THREE.Vector2 = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };
  
  // Selection state
  private selectedMeshes: Map<string, SelectionInfo> = new Map();
  private hoveredMesh: THREE.Mesh | null = null;
  
  // Outline materials (created once, reused)
  private selectionOutlineMaterial: THREE.MeshBasicMaterial | null = null;
  private hoverOutlineMaterial: THREE.MeshBasicMaterial | null = null;
  
  // Outline helper meshes (scaled copies for outline effect)
  private outlineMeshes: Map<string, THREE.Mesh> = new Map();
  private hoverOutlineMesh: THREE.Mesh | null = null;
  
  // Settings
  private settings: OutlineSettings = {
    selectionColor: new THREE.Color(0x00aaff), // Bright blue
    hoverColor: new THREE.Color(0xffff00),     // Yellow
    thickness: 0.03,                            // Outline thickness
    enabled: true,
    showHover: false
  };
  
  // Event callbacks
  private onSelect: ((mesh: THREE.Mesh | null, info?: SelectionInfo) => void) | null = null;
  private onHover: ((mesh: THREE.Mesh | null) => void) | null = null;
  
  // Bound event handlers
  private boundClickHandler: ((event: MouseEvent) => void) | null = null;
  private boundMoveHandler: ((event: MouseEvent) => void) | null = null;
  private boundDownHandler: ((event: PointerEvent) => void) | null = null;
  private boundDocHandler: ((event: Event) => void) | null = null;

  constructor() {
    // Create outline materials
    this.selectionOutlineMaterial = new THREE.MeshBasicMaterial({
      color: this.settings.selectionColor,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.8,
      depthTest: true,
      depthWrite: false
    });
    
    this.hoverOutlineMaterial = new THREE.MeshBasicMaterial({
      color: this.settings.hoverColor,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.5,
      depthTest: true,
      depthWrite: false
    });
  }

  /**
   * Initialize the outline manager
   */
  public initialize(
    scene: THREE.Scene,
    camera: THREE.Camera,
    container: HTMLElement
  ): void {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    
    // Set up event listeners
    this.setupEventListeners();
    
    console.log('🎯 WebGPU Outline Manager initialized');
  }

  /**
   * Update scene reference (for when models are loaded/unloaded)
   */
  public updateScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  /**
   * Set up mouse event listeners
   */
  private setupEventListeners(): void {
    if (!this.container) return;
    
    // Use the original canvas (which sits on top) for events
    let originalCanvas = this.container.querySelector('canvas:not(#webgpu-canvas)') as HTMLElement | null;
    
    // If not found, try to find any canvas that's not our WebGPU canvas
    if (!originalCanvas) {
      const allCanvases = this.container.querySelectorAll('canvas');
      for (const canvas of allCanvases) {
        if (canvas.id !== 'webgpu-canvas') {
          originalCanvas = canvas as HTMLElement;
          break;
        }
      }
    }
    
    const eventTarget = (originalCanvas || this.container) as HTMLElement;
    
    this.boundClickHandler = this.handleClick.bind(this);
    this.boundMoveHandler = this.handleMouseMove.bind(this);
    
    // Pointer down handler to track start position
    this.boundDownHandler = (e: PointerEvent) => {
      if (e.button === 0) {
        this.pointerDownPos.x = e.clientX;
        this.pointerDownPos.y = e.clientY;
      }
    };
    
    // Add listener directly to document to ensure we catch all clicks
    this.boundDocHandler = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      // Check if click is within our container
      if (this.container && this.container.contains(e.target as Node)) {
        this.handleClick(mouseEvent);
      }
    };
    
    document.addEventListener('pointerdown', this.boundDownHandler as EventListener, { capture: true });
    document.addEventListener('pointerup', this.boundDocHandler as EventListener, { capture: true });
    
    // Also add to the specific event target
    eventTarget.addEventListener('pointerdown', this.boundDownHandler as EventListener, { capture: true });
    eventTarget.addEventListener('pointerup', this.boundClickHandler as EventListener, { capture: true });
    eventTarget.addEventListener('pointermove', this.boundMoveHandler as EventListener, { capture: true });
    
    console.log('🎯 WebGPU outline event listeners attached');
  }

  /**
   * Handle click events for selection
   */
  private handleClick(event: MouseEvent): void {
    if (!this.settings.enabled || !this.scene || !this.camera || !this.container) return;
    
    // Check distance from pointer down to avoid accidental selection during rotation
    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // If moved more than 5 pixels, consider it a drag/rotate, not a click
    if (distance >= 5) return;
    
    // Check for modifier keys - Shift for multi-select, Ctrl/Cmd to toggle
    const isMultiSelect = event.shiftKey;
    const isToggle = event.ctrlKey || event.metaKey;
    
    // Get mouse position in normalized device coordinates
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Ensure camera matrices are up to date
    this.camera.updateMatrixWorld();
    
    // Perform raycast
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    // Find first valid mesh (skip ground plane, helpers, etc.)
    let selectedMesh: THREE.Mesh | null = null;
    for (const intersect of intersects) {
      if (intersect.object instanceof THREE.Mesh && 
          intersect.object.name !== 'webgpu-ground-plane' &&
          !intersect.object.name.includes('outline-helper') &&
          intersect.object.visible) {
        selectedMesh = intersect.object;
        break;
      }
    }
    
    if (selectedMesh) {
      const meshId = this.getMeshId(selectedMesh);
      
      if (isToggle && this.selectedMeshes.has(meshId)) {
        // Toggle off - deselect this mesh
        this.deselectMesh(meshId);
      } else if (isMultiSelect) {
        // Add to selection
        this.selectMesh(selectedMesh);
      } else {
        // Single selection - clear others first
        this.clearSelection();
        this.selectMesh(selectedMesh);
      }
    } else if (!isMultiSelect && !isToggle) {
      // Clicked on nothing - clear selection
      this.clearSelection();
    }
  }

  /**
   * Handle mouse move for hover effect
   */
  private handleMouseMove(event: MouseEvent): void {
    if (!this.settings.enabled || !this.settings.showHover || 
        !this.scene || !this.camera || !this.container) return;
    
    // Get mouse position in normalized device coordinates
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Ensure camera matrices are up to date
    this.camera.updateMatrixWorld();
    
    // Perform raycast
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    // Find first valid mesh
    let hoverMesh: THREE.Mesh | null = null;
    for (const intersect of intersects) {
      if (intersect.object instanceof THREE.Mesh && 
          intersect.object.name !== 'webgpu-ground-plane' &&
          !intersect.object.name.includes('outline-helper') &&
          intersect.object.visible) {
        hoverMesh = intersect.object;
        break;
      }
    }
    
    // Update hover state
    if (hoverMesh !== this.hoveredMesh) {
      this.removeHoverOutline();
      this.hoveredMesh = hoverMesh;
      
      if (hoverMesh && !this.selectedMeshes.has(this.getMeshId(hoverMesh))) {
        this.addHoverOutline(hoverMesh);
      }
      
      // Trigger callback
      if (this.onHover) {
        this.onHover(hoverMesh);
      }
    }
  }

  /**
   * Get a unique ID for a mesh
   */
  private getMeshId(mesh: THREE.Mesh): string {
    return mesh.uuid;
  }

  /**
   * Select a mesh and add outline
   */
  public selectMesh(mesh: THREE.Mesh): void {
    const meshId = this.getMeshId(mesh);
    
    if (this.selectedMeshes.has(meshId)) return;
    
    // Store selection info
    const info: SelectionInfo = {
      mesh,
      originalMaterial: mesh.material,
      expressId: (mesh as any).expressId,
      modelId: (mesh as any).modelId
    };
    
    this.selectedMeshes.set(meshId, info);
    
    // Add outline mesh
    this.addSelectionOutline(mesh, meshId);
    
    console.log(`🎯 Selected mesh: ${mesh.name || meshId}`);
    
    // Trigger callback
    if (this.onSelect) {
      this.onSelect(mesh, info);
    }
  }

  /**
   * Deselect a mesh by ID
   */
  public deselectMesh(meshId: string): void {
    const info = this.selectedMeshes.get(meshId);
    if (!info) return;
    
    // Remove outline mesh
    this.removeSelectionOutline(meshId);
    this.selectedMeshes.delete(meshId);
    
    console.log(`🎯 Deselected mesh: ${meshId}`);
    
    // Trigger callback with null to indicate deselection
    if (this.onSelect) {
      this.onSelect(null);
    }
  }

  /**
   * Clear all selections
   */
  public clearSelection(): void {
    // Remove all outline meshes
    for (const meshId of this.selectedMeshes.keys()) {
      this.removeSelectionOutline(meshId);
    }
    this.selectedMeshes.clear();
    
    console.log('🎯 Selection cleared');
    
    // Trigger callback
    if (this.onSelect) {
      this.onSelect(null);
    }
  }

  /**
   * Add outline mesh for selection
   */
  private addSelectionOutline(mesh: THREE.Mesh, meshId: string): void {
    if (!this.scene || !this.selectionOutlineMaterial) return;
    
    // Create outline material - use FrontSide with polygon offset to render slightly behind
    const outlineMat = new THREE.MeshBasicMaterial({
      color: this.settings.selectionColor,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    
    // Clone geometry for outline
    const outlineMesh = new THREE.Mesh(
      mesh.geometry, // Don't clone - use same geometry
      outlineMat
    );
    
    // Copy the EXACT same transform - no scaling
    outlineMesh.position.copy(mesh.position);
    outlineMesh.rotation.copy(mesh.rotation);
    outlineMesh.quaternion.copy(mesh.quaternion);
    outlineMesh.scale.copy(mesh.scale);
    outlineMesh.matrix.copy(mesh.matrix);
    outlineMesh.matrixWorld.copy(mesh.matrixWorld);
    outlineMesh.matrixAutoUpdate = mesh.matrixAutoUpdate;
    
    // If the original mesh has matrixAutoUpdate off, we need to match that
    if (!mesh.matrixAutoUpdate) {
      outlineMesh.matrixAutoUpdate = false;
    }
    
    outlineMesh.name = `outline-helper-${meshId}`;
    outlineMesh.renderOrder = 999; // Render on top to be visible
    outlineMesh.frustumCulled = false; // Ensure it's always rendered
    
    this.scene.add(outlineMesh);
    this.outlineMeshes.set(meshId, outlineMesh);
  }

  /**
   * Remove outline mesh for selection
   */
  private removeSelectionOutline(meshId: string): void {
    const outlineMesh = this.outlineMeshes.get(meshId);
    if (outlineMesh && this.scene) {
      this.scene.remove(outlineMesh);
      outlineMesh.geometry.dispose();
      this.outlineMeshes.delete(meshId);
    }
  }

  /**
   * Add hover outline
   */
  private addHoverOutline(mesh: THREE.Mesh): void {
    if (!this.scene || !this.hoverOutlineMaterial) return;
    
    // Create hover material - use FrontSide with polygon offset
    const hoverMat = new THREE.MeshBasicMaterial({
      color: this.settings.hoverColor,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    
    // Use same geometry (no clone needed)
    this.hoverOutlineMesh = new THREE.Mesh(
      mesh.geometry,
      hoverMat
    );
    
    // Copy the EXACT same transform - no scaling
    this.hoverOutlineMesh.position.copy(mesh.position);
    this.hoverOutlineMesh.rotation.copy(mesh.rotation);
    this.hoverOutlineMesh.quaternion.copy(mesh.quaternion);
    this.hoverOutlineMesh.scale.copy(mesh.scale);
    this.hoverOutlineMesh.matrix.copy(mesh.matrix);
    this.hoverOutlineMesh.matrixWorld.copy(mesh.matrixWorld);
    this.hoverOutlineMesh.matrixAutoUpdate = mesh.matrixAutoUpdate;
    
    this.hoverOutlineMesh.name = 'outline-helper-hover';
    this.hoverOutlineMesh.renderOrder = 999;
    this.hoverOutlineMesh.frustumCulled = false;
    
    this.scene.add(this.hoverOutlineMesh);
  }

  /**
   * Remove hover outline
   */
  private removeHoverOutline(): void {
    if (this.hoverOutlineMesh && this.scene) {
      this.scene.remove(this.hoverOutlineMesh);
      this.hoverOutlineMesh.geometry.dispose();
      this.hoverOutlineMesh = null;
    }
  }

  /**
   * Update outline meshes to match current mesh transforms
   * Call this in render loop if meshes can move
   */
  public updateOutlines(): void {
    // Update selection outlines
    for (const [meshId, info] of this.selectedMeshes) {
      const outlineMesh = this.outlineMeshes.get(meshId);
      if (outlineMesh && info.mesh) {
        outlineMesh.matrix.copy(info.mesh.matrixWorld);
        
        // Apply scale for outline thickness
        const scale = 1 + this.settings.thickness;
        const scaleMatrix = new THREE.Matrix4().makeScale(scale, scale, scale);
        outlineMesh.matrix.multiply(scaleMatrix);
      }
    }
    
    // Update hover outline
    if (this.hoverOutlineMesh && this.hoveredMesh) {
      this.hoverOutlineMesh.matrix.copy(this.hoveredMesh.matrixWorld);
      
      const scale = 1 + this.settings.thickness * 0.5;
      const scaleMatrix = new THREE.Matrix4().makeScale(scale, scale, scale);
      this.hoverOutlineMesh.matrix.multiply(scaleMatrix);
    }
  }

  /**
   * Set selection color
   */
  public setSelectionColor(color: THREE.Color | number | string): void {
    if (typeof color === 'number' || typeof color === 'string') {
      this.settings.selectionColor = new THREE.Color(color);
    } else {
      this.settings.selectionColor = color;
    }
    
    if (this.selectionOutlineMaterial) {
      this.selectionOutlineMaterial.color.copy(this.settings.selectionColor);
    }
  }

  /**
   * Set hover color
   */
  public setHoverColor(color: THREE.Color | number | string): void {
    if (typeof color === 'number' || typeof color === 'string') {
      this.settings.hoverColor = new THREE.Color(color);
    } else {
      this.settings.hoverColor = color;
    }
    
    if (this.hoverOutlineMaterial) {
      this.hoverOutlineMaterial.color.copy(this.settings.hoverColor);
    }
  }

  /**
   * Set outline thickness
   */
  public setThickness(thickness: number): void {
    this.settings.thickness = Math.max(0.01, Math.min(0.2, thickness));
    
    // Rebuild outlines with new thickness
    for (const [meshId, info] of this.selectedMeshes) {
      this.removeSelectionOutline(meshId);
      this.addSelectionOutline(info.mesh, meshId);
    }
  }

  /**
   * Enable/disable outline effect
   */
  public setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
    
    if (!enabled) {
      this.clearSelection();
      this.removeHoverOutline();
      this.hoveredMesh = null;
    }
    
    console.log(`🎯 Outline effect ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable/disable hover effect
   */
  public setShowHover(showHover: boolean): void {
    this.settings.showHover = showHover;
    
    if (!showHover) {
      this.removeHoverOutline();
      this.hoveredMesh = null;
    }
  }

  /**
   * Get current settings
   */
  public getSettings(): OutlineSettings {
    return { ...this.settings };
  }

  /**
   * Get selected meshes
   */
  public getSelectedMeshes(): THREE.Mesh[] {
    return Array.from(this.selectedMeshes.values()).map(info => info.mesh);
  }

  /**
   * Get selection info
   */
  public getSelectionInfo(): SelectionInfo[] {
    return Array.from(this.selectedMeshes.values());
  }

  /**
   * Check if a mesh is selected
   */
  public isSelected(mesh: THREE.Mesh): boolean {
    return this.selectedMeshes.has(this.getMeshId(mesh));
  }

  /**
   * Set callbacks
   */
  public setOnSelect(callback: (mesh: THREE.Mesh | null, info?: SelectionInfo) => void): void {
    this.onSelect = callback;
  }

  public setOnHover(callback: (mesh: THREE.Mesh | null) => void): void {
    this.onHover = callback;
  }

  /**
   * Programmatically select meshes by name pattern
   */
  public selectByName(pattern: string | RegExp): void {
    if (!this.scene) return;
    
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && 
          obj.name && 
          regex.test(obj.name) &&
          obj.name !== 'webgpu-ground-plane' &&
          !obj.name.includes('outline-helper')) {
        this.selectMesh(obj);
      }
    });
  }

  /**
   * Debug method to check scene state and test raycasting
   */
  public debugSceneState(): void {
    if (!this.scene) {
      console.log('🎯 DEBUG: No scene available');
      return;
    }
    
    let meshCount = 0;
    let visibleMeshCount = 0;
    const meshNames: string[] = [];
    
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshCount++;
        if (obj.visible) visibleMeshCount++;
        if (obj.name) meshNames.push(obj.name);
      }
    });
    
    console.log('🎯 DEBUG Scene State:');
    console.log('  - Total meshes:', meshCount);
    console.log('  - Visible meshes:', visibleMeshCount);
    console.log('  - Camera:', this.camera?.type);
    console.log('  - Camera position:', this.camera?.position);
    console.log('  - Container:', this.container?.tagName, this.container?.id);
    console.log('  - Settings enabled:', this.settings.enabled);
    console.log('  - Mesh names (first 10):', meshNames.slice(0, 10));
  }

  /**
   * Test raycast from center of screen
   */
  public testRaycastCenter(): void {
    if (!this.scene || !this.camera) {
      console.log('🎯 TEST: Scene or camera not available');
      return;
    }
    
    // Raycast from center of screen
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    console.log('🎯 TEST Raycast from center:');
    console.log('  - Intersections found:', intersects.length);
    
    for (let i = 0; i < Math.min(intersects.length, 5); i++) {
      const hit = intersects[i];
      console.log(`  - Hit ${i}: ${hit.object.name || 'unnamed'} (${hit.object.type}) at distance ${hit.distance.toFixed(2)}`);
    }
  }

  /**
   * Dispose and cleanup
   */
  public dispose(): void {
    // Remove event listeners
    if (this.boundDownHandler) {
      document.removeEventListener('pointerdown', this.boundDownHandler as EventListener, { capture: true });
    }
    if (this.boundDocHandler) {
      document.removeEventListener('pointerup', this.boundDocHandler as EventListener, { capture: true });
    }

    if (this.container) {
      const originalCanvas = this.container.querySelector('canvas:not(#webgpu-canvas)') as HTMLElement | null;
      const eventTarget = (originalCanvas || this.container) as HTMLElement;
      
      if (this.boundDownHandler) {
        eventTarget.removeEventListener('pointerdown', this.boundDownHandler as EventListener, { capture: true });
      }
      if (this.boundClickHandler) {
        eventTarget.removeEventListener('pointerup', this.boundClickHandler as EventListener, { capture: true });
      }
      if (this.boundMoveHandler) {
        eventTarget.removeEventListener('pointermove', this.boundMoveHandler as EventListener, { capture: true });
      }
    }
    
    // Clear selection and remove outline meshes
    this.clearSelection();
    this.removeHoverOutline();
    
    // Dispose materials
    if (this.selectionOutlineMaterial) {
      this.selectionOutlineMaterial.dispose();
      this.selectionOutlineMaterial = null;
    }
    if (this.hoverOutlineMaterial) {
      this.hoverOutlineMaterial.dispose();
      this.hoverOutlineMaterial = null;
    }
    
    // Clear references
    this.scene = null;
    this.camera = null;
    this.container = null;
    this.onSelect = null;
    this.onHover = null;
    
    console.log('🎯 WebGPU Outline Manager disposed');
  }
}
