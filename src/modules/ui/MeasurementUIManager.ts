/**
 * MEASUREMENT UI MANAGER (The "Measurement Maestro")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module manages the UI for the measurement tools. It handles the 
 * buttons that let you measure distances between walls, heights of 
 * ceilings, and clear all measurements when you're done.
 * 
 * WHY IT MATTERS: 
 * Precision is key in construction. This module makes it easy for users 
 * to get exact dimensions from the 3D model, helping with everything 
 * from space planning to verifying site conditions.
 * --------------------------------------------------------------------------------
 */
import { NotificationHelper } from './NotificationHelper';
import { ClusterModule } from '../webgl/ClusterModule';


export class MeasurementUIManager {
  constructor(
    private viewer: any,
    private getClusterModule: () => ClusterModule | null
  ) {}

  public handleToggleMeasurement(): void {
    if (!this.viewer) return;

    const clusterModule = this.getClusterModule();
    if (clusterModule?.isClusteringActive()) {
      NotificationHelper.show({
        title: 'Measurement Unavailable',
        message: 'Measurements are disabled in cluster mode. Exit cluster mode first.',
        type: 'warning',
        duration: 4000
      });
      return;
    }

    if (this.isWebGPUMode()) {
      NotificationHelper.show({
        title: 'Measurement Unavailable',
        message: 'Measurements are not supported in WebGPU mode. Switch to WebGL mode to use measurements.',
        type: 'warning',
        duration: 4000
      });
      return;
    }

    const measurement = this.viewer.getMeasurement();
    if (!measurement) return;

    try {
      measurement.toggle();
      const isEnabled = measurement.getEnabled();
      this.updateMeasurementButtonState(isEnabled);
    } catch (error) {
      console.error('❌ Error toggling measurement:', error);
    }
  }

  public handleCancelMeasurement(): void {
    if (!this.viewer) return;

    const measurement = this.viewer.getMeasurement();
    if (!measurement) return;

    try {
      measurement.deleteAll();
      measurement.setEnabled(false);
      this.updateMeasurementButtonState(false);
    } catch (error) {
      console.error('❌ Error canceling measurement:', error);
    }
  }

  public updateMeasurementButtonState(isEnabled: boolean): void {
    const measureBtn = document.getElementById('measureBtn');
    if (!measureBtn) return;
    const label = measureBtn.querySelector('.label');
    if (label) label.textContent = isEnabled ? 'Exit Measure' : 'Measure';
    if (isEnabled) {
      measureBtn.style.background = 'linear-gradient(135deg, #f56565 0%, #c53030 100%)';
      measureBtn.style.color = 'white';
    } else {
      measureBtn.style.background = '';
      measureBtn.style.color = '';
    }
  }

  private isWebGPUMode(): boolean {
    if (!this.viewer) return false;
    return this.viewer.getWebGPURenderer?.()?.isEnabled?.() || false;
  }
}
