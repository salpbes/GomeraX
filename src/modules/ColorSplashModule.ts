/**
 * ColorSplashModule - Colors IFC elements by their types
 * Works with multiple loaded models
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import type { WorldManager } from './WorldManager';

export class ColorSplashModule {
  private components: OBC.Components;
  private worldManager: WorldManager;
  private fragmentsManager: OBC.FragmentsManager;
  private highlighter: OBF.Highlighter | null = null;
  
  /**
   * Tracks whether color splash is currently active
   */
  private isActive: boolean = false;
  
  // Track which selections we created for each category
  private categorySelections: string[] = [];
  
  // Store category info for UI
  private categoryInfo: Map<string, { category: string; modelId: string; color: THREE.Color; count: number }> = new Map();
  
  // Callback for when colors are applied
  public onColorsApplied: ((
    categories: Array<{ name: string; color: string; selectionName: string; count: number }>,
    modelGroups: Map<string, Array<{ name: string; color: string; selectionName: string; count: number }>>
  ) => void) | null = null;

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
    this.fragmentsManager = this.components.get(OBC.FragmentsManager);

    console.log('✅ ColorSplashModule initialized');
  }

  /**
   * Toggle color splash on/off
   */
  async toggleColorSplash(): Promise<void> {
    if (this.isActive) {
      await this.restoreOriginalColors();
      this.isActive = false;
      console.log('✅ Color splash disabled');
    } else {
      await this.applyColorByType();
      this.isActive = true;
      console.log('✅ Color splash enabled');
    }
  }

  /**
   * Refresh/update color splash when models change (new model loaded, etc.)
   */
  async refreshColorSplash(): Promise<void> {
    if (this.isActive) {
      console.log('🔄 Refreshing color splash with updated models...');
      await this.applyColorByType();
    }
  }

  /**
   * Apply colors to elements based on their IFC types
   */
  private async applyColorByType(): Promise<void> {
    console.log('🎨 Applying color splash by IFC type...');

    // Clear previous selections
    this.categorySelections = [];
    this.categoryInfo.clear();

    // Initialize highlighter if needed
    if (!this.highlighter) {
      const world = this.worldManager.world;
      if (!world) {
        console.error('❌ World not available');
        return;
      }
      this.highlighter = this.components.get(OBF.Highlighter);
      await this.highlighter.setup({ world });
    }

    const categoryList: Array<{ name: string; color: string; selectionName: string; count: number }> = [];
    const modelGroups: Map<string, Array<{ name: string; color: string; selectionName: string; count: number }>> = new Map();

    for (const [modelId, model] of this.fragmentsManager.list) {
      try {
        console.log(`  Processing model: ${modelId}`);

        // Get all categories in the model
        const categories = await (model as any).getCategories();
        console.log(`  Found ${categories.length} categories`);

        // Filter to geometry categories only
        const geometryCategories = categories.filter((cat: string) => {
          return cat.match(/^IFC(WALL|BEAM|COLUMN|SLAB|DOOR|FURNISH|WINDOW|ROOF|STAIR|RAMP|RAILING|FOOTING|CURTAINWALL|PLATE|COVERING|DUCT|PIPE|CABLE|FITTING|SEGMENT|JUNCTION|FLOWSEGMENT|FLOWTERMINAL|FLOWCONTROLLER|FLOWFITTING|AIRTERM|OUTLET|VALVE|PUMP|FAN|DAMPER|SENSOR|CONTROLLER|ACTUATOR|ALARM|LIGHT|FIXTURE|EQUIPMENT|FLOWMETER|ENERGYCONVERSION|DISTRIB|HEATER|CHILLER|BOILER|COIL|HUMIDIFIER|EVAPORATOR|CONDENSER|TANK|FILTER|TRANSFORMER|MOTOR|SWITCH|PROTECTIVEDEVICE|JUNCTION|CABLE|TRAY|RACEWAY)/);
        });

        // Apply color to each category using Highlighter
        for (const category of geometryCategories) {
          const categoryRegex = new RegExp(`^${category}$`);
          const items = await (model as any).getItemsOfCategories([categoryRegex]);
          const categoryKey = Object.keys(items).find(key => key.includes(category));
          
          if (!categoryKey || !items[categoryKey] || items[categoryKey].length === 0) {
            continue;
          }

          const localIds = items[categoryKey];
          const color = this.getCategoryColor(category);

          // Create selection name unique to this model and category
          const selectionName = `color_${modelId}_${category}`;
          this.categorySelections.push(selectionName);

          // Store category info
          this.categoryInfo.set(selectionName, {
            category,
            modelId,
            color,
            count: localIds.length
          });

          // Create style for this selection
          this.highlighter.styles.set(selectionName, {
            color: color,
            opacity: 1.0,
            transparent: false,
            renderedFaces: 1 // TWO sides
          });

          // Create ModelIdMap for highlighter  
          const selection: { [key: string]: Set<number> } = {
            [modelId]: new Set(localIds)
          };

          // Highlight with this selection (creates persistent coloring)
          await this.highlighter.highlightByID(selectionName, selection, false);

          // Add to category list for UI
          const categoryData = {
            name: category,
            color: '#' + color.getHexString(),
            selectionName,
            count: localIds.length
          };
          
          categoryList.push(categoryData);
          
          // Group by model
          if (!modelGroups.has(modelId)) {
            modelGroups.set(modelId, []);
          }
          modelGroups.get(modelId)!.push(categoryData);

          console.log(`  ✅ Colored ${localIds.length} ${category} items`);
        }

      } catch (error) {
        console.error(`❌ Error processing model ${modelId}:`, error);
      }
    }

    console.log('✅ Color splash applied to all models');
    
    // Notify UI with grouped data
    if (this.onColorsApplied) {
      this.onColorsApplied(categoryList, modelGroups);
    }
  }

  /**
   * Restore original colors
   */
  private async restoreOriginalColors(): Promise<void> {
    console.log('🔄 Restoring original colors...');

    if (!this.highlighter) {
      console.warn('⚠️ No highlighter available');
      return;
    }

    // Clear all category selections
    for (const selectionName of this.categorySelections) {
      try {
        this.highlighter.clear(selectionName);
      } catch (error) {
        console.warn(`⚠️ Could not clear selection ${selectionName}:`, error);
      }
    }

    this.categorySelections = [];
    console.log('✅ Original colors restored');
  }

  /**
   * Update the color of a specific category
   */
  async updateCategoryColor(selectionName: string, newColor: string): Promise<void> {
    if (!this.highlighter || !this.isActive) {
      console.warn('⚠️ Color splash not active');
      return;
    }

    const info = this.categoryInfo.get(selectionName);
    if (!info) {
      console.warn(`⚠️ Category ${selectionName} not found`);
      return;
    }

    // Parse the new color
    const color = new THREE.Color(newColor);
    
    // Update stored color
    info.color = color;

    // Update the style
    this.highlighter.styles.set(selectionName, {
      color: color,
      opacity: 1.0,
      transparent: false,
      renderedFaces: 1
    });

    // Re-apply the highlight to refresh the color
    const model = this.fragmentsManager.list.get(info.modelId);
    if (model) {
      const categoryRegex = new RegExp(`^${info.category}$`);
      const items = await (model as any).getItemsOfCategories([categoryRegex]);
      const categoryKey = Object.keys(items).find(key => key.includes(info.category));
      
      if (categoryKey && items[categoryKey]) {
        const localIds = items[categoryKey];
        const selection: { [key: string]: Set<number> } = {
          [info.modelId]: new Set(localIds)
        };
        
        await this.highlighter.highlightByID(selectionName, selection, false);
        console.log(`✅ Updated color for ${info.category} to ${newColor}`);
      }
    }
  }

  /**
   * Get all categories info
   */
  getCategoriesInfo(): Array<{ name: string; color: string; selectionName: string; count: number }> {
    const result: Array<{ name: string; color: string; selectionName: string; count: number }> = [];
    
    for (const [selectionName, info] of this.categoryInfo) {
      result.push({
        name: info.category,
        color: '#' + info.color.getHexString(),
        selectionName,
        count: info.count
      });
    }
    
    return result;
  }

  /**
   * Get element IDs for a specific category selection
   * Returns a map of modelId -> Set of localIds
   */
  async getCategoryElements(selectionName: string): Promise<{ [key: string]: Set<number> } | null> {
    const info = this.categoryInfo.get(selectionName);
    if (!info) {
      console.warn(`⚠️ Category ${selectionName} not found`);
      return null;
    }

    const model = this.fragmentsManager.list.get(info.modelId);
    if (!model) {
      console.warn(`⚠️ Model ${info.modelId} not found`);
      return null;
    }

    try {
      const categoryRegex = new RegExp(`^${info.category}$`);
      const items = await (model as any).getItemsOfCategories([categoryRegex]);
      const categoryKey = Object.keys(items).find(key => key.includes(info.category));
      
      if (!categoryKey || !items[categoryKey]) {
        return null;
      }

      const localIds = items[categoryKey];
      return {
        [info.modelId]: new Set(localIds)
      };
    } catch (error) {
      console.error(`❌ Error getting elements for ${selectionName}:`, error);
      return null;
    }
  }

  /**
   * Get current category colors as a Map<categoryName, THREE.Color>
   * Used by ClusterModule to apply custom colors in cluster view
   */
  getCategoryColors(): Map<string, THREE.Color> {
    const colorMap = new Map<string, THREE.Color>();
    
    for (const [, info] of this.categoryInfo) {
      colorMap.set(info.category, info.color);
    }
    
    return colorMap;
  }

  /**
   * Get color for IFC category
   */
  private getCategoryColor(category: string): THREE.Color {
    const colors: { [key: string]: number } = {
      // Architectural
      'IFCWALL': 0xf5deb3,  // Wheat/tan color for walls
      'IFCWALLSTANDARDCASE': 0xe6c89c,  // Lighter tan
      'IFCSLAB': 0xa0a0a0,  // Concrete gray for slabs
      'IFCBEAM': 0xff6b6b,
      'IFCCOLUMN': 0x4ecdc4,
      'IFCDOOR': 0x8b4513,
      'IFCWINDOW': 0x87ceeb,
      'IFCROOF': 0x8b0000,
      'IFCSTAIR': 0xffd700,
      'IFCSTAIRFLIGHT': 0xffaa00,
      'IFCRAILING': 0xc0c0c0,
      'IFCFURNISHINGELEMENT': 0x9b59b6,
      'IFCFOOTING': 0x654321,
      'IFCRAMP': 0xff9900,
      'IFCRAMPFLIGHT': 0xff7700,
      // MEP - HVAC (Blue tones)
      'IFCDUCTFITTING': 0x4169e1,
      'IFCDUCTSEGMENT': 0x6495ed,
      'IFCDUCT': 0x4682b4,
      'IFCAIRTERM': 0x87ceeb,
      'IFCAIRTERMINAL': 0x87ceeb,
      'IFCDAMPER': 0x5f9ea0,
      'IFCFAN': 0x00ced1,
      'IFCCOIL': 0x4169e1,
      'IFCCHILLER': 0x1e90ff,
      'IFCBOILER': 0xff4500,
      'IFCHEATER': 0xff6347,
      // MEP - Piping (Green/Cyan tones)
      'IFCPIPEFITTING': 0x20b2aa,
      'IFCPIPESEGMENT': 0x3cb371,
      'IFCPIPE': 0x2e8b57,
      'IFCVALVE': 0x00fa9a,
      'IFCPUMP': 0x40e0d0,
      'IFCFLOWMETER': 0x48d1cc,
      'IFCFILTER': 0x00ff7f,
      'IFCTANK': 0x5f9ea0,
      // MEP - Electrical (Yellow/Orange tones)
      'IFCCABLEFITTING': 0xffa500,
      'IFCCABLESEGMENT': 0xff8c00,
      'IFCCABLE': 0xffd700,
      'IFCCABLECARRIERFITTING': 0xffb90f,
      'IFCCABLECARRIERSEGMENT': 0xdaa520,
      'IFCCABLETRAY': 0xf0e68c,
      'IFCRACEWAY': 0xeee8aa,
      'IFCLIGHTFIXTURE': 0xffff00,
      'IFCLIGHT': 0xffffe0,
      'IFCOUTLET': 0xffa500,
      'IFCSWITCH': 0xff8c00,
      'IFCTRANSFORMER': 0xff4500,
      'IFCMOTOR': 0xdb7093,
      'IFCPROTECTIVEDEVICE': 0xff6347,
      'IFCJUNCTIONBOX': 0xcd853f,
      // MEP - Controls (Purple/Pink tones)
      'IFCSENSOR': 0xda70d6,
      'IFCCONTROLLER': 0xba55d3,
      'IFCACTUATOR': 0x9370db,
      'IFCALARM': 0xff1493,
      // MEP - General Equipment
      'IFCEQUIPMENT': 0x808080,
      'IFCFLOWFITTING': 0x696969,
      'IFCFLOWSEGMENT': 0x778899,
      'IFCFLOWTERMINAL': 0x708090,
      'IFCFLOWCONTROLLER': 0x2f4f4f,
      'IFCDISTRIBUTIONELEMENT': 0x696969,
    };
    
    const colorHex = colors[category] || 0x808080;
    return new THREE.Color(colorHex);
  }

  /**
   * Check if color splash is currently active
   */
  isColorSplashActive(): boolean {
    return this.isActive;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.isActive) {
      this.restoreOriginalColors();
    }
    this.categorySelections = [];
  }
}
