/**
 * PropertyTableModule - Displays IFC properties in an Excel-like table
 * Shows properties of visible objects in cluster view
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import type { WorldManager } from './WorldManager';

interface PropertyRow {
  expressID: number;
  modelId?: string;
  name?: string;
  type?: string;
  globalId?: string;
  [key: string]: any;
}

export class PropertyTableModule {
  private components: OBC.Components;
  private worldManager: WorldManager;
  private fragmentsManager: OBC.FragmentsManager;
  private tableContainer: HTMLElement | null = null;
  private isVisible: boolean = false;
  private currentProperties: PropertyRow[] = [];
  private columnFilters: Map<string, Set<string>> = new Map();
  private activeFilterDropdown: HTMLElement | null = null;
  private isCollapsed: boolean = false;
  private highlighter: OBF.Highlighter | null = null;
  private allElementIds: number[] = [];
  private clusterScene: THREE.Group | null = null;

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
    this.fragmentsManager = this.components.get(OBC.FragmentsManager);
    this.highlighter = this.components.get(OBF.Highlighter);

    console.log('✅ PropertyTableModule initialized');
  }

  /**
   * Show the property table with data from visible elements
   */
  public async showTable(elementsByCategory: Map<string, { [key: string]: Set<number> }>): Promise<void> {
    // Collect all visible element IDs
    this.allElementIds = [];
    for (const [category, elements] of elementsByCategory) {
      for (const modelId in elements) {
        elements[modelId].forEach(id => this.allElementIds.push(id));
      }
    }

    console.log(`📊 PropertyTable: Collecting properties for ${this.allElementIds.length} elements`);
    console.log(`📊 Element IDs:`, this.allElementIds.slice(0, 10)); // Show first 10

    if (this.allElementIds.length === 0) {
      console.warn('⚠️ No elements to display in table');
      return;
    }

    // Fetch properties for all elements
    this.currentProperties = await this.fetchProperties(this.allElementIds);

    console.log(`📊 PropertyTable: Fetched ${this.currentProperties.length} property rows`);

    // Create or update the table UI
    this.createTableUI();
    this.populateTable();
    this.isVisible = true;
    this.updateToolbarPosition();

    console.log(`✅ Property table shown with ${this.currentProperties.length} elements`);
  }

  /**
   * Hide the property table
   */
  public hideTable(): void {
    if (this.tableContainer && this.tableContainer.parentElement) {
      this.tableContainer.parentElement.removeChild(this.tableContainer);
      this.tableContainer = null;
    }
    this.isVisible = false;
    this.isCollapsed = false;
    this.currentProperties = [];
    this.columnFilters.clear();
    this.allElementIds = [];
    
    // Restore all opacity in cluster scene
    this.restoreAllOpacity();
    
    // Clear any highlights
    if (this.highlighter) {
      this.highlighter.clear('property-table-filter');
    }
    
    // Reset toolbar position
    const toolbar = document.querySelector('.bottom-toolbar') as HTMLElement;
    if (toolbar) {
      toolbar.style.bottom = '10px';
    }
  }

  /**
   * Toggle table visibility
   */
  public toggleTable(): void {
    if (this.isVisible) {
      this.hideTable();
    }
  }

  /**
   * Set the cluster scene for filtering
   */
  public setClusterScene(scene: THREE.Group | null): void {
    this.clusterScene = scene;
    console.log('📊 PropertyTable: Cluster scene set:', !!scene, scene?.name);
  }

  /**
   * Check if table is currently visible
   */
  public isTableVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Get the current height of the property table
   */
  public getTableHeight(): number {
    if (!this.isVisible || !this.tableContainer) return 0;
    return this.tableContainer.offsetHeight;
  }

  /**
   * Update toolbar position based on table state
   */
  private updateToolbarPosition(): void {
    const toolbar = document.querySelector('.bottom-toolbar') as HTMLElement;
    if (toolbar) {
      const offset = this.getTableHeight();
      toolbar.style.bottom = `${10 + offset}px`;
    }
  }

  /**
   * Fetch IFC properties for given element IDs
   */
  private async fetchProperties(elementIds: number[]): Promise<PropertyRow[]> {
    const properties: PropertyRow[] = [];

    for (const [modelId, model] of this.fragmentsManager.list) {
      // Check if model has getItemsData method
      if (typeof (model as any).getItemsData !== 'function') {
        console.warn(`⚠️ Model ${modelId} does not have getItemsData method`);
        continue;
      }

      try {
        // Get IFC data for all element IDs in this model
        const ifcDataArray = await (model as any).getItemsData(elementIds, {
          attributesDefault: true,
          relations: {
            IsDefinedBy: { attributes: true, relations: true },
          },
        });

        if (!ifcDataArray || ifcDataArray.length === 0) {
          console.warn(`⚠️ No IFC data found for model ${modelId}`);
          continue;
        }

        // Process each element's data - pair it with the original element ID
        for (let i = 0; i < ifcDataArray.length; i++) {
          const ifcData = ifcDataArray[i];
          if (!ifcData) continue;

          // Use the original element ID from the query
          const expressID = elementIds[i];

          const row: PropertyRow = {
            expressID: expressID,
            modelId: modelId,
            type: ifcData._category?.value || ifcData.type || 'Unknown',
            name: ifcData.Name?.value || ifcData.LongName?.value || 'Unnamed',
            globalId: ifcData._guid?.value || ifcData.GlobalId?.value || '',
          };

          // Add common properties
          if (ifcData.Description?.value) row.description = ifcData.Description.value;
          if (ifcData.ObjectType?.value) row.objectType = ifcData.ObjectType.value;
          if (ifcData.Tag?.value) row.tag = ifcData.Tag.value;
          if (ifcData.PredefinedType?.value) row.predefinedType = ifcData.PredefinedType.value;
          
          // Add property sets
          if (ifcData.IsDefinedBy && Array.isArray(ifcData.IsDefinedBy)) {
            for (const pset of ifcData.IsDefinedBy) {
              if (pset.HasProperties && Array.isArray(pset.HasProperties)) {
                for (const prop of pset.HasProperties) {
                  const propName = prop.Name?.value;
                  const propValue = prop.NominalValue?.value;
                  if (propName && propValue !== undefined) {
                    row[propName] = propValue;
                  }
                }
              }
            }
          }

          properties.push(row);
        }
      } catch (error) {
        console.error(`❌ Error fetching properties for model ${modelId}:`, error);
      }
    }

    return properties;
  }

  /**
   * Create the table UI container
   */
  private createTableUI(): void {
    if (this.tableContainer) {
      return; // Already exists
    }

    const container = document.createElement('div');
    container.id = 'property-table-container';
    container.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 300px;
      background: rgba(20, 20, 30, 0.95);
      border-top: 2px solid #4a90e2;
      display: flex;
      flex-direction: column;
      z-index: 9999;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
    `;

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 6px;
      cursor: ns-resize;
      z-index: 10000;
      background: transparent;
    `;

    // Resize functionality
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = container.offsetHeight;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const deltaY = startY - e.clientY;
      const newHeight = Math.max(100, Math.min(window.innerHeight - 100, startHeight + deltaY));
      container.style.height = newHeight + 'px';
      this.updateToolbarPosition();
    });

    document.addEventListener('mouseup', () => {
      isResizing = false;
    });

    container.appendChild(resizeHandle);

    // Header with title and controls
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 15px;
      background: rgba(30, 30, 40, 0.98);
      border-bottom: 1px solid #4a90e2;
      cursor: pointer;
      user-select: none;
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      color: #4a90e2;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    `;
    title.innerHTML = `
      <span style="font-size: 16px;">📊</span>
      <span>IFC Properties Table</span>
      <span style="font-size: 11px; color: #999; font-weight: normal;" id="table-count"></span>
    `;

    const controls = document.createElement('div');
    controls.style.cssText = `
      display: flex;
      gap: 10px;
      align-items: center;
    `;

    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.innerHTML = '📥 Export CSV';
    exportBtn.style.cssText = `
      background: rgba(74, 144, 226, 0.2);
      border: 1px solid #4a90e2;
      color: #4a90e2;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
    `;
    exportBtn.addEventListener('mouseenter', () => {
      exportBtn.style.background = 'rgba(74, 144, 226, 0.3)';
    });
    exportBtn.addEventListener('mouseleave', () => {
      exportBtn.style.background = 'rgba(74, 144, 226, 0.2)';
    });
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.exportToCSV();
    });

    // Collapse/expand icon
    const collapseIcon = document.createElement('span');
    collapseIcon.style.cssText = `
      font-size: 18px;
      color: #999;
      transition: transform 0.3s;
    `;
    collapseIcon.textContent = '▼';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: #999;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s;
    `;
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = '#ff6666';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = '#999';
    });
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideTable();
    });

    controls.appendChild(exportBtn);
    controls.appendChild(collapseIcon);
    controls.appendChild(closeBtn);

    header.appendChild(title);
    header.appendChild(controls);

    // Table wrapper
    const tableWrapper = document.createElement('div');
    tableWrapper.id = 'table-content';
    tableWrapper.style.cssText = `
      flex: 1;
      overflow: auto;
      background: rgba(15, 15, 20, 0.95);
    `;

    container.appendChild(header);
    container.appendChild(tableWrapper);

    // Store expanded height
    let expandedHeight = 300;

    // Collapse/expand functionality
    header.addEventListener('click', () => {
      this.isCollapsed = !this.isCollapsed;
      if (this.isCollapsed) {
        expandedHeight = container.offsetHeight; // Remember current height
        container.style.height = '45px';
        tableWrapper.style.display = 'none';
        collapseIcon.style.transform = 'rotate(-90deg)';
        this.updateToolbarPosition();
      } else {
        container.style.height = expandedHeight + 'px'; // Restore previous height
        tableWrapper.style.display = 'block';
        collapseIcon.style.transform = 'rotate(0deg)';
        this.updateToolbarPosition();
      }
    });

    document.body.appendChild(container);
    this.tableContainer = container;
  }

  /**
   * Populate the table with current properties
   */
  private populateTable(): void {
    if (!this.tableContainer || this.currentProperties.length === 0) return;

    const tableWrapper = this.tableContainer.querySelector('#table-content') as HTMLElement;
    if (!tableWrapper) return;

    // Update count
    const countSpan = this.tableContainer.querySelector('#table-count') as HTMLElement;
    if (countSpan) {
      countSpan.textContent = `(${this.currentProperties.length} elements)`;
    }

    // Get all unique column names
    const columns = new Set<string>();
    columns.add('expressID');
    columns.add('type');
    columns.add('name');
    columns.add('globalId');
    
    this.currentProperties.forEach(row => {
      Object.keys(row).forEach(key => columns.add(key));
    });

    const columnArray = Array.from(columns);

    // Create table
    const table = document.createElement('table');
    table.style.cssText = `
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      color: #ddd;
    `;

    // Create header
    const thead = document.createElement('thead');
    thead.style.cssText = `
      position: sticky;
      top: 0;
      background: rgba(40, 40, 50, 0.98);
      z-index: 10;
    `;
    
        // Header row with column names and filter buttons
    const headerRow = document.createElement('tr');
    columnArray.forEach(col => {
      const th = document.createElement('th');
      th.style.cssText = `
        padding: 10px 12px;
        text-align: left;
        border-bottom: 2px solid #4a90e2;
        border-right: 1px solid rgba(255, 255, 255, 0.1);
        font-weight: 600;
        color: #4a90e2;
        white-space: nowrap;
        background: rgba(40, 40, 50, 0.98);
        position: relative;
      `;

      // Container for column name and filter button
      const headerContent = document.createElement('div');
      headerContent.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      `;

      const columnName = document.createElement('span');
      columnName.textContent = this.formatColumnName(col);
      columnName.style.cssText = `
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      `;

      const filterButton = document.createElement('button');
      const hasActiveFilter = this.columnFilters.has(col) && this.columnFilters.get(col)!.size > 0;
      filterButton.innerHTML = hasActiveFilter ? '🔽' : '▼';
      filterButton.style.cssText = `
        padding: 2px 6px;
        border: 1px solid ${hasActiveFilter ? '#4a90e2' : 'rgba(74, 144, 226, 0.3)'};
        border-radius: 3px;
        background: ${hasActiveFilter ? 'rgba(74, 144, 226, 0.2)' : 'rgba(20, 20, 30, 0.8)'};
        color: ${hasActiveFilter ? '#4a90e2' : '#888'};
        font-size: 10px;
        cursor: pointer;
        outline: none;
        transition: all 0.2s;
        flex-shrink: 0;
      `;

      filterButton.addEventListener('mouseenter', () => {
        filterButton.style.background = 'rgba(74, 144, 226, 0.3)';
        filterButton.style.borderColor = '#4a90e2';
      });

      filterButton.addEventListener('mouseleave', () => {
        filterButton.style.background = hasActiveFilter ? 'rgba(74, 144, 226, 0.2)' : 'rgba(20, 20, 30, 0.8)';
        filterButton.style.borderColor = hasActiveFilter ? '#4a90e2' : 'rgba(74, 144, 226, 0.3)';
      });

      // Generate unique ID for this button
      filterButton.id = `filter-btn-${col}-${Date.now()}`;
      
      filterButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showFilterDropdown(col, filterButton, th);
      });

      headerContent.appendChild(columnName);
      headerContent.appendChild(filterButton);
      th.appendChild(headerContent);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    
    table.appendChild(thead);

    // Filter rows based on column filters (Excel-style)
    const filteredProperties = this.currentProperties.filter(row => {
      for (const [col, selectedValues] of this.columnFilters) {
        if (selectedValues.size === 0) continue; // No filter applied
        
        const cellValue = row[col];
        const cellText = cellValue !== undefined && cellValue !== null ? String(cellValue) : '-';
        
        if (!selectedValues.has(cellText)) {
          return false; // Row value not in selected values
        }
      }
      return true; // Row matches all filters
    });

    // Create body
    const tbody = document.createElement('tbody');
    filteredProperties.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.style.cssText = `
        background: ${index % 2 === 0 ? 'rgba(25, 25, 35, 0.5)' : 'rgba(20, 20, 30, 0.5)'};
        transition: background 0.2s;
      `;
      tr.addEventListener('mouseenter', () => {
        tr.style.background = 'rgba(74, 144, 226, 0.15)';
      });
      tr.addEventListener('mouseleave', () => {
        tr.style.background = index % 2 === 0 ? 'rgba(25, 25, 35, 0.5)' : 'rgba(20, 20, 30, 0.5)';
      });

      columnArray.forEach(col => {
        const td = document.createElement('td');
        const value = row[col];
        td.textContent = value !== undefined && value !== null ? String(value) : '-';
        td.style.cssText = `
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 300px;
        `;
        td.title = td.textContent || ''; // Tooltip for long values
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    // Show filtered count if filters are active
    if (this.columnFilters.size > 0 && filteredProperties.length !== this.currentProperties.length) {
      const countSpan = this.tableContainer?.querySelector('#table-count') as HTMLElement;
      if (countSpan) {
        countSpan.textContent = `(${filteredProperties.length} of ${this.currentProperties.length} elements)`;
      }
    }
    table.appendChild(tbody);

    tableWrapper.innerHTML = '';
    tableWrapper.appendChild(table);
    
    // Highlight filtered elements in 3D view
    this.highlightFilteredElements(filteredProperties);
  }

  /**
   * Highlight filtered elements in the 3D view by adjusting opacity
   */
  private highlightFilteredElements(filteredProperties: PropertyRow[]): void {
    // Clear previous highlights first
    if (this.highlighter) {
      this.highlighter.clear('property-table-filter');
    }

    console.log('📊 ClusterScene available:', !!this.clusterScene);

    // If no cluster scene, try highlighter (fallback)
    if (!this.clusterScene) {
      console.log('📊 No cluster scene, using highlighter fallback');
      this.highlightWithHighlighter(filteredProperties);
      return;
    }

    // If no filters or all elements shown, restore all opacity
    if (this.columnFilters.size === 0 || filteredProperties.length === this.currentProperties.length) {
      console.log('📊 No filters active - restoring all elements');
      this.restoreAllOpacity();
      return;
    }

    console.log(`📊 Filtering ${filteredProperties.length} of ${this.currentProperties.length} elements in cluster view`);

    // Get filtered element IDs
    const filteredIds = new Set(filteredProperties.map(row => row.expressID));
    console.log('📊 Filtered IDs (first 10):', Array.from(filteredIds).slice(0, 10));

    // Traverse cluster scene and adjust opacity
    let dimmedCount = 0;
    let visibleCount = 0;
    let totalMeshes = 0;
    let itemGroupsProcessed = 0;

    // Find all item groups (top-level groups with expressID and category)
    const itemGroups: THREE.Object3D[] = [];
    this.clusterScene.traverse((object) => {
      // Look for item groups - they have both expressID and category userData
      if (object.userData.expressID !== undefined && 
          object.userData.category !== undefined &&
          object.name && object.name.includes('_Item_')) {
        itemGroups.push(object);
      }
    });

    console.log(`📊 Found ${itemGroups.length} item groups`);

    // Now apply opacity to each item group
    itemGroups.forEach((itemGroup) => {
      itemGroupsProcessed++;
      const expressID = itemGroup.userData.expressID;
      
      if (filteredIds.has(expressID)) {
        // Keep filtered elements fully visible - apply to all children
        itemGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            totalMeshes++;
            // Clone material if it's shared to avoid affecting other items
            if (!child.userData.materialCloned) {
              if (Array.isArray(child.material)) {
                child.material = child.material.map(mat => mat.clone());
              } else {
                child.material = child.material.clone();
              }
              child.userData.materialCloned = true;
            }
            
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => {
                mat.opacity = 1.0;
                mat.transparent = false;
                mat.depthWrite = true;
                mat.needsUpdate = true;
              });
            } else {
              child.material.opacity = 1.0;
              child.material.transparent = false;
              child.material.depthWrite = true;
              child.material.needsUpdate = true;
            }
            child.visible = true;
            child.renderOrder = 0;
          }
        });
        visibleCount++;
      } else {
        // Dim non-filtered elements - apply to all children
        itemGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            totalMeshes++;
            // Clone material if it's shared to avoid affecting other items
            if (!child.userData.materialCloned) {
              if (Array.isArray(child.material)) {
                child.material = child.material.map(mat => mat.clone());
              } else {
                child.material = child.material.clone();
              }
              child.userData.materialCloned = true;
            }
            
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => {
                mat.opacity = 0.15;
                mat.transparent = true;
                mat.depthWrite = false;
                mat.needsUpdate = true;
              });
            } else {
              child.material.opacity = 0.15;
              child.material.transparent = true;
              child.material.depthWrite = false;
              child.material.needsUpdate = true;
            }
            child.renderOrder = -1;
          }
        });
        dimmedCount++;
      }
    });

    console.log(`✅ Cluster filter applied: ${visibleCount} visible items, ${dimmedCount} dimmed items, ${itemGroupsProcessed} total items, ${totalMeshes} meshes`);
  }

  /**
   * Restore opacity for all elements in cluster scene
   */
  private restoreAllOpacity(): void {
    if (!this.clusterScene) return;

    this.clusterScene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => {
            mat.opacity = 1.0;
            mat.transparent = false;
            mat.depthWrite = true;
            mat.needsUpdate = true;
          });
        } else if (object.material) {
          object.material.opacity = 1.0;
          object.material.transparent = false;
          object.material.depthWrite = true;
          object.material.needsUpdate = true;
        }
        object.visible = true;
        object.renderOrder = 0;
      }
    });
  }

  /**
   * Fallback: Use highlighter for non-cluster views
   */
  private highlightWithHighlighter(filteredProperties: PropertyRow[]): void {
    if (!this.highlighter) {
      console.warn('⚠️ Highlighter not available');
      return;
    }

    // If no filters or all elements shown, don't highlight
    if (this.columnFilters.size === 0 || filteredProperties.length === this.currentProperties.length) {
      console.log('📊 No filters active or all elements shown - clearing highlights');
      return;
    }

    console.log(`📊 Filtering ${filteredProperties.length} of ${this.currentProperties.length} elements`);

    // Build ModelIdMap for highlighting - group by modelId
    const modelIdMap: { [modelId: string]: Set<number> } = {};
    
    for (const row of filteredProperties) {
      if (!row.modelId) continue;
      
      if (!modelIdMap[row.modelId]) {
        modelIdMap[row.modelId] = new Set();
      }
      modelIdMap[row.modelId].add(row.expressID);
    }

    console.log('📊 ModelIdMap:', modelIdMap);

    // Apply highlight with green color
    if (Object.keys(modelIdMap).length > 0) {
      const greenColor = new THREE.Color(0x00ff00);
      this.highlighter.styles.set('property-table-filter', {
        color: greenColor,
        opacity: 0.6,
        transparent: true,
        renderedFaces: 1
      });
      
      this.highlighter.highlightByID('property-table-filter', modelIdMap, false);
      console.log(`✅ Highlighted ${filteredProperties.length} filtered elements in green`);
    } else {
      console.warn('⚠️ No valid modelIdMap created');
    }
  }

  /**
   * Show Excel-like filter dropdown for a column
   */
  private showFilterDropdown(columnName: string, button: HTMLElement, parentTh: HTMLElement): void {
    // Toggle: close if clicking the same button that opened the active dropdown
    if (this.activeFilterDropdown && this.activeFilterDropdown.dataset.buttonId === button.id) {
      this.activeFilterDropdown.remove();
      this.activeFilterDropdown = null;
      return;
    }

    // Close any other existing dropdown
    if (this.activeFilterDropdown) {
      this.activeFilterDropdown.remove();
      this.activeFilterDropdown = null;
    }

    // Get unique values for this column
    const uniqueValues = new Set<string>();
    this.currentProperties.forEach(row => {
      const value = row[columnName];
      const text = value !== undefined && value !== null ? String(value) : '-';
      uniqueValues.add(text);
    });

    const sortedValues = Array.from(uniqueValues).sort();

    // Create dropdown menu
    const dropdown = document.createElement('div');
    dropdown.style.cssText = `
      position: fixed;
      min-width: 250px;
      max-width: 400px;
      max-height: 350px;
      background: rgba(30, 30, 40, 0.98);
      border: 1px solid #4a90e2;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      flex-direction: column;
    `;

    // Search box
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = 'Search...';
    searchBox.style.cssText = `
      padding: 8px;
      border: none;
      border-bottom: 1px solid rgba(74, 144, 226, 0.3);
      background: rgba(20, 20, 30, 0.9);
      color: #ddd;
      font-size: 12px;
      outline: none;
    `;

    // Action buttons container
    const actionsDiv = document.createElement('div');
    actionsDiv.style.cssText = `
      display: flex;
      gap: 8px;
      padding: 8px;
      border-bottom: 1px solid rgba(74, 144, 226, 0.3);
    `;

    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.style.cssText = `
      flex: 1;
      padding: 4px 8px;
      border: 1px solid rgba(74, 144, 226, 0.5);
      border-radius: 3px;
      background: rgba(74, 144, 226, 0.1);
      color: #4a90e2;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.2s;
    `;

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = selectAllBtn.style.cssText;

    actionsDiv.appendChild(selectAllBtn);
    actionsDiv.appendChild(clearBtn);

    // Values container (scrollable)
    const valuesContainer = document.createElement('div');
    valuesContainer.style.cssText = `
      max-height: 200px;
      overflow-y: auto;
      padding: 4px;
      flex: 1;
      min-height: 0;
    `;

    // Get current filter for this column
    const currentFilter = this.columnFilters.get(columnName) || new Set();

    // Create checkbox items
    const checkboxItems: Map<string, HTMLInputElement> = new Map();
    sortedValues.forEach(value => {
      const item = document.createElement('label');
      item.style.cssText = `
        display: flex;
        align-items: center;
        padding: 6px 8px;
        cursor: pointer;
        color: #ddd;
        font-size: 12px;
        border-radius: 3px;
        transition: background 0.2s;
      `;

      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(74, 144, 226, 0.15)';
      });

      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = currentFilter.size === 0 || currentFilter.has(value);
      checkbox.style.cssText = `
        margin-right: 8px;
        cursor: pointer;
      `;

      const text = document.createElement('span');
      text.textContent = value;
      text.style.cssText = `
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;
      text.title = value;

      item.appendChild(checkbox);
      item.appendChild(text);
      valuesContainer.appendChild(item);
      checkboxItems.set(value, checkbox);
    });

    // Search functionality
    searchBox.addEventListener('input', () => {
      const searchTerm = searchBox.value.toLowerCase();
      valuesContainer.querySelectorAll('label').forEach((label, index) => {
        const value = sortedValues[index];
        const matches = value.toLowerCase().includes(searchTerm);
        (label as HTMLElement).style.display = matches ? 'flex' : 'none';
      });
    });

    // Select All button
    selectAllBtn.addEventListener('click', () => {
      checkboxItems.forEach(checkbox => {
        checkbox.checked = true;
      });
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
      checkboxItems.forEach(checkbox => {
        checkbox.checked = false;
      });
    });

    // OK/Apply button
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'OK';
    applyBtn.style.cssText = `
      margin: 8px;
      padding: 6px 12px;
      border: 1px solid #4a90e2;
      border-radius: 3px;
      background: rgba(74, 144, 226, 0.2);
      color: #4a90e2;
      font-size: 12px;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s;
      flex-shrink: 0;
    `;

    applyBtn.addEventListener('mouseenter', () => {
      applyBtn.style.background = 'rgba(74, 144, 226, 0.3)';
    });

    applyBtn.addEventListener('mouseleave', () => {
      applyBtn.style.background = 'rgba(74, 144, 226, 0.2)';
    });

    applyBtn.addEventListener('click', () => {
      const selectedValues = new Set<string>();
      checkboxItems.forEach((checkbox, value) => {
        if (checkbox.checked) {
          selectedValues.add(value);
        }
      });

      // Update filter
      if (selectedValues.size === sortedValues.length) {
        // All selected = no filter
        this.columnFilters.delete(columnName);
      } else if (selectedValues.size > 0) {
        this.columnFilters.set(columnName, selectedValues);
      } else {
        // None selected = filter out everything
        this.columnFilters.set(columnName, new Set());
      }

      // Close dropdown and refresh table
      dropdown.remove();
      this.activeFilterDropdown = null;
      this.populateTable(); // This will apply highlighting
    });

    // Assemble dropdown
    dropdown.appendChild(searchBox);
    dropdown.appendChild(actionsDiv);
    dropdown.appendChild(valuesContainer);
    dropdown.appendChild(applyBtn);

    // Append to body instead of parentTh for fixed positioning
    document.body.appendChild(dropdown);
    this.activeFilterDropdown = dropdown;
    
    // Store button reference for toggle detection
    dropdown.dataset.buttonId = button.id;

    // Position dropdown next to the button
    const buttonRect = button.getBoundingClientRect();
    const dropdownWidth = 250;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate dynamic dropdown height based on content
    // Formula: search(~40px) + actions(~40px) + values(max 200px) + apply(~40px) + padding
    const itemCount = sortedValues.length;
    const itemHeight = 30; // Approximate height per item
    const fixedHeight = 120; // search + actions + apply + padding
    const valuesHeight = Math.min(itemCount * itemHeight, 200);
    const dropdownHeight = fixedHeight + valuesHeight;
    
    // Calculate vertical position (below the button)
    let top = buttonRect.bottom + 2;
    
    // Calculate horizontal position
    let left = buttonRect.right - dropdownWidth;
    
    // Adjust if goes off right edge
    if (left + dropdownWidth > viewportWidth - 20) {
      left = viewportWidth - dropdownWidth - 20;
    }
    
    // Adjust if goes off left edge
    if (left < 20) {
      left = 20;
    }
    
    // Adjust if goes off bottom edge
    if (top + dropdownHeight > viewportHeight - 20) {
      top = buttonRect.top - dropdownHeight - 2; // Position above button
      if (top < 20) {
        top = 20; // Fallback to top of screen
        dropdown.style.maxHeight = (viewportHeight - 40) + 'px';
      }
    }
    
    dropdown.style.top = top + 'px';
    dropdown.style.left = left + 'px';

    // Close on outside click
    const closeHandler = (e: MouseEvent) => {
      if (!dropdown.contains(e.target as Node) && e.target !== button) {
        dropdown.remove();
        this.activeFilterDropdown = null;
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }

  /**
   * Format column name for display
   */
  private formatColumnName(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Export table data to CSV
   */
  private exportToCSV(): void {
    if (this.currentProperties.length === 0) return;

    // Filter rows based on column filters (same logic as table display)
    const filteredProperties = this.currentProperties.filter(row => {
      for (const [col, selectedValues] of this.columnFilters) {
        if (selectedValues.size === 0) continue; // No filter applied
        
        const cellValue = row[col];
        const cellText = cellValue !== undefined && cellValue !== null ? String(cellValue) : '-';
        
        if (!selectedValues.has(cellText)) {
          return false; // Row value not in selected values
        }
      }
      return true; // Row matches all filters
    });

    if (filteredProperties.length === 0) {
      console.warn('⚠️ No data to export');
      return;
    }

    // Get all columns
    const columns = new Set<string>();
    filteredProperties.forEach(row => {
      Object.keys(row).forEach(key => columns.add(key));
    });
    const columnArray = Array.from(columns);

    // Create CSV content
    let csv = columnArray.map(col => `"${this.formatColumnName(col)}"`).join(',') + '\n';
    
    filteredProperties.forEach(row => {
      const values = columnArray.map(col => {
        const value = row[col];
        const str = value !== undefined && value !== null ? String(value) : '';
        return `"${str.replace(/"/g, '""')}"`;
      });
      csv += values.join(',') + '\n';
    });

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ifc_properties_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`✅ Exported ${filteredProperties.length} rows to CSV`);
  }
}
