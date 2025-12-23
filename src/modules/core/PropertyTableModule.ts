/**
 * PropertyTableModule - Displays IFC properties in an Excel-like table
 * Shows properties of visible objects in cluster view
 */

import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import type { WorldManager } from '../webgl';

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
  private clearFiltersBtn: HTMLElement | null = null;
  
  // Streaming state - for pausing/resuming data fetch
  private pendingFetch: {
    idsByModel: Map<string, number[]>;
    currentModelIndex: number;
    currentBatchIndex: number;
    totalCount: number;
    loadedCount: number;
    knownColumns: Set<string>;
  } | null = null;
  private onExitClusterCallback: (() => void) | null = null;

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
    this.fragmentsManager = this.components.get(OBC.FragmentsManager);
    this.highlighter = this.components.get(OBF.Highlighter);

    console.log('✅ PropertyTableModule initialized');
  }

  /**
   * Show the property table with data from visible elements
   * Now with streaming - shows rows as batches complete
   */
  public async showTable(elementsByCategory: Map<string, { [key: string]: Set<number> }>): Promise<void> {
    const startTime = performance.now();
    
    // Group IDs by Model ID to prevent cross-model ID collisions
    const idsByModel = new Map<string, number[]>();
    let totalCount = 0;
    
    for (const [category, elements] of elementsByCategory) {
      for (const modelId in elements) {
        if (!idsByModel.has(modelId)) {
          idsByModel.set(modelId, []);
        }
        const modelIds = idsByModel.get(modelId)!;
        elements[modelId].forEach(id => {
          modelIds.push(id);
          totalCount++;
        });
      }
    }

    console.log(`📊 PropertyTable: Collecting properties for ${totalCount} elements across ${idsByModel.size} models`);

    if (totalCount === 0) {
      console.warn('⚠️ No elements to display in table');
      return;
    }

    // Create UI immediately with loading state
    this.createTableUI();
    this.showLoadingState(totalCount);
    this.isVisible = true;
    this.updateToolbarPosition();

    // Reset properties
    this.currentProperties = [];

    // Fetch properties progressively and stream to table
    await this.fetchAndStreamProperties(idsByModel, totalCount);

    const elapsed = performance.now() - startTime;
    console.log(`📊 PropertyTable: Completed in ${elapsed.toFixed(0)}ms with ${this.currentProperties.length} rows`);
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
   * Show loading state in the table
   */
  private showLoadingState(totalCount: number): void {
    const tableWrapper = this.tableContainer?.querySelector('#table-content');
    console.log('📊 showLoadingState: tableWrapper found:', !!tableWrapper);
    if (!tableWrapper) {
      console.error('❌ Could not find #table-content element');
      return;
    }

    tableWrapper.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #4a90e2;
        gap: 16px;
      ">
        <div id="loading-spinner" style="
          width: 40px;
          height: 40px;
          border: 3px solid rgba(74, 144, 226, 0.2);
          border-top-color: #4a90e2;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        "></div>
        <div id="loading-text" style="font-size: 14px;">Loading properties for ${totalCount} elements...</div>
        <div id="loading-progress" style="
          width: 300px;
          height: 6px;
          background: rgba(74, 144, 226, 0.2);
          border-radius: 3px;
          overflow: hidden;
        ">
          <div id="progress-bar" style="
            width: 0%;
            height: 100%;
            background: #4a90e2;
            transition: width 0.3s ease;
          "></div>
        </div>
        <style>
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </div>
    `;
  }

  /**
   * Update loading progress
   */
  private updateLoadingProgress(loaded: number, total: number, isComplete: boolean = false, isPaused: boolean = false): void {
    const progressBar = this.tableContainer?.querySelector('#progress-bar') as HTMLElement;
    const loadingText = this.tableContainer?.querySelector('#loading-text') as HTMLElement;
    const loadingContainer = this.tableContainer?.querySelector('#loading-container') as HTMLElement;
    
    const percent = Math.round((loaded / total) * 100);
    
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
    if (loadingText) {
      if (isComplete) {
        loadingText.textContent = `✅ Loaded ${loaded} elements`;
        // Hide loading container after a short delay
        setTimeout(() => {
          if (loadingContainer) loadingContainer.style.display = 'none';
        }, 500);
      } else if (isPaused) {
        loadingText.textContent = `⏸️ Paused at ${loaded} of ${total} elements`;
      } else {
        loadingText.textContent = `Loading ${loaded} of ${total} elements...`;
      }
    }
  }

  /**
   * Set callback for exit cluster button
   */
  public setExitClusterCallback(callback: () => void): void {
    this.onExitClusterCallback = callback;
  }

  /**
   * Fetch and stream properties to table - pauses after first 100 rows
   */
  private async fetchAndStreamProperties(idsByModel: Map<string, number[]>, totalCount: number): Promise<void> {
    const BATCH_SIZE = 50;
    let loadedCount = 0;
    let tableInitialized = false;
    const knownColumns = new Set<string>();
    const modelEntries = Array.from(idsByModel.entries());

    console.log(`📊 Starting streaming fetch for ${totalCount} elements`);

    for (let modelIdx = 0; modelIdx < modelEntries.length; modelIdx++) {
      const [modelId, elementIds] = modelEntries[modelIdx];
      console.log(`📊 Processing model ${modelId} with ${elementIds.length} elements`);
      
      const model = this.fragmentsManager.list.get(modelId);
      if (!model) {
        console.warn(`⚠️ Model ${modelId} not found`);
        loadedCount += elementIds.length;
        this.updateLoadingProgress(loadedCount, totalCount);
        continue;
      }

      if (typeof (model as any).getItemsData !== 'function') {
        console.warn(`⚠️ Model ${modelId} does not have getItemsData method`);
        loadedCount += elementIds.length;
        this.updateLoadingProgress(loadedCount, totalCount);
        continue;
      }

      const totalBatches = Math.ceil(elementIds.length / BATCH_SIZE);
      
      for (let i = 0; i < elementIds.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const batchIds = elementIds.slice(i, i + BATCH_SIZE);
        const batchRows: PropertyRow[] = [];
        
        try {
          const startTime = performance.now();
          const ifcDataArray = await (model as any).getItemsData(batchIds, {
            attributesDefault: true,
            relations: {
              IsDefinedBy: { attributes: true, relations: true },
            },
          });
          const elapsed = performance.now() - startTime;
          console.log(`📊 Batch ${batchNum}/${totalBatches} fetched in ${elapsed.toFixed(0)}ms`);

          if (ifcDataArray && ifcDataArray.length > 0) {
            for (let j = 0; j < ifcDataArray.length; j++) {
              const ifcData = ifcDataArray[j];
              if (!ifcData) continue;

              const expressID = batchIds[j];
              const row = this.processIfcData(ifcData, expressID, modelId);
              batchRows.push(row);
              this.currentProperties.push(row);
              
              // Track columns
              Object.keys(row).forEach(key => knownColumns.add(key));
            }
          }
        } catch (error) {
          console.error(`❌ Error fetching batch ${batchNum}:`, error);
        }

        loadedCount += batchIds.length;
        
        // Initialize table after first batch
        if (!tableInitialized && batchRows.length > 0) {
          console.log(`📊 Initializing table with first ${batchRows.length} rows`);
          this.initializeStreamingTable(batchRows, knownColumns);
          tableInitialized = true;
        } else if (tableInitialized && batchRows.length > 0) {
          // Append new rows to existing table
          this.appendRowsToTable(batchRows);
        }
        
        this.updateLoadingProgress(loadedCount, totalCount);

        // Check if we've reached the initial row limit - PAUSE here
        if (this.loadedRowCount >= this.INITIAL_ROWS && loadedCount < totalCount) {
          console.log(`⏸️ Pausing fetch at ${loadedCount}/${totalCount} elements (${this.loadedRowCount} rows displayed)`);
          
          // Store pending work
          this.pendingFetch = {
            idsByModel: new Map(modelEntries.slice(modelIdx)),
            currentModelIndex: 0,
            currentBatchIndex: i + BATCH_SIZE,
            totalCount,
            loadedCount,
            knownColumns
          };
          // Update the current model's remaining IDs
          this.pendingFetch.idsByModel.set(modelId, elementIds.slice(i + BATCH_SIZE));
          
          // Show paused state with action buttons
          this.showPausedState(loadedCount, totalCount, knownColumns.size);
          return; // Exit - user will continue manually
        }
        
        // Yield to UI
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }

    // Mark loading complete
    this.updateLoadingProgress(loadedCount, totalCount, true);
    this.finishLoading();
  }

  /**
   * Show paused state with load more and exit buttons
   */
  private showPausedState(loadedCount: number, totalCount: number, columnCount: number): void {
    const loadingContainer = this.tableContainer?.querySelector('#loading-container') as HTMLElement;
    if (!loadingContainer) return;

    const remainingRows = totalCount - loadedCount;
    const remainingCols = columnCount - this.INITIAL_COLUMNS;

    loadingContainer.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
        width: 100%;
      ">
        <div style="color: #4a90e2; font-size: 12px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">📊</span>
          <span>Showing <strong>${this.loadedRowCount}</strong> of <strong>${totalCount}</strong> rows</span>
          <span style="color: #666;">|</span>
          <span><strong>${this.loadedColumnCount}</strong> of <strong>${columnCount}</strong> columns</span>
        </div>
        
        <div style="display: flex; gap: 10px; margin-left: auto;">
          <button id="load-more-data-btn" style="
            background: rgba(76, 175, 80, 0.2);
            border: 1px solid #4caf50;
            color: #4caf50;
            padding: 6px 14px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
          ">
            📥 Load ${Math.min(100, remainingRows)} more rows
          </button>
          
          <button id="exit-cluster-btn" style="
            background: rgba(244, 67, 54, 0.2);
            border: 1px solid #f44336;
            color: #f44336;
            padding: 6px 14px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
          ">
            ✕ Exit Cluster
          </button>
        </div>
      </div>
    `;

    // Add event listeners
    const loadMoreBtn = loadingContainer.querySelector('#load-more-data-btn') as HTMLElement;
    const exitBtn = loadingContainer.querySelector('#exit-cluster-btn') as HTMLElement;

    loadMoreBtn?.addEventListener('mouseenter', () => {
      loadMoreBtn.style.background = 'rgba(76, 175, 80, 0.3)';
    });
    loadMoreBtn?.addEventListener('mouseleave', () => {
      loadMoreBtn.style.background = 'rgba(76, 175, 80, 0.2)';
    });
    loadMoreBtn?.addEventListener('click', () => this.continueLoading());

    exitBtn?.addEventListener('mouseenter', () => {
      exitBtn.style.background = 'rgba(244, 67, 54, 0.3)';
    });
    exitBtn?.addEventListener('mouseleave', () => {
      exitBtn.style.background = 'rgba(244, 67, 54, 0.2)';
    });
    exitBtn?.addEventListener('click', () => {
      if (this.onExitClusterCallback) {
        this.onExitClusterCallback();
      }
    });
  }

  /**
   * Continue loading more data after pause
   */
  private async continueLoading(): Promise<void> {
    if (!this.pendingFetch) {
      console.warn('⚠️ No pending fetch to continue');
      return;
    }

    const BATCH_SIZE = 50;
    const { idsByModel, totalCount, knownColumns } = this.pendingFetch;
    let { loadedCount } = this.pendingFetch;
    const modelEntries = Array.from(idsByModel.entries());
    let rowsAddedThisSession = 0;
    const MAX_ROWS_PER_CONTINUE = 100;

    // Show loading state
    const loadingContainer = this.tableContainer?.querySelector('#loading-container') as HTMLElement;
    if (loadingContainer) {
      loadingContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="
            width: 16px;
            height: 16px;
            border: 2px solid rgba(74, 144, 226, 0.2);
            border-top-color: #4a90e2;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          "></div>
          <div style="color: #4a90e2; font-size: 12px;">Loading more data...</div>
          <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        </div>
      `;
    }

    console.log(`▶️ Continuing fetch from ${loadedCount}/${totalCount}`);

    for (let modelIdx = 0; modelIdx < modelEntries.length; modelIdx++) {
      const [modelId, elementIds] = modelEntries[modelIdx];
      
      if (elementIds.length === 0) continue;
      
      const model = this.fragmentsManager.list.get(modelId);
      if (!model || typeof (model as any).getItemsData !== 'function') {
        loadedCount += elementIds.length;
        continue;
      }

      for (let i = 0; i < elementIds.length; i += BATCH_SIZE) {
        const batchIds = elementIds.slice(i, i + BATCH_SIZE);
        const batchRows: PropertyRow[] = [];
        
        try {
          const ifcDataArray = await (model as any).getItemsData(batchIds, {
            attributesDefault: true,
            relations: {
              IsDefinedBy: { attributes: true, relations: true },
            },
          });

          if (ifcDataArray && ifcDataArray.length > 0) {
            for (let j = 0; j < ifcDataArray.length; j++) {
              const ifcData = ifcDataArray[j];
              if (!ifcData) continue;

              const expressID = batchIds[j];
              const row = this.processIfcData(ifcData, expressID, modelId);
              batchRows.push(row);
              this.currentProperties.push(row);
              Object.keys(row).forEach(key => knownColumns.add(key));
            }
          }
        } catch (error) {
          console.error(`❌ Error fetching batch:`, error);
        }

        loadedCount += batchIds.length;
        
        if (batchRows.length > 0) {
          this.appendRowsToTable(batchRows);
          rowsAddedThisSession += batchRows.length;
        }
        
        this.updateLoadingProgress(loadedCount, totalCount);

        // Pause again if we've added enough rows
        if (rowsAddedThisSession >= MAX_ROWS_PER_CONTINUE && loadedCount < totalCount) {
          console.log(`⏸️ Pausing again at ${loadedCount}/${totalCount}`);
          
          this.pendingFetch = {
            idsByModel: new Map(modelEntries.slice(modelIdx)),
            currentModelIndex: 0,
            currentBatchIndex: i + BATCH_SIZE,
            totalCount,
            loadedCount,
            knownColumns
          };
          this.pendingFetch.idsByModel.set(modelId, elementIds.slice(i + BATCH_SIZE));
          
          this.showPausedState(loadedCount, totalCount, knownColumns.size);
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }

    // All done
    this.pendingFetch = null;
    this.updateLoadingProgress(loadedCount, totalCount, true);
    this.finishLoading();
  }

  /**
   * Finish loading and update UI
   */
  private finishLoading(): void {
    // Update table count
    const tableCount = this.tableContainer?.querySelector('#table-count');
    if (tableCount) {
      tableCount.textContent = `(${this.currentProperties.length} rows)`;
    }

    // Highlight filtered elements
    this.highlightFilteredElements(this.currentProperties);
    
    console.log(`✅ Loading complete: ${this.currentProperties.length} rows in table`);
  }

  /**
   * Initialize the streaming table with first batch of data
   */
  private initializeStreamingTable(rows: PropertyRow[], knownColumns: Set<string>): void {
    const tableWrapper = this.tableContainer?.querySelector('#table-content') as HTMLElement;
    if (!tableWrapper) return;

    // Build column list - prioritize important columns first
    const priorityColumns = ['expressID', 'type', 'name', 'globalId', 'description', 'objectType'];
    const otherColumns = Array.from(knownColumns).filter(c => !priorityColumns.includes(c)).sort();
    this.allColumns = [...priorityColumns.filter(c => knownColumns.has(c)), ...otherColumns];
    
    // Show only first N columns initially (lazy column loading)
    const initialColumns = this.allColumns.slice(0, this.INITIAL_COLUMNS);
    this.loadedColumnCount = initialColumns.length;
    const hasMoreColumns = this.allColumns.length > this.INITIAL_COLUMNS;

    // Show only first N rows initially (lazy row loading)
    const rowsToRender = rows.slice(0, this.INITIAL_ROWS);
    this.loadedRowCount = rowsToRender.length;

    // Create table structure
    const table = document.createElement('table');
    table.style.cssText = `
      width: max-content;
      min-width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      table-layout: auto;
    `;

    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.id = 'main-header-row';

    initialColumns.forEach(col => {
      headerRow.appendChild(this.createHeaderCell(col));
    });

    if (hasMoreColumns) {
      const loadMoreTh = document.createElement('th');
      loadMoreTh.id = 'load-more-columns-header';
      loadMoreTh.style.cssText = `
        padding: 10px 20px;
        text-align: center;
        border-bottom: 2px solid #ff9800;
        background: rgba(255, 152, 0, 0.15);
        color: #ff9800;
        cursor: pointer;
        font-weight: 600;
        white-space: nowrap;
        position: sticky;
        top: 0;
        min-width: 150px;
      `;
      loadMoreTh.textContent = `+ ${this.allColumns.length - this.INITIAL_COLUMNS} more`;
      loadMoreTh.title = 'Click to load more columns';
      loadMoreTh.addEventListener('click', () => this.loadMoreColumns());
      headerRow.appendChild(loadMoreTh);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body
    const tbody = document.createElement('tbody');
    tbody.id = 'streaming-tbody';
    
    rowsToRender.forEach((row, idx) => {
      tbody.appendChild(this.createDataRow(row, idx, initialColumns, hasMoreColumns));
    });

    table.appendChild(tbody);

    // Store references
    this.tableElement = table;
    this.theadElement = thead;
    this.tbodyElement = tbody;
    this.currentFilteredProperties = this.currentProperties;

    // Create container with loading indicator at top
    tableWrapper.innerHTML = `
      <div id="loading-container" style="
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        z-index: 100;
        background: rgba(30, 30, 40, 0.95);
        padding: 8px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        border-bottom: 1px solid rgba(74, 144, 226, 0.3);
      ">
        <div style="
          width: 16px;
          height: 16px;
          border: 2px solid rgba(74, 144, 226, 0.2);
          border-top-color: #4a90e2;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        "></div>
        <div id="loading-text" style="color: #4a90e2; font-size: 12px;">Loading...</div>
        <div style="flex: 1; max-width: 200px; height: 4px; background: rgba(74, 144, 226, 0.2); border-radius: 2px; overflow: hidden;">
          <div id="progress-bar" style="width: 0%; height: 100%; background: #4a90e2; transition: width 0.2s;"></div>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
      </div>
    `;
    tableWrapper.appendChild(table);

    // Add event listeners
    this.setupTableEventListeners(tableWrapper);

    console.log(`📊 Initialized table with ${rowsToRender.length}/${rows.length} rows, ${initialColumns.length}/${this.allColumns.length} columns`);
  }

  /**
   * Append new rows to the streaming table (respects row limit)
   */
  private appendRowsToTable(rows: PropertyRow[]): void {
    if (!this.tbodyElement) return;

    const hasMoreColumns = this.loadedColumnCount < this.allColumns.length;
    const columns = this.allColumns.slice(0, this.loadedColumnCount);
    
    // Calculate how many more rows we can add before hitting the limit
    const remainingSlots = this.INITIAL_ROWS - this.loadedRowCount;
    if (remainingSlots <= 0) {
      // Already at row limit, just update the "load more" button count
      this.updateLoadMoreRowsButton();
      return;
    }

    const rowsToAdd = rows.slice(0, remainingSlots);
    const startIndex = this.loadedRowCount;

    const fragment = document.createDocumentFragment();
    rowsToAdd.forEach((row, idx) => {
      fragment.appendChild(this.createDataRow(row, startIndex + idx, columns, hasMoreColumns));
    });

    // Remove existing "load more rows" button if present
    const existingLoadMore = this.tbodyElement.querySelector('#load-more-rows-row');
    if (existingLoadMore) existingLoadMore.remove();

    this.tbodyElement.appendChild(fragment);
    this.loadedRowCount += rowsToAdd.length;

    // Add "load more rows" button if we have more rows
    this.updateLoadMoreRowsButton();
  }

  /**
   * Update or create the "Load more rows" button
   */
  private updateLoadMoreRowsButton(): void {
    if (!this.tbodyElement) return;

    const totalRows = this.currentProperties.length;
    const remainingRows = totalRows - this.loadedRowCount;

    // Remove existing button
    const existingBtn = this.tbodyElement.querySelector('#load-more-rows-row');
    if (existingBtn) existingBtn.remove();

    if (remainingRows > 0) {
      const loadMoreRow = document.createElement('tr');
      loadMoreRow.id = 'load-more-rows-row';
      const loadMoreCell = document.createElement('td');
      loadMoreCell.colSpan = this.loadedColumnCount + (this.loadedColumnCount < this.allColumns.length ? 1 : 0);
      loadMoreCell.style.cssText = `
        padding: 12px 20px;
        text-align: center;
        background: rgba(76, 175, 80, 0.1);
        border: 1px dashed rgba(76, 175, 80, 0.5);
        color: #4caf50;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s;
      `;
      loadMoreCell.textContent = `📥 Load ${Math.min(100, remainingRows)} more rows (${remainingRows} remaining)`;
      loadMoreCell.addEventListener('mouseenter', () => {
        loadMoreCell.style.background = 'rgba(76, 175, 80, 0.2)';
      });
      loadMoreCell.addEventListener('mouseleave', () => {
        loadMoreCell.style.background = 'rgba(76, 175, 80, 0.1)';
      });
      loadMoreCell.addEventListener('click', () => this.loadMoreRows());
      loadMoreRow.appendChild(loadMoreCell);
      this.tbodyElement.appendChild(loadMoreRow);
    }
  }

  /**
   * Load more rows (lazy row loading)
   */
  private loadMoreRows(): void {
    if (!this.tbodyElement) return;

    const startTime = performance.now();
    const ROWS_PER_BATCH = 100;
    const startRow = this.loadedRowCount;
    const endRow = Math.min(startRow + ROWS_PER_BATCH, this.currentProperties.length);
    const newRows = this.currentProperties.slice(startRow, endRow);

    console.log(`📊 Loading rows ${startRow + 1} to ${endRow} of ${this.currentProperties.length}`);

    // Remove "load more" button
    const loadMoreBtn = this.tbodyElement.querySelector('#load-more-rows-row');
    if (loadMoreBtn) loadMoreBtn.remove();

    const hasMoreColumns = this.loadedColumnCount < this.allColumns.length;
    const columns = this.allColumns.slice(0, this.loadedColumnCount);

    const fragment = document.createDocumentFragment();
    newRows.forEach((row, idx) => {
      fragment.appendChild(this.createDataRow(row, startRow + idx, columns, hasMoreColumns));
    });

    this.tbodyElement.appendChild(fragment);
    this.loadedRowCount = endRow;

    // Add new "load more" button if needed
    this.updateLoadMoreRowsButton();

    const elapsed = performance.now() - startTime;
    console.log(`✅ Loaded ${newRows.length} more rows in ${elapsed.toFixed(0)}ms (now ${this.loadedRowCount} of ${this.currentProperties.length})`);
  }

  /**
   * Setup event listeners for the table
   */
  private setupTableEventListeners(tableWrapper: HTMLElement): void {
    // Filter button clicks
    tableWrapper.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const filterBtn = target.closest('button[data-column]') as HTMLElement;
      if (filterBtn) {
        const column = filterBtn.dataset.column!;
        const th = filterBtn.closest('th')!;
        this.showFilterDropdown(column, filterBtn, th);
      }
    });

    // Row hover
    tableWrapper.addEventListener('mouseover', (e) => {
      const tr = (e.target as HTMLElement).closest('tbody tr') as HTMLElement;
      if (tr && !tr.id) {
        tr.style.background = 'rgba(74, 144, 226, 0.15)';
      }
    });

    tableWrapper.addEventListener('mouseout', (e) => {
      const tr = (e.target as HTMLElement).closest('tbody tr') as HTMLElement;
      if (tr && !tr.id) {
        const index = parseInt(tr.dataset.rowIndex || '0');
        tr.style.background = index % 2 === 0 ? 'rgba(25, 25, 35, 0.5)' : 'rgba(20, 20, 30, 0.5)';
      }
    });
  }

  /**
   * Fetch IFC properties progressively in batches
   * @deprecated Use fetchAndStreamProperties instead
   */
  private async fetchPropertiesProgressively(idsByModel: Map<string, number[]>, totalCount: number): Promise<PropertyRow[]> {
    const properties: PropertyRow[] = [];
    const BATCH_SIZE = 50; // Process 50 elements at a time for faster UI updates
    let loadedCount = 0;

    console.log(`📊 Starting progressive fetch for ${totalCount} elements in ${idsByModel.size} models`);

    for (const [modelId, elementIds] of idsByModel) {
      console.log(`📊 Processing model ${modelId} with ${elementIds.length} elements`);
      
      const model = this.fragmentsManager.list.get(modelId);
      if (!model) {
        console.warn(`⚠️ Model ${modelId} not found`);
        loadedCount += elementIds.length;
        this.updateLoadingProgress(loadedCount, totalCount);
        continue;
      }

      if (typeof (model as any).getItemsData !== 'function') {
        console.warn(`⚠️ Model ${modelId} does not have getItemsData method`);
        loadedCount += elementIds.length;
        this.updateLoadingProgress(loadedCount, totalCount);
        continue;
      }

      // Process in batches
      const totalBatches = Math.ceil(elementIds.length / BATCH_SIZE);
      console.log(`📊 Will process ${totalBatches} batches of ${BATCH_SIZE}`);
      
      for (let i = 0; i < elementIds.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const batchIds = elementIds.slice(i, i + BATCH_SIZE);
        
        console.log(`📊 Fetching batch ${batchNum}/${totalBatches} (${batchIds.length} items)...`);
        
        try {
          const startTime = performance.now();
          const ifcDataArray = await (model as any).getItemsData(batchIds, {
            attributesDefault: true,
            relations: {
              IsDefinedBy: { attributes: true, relations: true },
            },
          });
          const elapsed = performance.now() - startTime;
          console.log(`📊 Batch ${batchNum} fetched in ${elapsed.toFixed(0)}ms`);

          if (ifcDataArray && ifcDataArray.length > 0) {
            for (let j = 0; j < ifcDataArray.length; j++) {
              const ifcData = ifcDataArray[j];
              if (!ifcData) continue;

              const expressID = batchIds[j];
              const row = this.processIfcData(ifcData, expressID, modelId);
              properties.push(row);
            }
          }
        } catch (error) {
          console.error(`❌ Error fetching batch ${batchNum} for model ${modelId}:`, error);
        }

        loadedCount += batchIds.length;
        this.updateLoadingProgress(loadedCount, totalCount);
        
        // Yield to UI thread after every batch
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    console.log(`✅ Progressive fetch complete: ${properties.length} properties loaded`);
    return properties;
  }

  /**
   * Process IFC data into a PropertyRow
   */
  private processIfcData(ifcData: any, expressID: number, modelId: string): PropertyRow {
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

    return row;
  }

  /**
   * Fetch IFC properties for given element IDs, grouped by model
   * @deprecated Use fetchPropertiesProgressively instead
   */
  private async fetchProperties(idsByModel: Map<string, number[]>): Promise<PropertyRow[]> {
    const properties: PropertyRow[] = [];

    for (const [modelId, elementIds] of idsByModel) {
      const model = this.fragmentsManager.list.get(modelId);
      if (!model) {
        console.warn(`⚠️ Model ${modelId} not found`);
        continue;
      }

      if (typeof (model as any).getItemsData !== 'function') {
        console.warn(`⚠️ Model ${modelId} does not have getItemsData method`);
        continue;
      }

      try {
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

        for (let i = 0; i < ifcDataArray.length; i++) {
          const ifcData = ifcDataArray[i];
          if (!ifcData) continue;
          const row = this.processIfcData(ifcData, elementIds[i], modelId);
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

    // Clear filters button
    const clearFiltersBtn = document.createElement('button');
    clearFiltersBtn.innerHTML = '🔄 Clear Filters';
    clearFiltersBtn.style.cssText = `
      background: rgba(255, 152, 0, 0.2);
      border: 1px solid #ff9800;
      color: #ff9800;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
      display: none;
    `;
    clearFiltersBtn.addEventListener('mouseenter', () => {
      clearFiltersBtn.style.background = 'rgba(255, 152, 0, 0.3)';
    });
    clearFiltersBtn.addEventListener('mouseleave', () => {
      clearFiltersBtn.style.background = 'rgba(255, 152, 0, 0.2)';
    });
    clearFiltersBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearAllFilters();
    });

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

    controls.appendChild(clearFiltersBtn);
    controls.appendChild(exportBtn);
    controls.appendChild(collapseIcon);
    controls.appendChild(closeBtn);

    // Store reference to clear filters button
    this.clearFiltersBtn = clearFiltersBtn;

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

  // Track columns and rows for lazy loading
  private allColumns: string[] = [];
  private loadedColumnCount: number = 0;
  private loadedRowCount: number = 0;
  private readonly INITIAL_COLUMNS = 20;
  private readonly INITIAL_ROWS = 100;
  private currentFilteredProperties: PropertyRow[] = [];
  private tableElement: HTMLTableElement | null = null;
  private theadElement: HTMLTableSectionElement | null = null;
  private tbodyElement: HTMLTableSectionElement | null = null;

  /**
   * Populate the table with current properties (optimized for large datasets)
   */
  private populateTable(): void {
    if (!this.tableContainer || this.currentProperties.length === 0) return;

    const tableWrapper = this.tableContainer.querySelector('#table-content') as HTMLElement;
    if (!tableWrapper) return;

    // Show loading indicator
    tableWrapper.innerHTML = '<div style="padding: 20px; text-align: center; color: #4a90e2;">Building table...</div>';

    // Use requestAnimationFrame to yield to the main thread and allow UI to update
    requestAnimationFrame(() => {
      this.populateTableAsync(tableWrapper);
    });
  }

  /**
   * Async table population with lazy column loading
   */
  private populateTableAsync(tableWrapper: HTMLElement): void {
    const startTime = performance.now();

    // Update count
    const countSpan = this.tableContainer?.querySelector('#table-count') as HTMLElement;
    if (countSpan) {
      countSpan.textContent = `(${this.currentProperties.length} elements)`;
    }

    // Show/hide clear filters button based on active filters
    if (this.clearFiltersBtn) {
      this.clearFiltersBtn.style.display = this.columnFilters.size > 0 ? 'block' : 'none';
    }

    // Get all unique column names - prioritize common columns first
    const priorityColumns = ['expressID', 'type', 'name', 'globalId', 'description', 'objectType', 'tag'];
    const otherColumns = new Set<string>();
    
    this.currentProperties.forEach(row => {
      Object.keys(row).forEach(key => {
        if (!priorityColumns.includes(key)) {
          otherColumns.add(key);
        }
      });
    });

    // Sort other columns alphabetically
    const sortedOtherColumns = Array.from(otherColumns).sort();
    this.allColumns = [...priorityColumns.filter(c => 
      this.currentProperties.some(row => row[c] !== undefined)
    ), ...sortedOtherColumns];

    console.log(`📊 Table has ${this.allColumns.length} columns, ${this.currentProperties.length} rows`);

    // Filter rows based on column filters (Excel-style)
    this.currentFilteredProperties = this.currentProperties.filter(row => {
      for (const [col, selectedValues] of this.columnFilters) {
        if (selectedValues.size === 0) continue;
        const cellValue = row[col];
        const cellText = cellValue !== undefined && cellValue !== null ? String(cellValue) : '-';
        if (!selectedValues.has(cellText)) {
          return false;
        }
      }
      return true;
    });

    // Update filtered count
    if (this.columnFilters.size > 0 && this.currentFilteredProperties.length !== this.currentProperties.length) {
      if (countSpan) {
        countSpan.textContent = `(${this.currentFilteredProperties.length} of ${this.currentProperties.length} elements)`;
      }
    }

    // LAZY COLUMN LOADING: Start with first 20 columns
    const INITIAL_COLUMNS = 20;
    const initialColumns = this.allColumns.slice(0, INITIAL_COLUMNS);
    this.loadedColumnCount = initialColumns.length;
    const hasMoreColumns = this.allColumns.length > INITIAL_COLUMNS;

    // Create table
    const table = document.createElement('table');
    table.style.cssText = `
      border-collapse: collapse;
      font-size: 12px;
      color: #ddd;
      table-layout: auto;
    `;
    this.tableElement = table;

    // Create header
    const thead = document.createElement('thead');
    thead.style.cssText = `
      position: sticky;
      top: 0;
      background: rgba(40, 40, 50, 0.98);
      z-index: 10;
    `;
    this.theadElement = thead;
    
    const headerRow = document.createElement('tr');
    headerRow.id = 'main-header-row';
    
    // Build initial header cells
    initialColumns.forEach(col => {
      headerRow.appendChild(this.createHeaderCell(col));
    });

    // Add "load more columns" cell if needed
    if (hasMoreColumns) {
      const loadMoreTh = document.createElement('th');
      loadMoreTh.id = 'load-more-columns-header';
      loadMoreTh.style.cssText = `
        padding: 10px 20px;
        text-align: center;
        border-bottom: 2px solid #ff9800;
        background: rgba(255, 152, 0, 0.15);
        color: #ff9800;
        cursor: pointer;
        font-weight: 600;
        white-space: nowrap;
        position: sticky;
        top: 0;
        min-width: 180px;
      `;
      loadMoreTh.textContent = `+ ${this.allColumns.length - INITIAL_COLUMNS} more columns`;
      loadMoreTh.title = 'Click to load more columns';
      loadMoreTh.addEventListener('click', () => this.loadMoreColumns());
      headerRow.appendChild(loadMoreTh);
    }
    
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body
    const tbody = document.createElement('tbody');
    this.tbodyElement = tbody;
    
    // Limit rows for initial render
    const MAX_INITIAL_ROWS = 500;
    const rowsToRender = this.currentFilteredProperties.slice(0, MAX_INITIAL_ROWS);
    const hasMoreRows = this.currentFilteredProperties.length > MAX_INITIAL_ROWS;
    
    rowsToRender.forEach((row, index) => {
      const tr = this.createDataRow(row, index, initialColumns, hasMoreColumns);
      tbody.appendChild(tr);
    });
    
    // Add "load more rows" indicator if there are more rows
    if (hasMoreRows) {
      const loadMoreRow = document.createElement('tr');
      loadMoreRow.id = 'load-more-row';
      const loadMoreCell = document.createElement('td');
      loadMoreCell.colSpan = initialColumns.length + (hasMoreColumns ? 1 : 0);
      loadMoreCell.style.cssText = `
        padding: 15px;
        text-align: center;
        background: rgba(74, 144, 226, 0.1);
        color: #4a90e2;
        cursor: pointer;
        font-weight: 600;
      `;
      loadMoreCell.textContent = `Load ${this.currentFilteredProperties.length - MAX_INITIAL_ROWS} more rows...`;
      loadMoreCell.addEventListener('click', () => {
        this.loadRemainingRows(MAX_INITIAL_ROWS);
      });
      loadMoreRow.appendChild(loadMoreCell);
      tbody.appendChild(loadMoreRow);
    }
    
    table.appendChild(tbody);

    // Clear and append
    tableWrapper.innerHTML = '';
    tableWrapper.appendChild(table);

    // Add event delegation for filter buttons and row hover
    tableWrapper.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const filterBtn = target.closest('button[data-column]') as HTMLElement;
      if (filterBtn) {
        const column = filterBtn.dataset.column!;
        const th = filterBtn.closest('th')!;
        this.showFilterDropdown(column, filterBtn, th);
      }
    });

    // Event delegation for row hover
    tableWrapper.addEventListener('mouseover', (e) => {
      const tr = (e.target as HTMLElement).closest('tbody tr') as HTMLElement;
      if (tr && !tr.id) {
        tr.style.background = 'rgba(74, 144, 226, 0.15)';
      }
    });

    tableWrapper.addEventListener('mouseout', (e) => {
      const tr = (e.target as HTMLElement).closest('tbody tr') as HTMLElement;
      if (tr && !tr.id) {
        const index = parseInt(tr.dataset.rowIndex || '0');
        tr.style.background = index % 2 === 0 ? 'rgba(25, 25, 35, 0.5)' : 'rgba(20, 20, 30, 0.5)';
      }
    });

    const elapsed = performance.now() - startTime;
    console.log(`✅ Table rendered in ${elapsed.toFixed(0)}ms (${initialColumns.length} of ${this.allColumns.length} cols × ${rowsToRender.length} rows)`);

    // Highlight filtered elements in 3D view
    this.highlightFilteredElements(this.currentFilteredProperties);
  }

  /**
   * Create a header cell for a column
   */
  private createHeaderCell(col: string): HTMLTableCellElement {
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
      position: sticky;
      top: 0;
      min-width: 120px;
    `;
    th.dataset.column = col;

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
    filterButton.dataset.column = col;

    headerContent.appendChild(columnName);
    headerContent.appendChild(filterButton);
    th.appendChild(headerContent);
    
    return th;
  }

  /**
   * Create a data row with given columns
   */
  private createDataRow(row: PropertyRow, index: number, columns: string[], hasMoreColumns: boolean): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.style.cssText = `
      background: ${index % 2 === 0 ? 'rgba(25, 25, 35, 0.5)' : 'rgba(20, 20, 30, 0.5)'};
    `;
    tr.dataset.rowIndex = String(index);
    tr.dataset.expressId = String(row.expressID);

    columns.forEach(col => {
      tr.appendChild(this.createDataCell(row, col));
    });

    // Add placeholder cell for "load more columns"
    if (hasMoreColumns) {
      const placeholderTd = document.createElement('td');
      placeholderTd.className = 'load-more-placeholder';
      placeholderTd.style.cssText = `
        padding: 8px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(255, 152, 0, 0.05);
        text-align: center;
        color: #666;
      `;
      placeholderTd.textContent = '...';
      tr.appendChild(placeholderTd);
    }

    return tr;
  }

  /**
   * Create a data cell
   */
  private createDataCell(row: PropertyRow, col: string): HTMLTableCellElement {
    const td = document.createElement('td');
    const value = row[col];
    td.textContent = value !== undefined && value !== null ? String(value) : '-';
    td.style.cssText = `
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      border-right: 1px solid rgba(255, 255, 255, 0.05);
      white-space: nowrap;
      min-width: 120px;
      color: #e0e0e0;
    `;
    td.title = td.textContent || '';
    td.dataset.column = col;
    return td;
  }

  /**
   * Load more columns (lazy loading)
   */
  private loadMoreColumns(): void {
    if (!this.tableElement || !this.theadElement || !this.tbodyElement) return;
    
    const startTime = performance.now();
    const COLUMNS_PER_BATCH = 30;
    const startCol = this.loadedColumnCount;
    const endCol = Math.min(startCol + COLUMNS_PER_BATCH, this.allColumns.length);
    const newColumns = this.allColumns.slice(startCol, endCol);
    const hasMoreColumns = endCol < this.allColumns.length;

    console.log(`📊 Loading columns ${startCol + 1} to ${endCol} of ${this.allColumns.length}`);

    // Update header row
    const headerRow = this.theadElement.querySelector('#main-header-row');
    if (headerRow) {
      // Remove the "load more" header cell
      const loadMoreHeader = headerRow.querySelector('#load-more-columns-header');
      if (loadMoreHeader) loadMoreHeader.remove();

      // Add new header cells
      newColumns.forEach(col => {
        headerRow.appendChild(this.createHeaderCell(col));
      });

      // Add new "load more" cell if needed
      if (hasMoreColumns) {
        const loadMoreTh = document.createElement('th');
        loadMoreTh.id = 'load-more-columns-header';
        loadMoreTh.style.cssText = `
          padding: 10px 20px;
          text-align: center;
          border-bottom: 2px solid #ff9800;
          background: rgba(255, 152, 0, 0.15);
          color: #ff9800;
          cursor: pointer;
          font-weight: 600;
          white-space: nowrap;
          position: sticky;
          top: 0;
          min-width: 180px;
        `;
        loadMoreTh.textContent = `+ ${this.allColumns.length - endCol} more columns`;
        loadMoreTh.title = 'Click to load more columns';
        loadMoreTh.addEventListener('click', () => this.loadMoreColumns());
        headerRow.appendChild(loadMoreTh);
      }
    }

    // Update all data rows
    const dataRows = this.tbodyElement.querySelectorAll('tr:not(#load-more-row)');
    dataRows.forEach(tr => {
      const expressId = parseInt((tr as HTMLElement).dataset.expressId || '0');
      const row = this.currentFilteredProperties.find(r => r.expressID === expressId);
      if (!row) return;

      // Remove placeholder cell
      const placeholder = tr.querySelector('.load-more-placeholder');
      if (placeholder) placeholder.remove();

      // Add new data cells
      newColumns.forEach(col => {
        tr.appendChild(this.createDataCell(row, col));
      });

      // Add new placeholder if needed
      if (hasMoreColumns) {
        const placeholderTd = document.createElement('td');
        placeholderTd.className = 'load-more-placeholder';
        placeholderTd.style.cssText = `
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 152, 0, 0.05);
          text-align: center;
          color: #666;
        `;
        placeholderTd.textContent = '...';
        tr.appendChild(placeholderTd);
      }
    });

    // Update load more rows colspan if exists
    const loadMoreRow = this.tbodyElement.querySelector('#load-more-row td');
    if (loadMoreRow) {
      (loadMoreRow as HTMLTableCellElement).colSpan = endCol + (hasMoreColumns ? 1 : 0);
    }

    this.loadedColumnCount = endCol;
    
    const elapsed = performance.now() - startTime;
    console.log(`✅ Loaded ${newColumns.length} more columns in ${elapsed.toFixed(0)}ms (now ${this.loadedColumnCount} of ${this.allColumns.length})`);
  }

  /**
   * Load remaining rows when user clicks "Load more"
   * Updated to work with lazy column loading
   */
  private loadRemainingRows(startIndex: number): void {
    if (!this.tbodyElement) return;
    
    const startTime = performance.now();
    const fragment = document.createDocumentFragment();
    const hasMoreColumns = this.loadedColumnCount < this.allColumns.length;
    const columnsToRender = this.allColumns.slice(0, this.loadedColumnCount);
    
    for (let i = startIndex; i < this.currentFilteredProperties.length; i++) {
      const row = this.currentFilteredProperties[i];
      const tr = this.createDataRow(row, i, columnsToRender, hasMoreColumns);
      fragment.appendChild(tr);
    }

    // Remove the "load more rows" button
    const loadMoreRow = this.tbodyElement.querySelector('#load-more-row');
    if (loadMoreRow) loadMoreRow.remove();

    this.tbodyElement.appendChild(fragment);
    
    const elapsed = performance.now() - startTime;
    console.log(`✅ Loaded ${this.currentFilteredProperties.length - startIndex} more rows in ${elapsed.toFixed(0)}ms`);
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
   * Clear all column filters
   */
  private clearAllFilters(): void {
    this.columnFilters.clear();
    this.populateTable(); // Refresh table and restore all opacity
    console.log('✅ All filters cleared');
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
