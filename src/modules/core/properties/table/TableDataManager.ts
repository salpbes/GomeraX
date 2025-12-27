import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import { WorldManager } from '../../../webgl';

export interface PropertyRow {
  expressID: number;
  modelId?: string;
  name?: string;
  type?: string;
  globalId?: string;
  [key: string]: any;
}

export interface PropertyTableContext {
  components: OBC.Components;
  worldManager: WorldManager;
  fragmentsManager: OBC.FragmentsManager;
  highlighter: OBF.Highlighter | null;
  
  // State
  currentProperties: PropertyRow[];
  columnFilters: Map<string, Set<string>>;
  isVisible: boolean;
  isCollapsed: boolean;
  allElementIds: number[];
  clusterScene: THREE.Group | null;
  webgpu?: any;
  
  // Constants
  INITIAL_ROWS: number;
  INITIAL_COLUMNS: number;
  
  // Methods
  updateLoadingProgress(loaded: number, total: number, isComplete?: boolean, isPaused?: boolean): void;
  initializeStreamingTable(rows: PropertyRow[], knownColumns: Set<string>): void;
  appendRowsToTable(rows: PropertyRow[]): void;
  finishLoading(): void;
  populateTable(): void;
  updateToolbarPosition(): void;
  restoreAllOpacity(): void;
  zoomToElement(expressID: number, modelId?: string): Promise<void>;
  filterManager: any;
  selectionManager: any;
  uiManager: any;
  exportManager: any;
}

export class TableDataManager {
  private loadedRowCount: number = 0;

  constructor(private context: PropertyTableContext) {}

  public setLoadedRowCount(count: number) {
    this.loadedRowCount = count;
  }

  /**
   * Load all properties for all models
   */
  public async loadAllProperties(): Promise<void> {
    const idsByModel = new Map<string, number[]>();
    let totalCount = 0;

    for (const [modelId, model] of this.context.fragmentsManager.list) {
      try {
        // Get all categories in the model
        const categories = await (model as any).getCategories();
        
        // Query items for all categories
        const categoryRegexes = categories.map((cat: string) => new RegExp(`^${cat}$`));
        const itemsByCategory = await (model as any).getItemsOfCategories(categoryRegexes);
        
        const allIds: number[] = [];
        for (const categoryKey in itemsByCategory) {
          const ids = itemsByCategory[categoryKey];
          if (Array.isArray(ids)) {
            allIds.push(...ids);
          }
        }
        
        // Remove duplicates
        const uniqueIds = Array.from(new Set(allIds));
        
        if (uniqueIds.length > 0) {
          idsByModel.set(modelId, uniqueIds);
          totalCount += uniqueIds.length;
        }
      } catch (error) {
        console.error(`Error getting IDs for model ${modelId}:`, error);
      }
    }

    await this.fetchAndStreamProperties(idsByModel, totalCount);
  }

  /**
   * Load properties for specific categories (used by ColorSplash/Cluster)
   */
  public async loadPropertiesForCategories(elementsByCategory: Map<string, { [key: string]: Set<number> }>): Promise<void> {
    const idsByModel = new Map<string, Set<number>>();
    let totalCount = 0;

    for (const [category, models] of elementsByCategory) {
      for (const [modelId, ids] of Object.entries(models)) {
        if (!idsByModel.has(modelId)) {
          idsByModel.set(modelId, new Set<number>());
        }
        const modelIds = idsByModel.get(modelId)!;
        ids.forEach(id => {
          if (!modelIds.has(id)) {
            modelIds.add(id);
            totalCount++;
          }
        });
      }
    }

    // Convert Sets back to arrays for fetchAndStreamProperties
    const finalIdsByModel = new Map<string, number[]>();
    for (const [modelId, idSet] of idsByModel) {
      finalIdsByModel.set(modelId, Array.from(idSet));
    }

    await this.fetchAndStreamProperties(finalIdsByModel, totalCount);
  }

  /**

   * Fetch and stream properties to table - pauses after first 100 rows
   */
  public async fetchAndStreamProperties(idsByModel: Map<string, number[]>, totalCount: number, startLoadedCount: number = 0): Promise<void> {
    const BATCH_SIZE = 50;
    let loadedCount = startLoadedCount;
    let tableInitialized = this.loadedRowCount > 0;
    const knownColumns = new Set<string>();
    const modelEntries = Array.from(idsByModel.entries());

    // Update context with all IDs for filtering/exporting if this is a fresh load
    if (startLoadedCount === 0) {
      this.context.allElementIds = Array.from(idsByModel.values()).flat();
    }

    console.log(`📊 Starting streaming fetch for ${totalCount} elements (starting at ${startLoadedCount})`);

    let lastYieldTime = performance.now();

    for (let modelIdx = 0; modelIdx < modelEntries.length; modelIdx++) {
      const [modelId, elementIds] = modelEntries[modelIdx];
      
      const model = this.context.fragmentsManager.list.get(modelId);
      if (!model || typeof (model as any).getItemsData !== 'function') {
        loadedCount += elementIds.length;
        this.context.updateLoadingProgress(loadedCount, totalCount);
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
              this.context.currentProperties.push(row);
              
              // Only add new columns if we haven't seen them yet
              Object.keys(row).forEach(key => {
                if (!knownColumns.has(key)) knownColumns.add(key);
              });
            }
          }
        } catch (error) {
          console.error(`❌ Error fetching batch:`, error);
        }

        loadedCount += batchIds.length;
        this.loadedRowCount += batchRows.length;
        
        if (!tableInitialized && batchRows.length > 0) {
          this.context.initializeStreamingTable(batchRows, knownColumns);
          tableInitialized = true;
        } else if (tableInitialized && batchRows.length > 0) {
          this.context.appendRowsToTable(batchRows);
        }
        
        this.context.updateLoadingProgress(loadedCount, totalCount);

        // Yield to main thread to keep UI responsive
        const currentTime = performance.now();
        if (currentTime - lastYieldTime > 12) { // Yield if we've spent more than 12ms
          await new Promise(resolve => setTimeout(resolve, 0));
          lastYieldTime = performance.now();
        }
      }
    }

    this.context.updateLoadingProgress(loadedCount, totalCount, true);
    this.context.finishLoading();
  }

  /**
   * Process raw IFC data into a flat property row
   */
  public processIfcData(ifcData: any, expressID: number, modelId: string): PropertyRow {
    const row: PropertyRow = {
      expressID,
      modelId,
      name: ifcData.Name?.value || '-',
      type: ifcData.type || '-',
      globalId: ifcData.GlobalId?.value || '-'
    };

    // Extract attributes
    for (const [key, value] of Object.entries(ifcData)) {
      if (key.startsWith('_') || Array.isArray(value) || typeof value !== 'object') continue;
      const attr = value as any;
      if (attr && 'value' in attr && attr.value !== undefined && attr.value !== null) {
        row[key] = attr.value;
      }
    }

    // Extract property sets
    if (ifcData.IsDefinedBy && Array.isArray(ifcData.IsDefinedBy)) {
      for (const pset of ifcData.IsDefinedBy) {
        if (pset.HasProperties && Array.isArray(pset.HasProperties)) {
          for (const prop of pset.HasProperties) {
            const propName = prop.Name?.value;
            const propValue = prop.NominalValue?.value;
            if (propName && propValue !== undefined && propValue !== null) {
              row[propName] = propValue;
            }
          }
        }
      }
    }

    return row;
  }
}
