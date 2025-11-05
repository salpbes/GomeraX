/**
 * ClipStyler Module
 * 
 * Provides clean section fills for clipping planes WITHOUT hatch lines.
 * 
 * NOTE: LineMaterial hatch lines have a known bug where they appear on both sides
 * of the clipping plane (black rectangle artifact). This is a THREE.js limitation.
 * Solution: Use ONLY fill material for clean, professional section cuts.
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import { WorldManager } from './WorldManager';

export class ClipStylerModule {
  private clipStyler: OBF.ClipStyler | null = null;
  private world: OBC.World | null = null;
  private worldManager: WorldManager;
  private components: OBC.Components;
  private clipper: OBC.Clipper | null = null;

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
  }

  /**
   * Initializes the ClipStyler with clean section fills (NO hatch lines)
   */
  public async initialize(world: OBC.World, clipper: OBC.Clipper): Promise<void> {
    this.world = world;
    this.clipper = clipper;

    // Get or create the ClipStyler component
    this.clipStyler = this.components.get(OBF.ClipStyler);
    this.clipStyler.world = world;

    // Define clean section fill style (no lines to avoid artifacts)
    this.defineStyles();

    // Set up automatic styling when clipping planes are created
    this.setupClippingPlaneListeners();

    console.log('✅ ClipStyler initialized (clean section fills, no hatch lines)');
  }

  /**
   * Define custom section fill style
   */
  private defineStyles(): void {
    if (!this.clipStyler) return;

    // Clean fill ONLY - no LineMaterial to avoid artifacts
    const material = new THREE.MeshBasicMaterial({
      color: 0xADD8E6,    // Light blue
      side: THREE.DoubleSide, // Render both front and back faces
      transparent: true,
      opacity: 0.3,       // Subtle fill
      depthWrite: false,  // Prevent z-fighting
      depthTest: true,    // Proper depth testing
      vertexColors: false, // Don't use vertex colors
      fog: false,         // Not affected by fog
      toneMapped: false,  // Disable tone mapping to preserve exact color
    });

    material.needsUpdate = true;

    this.clipStyler.styles.set('SectionFill', {
      fillsMaterial: material,
    });

    console.log('🎨 Clean section fill style defined');
  }  /**
   * Set up automatic styling when clipping planes are created
   */
  private setupClippingPlaneListeners(): void {
    if (!this.clipper || !this.clipStyler) return;

    this.clipper.list.onItemSet.add(({ key }) => {
      this.clipStyler?.createFromClipping(key, {
        items: { All: { style: 'SectionFill' } },
      });
      
      console.log('🎨 Clean section fill applied');
      
      // Apply material properties after ClipStyler creates the geometry
      // Multiple attempts with increasing delays to ensure mesh is ready
      setTimeout(() => this.ensureMaterialProperties(), 100);
      setTimeout(() => this.ensureMaterialProperties(), 500);
      setTimeout(() => this.ensureMaterialProperties(), 1000);
    });
  }

  /**
   * Ensure all fill materials have correct DoubleSide rendering and AO exclusion
   */
  private ensureMaterialProperties(): void {
    if (!this.clipStyler) return;

    for (const edges of this.clipStyler.list.values()) {
      const edgesAny = edges as any;
      
      // Find all meshes in the THREE.Group hierarchy
      if (edgesAny.three && edgesAny.three.children) {
        edgesAny.three.traverse((child: any) => {
          if (child instanceof THREE.Mesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            
            materials.forEach(mat => {
              if (mat instanceof THREE.MeshBasicMaterial) {
                // Configure material for DoubleSide rendering
                mat.side = THREE.DoubleSide;
                mat.vertexColors = false;
                mat.toneMapped = false;
                mat.needsUpdate = true;
                
                // CRITICAL: Isolate material from AO pass to prevent black backfaces
                // This uses the same approach as LOD materials in IFCLoaderModule
                const world = edgesAny.world;
                if (world && world.renderer) {
                  const renderer = world.renderer as any;
                  if (renderer.postproduction && renderer.postproduction.basePass) {
                    if (!renderer.postproduction.basePass.isolatedMaterials.includes(mat)) {
                      renderer.postproduction.basePass.isolatedMaterials.push(mat);
                    }
                  }
                }
              }
            });
            
            // Set custom depth material for better depth rendering
            child.customDepthMaterial = new THREE.MeshDepthMaterial({
              depthPacking: THREE.RGBADepthPacking,
              side: THREE.DoubleSide,
            });
            
            // Render after other geometry
            child.renderOrder = 999;
          }
        });
      }
    }
  }

  /**
   * Set visibility of section fills
   */
  public setHatchesVisibility(visible: boolean): void {
    if (!this.clipStyler) return;
    this.clipStyler.visible = visible;
    console.log(`🎨 Section fills ${visible ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current fill visibility state
   */
  public getHatchesVisibility(): boolean {
    return this.clipStyler?.visible || false;
  }

  /**
   * Set fill opacity (replaces performance mode)
   */
  public setFillOpacity(opacity: number): void {
    if (!this.clipStyler) return;
    
    for (const style of this.clipStyler.styles.values()) {
      if (style.fillsMaterial) {
        style.fillsMaterial.opacity = opacity;
        style.fillsMaterial.needsUpdate = true;
      }
    }
    
    console.log(`🎨 Section fill opacity: ${opacity}`);
  }

  /**
   * Set section fill color
   */
  public setFillColor(color: string | number): void {
    if (!this.clipStyler) return;
    
    const threeColor = new THREE.Color(color);
    
    for (const style of this.clipStyler.styles.values()) {
      if (style.fillsMaterial) {
        const material = style.fillsMaterial as THREE.MeshBasicMaterial;
        material.color.copy(threeColor);
        material.side = THREE.DoubleSide; // Ensure DoubleSide
        material.vertexColors = false; // Ensure we use material color, not vertex colors
        material.needsUpdate = true;
      }
    }
    
    // Also update any existing mesh materials created by ClipStyler
    this.ensureMaterialProperties();
    
    console.log(`🎨 Section fill color: ${color}`);
  }

  /**
   * Set performance mode (kept for compatibility, now controls opacity)
   */
  public setPerformanceMode(mode: 'high' | 'balanced' | 'performance'): void {
    // Map performance modes to opacity levels
    const opacityMap = {
      'high': 0.5,       // More visible
      'balanced': 0.3,   // Default
      'performance': 0.1 // Subtle
    };
    
    this.setFillOpacity(opacityMap[mode]);
    console.log(`🎨 Performance mode: ${mode}`);
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.clipStyler = null;
    this.world = null;
    this.clipper = null;
    console.log('🗑️ ClipStyler disposed');
  }
}
