/**
 * WEBGPU MATERIAL FACTORY (The "Material Lab")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module is responsible for creating the "skin" of the 3D objects. 
 * It takes the colors and textures from the IFC model and turns them into 
 * materials that the WebGPU engine can understand and render beautifully.
 * 
 * HOW IT CONNECTS:
 * - WebGPURendererModule: Provides the materials for every piece of 
 *   geometry in the proxy scene.
 * --------------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from './WebGPUTypes';

export class WebGPUMaterialFactory {
  // Cache for materials by key
  private materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private categoryMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
  
  // Shared fallback material
  public readonly sharedMaterial: THREE.MeshStandardMaterial;

  constructor() {
    this.sharedMaterial = new THREE.MeshStandardMaterial({
      color: 0xbfc8d4,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Create or get cached material from color definition
   */
  public getOrCreateMaterialFromDefinition(definition: any): THREE.MeshStandardMaterial {
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
   * Create or get cached category-based material
   */
  public getOrCreateCategoryMaterial(category: string): THREE.MeshStandardMaterial {
    const cached = this.categoryMaterialCache.get(category);
    if (cached) return cached;

    const colorHex = CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR;
    const color = new THREE.Color(colorHex);

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      opacity: 1,
      transparent: false,
      side: THREE.DoubleSide,
    });
    this.categoryMaterialCache.set(category, mat);
    return mat;
  }

  /**
   * Create material from raw color data (from model.getMaterials())
   */
  public getOrCreateRealMaterial(
    matId: number,
    materialsMap: Map<number, { r: number; g: number; b: number; a?: number }>
  ): THREE.MeshStandardMaterial | null {
    const rawMat = materialsMap.get(matId);
    if (!rawMat) return null;

    const { r, g, b, a } = rawMat;
    const opacity = typeof a === 'number' ? a / 255 : 1;
    const transparent = opacity < 1;
    const key = `real-${r},${g},${b},${opacity.toFixed(3)}`;

    const cached = this.materialCache.get(key);
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
    this.materialCache.set(key, mat);
    return mat;
  }

  /**
   * Get material key for batching/grouping
   */
  public getMaterialKey(mat: THREE.Material): string {
    if (mat instanceof THREE.MeshStandardMaterial) {
      const c = mat.color;
      return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${mat.opacity.toFixed(3)},${mat.transparent ? 1 : 0}`;
    }
    return mat.uuid;
  }

  /**
   * Convert any material to WebGPU-compatible MeshStandardMaterial
   */
  public toStandardMaterial(mat: THREE.Material): THREE.MeshStandardMaterial {
    const c = (mat as any).color as THREE.Color | undefined;
    const r = c ? Math.round(c.r * 255) : 200;
    const g = c ? Math.round(c.g * 255) : 200;
    const b = c ? Math.round(c.b * 255) : 200;
    const opacity = typeof (mat as any).opacity === 'number' ? (mat as any).opacity : 1;
    const transparent = !!(mat as any).transparent || opacity < 1;
    const side = (mat as any).side ?? THREE.DoubleSide;

    const key = `std-${r},${g},${b},${opacity.toFixed(3)},${transparent ? 1 : 0},${side}`;
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
   * Parse color from various formats
   */
  private parseColor(rawColor: any): THREE.Color | null {
    if (!rawColor) return null;

    // THREE.Color or object with r,g,b
    if (typeof rawColor === 'object' && typeof rawColor.r === 'number' && typeof rawColor.g === 'number' && typeof rawColor.b === 'number') {
      const { r, g, b } = rawColor;
      if (r <= 1 && g <= 1 && b <= 1) return new THREE.Color(r, g, b);
      return new THREE.Color(r / 255, g / 255, b / 255);
    }

    // Array [r, g, b]
    if (Array.isArray(rawColor) && rawColor.length >= 3) {
      const [r, g, b] = rawColor;
      if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') {
        if (r <= 1 && g <= 1 && b <= 1) return new THREE.Color(r, g, b);
        return new THREE.Color(r / 255, g / 255, b / 255);
      }
    }

    // Hex number
    if (typeof rawColor === 'number') {
      return new THREE.Color(rawColor);
    }

    return null;
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { materials: number; categoryMaterials: number } {
    return {
      materials: this.materialCache.size,
      categoryMaterials: this.categoryMaterialCache.size,
    };
  }

  /**
   * Clear all cached materials
   */
  public clearCache(): void {
    this.materialCache.clear();
    this.categoryMaterialCache.clear();
  }
}
