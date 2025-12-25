import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import { WorldManager } from '../webgl';
import { 
  PropertyRow, 
  PropertyTableContext, 
  TableDataManager 
} from './properties/table/TableDataManager';
import { TableUIManager } from './properties/table/TableUIManager';
import { TableFilterManager } from './properties/table/TableFilterManager';
import { TableSortManager } from './properties/table/TableSortManager';
import { TableSelectionManager } from './properties/table/TableSelectionManager';
import { TableExportManager } from './properties/table/TableExportManager';

export class PropertyTableModule implements PropertyTableContext {
  public components: OBC.Components;
  public worldManager: WorldManager;
  public fragmentsManager: OBC.FragmentsManager;
  public highlighter: OBF.Highlighter | null = null;
  
  public currentProperties: PropertyRow[] = [];
  public columnFilters: Map<string, Set<string>> = new Map();
  public isVisible = false;
  public isCollapsed = false;
  public allElementIds: number[] = [];
  public clusterScene: THREE.Group | null = null;
  public webgpu: any = null;
  
  public readonly INITIAL_ROWS = 100;
  public readonly INITIAL_COLUMNS = 20;

  // Sub-managers
  public dataManager: TableDataManager;
  public uiManager: TableUIManager;
  public filterManager: TableFilterManager;
  public sortManager: TableSortManager;
  public selectionManager: TableSelectionManager;
  public exportManager: TableExportManager;

  private onExitClusterCallback: (() => void) | null = null;

  constructor(worldManager: WorldManager) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
    this.fragmentsManager = this.components.get(OBC.FragmentsManager);
    
    try {
      this.highlighter = this.components.get(OBF.Highlighter);
    } catch (e) {
      console.warn('Highlighter not found for PropertyTableModule');
    }

    // Initialize sub-managers
    this.dataManager = new TableDataManager(this);
    this.uiManager = new TableUIManager(this);
    this.filterManager = new TableFilterManager(this);
    this.sortManager = new TableSortManager(this);
    this.selectionManager = new TableSelectionManager(this);
    this.exportManager = new TableExportManager();

