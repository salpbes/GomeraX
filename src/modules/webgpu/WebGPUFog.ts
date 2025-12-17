/**
 * =============================================================================
 * WebGPU Fog Effect
 * =============================================================================
 * 
 * Atmospheric fog effect for WebGPU renderer. Unlike SSAO, fog doesn't require
 * post-processing and works perfectly with MSAA (anti-aliasing).
 * 
 * Fog adds depth and atmosphere to scenes by gradually blending distant objects
 * with a fog color, creating a sense of distance and scale.
 * 
 * Features:
 * - Linear fog (constant density)
 * - Exponential fog (density increases with distance)
 * - Exponential squared fog (more intense falloff)
 * - Configurable color, near/far, and density
 * - Works with MSAA enabled
 * 
 * @see https://threejs.org/docs/#api/en/scenes/Fog
 * @see https://threejs.org/docs/#api/en/scenes/FogExp2
 * =============================================================================
 */

import * as THREE from 'three';

export type FogType = 'linear' | 'exponential' | 'exponential2';

export interface FogSettings {
  enabled: boolean;
  type: FogType;
  color: string;      // Hex color string (e.g., '#e0e8f0')
  near: number;       // Linear fog start distance (default 10)
  far: number;        // Linear fog end distance (default 100)
  density: number;    // Exponential fog density (0.0001 - 0.1, default 0.005)
}

const DEFAULT_SETTINGS: FogSettings = {
  enabled: false,
  type: 'exponential2',
  color: '#e8ecf0',  // Light grayish-blue for architectural models
  near: 10,
  far: 200,
  density: 0.003,
};

/**
 * WebGPU Fog Manager
 * Provides atmospheric fog effects for the WebGPU renderer
 */
export class WebGPUFog {
  private scene: THREE.Scene | null = null;
  private settings: FogSettings = { ...DEFAULT_SETTINGS };
  private originalBackground: THREE.Color | THREE.Texture | null = null;
  private initialized: boolean = false;
  
  // Store fog instances
  private linearFog: THREE.Fog | null = null;
  private expFog: THREE.FogExp2 | null = null;

  constructor() {
    // No initialization needed
  }

  /**
   * Initialize the fog system
   */
  public initialize(scene: THREE.Scene): boolean {
    this.scene = scene;
    
    // Store original background
    this.originalBackground = scene.background;
    
    // Create fog instances
    const fogColor = new THREE.Color(this.settings.color);
    this.linearFog = new THREE.Fog(fogColor, this.settings.near, this.settings.far);
    this.expFog = new THREE.FogExp2(fogColor, this.settings.density);
    
    this.initialized = true;
    console.log('🌫️ Fog system initialized');
    
    return true;
  }

  /**
   * Enable or disable fog
   */
  public setEnabled(enabled: boolean): void {
    if (!this.initialized || !this.scene) {
      console.warn('🌫️ Fog not initialized');
      return;
    }
    
    this.settings.enabled = enabled;
    
    if (enabled) {
      this.applyFog();
      console.log(`🌫️ Fog enabled (${this.settings.type})`);
    } else {
      this.scene.fog = null;
      console.log('🌫️ Fog disabled');
    }
  }

  /**
   * Check if fog is enabled
   */
  public isEnabled(): boolean {
    return this.settings.enabled;
  }

  /**
   * Apply the current fog settings
   */
  private applyFog(): void {
    if (!this.scene) return;
    
    const fogColor = new THREE.Color(this.settings.color);
    
    switch (this.settings.type) {
      case 'linear':
        if (this.linearFog) {
          this.linearFog.color.copy(fogColor);
          this.linearFog.near = this.settings.near;
          this.linearFog.far = this.settings.far;
        }
        this.scene.fog = this.linearFog;
        break;
        
      case 'exponential':
      case 'exponential2':
        if (this.expFog) {
          this.expFog.color.copy(fogColor);
          this.expFog.density = this.settings.density;
        }
        this.scene.fog = this.expFog;
        break;
    }
    
    // Set scene background to fog color for seamless blending
    this.scene.background = fogColor;
  }

