/**
 * SLICER DASHBOARD (The "Pizza Slicer Pro")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is the main tool for filtering your 3D model. It lets you click on 
 * categories (like "Show only Level 1" or "Show only Steel beams") and 
 * instantly hides everything else in the 3D view.
 * 
 * HOW IT CONNECTS:
 * - 3D Viewer: Highlights or hides objects based on what you click.
 * - Property Table: Keeps the data grid in sync with your filters.
 * - WebGPU: Tells the high-performance renderer which objects to show.
 * --------------------------------------------------------------------------------
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import { SlicerDataManager, SlicerConfig, SlicerState, PropertyData } from './dashboard/SlicerDataManager';
import { SlicerChartManager } from './dashboard/SlicerChartManager';
import { SlicerUIManager } from './dashboard/SlicerUIManager';
import type { WebGPURendererModule } from '../webgpu/WebGPURendererModule';

export class SlicerDashboard {
  private components: OBC.Components | null = null;
  private fragmentsManager: OBC.FragmentsManager | null = null;
  private highlighter: OBF.Highlighter | null = null;
  private webgpu: WebGPURendererModule | null = null;
  
  private dashboardElement: HTMLDivElement | null = null;
  private dataManager: SlicerDataManager;
  private chartManager: SlicerChartManager;
  private uiManager: SlicerUIManager;

  private slicerConfigs: SlicerConfig[] = [];
  private slicerStates: Map<string, SlicerState> = new Map();
  private propertyData: PropertyData[] = [];
  private filteredData: PropertyData[] = [];
  
  private primaryModelId: string = 'default';
  private activeHighlightStyles: Set<string> = new Set();
  
  private onFilterChange: ((filteredIds: Map<string, Set<number>>) => void) | null = null;

  constructor() {
    this.dataManager = new SlicerDataManager();
    this.chartManager = new SlicerChartManager();
    this.uiManager = new SlicerUIManager();
    console.log('✅ SlicerDashboard initialized');
  }

  public setOnFilterChange(callback: (filteredIds: Map<string, Set<number>>) => void): void {
    this.onFilterChange = callback;
  }

  public setWebGPURenderer(webgpu: WebGPURendererModule): void {
    this.webgpu = webgpu;
  }

  public async show(slicerData: any, components: OBC.Components, modelId?: string): Promise<void> {
    this.close();
    
    this.components = components;
    this.fragmentsManager = components.get(OBC.FragmentsManager);
    this.primaryModelId = modelId || 'default';
    
    try {
      this.highlighter = components.get(OBF.Highlighter);
    } catch (e) {
      console.warn('Highlighter not available');
    }
    
    this.propertyData = this.dataManager.convertSlicerDataToPropertyData(slicerData, this.primaryModelId);
    this.filteredData = [...this.propertyData];
    this.slicerConfigs = this.dataManager.autoGenerateSlicersFromData(slicerData);
    
    this.slicerConfigs.forEach(config => {
      this.slicerStates.set(config.id, { id: config.id, selectedValues: new Set(), searchText: '' });
    });
    
    this.applySplitScreenLayout();
    this.dashboardElement = this.uiManager.createDashboardUI(() => this.close());
    
    const header = this.uiManager.createHeader(() => this.close());
    const summaryBar = this.uiManager.createSummaryBar(this.propertyData.length);
    const footer = this.uiManager.createFooter(() => this.clearAllFilters(), () => this.exportFilteredData());
    
    const slicersContainer = document.createElement('div');
    slicersContainer.id = 'slicers-container';
    slicersContainer.style.cssText = `flex: 1; overflow-y: auto; padding: 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; align-content: start;`;
    
    this.slicerConfigs.forEach(config => {
      const slicer = this.createSlicer(config);
      slicersContainer.appendChild(slicer);
    });
    
    this.dashboardElement.appendChild(header);
    this.dashboardElement.appendChild(summaryBar);
    this.dashboardElement.appendChild(slicersContainer);
    this.dashboardElement.appendChild(footer);
    
    document.body.appendChild(this.dashboardElement);
    console.log(`📊 Slicer dashboard opened with ${this.slicerConfigs.length} slicers`);
  }

  private createSlicer(config: SlicerConfig): HTMLElement {
    const container = document.createElement('div');
    container.className = 'slicer-container';
    container.dataset.slicerId = config.id;
    const isFullWidth = config.title === 'IFC Type' && config.type === 'chart-bar';
    
    container.style.cssText = `background: rgba(30, 30, 45, 0.8); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; overflow: hidden; transition: all 0.3s; ${isFullWidth ? 'grid-column: 1 / -1;' : ''}`;

    const header = document.createElement('div');
    header.style.cssText = `padding: 12px 16px; background: rgba(74, 144, 226, 0.1); border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: space-between; align-items: center; cursor: pointer;`;
    
    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = `color: #4a90e2; font-weight: 600; font-size: 13px;`;
    titleSpan.textContent = config.title;
    
    const countBadge = document.createElement('span');
    countBadge.className = 'slicer-count-badge';
    countBadge.style.cssText = `background: rgba(74, 144, 226, 0.2); color: #4a90e2; padding: 2px 8px; border-radius: 10px; font-size: 11px;`;
    
    header.appendChild(titleSpan);
    header.appendChild(countBadge);
    container.appendChild(header);

    const narrative = document.createElement('div');
    narrative.className = 'slicer-narrative';
    narrative.style.cssText = `padding: 6px 16px; font-size: 11px; color: #888; background: rgba(0, 0, 0, 0.2); border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
    narrative.textContent = 'All items';
    container.appendChild(narrative);

    const content = document.createElement('div');
    content.className = 'slicer-content';
    content.style.cssText = `padding: 12px; max-height: 200px; overflow-y: auto;`;

    const values = this.dataManager.getPropertyValues(config.property, this.propertyData);
    countBadge.textContent = `${values.length} values`;

    if (config.type === 'chart-pie' || config.type === 'chart-bar') {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = `max-height: 260px; width: 100%;`;
      content.appendChild(canvas);
      this.chartManager.createChart(canvas, config, values, config.type === 'chart-pie' ? 'pie' : 'bar', (val, isMulti) => {
        const state = this.slicerStates.get(config.id)!;
        if (isMulti) {
          if (state.selectedValues.has(val)) state.selectedValues.delete(val);
          else state.selectedValues.add(val);
        } else {
          if (state.selectedValues.has(val) && state.selectedValues.size === 1) state.selectedValues.clear();
          else { state.selectedValues.clear(); state.selectedValues.add(val); }
        }
        this.applyFilters();
      });
    } else if (config.type === 'checkbox') {
      this.populateCheckboxSlicer(content, config, values);
    } else if (config.type === 'tile') {
      this.populateTileSlicer(content, config, values);
    } else if (config.type === 'search') {
      this.populateSearchSlicer(content, config);
    } else if (config.type === 'range') {
      this.populateRangeSlicer(content, config, values);
    }

    container.appendChild(content);
    header.addEventListener('click', () => {
      content.style.display = content.style.display === 'none' ? 'block' : 'none';
    });

    return container;
  }

  private populateCheckboxSlicer(container: HTMLElement, config: SlicerConfig, values: any[]): void {
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = '🔍 Search...';
    searchBox.style.cssText = `width: 100%; padding: 8px 12px; margin-bottom: 10px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #fff; font-size: 12px; outline: none;`;
    container.appendChild(searchBox);

    const list = document.createElement('div');
    list.style.cssText = `display: flex; flex-direction: column; gap: 4px;`;

    values.forEach(({ value, count }) => {
      const item = document.createElement('label');
      item.className = 'slicer-item';
      item.style.cssText = `display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s; border-left: 3px solid transparent;`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.cssText = `width: 16px; height: 16px; accent-color: #4a90e2; cursor: pointer;`;

      const label = document.createElement('span');
      label.style.cssText = `flex: 1; color: #e0e0e0; font-size: 12px; overflow: hidden; text-overflow: ellipsis;`;
      label.textContent = value;

      const countSpan = document.createElement('span');
      countSpan.style.cssText = `color: #666; font-size: 11px; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;`;
      countSpan.textContent = String(count);

      checkbox.addEventListener('change', () => {
        const state = this.slicerStates.get(config.id)!;
        if (checkbox.checked) { state.selectedValues.add(value); item.classList.add('selected'); }
        else { state.selectedValues.delete(value); item.classList.remove('selected'); }
        this.applyFilters();
      });

      item.appendChild(checkbox);
      item.appendChild(label);
      item.appendChild(countSpan);
      list.appendChild(item);
    });

    container.appendChild(list);
    searchBox.addEventListener('input', () => {
      const search = searchBox.value.toLowerCase();
      list.querySelectorAll('.slicer-item').forEach(item => {
        (item as HTMLElement).style.display = item.textContent?.toLowerCase().includes(search) ? 'flex' : 'none';
      });
    });
  }

  private populateTileSlicer(container: HTMLElement, config: SlicerConfig, values: any[]): void {
    const grid = document.createElement('div');
    grid.style.cssText = `display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;`;
    values.slice(0, 8).forEach(({ value, count }) => {
      const tile = document.createElement('div');
      tile.className = 'tile-item';
      tile.style.cssText = `padding: 12px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; cursor: pointer; transition: all 0.2s; text-align: center;`;
      tile.innerHTML = `<div style="color: #4a90e2; font-size: 20px; font-weight: 700;">${count}</div><div style="color: #888; font-size: 10px; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${value}</div>`;
      tile.addEventListener('click', () => {
        const state = this.slicerStates.get(config.id)!;
        if (tile.classList.contains('selected')) { state.selectedValues.delete(value); tile.classList.remove('selected'); }
        else {
          if (!config.multiSelect) { grid.querySelectorAll('.tile-item').forEach(t => t.classList.remove('selected')); state.selectedValues.clear(); }
          state.selectedValues.add(value); tile.classList.add('selected');
        }
        this.applyFilters();
      });
      grid.appendChild(tile);
    });
    container.appendChild(grid);
  }

  private populateSearchSlicer(container: HTMLElement, config: SlicerConfig): void {
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = `🔍 Search ${config.title}...`;
    searchBox.style.cssText = `width: 100%; padding: 12px 16px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(74, 144, 226, 0.3); border-radius: 8px; color: #fff; font-size: 13px; outline: none;`;
    let timeout: any;
    searchBox.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const state = this.slicerStates.get(config.id)!;
        state.searchText = searchBox.value;
        this.applyFilters();
      }, 300);
    });
    container.appendChild(searchBox);
  }

  private populateRangeSlicer(container: HTMLElement, config: SlicerConfig, values: any[]): void {
    const nums = values.map(v => parseFloat(v.value)).filter(v => !isNaN(v)).sort((a, b) => a - b);
    if (nums.length === 0) return;
    const min = nums[0], max = nums[nums.length - 1];
    container.innerHTML = `<div style="display: flex; flex-direction: column; gap: 12px;"><div style="display: flex; justify-content: space-between; color: #888; font-size: 11px;"><span>Min: ${min.toFixed(2)}</span><span>Max: ${max.toFixed(2)}</span></div><div style="display: flex; gap: 10px; align-items: center;"><input type="number" id="min-${config.id}" value="${min}" style="flex: 1; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #fff; font-size: 12px;"><span style="color: #666;">to</span><input type="number" id="max-${config.id}" value="${max}" style="flex: 1; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #fff; font-size: 12px;"></div></div>`;
    const minIn = container.querySelector(`#min-${config.id}`) as HTMLInputElement;
    const maxIn = container.querySelector(`#max-${config.id}`) as HTMLInputElement;
    const update = () => {
      const state = this.slicerStates.get(config.id)!;
      state.rangeMin = parseFloat(minIn.value);
      state.rangeMax = parseFloat(maxIn.value);
      this.applyFilters();
    };
    minIn.addEventListener('change', update);
    maxIn.addEventListener('change', update);
  }

  private applyFilters(): void {
    this.filteredData = this.propertyData.filter(row => {
      for (const config of this.slicerConfigs) {
        const state = this.slicerStates.get(config.id);
        if (!state) continue;
        if (state.selectedValues.size > 0 && !state.selectedValues.has(String(row[config.property] || ''))) return false;
        if (state.searchText && !String(row[config.property] || '').toLowerCase().includes(state.searchText.toLowerCase())) return false;
        if (state.rangeMin !== undefined && state.rangeMax !== undefined) {
          const val = parseFloat(String(row[config.property]));
          if (!isNaN(val) && (val < state.rangeMin || val > state.rangeMax)) return false;
        }
      }
      return true;
    });

    const countEl = document.getElementById('filtered-count');
    if (countEl) countEl.textContent = String(this.filteredData.length);
    this.updateActiveFiltersDisplay();

    if (this.onFilterChange) {
      const filteredIds = new Map<string, Set<number>>();
      this.filteredData.forEach(row => {
        const mid = row.modelId || this.primaryModelId;
        if (!filteredIds.has(mid)) filteredIds.set(mid, new Set());
        filteredIds.get(mid)!.add(row.expressID);
      });
      this.onFilterChange(filteredIds);
    }

    this.highlightFilteredElements();
    this.updateSlicers();
  }

  private updateSlicers(): void {
    for (const config of this.slicerConfigs) {
      const relevantData = this.propertyData.filter(row => {
        for (const other of this.slicerConfigs) {
          if (other.id === config.id) continue;
          const state = this.slicerStates.get(other.id);
          if (!state) continue;
          if (state.selectedValues.size > 0 && !state.selectedValues.has(String(row[other.property] || ''))) return false;
          if (state.searchText && !String(row[other.property] || '').toLowerCase().includes(state.searchText.toLowerCase())) return false;
        }
        return true;
      });

      const valueCounts = new Map<string, number>();
      relevantData.forEach(row => {
        const val = row[config.property];
        if (val) valueCounts.set(String(val), (valueCounts.get(String(val)) || 0) + 1);
      });

      const container = document.querySelector(`[data-slicer-id="${config.id}"]`);
      if (container) {
        const narrative = container.querySelector('.slicer-narrative') as HTMLElement;
        if (narrative) narrative.textContent = `Items: ${relevantData.length}`;
        
        if (config.type === 'chart-pie' || config.type === 'chart-bar') {
          this.chartManager.updateChart(config.id, valueCounts, config.type === 'chart-pie' ? 'pie' : 'bar');
        } else {
          container.querySelectorAll('.slicer-item, .tile-item').forEach(item => {
            const val = item.querySelector('span')?.textContent || item.querySelector('div:last-child')?.textContent || '';
            const count = valueCounts.get(val) || 0;
            const countEl = item.querySelector('span:last-child') || item.querySelector('div:first-child');
            if (countEl) countEl.textContent = String(count);
            (item as HTMLElement).style.opacity = count === 0 ? '0.4' : '1';
          });
        }
      }
    }
  }

  private updateActiveFiltersDisplay(): void {
    const container = document.getElementById('active-filters');
    if (!container) return;
    container.innerHTML = '';
    this.slicerStates.forEach((state, id) => {
      if (state.selectedValues.size > 0) {
        const config = this.slicerConfigs.find(c => c.id === id);
        const badge = document.createElement('span');
        badge.style.cssText = `background: rgba(74, 144, 226, 0.2); color: #4a90e2; padding: 3px 8px; border-radius: 12px; font-size: 10px; cursor: pointer;`;
        badge.textContent = `${config?.title}: ${Array.from(state.selectedValues).join(', ')} ✕`;
        badge.onclick = () => { state.selectedValues.clear(); this.applyFilters(); };
        container.appendChild(badge);
      }
    });
  }

  private highlightFilteredElements(): void {
    if (!this.highlighter) return;
    this.activeHighlightStyles.forEach(s => this.highlighter?.clear(s));
    this.activeHighlightStyles.clear();
    this.highlighter.clear('slicer-transparent');

    // WebGPU color collection
    const webgpuColors: Map<string, Map<number, THREE.Color>> = new Map();
    const webgpuIsolated: Map<string, Set<number>> = new Map();

    if (this.filteredData.length < this.propertyData.length && this.filteredData.length > 0) {
      const typeGroups: Map<string, { [modelId: string]: Set<number> }> = new Map();
      const filteredKeys = new Set<string>();
      
      this.filteredData.forEach(row => {
        const type = row.type || 'Other', mid = row.modelId || this.primaryModelId;
        if (!typeGroups.has(type)) typeGroups.set(type, {});
        const g = typeGroups.get(type)!;
        if (!g[mid]) g[mid] = new Set();
        g[mid].add(row.expressID);
        filteredKeys.add(`${mid}:${row.expressID}`);

        // Collect for WebGPU
        if (!webgpuColors.has(mid)) webgpuColors.set(mid, new Map());
        webgpuColors.get(mid)!.set(row.expressID, new THREE.Color(this.chartManager.getTypeColor(type)));
        
        if (!webgpuIsolated.has(mid)) webgpuIsolated.set(mid, new Set());
        webgpuIsolated.get(mid)!.add(row.expressID);
      });

      const trans: { [modelId: string]: Set<number> } = {};
      this.propertyData.forEach(row => {
        const mid = row.modelId || this.primaryModelId;
        if (!filteredKeys.has(`${mid}:${row.expressID}`)) {
          if (!trans[mid]) trans[mid] = new Set();
          trans[mid].add(row.expressID);
        }
      });

      if (Object.keys(trans).length > 0) {
        this.highlighter.styles.set('slicer-transparent', { 
          color: new THREE.Color(0x888888), 
          opacity: 0.6, 
          transparent: true, 
          renderedFaces: 1,
          alphaToCoverage: true,
          depthWrite: false
        } as any);
        this.highlighter.highlightByID('slicer-transparent', trans, false);
      }

      for (const [type, map] of typeGroups) {
        const style = `slicer-${type.replace(/[^a-zA-Z0-9]/g, '-')}`;
        this.highlighter.styles.set(style, { 
          color: new THREE.Color(this.chartManager.getTypeColor(type)), 
          opacity: 0.85, 
          transparent: true, 
          renderedFaces: 1,
          alphaToCoverage: true,
          depthWrite: false
        } as any);
        this.highlighter.highlightByID(style, map, false);
        this.activeHighlightStyles.add(style);
      }
      this.zoomToFilteredElements();
    } else {
      // If no filters are active, clear all slicer highlights
      if (this.highlighter) {
        this.activeHighlightStyles.forEach(s => this.highlighter?.clear(s));
        this.activeHighlightStyles.clear();
        this.highlighter.clear('slicer-transparent');
      }
    }

    // Update WebGPU if active
    if (this.webgpu) {
      if (this.filteredData.length < this.propertyData.length && this.filteredData.length > 0) {
        this.webgpu.setIsolatedElements(webgpuIsolated);
        this.webgpu.setSlicerColors(true, webgpuColors);
      } else {
        this.webgpu.setIsolatedElements(null);
        this.webgpu.setSlicerColors(false);
      }
    }
  }

  private async zoomToFilteredElements(): Promise<void> {
    if (!this.components || !this.fragmentsManager || this.filteredData.length === 0) return;
    const worlds = this.components.get(OBC.Worlds), world = worlds.list.values().next().value;
    if (!world?.camera?.controls) return;

    const box = new THREE.Box3();
    let valid = false;
    const modelMap: Map<string, number[]> = new Map();
    this.filteredData.forEach(r => {
      const mid = r.modelId || this.primaryModelId;
      if (!modelMap.has(mid)) modelMap.set(mid, []);
      modelMap.get(mid)!.push(r.expressID);
    });

    for (const [mid, ids] of modelMap) {
      const model = this.fragmentsManager.list.get(mid);
      if (model && (model as any).getMergedBox) {
        const b = await (model as any).getMergedBox(ids);
        if (b && !b.isEmpty()) { box.union(b); valid = true; }
      }
    }

    if (valid) {
      const center = new THREE.Vector3(), size = new THREE.Vector3();
      box.getCenter(center); box.getSize(size);
      await world.camera.controls.fitToSphere(new THREE.Sphere(center, size.length() / 2 * 1.2), true);
    }
  }

  private applySplitScreenLayout(): void {
    const canvas = document.querySelector('canvas')?.parentElement;
    if (canvas) { canvas.style.width = '50%'; canvas.style.position = 'absolute'; canvas.style.left = '0'; }
    const toolbar = document.querySelector('.bottom-toolbar') as HTMLElement;
    if (toolbar) toolbar.style.left = '25%';
    setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
  }

  private restoreFullScreenLayout(): void {
    const canvas = document.querySelector('canvas')?.parentElement;
    if (canvas) { canvas.style.width = '100%'; canvas.style.position = ''; canvas.style.left = ''; }
    const toolbar = document.querySelector('.bottom-toolbar') as HTMLElement;
    if (toolbar) toolbar.style.left = '50%';
    setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
  }

  public close(): void {
    this.chartManager.destroyCharts();
    if (this.dashboardElement) { this.dashboardElement.remove(); this.dashboardElement = null; this.restoreFullScreenLayout(); }
    if (this.highlighter) {
      this.activeHighlightStyles.forEach(s => this.highlighter?.clear(s));
      this.highlighter.clear('slicer-transparent');
    }
    
    // Reset WebGPU state if active
    if (this.webgpu) {
      this.webgpu.setIsolatedElements(null);
      this.webgpu.setSlicerColors(false);
    }
    
    this.slicerStates.clear();
  }

  private clearAllFilters(): void {
    this.slicerStates.forEach(s => { s.selectedValues.clear(); s.searchText = ''; s.rangeMin = s.rangeMax = undefined; });
    this.applyFilters();
  }

  private exportFilteredData(): void {
    if (this.filteredData.length === 0) return;
    const cols = Array.from(new Set(this.filteredData.flatMap(r => Object.keys(r))));
    let csv = cols.join(',') + '\n';
    this.filteredData.forEach(r => {
      csv += cols.map(c => {
        const v = String(r[c] || '').replace(/"/g, '""');
        return v.includes(',') ? `"${v}"` : v;
      }).join(',') + '\n';
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `filtered_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }
}
