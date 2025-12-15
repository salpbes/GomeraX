/**
 * WebGPU Module Index
 * Re-exports all WebGPU-related modules for easy importing
 */

// Core managers
export { WebGPUShadowManager } from './WebGPUShadowManager';
export { WebGPUEdgeManager } from './WebGPUEdgeManager';
export { WebGPUStatsOverlay, type StatsOverlayConfig } from './WebGPUStatsOverlay';
export { WebGPUOptimizations } from './WebGPUOptimizations';

// Utilities
export { WebGPUMaterialFactory } from './WebGPUMaterialFactory';
export * from './WebGPUGeometryUtils';

// Types
export * from './WebGPUTypes';
