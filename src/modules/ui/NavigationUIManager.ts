/**
 * NavigationUIManager (The "Navigation Navigator Navigates")
 * This handles all UI-related functionality for navigation, 
 * including auto-rotate, walk mode, first-person mode, and minimap.
 */
import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import { NotificationHelper } from './NotificationHelper';
import { WorldManager } from '../webgl/WorldManager';
import { MinimapModule } from '../webgl/MinimapModule';


export class NavigationUIManager {
  private isAutoRotating: boolean = false;
  private autoRotateAnimationId: number | null = null;
  private autoRotateStartTime: number = 0;
  private autoRotateDuration: number = 60000;
  private autoRotateClickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    private viewer: any,
    private worldManager: WorldManager,
    private getMinimapModule: () => MinimapModule | null
  ) {}

  public handleAutoRotate(): void {
    if (this.isAutoRotating) {
      this.stopAutoRotate();
      return;
    }
    this.showAutoRotateDurationPicker();
  }

  private showAutoRotateDurationPicker(): void {
    const overlay = document.createElement('div');
    overlay.id = 'autoRotateModal';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: rgba(40, 40, 70, 0.98);
      border-radius: 12px;
      padding: 24px;
      min-width: 280px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.1);
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: white; font-size: 16px; display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-sync-alt" style="color: #60a5fa;"></i>
        Auto Rotate
      </h3>
      <p style="color: #aaa; font-size: 13px; margin: 0 0 16px 0;">
        Set rotation duration (click anywhere to stop)
      </p>
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <input type="number" id="autoRotateMinutes" value="1" min="0.5" max="60" step="0.5"
          style="width: 80px; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);
                 background: rgba(0,0,0,0.3); color: white; font-size: 14px; text-align: center;">
        <span style="color: #aaa; font-size: 14px;">minutes</span>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="autoRotateCancel" style="padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);
                background: transparent; color: #aaa; cursor: pointer; font-size: 13px;">
          Cancel
        </button>
        <button id="autoRotateStart" style="padding: 8px 20px; border-radius: 6px; border: none;
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; cursor: pointer; font-size: 13px; font-weight: 600;">
          Start
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cancelBtn = document.getElementById('autoRotateCancel');
    const startBtn = document.getElementById('autoRotateStart');
    const minutesInput = document.getElementById('autoRotateMinutes') as HTMLInputElement;

    cancelBtn?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    startBtn?.addEventListener('click', () => {
      const minutes = parseFloat(minutesInput?.value || '1');
      this.autoRotateDuration = minutes * 60 * 1000;
      overlay.remove();
      this.startAutoRotate();
    });

    minutesInput?.focus();
    minutesInput?.select();
  }

  private startAutoRotate(): void {
    if (!this.viewer) return;

    const world = this.worldManager.world;
    if (!world?.camera) return;

    const camera = world.camera as any;
    if (!camera.controls) return;

    const components = this.worldManager.getComponents();
    if (!components) return;
    
    const bbox = components.get(OBC.BoundingBoxer);
    bbox.list.clear();
    bbox.addFromModels();
    const box = bbox.get();
    const modelCenter = box.getCenter(new THREE.Vector3());

    const cameraPos = world.camera.three.position.clone();
    const currentTarget = new THREE.Vector3();
    camera.controls.getTarget(currentTarget);
    const distance = cameraPos.distanceTo(currentTarget);

    const direction = cameraPos.clone().sub(currentTarget).normalize();
    const newCameraPos = modelCenter.clone().add(direction.multiplyScalar(distance));
    
    camera.controls.setLookAt(
      newCameraPos.x, newCameraPos.y, newCameraPos.z,
      modelCenter.x, modelCenter.y, modelCenter.z,
      true
    );

    this.isAutoRotating = true;
    this.autoRotateStartTime = Date.now();

    const btn = document.getElementById('autoRotateBtn');
    if (btn) {
      btn.classList.add('active');
      const label = btn.querySelector('.label');
      if (label) label.textContent = 'Stop Rotate';
      const icon = btn.querySelector('.icon i');
      if (icon) icon.classList.add('fa-spin');
    }

    setTimeout(() => {
      this.autoRotateClickHandler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('#autoRotateBtn')) return;
        this.stopAutoRotate();
      };
      document.addEventListener('click', this.autoRotateClickHandler);
      document.addEventListener('mousedown', this.autoRotateClickHandler);
    }, 500);

    const minutes = this.autoRotateDuration / 60000;
    NotificationHelper.show({
      title: '🔄 Auto Rotate Started',
      message: `Rotating for ${minutes} minute${minutes !== 1 ? 's' : ''}. Click anywhere to stop.`,
      type: 'info',
      duration: 3000
    });

    const controls = camera.controls;
    const rotateSpeed = 0.02;

    const animate = () => {
      if (!this.isAutoRotating) return;
      const elapsed = Date.now() - this.autoRotateStartTime;
      if (elapsed >= this.autoRotateDuration) {
        this.stopAutoRotate();
        return;
      }
      if (typeof controls.azimuthAngle === 'number') {
        controls.azimuthAngle += rotateSpeed;
      }
      this.autoRotateAnimationId = requestAnimationFrame(animate);
    };

    this.autoRotateAnimationId = requestAnimationFrame(animate);
  }

  public stopAutoRotate(): void {
    this.isAutoRotating = false;
    if (this.autoRotateAnimationId !== null) {
      cancelAnimationFrame(this.autoRotateAnimationId);
      this.autoRotateAnimationId = null;
    }
    if (this.autoRotateClickHandler) {
      document.removeEventListener('click', this.autoRotateClickHandler);
      document.removeEventListener('mousedown', this.autoRotateClickHandler);
      this.autoRotateClickHandler = null;
    }
    const btn = document.getElementById('autoRotateBtn');
    if (btn) {
      btn.classList.remove('active');
      const label = btn.querySelector('.label');
      if (label) label.textContent = 'Auto Rotate';
      const icon = btn.querySelector('.icon i');
      if (icon) icon.classList.remove('fa-spin');
    }
  }

  public async handleToggleFirstPerson(): Promise<void> {
    if (!this.viewer) return;
    const worldManager = this.viewer.getWorldManager();
    if (!worldManager) return;
    try {
      const currentMode = worldManager.getNavigationMode();
      const newMode = currentMode === 'FirstPerson' ? 'Orbit' : 'FirstPerson';
      await worldManager.setNavigationMode(newMode);
      this.updateFirstPersonButtonState(newMode === 'FirstPerson');
    } catch (error) {
      console.error('❌ Error toggling first person:', error);
    }
  }

  public async handleToggleWalkControls(): Promise<void> {
    if (!this.viewer) return;
    const firstPersonControls = this.viewer.getFirstPersonControls();
    if (!firstPersonControls) return;
    try {
      const isActive = firstPersonControls.isActive();
      if (isActive) {
        firstPersonControls.disable();
      } else {
        firstPersonControls.enable();
      }
      this.updateWalkControlsButtonState(!isActive);
    } catch (error) {
      console.error('❌ Error toggling walk controls:', error);
    }
  }

  public async handleToggleMinimap(): Promise<void> {
    const minimapModule = this.getMinimapModule();
    if (!minimapModule) {
      NotificationHelper.show({
        title: 'Minimap Not Available',
        message: 'Minimap module is not initialized yet.',
        type: 'error',
        duration: 4000
      });
      return;
    }
    try {
      const isActive = minimapModule.isActive();
      if (isActive) {
        minimapModule.disable();
      } else {
        await minimapModule.enable();
      }
      this.updateMinimapButtonState(!isActive);
    } catch (error) {
      console.error('❌ Error toggling minimap:', error);
      NotificationHelper.show({
        title: 'Minimap Error',
        message: error instanceof Error ? error.message : String(error),
        type: 'error',
        duration: 4000
      });
    }
  }

  public updateMinimapButtonState(isActive: boolean): void {
    const minimapBtn = document.getElementById('minimapBtn');
    if (!minimapBtn) return;
    const label = minimapBtn.querySelector('.label');
    if (label) {
      label.textContent = isActive ? 'Hide Minimap' : 'Show Minimap';
    }
    if (isActive) {
      minimapBtn.style.background = 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)';
      minimapBtn.style.color = 'white';
    } else {
      minimapBtn.style.background = '';
      minimapBtn.style.color = '';
    }
  }

  public updateFirstPersonButtonState(isActive: boolean): void {
    const fpBtn = document.getElementById('firstPersonBtn');
    if (!fpBtn) return;
    if (isActive) {
      fpBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      fpBtn.style.color = 'white';
      const label = fpBtn.querySelector('.label');
      if (label) label.textContent = 'Exit FP View';
    } else {
      fpBtn.style.background = '';
      fpBtn.style.color = '';
      const label = fpBtn.querySelector('.label');
      if (label) label.textContent = 'First Person';
    }
  }

  public updateWalkControlsButtonState(isActive: boolean): void {
    const walkBtn = document.getElementById('walkControlsBtn');
    const speedContainer = document.getElementById('walkSpeedContainer');
    if (!walkBtn) return;
    if (isActive) {
      walkBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      walkBtn.style.color = 'white';
      const label = walkBtn.querySelector('.label');
      if (label) label.textContent = 'Walking...';
      if (speedContainer) speedContainer.style.display = 'block';
    } else {
      walkBtn.style.background = '';
      walkBtn.style.color = '';
      const label = walkBtn.querySelector('.label');
      if (label) label.textContent = 'Walk (WASD)';
      if (speedContainer) speedContainer.style.display = 'none';
    }
  }

  public async handleToggleWalkMode(): Promise<void> {
    if (!this.viewer) return;
    const worldManager = this.viewer.getWorldManager();
    const firstPersonControls = this.viewer.getFirstPersonControls();
    if (!worldManager || !firstPersonControls) return;
    try {
      const currentMode = worldManager.getNavigationMode();
      const isWalking = currentMode === 'FirstPerson' && firstPersonControls.isActive();
      if (isWalking) {
        await worldManager.setNavigationMode('Orbit');
        firstPersonControls.disable();
      } else {
        await worldManager.setNavigationMode('FirstPerson');
        firstPersonControls.enable();
      }
      this.updateWalkModeButtonState(!isWalking);
    } catch (error) {
      console.error('❌ Error toggling walk mode:', error);
    }
  }

  public async handleCancelWalkMode(): Promise<void> {
    if (!this.viewer) return;
    const worldManager = this.viewer.getWorldManager();
    const firstPersonControls = this.viewer.getFirstPersonControls();
    if (!worldManager || !firstPersonControls) return;
    try {
      await worldManager.setNavigationMode('Orbit');
      firstPersonControls.disable();
      this.updateWalkModeButtonState(false);
    } catch (error) {
      console.error('❌ Error canceling walk mode:', error);
    }
  }

  public updateWalkModeButtonState(isActive: boolean): void {
    const walkBtn = document.getElementById('walkModeBtn');
    const walkIndicator = document.getElementById('walkIndicator');
    const crosshair = document.getElementById('walkCrosshair');
    const helper = document.getElementById('walkHelper');
    if (!walkBtn) return;
    if (isActive) {
      walkBtn.classList.add('active');
      if (walkIndicator) walkIndicator.style.display = 'block';
      if (crosshair) crosshair.classList.add('visible');
      if (helper) helper.classList.add('visible');
    } else {
      walkBtn.classList.remove('active');
      if (walkIndicator) walkIndicator.style.display = 'none';
      if (crosshair) crosshair.classList.remove('visible');
      if (helper) helper.classList.remove('visible');
    }
  }
}
