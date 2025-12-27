/**
 * WebGPU Types and Interfaces (The "Not My Type Library")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is the "Dictionary" for the WebGPU module. It defines the shapes of 
 * data, settings, and objects that the renderer uses.
 * 
 * WHY IT MATTERS: 
 * It ensures that all parts of the WebGPU system speak the same language. 
 * If one part expects a "Color" and gets a "Number", this file helps catch 
 * that mistake before the app crashes.
 * --------------------------------------------------------------------------------
 */

import * as THREE from 'three';

/**
 * Renderer mode - WebGL or WebGPU
 */
export type RendererMode = 'webgl' | 'webgpu';

/**
 * WebGPU availability status
 */
export interface WebGPUStatus {
  available: boolean;
  reason?: string;
  browserInfo?: string;
}

/**
 * Performance preset levels
 */
export type PerformancePreset = 'low' | 'medium' | 'high';

/**
 * Scene statistics
 */
export interface SceneStats {
  meshCount: number;
  visibleMeshCount: number;
  triangleCount: number;
  vertexCount: number;
  drawCalls: number;
  lineCount: number;
  lightCount: number;
  geometryCount: number;
  materialCount: number;
  textureCount: number;
}

/**
 * Performance statistics
 */
export interface PerformanceStats {
  fps: number;
  minFps: number;
  maxFps: number;
  frameTime: number;
  avgFrameTime: number;
}

/**
 * Shadow configuration
 */
export interface ShadowConfig {
  enabled: boolean;
  angle: number;        // degrees (0-360)
  elevation: number;    // degrees (10-90)
  mapSize: number;      // resolution (512, 1024, 2048, 4096)
  bias: number;
  normalBias: number;
}

/**
 * Edge rendering configuration
 */
export interface EdgeConfig {
  enabled: boolean;
  threshold: number;    // angle threshold in degrees
  color: THREE.Color;
}

/**
 * Ground plane configuration
 */
export interface GroundPlaneConfig {
  enabled: boolean;
  color: number;
  roughness: number;
  metalness: number;
}

/**
 * Optimization settings
 */
export interface OptimizationConfig {
  frustumCullingEnabled: boolean;
  geometryMergingEnabled: boolean;
  shadowCachingEnabled: boolean;
  cameraMovedThreshold: number;
}

/**
 * Options for in-place proxy scene building
 */
export interface WebGPUInPlaceOptions {
  frustumCulling: boolean;
  materialBackup: Map<string, THREE.Material | THREE.Material[]>;
  visibilityBackup: Map<string, boolean>;
  geometryBackup: Map<string, THREE.BufferGeometry>;
  onBeforeRenderBackup: Map<string, THREE.Object3D['onBeforeRender']>;
  onAfterRenderBackup: Map<string, THREE.Object3D['onAfterRender']>;
}

/**
 * Section plane configuration
 */
export interface SectionConfig {
  enabled: boolean;
  helperSize: number;         // Size of plane helper visualization
  helperColor: number;        // Color of plane helper (hex)
  flipButtonColor: number;    // Color of flip button (hex)
  flipButtonHoverColor: number; // Hover color of flip button (hex)
  planeOpacity: number;       // Opacity of plane visualization
}

/**
 * Serializable section plane data
 */
export interface SectionPlaneData {
  id: string;
  normal: [number, number, number];
  constant: number;
  visible: boolean;
  enabled: boolean;
}

/**
 * Category colors for IFC elements (ColorSplash-compatible)
 */
export const CATEGORY_COLORS: Record<string, number> = {
  IFCWALL: 0xffeb3b,
  IFCWALLSTANDARDCASE: 0xffeb3b,
  IFCSLAB: 0x90caf9,
  IFCBEAM: 0xef5350,
  IFCCOLUMN: 0x66bb6a,
  IFCDOOR: 0xab47bc,
  IFCWINDOW: 0x4dd0e1,
  IFCSTAIR: 0xffa726,
  IFCSTAIRFLIGHT: 0xffa726,
  IFCRAILING: 0x8d6e63,
  IFCROOF: 0xec407a,
  IFCFURNISHINGELEMENT: 0x7e57c2,
  IFCPLATE: 0x5c6bc0,
  IFCMEMBER: 0x26a69a,
  IFCCURTAINWALL: 0x29b6f6,
  IFCFOOTING: 0x78909c,
  IFCPILE: 0x546e7a,
  IFCFLOWSEGMENT: 0x42a5f5,
  IFCFLOWTERMINAL: 0x66bb6a,
  IFCFLOWFITTING: 0x26c6da,
  IFCDISTRIBUTIONELEMENT: 0x9ccc65,
  IFCBUILDINGELEMENTPROXY: 0xbdbdbd,
  IFCSPACE: 0xe0e0e0,
  IFCOPENINGELEMENT: 0xfafafa,
};

/**
 * Default color for unknown IFC categories
 */
export const DEFAULT_CATEGORY_COLOR = 0x888888;

/**
 * Tone mapping modes
 */
export const TONE_MAPPING_MODES: Record<string, THREE.ToneMapping> = {
  'None': THREE.NoToneMapping,
  'Linear': THREE.LinearToneMapping,
  'Reinhard': THREE.ReinhardToneMapping,
  'Cineon': THREE.CineonToneMapping,
  'ACES': THREE.ACESFilmicToneMapping,
  'AgX': THREE.AgXToneMapping,
  'Neutral': THREE.NeutralToneMapping,
};

/**
 * Get tone mapping name from value
 */
export function getToneMappingName(toneMapping: THREE.ToneMapping): string {
  for (const [name, value] of Object.entries(TONE_MAPPING_MODES)) {
    if (value === toneMapping) return name;
  }
  return 'Unknown';
}

/**
 * Format large numbers with K/M suffixes
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
