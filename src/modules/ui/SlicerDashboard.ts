/**
 * SlicerDashboard - Interactive Power BI-style Slicer Tool
 * Provides visual slicers/filters that interact with 3D model and property table
 * Users can create custom dashboards with multiple slicer types
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import { Chart, DoughnutController, ArcElement, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale, PieController } from 'chart.js';

// Slicer configuration types
export interface SlicerConfig {
  id: string;
  title: string;
  type: 'dropdown' | 'checkbox' | 'range' | 'chart-pie' | 'chart-bar' | 'search' | 'tile';
  property: string; // Property name to filter on
  multiSelect?: boolean;
  showCounts?: boolean;
  collapsed?: boolean;
}

export interface SlicerState {
  id: string;
  selectedValues: Set<string>;
  rangeMin?: number;
  rangeMax?: number;
  searchText?: string;
}

export interface PropertyData {
  expressID: number;
  modelId: string;
  [key: string]: any;
}

export class SlicerDashboard {
  private components: OBC.Components | null = null;
  private fragmentsManager: OBC.FragmentsManager | null = null;
  private highlighter: OBF.Highlighter | null = null;
  
  private dashboardElement: HTMLDivElement | null = null;
  private slicerConfigs: SlicerConfig[] = [];
  private slicerStates: Map<string, SlicerState> = new Map();
  private propertyData: PropertyData[] = [];
  private filteredData: PropertyData[] = [];
  private charts: Map<string, Chart> = new Map();
  
  // Multi-model support: lookup table for composite keys
  private modelElementMap: Map<string, { modelId: string, expressID: number }> = new Map();
  
  // Colors for charts and highlighting
  private chartColors = [
    '#4a90e2', '#e91e63', '#4caf50', '#ff9800', '#9c27b0',
    '#00bcd4', '#ff5722', '#607d8b', '#8bc34a', '#ffc107',
    '#3f51b5', '#f44336', '#009688', '#ffeb3b', '#795548',
    '#673ab7', '#e91e63', '#2196f3', '#cddc39', '#607d8b'
  ];
  private typeColorMap: Map<string, string> = new Map();
  private activeHighlightStyles: Set<string> = new Set();
  
  // Callbacks
  private onFilterChange: ((filteredIds: Map<string, Set<number>>) => void) | null = null;
  private onElementSelect: ((expressId: number, modelId: string) => void) | null = null;

  constructor() {
    // Register Chart.js components
    Chart.register(DoughnutController, ArcElement, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale, PieController);
    
    console.log('✅ SlicerDashboard initialized');
  }

  /**
   * Set callback for filter changes
   */
  public setOnFilterChange(callback: (filteredIds: Map<string, Set<number>>) => void): void {
    this.onFilterChange = callback;
  }

  /**
   * Set callback for element selection
   */
  public setOnElementSelect(callback: (expressId: number, modelId: string) => void): void {
    this.onElementSelect = callback;
  }

  // Store the primary model ID for highlighting
  private primaryModelId: string = 'default';

  /**
   * Get consistent color for a type
   */
  private getTypeColor(type: string): string {
    if (!this.typeColorMap.has(type)) {
      // Assign next available color
      const index = this.typeColorMap.size % this.chartColors.length;
      this.typeColorMap.set(type, this.chartColors[index]);
    }
    return this.typeColorMap.get(type)!;
  }

  /**
   * Show the slicer dashboard with collected data - creates split screen layout
   * Now supports multiple models with composite keys (modelId:expressID)
   */
  public async show(
    slicerData: {
      categories: Map<string, Set<string>>; // Changed to Set<string> for "modelId:expressID" composite keys
      properties: Map<string, Map<string, Set<string>>>;
      numericProperties: Map<string, { min: number; max: number; values: Map<number, Set<string>> }>;
      modelElementMap?: Map<string, { modelId: string, expressID: number }>; // Lookup table
    },
    components: OBC.Components,
    modelId?: string
  ): Promise<void> {
    this.close();
    
    // Store components reference
    this.components = components;
    this.fragmentsManager = components.get(OBC.FragmentsManager);
    this.primaryModelId = modelId || 'default';
    
    // Store the model element lookup map
    this.modelElementMap = slicerData.modelElementMap || new Map();
    
    try {
      this.highlighter = components.get(OBF.Highlighter);
    } catch (e) {
      console.warn('Highlighter not available');
    }
    
    // Convert the map-based data to PropertyData array format
    this.propertyData = this.convertSlicerDataToPropertyData(slicerData);
    this.filteredData = [...this.propertyData];
    
    // Auto-generate slicers from the data
    this.slicerConfigs = this.autoGenerateSlicersFromData(slicerData);
    
    // Initialize slicer states
    this.slicerConfigs.forEach(config => {
      this.slicerStates.set(config.id, {
        id: config.id,
        selectedValues: new Set(),
        searchText: ''
      });
    });
    
    // Apply split-screen layout - shrink 3D view to left half
    this.applySplitScreenLayout();
    
    // Create dashboard UI on right side
    this.dashboardElement = this.createDashboardUI();
    document.body.appendChild(this.dashboardElement);
    
    console.log(`📊 Slicer dashboard opened with ${this.slicerConfigs.length} slicers, modelId: ${this.primaryModelId}`);
    console.log(`📊 Property data has ${this.propertyData.length} items from ${this.fragmentsManager?.list.size || 0} models`);
    if (this.propertyData.length > 0) {
      console.log(`📊 Sample property data:`, this.propertyData[0]);
    }
  }

  /**
   * Apply split-screen layout - 3D view on left, slicers on right
   */
  private applySplitScreenLayout(): void {
    // Find the main 3D canvas container
    const canvas = document.querySelector('canvas');
    const canvasContainer = canvas?.parentElement;
    
    if (canvasContainer) {
      canvasContainer.style.transition = 'width 0.3s ease';
      canvasContainer.style.width = '50%';
      canvasContainer.style.position = 'absolute';
      canvasContainer.style.left = '0';
    }
    
    // Center the toolbar within the left 50% (3D view area)
    // The .bottom-toolbar is the wrapper that controls positioning
    const bottomToolbar = document.querySelector('.bottom-toolbar') as HTMLElement;
    if (bottomToolbar) {
      bottomToolbar.style.transition = 'left 0.3s ease';
      // Move to center of left 50% of screen
      bottomToolbar.style.left = '25%';
    }
    
    // Trigger resize event after a short delay to update camera aspect ratio
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 350);
  }

  /**
   * Restore full-screen layout when closing
   */
  private restoreFullScreenLayout(): void {
    const canvas = document.querySelector('canvas');
    const canvasContainer = canvas?.parentElement;
    
    if (canvasContainer) {
      canvasContainer.style.transition = 'width 0.3s ease';
      canvasContainer.style.width = '100%';
      canvasContainer.style.position = '';
      canvasContainer.style.left = '';
    }
    
    // Restore toolbar to original centered position (center of full screen)
    const bottomToolbar = document.querySelector('.bottom-toolbar') as HTMLElement;
    if (bottomToolbar) {
      bottomToolbar.style.transition = 'left 0.3s ease';
      // Restore to center of full screen
      bottomToolbar.style.left = '50%';
    }
    
    // Trigger resize event after a short delay to update camera aspect ratio
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 350);
  }

  /**
   * Convert map-based slicer data to PropertyData array
   * Now handles composite keys (modelId:expressID) for multi-model support
   */
  private convertSlicerDataToPropertyData(slicerData: {
    categories: Map<string, Set<string>>; // Composite keys: "modelId:expressID"
    properties: Map<string, Map<string, Set<string>>>;
    numericProperties: Map<string, { min: number; max: number; values: Map<number, Set<string>> }>;
  }): PropertyData[] {
    // Use composite key as the map key for proper multi-model deduplication
    const dataMap = new Map<string, PropertyData>();
    
    // Helper to parse composite key
    const parseKey = (key: string): { modelId: string, expressID: number } => {
      const colonIdx = key.indexOf(':');
      if (colonIdx !== -1) {
        return {
          modelId: key.substring(0, colonIdx),
          expressID: parseInt(key.substring(colonIdx + 1), 10)
        };
      }
      // Fallback for old-style numeric IDs
      return { modelId: this.primaryModelId, expressID: parseInt(key, 10) };
    };
    
    // Add categories
    for (const [category, keys] of slicerData.categories) {
      for (const key of keys) {
        const { modelId, expressID } = parseKey(key);
        if (!dataMap.has(key)) {
          dataMap.set(key, { expressID, modelId, type: category });
        } else {
          dataMap.get(key)!.type = category;
        }
      }
    }
    
    // Add properties
    for (const [propName, valueMap] of slicerData.properties) {
      for (const [value, keys] of valueMap) {
        for (const key of keys) {
          const { modelId, expressID } = parseKey(key);
          if (!dataMap.has(key)) {
            dataMap.set(key, { expressID, modelId, [propName]: value });
          } else {
            dataMap.get(key)![propName] = value;
          }
        }
      }
    }
    
    // Add numeric properties
    for (const [propName, propData] of slicerData.numericProperties) {
      for (const [value, keys] of propData.values) {
        for (const key of keys) {
          const { modelId, expressID } = parseKey(key);
          if (!dataMap.has(key)) {
            dataMap.set(key, { expressID, modelId, [propName]: value });
          } else {
            dataMap.get(key)![propName] = value;
          }
        }
      }
    }
    
    return Array.from(dataMap.values());
  }

  /**
   * Auto-generate slicer configurations from collected data
   * Now handles composite keys (modelId:expressID) for multi-model support
   */
  private autoGenerateSlicersFromData(slicerData: {
    categories: Map<string, Set<string>>; // Composite keys: "modelId:expressID"
    properties: Map<string, Map<string, Set<string>>>;
    numericProperties: Map<string, { min: number; max: number; values: Map<number, Set<string>> }>;
  }): SlicerConfig[] {
    const configs: SlicerConfig[] = [];
    let slicerId = 0;
    
    // Priority order for properties we want to show first (real IFC properties only)
    const priorityProperties = [
      'Building Level',  // From IFC Building Storey - use donut chart
      'Space',           // From IFC Space - use bar chart (heatmap style)
      'PredefinedType',  // Show as bar chart
      'Material',        // Show as bar chart
      'Name', 'ObjectType', 'Description', 'Level', 'IsExternal', 'Tag', 'Layer'  // IFC actual
    ];
    
    // 1. Add category slicer (IFC Type) as first slicer - always show
    if (slicerData.categories.size > 0) {
      configs.push({
        id: `slicer-${slicerId++}`,
        title: 'IFC Type',
        type: 'chart-bar', // Changed to bar chart
        property: 'type',
        multiSelect: true,
        showCounts: true
      });
    }
    
    // 2. Add priority property slicers first
    for (const propName of priorityProperties) {
      if (configs.length >= 20) break; // Increased limit to allow scrolling
      
      const valueMap = slicerData.properties.get(propName);
      
      // Special handling for Building Level - show even if only 1 value
      const isBuildingLevel = propName === 'Building Level';
      const isSpace = propName === 'Space';
      const minSize = (isBuildingLevel || isSpace) ? 1 : 2;
      const maxSize = 500; // Increased from 100 to allow more values (e.g. Name)
      
      if (valueMap && valueMap.size >= minSize && valueMap.size <= maxSize) {
        // Use donut chart for Building Level (storey data)
        let slicerType: 'checkbox' | 'tile' | 'chart-pie' | 'range' | 'chart-bar' = valueMap.size <= 6 ? 'tile' : 'checkbox';
        
        if (isBuildingLevel) {
          slicerType = 'chart-pie';  // Donut chart for building levels
        } else if (isSpace) {
          slicerType = 'chart-bar';  // Bar chart for spaces (heatmap)
        } else if (propName === 'PredefinedType' || propName === 'Material') {
          slicerType = 'chart-bar';  // Bar chart for these properties
        }
        
        configs.push({
          id: `slicer-${slicerId++}`,
          title: this.formatPropertyName(propName),
          type: slicerType,
          property: propName,
          multiSelect: true,
          showCounts: true
        });
        slicerData.properties.delete(propName); // Remove so we don't add again
      }
    }
    
    // 3. Add remaining property slicers
    for (const [propName, valueMap] of slicerData.properties) {
      if (configs.length >= 20) break;
      
      const uniqueValues = valueMap.size;
      // Only add if we have 2-200 unique values (useful for filtering)
      if (uniqueValues > 1 && uniqueValues <= 200) {
        configs.push({
          id: `slicer-${slicerId++}`,
          title: this.formatPropertyName(propName),
          type: uniqueValues <= 6 ? 'tile' : 'checkbox',
          property: propName,
          multiSelect: true,
          showCounts: true
        });
      }
    }
    
    // 4. Add numeric range slicers
    for (const [propName, propData] of slicerData.numericProperties) {
      if (configs.length >= 20) break;
      
      if (propData.max > propData.min) {
        configs.push({
          id: `slicer-${slicerId++}`,
          title: this.formatPropertyName(propName),
          type: 'range',
          property: propName,
          showCounts: true
        });
      }
    }
    
    console.log(`📊 Generated ${configs.length} slicers:`, configs.map(c => c.title));
    
    return configs;
  }

  /**
   * Close the dashboard and restore full-screen layout
   */
  public close(): void {
    this.charts.forEach(chart => chart.destroy());
    this.charts.clear();
    
    if (this.dashboardElement) {
      this.dashboardElement.remove();
      this.dashboardElement = null;
      
      // Restore full-screen layout
      this.restoreFullScreenLayout();
    }
    
    // Clear highlighter
    if (this.highlighter) {
      try {
        this.highlighter.clear('slicer-filter');
      } catch (e) {
        // Ignore
      }
    }
    
    this.slicerStates.clear();
  }

  /**
   * Check if dashboard is open
   */
  public isOpen(): boolean {
    return this.dashboardElement !== null;
  }

  /**
   * Format property name for display
   */
  private formatPropertyName(prop: string): string {
    return prop
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Create the main dashboard UI - takes up right 50% of screen
   */
  private createDashboardUI(): HTMLDivElement {
    const dashboard = document.createElement('div');
    dashboard.id = 'slicer-dashboard';
    dashboard.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 50%;
      height: 100vh;
      background: linear-gradient(180deg, rgba(15, 15, 25, 0.98) 0%, rgba(20, 20, 35, 0.98) 100%);
      border-left: 2px solid rgba(74, 144, 226, 0.3);
      box-shadow: -10px 0 40px rgba(0, 0, 0, 0.5);
      z-index: 10001;
      display: flex;
      flex-direction: column;
      font-family: 'Segoe UI', system-ui, sans-serif;
      animation: slideIn 0.3s ease;
    `;

    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      .slicer-item:hover {
        background: rgba(74, 144, 226, 0.15) !important;
        transform: translateX(4px);
      }
      
      .slicer-item.selected {
        background: rgba(74, 144, 226, 0.25) !important;
        border-left: 3px solid #4a90e2 !important;
      }
      
      .tile-item:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 15px rgba(74, 144, 226, 0.3);
      }
      
      .tile-item.selected {
        background: linear-gradient(135deg, rgba(74, 144, 226, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%) !important;
        border-color: #4a90e2 !important;
      }

      /* Custom Scrollbar */
      #slicers-container::-webkit-scrollbar {
        width: 10px;
      }
      #slicers-container::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 5px;
      }
      #slicers-container::-webkit-scrollbar-thumb {
        background: rgba(74, 144, 226, 0.3);
        border-radius: 5px;
        border: 2px solid rgba(0, 0, 0, 0.1);
      }
      #slicers-container::-webkit-scrollbar-thumb:hover {
        background: rgba(74, 144, 226, 0.5);
      }
    `;
    dashboard.appendChild(style);

    // Header
    const header = this.createHeader();
    dashboard.appendChild(header);

    // Summary bar
    const summaryBar = this.createSummaryBar();
    dashboard.appendChild(summaryBar);

    // Slicers container - use responsive grid for Power BI-like layout
    const slicersContainer = document.createElement('div');
    slicersContainer.id = 'slicers-container';
    slicersContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
      align-content: start;
    `;
    
    // Create each slicer
    this.slicerConfigs.forEach(config => {
      const slicer = this.createSlicer(config);
      slicersContainer.appendChild(slicer);
    });
    
    dashboard.appendChild(slicersContainer);

    // Footer with actions
    const footer = this.createFooter();
    dashboard.appendChild(footer);

    return dashboard;
  }

  /**
   * Create header
   */
  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px;
      background: linear-gradient(135deg, rgba(74, 144, 226, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
      border-bottom: 1px solid rgba(74, 144, 226, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const titleArea = document.createElement('div');
    titleArea.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 28px;">🎛️</span>
        <div>
          <h2 style="margin: 0; color: #fff; font-size: 18px; font-weight: 600;">Visual Slicers</h2>
          <p style="margin: 4px 0 0 0; color: #888; font-size: 11px;">Interactive data filtering</p>
        </div>
      </div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.2s;
    `;
    closeBtn.addEventListener('click', () => this.close());
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(244, 67, 54, 0.3)';
      closeBtn.style.borderColor = '#f44336';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
      closeBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    });

    header.appendChild(titleArea);
    header.appendChild(closeBtn);
    return header;
  }

  /**
   * Create summary bar showing filter status
   */
  private createSummaryBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.id = 'slicer-summary-bar';
    bar.style.cssText = `
      padding: 12px 20px;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    bar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="color: #4a90e2; font-size: 18px;">📊</span>
          <span id="filtered-count" style="color: #4a90e2; font-weight: 600; font-size: 14px;">
            ${this.filteredData.length}
          </span>
          <span style="color: #888; font-size: 12px;">of ${this.propertyData.length} items</span>
        </div>
        <div id="active-filters" style="display: flex; gap: 6px; flex-wrap: wrap;"></div>
      </div>
    `;

    return bar;
  }

  /**
   * Create a slicer based on its type
   */
  private createSlicer(config: SlicerConfig): HTMLElement {
    const container = document.createElement('div');
    container.className = 'slicer-container';
    container.dataset.slicerId = config.id;
    
    // Special styling for IFC Type bar chart to span full width
    const isFullWidth = config.title === 'IFC Type' && config.type === 'chart-bar';
    
    container.style.cssText = `
      background: rgba(30, 30, 45, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      overflow: hidden;
      transition: all 0.3s;
      ${isFullWidth ? 'grid-column: 1 / -1;' : ''}
    `;

    // Slicer header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      background: rgba(74, 144, 226, 0.1);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    `;
    
    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = `color: #4a90e2; font-weight: 600; font-size: 13px;`;
    titleSpan.textContent = config.title;
    
    const countBadge = document.createElement('span');
    countBadge.className = 'slicer-count-badge';
    countBadge.style.cssText = `
      background: rgba(74, 144, 226, 0.2);
      color: #4a90e2;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
    `;
    
    header.appendChild(titleSpan);
    header.appendChild(countBadge);
    container.appendChild(header);

    // Narrative element
    const narrative = document.createElement('div');
    narrative.className = 'slicer-narrative';
    narrative.style.cssText = `
      padding: 6px 16px;
      font-size: 11px;
      color: #888;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-style: italic;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    narrative.textContent = 'Loading...';
    container.appendChild(narrative);

    // Slicer content
    const content = document.createElement('div');
    content.className = 'slicer-content';
    content.style.cssText = `padding: 12px; max-height: 200px; overflow-y: auto;`;

    // Get unique values for this property
    const values = this.getPropertyValues(config.property);
    countBadge.textContent = `${values.length} values`;

    switch (config.type) {
      case 'checkbox':
        this.populateCheckboxSlicer(content, config, values);
        break;
      case 'tile':
        this.populateTileSlicer(content, config, values);
        break;
      case 'chart-pie':
        this.populateChartSlicer(content, config, values, 'pie');
        break;
      case 'chart-bar':
        this.populateChartSlicer(content, config, values, 'bar');
        break;
      case 'search':
        this.populateSearchSlicer(content, config);
        break;
      case 'range':
        this.populateRangeSlicer(content, config, values);
        break;
      case 'dropdown':
        this.populateDropdownSlicer(content, config, values);
        break;
    }

    container.appendChild(content);

    // Collapsible functionality
    header.addEventListener('click', () => {
      const isCollapsed = content.style.display === 'none';
      content.style.display = isCollapsed ? 'block' : 'none';
    });

    return container;
  }

  /**
   * Get unique values for a property with counts
   */
  private getPropertyValues(property: string): { value: string; count: number }[] {
    const valueCounts = new Map<string, number>();
    
    this.propertyData.forEach(row => {
      const value = row[property];
      if (value !== null && value !== undefined && value !== '') {
        const strValue = String(value);
        valueCounts.set(strValue, (valueCounts.get(strValue) || 0) + 1);
      }
    });
    
    return Array.from(valueCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Populate checkbox slicer
   */
  private populateCheckboxSlicer(container: HTMLElement, config: SlicerConfig, values: { value: string; count: number }[]): void {
    // Search box
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = '🔍 Search...';
    searchBox.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      margin-bottom: 10px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #fff;
      font-size: 12px;
      outline: none;
    `;
    container.appendChild(searchBox);

    const list = document.createElement('div');
    list.className = 'checkbox-list';
    list.style.cssText = `display: flex; flex-direction: column; gap: 4px;`;

    values.forEach(({ value, count }) => {
      const item = document.createElement('label');
      item.className = 'slicer-item';
      item.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        border-left: 3px solid transparent;
      `;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.cssText = `
        width: 16px;
        height: 16px;
        accent-color: #4a90e2;
        cursor: pointer;
      `;

      const label = document.createElement('span');
      label.style.cssText = `flex: 1; color: #e0e0e0; font-size: 12px; overflow: hidden; text-overflow: ellipsis;`;
      label.textContent = value;
      label.title = value;

      const countSpan = document.createElement('span');
      countSpan.style.cssText = `color: #666; font-size: 11px; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;`;
      countSpan.textContent = String(count);

      checkbox.addEventListener('change', () => {
        const state = this.slicerStates.get(config.id)!;
        if (checkbox.checked) {
          state.selectedValues.add(value);
          item.classList.add('selected');
        } else {
          state.selectedValues.delete(value);
          item.classList.remove('selected');
        }
        this.applyFilters();
      });

      item.appendChild(checkbox);
      item.appendChild(label);
      item.appendChild(countSpan);
      list.appendChild(item);
    });

    container.appendChild(list);

    // Search functionality
    searchBox.addEventListener('input', () => {
      const search = searchBox.value.toLowerCase();
      list.querySelectorAll('.slicer-item').forEach(item => {
        const text = (item as HTMLElement).textContent?.toLowerCase() || '';
        (item as HTMLElement).style.display = text.includes(search) ? 'flex' : 'none';
      });
    });
  }

  /**
   * Populate tile slicer
   */
  private populateTileSlicer(container: HTMLElement, config: SlicerConfig, values: { value: string; count: number }[]): void {
    const grid = document.createElement('div');
    grid.style.cssText = `display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;`;

    values.slice(0, 8).forEach(({ value, count }) => {
      const tile = document.createElement('div');
      tile.className = 'tile-item';
      tile.style.cssText = `
        padding: 12px;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
      `;

      tile.innerHTML = `
        <div style="color: #4a90e2; font-size: 20px; font-weight: 700;">${count}</div>
        <div style="color: #888; font-size: 10px; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${value}">${value}</div>
      `;

      tile.addEventListener('click', () => {
        const state = this.slicerStates.get(config.id)!;
        if (tile.classList.contains('selected')) {
          state.selectedValues.delete(value);
          tile.classList.remove('selected');
        } else {
          if (!config.multiSelect) {
            grid.querySelectorAll('.tile-item').forEach(t => t.classList.remove('selected'));
            state.selectedValues.clear();
          }
          state.selectedValues.add(value);
          tile.classList.add('selected');
        }
        this.applyFilters();
      });

      grid.appendChild(tile);
    });

    container.appendChild(grid);
  }

  /**
   * Populate chart slicer (pie or bar)
   */
  private populateChartSlicer(container: HTMLElement, config: SlicerConfig, values: { value: string; count: number }[], chartType: 'pie' | 'bar'): void {
    const canvas = document.createElement('canvas');
    // Increased size for better visibility
    canvas.style.cssText = `max-height: 260px; width: 100%;`;
    container.appendChild(canvas);

    const colors = [
      '#4a90e2', '#e91e63', '#4caf50', '#ff9800', '#9c27b0',
      '#00bcd4', '#ff5722', '#607d8b', '#8bc34a', '#ffc107',
      '#3f51b5', '#f44336', '#009688', '#ffeb3b', '#795548',
      '#673ab7', '#e91e63', '#2196f3', '#cddc39', '#607d8b'
    ];

    // Show more values for bar charts (up to 20), fewer for pie charts (up to 10)
    const limit = chartType === 'bar' ? 20 : 10;
    const topValues = values.slice(0, limit);
    
    // Ensure we have enough colors by repeating if necessary
    const chartColors = topValues.map((_, i) => colors[i % colors.length]);
    
    // Custom plugin to draw labels on donut segments
    const doughnutLabelPlugin = {
      id: 'doughnutLabel',
      afterDatasetsDraw(chart: any) {
        const { ctx, data } = chart;
        
        chart.data.datasets.forEach((dataset: any, i: number) => {
          const meta = chart.getDatasetMeta(i);
          if (!meta.hidden) {
            meta.data.forEach((element: any, index: number) => {
              // Only draw if segment is large enough (approx 15 degrees)
              const { startAngle, endAngle } = element;
              if (endAngle - startAngle > 0.25) {
                const { x, y } = element.tooltipPosition();
                
                ctx.save();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Get value instead of label (name)
                const value = dataset.data[index];
                const label = String(value);
                
                // Add shadow for better visibility against colored background
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 3;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                
                ctx.fillText(label, x, y);
                ctx.restore();
              }
            });
          }
        });
      }
    };

    const chart = new Chart(canvas, {
      type: chartType === 'pie' ? 'doughnut' : 'bar',
      plugins: chartType === 'pie' ? [doughnutLabelPlugin] : [],
      data: {
        labels: topValues.map(v => v.value.length > 15 ? v.value.substring(0, 15) + '...' : v.value),
        datasets: [{
          data: topValues.map(v => v.count),
          backgroundColor: chartColors,
          borderWidth: 0,
          // @ts-ignore
          fullValues: topValues.map(v => v.value),
          // @ts-ignore
          minBarLength: 4 // Make small bars visible
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // Allow it to fill the container height
        plugins: {
          legend: {
            display: chartType === 'pie',
            position: 'right',
            labels: { color: '#888', font: { size: 11 }, boxWidth: 12 }
          }
        },
        onClick: (event, elements, chart) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            // @ts-ignore
            const fullValues = chart.data.datasets[0].fullValues;
            const value = fullValues ? fullValues[index] : topValues[index].value;
            const state = this.slicerStates.get(config.id)!;
            
            // Check for modifier keys for multi-select (Ctrl, Cmd, Shift)
            const nativeEvent = event.native as MouseEvent;
            const isMultiSelect = nativeEvent && (nativeEvent.ctrlKey || nativeEvent.metaKey || nativeEvent.shiftKey);
            
            if (isMultiSelect) {
              // Toggle selection
              if (state.selectedValues.has(value)) {
                state.selectedValues.delete(value);
              } else {
                state.selectedValues.add(value);
              }
            } else {
              // Single select behavior
              // If clicking the already selected item (and it's the only one), deselect it
              if (state.selectedValues.has(value) && state.selectedValues.size === 1) {
                state.selectedValues.clear();
              } else {
                // Otherwise select only this one
                state.selectedValues.clear();
                state.selectedValues.add(value);
              }
            }
            this.applyFilters();
          }
        }
      }
    });

    this.charts.set(config.id, chart);
  }

  /**
   * Populate search slicer
   */
  private populateSearchSlicer(container: HTMLElement, config: SlicerConfig): void {
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = `🔍 Search ${config.title}...`;
    searchBox.style.cssText = `
      width: 100%;
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(74, 144, 226, 0.3);
      border-radius: 8px;
      color: #fff;
      font-size: 13px;
      outline: none;
      transition: all 0.2s;
    `;

    searchBox.addEventListener('focus', () => {
      searchBox.style.borderColor = '#4a90e2';
      searchBox.style.boxShadow = '0 0 0 3px rgba(74, 144, 226, 0.2)';
    });
    searchBox.addEventListener('blur', () => {
      searchBox.style.borderColor = 'rgba(74, 144, 226, 0.3)';
      searchBox.style.boxShadow = 'none';
    });

    let debounceTimeout: number;
    searchBox.addEventListener('input', () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = window.setTimeout(() => {
        const state = this.slicerStates.get(config.id)!;
        state.searchText = searchBox.value;
        this.applyFilters();
      }, 300);
    });

    container.appendChild(searchBox);
  }

  /**
   * Populate range slicer
   */
  private populateRangeSlicer(container: HTMLElement, config: SlicerConfig, values: { value: string; count: number }[]): void {
    const numericValues = values
      .map(v => parseFloat(v.value))
      .filter(v => !isNaN(v))
      .sort((a, b) => a - b);

    if (numericValues.length === 0) {
      container.innerHTML = '<div style="color: #666; font-size: 12px;">No numeric values</div>';
      return;
    }

    const min = numericValues[0];
    const max = numericValues[numericValues.length - 1];

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; color: #888; font-size: 11px;">
          <span>Min: ${min.toFixed(2)}</span>
          <span>Max: ${max.toFixed(2)}</span>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <input type="number" id="range-min-${config.id}" value="${min}" min="${min}" max="${max}" 
            style="flex: 1; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); 
            border-radius: 6px; color: #fff; font-size: 12px;">
          <span style="color: #666;">to</span>
          <input type="number" id="range-max-${config.id}" value="${max}" min="${min}" max="${max}"
            style="flex: 1; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); 
            border-radius: 6px; color: #fff; font-size: 12px;">
        </div>
      </div>
    `;

    const minInput = container.querySelector(`#range-min-${config.id}`) as HTMLInputElement;
    const maxInput = container.querySelector(`#range-max-${config.id}`) as HTMLInputElement;

    const updateRange = () => {
      const state = this.slicerStates.get(config.id)!;
      state.rangeMin = parseFloat(minInput.value);
      state.rangeMax = parseFloat(maxInput.value);
      this.applyFilters();
    };

    minInput.addEventListener('change', updateRange);
    maxInput.addEventListener('change', updateRange);
  }

  /**
   * Populate dropdown slicer
   */
  private populateDropdownSlicer(container: HTMLElement, config: SlicerConfig, values: { value: string; count: number }[]): void {
    const select = document.createElement('select');
    select.style.cssText = `
      width: 100%;
      padding: 10px 12px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #fff;
      font-size: 12px;
      cursor: pointer;
    `;

    select.innerHTML = `<option value="">-- Select ${config.title} --</option>`;
    values.forEach(({ value, count }) => {
      select.innerHTML += `<option value="${value}">${value} (${count})</option>`;
    });

    select.addEventListener('change', () => {
      const state = this.slicerStates.get(config.id)!;
      state.selectedValues.clear();
      if (select.value) {
        state.selectedValues.add(select.value);
      }
      this.applyFilters();
    });

    container.appendChild(select);
  }

  /**
   * Apply all active filters
   */
  private applyFilters(): void {
    console.log('🎛️ Applying filters...');
    console.log('  Slicer states:', Array.from(this.slicerStates.entries()).map(([id, state]) => ({
      id,
      selectedValues: Array.from(state.selectedValues),
      searchText: state.searchText
    })));
    
    this.filteredData = this.propertyData.filter(row => {
      for (const config of this.slicerConfigs) {
        const state = this.slicerStates.get(config.id);
        if (!state) continue;

        // Check selected values filter
        if (state.selectedValues.size > 0) {
          const rowValue = String(row[config.property] || '');
          if (!state.selectedValues.has(rowValue)) {
            return false;
          }
        }

        // Check search filter
        if (state.searchText && state.searchText.trim() !== '') {
          const rowValue = String(row[config.property] || '').toLowerCase();
          if (!rowValue.includes(state.searchText.toLowerCase())) {
            return false;
          }
        }

        // Check range filter
        if (state.rangeMin !== undefined && state.rangeMax !== undefined) {
          const numValue = parseFloat(String(row[config.property]));
          if (!isNaN(numValue) && (numValue < state.rangeMin || numValue > state.rangeMax)) {
            return false;
          }
        }
      }
      return true;
    });

    console.log(`  Filtered data: ${this.filteredData.length}/${this.propertyData.length}`);
    if (this.filteredData.length > 0) {
      console.log('  Sample filtered item:', this.filteredData[0]);
    }

    // Update UI
    this.updateSummaryBar();
    this.updateActiveFiltersDisplay();

    // Notify callback
    if (this.onFilterChange) {
      const filteredIds = new Map<string, Set<number>>();
      this.filteredData.forEach(row => {
        const modelId = row.modelId || this.primaryModelId;
        if (!filteredIds.has(modelId)) {
          filteredIds.set(modelId, new Set());
        }
        filteredIds.get(modelId)!.add(row.expressID);
      });
      this.onFilterChange(filteredIds);
    }

    // Highlight in 3D view
    this.highlightFilteredElements();

    // Update other slicers (cross-filtering)
    this.updateSlicers();

    console.log(`🎛️ Filters applied: ${this.filteredData.length}/${this.propertyData.length} items`);
  }

  /**
   * Update slicers based on current filters (cross-filtering)
   */
  private updateSlicers(): void {
    for (const config of this.slicerConfigs) {
      // 1. Calculate data filtered by OTHER slicers
      const relevantData = this.propertyData.filter(row => {
        for (const otherConfig of this.slicerConfigs) {
          if (otherConfig.id === config.id) continue; // Skip self

          const state = this.slicerStates.get(otherConfig.id);
          if (!state) continue;

          // Check selected values filter
          if (state.selectedValues.size > 0) {
            const rowValue = String(row[otherConfig.property] || '');
            if (!state.selectedValues.has(rowValue)) {
              return false;
            }
          }

          // Check search filter
          if (state.searchText && state.searchText.trim() !== '') {
            const rowValue = String(row[otherConfig.property] || '').toLowerCase();
            if (!rowValue.includes(state.searchText.toLowerCase())) {
              return false;
            }
          }

          // Check range filter
          if (state.rangeMin !== undefined && state.rangeMax !== undefined) {
            const numValue = parseFloat(String(row[otherConfig.property]));
            if (!isNaN(numValue) && (numValue < state.rangeMin || numValue > state.rangeMax)) {
              return false;
            }
          }
        }
        return true;
      });

      // 2. Calculate new counts
      const valueCounts = new Map<string, number>();
      relevantData.forEach(row => {
        const value = row[config.property];
        if (value !== null && value !== undefined && value !== '') {
          const strValue = String(value);
          valueCounts.set(strValue, (valueCounts.get(strValue) || 0) + 1);
        }
      });

      // 3. Update UI
      const container = document.querySelector(`[data-slicer-id="${config.id}"]`);
      
      // Update Narrative
      if (container) {
        const narrative = container.querySelector('.slicer-narrative');
        if (narrative) {
          const state = this.slicerStates.get(config.id);
          const totalItems = relevantData.length;
          
          if (state && state.selectedValues.size > 0) {
            const selectedCount = state.selectedValues.size;
            const values = Array.from(state.selectedValues).join(', ');
            const displayValues = values.length > 40 ? values.substring(0, 40) + '...' : values;
            narrative.textContent = `Filtered by: ${displayValues} (${totalItems} items)`;
            (narrative as HTMLElement).style.color = '#4a90e2';
            (narrative as HTMLElement).style.display = 'block';
          } else if (totalItems < this.propertyData.length) {
            // Find which other slicers are active
            const activeFilters: string[] = [];
            for (const otherConfig of this.slicerConfigs) {
              if (otherConfig.id === config.id) continue;
              const otherState = this.slicerStates.get(otherConfig.id);
              if (otherState) {
                if (otherState.selectedValues.size > 0) {
                  const values = Array.from(otherState.selectedValues).join(', ');
                  activeFilters.push(`${otherConfig.title}: ${values}`);
                } else if (otherState.searchText && otherState.searchText.trim() !== '') {
                  activeFilters.push(`${otherConfig.title}: "${otherState.searchText}"`);
                }
              }
            }
            
            const filterText = activeFilters.length > 0 ? activeFilters.join('; ') : 'others';
            const displayText = filterText.length > 60 ? filterText.substring(0, 60) + '...' : filterText;
            
            narrative.textContent = `Filtered by ${displayText} (${totalItems} items)`;
            (narrative as HTMLElement).style.color = '#ff9800';
            (narrative as HTMLElement).style.display = 'block';
          } else {
            narrative.textContent = `All ${totalItems} items`;
            (narrative as HTMLElement).style.color = '#888';
            (narrative as HTMLElement).style.display = 'block';
          }
        }
      }

      if (config.type === 'chart-pie' || config.type === 'chart-bar') {
        const chart = this.charts.get(config.id);
        if (chart) {
           const sortedValues = Array.from(valueCounts.entries())
              .map(([value, count]) => ({ value, count }))
              .sort((a, b) => b.count - a.count);
           
           const limit = config.type === 'chart-bar' ? 20 : 10;
           const topValues = sortedValues.slice(0, limit);
           
           // Update data
           chart.data.labels = topValues.map(v => v.value.length > 15 ? v.value.substring(0, 15) + '...' : v.value);
           chart.data.datasets[0].data = topValues.map(v => v.count);
           // @ts-ignore
           chart.data.datasets[0].fullValues = topValues.map(v => v.value);
           
           // Update colors using consistent type colors
           chart.data.datasets[0].backgroundColor = topValues.map(v => this.getTypeColor(v.value));
           
           chart.update();
        }
      } else if (config.type === 'checkbox' || config.type === 'tile') {
         // Update counts in DOM
         if (container) {
            const items = container.querySelectorAll('.slicer-item, .tile-item');
            items.forEach(item => {
               let value = '';
               if (item.classList.contains('slicer-item')) {
                  // Checkbox item: label is 2nd child (index 1)
                  value = item.children[1]?.textContent || '';
               } else {
                  // Tile item: label is 2nd child (index 1)
                  value = item.children[1]?.textContent || '';
               }
               
               const count = valueCounts.get(value) || 0;
               
               // Update count display
               if (item.classList.contains('slicer-item')) {
                  const countSpan = item.children[2];
                  if (countSpan) countSpan.textContent = String(count);
                  
                  // Dim items with 0 count
                  (item as HTMLElement).style.opacity = count === 0 ? '0.4' : '1';
                  // Optional: disable interaction for 0 count items? 
                  // Maybe better to keep them clickable so user can select 0-count items (which results in empty set)
                  // or maybe they want to see what ISN'T there.
                  // But usually 0 count means "not available in current context".
               } else {
                  const countDiv = item.children[0];
                  if (countDiv) countDiv.textContent = String(count);
                  
                  (item as HTMLElement).style.opacity = count === 0 ? '0.4' : '1';
               }
            });
         }
      }
    }
  }

  /**
   * Update summary bar
   */
  private updateSummaryBar(): void {
    const countEl = document.getElementById('filtered-count');
    if (countEl) {
      countEl.textContent = String(this.filteredData.length);
      countEl.style.color = this.filteredData.length < this.propertyData.length ? '#ff9800' : '#4a90e2';
    }
  }

  /**
   * Update active filters display
   */
  private updateActiveFiltersDisplay(): void {
    const container = document.getElementById('active-filters');
    if (!container) return;

    container.innerHTML = '';

    this.slicerStates.forEach((state, id) => {
      const config = this.slicerConfigs.find(c => c.id === id);
      if (!config) return;

      if (state.selectedValues.size > 0) {
        const values = Array.from(state.selectedValues).join(', ');
        const displayValues = values.length > 30 ? values.substring(0, 30) + '...' : values;

        const badge = document.createElement('span');
        badge.style.cssText = `
          background: rgba(74, 144, 226, 0.2);
          color: #4a90e2;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 10px;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
        `;
        badge.innerHTML = `${config.title}: ${displayValues} <span style="opacity: 0.6;">✕</span>`;
        badge.addEventListener('click', () => {
          state.selectedValues.clear();
          this.applyFilters();
          // Update slicer UI
          const slicerContainer = document.querySelector(`[data-slicer-id="${id}"]`);
          if (slicerContainer) {
            slicerContainer.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            slicerContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
              (cb as HTMLInputElement).checked = false;
            });
          }
        });
        container.appendChild(badge);
      }
    });
  }

  /**
   * Highlight filtered elements in 3D view
   * Now handles multi-model data with composite keys
   */
  private highlightFilteredElements(): void {
    if (!this.highlighter) {
      console.warn('⚠️ Highlighter not available for slicer filtering');
      return;
    }

    try {
      // Clear previous highlights
      this.activeHighlightStyles.forEach(styleName => {
        this.highlighter?.clear(styleName);
      });
      this.activeHighlightStyles.clear();
      
      // Also clear the generic one just in case
      this.highlighter.clear('slicer-filter');
      this.highlighter.clear('slicer-transparent');

      if (this.filteredData.length < this.propertyData.length && this.filteredData.length > 0) {
        // Group filtered elements by type and model
        const typeGroups: Map<string, { [modelId: string]: Set<number> }> = new Map();
        // Use composite keys to track filtered elements (handles multi-model case)
        const filteredKeys = new Set<string>();
        
        this.filteredData.forEach(row => {
          const type = row.type || 'Other';
          const modelId = row.modelId || this.primaryModelId;
          const compositeKey = `${modelId}:${row.expressID}`;
          
          if (!typeGroups.has(type)) {
            typeGroups.set(type, {});
          }
          const group = typeGroups.get(type)!;
          if (!group[modelId]) group[modelId] = new Set();
          group[modelId].add(row.expressID);
          filteredKeys.add(compositeKey);
        });

        // Collect non-filtered elements for transparency using composite keys
        const transparentElements: { [modelId: string]: Set<number> } = {};
        this.propertyData.forEach(row => {
          const modelId = row.modelId || this.primaryModelId;
          const compositeKey = `${modelId}:${row.expressID}`;
          if (!filteredKeys.has(compositeKey)) {
            if (!transparentElements[modelId]) transparentElements[modelId] = new Set();
            transparentElements[modelId].add(row.expressID);
          }
        });

        console.log(`🎛️ Highlighting ${this.filteredData.length} elements, making ${this.propertyData.length - this.filteredData.length} transparent`);

        // Make non-filtered elements transparent
        if (Object.keys(transparentElements).length > 0) {
          this.highlighter.styles.set('slicer-transparent', {
            color: new THREE.Color(0x888888),
            opacity: 0.15,
            transparent: true,
            renderedFaces: 1
          });
          this.highlighter.highlightByID('slicer-transparent', transparentElements, false);
          this.activeHighlightStyles.add('slicer-transparent');
        }

        // Highlight each filtered group with its type color
        for (const [type, modelIdMap] of typeGroups) {
          const styleName = `slicer-filter-${type.replace(/[^a-zA-Z0-9]/g, '-')}`;
          const colorHex = this.getTypeColor(type);
          const color = new THREE.Color(colorHex);
          
          // Create/Update style
          this.highlighter.styles.set(styleName, {
            color: color,
            opacity: 0.85,
            transparent: false,
            renderedFaces: 1
          });
          
          this.highlighter.highlightByID(styleName, modelIdMap, false);
          this.activeHighlightStyles.add(styleName);
        }
      } else if (this.filteredData.length === 0) {
        console.log('⚠️ No elements match the current filter');
      }
    } catch (error) {
      console.error('❌ Error highlighting filtered elements:', error);
    }
  }

  /**
   * Create footer with action buttons
   */
  private createFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px 20px;
      background: rgba(0, 0, 0, 0.3);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      gap: 10px;
    `;

    const clearBtn = document.createElement('button');
    clearBtn.innerHTML = '🔄 Clear All Filters';
    clearBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      background: rgba(255, 152, 0, 0.2);
      border: 1px solid rgba(255, 152, 0, 0.4);
      border-radius: 8px;
      color: #ff9800;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    clearBtn.addEventListener('click', () => this.clearAllFilters());
    clearBtn.addEventListener('mouseenter', () => {
      clearBtn.style.background = 'rgba(255, 152, 0, 0.3)';
    });
    clearBtn.addEventListener('mouseleave', () => {
      clearBtn.style.background = 'rgba(255, 152, 0, 0.2)';
    });

    const exportBtn = document.createElement('button');
    exportBtn.innerHTML = '📥 Export Filtered';
    exportBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      background: rgba(76, 175, 80, 0.2);
      border: 1px solid rgba(76, 175, 80, 0.4);
      border-radius: 8px;
      color: #4caf50;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    exportBtn.addEventListener('click', () => this.exportFilteredData());
    exportBtn.addEventListener('mouseenter', () => {
      exportBtn.style.background = 'rgba(76, 175, 80, 0.3)';
    });
    exportBtn.addEventListener('mouseleave', () => {
      exportBtn.style.background = 'rgba(76, 175, 80, 0.2)';
    });

    footer.appendChild(clearBtn);
    footer.appendChild(exportBtn);
    return footer;
  }

  /**
   * Clear all filters
   */
  private clearAllFilters(): void {
    this.slicerStates.forEach(state => {
      state.selectedValues.clear();
      state.searchText = '';
      state.rangeMin = undefined;
      state.rangeMax = undefined;
    });

    // Reset UI
    document.querySelectorAll('.slicer-container').forEach(container => {
      container.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
      container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        (cb as HTMLInputElement).checked = false;
      });
      container.querySelectorAll('input[type="text"]').forEach(input => {
        (input as HTMLInputElement).value = '';
      });
      container.querySelectorAll('select').forEach(select => {
        (select as HTMLSelectElement).selectedIndex = 0;
      });
    });

    this.applyFilters();
    console.log('🔄 All filters cleared');
  }

  /**
   * Export filtered data to CSV
   */
  private exportFilteredData(): void {
    if (this.filteredData.length === 0) {
      alert('No data to export');
      return;
    }

    // Get all columns
    const columns = new Set<string>();
    this.filteredData.forEach(row => {
      Object.keys(row).forEach(key => columns.add(key));
    });

    const columnArray = Array.from(columns);
    
    // Build CSV
    let csv = columnArray.join(',') + '\n';
    this.filteredData.forEach(row => {
      const values = columnArray.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const strVal = String(val).replace(/"/g, '""');
        return strVal.includes(',') || strVal.includes('"') || strVal.includes('\n') 
          ? `"${strVal}"` : strVal;
      });
      csv += values.join(',') + '\n';
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filtered_data_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    console.log(`📥 Exported ${this.filteredData.length} rows`);
  }
}
