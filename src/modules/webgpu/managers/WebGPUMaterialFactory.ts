/**
 * WebGPU Material Factory (The "Material Alchemist")
 * 
 * Centralized material creation and caching for WebGPU rendering.
 * Handles conversion of OBC/IFC materials to WebGPU-compatible THREE.js materials.
 * 
 * Extracted from WebGPURendererModule for better maintainability.
 */

import * as THREE from 'three';
import { getOrCreateCategoryMaterial, getCategoryColor } from './WebGPUCategoryPalette';

/**
 * Material definition interface (from OBC)
 */
export interface MaterialDefinition {
  color?: THREE.Color | { r: number; g: number; b: number } | number[] | number;
  opacity?: number;
  transparent?: boolean;
  renderedFaces?: number; // 0 = FrontSide, 1 = DoubleSide
}

/**
 * Raw material data from model.getMaterials()
 */
export interface RawMaterialData {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * WebGPU Material Factory
 * Creates and caches materials for WebGPU rendering
 */
export class WebGPUMaterialFactory {
  // Material caches
  private materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private realMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
  private slicerMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
  private colorSplashCache = new Map<string, THREE.MeshStandardMaterial>();
  
  // Special materials
  private ghostMaterial: THREE.MeshStandardMaterial | null = null;
  private sharedMaterial: THREE.MeshStandardMaterial | null = null;
  
  /**
   * Get the shared fallback material
   */
  public getSharedMaterial(): THREE.MeshStandardMaterial {
    if (!this.sharedMaterial) {
      this.sharedMaterial = new THREE.MeshStandardMaterial({
        color: 0xbfc8d4,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
      });
    }
    return this.sharedMaterial;
  }
  
