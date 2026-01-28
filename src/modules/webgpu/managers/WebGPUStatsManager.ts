/**
 * WebGPU Stats Manager (The "Stat Bullshit Detector")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is the "Check Engine" light for the renderer. It watches how many 
 * triangles are being drawn, how much memory is being used, and how fast 
 * the frames are rendering.
 * 
 * WHY IT MATTERS: 
 * It helps developers find performance bottlenecks. If the "FPS" is low or 
 * "Draw Calls" are high, this module tells us exactly where the problem is.
 * --------------------------------------------------------------------------------
 */

import * as THREE from 'three';
import type { WebGPULODManager } from './WebGPULODManager';

// WebGPURenderer is dynamically imported at runtime, so we use 'any' type here
type WebGPURendererType = any;

/**
 * Stats display configuration
 */
export interface StatsConfig {
  /** Container element for the overlay */
  container: HTMLElement | null;
  /** Callback to get the renderer */
  getRenderer: () => WebGPURendererType | null;
  /** Callback to get the camera */
  getCamera: () => THREE.Camera | null;
  /** Callback to get the scene */
  getScene: () => THREE.Scene | null;
  /** Callback to get current settings */
  getSettings: () => {
    frustumCullingEnabled: boolean;
    geometryMergingEnabled: boolean;
    shadowsEnabled: boolean;
    edgesEnabled: boolean;
    groundPlaneEnabled: boolean;
    hiddenCategories: Set<string>;
    currentToneMapping: number;
    lodEnabled: boolean;
    shadowLight: THREE.DirectionalLight | null;
    mergedMeshes: THREE.Mesh[];
    lodManager: WebGPULODManager | null;
  };
}

/**
 * WebGPU Stats Manager
 * Manages the performance statistics overlay
 */
export class WebGPUStatsManager {
  // DOM element
  private statsOverlay: HTMLDivElement | null = null;
  
  // Timing stats
  private fps = 0;
  private frameTime = 0;
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private lastFrameTime = 0;
  private frameTimeHistory: number[] = [];
  private fpsHistory: number[] = [];
  private minFps = 999;
  private maxFps = 0;
  
  // Scene stats
  private meshCount = 0;
  private visibleMeshCount = 0;
  private triangleCount = 0;
  private vertexCount = 0;
  private drawCalls = 0;
  private lineCount = 0;
  private lightCount = 0;
  private geometryCount = 0;
  private materialCount = 0;
  private textureCount = 0;
  private sceneCenter = new THREE.Vector3();
  
  // GPU info
  private gpuInfo = 'Unknown';
  
  // Configuration
  private config: StatsConfig | null = null;
  private enabled = false;
  
  /**
   * Initialize the stats manager
   */
  public initialize(config: StatsConfig): void {
    this.config = config;
  }
  
  /**
   * Enable or disable the stats overlay
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    
    if (enabled) {
      this.createStatsOverlay();
      this.countSceneObjects();
      this.lastFpsUpdate = performance.now();
      this.lastFrameTime = performance.now();
      this.frameCount = 0;
    } else {
      this.removeStatsOverlay();
    }
    
    console.log(`📊 Stats ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Check if stats are enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Set GPU info string
   */
  public setGPUInfo(info: string): void {
    this.gpuInfo = info;
  }
  
  /**
   * Set scene center for camera distance calculation
   */
  public setSceneCenter(center: THREE.Vector3): void {
    this.sceneCenter.copy(center);
  }
  
  /**
   * Update frame timing - call this each frame
   */
  public updateFrame(currentTime: number): boolean {
    if (!this.enabled) return false;
    
    const delta = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;
    this.frameTime = delta;
    this.frameCount++;
    
    // Update FPS every 500ms
    if (currentTime - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = currentTime;
      this.updateStatsDisplay();
      return true;
    }
    
    return false;
  }
  
  /**
   * Dispose resources
   */
  public dispose(): void {
    this.removeStatsOverlay();
    this.config = null;
    this.enabled = false;
  }
  
