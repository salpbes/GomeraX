/**
 * WEBGPU COLOR PICKER (The "Picky Eye")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module is what allows the computer to "see" what you are clicking 
 * on. It uses a clever trick to identify which specific object is under 
 * your mouse cursor, even when thousands of objects are visible at once.
 * 
 * HOW IT CONNECTS:
 * - WebGPUElementSelector: Provides the "ID" of the object you clicked 
 *   so it can be selected.
 * --------------------------------------------------------------------------------
 */


import * as THREE from 'three';

export interface PickingResult {
  elementId: number;
  localId: number;
  modelId?: string;
  point?: THREE.Vector3;
  mesh?: THREE.Mesh;
  faceIndex?: number;
}

export interface ElementInfo {
  localId: number;
  modelId?: string;
  category?: string;
  expressId?: number;
}

/**
 * WebGPU Color Picker
 * CPU raycast + element vertex attribute lookup for individual element selection
 */
export class WebGPUColorPicker {
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private container: HTMLElement | null = null;
  
  // Raycaster for CPU-based picking
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouse: THREE.Vector2 = new THREE.Vector2();
  
  // Element ID to info mapping
  private elementIdToInfo: Map<number, ElementInfo> = new Map();
  private localIdToElementId: Map<string, number> = new Map(); // "modelId:localId" → elementId
  private nextElementId: number = 1; // Start at 1, 0 = no element
  
  // Selection state
  private selectedElementId: number | null = null;
  private hoveredElementId: number | null = null;
  
  // Event callbacks
  private onSelect: ((result: PickingResult | null) => void) | null = null;
  private onHover: ((result: PickingResult | null) => void) | null = null;
  
  // Settings
  private enabled: boolean = true;
  
  constructor() {
    // No initialization needed for CPU raycasting
  }

  /**
   * Initialize the color picker
   */
  public initialize(
    renderer: any, // Not used for CPU raycasting, kept for API compatibility
    scene: THREE.Scene,
    camera: THREE.Camera,
    container: HTMLElement
  ): void {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    
    // DO NOT RESET HERE! 
    // Resetting here wipes out the element registry that was populated during scene build.
    // Reset should be called explicitly before building the scene.
    
    console.log('✅ WebGPU Color Picker initialized (CPU raycast mode)', {
      sceneChildren: scene.children.length,
      container: container.id || container.tagName
    });
  }

  /**
   * Reset the color picker state
   */
  public reset(): void {
    this.elementIdToInfo.clear();
    this.localIdToElementId.clear();
    this.nextElementId = 1;
    this.selectedElementId = null;
    this.hoveredElementId = null;
    console.log('🧹 WebGPU Color Picker state reset');
  }

  /**
   * Register an element and get its unique ID
   */
  public registerElement(info: ElementInfo): number {
    const elementId = this.nextElementId++;
    this.elementIdToInfo.set(elementId, info);
    
    // Also map localId to elementId for reverse lookup
    const key = `${info.modelId || ''}:${info.localId}`;
    this.localIdToElementId.set(key, elementId);
    
    return elementId;
  }

  /**
   * Encode element ID as RGB color
   * Supports up to 16,777,215 unique elements (24-bit)
   */
  public encodeIdAsColor(elementId: number): THREE.Color {
    const r = (elementId >> 16) & 0xFF;
    const g = (elementId >> 8) & 0xFF;
    const b = elementId & 0xFF;
    return new THREE.Color(r / 255, g / 255, b / 255);
  }

  /**
   * Decode RGB color (0-1 range) back to element ID
   */
  public decodeColorToId(r: number, g: number, b: number): number {
    const ri = Math.round(r * 255);
    const gi = Math.round(g * 255);
    const bi = Math.round(b * 255);
    return (ri << 16) | (gi << 8) | bi;
  }

