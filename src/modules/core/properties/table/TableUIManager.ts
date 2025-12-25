import * as OBC from '@thatopen/components';
import { PropertyTableContext, PropertyRow } from './TableDataManager';

export class TableUIManager {
  private tableContainer: HTMLDivElement | null = null;
  private tableElement: HTMLTableElement | null = null;
  private loadingOverlay: HTMLDivElement | null = null;
  private loadingBar: HTMLDivElement | null = null;
  private loadingText: HTMLDivElement | null = null;
  private toolbar: HTMLDivElement | null = null;
  private tableHeader: HTMLTableSectionElement | null = null;
  private tableBody: HTMLTableSectionElement | null = null;
  
  private currentColumns: string[] = [];
  private allKnownColumns: Set<string> = new Set();

  constructor(private context: PropertyTableContext) {}

  public createTableUI(): HTMLDivElement {
    if (this.tableContainer) return this.tableContainer;

    this.tableContainer = document.createElement('div');
    this.tableContainer.id = 'property-table-container';
    this.tableContainer.className = 'property-table-container hidden';
    
    // Create Toolbar
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'property-table-toolbar';
    
    const title = document.createElement('div');
    title.className = 'property-table-title';
    title.innerHTML = '<i class="fas fa-table"></i> Property Table';
    
    const actions = document.createElement('div');
    actions.className = 'property-table-actions';
    
    const exportCsvBtn = document.createElement('button');
    exportCsvBtn.className = 'property-table-btn';
    exportCsvBtn.title = 'Export to CSV';
    exportCsvBtn.innerHTML = '<i class="fas fa-file-csv"></i>';
    exportCsvBtn.onclick = () => {
      const visibleData = this.getVisibleData();
      (this.context as any).exportManager.exportToCSV(visibleData);
    };

    const exportJsonBtn = document.createElement('button');
    exportJsonBtn.className = 'property-table-btn';
    exportJsonBtn.title = 'Export to JSON';
    exportJsonBtn.innerHTML = '<i class="fas fa-file-code"></i>';
    exportJsonBtn.onclick = () => {
      const visibleData = this.getVisibleData();
      (this.context as any).exportManager.exportToJSON(visibleData);
    };

    const clearFiltersBtn = document.createElement('button');
    clearFiltersBtn.className = 'property-table-btn';
    clearFiltersBtn.title = 'Clear All Filters';
    clearFiltersBtn.innerHTML = '<i class="fas fa-filter-circle-xmark"></i>';
    clearFiltersBtn.onclick = () => (this.context as any).filterManager.clearAllFilters();

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'property-table-btn collapse-btn';
    collapseBtn.title = 'Collapse/Expand';
    collapseBtn.innerHTML = '<i class="fas fa-compress-alt"></i>';
    collapseBtn.onclick = () => this.toggleCollapse();
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'property-table-btn close-btn';
    closeBtn.title = 'Close Table';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.onclick = () => this.context.restoreAllOpacity();

    actions.appendChild(exportCsvBtn);
    actions.appendChild(exportJsonBtn);
    actions.appendChild(clearFiltersBtn);
    actions.appendChild(collapseBtn);
    actions.appendChild(closeBtn);
    
    this.toolbar.appendChild(title);
    this.toolbar.appendChild(actions);
    
    // Create Table Wrapper
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'property-table-wrapper';
    
    this.tableElement = document.createElement('table');
    this.tableElement.className = 'property-table';
    
    this.tableHeader = document.createElement('thead');
    this.tableBody = document.createElement('tbody');
    
    this.tableElement.appendChild(this.tableHeader);
    this.tableElement.appendChild(this.tableBody);
    tableWrapper.appendChild(this.tableElement);
    
    // Create Loading Overlay
    this.loadingOverlay = document.createElement('div');
    this.loadingOverlay.className = 'property-table-loading-overlay hidden';
    
    const loadingContent = document.createElement('div');
    loadingContent.className = 'loading-content';
    
    this.loadingText = document.createElement('div');
    this.loadingText.className = 'loading-text';
    this.loadingText.textContent = 'Loading properties...';
    
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    
    this.loadingBar = document.createElement('div');
    this.loadingBar.className = 'progress-bar';
    
    progressContainer.appendChild(this.loadingBar);
    loadingContent.appendChild(this.loadingText);
    loadingContent.appendChild(progressContainer);
    this.loadingOverlay.appendChild(loadingContent);
    
    this.tableContainer.appendChild(this.toolbar);
    this.tableContainer.appendChild(tableWrapper);
    this.tableContainer.appendChild(this.loadingOverlay);
    
    document.body.appendChild(this.tableContainer);
    
    return this.tableContainer;
  }

