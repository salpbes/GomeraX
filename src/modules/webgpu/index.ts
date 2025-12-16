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
// WebGPUSectionManager removed - sectioning not supported in WebGPU mode

// Utilities
export { WebGPUMaterialFactory } from './WebGPUMaterialFactory';
export * from './WebGPUGeometryUtils';

// Types
export * from './WebGPUTypes';