  /**
   * Set fog type
   */
  public setType(type: FogType): void {
    this.settings.type = type;
    
    if (this.settings.enabled) {
      this.applyFog();
      console.log(`🌫️ Fog type changed to: ${type}`);
    }
  }

  /**
   * Set fog color
   */
  public setColor(hexColor: string): void {
    this.settings.color = hexColor;
    
    if (this.settings.enabled) {
      this.applyFog();
    }
  }

  /**
   * Set linear fog near distance
   */
  public setNear(near: number): void {
    this.settings.near = Math.max(0.1, near);
    
    if (this.linearFog) {
      this.linearFog.near = this.settings.near;
    }
    
    console.log(`🌫️ Fog near: ${this.settings.near}`);
  }

  /**
   * Set linear fog far distance
   */
  public setFar(far: number): void {
    this.settings.far = Math.max(this.settings.near + 1, far);
    
    if (this.linearFog) {
      this.linearFog.far = this.settings.far;
    }
    
    console.log(`🌫️ Fog far: ${this.settings.far}`);
  }

  /**
   * Set exponential fog density
   */
  public setDensity(density: number): void {
    this.settings.density = Math.max(0.0001, Math.min(0.1, density));
    
    if (this.expFog) {
      this.expFog.density = this.settings.density;
    }
    
    console.log(`🌫️ Fog density: ${this.settings.density.toFixed(4)}`);
  }

  /**
   * Get current settings
   */
  public getSettings(): FogSettings {
    return { ...this.settings };
  }

  /**
   * Apply a preset
   */
  public applyPreset(preset: 'light' | 'medium' | 'heavy' | 'blue' | 'warm'): void {
    switch (preset) {
      case 'light':
        this.settings.color = '#f0f4f8';
        this.settings.density = 0.001;
        break;
      case 'medium':
        this.settings.color = '#e0e8f0';
        this.settings.density = 0.003;
        break;
      case 'heavy':
        this.settings.color = '#c8d0d8';
        this.settings.density = 0.008;
        break;
      case 'blue':
        this.settings.color = '#d8e8f8';
        this.settings.density = 0.004;
        break;
      case 'warm':
        this.settings.color = '#f8f0e0';
        this.settings.density = 0.003;
        break;
    }
    
    if (this.settings.enabled) {
      this.applyFog();
    }
    
    console.log(`🌫️ Applied fog preset: ${preset}`);
  }

  /**
   * Auto-configure fog based on model bounds
   */
  public autoConfigureFromBounds(boundingBox: THREE.Box3): void {
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    
    const maxDimension = Math.max(size.x, size.y, size.z);
    
    // Set linear fog distances based on model size
    this.settings.near = maxDimension * 0.1;
    this.settings.far = maxDimension * 3;
    
    // Set exponential density based on model size
    this.settings.density = 1 / maxDimension;
    
    if (this.linearFog) {
      this.linearFog.near = this.settings.near;
      this.linearFog.far = this.settings.far;
    }
    
    if (this.expFog) {
      this.expFog.density = this.settings.density;
    }
    
    console.log(`🌫️ Auto-configured fog for model size ${maxDimension.toFixed(1)}`);
    console.log(`   Near: ${this.settings.near.toFixed(1)}, Far: ${this.settings.far.toFixed(1)}, Density: ${this.settings.density.toFixed(4)}`);
  }

  /**
   * Restore original scene background
   */
  public restoreBackground(): void {
    if (this.scene && this.originalBackground) {
      this.scene.background = this.originalBackground;
    }
  }

  /**
   * Check if fog is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Dispose fog resources
   */
  public dispose(): void {
    if (this.scene) {
      this.scene.fog = null;
      this.restoreBackground();
    }
    
    this.linearFog = null;
    this.expFog = null;
    this.scene = null;
    this.initialized = false;
    
    console.log('🌫️ Fog disposed');
  }
}