  public initializeStreamingTable(rows: PropertyRow[], knownColumns: Set<string>): void {
    if (!this.tableHeader || !this.tableBody) return;
    
    this.allKnownColumns = knownColumns;
    this.tableHeader.innerHTML = '';
    this.tableBody.innerHTML = '';
    
    // Define initial columns
    const priorityCols = ['expressID', 'name', 'type', 'globalId'];
    const otherCols = Array.from(knownColumns).filter(c => !priorityCols.includes(c)).sort();
    this.currentColumns = [...priorityCols, ...otherCols.slice(0, this.context.INITIAL_COLUMNS)];
    
    this.renderHeader();
    this.appendRowsToTable(rows);
  }

  public renderHeader(): void {
    if (!this.tableHeader) return;
    this.tableHeader.innerHTML = '';
    const headerRow = document.createElement('tr');
    
    this.currentColumns.forEach(col => {
      const th = document.createElement('th');
      th.className = 'sortable';
      
      const content = document.createElement('div');
      content.className = 'th-content';
      
      const label = document.createElement('span');
      label.textContent = col.charAt(0).toUpperCase() + col.slice(1);
      
      // Add sort indicator
      const sortManager = (this.context as any).sortManager;
      if (sortManager.currentSort?.column === col) {
        const icon = document.createElement('i');
        icon.className = `fas fa-sort-${sortManager.currentSort.direction === 'asc' ? 'up' : 'down'} sort-indicator`;
        label.appendChild(icon);
      }
      
      const filterBtn = document.createElement('span');
      filterBtn.className = 'filter-icon';
      
      // Visual indicator for active filter
      const isFiltered = this.context.columnFilters.has(col) && this.context.columnFilters.get(col)!.size > 0;
      if (isFiltered) {
        filterBtn.classList.add('active');
        filterBtn.innerHTML = '<i class="fas fa-filter"></i>'; // Use standard filter icon but colored via CSS
      } else {
        filterBtn.innerHTML = '<i class="fas fa-filter"></i>';
      }

      filterBtn.onclick = (e) => {
        e.stopPropagation();
        (this.context as any).filterManager.createFilterDropdown(col, th);
      };
      
      content.appendChild(label);
      content.appendChild(filterBtn);
      th.appendChild(content);
      
      th.onclick = () => (this.context as any).sortManager.sortData(col);
      headerRow.appendChild(th);
    });

    // Add "Load More Columns" if needed
    if (this.currentColumns.length < this.allKnownColumns.size) {
      const loadMoreTh = document.createElement('th');
      loadMoreTh.className = 'load-more-columns';
      loadMoreTh.textContent = `+ ${this.allKnownColumns.size - this.currentColumns.length} more`;
      loadMoreTh.onclick = () => this.loadMoreColumns();
      headerRow.appendChild(loadMoreTh);
    }
    
    this.tableHeader.appendChild(headerRow);

    // Update Clear All Filters button state in toolbar
    const clearBtn = this.toolbar?.querySelector('.property-table-btn[title="Clear All Filters"]');
    if (clearBtn) {
      const hasFilters = this.context.columnFilters.size > 0;
      (clearBtn as HTMLElement).style.color = hasFilters ? '#ef4444' : '#999';
      (clearBtn as HTMLElement).style.opacity = hasFilters ? '1' : '0.5';
    }
  }