  /**
   * Create element color attribute for a geometry
   * This encodes element IDs as vertex colors for picking
   */
  public createElementColorAttribute(
    geometry: THREE.BufferGeometry,
    elementId: number
  ): void {
    const positionAttr = geometry.getAttribute('position');
    if (!positionAttr) return;
    
    const vertexCount = positionAttr.count;
    const colors = new Float32Array(vertexCount * 3);
    
    const color = this.encodeIdAsColor(elementId);
    
    for (let i = 0; i < vertexCount; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    
    geometry.setAttribute('elementColor', new THREE.Float32BufferAttribute(colors, 3));
  }

  /**
   * Build picking scene (no-op for CPU raycasting, kept for API compatibility)
   */
  public buildPickingScene(): void {
    // Count meshes with elementColor attribute
    let meshCount = 0;
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry?.getAttribute('elementColor')) {
          meshCount++;
        }
      });
    }
    console.log(`📦 Picking ready: ${meshCount} meshes with elementColor attribute`);
  }

  /**
   * Pick element at screen coordinates using CPU raycasting
   */
  public async pick(
    screenX: number,
    screenY: number
  ): Promise<PickingResult | null> {
    if (!this.enabled || !this.scene || !this.camera || !this.container) {
      console.warn('⚠️ ColorPicker: Missing dependencies or disabled', { 
        enabled: this.enabled, 
        scene: !!this.scene, 
        camera: !!this.camera, 
        container: !!this.container 
      });
      return null;
    }
    
    // Convert screen coords to normalized device coordinates
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((screenX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((screenY - rect.top) / rect.height) * 2 + 1;
    
    // Update camera matrices
    this.camera.updateMatrixWorld();
    
    // Perform raycast
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    if (intersects.length === 0) {
      return null;
    }
    
    // Find first mesh with elementColor attribute
    for (const intersect of intersects) {
      if (!(intersect.object instanceof THREE.Mesh)) continue;
      
      const mesh = intersect.object;
      const geometry = mesh.geometry;
      
      // Skip helper meshes
      if (mesh.name.includes('outline-helper') || 
          mesh.name.includes('selection-overlay') ||
          mesh.name.includes('hover-overlay') ||
          mesh.name.includes('selection-overlay-mesh') ||
          mesh.name.includes('hover-overlay-mesh') ||
          mesh.name === 'webgpu-ground-plane') {
        continue;
      }
      
      // Check if geometry has elementColor attribute
      const elementColorAttr = geometry.getAttribute('elementColor');
      if (!elementColorAttr) {

        continue;
      }
      
      // Get the face index from the intersection
      const faceIndex = intersect.faceIndex;
      if (faceIndex === undefined || faceIndex === null) continue;
      
      // Get vertex indices for this face
      const indexAttr = geometry.getIndex();
      let vertexIndex: number;
      
      if (indexAttr) {
        // Indexed geometry - get first vertex of the face
        vertexIndex = indexAttr.getX(faceIndex * 3);
      } else {
        // Non-indexed geometry
        vertexIndex = faceIndex * 3;
      }
      
      // Read element color from vertex attribute
      const r = elementColorAttr.getX(vertexIndex);
      const g = elementColorAttr.getY(vertexIndex);
      const b = elementColorAttr.getZ(vertexIndex);
      
      // Decode element ID
      const elementId = this.decodeColorToId(r, g, b);
      
      if (elementId === 0) {
        // No element at this vertex
        continue;
      }
      
      const info = this.elementIdToInfo.get(elementId);
      if (!info) {
        continue;
      }
      
      return {
        elementId,
        localId: info.localId,
        modelId: info.modelId,
        point: intersect.point.clone(),
        mesh,
        faceIndex: faceIndex ?? undefined,
      };
    }
    
    return null;
  }

  /**
   * Handle click event for picking
   */
  public async handleClick(event: MouseEvent): Promise<PickingResult | null> {
    if (!this.enabled) return null;
    
    const result = await this.pick(event.clientX, event.clientY);
    
    if (result) {
      this.selectedElementId = result.elementId;
    } else {
      this.selectedElementId = null;
    }
    
    if (this.onSelect) {
      this.onSelect(result);
    }
    
    return result;
  }

  /**
   * Handle mouse move for hover picking
   */
  public async handleMouseMove(event: MouseEvent): Promise<PickingResult | null> {
    if (!this.enabled) return null;
    
    const result = await this.pick(event.clientX, event.clientY);
    
    const newHoverId = result?.elementId ?? null;
    if (newHoverId !== this.hoveredElementId) {
      this.hoveredElementId = newHoverId;
      
      if (this.onHover) {
        this.onHover(result);
      }
    }
    
    return result;
  }

  /**
   * Set selection callback
   */
  public setOnSelect(callback: ((result: PickingResult | null) => void) | null): void {
    this.onSelect = callback;
  }

  /**
   * Set hover callback
   */
  public setOnHover(callback: ((result: PickingResult | null) => void) | null): void {
    this.onHover = callback;
  }

  /**
   * Enable/disable picking
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if picking is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get element info by element ID
   */
  public getElementInfo(elementId: number): ElementInfo | undefined {
    return this.elementIdToInfo.get(elementId);
  }

  /**
   * Get element ID by local ID and model ID
   */
  public getElementIdByLocalId(localId: number, modelId?: string): number | undefined {
    const key = `${modelId || ''}:${localId}`;
    return this.localIdToElementId.get(key);
  }

  /**
   * Get currently selected element ID
   */
  public getSelectedElementId(): number | null {
    return this.selectedElementId;
  }

  /**
   * Get currently hovered element ID
   */
  public getHoveredElementId(): number | null {
    return this.hoveredElementId;
  }

  /**
   * Clear selection
   */
  public clearSelection(): void {
    this.selectedElementId = null;
    if (this.onSelect) {
      this.onSelect(null);
    }
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.elementIdToInfo.clear();
    this.localIdToElementId.clear();
    this.scene = null;
    this.camera = null;
    this.container = null;
  }

  /**
   * Get total registered elements count
   */
  public getElementCount(): number {
    return this.elementIdToInfo.size;
  }

  /**
   * Debug: log element stats
   */
  public debugStats(): void {
    console.log('📊 Color Picker Stats:');
    console.log(`   Registered elements: ${this.elementIdToInfo.size}`);
    console.log(`   Selected element: ${this.selectedElementId}`);
    console.log(`   Hovered element: ${this.hoveredElementId}`);
  }
}
