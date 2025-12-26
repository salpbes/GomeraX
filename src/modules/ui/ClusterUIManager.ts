import { NotificationHelper } from './NotificationHelper';
import { ClusterModule } from '../webgl/ClusterModule';

/**
 * ClusterUIManager handles all UI-related functionality for clustering.
 */
export class ClusterUIManager {
  constructor(
    private viewer: any,
    private getClusterModule: () => ClusterModule | null
  ) {}

  public async handleToggleCluster(): Promise<void> {
    const clusterModule = this.getClusterModule();
    if (!clusterModule) return;

    if (this.isWebGPUMode()) {
      NotificationHelper.show({
        title: 'Cluster Unavailable',
        message: 'Clustering is not supported in WebGPU mode. Switch to WebGL mode to use clustering.',
        type: 'warning',
        duration: 4000
      });
      return;
    }

    try {
      await clusterModule.toggleClusters();
      const isActive = clusterModule.isClusteringActive();
      this.updateClusterButtonState(isActive);
      
      if (isActive) {
        // Disable other modes that conflict with clustering
        this.disableConflictingModes();
      }
    } catch (error) {
      console.error('❌ Error toggling cluster mode:', error);
    }
  }

  public async handleCancelClusterMode(): Promise<void> {
    const clusterModule = this.getClusterModule();
    if (!clusterModule || !clusterModule.isClusteringActive()) return;

    try {
      await clusterModule.exitToColorView();
      this.updateClusterButtonState(false);
    } catch (error) {
      console.error('❌ Error canceling cluster mode:', error);
    }
  }

  public updateClusterButtonState(isActive: boolean): void {
    const clusterBtn = document.getElementById('clusterBtn');
    if (!clusterBtn) return;
    const label = clusterBtn.querySelector('.label');
    if (label) label.textContent = isActive ? 'Exit Cluster' : 'Cluster';
    if (isActive) {
      clusterBtn.style.background = 'linear-gradient(135deg, #f56565 0%, #c53030 100%)';
      clusterBtn.style.color = 'white';
    } else {
      clusterBtn.style.background = '';
      clusterBtn.style.color = '';
    }
  }

  private disableConflictingModes(): void {
    if (!this.viewer) return;

    // Disable Clipper
    const clipper = this.viewer.getClipper();
    if (clipper?.getEnabled()) {
      clipper.setEnabled(false);
      this.updateButtonState('clipperBtn', 'Sectioning', false);
    }

    // Disable Measurement
    const measurement = this.viewer.getMeasurement();
    if (measurement?.getEnabled()) {
      measurement.setEnabled(false);
      this.updateButtonState('measureBtn', 'Measure', false);
    }

    // Disable Floor Plan
    const floorPlan = this.viewer.getFloorPlan();
    if (floorPlan?.getEnabled()) {
      floorPlan.setEnabled(false);
      this.updateButtonState('floorPlanBtn', 'Floor Plan', false);
    }
  }

  private updateButtonState(id: string, labelText: string, isActive: boolean): void {
    const btn = document.getElementById(id);
    if (!btn) return;
    const label = btn.querySelector('.label');
    if (label) label.textContent = labelText;
    btn.style.background = '';
    btn.style.color = '';
  }

  private isWebGPUMode(): boolean {
    if (!this.viewer) return false;
    return this.viewer.getWebGPURenderer?.()?.isEnabled?.() || false;
  }
}