  /**
   * Create the stats overlay element
   */
  private createStatsOverlay(): void {
    if (this.statsOverlay || !this.config?.container) return;
    
    this.statsOverlay = document.createElement('div');
    this.statsOverlay.id = 'webgpu-stats-overlay';
    this.statsOverlay.innerHTML = this.getStatsHTML();
    
    // Apply styles
    Object.assign(this.statsOverlay.style, {
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
    
    // Make draggable
    this.makeStatsDraggable();
    
    // Apply element styles
    this.applyStatsStyles();
    
    // Add scrollbar styles
    this.addScrollbarStyles();
    
    // Add to container
    this.config.container.appendChild(this.statsOverlay);
  }
  
  /**
   * Get HTML for stats overlay
   */
  private getStatsHTML(): string {
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
      <div class="stats-section-title">📐 LOD System</div>
      <div class="stats-row">
        <span class="stats-label">LOD Status:</span>
        <span class="stats-value" id="stats-lod-status">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">LOD Objects:</span>
        <span class="stats-value" id="stats-lod-objects">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Full/Simp/Imp:</span>
        <span class="stats-value" id="stats-lod-levels">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">LOD Triangles:</span>
        <span class="stats-value" id="stats-lod-tris">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">LOD Savings:</span>
        <span class="stats-value" id="stats-lod-savings">--</span>
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
        <span class="stats-label">To Center:</span>
        <span class="stats-value" id="stats-camdist">--</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">To Nearest:</span>
        <span class="stats-value" id="stats-camnearest">--</span>
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
        <span class="stats-label">CPU:</span>
        <span class="stats-value stats-small" id="stats-cpu">--</span>
      </div>
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
  
  /**
   * Apply CSS styles to stats elements
   */
  private applyStatsStyles(): void {
    if (!this.statsOverlay) return;
    
    // Style the header
    const header = this.statsOverlay.querySelector('.stats-header') as HTMLElement;
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
    
    // Style the rows
    const rows = this.statsOverlay.querySelectorAll('.stats-row');
    rows.forEach(row => {
      Object.assign((row as HTMLElement).style, {
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
      });
    });
    
    // Style dividers
    const dividers = this.statsOverlay.querySelectorAll('.stats-divider');
    dividers.forEach(divider => {
      Object.assign((divider as HTMLElement).style, {
        height: '1px',
        background: 'rgba(255,255,255,0.1)',
        margin: '6px 0',
      });
    });
    
    // Style labels
    const labels = this.statsOverlay.querySelectorAll('.stats-label');
    labels.forEach(label => {
      Object.assign((label as HTMLElement).style, {
        color: 'rgba(255,255,255,0.6)',
      });
    });
    
    // Style values
    const values = this.statsOverlay.querySelectorAll('.stats-value');
    values.forEach(value => {
      Object.assign((value as HTMLElement).style, {
        color: '#fff',
        fontWeight: '600',
      });
    });
    
    // Style section titles
    const sectionTitles = this.statsOverlay.querySelectorAll('.stats-section-title');
    sectionTitles.forEach(title => {
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
    const smallValues = this.statsOverlay.querySelectorAll('.stats-small');
    smallValues.forEach(val => {
      Object.assign((val as HTMLElement).style, {
        fontSize: '9px',
        maxWidth: '90px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      });
    });
    
    // Style highlighted values
    const highlights = this.statsOverlay.querySelectorAll('.stats-highlight');
    highlights.forEach(hl => {
      Object.assign((hl as HTMLElement).style, {
        color: '#69db7c',
        fontWeight: '700',
      });
    });
  }
  
  /**
   * Add custom scrollbar styles
   */
  private addScrollbarStyles(): void {
    const styleId = 'webgpu-stats-scrollbar-style';
    if (!document.getElementById(styleId)) {
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
  }
  
  /**
   * Remove the stats overlay
   */
  private removeStatsOverlay(): void {
    if (this.statsOverlay) {
      // Clean up drag handlers
      if ((this.statsOverlay as any)._dragCleanup) {
        (this.statsOverlay as any)._dragCleanup();
      }
      this.statsOverlay.remove();
      this.statsOverlay = null;
    }
  }
  
  /**
   * Make the stats overlay draggable
   */
  private makeStatsDraggable(): void {
    if (!this.statsOverlay) return;
    
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    
    const overlay = this.statsOverlay;
    
    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = overlay.getBoundingClientRect();
      const parentRect = overlay.parentElement?.getBoundingClientRect() || { left: 0, top: 0 };
      initialLeft = rect.left - parentRect.left;
      initialTop = rect.top - parentRect.top;
      
      overlay.style.transition = 'none';
      overlay.style.opacity = '0.9';
      
      e.preventDefault();
    };
    
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;
      
      // Constrain to container bounds
      const parent = overlay.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        
        const maxLeft = parentRect.width - overlayRect.width;
        const maxTop = parentRect.height - overlayRect.height;
        
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));
      }
      
      overlay.style.left = `${newLeft}px`;
      overlay.style.top = `${newTop}px`;
    };
    
    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        overlay.style.opacity = '1';
      }
    };
    
    overlay.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    // Store cleanup function
    (overlay as any)._dragCleanup = () => {
      overlay.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }
  
  /**
   * Update the stats display with current values
   */
  private updateStatsDisplay(): void {
    if (!this.statsOverlay || !this.config) return;
    
    const settings = this.config.getSettings();
    const renderer = this.config.getRenderer();
    const camera = this.config.getCamera();
    const scene = this.config.getScene();
    
    // Track frame time for average calculation
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
    
    // Count visible meshes for frustum culling stats
    this.visibleMeshCount = 0;
    if (scene) {
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.visible && obj.name !== 'webgpu-ground-plane') {
          this.visibleMeshCount++;
        }
      });
    }
    
