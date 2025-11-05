/**
 * Adaptive Quality Controller
 * 
 * Automatically adjusts rendering quality based on real-time FPS performance.
 * Balances visual quality with performance by switching between preset configurations.
 * 
 * Quality Levels:
 * - Ultra: Maximum quality (32 samples, full shadows) - Heavy
 * - High: High quality (16 samples, good shadows) - Medium-Heavy
 * - Balanced: Balanced quality (12 samples, moderate shadows) - Medium
 * - Performance: Performance mode (8 samples, light shadows) - Light
 * - Ultra Performance: Maximum performance (4 samples, minimal shadows) - Very Light
 */

import { PerformanceMonitor } from './PerformanceMonitor';
import { WorldManager } from './WorldManager';
import { ClipStylerModule } from './ClipStylerModule';

type QualityLevel = 'ultra' | 'high' | 'balanced' | 'performance' | 'ultra-performance';

interface QualityPreset {
  name: string;
  aoParameters: {
    samples: number;
    radius: number;
    scale: number;
    distanceExponent: number;
    thickness: number;
    distanceFallOff: number;
    screenSpaceRadius: boolean;
  };
  clipStylerPerformanceMode: 'high' | 'balanced' | 'performance'; // Section fill opacity
  fpsThreshold: {
    min: number; // Switch to this quality if FPS drops below this
    max: number; // Switch from this quality if FPS goes above this
  };
}

export class AdaptiveQualityController {
  private performanceMonitor: PerformanceMonitor;
  private worldManager: WorldManager;
  private clipStyler: ClipStylerModule | null = null;
  
  private currentQuality: QualityLevel = 'ultra';
  private enabled: boolean = false;
  private updateInterval: number = 1000; // Check FPS every 1 second
  private intervalId: number | null = null;
  
  // Quality presets based on OBC PostproductionRenderer best practices
  private qualityPresets: Record<QualityLevel, QualityPreset> = {
    'ultra': {
      name: 'Ultra Quality',
      aoParameters: {
        samples: 32,
        radius: 0.25,
        scale: 1.0,
        distanceExponent: 1,
        thickness: 1,
        distanceFallOff: 1,
        screenSpaceRadius: true,
      },
      clipStylerPerformanceMode: 'high', // Full opacity
      fpsThreshold: { min: 55, max: 999 },
    },
    'high': {
      name: 'High Quality',
      aoParameters: {
        samples: 16,
        radius: 0.25,
        scale: 0.8,
        distanceExponent: 1,
        thickness: 1,
        distanceFallOff: 1,
        screenSpaceRadius: true,
      },
      clipStylerPerformanceMode: 'balanced', // Moderate opacity
      fpsThreshold: { min: 45, max: 55 },
    },
    'balanced': {
      name: 'Balanced',
      aoParameters: {
        samples: 12,
        radius: 0.15,
        scale: 0.7,
        distanceExponent: 1.2,
        thickness: 0.8,
        distanceFallOff: 0.9,
        screenSpaceRadius: true,
      },
      clipStylerPerformanceMode: 'balanced', // Moderate opacity
      fpsThreshold: { min: 35, max: 45 },
    },
    'performance': {
      name: 'Performance',
      aoParameters: {
        samples: 8,
        radius: 0.1,
        scale: 0.5,
        distanceExponent: 1.5,
        thickness: 0.6,
        distanceFallOff: 0.8,
        screenSpaceRadius: true,
      },
      clipStylerPerformanceMode: 'performance', // Minimal opacity
      fpsThreshold: { min: 25, max: 35 },
    },
    'ultra-performance': {
      name: 'Ultra Performance',
      aoParameters: {
        samples: 4,
        radius: 0.08,
        scale: 0.3,
        distanceExponent: 2,
        thickness: 0.5,
        distanceFallOff: 0.7,
        screenSpaceRadius: true,
      },
      clipStylerPerformanceMode: 'performance', // Minimal opacity
      fpsThreshold: { min: 0, max: 25 },
    },
  };

  // Track recent FPS to avoid jittery quality switching
  private fpsHistory: number[] = [];
  private fpsHistorySize: number = 3; // Average over 3 samples
  
  constructor(
    performanceMonitor: PerformanceMonitor,
    worldManager: WorldManager,
    clipStyler?: ClipStylerModule
  ) {
    this.performanceMonitor = performanceMonitor;
    this.worldManager = worldManager;
    this.clipStyler = clipStyler || null;
  }

  /**
   * Sets the ClipStyler module (can be set after construction)
   */
  public setClipStyler(clipStyler: ClipStylerModule): void {
    this.clipStyler = clipStyler;
  }

