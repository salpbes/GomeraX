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
  private currentFPS: number = 60; // Default to 60 FPS
  
  // Manual FPS calculation
  private frameCount: number = 0;
  private lastTime: number = performance.now();
  private fpsUpdateInterval: number = 500; // Update FPS every 500ms

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
    
    // Debug: Log Stats.js structure once
    console.log('📊 Stats.js structure:', this.stats);
    console.log('📊 Stats.js panels:', (this.stats as any).panels);

    // Hook into the renderer's update cycle
    const world = this.worldManager.world;
    if (world?.renderer) {
      let logCount = 0; // Only log first few times for debugging
      
      world.renderer.onBeforeUpdate.add(() => {
        this.stats?.begin();
      });
      world.renderer.onAfterUpdate.add(() => {
        this.stats?.end();
        
        // Calculate FPS manually (more reliable than reading Stats.js internals)
        this.frameCount++;
        const currentTime = performance.now();
        const elapsed = currentTime - this.lastTime;
        
        if (elapsed >= this.fpsUpdateInterval) {
          // Calculate average FPS over the interval
          this.currentFPS = Math.round((this.frameCount * 1000) / elapsed);
          
          if (logCount < 3) {
            console.log(`📊 Manual FPS calculation: ${this.frameCount} frames in ${elapsed.toFixed(0)}ms = ${this.currentFPS} FPS`);
            logCount++;
          }
          
          // Reset counters
          this.frameCount = 0;
          this.lastTime = currentTime;
        }
        
        // Also try to read from Stats.js for comparison (first few frames only)
        if (this.stats && logCount < 5) {
          const fpsPanel = (this.stats as any).panels?.[0];
          
          if (logCount < 3) {
            console.log('🔍 FPS Panel structure:', fpsPanel);
            console.log('🔍 FPS Panel keys:', fpsPanel ? Object.keys(fpsPanel) : 'no panel');
          }
          
          if (fpsPanel && fpsPanel.values) {
            const values = fpsPanel.values;
            if (values.length > 0 && logCount < 3) {
              const statsFPS = values[values.length - 1];
              console.log(`✅ Stats.js FPS: ${statsFPS}, Manual FPS: ${this.currentFPS}`);
            }
          }
        }
      });
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
   * Gets the current FPS (Frames Per Second)
   * @returns Current FPS value
   */
  public getFPS(): number {
    return this.currentFPS;
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
