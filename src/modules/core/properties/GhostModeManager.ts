/**
 * GHOST MODE MANAGER (The "Casper")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module handles the "Ghosting" effect. When you isolate an object, 
 * it makes everything else semi-transparent and grey, like a ghost.
 * 
 * WHY IT MATTERS: 
 * It helps you focus on specific parts of the building without losing 
 * the context of where they are. It's like having X-ray vision that 
 * lets you see through the building to find exactly what you need.
 * --------------------------------------------------------------------------------
 */
import * as OBC from '@thatopen/components';
import * as FRAGS from '@thatopen/fragments';
import * as THREE from 'three';
import { PropertiesContext } from './SelectionManager';

export class GhostModeManager {
  public ghostModeActive: boolean = false;
  public ghostPrimaryModelId: string | null = null;
  public ghostIdsToIsolate: number[] = [];
  public ghostAffectedModels: Map<string, { otherIds: number[] }> = new Map();
  public tileUpdateHandlers: Map<string, (data: any) => void> = new Map();

  constructor(private context: PropertiesContext) {}

  /**
   * Reapply ghost mode highlights after camera movement
   */
  public async reapplyGhostMode(): Promise<void> {
    if (!this.ghostModeActive || !this.ghostPrimaryModelId || !this.context.fragmentsManager) return;
    
    try {
      const translucentMaterial: FRAGS.MaterialDefinition = {
        color: new THREE.Color(0x888888),
        opacity: 0.6,
        transparent: true,
        renderedFaces: FRAGS.RenderedFaces.TWO,
        alphaToCoverage: true,
        depthWrite: false
      } as any;
      
      const solidMaterial: FRAGS.MaterialDefinition = {
        color: new THREE.Color(0xb0e322),
        opacity: 1,
        transparent: false,
        renderedFaces: FRAGS.RenderedFaces.TWO
      };
      
      for (const [modelId, data] of this.ghostAffectedModels) {
        const model = this.context.fragmentsManager.list.get(modelId);
        if (!model) continue;
        
        if (data.otherIds.length > 0) {
          await (model as any).highlight(data.otherIds, translucentMaterial);
        }
        
        if (modelId === this.ghostPrimaryModelId && this.ghostIdsToIsolate.length > 0) {
          await (model as any).highlight(this.ghostIdsToIsolate, solidMaterial);
        }
      }
    } catch (e) {
      console.warn('Error reapplying ghost mode:', e);
    }
  }

  /**
   * Helper to show all elements across ALL models
   */
  public async showAllModels(hider: any): Promise<void> {
    this.ghostModeActive = false;
    this.ghostPrimaryModelId = null;
    this.ghostIdsToIsolate = [];

    if (this.context.webgpuRenderer?.isEnabled()) {
      this.context.webgpuRenderer.showAllElements();
    }
    
    if (!this.context.fragmentsManager) {
      this.ghostAffectedModels.clear();
      this.tileUpdateHandlers.clear();
      return;
    }
    
    for (const [modelId, _] of this.ghostAffectedModels) {
      const model = this.context.fragmentsManager.list.get(modelId);
      if (model) {
        try {
          const handler = this.tileUpdateHandlers.get(modelId);
          if (handler && (model as any).tiles?.onItemSet) {
            (model as any).tiles.onItemSet.remove(handler);
          }
          
          if (typeof (model as any).resetHighlight === 'function') {
            await (model as any).resetHighlight();
          }
        } catch (err) {
          console.warn(`👻 Error resetting model ${modelId}:`, err);
        }
      }
    }
    
    this.tileUpdateHandlers.clear();
    this.ghostAffectedModels.clear();
    
    if (hider) {
      hider.set(true);
    }
    
    if (this.context.highlighter) {
      this.context.highlighter.clear('select');
      this.context.highlighter.clear('translucent');
    }
    
    if (this.context.worldManager.world?.camera?.controls && this.context.fragmentsManager) {
      try {
        const overallBox = new THREE.Box3();
        for (const model of this.context.fragmentsManager.list.values()) {
          const bbox = await (model as any).getMergedBox();
          if (bbox && !bbox.isEmpty()) {
            overallBox.union(bbox);
          }
        }
        if (!overallBox.isEmpty()) {
          await this.context.worldManager.world.camera.controls.fitToBox(overallBox, true);
        }
      } catch (err) {
        console.warn('👻 Error fitting camera to all models:', err);
      }
    }
  }
}