  /**
   * Enables adaptive quality system
   * Starts monitoring FPS and automatically adjusting quality
   */
  public enable(): void {
    if (this.enabled) return;
    
    this.enabled = true;
    this.fpsHistory = [];
    
    // Start monitoring FPS
    this.intervalId = window.setInterval(() => {
      this.update();
    }, this.updateInterval);
    
    console.log('🎯 Adaptive Quality Controller enabled');
    console.log(`📊 Starting quality: ${this.qualityPresets[this.currentQuality].name} (will auto-adjust based on FPS)`);
  }

  /**
   * Disables adaptive quality system
   * Stops monitoring and keeps current quality level
   */
  public disable(): void {
    if (!this.enabled) return;
    
    this.enabled = false;
    
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log('⏸️ Adaptive Quality Controller disabled');
  }

  /**
   * Checks if adaptive quality is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Gets current quality level
   */
  public getCurrentQuality(): QualityLevel {
    return this.currentQuality;
  }

  /**
   * Gets current quality preset name
   */
  public getCurrentQualityName(): string {
    return this.qualityPresets[this.currentQuality].name;
  }

  /**
   * Manually sets quality level (disables adaptive mode)
   */
  public setQuality(quality: QualityLevel): void {
    if (quality === this.currentQuality) return;
    
    console.log(`🎨 Manually switching to ${this.qualityPresets[quality].name}`);
    this.applyQuality(quality);
  }

  /**
   * Main update loop - checks FPS and adjusts quality if needed
   */
  private update(): void {
    if (!this.enabled) return;
    
    // Get current FPS from performance monitor
    const currentFPS = this.performanceMonitor.getFPS();
    
    // Add to history and maintain size
    this.fpsHistory.push(currentFPS);
    if (this.fpsHistory.length > this.fpsHistorySize) {
      this.fpsHistory.shift();
    }
    
    // Calculate average FPS to avoid jittery switching
    const avgFPS = this.fpsHistory.reduce((sum, fps) => sum + fps, 0) / this.fpsHistory.length;
    
    // Determine appropriate quality level based on FPS
    const targetQuality = this.determineTargetQuality(avgFPS);
    
    // Switch quality if needed
    if (targetQuality !== this.currentQuality) {
      console.log(`📊 FPS: ${avgFPS.toFixed(1)} - Switching from ${this.qualityPresets[this.currentQuality].name} to ${this.qualityPresets[targetQuality].name}`);
      this.applyQuality(targetQuality);
    }
  }

  /**
   * Determines target quality level based on current FPS
   */
  private determineTargetQuality(fps: number): QualityLevel {
    const qualities: QualityLevel[] = ['ultra', 'high', 'balanced', 'performance', 'ultra-performance'];
    
    // Find the most appropriate quality level for current FPS
    for (const quality of qualities) {
      const preset = this.qualityPresets[quality];
      if (fps >= preset.fpsThreshold.min && fps < preset.fpsThreshold.max) {
        return quality;
      }
    }
    
    // Fallback based on FPS ranges
    if (fps >= 55) return 'ultra';
    if (fps >= 45) return 'high';
    if (fps >= 35) return 'balanced';
    if (fps >= 25) return 'performance';
    return 'ultra-performance';
  }

  /**
   * Applies a quality preset
   */
  private applyQuality(quality: QualityLevel): void {
    const preset = this.qualityPresets[quality];
    
    // Update Ambient Occlusion parameters
    this.worldManager.updateAOParameters(preset.aoParameters);
    
    // Update ClipStyler settings
    if (this.clipStyler) {
      // Set performance mode (controls opacity)
      this.clipStyler.setPerformanceMode(preset.clipStylerPerformanceMode);
    }
    
    // Update current quality
    this.currentQuality = quality;
    
    console.log(`✅ Applied ${preset.name} preset`);
    console.log(`   - AO Samples: ${preset.aoParameters.samples}`);
    console.log(`   - AO Radius: ${preset.aoParameters.radius}`);
    console.log(`   - AO Scale: ${preset.aoParameters.scale}`);
    console.log(`   - Section Fill Mode: ${preset.clipStylerPerformanceMode}`);
  }

  /**
   * Gets all available quality presets for UI display
   */
  public getQualityPresets(): Record<QualityLevel, { name: string; description: string }> {
    return {
      'ultra': {
        name: this.qualityPresets['ultra'].name,
        description: '32 samples, full quality shadows (Heavy)',
      },
      'high': {
        name: this.qualityPresets['high'].name,
        description: '16 samples, high quality shadows (Medium-Heavy)',
      },
      'balanced': {
        name: this.qualityPresets['balanced'].name,
        description: '12 samples, balanced quality/performance (Medium)',
      },
      'performance': {
        name: this.qualityPresets['performance'].name,
        description: '8 samples, optimized for performance (Light)',
      },
      'ultra-performance': {
        name: this.qualityPresets['ultra-performance'].name,
        description: '4 samples, maximum performance (Very Light)',
      },
    };
  }

  /**
   * Disposes the controller
   */
  public dispose(): void {
    this.disable();
    console.log('🗑️ Adaptive Quality Controller disposed');
  }
}
