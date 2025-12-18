/**
 * WebGPU Module Index
 * Re-exports all WebGPU-related modules for easy importing
 */

// Core managers
export { WebGPUShadowManager } from './WebGPUShadowManager';
export { WebGPUEdgeManager } from './WebGPUEdgeManager';
export { WebGPUStatsOverlay, type StatsOverlayConfig } from './WebGPUStatsOverlay';
export { WebGPUOptimizations } from './WebGPUOptimizations';
export { WebGPUOutlineManager, type OutlineSettings, type SelectionInfo } from './WebGPUOutlineManager';
export { WebGPUColorPicker, type PickingResult, type ElementInfo } from './WebGPUColorPicker';
export { WebGPUElementSelector, type ElementSelectionInfo } from './WebGPUElementSelector';
export { WebGPUFog, type FogSettings, type FogType } from './WebGPUFog';
export { WebGPULODManager, type LODSettings, type LODStats } from './WebGPULODManager';
// NOTE: WebGPUAmbientOcclusion removed - see WebGPUAmbientOcclusion.ts for explanation
// WebGPUSectionManager removed - sectioning not supported in WebGPU mode

// Utilities
export { WebGPUMaterialFactory } from './WebGPUMaterialFactory';
export * from './WebGPUGeometryUtils';

// Types
export * from './WebGPUTypes';
