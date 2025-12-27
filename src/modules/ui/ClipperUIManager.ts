/**
 * CLIPPER UI MANAGER (The "Sectioning Supervisor")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This class manages all UI-related functionality for the Clipper (sectioning) tool.
 * It handles user interactions with the sectioning buttons and ensures safe 
 * visual styles during sectioning operations.
 * ClipperUIManager handles all UI-related functionality for sectioning and clipping.
 * 
 * HOW IT CONNECTS:
 * - IFCViewer: Interfaces with the main viewer to control the clipper tool.
 * - WorldManager: Adjusts visual styles based on sectioning state.
 * - ClusterModule: Checks for clustering mode to prevent conflicts with sectioning.
 * --------------------------------------------------------------------------------

 */
import { NotificationHelper } from './NotificationHelper';
import { WorldManager } from '../webgl/WorldManager';
import { ClusterModule } from '../webgl/ClusterModule';


export class ClipperUIManager {
  constructor(
    private viewer: any,
    private worldManager: WorldManager,
    private getClusterModule: () => ClusterModule | null
  ) {}

  public handleToggleClipper(): void {
    if (!this.viewer) return;

    const clusterModule = this.getClusterModule();
    if (clusterModule?.isClusteringActive()) {
      NotificationHelper.show({
        title: 'Sectioning Unavailable',
        message: 'Sectioning is disabled in cluster mode. Exit cluster mode first.',
        type: 'warning',
        duration: 4000
      });
      return;
    }

    if (this.isWebGPUMode()) {
      NotificationHelper.show({
        title: 'Sectioning Unavailable',
        message: 'Sectioning is not supported in WebGPU mode. Switch to WebGL mode to use sectioning.',
        type: 'warning',
        duration: 4000
      });
      return;
    }

    const clipper = this.viewer.getClipper();
    if (!clipper) return;

    try {
      clipper.toggle();
      const isEnabled = clipper.getEnabled();
      this.setSafeVisualStyle(isEnabled);
      this.updateClipperButtonState(isEnabled);
    } catch (error) {
      console.error('❌ Error toggling clipper:', error);
    }
  }

  public handleClipperPreset(axis: 'x' | 'y' | 'z'): void {
    if (!this.viewer) return;

    const clusterModule = this.getClusterModule();
    if (clusterModule?.isClusteringActive()) {
      NotificationHelper.show({
        title: 'Sectioning Unavailable',
        message: 'Sectioning is disabled in cluster mode. Exit cluster mode first.',
        type: 'warning',
        duration: 4000
      });
      return;
    }

    if (this.isWebGPUMode()) {
      NotificationHelper.show({
        title: 'Sectioning Unavailable',
        message: 'Sectioning is not supported in WebGPU mode. Switch to WebGL mode to use sectioning.',
        type: 'warning',
        duration: 4000
      });
      return;
    }

    const clipper = this.viewer.getClipper();
    if (!clipper) return;

    try {
      if (!clipper.getEnabled()) {
        clipper.setEnabled(true);
        this.updateClipperButtonState(true);
        this.setSafeVisualStyle(true);
      }

      switch(axis) {
        case 'x': clipper.createXAxisPlane(); break;
        case 'y': clipper.createYAxisPlane(); break;
        case 'z': clipper.createZAxisPlane(); break;
      }
    } catch (error) {
      console.error(`❌ Error creating ${axis.toUpperCase()}-axis plane:`, error);
    }
  }

  public handleClipperSurfaceMode(): void {
    if (!this.viewer) return;

    if (this.isWebGPUMode()) {
      const webgpuRenderer = this.viewer.getWebGPURenderer();
      if (webgpuRenderer) {
        webgpuRenderer.setSectionModeEnabled(true);
        this.updateClipperButtonState(true);
        this.setSafeVisualStyle(true);
        document.getElementById('clipperSurfaceBtn')?.classList.add('active');
        NotificationHelper.show({
          title: '🎯 Click Surface Mode',
          message: 'Double-click on any surface to create a section plane at that point',
          type: 'info',
          duration: 3000
        });
        return;
      }
    }

    const clipper = this.viewer.getClipper();
    if (!clipper) return;

    try {
      clipper.setEnabled(true);
      this.updateClipperButtonState(true);
      this.setSafeVisualStyle(true);
      document.getElementById('clipperSurfaceBtn')?.classList.add('active');
      NotificationHelper.show({
        title: '🎯 Click Surface Mode',
        message: 'Double-click on any surface to create a section plane at that point',
        type: 'info',
        duration: 3000
      });
    } catch (error) {
      console.error('❌ Error enabling surface section mode:', error);
    }
  }