    // Update timing stats
    this.updateElement('#stats-fps', this.fps.toString(), 
      this.fps >= 55 ? '#69db7c' : this.fps >= 30 ? '#fbbf24' : '#f87171');
    this.updateElement('#stats-frametime', `${this.frameTime.toFixed(1)} ms`);
    this.updateElement('#stats-avgframe', `${avgFrameTime.toFixed(1)} ms`);
    this.updateElement('#stats-minmaxfps', 
      `${this.minFps === 999 ? '--' : this.minFps}/${this.maxFps === 0 ? '--' : this.maxFps}`);
    
    // Update scene stats
    const culledPercent = this.meshCount > 0 
      ? ((this.meshCount - this.visibleMeshCount) / this.meshCount) * 100 : 0;
    this.updateElement('#stats-meshes', this.formatNumber(this.meshCount));
    this.updateElement('#stats-visible', this.formatNumber(this.visibleMeshCount),
      culledPercent > 10 ? '#69db7c' : undefined);
    this.updateElement('#stats-triangles', this.formatNumber(this.triangleCount));
    this.updateElement('#stats-vertices', this.formatNumber(this.vertexCount));
    this.updateElement('#stats-drawcalls', this.formatNumber(this.drawCalls));
    this.updateElement('#stats-lines', this.formatNumber(this.lineCount));
    this.updateElement('#stats-lights', this.lightCount.toString());
    
    // Update memory stats
    this.updateElement('#stats-geometries', this.formatNumber(this.geometryCount));
    this.updateElement('#stats-materials', this.formatNumber(this.materialCount));
    this.updateElement('#stats-textures', this.textureCount.toString());
    
    // JS Heap
    const perf = performance as any;
    if (perf.memory) {
      const usedMB = perf.memory.usedJSHeapSize / (1024 * 1024);
      const totalMB = perf.memory.jsHeapSizeLimit / (1024 * 1024);
      this.updateElement('#stats-jsheap', `${usedMB.toFixed(0)}/${totalMB.toFixed(0)} MB`);
    } else {
      this.updateElement('#stats-jsheap', 'N/A');
    }
    
    // Update optimization stats
    this.updateElement('#stats-frustum', settings.frustumCullingEnabled ? 'ON' : 'OFF',
      settings.frustumCullingEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)');
    this.updateElement('#stats-merging', settings.geometryMergingEnabled ? 'ON' : 'OFF',
      settings.geometryMergingEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)');
    this.updateElement('#stats-mergedcount', settings.mergedMeshes.length.toString());
    
    const shadowRes = settings.shadowLight?.shadow?.mapSize?.x ?? 2048;
    this.updateElement('#stats-shadowres', `${shadowRes}x${shadowRes}`);
    
    // Update LOD stats
    this.updateElement('#stats-lod-status', settings.lodEnabled ? 'ON' : 'OFF',
      settings.lodEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)');
    
    if (settings.lodEnabled && settings.lodManager) {
      const lodStats = settings.lodManager.getStats();
      this.updateElement('#stats-lod-objects', lodStats.totalObjects.toString());
      this.updateElement('#stats-lod-levels', 
        `${lodStats.fullDetail}/${lodStats.simplified}/${lodStats.impostor}`);
      this.updateElement('#stats-lod-tris', lodStats.currentTriangles.toLocaleString());
      
      const savedPercent = lodStats.originalTriangles > 0 
        ? Math.round((lodStats.trianglesSaved / lodStats.originalTriangles) * 100) : 0;
      this.updateElement('#stats-lod-savings', 
        `${lodStats.trianglesSaved.toLocaleString()} (${savedPercent}%)`,
        savedPercent > 0 ? '#69db7c' : 'rgba(255,255,255,0.5)');
    } else {
      this.updateElement('#stats-lod-objects', '--');
      this.updateElement('#stats-lod-levels', '--');
      this.updateElement('#stats-lod-tris', '--');
      this.updateElement('#stats-lod-savings', '--');
    }
    
