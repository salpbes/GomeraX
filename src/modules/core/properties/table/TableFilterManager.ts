import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { PropertyTableContext, PropertyRow } from './TableDataManager';

export class TableFilterManager {
  private activeDropdown: HTMLDivElement | null = null;
  private isolatedId: number | null = null;

  constructor(private context: PropertyTableContext) {}

  public setIsolatedId(id: number | null): void {
    this.isolatedId = id;
    this.applyFilters();
  }

  public createFilterDropdown(column: string, th: HTMLElement): void {
    if (this.activeDropdown) {
      this.activeDropdown.remove();
      if (this.activeDropdown.dataset.column === column) {
        this.activeDropdown = null;
        return;
      }
    }

    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown';
    dropdown.dataset.column = column;
    this.activeDropdown = dropdown;

    // Get unique values for this column
    const values = new Set<string>();
    this.context.currentProperties.forEach(row => {
      const val = row[column];
      values.add(val !== undefined && val !== null ? String(val) : '-');
    });

    const sortedValues = Array.from(values).sort();
    const activeFilters = this.context.columnFilters.get(column) || new Set();

    // Search box
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = 'Search values...';
    searchBox.className = 'filter-search';
    dropdown.appendChild(searchBox);

    const list = document.createElement('div');
    list.className = 'filter-list';

    const renderList = (filterText: string = '') => {
      list.innerHTML = '';
      
      const filteredValues = sortedValues.filter(v => v.toLowerCase().includes(filterText.toLowerCase()));
      
      // Add "Select All" option
      if (filteredValues.length > 0) {
        const selectAllItem = document.createElement('div');
        selectAllItem.className = 'filter-item select-all';
        
        const allChecked = filteredValues.every(v => activeFilters.has(v));
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = allChecked;
        
        const label = document.createElement('span');
        label.innerHTML = '<i>Select All</i>';
        
        selectAllItem.onclick = (e) => {
          e.stopPropagation();
          const newState = !checkbox.checked;
          filteredValues.forEach(v => {
            if (newState) activeFilters.add(v);
            else activeFilters.delete(v);
          });
          this.context.columnFilters.set(column, new Set(activeFilters));
          this.applyFilters();
          renderList(filterText);
        };
        
        selectAllItem.appendChild(checkbox);
        selectAllItem.appendChild(label);
        list.appendChild(selectAllItem);
      }

      filteredValues.forEach(val => {
        const item = document.createElement('div');
        item.className = 'filter-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = activeFilters.has(val);
        
        const label = document.createElement('span');
        label.textContent = val;
        
        item.onclick = (e) => {
          e.stopPropagation();
          checkbox.checked = !checkbox.checked;
          this.toggleFilter(column, val, checkbox.checked);
        };
        
        checkbox.onclick = (e) => {
          e.stopPropagation();
          this.toggleFilter(column, val, checkbox.checked);
        };

        item.appendChild(checkbox);
        item.appendChild(label);
        list.appendChild(item);
      });
    };

    searchBox.oninput = () => renderList(searchBox.value);
    renderList();
    dropdown.appendChild(list);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'filter-actions';
    
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.onclick = () => {
      this.context.columnFilters.delete(column);
      this.applyFilters();
      dropdown.remove();
      this.activeDropdown = null;
    };
    
    actions.appendChild(clearBtn);
    dropdown.appendChild(actions);

    document.body.appendChild(dropdown);

    // Position dropdown
    const rect = th.getBoundingClientRect();
    const container = document.getElementById('property-table-container');
    const containerRect = container?.getBoundingClientRect();
    
    // Align to top of the table container (just below toolbar)
    let top = containerRect ? containerRect.top + 45 : rect.bottom;
    let left = rect.left;

    // Adjust if it goes off screen
    if (left + 220 > window.innerWidth) {
      left = window.innerWidth - 230;
    }
    
    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.maxHeight = containerRect ? `${containerRect.height - 60}px` : '300px';

    // Close on click outside
    const closeHandler = (e: MouseEvent) => {
      if (!dropdown.contains(e.target as Node) && !th.contains(e.target as Node)) {
        dropdown.remove();
        this.activeDropdown = null;
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);

    // Close on scroll (but not if scrolling inside the dropdown)
    const scrollHandler = (e: Event) => {
      if (dropdown.contains(e.target as Node)) return;
      
      dropdown.remove();
      this.activeDropdown = null;
      window.removeEventListener('scroll', scrollHandler, true);
      document.removeEventListener('wheel', scrollHandler, true);
    };
    window.addEventListener('scroll', scrollHandler, true);
    document.addEventListener('wheel', scrollHandler, true);
  }

  private toggleFilter(column: string, value: string, isChecked: boolean): void {
    this.isolatedId = null; // Clear isolation when user interacts with filters
    let filters = this.context.columnFilters.get(column);
    if (!filters) {
      filters = new Set();
      this.context.columnFilters.set(column, filters);
    }

    if (isChecked) {
      filters.add(value);
    } else {
      filters.delete(value);
      if (filters.size === 0) {
        this.context.columnFilters.delete(column);
      }
    }

    this.applyFilters();
  }

  public setFilter(column: string, value: string): void {
    const filters = new Set([value]);
    this.context.columnFilters.set(column, filters);
    this.applyFilters();
  }

  public applyFilters(): void {
    // Update header to show active filter icons immediately
    this.context.uiManager.renderHeader();

    const tableBody = document.querySelector('.property-table tbody');
    if (!tableBody) return;

    const visibleIds = new Set<number>();
    const rows = Array.from(tableBody.querySelectorAll('tr'));

    // Calculate visibility for ALL properties, not just rendered rows
    this.context.currentProperties.forEach((rowData, index) => {
      let isVisible = true;

      for (const [col, filters] of this.context.columnFilters.entries()) {
        const val = rowData[col];
        const strVal = val !== undefined && val !== null ? String(val) : '-';
        if (!filters.has(strVal)) {
          isVisible = false;
          break;
        }
      }

      if (isVisible) {
        visibleIds.add(rowData.expressID);
      }

      // Update the corresponding row if it's already rendered
      if (index < rows.length) {
        if (isVisible) {
          rows[index].classList.remove('hidden');
        } else {
          rows[index].classList.add('hidden');
        }
      }
    });

    this.updateOpacityInClusterScene(visibleIds);
  }

  private updateOpacityInClusterScene(visibleIds: Set<number>): void {
    // If no filters are active AND no isolation, restore full opacity to everything
    const isFilteringActive = this.context.columnFilters.size > 0;
    const isIsolationActive = this.isolatedId !== null;

    if (!this.context.clusterScene) {
      // If no cluster scene, ensure WebGPU isolation is cleared if no filters are active
      if (this.context.webgpu && !isFilteringActive && !isIsolationActive) {
        this.context.webgpu.setIsolatedElements(null);
      }
      return;
    }
    
    // WebGPU isolation collection
    const webgpuIsolated = new Set<number>();

    let updatedCount = 0;

    this.context.clusterScene.traverse((obj) => {
      // Check for both Mesh and Group (since items are groups of meshes)
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
        const expressID = obj.userData.expressID;
        if (expressID !== undefined && expressID !== null) {
          const id = Number(expressID);
          
          // Logic:
          // 1. If isolation is active, only the isolated ID is visible.
          // 2. If only filtering is active, all visibleIds are visible.
          // 3. If nothing is active, everything is visible.
          let isVisible = true;
          if (isIsolationActive) {
            isVisible = (id === this.isolatedId);
          } else if (isFilteringActive) {
            isVisible = visibleIds.has(id);
          }

          if (isVisible) {
            webgpuIsolated.add(id);
          }

          updatedCount++;
          
          // If it's a mesh, update its material
          if (obj instanceof THREE.Mesh && obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            materials.forEach((mat: any) => {
              mat.transparent = !isVisible; 
              mat.opacity = isVisible ? 1.0 : 0.35;
              mat.depthWrite = isVisible;
              
              if (mat.alphaToCoverage !== undefined) {
                mat.alphaToCoverage = !isVisible;
              }
              
              if (mat.needsUpdate !== undefined) {
                mat.needsUpdate = true;
              }
            });
          }
          
          // If it's a group, we need to update all its child meshes
          if (obj instanceof THREE.Group) {
            obj.traverse((child) => {
              if (child instanceof THREE.Mesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((mat: any) => {
                  mat.transparent = !isVisible; 
                  mat.opacity = isVisible ? 1.0 : 0.35;
                  mat.depthWrite = isVisible;
                  
                  if (mat.alphaToCoverage !== undefined) {
                    mat.alphaToCoverage = !isVisible;
                  }
                  
                  if (mat.needsUpdate !== undefined) {
                    mat.needsUpdate = true;
                  }
                });
              }
            });
          }
        }
      }
    });

    // Update WebGPU if active
    if (this.context.webgpu) {
      if (isFilteringActive || isIsolationActive) {
        const modelId = this.context.clusterScene.userData.modelId || 'default';
        const isolatedMap = new Map<string, Set<number>>();
        isolatedMap.set(modelId, webgpuIsolated);
        this.context.webgpu.setIsolatedElements(isolatedMap);
      } else {
        this.context.webgpu.setIsolatedElements(null);
      }
    }
  }

  public clearAllFilters(): void {
    this.context.columnFilters.clear();
    this.isolatedId = null;
    this.context.selectionManager.clearSelection();
    this.applyFilters();
  }
}
