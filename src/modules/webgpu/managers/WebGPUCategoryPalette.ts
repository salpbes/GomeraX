/**
 * WebGPU Category Palette
 * 
 * Centralized color palette for IFC categories used in WebGPU rendering.
 * This provides consistent category coloring across Color Splash mode
 * and category-based material assignments.
 * 
 * Extracted from WebGPURendererModule for better maintainability.
 */

import * as THREE from 'three';

/**
 * IFC Category color palette mapping
 * Colors are defined as hex values for easy reference
 */
export const IFC_CATEGORY_COLORS: Record<string, number> = {
  // Architectural Elements
  'IFCWALL': 0xFFE066,
  'IFCWALLSTANDARDCASE': 0xFFD700,
  'IFCSLAB': 0xB0B0B0,
  'IFCBEAM': 0xFF3366,
  'IFCCOLUMN': 0x00D9FF,
  'IFCDOOR': 0x8B4513,
  'IFCWINDOW': 0x00BFFF,
  'IFCROOF': 0xDC143C,
  'IFCSTAIR': 0xFF6F00,
  'IFCSTAIRFLIGHT': 0xFF8C00,
  'IFCRAILING': 0xE0E0E0,
  'IFCFURNISHINGELEMENT': 0xAB47BC,
  'IFCFOOTING': 0x795548,
  'IFCRAMP': 0xFFA726,
  'IFCRAMPFLIGHT': 0xFF9800,
  'IFCCURTAINWALL': 0x26C6DA,
  'IFCPLATE': 0x90CAF9,
  'IFCCOVERING': 0xFFAB91,

  // HVAC (Heating, Ventilation, Air Conditioning)
  'IFCDUCTFITTING': 0x2196F3,
  'IFCDUCTSEGMENT': 0x42A5F5,
  'IFCDUCT': 0x1976D2,
  'IFCAIRTERM': 0x03A9F4,
  'IFCAIRTERMINAL': 0x00B0FF,
  'IFCDAMPER': 0x0288D1,
  'IFCFAN': 0x00E5FF,
  'IFCCOIL': 0x2979FF,
  'IFCCHILLER': 0x00C853,
  'IFCBOILER': 0xFF5722,
  'IFCHEATER': 0xFF6E40,
  'IFCHUMIDIFIER': 0x26C6DA,

  // Plumbing
  'IFCPIPEFITTING': 0x00E676,
  'IFCPIPESEGMENT': 0x4CAF50,
  'IFCPIPE': 0x2E7D32,
  'IFCVALVE': 0x00FF00,
  'IFCPUMP': 0x1DE9B6,
  'IFCFLOWMETER': 0x00BFA5,
  'IFCFILTER': 0x64DD17,
  'IFCTANK': 0x00897B,

  // Electrical
  'IFCCABLEFITTING': 0xFFAB00,
  'IFCCABLESEGMENT': 0xFF9100,
  'IFCCABLE': 0xFFD600,
  'IFCCABLECARRIERFITTING': 0xFFEA00,
  'IFCCABLECARRIERSEGMENT': 0xFFC107,
  'IFCCABLETRAY': 0xFFB300,
  'IFCRACEWAY': 0xFFD54F,
  'IFCLIGHTFIXTURE': 0xFFFF00,
  'IFCLIGHT': 0xFFFF8D,
  'IFCOUTLET': 0xFF6F00,
  'IFCSWITCH': 0xFF9800,
  'IFCTRANSFORMER': 0xF57C00,
  'IFCMOTOR': 0xFF4081,
  'IFCPROTECTIVEDEVICE': 0xE91E63,
  'IFCJUNCTIONBOX': 0xFFB74D,

  // Controls / Automation
  'IFCSENSOR': 0xE040FB,
  'IFCCONTROLLER': 0xAB47BC,
  'IFCACTUATOR': 0x9C27B0,
  'IFCALARM': 0xFF1744,

  // Generic MEP
  'IFCEQUIPMENT': 0x9E9E9E,
  'IFCFLOWFITTING': 0x757575,
  'IFCFLOWSEGMENT': 0xBDBDBD,
  'IFCFLOWTERMINAL': 0x78909C,
  'IFCFLOWCONTROLLER': 0x546E7A,
  'IFCDISTRIBUTIONELEMENT': 0x90A4AE,

  // Spaces & Structure
  'IFCSPACE': 0xE3F2FD,
  'IFCSITE': 0x8D6E63,
  'IFCBUILDING': 0xBCAAA4,
  'IFCBUILDINGSTOREY': 0xD7CCC8,
};

/**
 * Default fallback color when category is not found
 */
export const DEFAULT_CATEGORY_COLOR = 0x9E9E9E;

/**
 * Get the color for an IFC category
 * @param category The IFC category name (e.g., 'IFCWALL')
 * @returns Hex color value
 */
export function getCategoryColor(category: string): number {
  return IFC_CATEGORY_COLORS[category.toUpperCase()] ?? DEFAULT_CATEGORY_COLOR;
}

/**
 * Get the color for an IFC category as a THREE.Color
 * @param category The IFC category name
 * @returns THREE.Color instance
 */
export function getCategoryColorAsThree(category: string): THREE.Color {
  return new THREE.Color(getCategoryColor(category));
}

/**
 * Material cache for category materials to avoid duplicates
 */
const categoryMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Get or create a MeshStandardMaterial for a category
 * Materials are cached to avoid creating duplicates
 * 
 * @param category The IFC category name
 * @returns MeshStandardMaterial with the category color
 */
export function getOrCreateCategoryMaterial(category: string): THREE.MeshStandardMaterial {
  const cached = categoryMaterialCache.get(category);
  if (cached) return cached;

  const colorHex = getCategoryColor(category);
  const color = new THREE.Color(colorHex);

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    opacity: 1,
    transparent: false,
    side: THREE.DoubleSide,
  });
  
  categoryMaterialCache.set(category, mat);
  return mat;
}

/**
 * Clear the material cache (useful when disposing)
 */
export function clearCategoryMaterialCache(): void {
  for (const mat of categoryMaterialCache.values()) {
    mat.dispose();
  }
  categoryMaterialCache.clear();
}

/**
 * Get all available IFC categories
 * @returns Array of category names
 */
export function getAllCategories(): string[] {
  return Object.keys(IFC_CATEGORY_COLORS);
}
