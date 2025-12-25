/**
 * WEBGPU STATS OVERLAY (The "Dashboard")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is the small info box that shows you how hard the computer is 
 * working. It displays the "FPS" (frames per second), how many triangles 
 * are being drawn, and how much memory the WebGPU engine is using.
 * 
 * HOW IT CONNECTS:
 * - WebGPURendererModule: Listens to the engine's performance to update 
 *   the numbers in real-time.
 * --------------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { 
  formatNumber, 
  getToneMappingName, 
  SceneStats, 
  PerformanceStats 
} from './WebGPUTypes';

export interface StatsOverlayConfig {
  enabled: boolean;
  gpuInfo: string;
  shadowsEnabled: boolean;
  edgesEnabled: boolean;
  groundPlaneEnabled: boolean;
  frustumCullingEnabled: boolean;
  geometryMergingEnabled: boolean;
  spacesHidden: boolean;
  shadowMapResolution: number;
  mergedMeshCount: number;
  toneMapping: THREE.ToneMapping;
}

export class WebGPUStatsOverlay {
  private overlay: HTMLDivElement | null = null;
  private container: HTMLElement | null = null;
  
  // Performance tracking
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private fps: number = 0;
  private minFps: number = 999;
  private maxFps: number = 0;
  private frameTime: number = 0;
  private lastFrameTime: number = 0;
  private frameTimeHistory: number[] = [];
  private fpsHistory: number[] = [];

  /**
   * Create the stats overlay element
   */
  public create(container: HTMLElement): void {
    if (this.overlay) return;
    
    this.container = container;
    this.overlay = document.createElement('div');
    this.overlay.id = 'webgpu-stats-overlay';
    this.overlay.innerHTML = this.getOverlayHTML();
    
    this.applyStyles();
    this.makeOverlayDraggable();
    
    container.appendChild(this.overlay);
  }

  /**
   * Remove the stats overlay
   */
  public remove(): void {
    if (this.overlay && this.overlay.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }
    this.overlay = null;
    this.resetStats();
  }

  /**
   * Reset all stats
   */
  private resetStats(): void {
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.fps = 0;
    this.minFps = 999;
    this.maxFps = 0;
    this.frameTime = 0;
    this.lastFrameTime = 0;
    this.frameTimeHistory = [];
    this.fpsHistory = [];
  }

  /**
   * Update frame timing - call this every frame
   */
  public updateFrameTiming(currentTime: number): boolean {
    const delta = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;
    this.frameTime = delta;
    this.frameCount++;
    
    // Update FPS every 500ms
    if (currentTime - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = currentTime;
      return true; // Signal to update display
    }
    return false;
  }

  /**
   * Update the stats display
   */
  public updateDisplay(
    sceneStats: SceneStats,
    config: StatsOverlayConfig,
    camera: THREE.Camera | null,
    renderer: any
  ): void {
    if (!this.overlay) return;
    
    // Track frame time history
    if (this.frameTime > 0) {
      this.frameTimeHistory.push(this.frameTime);
      if (this.frameTimeHistory.length > 60) {
        this.frameTimeHistory.shift();
      }
    }
    
    const avgFrameTime = this.frameTimeHistory.length > 0 
      ? this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length 
      : 0;
    
    // Track min/max FPS
    if (this.fps > 0) {
      this.fpsHistory.push(this.fps);
      if (this.fpsHistory.length > 120) {
        this.fpsHistory.shift();
      }
      if (this.fps < this.minFps && this.fps > 0) this.minFps = this.fps;
      if (this.fps > this.maxFps) this.maxFps = this.fps;
    }
    
    // Update timing stats
    this.updateElement('stats-fps', this.fps.toString(), this.getFpsColor(this.fps));
    this.updateElement('stats-frametime', `${this.frameTime.toFixed(1)} ms`);
    this.updateElement('stats-avgframe', `${avgFrameTime.toFixed(1)} ms`);
    this.updateElement('stats-minmaxfps', 
      `${this.minFps === 999 ? '--' : this.minFps}/${this.maxFps === 0 ? '--' : this.maxFps}`);
    
    // Update scene stats
    this.updateElement('stats-meshes', formatNumber(sceneStats.meshCount));
    this.updateElement('stats-visible', formatNumber(sceneStats.visibleMeshCount), 
      this.getCullingColor(sceneStats.meshCount, sceneStats.visibleMeshCount));
    this.updateElement('stats-triangles', formatNumber(sceneStats.triangleCount));
    this.updateElement('stats-vertices', formatNumber(sceneStats.vertexCount));
    this.updateElement('stats-drawcalls', formatNumber(sceneStats.drawCalls));
    this.updateElement('stats-lines', formatNumber(sceneStats.lineCount));
    this.updateElement('stats-lights', sceneStats.lightCount.toString());
    
    // Update memory stats
    this.updateElement('stats-geometries', formatNumber(sceneStats.geometryCount));
    this.updateElement('stats-materials', formatNumber(sceneStats.materialCount));
    this.updateElement('stats-textures', sceneStats.textureCount.toString());
    this.updateJSHeap();
    
    // Update optimization stats
    this.updateElement('stats-frustum', config.frustumCullingEnabled ? 'ON' : 'OFF',
      config.frustumCullingEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)');
    this.updateElement('stats-merging', config.geometryMergingEnabled ? 'ON' : 'OFF',
      config.geometryMergingEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)');
    this.updateElement('stats-mergedcount', config.mergedMeshCount.toString());
    this.updateElement('stats-shadowres', `${config.shadowMapResolution}x${config.shadowMapResolution}`);
    
    // Update settings stats
    this.updateElement('stats-shadows', config.shadowsEnabled ? 'ON' : 'OFF',
      config.shadowsEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)');
    this.updateElement('stats-edges', config.edgesEnabled ? 'ON' : 'OFF',
      config.edgesEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)');
    this.updateElement('stats-ground', config.groundPlaneEnabled ? 'ON' : 'OFF',
      config.groundPlaneEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)');
    this.updateElement('stats-tonemap', getToneMappingName(config.toneMapping));
    this.updateElement('stats-spaces', config.spacesHidden ? 'Hidden' : 'Visible',
      config.spacesHidden ? '#fbbf24' : '#69db7c');
    
    // Update camera stats
    if (camera) {
      const pos = camera.position;
      this.updateElement('stats-campos', 
        `${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}`);
      
      const cam = camera as THREE.PerspectiveCamera;
      if (cam.fov) {
        this.updateElement('stats-fov', `${cam.fov.toFixed(0)}°`);
      }
    }
    
    // Update display stats
    if (renderer) {
      const size = renderer.getSize(new THREE.Vector2());
      this.updateElement('stats-resolution', `${Math.round(size.x)}x${Math.round(size.y)}`);
      this.updateElement('stats-pixelratio', renderer.getPixelRatio().toFixed(1));
    }
    
    // Update hardware stats
    this.updateHardwareStats();
    
    // Update GPU info
    this.updateElement('stats-gpu', config.gpuInfo);
  }

  /**
   * Update camera distance stat
   */
  public updateCameraDistance(distance: number): void {
    this.updateElement('stats-camdist', `${distance.toFixed(1)}m`);
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  private updateElement(id: string, value: string, color?: string): void {
    const el = this.overlay?.querySelector(`#${id}`);
    if (el) {
      el.textContent = value;
      if (color) {
        (el as HTMLElement).style.color = color;
      }
    }
  }

  private getFpsColor(fps: number): string {
    if (fps >= 55) return '#69db7c';
    if (fps >= 30) return '#fbbf24';
    return '#f87171';
  }

  private getCullingColor(total: number, visible: number): string {
    const culledPercent = total > 0 ? ((total - visible) / total) * 100 : 0;
    return culledPercent > 10 ? '#69db7c' : 'inherit';
  }

  private updateJSHeap(): void {
    const el = this.overlay?.querySelector('#stats-jsheap');
    if (!el) return;
    
    const perf = performance as any;
    if (perf.memory) {
      const usedMB = perf.memory.usedJSHeapSize / (1024 * 1024);
      const totalMB = perf.memory.jsHeapSizeLimit / (1024 * 1024);
      el.textContent = `${usedMB.toFixed(0)}/${totalMB.toFixed(0)} MB`;
    } else {
      el.textContent = 'N/A';
    }
  }

  private async updateHardwareStats(): Promise<void> {
    // CPU cores
    const cpuEl = this.overlay?.querySelector('#stats-cpucores');
    if (cpuEl) {
      const cores = navigator.hardwareConcurrency;
      cpuEl.textContent = cores ? `${cores} cores` : 'N/A';
    }
    
    // Device memory (Chrome only)
    const memEl = this.overlay?.querySelector('#stats-devmemory');
    if (memEl) {
      const nav = navigator as any;
      memEl.textContent = nav.deviceMemory ? `${nav.deviceMemory} GB` : 'N/A';
    }
    
    // Battery
    const batteryEl = this.overlay?.querySelector('#stats-battery');
    if (batteryEl) {
      await this.updateBatteryStatus(batteryEl as HTMLElement);
    }
  }

  private async updateBatteryStatus(element: HTMLElement): Promise<void> {
    try {
      const nav = navigator as any;
      if (nav.getBattery) {
        const battery = await nav.getBattery();
        const level = Math.round(battery.level * 100);
        const charging = battery.charging;
        
        element.textContent = `${level}%${charging ? ' ⚡' : ''}`;
        
        if (level > 50) {
          element.style.color = '#69db7c';
        } else if (level > 20) {
          element.style.color = '#fbbf24';
        } else {
          element.style.color = '#f87171';
        }
      } else {
        element.textContent = 'N/A';
      }
    } catch {
      element.textContent = 'N/A';
    }
  }

  private getOverlayHTML(): string {
    return `
      <div class="stats-header">📊 WebGPU Performance</div>
      
      <div class="stats-section-title">⚡ Timing</div>
      <div class="stats-row">
        <span class="stats-label">FPS:</span>
        <span class="stats-value" id="stats-fps">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Frame Time:</span>
        <span class="stats-value" id="stats-frametime">-- ms</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Avg Frame:</span>
        <span class="stats-value" id="stats-avgframe">-- ms</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Min/Max FPS:</span>
        <span class="stats-value" id="stats-minmaxfps">--/--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">🎨 Scene</div>
      <div class="stats-row">
        <span class="stats-label">Meshes:</span>
        <span class="stats-value" id="stats-meshes">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Visible:</span>
        <span class="stats-value" id="stats-visible">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Triangles:</span>
        <span class="stats-value" id="stats-triangles">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Vertices:</span>
        <span class="stats-value" id="stats-vertices">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Draw Calls:</span>
        <span class="stats-value" id="stats-drawcalls">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Lines:</span>
        <span class="stats-value" id="stats-lines">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Lights:</span>
        <span class="stats-value" id="stats-lights">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">📦 Memory</div>
      <div class="stats-row">
        <span class="stats-label">Geometries:</span>
        <span class="stats-value" id="stats-geometries">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Materials:</span>
        <span class="stats-value" id="stats-materials">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Textures:</span>
        <span class="stats-value" id="stats-textures">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">JS Heap:</span>
        <span class="stats-value" id="stats-jsheap">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">🚀 Optimizations</div>
      <div class="stats-row">
        <span class="stats-label">Frustum Cull:</span>
        <span class="stats-value" id="stats-frustum">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Geo Merging:</span>
        <span class="stats-value" id="stats-merging">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Merged Meshes:</span>
        <span class="stats-value" id="stats-mergedcount">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Shadow Res:</span>
        <span class="stats-value" id="stats-shadowres">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">⚙️ Settings</div>
      <div class="stats-row">
        <span class="stats-label">Shadows:</span>
        <span class="stats-value" id="stats-shadows">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Edges:</span>
        <span class="stats-value" id="stats-edges">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Ground:</span>
        <span class="stats-value" id="stats-ground">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Tone Map:</span>
        <span class="stats-value" id="stats-tonemap">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Spaces:</span>
        <span class="stats-value" id="stats-spaces">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">📷 Camera</div>
      <div class="stats-row">
        <span class="stats-label">Position:</span>
        <span class="stats-value stats-small" id="stats-campos">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Distance:</span>
        <span class="stats-value" id="stats-camdist">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">FOV:</span>
        <span class="stats-value" id="stats-fov">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">🖥️ Display</div>
      <div class="stats-row">
        <span class="stats-label">Resolution:</span>
        <span class="stats-value" id="stats-resolution">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Pixel Ratio:</span>
        <span class="stats-value" id="stats-pixelratio">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-section-title">🖥️ Hardware</div>
      <div class="stats-row">
        <span class="stats-label">CPU Cores:</span>
        <span class="stats-value" id="stats-cpucores">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Memory:</span>
        <span class="stats-value" id="stats-devmemory">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Battery:</span>
        <span class="stats-value" id="stats-battery">--</span>
      </div>
      
      <div class="stats-row stats-divider"></div>
      <div class="stats-row">
        <span class="stats-label">Renderer:</span>
        <span class="stats-value stats-highlight" id="stats-renderer">WebGPU</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">GPU:</span>
        <span class="stats-value stats-small" id="stats-gpu">--</span>
      </div>
    `;
  }

  private applyStyles(): void {
    if (!this.overlay) return;
    
    // Main container styles
    Object.assign(this.overlay.style, {
      position: 'absolute',
      top: '10px',
      left: '10px',
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      color: '#fff',
      padding: '12px 16px',
      borderRadius: '10px',
      fontFamily: 'Monaco, Consolas, monospace',
      fontSize: '11px',
      lineHeight: '1.6',
      zIndex: '10000',
      minWidth: '160px',
      maxHeight: 'calc(100vh - 100px)',
      overflowY: 'auto',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      border: '1px solid rgba(255,255,255,0.1)',
      cursor: 'move',
      userSelect: 'none',
    });
    
    // Add scrollbar styles
    this.addScrollbarStyles();
    
    // Style header
    const header = this.overlay.querySelector('.stats-header') as HTMLElement;
    if (header) {
      Object.assign(header.style, {
        fontWeight: 'bold',
        fontSize: '12px',
        marginBottom: '8px',
        paddingBottom: '6px',
        borderBottom: '1px solid rgba(255,255,255,0.2)',
        color: '#69db7c',
        position: 'sticky',
        top: '-12px',
        background: 'rgba(0, 0, 0, 0.9)',
        marginTop: '-12px',
        paddingTop: '12px',
        zIndex: '1',
      });
    }
    
    // Style rows
    this.overlay.querySelectorAll('.stats-row').forEach(row => {
      Object.assign((row as HTMLElement).style, {
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
      });
    });
    
    // Style dividers
    this.overlay.querySelectorAll('.stats-divider').forEach(divider => {
      Object.assign((divider as HTMLElement).style, {
        height: '1px',
        background: 'rgba(255,255,255,0.1)',
        margin: '6px 0',
      });
    });
    
    // Style labels
    this.overlay.querySelectorAll('.stats-label').forEach(label => {
      Object.assign((label as HTMLElement).style, {
        color: 'rgba(255,255,255,0.6)',
      });
    });
    
    // Style values
    this.overlay.querySelectorAll('.stats-value').forEach(value => {
      Object.assign((value as HTMLElement).style, {
        color: '#fff',
        fontWeight: '600',
      });
    });
    
    // Style section titles
    this.overlay.querySelectorAll('.stats-section-title').forEach(title => {
      Object.assign((title as HTMLElement).style, {
        fontSize: '10px',
        fontWeight: '600',
        color: '#69db7c',
        marginTop: '4px',
        marginBottom: '4px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      });
    });
    
    // Style small values
    this.overlay.querySelectorAll('.stats-small').forEach(val => {
      Object.assign((val as HTMLElement).style, {
        fontSize: '9px',
        maxWidth: '90px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      });
    });
    
    // Style highlighted values
    this.overlay.querySelectorAll('.stats-highlight').forEach(hl => {
      Object.assign((hl as HTMLElement).style, {
        color: '#69db7c',
        fontWeight: '700',
      });
    });
  }

  private addScrollbarStyles(): void {
    const styleId = 'webgpu-stats-scrollbar-style';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #webgpu-stats-overlay::-webkit-scrollbar {
        width: 6px;
      }
      #webgpu-stats-overlay::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
      }
      #webgpu-stats-overlay::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
      }
      #webgpu-stats-overlay::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    `;
    document.head.appendChild(style);
  }

  private makeOverlayDraggable(): void {
    if (!this.overlay) return;
    
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    
    this.overlay.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.overlay!.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging || !this.overlay) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      this.overlay.style.left = `${startLeft + deltaX}px`;
      this.overlay.style.top = `${startTop + deltaY}px`;
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  /**
   * Check if overlay is visible
   */
  public isVisible(): boolean {
    return this.overlay !== null;
  }
}
