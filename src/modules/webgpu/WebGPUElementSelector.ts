/**
 * =============================================================================
 * WebGPU Element Selector
 * =============================================================================
 * 
 * This module provides individual element selection within merged geometries
 * using geometry extraction and overlay rendering.
 * 
 * HOW IT WORKS:
 * -------------
 * 1. ELEMENT ID TRACKING: Each element has a unique ID registered in the color picker
 * 
 * 2. GEOMETRY EXTRACTION: When an element is selected, we extract its vertices
 *    from the merged geometry based on the elementColor attribute
 * 
 * 3. OVERLAY MESH: Create a separate mesh with only the selected element's faces
 *    and render it with a highlight material
 * 
 * This approach avoids ShaderMaterial which isn't compatible with WebGPU.
 * 
 * @see WebGPUColorPicker for element ID encoding
 * =============================================================================
 */

import * as THREE from 'three';
import type { PickingResult, ElementInfo } from './WebGPUColorPicker';

export interface ElementSelectionInfo {
  elementId: number;
  localId: number;
  modelId?: string;
  category?: string;
}

export interface ElementLocation {
  mesh: THREE.Mesh;
  indexStart: number;
  indexCount: number;
}

/**
 * WebGPU Element Selector
 * Provides individual element selection within merged geometries
 */
export class WebGPUElementSelector {
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private container: HTMLElement | null = null;
  
  // Selection state - store element IDs (not meshes)
  private selectedElements: Map<number, ElementSelectionInfo> = new Map();
  private hoveredElement: ElementSelectionInfo | null = null;
  
  // Element ID to mesh locations mapping (for instant highlighting)
  private elementLocations: Map<number, ElementLocation[]> = new Map();
  
  // Highlight overlay meshes (one per selected element)
  private selectionOverlays: Map<number, THREE.Object3D> = new Map();
  private hoverOverlay: THREE.Object3D | null = null;
  
  // Settings
  private selectionColor: THREE.Color = new THREE.Color(0x00aaff);
  private hoverColor: THREE.Color = new THREE.Color(0xffff00);
  private selectionOpacity: number = 0.5;
  private hoverOpacity: number = 0.3;
  private enabled: boolean = true;
  private showHover: boolean = false;
  
  // Callbacks
  private onSelect: ((info: ElementSelectionInfo | null) => void) | null = null;
  private onHover: ((info: ElementSelectionInfo | null) => void) | null = null;
  
  // Cache of element ID → encoded color for fast lookup
  private elementIdToColor: Map<number, { r: number; g: number; b: number }> = new Map();

  constructor() {
    // No initialization needed
  }

  /**
   * Initialize the element selector
   */
  public initialize(
    scene: THREE.Scene,
    camera: THREE.Camera,
    container: HTMLElement
  ): void {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    
    // Reset state for new scene
    this.reset();
    
    console.log('🎯 WebGPU Element Selector initialized');
  }

  /**
   * Reset the element selector state
   */
  public reset(): void {
    this.clearSelection();
    this.elementLocations.clear();
    this.elementIdToColor.clear();
    this.hoveredElement = null;
    if (this.hoverOverlay && this.scene) {
      this.scene.remove(this.hoverOverlay);
      this.hoverOverlay = null;
    }
    console.log('🧹 WebGPU Element Selector state reset');
  }

  /**
   * Register an element's location in a mesh
   * Used for instant highlighting without geometry extraction
   */
  public registerElementLocation(
    elementId: number,
    mesh: THREE.Mesh,
    indexStart: number,
    indexCount: number
  ): void {
    if (!this.elementLocations.has(elementId)) {
      this.elementLocations.set(elementId, []);
    }
    this.elementLocations.get(elementId)!.push({ mesh, indexStart, indexCount });
  }

  /**
   * Build overlay meshes (no-op for lazy creation approach)
   */
  public buildOverlayMeshes(): void {
    // We create overlays lazily when elements are selected
    console.log(`📦 Element selector ready (lazy overlay creation)`);
  }

