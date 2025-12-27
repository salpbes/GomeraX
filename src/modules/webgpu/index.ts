/**
 * WebGPU Module Index (The "WebGPU Gateway")
 * 
 * Re-exports all WebGPU-related modules for easy importing
 */

// Core renderer
export { WebGPURendererModule, type RendererMode, type WebGPUStatus } from './WebGPURendererModule';
export { ViewerWebGPUAPI } from './ViewerWebGPUAPI';

// Core managers
export { 
  WebGPUShadowManager, 
  WebGPUEdgeManager, 
  WebGPUFog, 
  type FogSettings, 
  type FogType, 
  WebGPULODManager, 
  type LODSettings, 
  type LODStats, 
  WebGPUOutlineManager, 
  type SelectionInfo,
  WebGPUColorPicker,
  type PickingResult,
  type ElementInfo,
  WebGPUElementSelector,
  type ElementSelectionInfo,
  WebGPUOptimizations,
  WebGPUStatsOverlay,
  type StatsOverlayConfig
} from './managers';
// NOTE: WebGPUAmbientOcclusion removed - see WebGPUAmbientOcclusion.ts for explanation
// WebGPUSectionManager removed - sectioning not supported in WebGPU mode

// Utilities
export { WebGPUMaterialFactory } from './managers';
export * from './managers/WebGPUGeometryUtils';

// Types
export * from './managers/WebGPUTypes';
