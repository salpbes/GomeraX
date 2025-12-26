import { NotificationHelper } from './NotificationHelper';
import { WorldManager } from '../webgl/WorldManager';
import { ClusterModule } from '../webgl/ClusterModule';
import { FloorPlanModule } from '../webgl/FloorPlanModule';

/**
 * FloorPlanUIManager handles all UI-related functionality for floor plans.
 */
export class FloorPlanUIManager {
  private floorPlanModule: FloorPlanModule | null = null;

  constructor(
    private viewer: any,
    private worldManager: WorldManager,
    private getClusterModule: () => ClusterModule | null
  ) {}

  public setFloorPlanModule(module: FloorPlanModule): void {
    this.floorPlanModule = module;
  }

  public handleToggleFloorPlan(): void {
    if (!this.viewer) return;

    const clusterModule = this.getClusterModule();
    if (clusterModule?.isClusteringActive()) {
      NotificationHelper.show({
        title: 'Floor Plan Unavailable',
        message: 'Floor plans are disabled in cluster mode. Exit cluster mode first.',
        type: 'warning',
        duration: 4000
      });
      return;
    }

    if (this.isWebGPUMode()) {
      NotificationHelper.show({
        title: 'Floor Plan Unavailable',
        message: 'Floor plans are not supported in WebGPU mode. Switch to WebGL mode to use floor plans.',
        type: 'warning',
        duration: 4000
      });
      return;
    }

    const floorPlan = this.viewer.getFloorPlan();
    if (!floorPlan) return;

    try {
      floorPlan.toggle();
      const isEnabled = floorPlan.getEnabled();
      this.updateFloorPlanButtonState(isEnabled);
    } catch (error) {
      console.error('❌ Error toggling floor plan:', error);
    }
  }

  public handleExitFloorPlan(): void {
    if (!this.viewer) return;

    const floorPlan = this.viewer.getFloorPlan();
    if (!floorPlan) return;

    try {
      floorPlan.setEnabled(false);
      this.updateFloorPlanButtonState(false);
    } catch (error) {
      console.error('❌ Error exiting floor plan:', error);
    }
  }

  public updateFloorPlanButtonState(isEnabled: boolean): void {
    const floorPlanBtn = document.getElementById('floorPlanBtn');
    if (!floorPlanBtn) return;
    const label = floorPlanBtn.querySelector('.label');
    if (label) label.textContent = isEnabled ? 'Exit Floor Plan' : 'Floor Plan';
    if (isEnabled) {
      floorPlanBtn.style.background = 'linear-gradient(135deg, #f56565 0%, #c53030 100%)';
      floorPlanBtn.style.color = 'white';
    } else {
      floorPlanBtn.style.background = '';
      floorPlanBtn.style.color = '';
    }
  }

  /**
   * Show floor plan creation modal with storey selection
   */
  public async showFloorPlanModal(): Promise<void> {
    if (!this.floorPlanModule) {
      NotificationHelper.show({
        title: 'Floor Plan Not Available',
        message: 'Floor plan module is not initialized',
        type: 'error'
      });
      return;
    }

    try {
      // Get all storeys from loaded models
      const storeys = await this.floorPlanModule.getAllStoreys();
      
      if (storeys.length === 0) {
        NotificationHelper.show({
          title: 'No Storeys Found',
          message: 'No building storeys found in loaded models. Please load an IFC model with building storeys.',
          type: 'error'
        });
        return;
      }

      // Create modal panel
      const modal = document.createElement('div');
      modal.id = 'floor-plan-modal';
      modal.className = 'floor-plan-modal';
      
      modal.innerHTML = `
        <div class="floor-plan-modal-content">
          <div class="floor-plan-modal-header">
            <h3>Create Floor Plan View</h3>
            <button class="floor-plan-modal-close">×</button>
          </div>
          <div class="floor-plan-modal-body">
            <div class="floor-plan-info">
              Select a building storey to create a 2D floor plan view:
            </div>
            <div class="floor-plan-list">
              ${storeys.map((storey) => `
                <div class="floor-plan-item" data-storey="${storey.name}">
                  <div class="floor-plan-item-icon">
                    <i class="fas fa-layer-group"></i>
                  </div>
                  <div class="floor-plan-item-details">
                    <div class="floor-plan-item-name">${storey.name}</div>
                    <div class="floor-plan-item-info">
                      Elevation: ${storey.elevation.toFixed(2)}m
                      ${storey.modelId ? ` • Model: ${storey.modelId}` : ''}
                    </div>
                  </div>
                  <button class="floor-plan-item-create" data-storey="${storey.name}">
                    <i class="fas fa-eye"></i> View
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);

      // Event handlers
      const closeBtn = modal.querySelector('.floor-plan-modal-close');
      closeBtn?.addEventListener('click', () => modal.remove());

      // Close modal when clicking outside
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });

      const createButtons = modal.querySelectorAll('.floor-plan-item-create');
      createButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const storeyName = (e.currentTarget as HTMLElement).dataset.storey;
          if (!storeyName || !this.floorPlanModule) return;
          
          try {
            modal.remove();
            
            NotificationHelper.show({
              title: 'Creating Floor Plan',
              message: `Generating view for ${storeyName}...`,
              type: 'success'
            });
            
            const view = await this.floorPlanModule.createFloorPlanView(storeyName);
            
            if (!view) {
              throw new Error('Failed to create floor plan view');
            }
            
            // Open view using its ID (which should be the storey name)
            const opened = await this.floorPlanModule.openView(view.id);
            
            if (!opened) {
              throw new Error(`Failed to open view: ${view.id}`);
            }
            
            NotificationHelper.show({
              title: 'Floor Plan Created',
              message: `Viewing floor plan: ${storeyName}. Use the clipper or close the view to return to 3D.`,
              type: 'success'
            });
          } catch (error) {
            console.error('Error creating floor plan:', error);
            NotificationHelper.show({
              title: 'Floor Plan Error',
              message: `Failed to create floor plan: ${error}`,
              type: 'error'
            });
          }
        });
      });
    } catch (error) {
      console.error('Error showing floor plan modal:', error);
      NotificationHelper.show({
        title: 'Error',
        message: `Failed to load storeys: ${error}`,
        type: 'error'
      });
    }
  }

  private isWebGPUMode(): boolean {
    if (!this.viewer) return false;
    return this.viewer.getWebGPURenderer?.()?.isEnabled?.() || false;
  }
}