  /**
   * Get or create a ghost material for isolated elements
   */
  public getOrCreateGhostMaterial(): THREE.MeshStandardMaterial {
    if (!this.ghostMaterial) {
      this.ghostMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        roughness: 1,
        metalness: 0,
        opacity: 0.6,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        alphaToCoverage: true,
      });
    }
    return this.ghostMaterial;
  }
  
  /**
   * Create material from OBC material definition
   */
  public getOrCreateMaterialFromDefinition(definition: MaterialDefinition): THREE.MeshStandardMaterial {
    const rawColor = definition?.color;
    const color = this.parseColor(rawColor);

    const opacity = typeof definition?.opacity === 'number' ? definition.opacity : 1;
    const transparent = !!definition?.transparent || opacity < 1;
    const renderedFaces = definition?.renderedFaces;
    const side = renderedFaces === 0 ? THREE.FrontSide : THREE.DoubleSide;

    const r = color ? Math.round(color.r * 255) : 191;
    const g = color ? Math.round(color.g * 255) : 200;
    const b = color ? Math.round(color.b * 255) : 212;
    const key = `${r},${g},${b},${opacity.toFixed(3)},${transparent ? 1 : 0},${side}`;

    const cached = this.materialCache.get(key);
    if (cached) return cached;

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(r / 255, g / 255, b / 255),
      roughness: 1,
      metalness: 0,
      opacity,
      transparent,
      side,
      alphaToCoverage: transparent,
      depthWrite: !transparent
    });
    this.materialCache.set(key, mat);
    return mat;
  }

  /**
   * Create a compatible material for in-place scene swapping.
   * Converts any material (ShaderMaterial, etc.) to a basic WebGPU-safe material.
   */
  public createCompatibleMaterial(original: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
    const base = Array.isArray(original) ? original[0] : original;

    // Extract a best-effort color
    let color: any = 0x888888;
    if (base && (base as any).color) color = (base as any).color;
    else if (base && (base as any).uniforms?.diffuse?.value) color = (base as any).uniforms.diffuse.value;

    return new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: !!(base && (base as any).transparent),
      opacity: (base && typeof (base as any).opacity === 'number') ? (base as any).opacity : 1.0,
      wireframe: !!(base && (base as any).wireframe)
    });
  }
  
  /**
   * Create material from raw material data (model.getMaterials())
   */
  public getOrCreateRealMaterial(matId: number, rawMat: RawMaterialData): THREE.MeshStandardMaterial | null {
    if (!rawMat) return null;

    const { r, g, b, a } = rawMat;
    const opacity = typeof a === 'number' ? a / 255 : 1;
    const transparent = opacity < 1;
    const key = `${r},${g},${b},${opacity.toFixed(3)}`;

    const cached = this.realMaterialCache.get(key);
    if (cached) return cached;

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(r / 255, g / 255, b / 255),
      roughness: 1,
      metalness: 0,
      opacity,
      transparent,
      side: THREE.DoubleSide,
      alphaToCoverage: transparent,
      depthWrite: !transparent
    });
    this.realMaterialCache.set(key, mat);
    return mat;
  }
  
  /**
   * Get or create a Slicer material for a specific color
   */
  public getOrCreateSlicerMaterial(color: THREE.Color): THREE.MeshStandardMaterial {
    const key = `slicer_${color.getHexString()}`;
    const cached = this.slicerMaterialCache.get(key);
    if (cached) return cached;
    
    const mat = new THREE.MeshStandardMaterial({
      color: color.clone(),
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      opacity: 0.85,
      transparent: true,
      alphaToCoverage: true,
      depthWrite: false
    });
    this.slicerMaterialCache.set(key, mat);
    return mat;
  }

  /**
   * Get or create a Color Splash material (opaque)
   */
  public getOrCreateColorSplashMaterial(color: THREE.Color): THREE.MeshStandardMaterial {
    const key = `splash_${color.getHexString()}`;
    const cached = this.colorSplashCache.get(key);
    if (cached) return cached;
    
    const mat = new THREE.MeshStandardMaterial({
      color: color.clone(),
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      opacity: 1.0,
      transparent: false,
      depthWrite: true
    });
    this.colorSplashCache.set(key, mat);
    return mat;
  }
  
  /**
   * Get category material (delegates to WebGPUCategoryPalette)
   */
  public getCategoryMaterial(category: string): THREE.MeshStandardMaterial {
    return getOrCreateCategoryMaterial(category);
  }
  
  /**
   * Convert any material to WebGPU-compatible MeshStandardMaterial
   * Used when cloning fragment meshes
   */
  public toStandardMaterial(mat: THREE.Material): THREE.MeshStandardMaterial {
    const c = (mat as any).color as THREE.Color | undefined;
    const r = c ? Math.round(c.r * 255) : 200;
    const g = c ? Math.round(c.g * 255) : 200;
    const b = c ? Math.round(c.b * 255) : 200;
    const opacity = typeof (mat as any).opacity === 'number' ? (mat as any).opacity : 1;
    const transparent = !!(mat as any).transparent || opacity < 1;
    const side = (mat as any).side ?? THREE.DoubleSide;

    const key = `std_${r},${g},${b},${opacity.toFixed(3)},${transparent ? 1 : 0},${side}`;
    const cached = this.materialCache.get(key);
    if (cached) return cached;

    const newMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(r / 255, g / 255, b / 255),
      roughness: 1,
      metalness: 0,
      opacity,
      transparent,
      side,
      alphaToCoverage: transparent,
      depthWrite: !transparent
    });
    this.materialCache.set(key, newMat);
    return newMat;
  }
  
  /**
   * Get the cache key for a material (used for geometry batching)
   */
  public getMaterialKey(
    mat: THREE.Material, 
    category?: string, 
    colorSplashActive?: boolean
  ): string {
    if (colorSplashActive && category) {
      return `splash_${category}`;
    }
    if (mat instanceof THREE.MeshStandardMaterial) {
      const c = mat.color;
      return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${mat.opacity.toFixed(3)},${mat.transparent ? 1 : 0}`;
    }
    return mat.uuid;
  }
  
  /**
   * Parse color from various formats
   */
  private parseColor(rawColor: any): THREE.Color | null {
    if (!rawColor) return null;
    
    // THREE.Color or THREE-like
    if (typeof rawColor === 'object' && typeof rawColor.r === 'number' && 
        typeof rawColor.g === 'number' && typeof rawColor.b === 'number') {
      const r = rawColor.r;
      const g = rawColor.g;
      const b = rawColor.b;
      // r/g/b are typically 0..1
      if (r <= 1 && g <= 1 && b <= 1) return new THREE.Color(r, g, b);
      // sometimes serialized as 0..255
      return new THREE.Color(r / 255, g / 255, b / 255);
    }
    
    if (Array.isArray(rawColor) && rawColor.length >= 3) {
      const [r, g, b] = rawColor;
      if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') {
        if (r <= 1 && g <= 1 && b <= 1) return new THREE.Color(r, g, b);
        return new THREE.Color(r / 255, g / 255, b / 255);
      }
    }
    
    if (typeof rawColor === 'number') {
      return new THREE.Color(rawColor);
    }
    
    return null;
  }
  
  /**
   * Clear all material caches
   */
  public clearCaches(): void {
    // Dispose all cached materials
    const disposeSafe = (mat: THREE.Material | null) => {
      if (!mat) return;
      try {
        mat.dispose();
      } catch (e) {
        // Ignore disposal errors (often happens in WebGPU if renderer is already gone)
      }
    };

    for (const mat of this.materialCache.values()) {
      disposeSafe(mat);
    }
    for (const mat of this.realMaterialCache.values()) {
      disposeSafe(mat);
    }
    for (const mat of this.slicerMaterialCache.values()) {
      disposeSafe(mat);
    }
    for (const mat of this.colorSplashCache.values()) {
      disposeSafe(mat);
    }
    
    this.materialCache.clear();
    this.realMaterialCache.clear();
    this.slicerMaterialCache.clear();
    this.colorSplashCache.clear();
    
    if (this.ghostMaterial) {
      disposeSafe(this.ghostMaterial);
      this.ghostMaterial = null;
    }
    if (this.sharedMaterial) {
      disposeSafe(this.sharedMaterial);
      this.sharedMaterial = null;
    }
  }
  
  /**
   * Dispose all resources
   */
  public dispose(): void {
    this.clearCaches();
  }
}

/**
 * Singleton instance for convenience
 */
let materialFactoryInstance: WebGPUMaterialFactory | null = null;

export function getMaterialFactory(): WebGPUMaterialFactory {
  if (!materialFactoryInstance) {
    materialFactoryInstance = new WebGPUMaterialFactory();
  }
  return materialFactoryInstance;
}

export function disposeMaterialFactory(): void {
  if (materialFactoryInstance) {
    materialFactoryInstance.dispose();
    materialFactoryInstance = null;
  }
}
