import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import { PropertyTableContext, PropertyRow } from './TableDataManager';

export class TableSelectionManager {
  private selectedRow: HTMLElement | null = null;

  constructor(private context: PropertyTableContext) {}

  public clearSelection(): void {
    if (this.selectedRow) {
      this.selectedRow.classList.remove('selected');
      this.selectedRow = null;
    }
  }

  public handleRowClick(row: PropertyRow, tr: HTMLElement): void {
    if (this.selectedRow) {
      this.selectedRow.classList.remove('selected');
    }
    tr.classList.add('selected');
    this.selectedRow = tr;

    this.highlightObject(row.expressID, row.modelId);
    
    // Same type filter and isolate the clicked object in 3D
    if (row.type) {
      this.context.filterManager.setFilter('type', row.type);
    }
    this.context.filterManager.setIsolatedId(row.expressID);
    
    this.context.zoomToElement(row.expressID, row.modelId);
  }

  private async highlightObject(expressID: number, modelId?: string): Promise<void> {
    if (!this.context.highlighter || !modelId) return;

    const fragmentMap = {
      [modelId]: new Set([expressID])
    };

    try {
      // Disable automatic zoom in highlighter (we handle it manually for cluster view)
      await this.context.highlighter.highlightByID('select', fragmentMap, false, false);
    } catch (error) {
      console.warn('Could not highlight object in table selection:', error);
    }
  }
}