  private loadMoreColumns(): void {
    const allCols = Array.from(this.allKnownColumns);
    const nextCols = allCols.filter(c => !this.currentColumns.includes(c)).sort();
    
    this.currentColumns = [...this.currentColumns, ...nextCols.slice(0, 20)];
    this.renderHeader();
    this.context.populateTable();
  }

  public appendRowsToTable(rows: PropertyRow[]): void {
    if (!this.tableBody) return;
    
    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.onclick = () => (this.context as any).selectionManager.handleRowClick(row, tr);
      
      this.currentColumns.forEach(col => {
        const td = document.createElement('td');
        const val = row[col];
        td.textContent = val !== undefined && val !== null ? String(val) : '-';
        tr.appendChild(td);
      });
      
      this.tableBody!.appendChild(tr);
    });
  }

  public updateLoadingProgress(loaded: number, total: number, isComplete: boolean = false, isPaused: boolean = false): void {
    if (!this.loadingOverlay || !this.loadingBar || !this.loadingText) return;
    
    const percent = Math.round((loaded / total) * 100);
    this.loadingBar.style.width = `${percent}%`;
    
    if (isComplete) {
      this.loadingText.textContent = `Loaded all ${total} elements`;
      this.loadingOverlay?.classList.add('hidden');
    } else if (isPaused) {
      this.loadingText.textContent = `Paused at ${loaded}/${total} elements`;
    } else {
      this.loadingText.textContent = `Loading properties: ${loaded} / ${total} (${percent}%)`;
      this.loadingOverlay.classList.remove('hidden');
    }
  }

  public toggleCollapse(): void {
    if (!this.tableContainer) return;
    this.context.isCollapsed = !this.context.isCollapsed;
    this.tableContainer.classList.toggle('collapsed', this.context.isCollapsed);
    
    const btn = this.tableContainer.querySelector('.collapse-btn i');
    if (btn) {
      btn.className = this.context.isCollapsed ? 'fas fa-expand-alt' : 'fas fa-compress-alt';
    }
    
    this.updateToolbarPosition();
  }

  private getVisibleData(): PropertyRow[] {
    if (this.context.columnFilters.size === 0) {
      return this.context.currentProperties;
    }

    return this.context.currentProperties.filter(rowData => {
      let isVisible = true;
      for (const [col, filters] of this.context.columnFilters.entries()) {
        const val = rowData[col];
        const strVal = val !== undefined && val !== null ? String(val) : '-';
        if (!filters.has(strVal)) {
          isVisible = false;
          break;
        }
      }
      return isVisible;
    });
  }

  public updateToolbarPosition(): void {
    if (!this.tableContainer) return;
    
    const toolbar = document.querySelector('.bottom-toolbar') as HTMLElement;
    if (toolbar) {
      const bottomOffset = this.context.isCollapsed ? 45 : this.tableContainer.offsetHeight;
      toolbar.style.transition = 'bottom 0.3s ease';
      toolbar.style.bottom = `${bottomOffset + 20}px`;
    }
  }

  public showTable(): void {
    this.tableContainer?.classList.remove('hidden');
    this.context.isVisible = true;
    this.updateToolbarPosition();
  }

  public hideTable(): void {
    this.tableContainer?.classList.add('hidden');
    this.context.isVisible = false;
    
    const toolbar = document.querySelector('.bottom-toolbar') as HTMLElement;
    if (toolbar) {
      toolbar.style.transition = 'bottom 0.3s ease';
      toolbar.style.bottom = '20px';
    }
  }

  public clearTable(): void {
    if (this.tableHeader) this.tableHeader.innerHTML = '';
    if (this.tableBody) this.tableBody.innerHTML = '';
    if (this.loadingOverlay) this.loadingOverlay.classList.add('hidden');
  }
}
