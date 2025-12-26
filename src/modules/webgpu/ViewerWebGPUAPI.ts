/**
 * ViewerWebGPUAPI handles all WebGPU-related operations for the IFCViewer.
 * This separates the experimental WebGPU API from the core viewer logic.
 */

import * as THREE from 'three';
import { WebGPURendererModule } from './WebGPURendererModule';
import { WorldManager } from '../webgl/WorldManager';

export class ViewerWebGPUAPI {
  constructor(
    private getRenderer: () => WebGPURendererModule | null,
    private getWorldManager: () => WorldManager,
    private getContainer: () => HTMLElement | null
  ) {}

  private get renderer() {
    return this.getRenderer();
  }

  public isEnabled(): boolean {
    return this.renderer?.isEnabled() || false;
  }

  public isActive(): boolean {
    return this.renderer?.isWebGPUActive() || false;
  }

  public async toggle(force?: boolean): Promise<boolean> {
    const renderer = this.renderer;
    const worldManager = this.getWorldManager();
    const container = this.getContainer();

    if (!renderer || !worldManager.world || !container) {
      console.warn('⚠️ WebGPU toggle: Missing required components');
      return false;
    }

    const currentlyEnabled = renderer.isEnabled();
    const targetState = force !== undefined ? force : !currentlyEnabled;

    if (!targetState) {
      if (currentlyEnabled) {
        renderer.disable();
      }
      return true;
    } else {
      if (currentlyEnabled) return true;
      return await renderer.enable(
        worldManager.world,
        container,
        worldManager.getComponents()
      );
    }
  }

  public async checkSupport(): Promise<{ available: boolean; reason?: string }> {
    return WebGPURendererModule.checkWebGPUSupport();
  }

  public setToneMapping(type: number): void {
    this.renderer?.setToneMapping(type as THREE.ToneMapping);
  }

  public setExposure(value: number): void {
    this.renderer?.setExposure(value);
  }

  public setShadows(enabled: boolean): void {
    this.renderer?.setShadowsEnabled(enabled);
  }

  public setShadowAngle(angle: number): void {
    this.renderer?.setShadowAngle(angle);
  }

  public setShadowElevation(elevation: number): void {
    this.renderer?.setShadowElevation(elevation);
  }

  public setGroundPlane(enabled: boolean): void {
    this.renderer?.setGroundPlaneEnabled(enabled);
  }

  public setEdges(enabled: boolean): void {
    this.renderer?.setEdgesEnabled(enabled);
  }

  public setEdgeThreshold(degrees: number): void {
    this.renderer?.setEdgeThreshold(degrees);
  }

  public setStats(enabled: boolean): void {
    this.renderer?.setStatsEnabled(enabled);
  }

  public setFrustumCulling(enabled: boolean): void {
    this.renderer?.setFrustumCullingEnabled(enabled);
  }

  public setOutlineEnabled(enabled: boolean): void {
    this.renderer?.setOutlineEnabled(enabled);
  }

  public setOutlineHoverEnabled(enabled: boolean): void {
    this.renderer?.setOutlineHoverEnabled(enabled);
  }

  public setOutlineThickness(thickness: number): void {
    this.renderer?.setOutlineThickness(thickness);
  }

  public setOutlineSelectionColor(color: number | string): void {
    this.renderer?.setOutlineSelectionColor(color);
  }

  public setOutlineHoverColor(color: number | string): void {
    this.renderer?.setOutlineHoverColor(color);
  }

  public clearSelection(): void {
    this.renderer?.clearOutlineSelection();
  }

  public debugOutline(): void {
    this.renderer?.debugOutlineState();
  }

  public setElementVisibility(modelId: string, localIds: number[], visible: boolean): void {
    this.renderer?.setElementVisibility(modelId, localIds, visible);
  }

  public isolateElements(modelId: string, localIds: number[]): void {
    this.renderer?.isolateElements(modelId, localIds);
  }

  public showAllElements(): void {
    this.renderer?.showAllElements();
  }

  public setShadowQuality(resolution: number): void {
    this.renderer?.setShadowMapResolution(resolution);
  }

  public applyPerformancePreset(preset: 'low' | 'medium' | 'high'): void {
    this.renderer?.applyPerformancePreset(preset);
  }

  public async setSpacesVisible(visible: boolean): Promise<void> {
    await this.renderer?.setSpacesVisible(visible);
  }

  public areSpacesVisible(): boolean {
    return this.renderer?.areSpacesVisible() ?? true;
  }

  public setFogEnabled(enabled: boolean): void {
    this.renderer?.setFogEnabled(enabled);
  }

  public isFogEnabled(): boolean {
    return this.renderer?.isFogEnabled() ?? false;
  }

  public setFogType(type: 'linear' | 'exponential' | 'exponential2'): void {
    this.renderer?.setFogType(type);
  }

  public setFogColor(hexColor: string): void {
    this.renderer?.setFogColor(hexColor);
  }

  public setFogDensity(density: number): void {
    this.renderer?.setFogDensity(density);
  }

  public setFogNear(near: number): void {
    this.renderer?.setFogNear(near);
  }

  public setFogFar(far: number): void {
    this.renderer?.setFogFar(far);
  }

  public applyFogPreset(preset: 'light' | 'medium' | 'heavy' | 'blue' | 'warm'): void {
    this.renderer?.applyFogPreset(preset);
  }

  public autoConfigureFog(): void {
    this.renderer?.autoConfigureFog();
  }

  public setLODEnabled(enabled: boolean): void {
    this.renderer?.setLODEnabled(enabled);
  }

  public isLODEnabled(): boolean {
    return this.renderer?.isLODEnabled() ?? false;
  }

  public setLODHighDistance(distance: number): void {
    this.renderer?.setLODHighDistance(distance);
  }

  public setLODMediumDistance(distance: number): void {
    this.renderer?.setLODMediumDistance(distance);
  }

  public setLODLowDistance(distance: number): void {
    this.renderer?.setLODLowDistance(distance);
  }

  public setLODShowImpostors(show: boolean): void {
    this.renderer?.setLODShowImpostors(show);
  }

  public getLODStats() {
    return this.renderer?.getLODStats() ?? null;
  }

  public refreshLOD(): void {
    this.renderer?.refreshLOD();
  }
}
