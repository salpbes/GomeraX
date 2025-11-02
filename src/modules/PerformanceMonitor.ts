/**
 * Performance Monitor Module
 * 
 * This module handles performance monitoring using Stats.js
 * It displays:
 * - FPS (Frames Per Second)
 * - MS (Milliseconds per frame)
 * - MB (Memory usage)
 * 
 * Essential for ensuring the viewer runs smoothly,
 * especially with large IFC models.
 */

import Stats from 'stats.js';
import { WorldManager } from './WorldManager';

export class PerformanceMonitor {
  private stats: Stats | null = null;
  private worldManager: WorldManager;

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
  }

  /**
   * Initializes and displays the performance monitor
   * @param panel - Which panel to show (0: FPS, 1: MS, 2: MB)
   */
  public initialize(panel: number = 2): void {
    this.stats = new Stats();
    this.stats.showPanel(panel); // 0: fps, 1: ms, 2: mb

    // Style the stats panel
    this.stats.dom.style.position = 'absolute';
    this.stats.dom.style.left = '0px';
    this.stats.dom.style.top = '0px';
    this.stats.dom.style.zIndex = '100';

    document.body.appendChild(this.stats.dom);

    // Hook into the renderer's update cycle
    const world = this.worldManager.world;
    if (world?.renderer) {
      world.renderer.onBeforeUpdate.add(() => this.stats?.begin());
      world.renderer.onAfterUpdate.add(() => this.stats?.end());
    }

    console.log('✅ Performance monitor initialized');
  }

  /**
   * Changes which panel is displayed
   * @param panel - 0: FPS, 1: MS, 2: MB
   */
  public showPanel(panel: number): void {
    this.stats?.showPanel(panel);
  }

  /**
   * Hides the performance monitor
   */
  public hide(): void {
    if (this.stats?.dom) {
      this.stats.dom.style.display = 'none';
    }
  }

  /**
   * Shows the performance monitor
   */
  public show(): void {
    if (this.stats?.dom) {
      this.stats.dom.style.display = 'block';
    }
  }

  /**
   * Removes the performance monitor
   */
  public dispose(): void {
    if (this.stats?.dom) {
      document.body.removeChild(this.stats.dom);
      this.stats = null;
    }
  }
}
