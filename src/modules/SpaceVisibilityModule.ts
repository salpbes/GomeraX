/**
 * Space Visibility Module
 * 
 * Handles hiding/showing IFC Space geometry to improve model clarity
 * and prevent spaces from being selectable when hidden.
 */

import * as OBC from '@thatopen/components';
import { WorldManager } from './WorldManager';

export class SpaceVisibilityModule {
  private components: OBC.Components;
  private fragmentsManager: OBC.FragmentsManager | null = null;
  private spacesHidden: boolean = false;
  private modelLoadListener: any = null;

  constructor(worldManager: WorldManager) {
    this.components = worldManager.getComponents();
  }

  /**
   * Initializes the space visibility module
   */
  public async initialize(): Promise<void> {
    this.fragmentsManager = this.components.get(OBC.FragmentsManager);
    
    // Listen for new models being loaded
    this.modelLoadListener = this.fragmentsManager.list.onItemSet.add(async ({ value: model }) => {
      console.log('🆕 New model loaded event triggered');
      console.log('   Spaces hidden state:', this.spacesHidden);
      
      if (this.spacesHidden) {
        console.log('   Applying space hiding to new model...');
        // hideSpacesInModel now has its own retry logic
        await this.hideSpacesInModel(model);
      } else {
        console.log('   Spaces are visible, no action needed');
      }
    });
    
    console.log('✅ Space Visibility Module initialized');
    console.log('   Model load listener attached');
  }

  /**
   * Toggles visibility of all IFC Space elements across all loaded models
   */
  public async toggleSpaceVisibility(): Promise<boolean> {
    if (!this.fragmentsManager) {
      console.warn('⚠️ FragmentsManager not initialized');
      return this.spacesHidden;
    }

    const models = Array.from(this.fragmentsManager.list.values());
    if (models.length === 0) {
      console.warn('⚠️ No models loaded');
      return this.spacesHidden;
    }

    // Toggle state
    this.spacesHidden = !this.spacesHidden;
    const newVisibility = !this.spacesHidden;

    console.log(`${this.spacesHidden ? '🙈' : '👁️'} ${this.spacesHidden ? 'Hiding' : 'Showing'} IFC Spaces...`);

    for (const model of models) {
      await this.setSpaceVisibilityInModel(model, newVisibility);
    }

    // Update the fragments to reflect changes
    await this.fragmentsManager.core.update(true);
    
    console.log(`✅ Spaces ${this.spacesHidden ? 'hidden' : 'visible'}`);
    return this.spacesHidden;
  }

  /**
   * Sets space visibility for a single model
   */
  private async setSpaceVisibilityInModel(model: any, visible: boolean): Promise<void> {
    try {
      // Get all IFCSPACE items in this model
      const spaceItems = await model.getItemsOfCategories([/^IFCSPACE$/]);
      const spaceLocalIds = Object.values(spaceItems).flat() as number[];

      if (spaceLocalIds.length > 0) {
        console.log(`  Model ${model.modelId}: ${spaceLocalIds.length} spaces`);
        
        // Set visibility for all space items
        await model.setVisible(spaceLocalIds, visible);
      }
    } catch (error) {
      console.error(`❌ Error setting space visibility in model:`, error);
    }
  }

  /**
   * Hides spaces in a single model (used for newly loaded models)
   */
  private async hideSpacesInModel(model: any): Promise<void> {
    // Try to hide spaces, with retries if model data isn't ready yet
    let attempts = 0;
    const maxAttempts = 10;
    
    const tryHide = async () => {
      try {
        const spaceItems = await model.getItemsOfCategories([/^IFCSPACE$/]);
        const spaceLocalIds = Object.values(spaceItems).flat() as number[];
        
        if (spaceLocalIds.length > 0) {
          console.log(`  ✓ Hiding ${spaceLocalIds.length} spaces in new model`);
          await model.setVisible(spaceLocalIds, false);
          
          // Update the fragments to reflect changes
          if (this.fragmentsManager) {
            await this.fragmentsManager.core.update(true);
          }
          return true;
        } else if (attempts < maxAttempts) {
          // No spaces found yet, but model might still be loading
          attempts++;
          console.log(`  ⏳ Waiting for model data... (attempt ${attempts}/${maxAttempts})`);
          setTimeout(tryHide, 100);
          return false;
        }
      } catch (error) {
        if (attempts < maxAttempts) {
          attempts++;
          console.log(`  ⏳ Model not ready, retrying... (attempt ${attempts}/${maxAttempts})`);
          setTimeout(tryHide, 100);
          return false;
        }
        console.error(`❌ Error hiding spaces in new model after ${maxAttempts} attempts:`, error);
      }
      return true;
    };
    
    await tryHide();
  }

  /**
   * Hides all IFC Space elements
   */
  public async hideSpaces(): Promise<void> {
    if (this.spacesHidden) return;
    await this.toggleSpaceVisibility();
  }

  /**
   * Shows all IFC Space elements
   */
  public async showSpaces(): Promise<void> {
    if (!this.spacesHidden) return;
    await this.toggleSpaceVisibility();
  }

  /**
   * Gets the current visibility state of spaces
   */
  public areSpacesHidden(): boolean {
    return this.spacesHidden;
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    // Remove model load listener
    if (this.modelLoadListener && this.fragmentsManager) {
      this.fragmentsManager.list.onItemSet.remove(this.modelLoadListener);
      this.modelLoadListener = null;
    }
    
    this.fragmentsManager = null;
    console.log('🧹 Space Visibility Module disposed');
  }
}
