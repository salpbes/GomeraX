/**
 * WebGPU Managers
 * 
 * This module exports all WebGPU sub-managers that were extracted from
 * the main WebGPURendererModule for better maintainability.
 */

// Category colors and palette
export { 
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