    // Update settings stats
    this.updateElement('#stats-shadows', settings.shadowsEnabled ? 'ON' : 'OFF',
      settings.shadowsEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)');
    this.updateElement('#stats-edges', settings.edgesEnabled ? 'ON' : 'OFF',
      settings.edgesEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)');
    this.updateElement('#stats-ground', settings.groundPlaneEnabled ? 'ON' : 'OFF',
      settings.groundPlaneEnabled ? '#69db7c' : 'rgba(255,255,255,0.5)');
    this.updateElement('#stats-tonemap', this.getToneMappingName(settings.currentToneMapping));
    
    const spacesVisible = !settings.hiddenCategories.has('IFCSPACE');
    this.updateElement('#stats-spaces', spacesVisible ? 'Visible' : 'Hidden',
      spacesVisible ? '#69db7c' : '#fbbf24');
    
    // Update camera stats
    if (camera) {
      const pos = camera.position;
      this.updateElement('#stats-campos', 
        `${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}`);
      this.updateElement('#stats-camdist', 
        `${camera.position.distanceTo(this.sceneCenter).toFixed(1)}m`);
      
      // Nearest mesh distance
      if (scene) {
        let nearestDist = Infinity;
        const camPos = camera.position;
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.visible) {
            const meshPos = new THREE.Vector3();
            obj.getWorldPosition(meshPos);
            const dist = camPos.distanceTo(meshPos);
            if (dist < nearestDist) nearestDist = dist;
          }
        });
        this.updateElement('#stats-camnearest', 
          nearestDist < Infinity ? `${nearestDist.toFixed(1)}m` : '--');
      }
      
      const cam = camera as THREE.PerspectiveCamera;
      this.updateElement('#stats-fov', cam.fov ? `${cam.fov.toFixed(0)}°` : 'N/A');
    }
    
    // Update display stats
    if (renderer) {
      const size = renderer.getSize(new THREE.Vector2());
      this.updateElement('#stats-resolution', `${Math.round(size.x)}x${Math.round(size.y)}`);
      this.updateElement('#stats-pixelratio', renderer.getPixelRatio().toFixed(1));
    }
    
    // Update hardware stats
    const cores = navigator.hardwareConcurrency;
    this.updateElement('#stats-cpu', this.detectCPUInfo());
    this.updateElement('#stats-cpucores', cores ? `${cores} cores` : 'N/A');
    
    const nav = navigator as any;
    this.updateElement('#stats-devmemory', nav.deviceMemory ? `${nav.deviceMemory} GB` : 'N/A');
    
    // Battery status
    this.updateBatteryStatus();
    
    // GPU info
    this.updateElement('#stats-gpu', this.gpuInfo);
  }
  
  /**
   * Update a single element
   */
  private updateElement(selector: string, text: string, color?: string): void {
    if (!this.statsOverlay) return;
    const el = this.statsOverlay.querySelector(selector) as HTMLElement;
    if (el) {
      el.textContent = text;
      if (color) el.style.color = color;
    }
  }
  
  /**
   * Get tone mapping name
   */
  private getToneMappingName(type: number): string {
    switch (type) {
      case THREE.NoToneMapping: return 'None';
      case THREE.LinearToneMapping: return 'Linear';
      case THREE.ReinhardToneMapping: return 'Reinhard';
      case THREE.CineonToneMapping: return 'Cineon';
      case THREE.ACESFilmicToneMapping: return 'ACES Filmic';
      case THREE.AgXToneMapping: return 'AgX';
      case THREE.NeutralToneMapping: return 'Neutral';
      default: return 'Unknown';
    }
  }
  
  /**
   * Update battery status
   */
  private async updateBatteryStatus(): Promise<void> {
    if (!this.statsOverlay) return;
    const el = this.statsOverlay.querySelector('#stats-battery') as HTMLElement;
    if (!el) return;
    
    try {
      const nav = navigator as any;
      if (nav.getBattery) {
        const battery = await nav.getBattery();
        const level = Math.round(battery.level * 100);
        const charging = battery.charging;
        
        el.textContent = `${level}%${charging ? ' ⚡' : ''}`;
        
        if (level > 50) {
          el.style.color = '#69db7c';
        } else if (level > 20) {
          el.style.color = '#fbbf24';
        } else {
          el.style.color = '#f87171';
        }
      } else {
        el.textContent = 'N/A';
      }
    } catch {
      el.textContent = 'N/A';
    }
  }
  
  /**
   * Detect CPU info from available browser APIs and user agent
   */
  private detectCPUInfo(): string {
    try {
      const ua = navigator.userAgent;
      const platform = navigator.platform || '';
      
      // Try to detect Apple Silicon Macs
      if (platform.includes('Mac') || ua.includes('Mac')) {
        // Check for Apple Silicon (M1, M2, M3, etc.)
        if (platform === 'MacIntel' || platform.includes('Mac')) {
          const cores = navigator.hardwareConcurrency;
          
          // Try to get more info from userAgentData if available
          const nav = navigator as any;
          if (nav.userAgentData?.platform === 'macOS') {
            // M1 has 8 cores, M1 Pro/Max have 10, M2 has 8, M2 Pro has 10-12, M3 has 8, etc.
            if (cores >= 10) {
              return 'Apple Silicon Pro/Max';
            } else if (cores === 8) {
              return 'Apple Silicon';
            }
          }
          
          // Fallback: detect based on core count
          if (cores === 8) {
            return 'Apple Silicon (M-series)';
          } else if (cores >= 10) {
            return 'Apple Silicon Pro/Max';
          }
          return 'Apple Mac';
        }
      }
      
      // Detect Windows CPUs from user agent
      if (ua.includes('Win64') || ua.includes('Windows')) {
        if (ua.includes('x64') || ua.includes('Win64') || ua.includes('WOW64')) {
          return 'x86_64 (Windows)';
        }
        if (ua.includes('ARM')) {
          return 'ARM64 (Windows)';
        }
        return 'Windows';
      }
      
      // Detect Linux
      if (ua.includes('Linux')) {
        if (ua.includes('x86_64') || ua.includes('x64')) {
          return 'x86_64 (Linux)';
        }
        if (ua.includes('aarch64') || ua.includes('arm')) {
          return 'ARM64 (Linux)';
        }
        return 'Linux';
      }
      
      // Detect Android
      if (ua.includes('Android')) {
        return 'ARM (Android)';
      }
      
      // Detect iOS/iPadOS
      if (ua.includes('iPhone') || ua.includes('iPad')) {
        return 'Apple A/M-series (iOS)';
      }
      
      // Fallback to platform
      if (platform) {
        return platform;
      }
      
      return 'N/A';
    } catch {
      return 'N/A';
    }
  }
  
  /**
   * Count objects in the scene
   */
  private countSceneObjects(): void {
    const scene = this.config?.getScene();
    if (!scene) return;
    
    this.meshCount = 0;
    this.triangleCount = 0;
    this.vertexCount = 0;
    this.drawCalls = 0;
    this.lineCount = 0;
    this.lightCount = 0;
    
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        this.meshCount++;
        this.drawCalls++;
        
        const geometry = obj.geometry;
        if (geometry) {
          geometries.add(geometry);
          const index = geometry.index;
          const position = geometry.attributes.position;
          
          if (index) {
            this.triangleCount += Math.floor(index.count / 3);
          } else if (position) {
            this.triangleCount += Math.floor(position.count / 3);
          }
          
          if (position) {
            this.vertexCount += position.count;
          }
        }
        
        // Count materials and textures
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => {
          if (mat) {
            materials.add(mat);
            if ((mat as any).map) textures.add((mat as any).map);
            if ((mat as any).normalMap) textures.add((mat as any).normalMap);
            if ((mat as any).roughnessMap) textures.add((mat as any).roughnessMap);
            if ((mat as any).metalnessMap) textures.add((mat as any).metalnessMap);
            if ((mat as any).aoMap) textures.add((mat as any).aoMap);
          }
        });
        
      } else if (obj instanceof THREE.LineSegments || obj instanceof THREE.Line) {
        this.lineCount++;
        this.drawCalls++;
      } else if (obj instanceof THREE.Light) {
        this.lightCount++;
      }
    });
    
    this.geometryCount = geometries.size;
    this.materialCount = materials.size;
    this.textureCount = textures.size;
  }
  
  /**
   * Format large numbers
   */
  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
}