  /**
   * Encode element ID as color components (0-1 range)
   */
  private encodeIdAsColor(elementId: number): { r: number; g: number; b: number } {
    // Check cache first
    let cached = this.elementIdToColor.get(elementId);
    if (cached) return cached;
    
    const r = ((elementId >> 16) & 0xFF) / 255;
    const g = ((elementId >> 8) & 0xFF) / 255;
    const b = (elementId & 0xFF) / 255;
    
    cached = { r, g, b };
    this.elementIdToColor.set(elementId, cached);
    return cached;
  }

  /**
   * Extract geometry faces for a specific element from merged meshes
   */
  private extractElementGeometry(elementId: number): THREE.BufferGeometry | null {
    if (!this.scene) return null;
    
    const targetColor = this.encodeIdAsColor(elementId);
    // Tolerance must be less than 1/255 ≈ 0.0039 to avoid matching adjacent IDs
    const tolerance = 0.002;
    
    console.log(`🔍 Extracting geometry for elementId=${elementId}, targetColor=RGB(${(targetColor.r*255).toFixed(0)}, ${(targetColor.g*255).toFixed(0)}, ${(targetColor.b*255).toFixed(0)})`);
    
    const positions: number[] = [];
    const normals: number[] = [];
    let matchedTriangles = 0;
    let totalTriangles = 0;
    
    // Traverse scene to find meshes with elementColor attribute
    this.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      
      const geometry = obj.geometry;
      if (!geometry) return;
      
      const elementColorAttr = geometry.getAttribute('elementColor');
      if (!elementColorAttr) return;
      
      const positionAttr = geometry.getAttribute('position');
      const normalAttr = geometry.getAttribute('normal');
      if (!positionAttr) return;
      
      const indexAttr = geometry.getIndex();
      
      // Get world matrix for transforming positions
      obj.updateMatrixWorld();
      const worldMatrix = obj.matrixWorld;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
      
      if (indexAttr) {
        // Indexed geometry - iterate over triangles
        for (let i = 0; i < indexAttr.count; i += 3) {
          totalTriangles++;
          const a = indexAttr.getX(i);
          const b = indexAttr.getX(i + 1);
          const c = indexAttr.getX(i + 2);
          
          // Check if this triangle belongs to our element
          const colorA = {
            r: elementColorAttr.getX(a),
            g: elementColorAttr.getY(a),
            b: elementColorAttr.getZ(a),
          };
          
          if (Math.abs(colorA.r - targetColor.r) < tolerance &&
              Math.abs(colorA.g - targetColor.g) < tolerance &&
              Math.abs(colorA.b - targetColor.b) < tolerance) {
            
            matchedTriangles++;
            // Add this triangle to our extracted geometry
            for (const idx of [a, b, c]) {
              const pos = new THREE.Vector3(
                positionAttr.getX(idx),
                positionAttr.getY(idx),
                positionAttr.getZ(idx)
              );
              pos.applyMatrix4(worldMatrix);
              positions.push(pos.x, pos.y, pos.z);
              
              if (normalAttr) {
                const norm = new THREE.Vector3(
                  normalAttr.getX(idx),
                  normalAttr.getY(idx),
                  normalAttr.getZ(idx)
                );
                norm.applyMatrix3(normalMatrix).normalize();
                normals.push(norm.x, norm.y, norm.z);
              }
            }
          }
        }
      } else {
        // Non-indexed geometry - iterate over triangles directly
        for (let i = 0; i < positionAttr.count; i += 3) {
          totalTriangles++;
          const colorA = {
            r: elementColorAttr.getX(i),
            g: elementColorAttr.getY(i),
            b: elementColorAttr.getZ(i),
          };
          
          if (Math.abs(colorA.r - targetColor.r) < tolerance &&
              Math.abs(colorA.g - targetColor.g) < tolerance &&
              Math.abs(colorA.b - targetColor.b) < tolerance) {
            
            matchedTriangles++;
            for (let j = 0; j < 3; j++) {
              const idx = i + j;
              const pos = new THREE.Vector3(
                positionAttr.getX(idx),
                positionAttr.getY(idx),
                positionAttr.getZ(idx)
              );
              pos.applyMatrix4(worldMatrix);
              positions.push(pos.x, pos.y, pos.z);
              
              if (normalAttr) {
                const norm = new THREE.Vector3(
                  normalAttr.getX(idx),
                  normalAttr.getY(idx),
                  normalAttr.getZ(idx)
                );
                norm.applyMatrix3(normalMatrix).normalize();
                normals.push(norm.x, norm.y, norm.z);
              }
            }
          }
        }
      }
    });
    
    console.log(`🔍 Extraction complete: ${matchedTriangles} triangles matched out of ${totalTriangles} checked`);
    
    if (positions.length === 0) {
      return null;
    }
    
    // Create geometry from extracted data
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length > 0) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
    geometry.computeBoundingSphere();
    
    return geometry;
  }

  /**
   * Create selection overlay mesh for an element
   */
  private createSelectionOverlay(elementId: number): THREE.Object3D | null {
    const locations = this.elementLocations.get(elementId);
    
    // If we have pre-registered locations, use instant drawRange method
    if (locations && locations.length > 0) {
      const group = new THREE.Group();
      group.name = `selection-overlay-group-${elementId}`;
      
      const material = new THREE.MeshBasicMaterial({
        color: this.selectionColor,
        transparent: true,
        opacity: this.selectionOpacity,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      
      for (const loc of locations) {
        const overlayGeo = new THREE.BufferGeometry();
        
        // Copy attributes safely
        for (const name in loc.mesh.geometry.attributes) {
          overlayGeo.setAttribute(name, loc.mesh.geometry.attributes[name]);
        }
        
        // Copy index safely
        if (loc.mesh.geometry.index) {
          overlayGeo.setIndex(loc.mesh.geometry.index);
        }
        
        overlayGeo.setDrawRange(loc.indexStart, loc.indexCount);
        
        const mesh = new THREE.Mesh(overlayGeo, material);
        mesh.name = `selection-overlay-mesh-${elementId}`;
        mesh.matrix.copy(loc.mesh.matrixWorld);
        mesh.matrixWorld.copy(loc.mesh.matrixWorld);
        mesh.matrixAutoUpdate = false;
        mesh.renderOrder = 1000;
        mesh.frustumCulled = false;
        
        group.add(mesh);
      }
      
      return group;
    }
    
    // Fallback: slow geometry extraction
    const geometry = this.extractElementGeometry(elementId);
    if (!geometry) {
      console.warn(`⚠️ No geometry extracted for elementId=${elementId}`);
      return null;
    }
    
    const posAttr = geometry.getAttribute('position');
    const triangleCount = posAttr ? posAttr.count / 3 : 0;
    console.log(`📐 Extracted ${triangleCount} triangles for elementId=${elementId}`);
    
    const material = new THREE.MeshBasicMaterial({
      color: this.selectionColor,
      transparent: true,
      opacity: this.selectionOpacity,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `selection-overlay-${elementId}`;
    mesh.renderOrder = 1000;
    mesh.frustumCulled = false;
    
    return mesh;
  }

  /**
   * Create hover overlay mesh for an element
   */
  private createHoverOverlay(elementId: number): THREE.Object3D | null {
    const locations = this.elementLocations.get(elementId);
    
    // If we have pre-registered locations, use instant drawRange method
    if (locations && locations.length > 0) {
      const group = new THREE.Group();
      group.name = `hover-overlay-group-${elementId}`;
      
      const material = new THREE.MeshBasicMaterial({
        color: this.hoverColor,
        transparent: true,
        opacity: this.hoverOpacity,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      
      for (const loc of locations) {
        const overlayGeo = new THREE.BufferGeometry();
        
        // Copy attributes safely
        for (const name in loc.mesh.geometry.attributes) {
          overlayGeo.setAttribute(name, loc.mesh.geometry.attributes[name]);
        }
        
        // Copy index safely
        if (loc.mesh.geometry.index) {
          overlayGeo.setIndex(loc.mesh.geometry.index);
        }
        
        overlayGeo.setDrawRange(loc.indexStart, loc.indexCount);
        
        const mesh = new THREE.Mesh(overlayGeo, material);
        mesh.name = `hover-overlay-mesh-${elementId}`;
        mesh.matrix.copy(loc.mesh.matrixWorld);
        mesh.matrixWorld.copy(loc.mesh.matrixWorld);
        mesh.matrixAutoUpdate = false;
        mesh.renderOrder = 999;
        mesh.frustumCulled = false;
        
        group.add(mesh);
      }
      
      return group;
    }
    
    // Fallback: slow geometry extraction
    const geometry = this.extractElementGeometry(elementId);
    if (!geometry) return null;
    
    const material = new THREE.MeshBasicMaterial({
      color: this.hoverColor,
      transparent: true,
      opacity: this.hoverOpacity,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `hover-overlay-${elementId}`;
    mesh.renderOrder = 999;
    mesh.frustumCulled = false;
    
    return mesh;
  }

  /**
   * Select an element by picking result
   */
  public selectElement(result: PickingResult, info: ElementInfo): void {
    const elementId = result.elementId;
    
    if (this.selectedElements.has(elementId)) return;
    
    const selectionInfo: ElementSelectionInfo = {
      elementId,
      localId: info.localId,
      modelId: info.modelId,
      category: info.category,
    };
    
    this.selectedElements.set(elementId, selectionInfo);
    
    // Create and add overlay mesh
    const overlay = this.createSelectionOverlay(elementId);
    if (overlay && this.scene) {
      this.scene.add(overlay);
      this.selectionOverlays.set(elementId, overlay);
    }
    
    console.log(`🎯 Selected element: localId=${info.localId}, elementId=${elementId}`);
    
    if (this.onSelect) {
      this.onSelect(selectionInfo);
    }
  }

  /**
   * Select element by local ID (IFC ExpressID)
   */
  public selectByLocalId(localId: number, elementId: number, modelId?: string): void {
    if (this.selectedElements.has(elementId)) return;
    
    const selectionInfo: ElementSelectionInfo = {
      elementId,
      localId,
      modelId,
    };
    
    this.selectedElements.set(elementId, selectionInfo);
    
    // Create and add overlay mesh
    const overlay = this.createSelectionOverlay(elementId);
    if (overlay && this.scene) {
      this.scene.add(overlay);
      this.selectionOverlays.set(elementId, overlay);
    }
    
    console.log(`🎯 Selected element: localId=${localId}, elementId=${elementId}`);
    
    if (this.onSelect) {
      this.onSelect(selectionInfo);
    }
  }

  /**
   * Deselect an element
   */
  public deselectElement(elementId: number): void {
    if (!this.selectedElements.has(elementId)) return;
    
    // Remove overlay mesh
    const overlay = this.selectionOverlays.get(elementId);
    if (overlay && this.scene) {
      this.scene.remove(overlay);
      
      // Dispose resources
      overlay.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
    }
    this.selectionOverlays.delete(elementId);
    
    this.selectedElements.delete(elementId);
    
    console.log(`🎯 Deselected element: ${elementId}`);
    
    if (this.onSelect) {
      this.onSelect(null);
    }
  }

  /**
   * Clear all selections
   */
  public clearSelection(): void {
    // Remove all overlay meshes
    for (const [elementId, overlay] of this.selectionOverlays) {
      if (this.scene) {
        this.scene.remove(overlay);
      }
      
      // Dispose resources
      overlay.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
    }
    this.selectionOverlays.clear();
    this.selectedElements.clear();
    
    console.log('🎯 Selection cleared');
    
    if (this.onSelect) {
      this.onSelect(null);
    }
  }

  /**
   * Set hover element
   */
  public setHoverElement(result: PickingResult | null, info: ElementInfo | null): void {
    if (!this.showHover) return;
    
    // Remove existing hover overlay
    if (this.hoverOverlay && this.scene) {
      this.scene.remove(this.hoverOverlay);
      
      // Dispose resources
      this.hoverOverlay.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
      
      this.hoverOverlay = null;
    }
    
    if (!result || !info) {
      this.hoveredElement = null;
      if (this.onHover) {
        this.onHover(null);
      }
      return;
    }
    
    // Don't hover if already selected
    if (this.selectedElements.has(result.elementId)) {
      this.hoveredElement = null;
      return;
    }
    
    this.hoveredElement = {
      elementId: result.elementId,
      localId: info.localId,
      modelId: info.modelId,
      category: info.category,
    };
    
    // Create and add hover overlay
    this.hoverOverlay = this.createHoverOverlay(result.elementId);
    if (this.hoverOverlay && this.scene) {
      this.scene.add(this.hoverOverlay);
    }
    
    if (this.onHover) {
      this.onHover(this.hoveredElement);
    }
  }

  /**
   * Render selection overlay (no-op - overlays are added directly to scene)
   */
  public render(renderer: any): void {
    // Overlays are added directly to the scene, so no separate render needed
  }

  /**
   * Set selection color
   */
  public setSelectionColor(color: number | string | THREE.Color): void {
    if (typeof color === 'number') {
      this.selectionColor.setHex(color);
    } else if (typeof color === 'string') {
      this.selectionColor.set(color);
    } else {
      this.selectionColor.copy(color);
    }
    
    // Update existing overlays
    for (const overlay of this.selectionOverlays.values()) {
      overlay.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial) {
          obj.material.color.copy(this.selectionColor);
        }
      });
    }
  }

  /**
   * Set hover color
   */
  public setHoverColor(color: number | string | THREE.Color): void {
    if (typeof color === 'number') {
      this.hoverColor.setHex(color);
    } else if (typeof color === 'string') {
      this.hoverColor.set(color);
    } else {
      this.hoverColor.copy(color);
    }
    
    if (this.hoverOverlay) {
      this.hoverOverlay.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial) {
          obj.material.color.copy(this.hoverColor);
        }
      });
    }
  }

  /**
   * Set callbacks
   */
  public setOnSelect(callback: ((info: ElementSelectionInfo | null) => void) | null): void {
    this.onSelect = callback;
  }

  public setOnHover(callback: ((info: ElementSelectionInfo | null) => void) | null): void {
    this.onHover = callback;
  }

  /**
   * Enable/disable
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setShowHover(show: boolean): void {
    this.showHover = show;
    
    // Remove hover overlay if disabling
    if (!show && this.hoverOverlay && this.scene) {
      this.scene.remove(this.hoverOverlay);
      
      // Dispose resources
      this.hoverOverlay.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
      
      this.hoverOverlay = null;
      this.hoveredElement = null;
    }
  }

  /**
   * Get selected elements
   */
  public getSelectedElements(): ElementSelectionInfo[] {
    return Array.from(this.selectedElements.values());
  }

  /**
   * Get selected element count
   */
  public getSelectedCount(): number {
    return this.selectedElements.size;
  }

  /**
   * Check if element is selected
   */
  public isElementSelected(elementId: number): boolean {
    return this.selectedElements.has(elementId);
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.clearSelection();
    
    if (this.hoverOverlay && this.scene) {
      this.scene.remove(this.hoverOverlay);
      
      // Dispose resources
      this.hoverOverlay.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
      
      this.hoverOverlay = null;
    }
    
    this.elementIdToColor.clear();
    this.elementLocations.clear();
    this.selectedElements.clear();
    this.hoveredElement = null;
    this.scene = null;
    this.camera = null;
    this.container = null;
  }

  /**
   * Debug stats
   */
  public debugStats(): void {
    console.log('📊 Element Selector Stats:');
    console.log(`   Selected elements: ${this.selectedElements.size}`);
    console.log(`   Hovered element: ${this.hoveredElement?.elementId ?? 'none'}`);
    console.log(`   Selection overlays: ${this.selectionOverlays.size}`);
    
    if (this.selectedElements.size > 0) {
      console.log('   Selected IDs:');
      for (const [id, info] of this.selectedElements) {
        console.log(`     - elementId=${id}, localId=${info.localId}`);
      }
    }
  }
}
