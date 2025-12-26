import { NotificationHelper } from './NotificationHelper';
import { WorldManager } from '../webgl/WorldManager';

/**
 * SelectionUIManager handles all UI-related functionality for selection and visibility.
 */
export class SelectionUIManager {
  constructor(
    private viewer: any,
    private worldManager: WorldManager
  ) {}

  /**
   * Handles toggling space visibility
   */
  public async handleToggleSpaces(): Promise<void> {
    if (!this.viewer) {
      console.warn('⚠️ Viewer reference not available');
      return;
    }

    const spaceVisibility = this.viewer.getSpaceVisibility();
    if (!spaceVisibility) {
      console.warn('⚠️ Space visibility module not initialized');
      return;
    }

    try {
      const spacesHidden = await spaceVisibility.toggleSpaceVisibility();
      
      // Also update WebGPU if active
      if (this.viewer.isWebGPUActive()) {
        await this.viewer.setWebGPUSpacesVisible(!spacesHidden);
      }
      
      // Update button label
      const toggleBtn = document.getElementById('toggleSpacesBtn');
      if (toggleBtn) {
        const label = toggleBtn.querySelector('.label');
        if (label) {
          label.textContent = spacesHidden ? 'Show Spaces' : 'Hide Spaces';
        }
      }
    } catch (error) {
      console.error('❌ Error toggling spaces:', error);
    }
  }

  /**
   * Handles toggling grid visibility
   */
  public handleToggleGrid(): void {
    try {
      const currentlyVisible = this.worldManager.isGridVisible();
      this.worldManager.setGridVisible(!currentlyVisible);
      
      // Update button label
      const toggleBtn = document.getElementById('toggleGridBtn');
      if (toggleBtn) {
        const label = toggleBtn.querySelector('.label');
        if (label) {
          label.textContent = currentlyVisible ? 'Show Grid' : 'Hide Grid';
        }
      }
    } catch (error) {
      console.error('❌ Error toggling grid:', error);
    }
  }

  public handleToggleSelection(): void {
    if (!this.viewer) return;
    const selector = this.viewer.getSelector();
    if (!selector) return;

    try {
      selector.toggle();
      const isEnabled = selector.getEnabled();
      this.updateSelectionButtonState(isEnabled);
    } catch (error) {
      console.error('❌ Error toggling selection:', error);
    }
  }

  public handleClearSelection(): void {
    if (!this.viewer) return;
    const selector = this.viewer.getSelector();
    if (!selector) return;

    try {
      selector.clear();
      NotificationHelper.show({
        title: 'Selection Cleared',
        message: 'All selected elements have been deselected.',
        type: 'info',
        duration: 2000
      });
    } catch (error) {
      console.error('❌ Error clearing selection:', error);
    }
  }

  public handleHideSelected(): void {
    if (!this.viewer) return;
    const selector = this.viewer.getSelector();
    if (!selector) return;

    try {
      selector.hideSelected();
    } catch (error) {
      console.error('❌ Error hiding selected elements:', error);
    }
  }

  public handleShowAll(): void {
    if (!this.viewer) return;
    const selector = this.viewer.getSelector();
    if (!selector) return;

    try {
      selector.showAll();
      NotificationHelper.show({
        title: 'All Visible',
        message: 'All elements are now visible.',
        type: 'info',
        duration: 2000
      });
    } catch (error) {
      console.error('❌ Error showing all elements:', error);
    }
  }

  public updateSelectionButtonState(isEnabled: boolean): void {
    const selectBtn = document.getElementById('selectBtn');
    if (!selectBtn) return;
    const label = selectBtn.querySelector('.label');
    if (label) label.textContent = isEnabled ? 'Exit Selection' : 'Select';
    if (isEnabled) {
      selectBtn.style.background = 'linear-gradient(135deg, #f56565 0%, #c53030 100%)';
      selectBtn.style.color = 'white';
    } else {
      selectBtn.style.background = '';
      selectBtn.style.color = '';
    }
  }
}
