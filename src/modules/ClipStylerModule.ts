/**
 * ClipStyler Module
 * 
 * Provides section hatching and styling functionality for clipping planes.
 * Applies fills and outlines to section cuts based on element types.
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { WorldManager } from './WorldManager';

export class ClipStylerModule {
  private clipStyler: OBF.ClipStyler | null = null;
  private world: OBC.World | null = null;
  private worldManager: WorldManager;
  private components: OBC.Components;
  private clipper: OBC.Clipper | null = null;
  private isEnabled: boolean = false;
  private fillsEnabled: boolean = true; // Track fill visibility state

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
  }

  /**
   * Initializes the ClipStyler with predefined styles for architectural elements
   */
  public async initialize(world: OBC.World, clipper: OBC.Clipper): Promise<void> {
    this.world = world;
    this.clipper = clipper;

    // Get or create the ClipStyler component
    this.clipStyler = this.components.get(OBF.ClipStyler);
    this.clipStyler.world = world;

    // Define architectural element styles
    this.defineArchitecturalStyles();

    // Create dynamic groupings for element classification
    this.createElementClassifications();

    // Set up automatic styling when clipping planes are created
    this.setupClippingPlaneListeners();

    this.isEnabled = true;
    console.log('✅ ClipStyler initialized with architectural styles');
  }

  /**
   * Define a single unified hatching and fill style for all building elements
   */
  private defineArchitecturalStyles(): void {
    if (!this.clipStyler) return;

    // Unified style for ALL objects - clean black outline with light blue fill
    this.clipStyler.styles.set('UnifiedHatch', {
      linesMaterial: new LineMaterial({ 
        color: '#000000', 
        linewidth: 0.3 
      }),
      fillsMaterial: new THREE.MeshBasicMaterial({
        color: '#ADD8E6', // Light blue
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 0.7,
        fog: false,
        depthWrite: true,
      }),
    });

    console.log('🎨 Unified hatch style defined (optimized for performance)');
  }

  /**
   * Create classifications for architectural elements (simplified - all use same style)
   */
  private createElementClassifications(): void {
    // With unified style, we don't need complex classifications anymore
    // All elements will use the 'UnifiedHatch' style regardless of type
    console.log('📊 Simplified - all elements use unified hatch style');
  }

  /**
   * Set up automatic styling when clipping planes are created
   */
  private setupClippingPlaneListeners(): void {
    if (!this.clipper || !this.clipStyler) return;

    // Listen for new clipping planes and apply unified style to ALL objects
    this.clipper.list.onItemSet.add(({ key }) => {
      try {
        // Apply unified hatch style to all objects cut by the clipping plane
        this.clipStyler?.createFromClipping(key, {
          items: {
            All: {
              style: 'UnifiedHatch',
            },
          },
        });

        console.log('🎨 Unified hatch style applied to all objects in clipping plane');
      } catch (error) {
        console.warn('⚠️ Could not apply hatch style:', error);
      }
    });

    console.log('✅ Clipping plane listeners configured - unified style applies to ALL objects');
  }

  /**
   * Toggle the visibility of section hatches
   */
  public toggleHatchesVisibility(): void {
    if (!this.clipStyler) return;

    this.clipStyler.visible = !this.clipStyler.visible;
    console.log(`👁️ Section hatches ${this.clipStyler.visible ? 'shown' : 'hidden'}`);
  }

  /**
   * Set visibility of section hatches
   */
  public setHatchesVisibility(visible: boolean): void {
    if (!this.clipStyler) return;

    this.clipStyler.visible = visible;
    console.log(`🎨 Section hatches ${visible ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current hatch visibility state
   */
  public getHatchesVisibility(): boolean {
    return this.clipStyler?.visible || false;
  }

  /**
   * Toggle fill visibility for section hatches
   */
  public toggleFillsVisibility(): void {
    this.fillsEnabled = !this.fillsEnabled;
    this.applyFillsState();
    console.log(`🎨 Section hatch fills ${this.fillsEnabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set fill visibility state for section hatches
   */
  public setFillsVisibility(enabled: boolean): void {
    this.fillsEnabled = enabled;
    this.applyFillsState();
    console.log(`🎨 Section hatch fills ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current fill visibility state
   */
  public getFillsVisibility(): boolean {
    return this.fillsEnabled;
  }

  /**
   * Apply fills state to all styles
   */
  private applyFillsState(): void {
    if (!this.clipStyler) return;

    // Update opacity for all fill materials based on fillsEnabled state
    for (const style of this.clipStyler.styles.values()) {
      if (style.fillsMaterial) {
        // Set material transparency - hide if fills are disabled
        style.fillsMaterial.transparent = true;
        style.fillsMaterial.opacity = this.fillsEnabled ? 0.7 : 0;
        style.fillsMaterial.needsUpdate = true;
      }
    }
  }

  /**
   * Enable simplified hatches for better performance (lines only, no fills)
   */
  public enableSimplifiedMode(): void {
    this.fillsEnabled = false;
    this.applyFillsState();
    
    // Reduce line widths for better performance
    if (this.clipStyler) {
      for (const style of this.clipStyler.styles.values()) {
        if (style.linesMaterial) {
          (style.linesMaterial as any).linewidth = 0.8;
        }
      }
    }
    
    console.log('⚡ Simplified mode enabled (outlines only, reduced line width)');
  }

  /**
   * Disable simplified hatches (restore full quality)
   */
  public disableSimplifiedMode(): void {
    this.fillsEnabled = true;
    this.applyFillsState();
    
    // Restore original line widths
    if (this.clipStyler) {
      for (const style of this.clipStyler.styles.values()) {
        if (style.linesMaterial) {
          (style.linesMaterial as any).linewidth = 1.5;
        }
      }
    }
    
    console.log('✨ Full quality mode enabled (fills + outlines)');
  }

  /**
   * Apply a specific style to a clipping plane by ID
   */
  public applyStyleToPlane(planeId: string, styleName: string): void {
    if (!this.clipStyler) return;

    try {
      this.clipStyler.createFromClipping(planeId, {
        items: { All: { style: styleName } },
      });

      console.log(`✅ Applied style "${styleName}" to plane ${planeId}`);
    } catch (error) {
      console.error(`❌ Failed to apply style: ${error}`);
    }
  }

  /**
   * Get available hatch styles
   */
  public getAvailableStyles(): string[] {
    if (!this.clipStyler) return [];
    return Array.from(this.clipStyler.styles.keys());
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    if (this.clipStyler) {
      this.clipStyler.dispose();
    }
    this.clipper = null;
    this.world = null;
    console.log('🧹 ClipStyler disposed');
  }
}