  public handleClipperFlip(): void {
    if (!this.viewer) return;

    if (this.isWebGPUMode()) {
      const webgpuRenderer = this.viewer.getWebGPURenderer();
      if (webgpuRenderer) {
        try {
          if (webgpuRenderer.getSectionPlaneCount() === 0) return;
          webgpuRenderer.flipSectionPlanes();
        } catch (error) {
          console.error('❌ Error flipping WebGPU section planes:', error);
        }
        return;
      }
    }

    const clipper = this.viewer.getClipper();
    if (!clipper) return;

    try {
      if (clipper.getPlaneCount() === 0) return;
      clipper.flipClippingPlanes();
    } catch (error) {
      console.error('❌ Error flipping clipping planes:', error);
    }
  }

  public handleCancelClipperMode(): void {
    if (!this.viewer) return;

    if (this.isWebGPUMode()) {
      const webgpuRenderer = this.viewer.getWebGPURenderer();
      if (webgpuRenderer) {
        try {
          webgpuRenderer.deleteAllSectionPlanes();
          webgpuRenderer.setSectionModeEnabled(false);
          this.setSafeVisualStyle(false);
          this.updateClipperButtonState(false);
          document.getElementById('clipperSurfaceBtn')?.classList.remove('active');
        } catch (error) {
          console.error('❌ Error canceling WebGPU section mode:', error);
        }
        return;
      }
    }

    const clipper = this.viewer.getClipper();
    if (!clipper) return;

    try {
      clipper.deleteAllPlanes();
      clipper.setEnabled(false);
      this.setSafeVisualStyle(false);
      this.updateClipperButtonState(false);
      document.getElementById('clipperSurfaceBtn')?.classList.remove('active');
    } catch (error) {
      console.error('❌ Error canceling clipper mode:', error);
    }
  }

  public updateClipperButtonState(isEnabled: boolean): void {
    const clipperBtn = document.getElementById('clipperBtn');
    if (!clipperBtn) return;
    const label = clipperBtn.querySelector('.label');
    if (label) label.textContent = isEnabled ? 'Exit Sectioning' : 'Sectioning';
    if (isEnabled) {
      clipperBtn.style.background = 'linear-gradient(135deg, #f56565 0%, #c53030 100%)';
      clipperBtn.style.color = 'white';
    } else {
      clipperBtn.style.background = '';
      clipperBtn.style.color = '';
    }
  }

  private setSafeVisualStyle(enabled: boolean): void {
    const styleSelect = document.getElementById('visualStyleSelect') as HTMLSelectElement;
    if (!styleSelect) return;

    if (enabled) {
      const currentStyle = parseInt(styleSelect.value);
      if ([1, 2, 3, 5].includes(currentStyle)) {
        styleSelect.value = "4";
        this.worldManager.setPostproductionStyle(4);
        NotificationHelper.show({
          title: 'Visual Style Adjusted',
          message: 'Pen styles are disabled during sectioning to prevent performance issues.',
          type: 'info',
          duration: 4000
        });
      }
      Array.from(styleSelect.options).forEach(option => {
        if ([1, 2, 3, 5].includes(parseInt(option.value))) option.disabled = true;
      });
    } else {
      Array.from(styleSelect.options).forEach(option => option.disabled = false);
    }
  }

  /**
   * Enforces safe visual style when sectioning is active
   * Pen styles (1, 2, 3, 5) cause freezes with sectioning, so we force Realistic (4)
   */
  private isWebGPUMode(): boolean {
    if (!this.viewer) return false;
    return this.viewer.getWebGPURenderer?.()?.isEnabled?.() || false;
  }
}
