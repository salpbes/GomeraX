import { PropertyTableContext, PropertyRow } from './TableDataManager';

export class TableSortManager {
  public currentSort: { column: string; direction: 'asc' | 'desc' } | null = null;

  constructor(private context: PropertyTableContext) {}

  public sortData(column: string): void {
    const direction = this.currentSort?.column === column && this.currentSort.direction === 'asc' ? 'desc' : 'asc';
    this.currentSort = { column, direction };

    this.context.currentProperties.sort((a, b) => {
      const valA = a[column];
      const valB = b[column];

      if (valA === valB) return 0;
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      return direction === 'asc' ? comparison : -comparison;
    });

    this.context.populateTable();
  }
}