    this.uiManager.createTableUI();
  }

  /**
   * Show table for a cluster of elements
   */
  public async showClusterTable(
    idsByModel: Map<string, number[]>, 
    clusterScene: THREE.Group,
    onExit: () => void
  ): Promise<void> {
    console.log('📊 PropertyTableModule.showClusterTable() called with scene:', clusterScene.name);
    this.clusterScene = clusterScene;
    this.onExitClusterCallback = onExit;
    this.allElementIds = Array.from(idsByModel.values()).flat();
    
    this.currentProperties = [];
    this.columnFilters.clear();
    this.dataManager.setLoadedRowCount(0);
    
    this.uiManager.clearTable();
    this.uiManager.showTable();
    
    const totalCount = this.allElementIds.length;
    await this.dataManager.fetchAndStreamProperties(idsByModel, totalCount);
  }

  /**
   * Set cluster scene for filtering
   */
  public setClusterScene(scene: THREE.Group): void {
    this.clusterScene = scene;
  }

  /**
   * Set callback for when cluster view is exited
   */
  public setExitClusterCallback(callback: () => void): void {
    this.onExitClusterCallback = callback;
  }

  /**
   * Set WebGPU renderer module
   */
  public setWebGPURenderer(webgpu: any): void {
    this.webgpu = webgpu;
  }

  /**
   * Hide the property table and restore opacity
   */
  public hideTable(): void {
    this.restoreAllOpacity();
  }

  /**
   * Legacy showTable method for compatibility
   */
  public async showTable(elementsByCategory?: Map<string, { [key: string]: Set<number> }>): Promise<void> {
    // Reset state
    this.currentProperties = [];
    this.columnFilters.clear();
    this.dataManager.setLoadedRowCount(0);
    
    // UI reset
    this.uiManager.clearTable();
    this.uiManager.showTable();
    
    if (elementsByCategory) {
      await this.dataManager.loadPropertiesForCategories(elementsByCategory);
    } else {
      await this.dataManager.loadAllProperties();
    }
  }

  /**
   * Context Method Implementations
   */
  public updateLoadingProgress(loaded: number, total: number, isComplete?: boolean, isPaused?: boolean): void {
    this.uiManager.updateLoadingProgress(loaded, total, isComplete, isPaused);
  }

  public initializeStreamingTable(rows: PropertyRow[], knownColumns: Set<string>): void {
    this.uiManager.initializeStreamingTable(rows, knownColumns);
    this.filterManager.applyFilters();
  }

  public appendRowsToTable(rows: PropertyRow[]): void {
    this.uiManager.appendRowsToTable(rows);
    this.filterManager.applyFilters();
  }

  public finishLoading(): void {
    console.log(`✅ Table loading finished with ${this.currentProperties.length} rows`);
  }

  public populateTable(): void {
    this.uiManager.clearTable();
    const knownColumns = new Set<string>();
    this.currentProperties.forEach(row => {
      Object.keys(row).forEach(key => knownColumns.add(key));
    });
    this.uiManager.initializeStreamingTable(this.currentProperties, knownColumns);
    this.filterManager.applyFilters();
  }

  public updateToolbarPosition(): void {
    this.uiManager.updateToolbarPosition();
  }

  public async zoomToElement(expressID: number, modelId?: string): Promise<void> {
    if (!this.worldManager.world?.camera?.controls || !modelId) return;

    // Find the object in the cluster scene if it exists
    let targetObject: THREE.Object3D | null = null;
    if (this.clusterScene) {
      // Ensure world matrices are up to date for accurate bounding box calculation
      this.clusterScene.updateMatrixWorld(true);
      
      this.clusterScene.traverse((obj) => {
        if (obj.userData.expressID === expressID) {
          targetObject = obj;
        }
      });
    }

    if (targetObject) {
      const bbox = new THREE.Box3().setFromObject(targetObject);
      if (!bbox.isEmpty()) {
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = maxDim * 3;
        
        const isoVector = new THREE.Vector3(1, 0.5, 1).normalize().multiplyScalar(dist);
        const cameraPos = center.clone().add(isoVector);
        
        await (this.worldManager.world.camera as any).controls.setLookAt(
          cameraPos.x, cameraPos.y, cameraPos.z,
          center.x, center.y, center.z,
          true
        );
      }
    }
  }

  public restoreAllOpacity(): void {
    // Clear any active filters and isolation
    this.filterManager.clearAllFilters();

    if (this.clusterScene) {
      this.clusterScene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach(mat => {
            mat.transparent = true; // Keep transparent for WebGPU compatibility
            mat.opacity = 1.0;
            mat.depthWrite = true;
            if ((mat as any).alphaToCoverage !== undefined) {
              (mat as any).alphaToCoverage = false;
            }
            if ((mat as any).needsUpdate !== undefined) {
              (mat as any).needsUpdate = true;
            }
          });
        }
      });
    }
    
    // Clear highlighter selection and any other styles that might cause ghosting
    if (this.highlighter) {
      this.highlighter.clear('select');
      this.highlighter.clear('translucent');
      this.highlighter.clear('slicer-transparent');
      
      // Also clear any slicer-specific styles if they exist
      for (const styleName of Object.keys(this.highlighter.styles)) {
        if (styleName.startsWith('slicer-')) {
          this.highlighter.clear(styleName);
        }
      }
    }

    // Reset WebGPU isolation if active
    if (this.webgpu) {
      this.webgpu.setIsolatedElements(null);
      this.webgpu.setSlicerColors(false);
    }
    
    this.uiManager.hideTable();
    
    // Trigger exit callback if provided (this restores main model view)
    if (this.onExitClusterCallback) {
      this.onExitClusterCallback();
      this.onExitClusterCallback = null;
    }

    // Clear cluster scene reference
    this.clusterScene = null;
  }
}
