/**
 * WebGPU Managers (The "WebGPU Project Team")
 * 
 * This module exports all WebGPU sub-managers that were extracted from
 * the main WebGPURendererModule for better maintainability.
 */

// Category colors and palette
export { 
  WebGPUCategoryPalette,
  IFC_CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  getCategoryColor,
  getCategoryColorAsThree,
  getOrCreateCategoryMaterial,
  clearCategoryMaterialCache,
  getAllCategories 
} from './WebGPUCategoryPalette';

// Material factory
export { 
  WebGPUMaterialFactory,
  getMaterialFactory,
  disposeMaterialFactory,
  type MaterialDefinition,
  type RawMaterialData
} from './WebGPUMaterialFactory';

// Stats overlay
export { 
  WebGPUStatsManager,
  type StatsConfig 
} from './WebGPUStatsManager';

// Proxy scene builder
export { WebGPUProxySceneBuilder } from './WebGPUProxySceneBuilder';

// Shadow manager
export { WebGPUShadowManager } from './WebGPUShadowManager';

// Edge manager
export { WebGPUEdgeManager } from './WebGPUEdgeManager';

// LOD manager
export { 
  WebGPULODManager,
  type LODSettings,
  type LODStats 
} from './WebGPULODManager';

// Fog manager
export { 
  WebGPUFog,
  type FogSettings,
  type FogType 
} from './WebGPUFog';

// Outline manager
export { 
  WebGPUOutlineManager,
  type SelectionInfo 
} from './WebGPUOutlineManager';

// Color picker
export { 
  WebGPUColorPicker,
  type PickingResult,
  type ElementInfo 
} from './WebGPUColorPicker';

// Element selector
export { 
  WebGPUElementSelector,
  type ElementSelectionInfo 
} from './WebGPUElementSelector';

// Optimizations
export { WebGPUOptimizations } from './WebGPUOptimizations';

// Stats overlay UI
export { 
  WebGPUStatsOverlay,
  type StatsOverlayConfig 
} from './WebGPUStatsOverlay';

// Geometry utilities
export * from './WebGPUGeometryUtils';

// Types
export * from './WebGPUTypes';
