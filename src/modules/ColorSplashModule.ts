/**
 * ColorSplashModule - Colors IFC elements by their types
 * Works with multiple loaded models
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import type { WorldManager } from './WorldManager';
import { PropertyTableModule } from './PropertyTableModule';

export class ColorSplashModule {
  private components: OBC.Components;
  private worldManager: WorldManager;
  private fragmentsManager: OBC.FragmentsManager;
  private highlighter: OBF.Highlighter | null = null;
  private propertyTable: PropertyTableModule;
  
  /**
   * Tracks whether color splash is currently active
   */
  private isActive: boolean = false;
  
  // Track which selections we created for each category
  private categorySelections: string[] = [];
  
  // Store category info for UI
  private categoryInfo: Map<string, { category: string; modelId: string; color: THREE.Color; count: number }> = new Map();
  
  // Cache for category items to avoid re-querying the model
  private _categoryCache: Map<string, Array<{ category: string, itemIds: number[] }>> = new Map();

  // Callback for when colors are applied
  public onColorsApplied: ((
    categories: Array<{ name: string; color: string; selectionName: string; count: number }>,
    modelGroups: Map<string, Array<{ name: string; color: string; selectionName: string; count: number }>>
  ) => void) | null = null;
  
  // Callback for when cluster view is shown (to display property table)
  public onClusterViewShown: ((elementsByCategory: Map<string, { [key: string]: Set<number> }>) => void) | null = null;
  
  // Callback for when cluster view is exited (to hide property table)
  public onClusterViewExited: (() => void) | null = null;

  // Callbacks for loading state
  public onLoadingStart: (() => void) | null = null;
  public onLoadingEnd: (() => void) | null = null;

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
    this.fragmentsManager = this.components.get(OBC.FragmentsManager);
    this.propertyTable = new PropertyTableModule(worldManager);

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
    // Clear cache since models have changed
    this._categoryCache.clear();
    
    if (this.isActive) {
      console.log('🔄 Refreshing color splash with updated models...');
      await this.applyColorByType();
    }
  }

  /**
   * Apply colors to elements based on their IFC types
   */
  private async applyColorByType(): Promise<void> {
    if (this.onLoadingStart) this.onLoadingStart();
    
    // Small delay to allow UI to update
    await new Promise(resolve => setTimeout(resolve, 100));

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

        let modelCategories: Array<{ category: string, itemIds: number[] }> = [];

        // Check cache first
        if (this._categoryCache.has(modelId)) {
          console.log(`  ⚡ Using cached category data for ${modelId}`);
          modelCategories = this._categoryCache.get(modelId)!;
        } else {
          // Not in cache, query the model
          // Get all categories in the model
          const categories = await (model as any).getCategories();
          console.log(`  Found ${categories.length} categories`);

          // Filter to geometry categories only
          const geometryCategories = categories.filter((cat: string) => {
            return cat.match(/^IFC(WALL|BEAM|COLUMN|SLAB|DOOR|FURNISH|WINDOW|ROOF|STAIR|RAMP|RAILING|FOOTING|CURTAINWALL|PLATE|COVERING|DUCT|PIPE|CABLE|FITTING|SEGMENT|JUNCTION|FLOWSEGMENT|FLOWTERMINAL|FLOWCONTROLLER|FLOWFITTING|AIRTERM|OUTLET|VALVE|PUMP|FAN|DAMPER|SENSOR|CONTROLLER|ACTUATOR|ALARM|LIGHT|FIXTURE|EQUIPMENT|FLOWMETER|ENERGYCONVERSION|DISTRIB|HEATER|CHILLER|BOILER|COIL|HUMIDIFIER|EVAPORATOR|CONDENSER|TANK|FILTER|TRANSFORMER|MOTOR|SWITCH|PROTECTIVEDEVICE|JUNCTION|CABLE|TRAY|RACEWAY)/);
          });

          // Query items for each category
          for (const category of geometryCategories) {
            const categoryRegex = new RegExp(`^${category}$`);
            const items = await (model as any).getItemsOfCategories([categoryRegex]);
            const categoryKey = Object.keys(items).find(key => key.includes(category));
            
            if (!categoryKey || !items[categoryKey] || items[categoryKey].length === 0) {
              continue;
            }

            modelCategories.push({
              category,
              itemIds: items[categoryKey]
            });
          }
          
          // Store in cache
          this._categoryCache.set(modelId, modelCategories);
        }

        // Apply color to each category using Highlighter
        for (const { category, itemIds } of modelCategories) {
          const localIds = itemIds;
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
        }
        
        console.log(`  ✅ Colored ${modelCategories.length} categories for model ${modelId}`);

      } catch (error) {
        console.error(`❌ Error processing model ${modelId}:`, error);
      }
    }

    console.log('✅ Color splash applied to all models');
    
    // Notify UI with grouped data
    if (this.onColorsApplied) {
      this.onColorsApplied(categoryList, modelGroups);
    }

    if (this.onLoadingEnd) this.onLoadingEnd();
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
   * Get color for IFC category - vibrant and highly discriminative colors
   */
  private getCategoryColor(category: string): THREE.Color {
    const colors: { [key: string]: number } = {
      // Architectural - Vibrant distinct colors
      'IFCWALL': 0xFFE066,  // Bright yellow for walls
      'IFCWALLSTANDARDCASE': 0xFFD700,  // Gold
      'IFCSLAB': 0xB0B0B0,  // Light gray for slabs
      'IFCBEAM': 0xFF3366,  // Bright red-pink
      'IFCCOLUMN': 0x00D9FF,  // Bright cyan
      'IFCDOOR': 0x8B4513,  // Saddle brown
      'IFCWINDOW': 0x00BFFF,  // Deep sky blue
      'IFCROOF': 0xDC143C,  // Crimson red
      'IFCSTAIR': 0xFF6F00,  // Vivid orange
      'IFCSTAIRFLIGHT': 0xFF8C00,  // Dark orange
      'IFCRAILING': 0xE0E0E0,  // Light gray
      'IFCFURNISHINGELEMENT': 0xAB47BC,  // Bright purple
      'IFCFOOTING': 0x795548,  // Brown
      'IFCRAMP': 0xFFA726,  // Bright orange
      'IFCRAMPFLIGHT': 0xFF9800,  // Orange
      'IFCCURTAINWALL': 0x26C6DA,  // Bright light blue
      'IFCPLATE': 0x90CAF9,  // Light blue
      'IFCCOVERING': 0xFFAB91,  // Light orange
      
      // MEP - HVAC (Vibrant blue spectrum)
      'IFCDUCTFITTING': 0x2196F3,  // Bright blue
      'IFCDUCTSEGMENT': 0x42A5F5,  // Light bright blue
      'IFCDUCT': 0x1976D2,  // Dark blue
      'IFCAIRTERM': 0x03A9F4,  // Light blue
      'IFCAIRTERMINAL': 0x00B0FF,  // Bright light blue
      'IFCDAMPER': 0x0288D1,  // Medium blue
      'IFCFAN': 0x00E5FF,  // Cyan bright
      'IFCCOIL': 0x2979FF,  // Bright blue
      'IFCCHILLER': 0x00C853,  // Bright green
      'IFCBOILER': 0xFF5722,  // Deep orange/red
      'IFCHEATER': 0xFF6E40,  // Bright orange
      'IFCHUMIDIFIER': 0x26C6DA,  // Light cyan
      
      // MEP - Piping (Vibrant green spectrum)
      'IFCPIPEFITTING': 0x00E676,  // Bright green
      'IFCPIPESEGMENT': 0x4CAF50,  // Green
      'IFCPIPE': 0x2E7D32,  // Dark green
      'IFCVALVE': 0x00FF00,  // Lime green
      'IFCPUMP': 0x1DE9B6,  // Bright teal
      'IFCFLOWMETER': 0x00BFA5,  // Teal
      'IFCFILTER': 0x64DD17,  // Light green
      'IFCTANK': 0x00897B,  // Dark teal
      
      // MEP - Electrical (Vibrant yellow/orange spectrum)
      'IFCCABLEFITTING': 0xFFAB00,  // Amber
      'IFCCABLESEGMENT': 0xFF9100,  // Deep orange
      'IFCCABLE': 0xFFD600,  // Bright yellow
      'IFCCABLECARRIERFITTING': 0xFFEA00,  // Yellow
      'IFCCABLECARRIERSEGMENT': 0xFFC107,  // Amber
      'IFCCABLETRAY': 0xFFB300,  // Amber orange
      'IFCRACEWAY': 0xFFD54F,  // Light amber
      'IFCLIGHTFIXTURE': 0xFFFF00,  // Pure yellow
      'IFCLIGHT': 0xFFFF8D,  // Light yellow
      'IFCOUTLET': 0xFF6F00,  // Orange
      'IFCSWITCH': 0xFF9800,  // Orange
      'IFCTRANSFORMER': 0xF57C00,  // Dark orange
      'IFCMOTOR': 0xFF4081,  // Pink
      'IFCPROTECTIVEDEVICE': 0xE91E63,  // Pink red
      'IFCJUNCTIONBOX': 0xFFB74D,  // Light orange
      
      // MEP - Controls (Vibrant purple/magenta spectrum)
      'IFCSENSOR': 0xE040FB,  // Bright purple
      'IFCCONTROLLER': 0xAB47BC,  // Purple
      'IFCACTUATOR': 0x9C27B0,  // Deep purple
      'IFCALARM': 0xFF1744,  // Bright red
      
      // MEP - General Equipment (Distinct grays and mixed)
      'IFCEQUIPMENT': 0x9E9E9E,  // Gray
      'IFCFLOWFITTING': 0x757575,  // Dark gray
      'IFCFLOWSEGMENT': 0xBDBDBD,  // Light gray
      'IFCFLOWTERMINAL': 0x78909C,  // Blue gray
      'IFCFLOWCONTROLLER': 0x546E7A,  // Dark blue gray
      'IFCDISTRIBUTIONELEMENT': 0x90A4AE,  // Blue gray light
      
      // Additional architectural elements
      'IFCSPACE': 0xE3F2FD,  // Very light blue (transparent-ish)
      'IFCSITE': 0x8D6E63,  // Brown gray
      'IFCBUILDING': 0xBCAAA4,  // Light brown gray
      'IFCBUILDINGSTOREY': 0xD7CCC8,  // Very light brown
    };
    
    const colorHex = colors[category] || 0x9E9E9E;  // Medium gray default
    return new THREE.Color(colorHex);
  }

  /**
   * Check if color splash is currently active
   */
  isColorSplashActive(): boolean {
    return this.isActive;
  }

  /**
   * Show property table with visible elements in cluster view
   */
  public async showPropertyTable(elementsByCategory: Map<string, { [key: string]: Set<number> }>, clusterScene?: THREE.Group | null): Promise<void> {
    // Set cluster scene for filtering if provided
    if (clusterScene) {
      this.propertyTable.setClusterScene(clusterScene);
    }
    await this.propertyTable.showTable(elementsByCategory);
  }

  /**
   * Hide property table
   */
  public hidePropertyTable(): void {
    this.propertyTable.hideTable();
  }

  /**
   * Get property table module (for direct access if needed)
   */
  public getPropertyTable(): PropertyTableModule {
    return this.propertyTable;
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
