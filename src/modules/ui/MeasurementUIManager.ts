/**
 * MeasurementUIManager (The "Measurement Maestro")
 * This handles all UI-related functionality for measurements.
 * It manages user interactions with the measurement buttons
 * and ensures safe operation when measurements are active.
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
