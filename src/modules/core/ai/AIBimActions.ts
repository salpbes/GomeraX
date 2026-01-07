import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import type { IFCViewer } from '../../../IFCViewer';
import { MeasurementMode } from '../../webgl/MeasurementModule';

export class AIBimActions {
  public components: OBC.Components;
  public fragments: OBC.FragmentsManager;

  constructor(public viewer: IFCViewer) {
    this.components = viewer.worldManager.getComponents();
    this.fragments = this.components.get(OBC.FragmentsManager);
  }

  public async getIdsByType(ifcType: string): Promise<Map<string, Set<number>>> {
    const result = new Map<string, Set<number>>();
    
    for (const [modelId, model] of this.fragments.list) {
      try {
        const categoryRegex = new RegExp(`^${ifcType}$`);
        const itemsByCategory = await (model as any).getItemsOfCategories([categoryRegex]);
        
        for (const category in itemsByCategory) {
          const ids = itemsByCategory[category];
          if (ids && ids.length > 0) {
            if (!result.has(modelId)) {
              result.set(modelId, new Set());
            }
            const modelSet = result.get(modelId)!;
            ids.forEach((id: number) => modelSet.add(id));
          }
        }
      } catch (e) {
        console.warn(`Could not get items of type ${ifcType} for model ${modelId}`, e);
      }
    }
    
    return result;
  }

  public async selectByType(ifcType: string): Promise<number> {
    const highlighter = this.components.get(OBF.Highlighter);
    if (!highlighter) return 0;

    highlighter.clear('select');
    const idsByModel = await this.getIdsByType(ifcType);
    
    let totalCount = 0;
    const selection: Record<string, Set<number>> = {};
    
    for (const [modelId, ids] of idsByModel) {
      selection[modelId] = ids;
      totalCount += ids.size;
    }
    
    if (totalCount > 0) {
      highlighter.highlightByID('select', selection);
    }
    
    return totalCount;
  }

  public async setVisibilityByType(ifcType: string, visible: boolean): Promise<number> {
    const hider = this.components.get(OBC.Hider);
    if (!hider) return 0;

    const idsByModel = await this.getIdsByType(ifcType);
    let totalCount = 0;
    
    const toggleData: Record<string, Set<number>> = {};
    for (const [modelId, ids] of idsByModel) {
      toggleData[modelId] = ids;
      totalCount += ids.size;
    }
    
    if (totalCount > 0) {
      hider.set(visible, toggleData);
    }
    
    return totalCount;
  }

  public async isolateByType(ifcType: string): Promise<number> {
    const hider = this.components.get(OBC.Hider);
    if (!hider) return 0;

    const idsByModel = await this.getIdsByType(ifcType);
    let totalCount = 0;
    
    const isolateData: Record<string, Set<number>> = {};
    for (const [modelId, ids] of idsByModel) {
      isolateData[modelId] = ids;
      totalCount += ids.size;
    }
    
    if (totalCount > 0) {
      hider.isolate(isolateData);
    }
    
    return totalCount;
  }

  public async zoomToType(ifcType: string): Promise<number> {
    const idsByModel = await this.getIdsByType(ifcType);
    let totalCount = 0;
    
    const overallBox = new THREE.Box3();
    for (const [modelId, ids] of idsByModel) {
      const model = this.fragments.list.get(modelId);
      if (model) {
        try {
          const bbox = await (model as any).getMergedBox(Array.from(ids));
          if (bbox && !bbox.isEmpty()) {
            overallBox.union(bbox);
            totalCount += ids.size;
          }
        } catch (e) {
          console.warn(`Could not get box for model ${modelId}`, e);
        }
      }
    }
    
    if (totalCount > 0 && !overallBox.isEmpty()) {
      const world = this.viewer.worldManager.world;
      if (world && world.camera instanceof OBC.OrthoPerspectiveCamera) {
        await world.camera.controls.fitToBox(overallBox, true);
      }
    }
    
    return totalCount;
  }

  public async colorByType() {
    if (this.viewer.colorSplash) {
      await this.viewer.colorSplash.toggleColorSplash();
    }
  }

  public async addClippingPlane(axis: 'x' | 'y' | 'z' = 'z') {
    if (!this.viewer.clipper) {
      console.warn('Clipper module not available');
      return;
    }

    // Enable clipper first
    this.viewer.clipper.setEnabled(true);

    // Create the appropriate axis plane
    switch (axis) {
      case 'x':
        this.viewer.clipper.createXAxisPlane();
        break;
      case 'y':
        this.viewer.clipper.createYAxisPlane();
        break;
      case 'z':
      default:
        this.viewer.clipper.createZAxisPlane();
        break;
    }
  }

  public async clearSelection() {
    const highlighter = this.components.get(OBF.Highlighter);
    if (highlighter) highlighter.clear('select');
  }

  public async resetView() {
    console.log('[AIBimActions] Starting resetView...');
    
    try {
      // 1. Exit cluster mode FIRST (it shows original models again)
      if (this.viewer.cluster?.isClusteringActive()) {
        console.log('[AIBimActions] Exiting cluster mode...');
        await this.viewer.cluster.exitToColorView();
      }

      // 2. Exit color splash mode if active
      if (this.viewer.colorSplash?.isColorSplashActive()) {
        console.log('[AIBimActions] Exiting color splash mode...');
        await this.viewer.colorSplash.toggleColorSplash();
      }

      // 3. Clear selection
      const highlighter = this.components.get(OBF.Highlighter);
      if (highlighter) highlighter.clear('select');
      
      // 4. Show all elements
      const hider = this.components.get(OBC.Hider);
      if (hider) hider.set(true);

      // 5. Clear clipping planes using ClipperModule (handles flip buttons too)
      if (this.viewer.clipper) {
        this.viewer.clipper.deleteAllPlanes();
        this.viewer.clipper.setEnabled(false);
      }

      // 6. Disable first-person mode if active
      if (this.viewer.firstPersonControls?.isActive()) {
        this.viewer.firstPersonControls.disable();
      }

      // 7. Clear measurements and disable measurement mode
      if (this.viewer.measurement) {
        this.viewer.measurement.clearAll();
        this.viewer.measurement.setMode(MeasurementMode.DISABLED);
      }

      // 8. Exit floor plan mode if active (restore 3D perspective)
      if ((window as any).isFloorPlanMode) {
        const world = this.viewer.worldManager.world;
        if (world && world.camera instanceof OBC.OrthoPerspectiveCamera) {
          await world.camera.projection.set('Perspective');
        }
        (window as any).isFloorPlanMode = false;
      }

      // 9. Fit camera to show entire model
      await this.fitAll();
      
      console.log('[AIBimActions] resetView completed successfully');
    } catch (error) {
      console.error('[AIBimActions] Error in resetView:', error);
    }
  }

  public async hideEverything() {
    const hider = this.components.get(OBC.Hider);
    if (hider) hider.set(false);
  }

  public async zoom(delta: number) {
    const world = this.viewer.worldManager.world;
    if (world && world.camera instanceof OBC.OrthoPerspectiveCamera) {
      const controls = world.camera.controls;
      // Using dolly instead of zoom for a more natural 3D movement
      // and to avoid negative zoom values which cause "weird" geometry.
      // Positive delta = zoom in, Negative delta = zoom out.
      const factor = delta > 0 ? 0.5 : -0.7;
      await controls.dolly(factor * controls.distance, true);
    }
  }

  public async fitAll() {
    const world = this.viewer.worldManager.world;
    if (world && world.camera instanceof OBC.OrthoPerspectiveCamera) {
      const bbox = new THREE.Box3();
      for (const [, model] of this.fragments.list) {
        const modelBox = await (model as any).getMergedBox();
        if (modelBox) bbox.union(modelBox);
      }
      if (!bbox.isEmpty()) {
        await world.camera.controls.fitToBox(bbox, true);
      }
    }
  }

  public async setStandardView(view: 'top' | 'front' | 'back' | 'left' | 'right' | 'iso') {
    const world = this.viewer.worldManager.world;
    if (world && world.camera instanceof OBC.OrthoPerspectiveCamera) {
      const bbox = new THREE.Box3();
      for (const [, model] of this.fragments.list) {
        const modelBox = await (model as any).getMergedBox();
        if (modelBox) bbox.union(modelBox);
      }
      
      if (bbox.isEmpty()) return;

      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim * 2;

      let eye = new THREE.Vector3();
      switch (view) {
        case 'top': eye.set(center.x, center.y + distance, center.z); break;
        case 'front': eye.set(center.x, center.y, center.z + distance); break;
        case 'back': eye.set(center.x, center.y, center.z - distance); break;
        case 'left': eye.set(center.x - distance, center.y, center.z); break;
        case 'right': eye.set(center.x + distance, center.y, center.z); break;
        case 'iso': eye.set(center.x + distance, center.y + distance, center.z + distance); break;
      }

      await world.camera.controls.setLookAt(eye.x, eye.y, eye.z, center.x, center.y, center.z, true);
      await world.camera.controls.fitToBox(bbox, true);
    }
  }

  public async rotate(angle: number = 90) {
    const world = this.viewer.worldManager.world;
    if (world && world.camera instanceof OBC.OrthoPerspectiveCamera) {
      world.camera.controls.rotate(angle * (Math.PI / 180), 0, true);
    }
  }

  // ============================================================================
  // NEW FUNCTIONS: Visibility
  // ============================================================================

  /**
   * Show all elements (unhide everything)
   */
  public async showAll() {
    const hider = this.components.get(OBC.Hider);
    if (hider) hider.set(true);
  }

  /**
   * Hide all elements
   */
  public async hideAll() {
    const hider = this.components.get(OBC.Hider);
    if (hider) hider.set(false);
  }

  // ============================================================================
  // NEW FUNCTIONS: Measurement
  // ============================================================================

  /**
   * Enable measurement mode
   */
  public async enableMeasurement(mode: 'length' | 'area' | 'volume') {
    if (!this.viewer.measurement) {
      console.warn('Measurement module not available');
      return;
    }

    const modeMap: Record<string, MeasurementMode> = {
      length: MeasurementMode.LENGTH,
      area: MeasurementMode.AREA,
      volume: MeasurementMode.VOLUME,
    };

    this.viewer.measurement.setMode(modeMap[mode] || MeasurementMode.LENGTH);
  }

  /**
   * Disable measurement mode
   */
  public async disableMeasurement() {
    if (!this.viewer.measurement) return;
    this.viewer.measurement.setMode(MeasurementMode.DISABLED);
  }

  /**
   * Clear all measurements
   */
  public async clearMeasurements() {
    if (!this.viewer.measurement) return;
    this.viewer.measurement.clearAll();
  }

  // ============================================================================
  // NEW FUNCTIONS: Clipping/Sectioning
  // ============================================================================

  /**
   * Clear all clipping planes
   */
  public async clearClippingPlanes() {
    if (this.viewer.clipper) {
      this.viewer.clipper.deleteAllPlanes();
    }
  }

  /**
   * Toggle clipper enabled state
   */
  public async toggleClipper(enabled?: boolean) {
    if (this.viewer.clipper) {
      if (enabled !== undefined) {
        this.viewer.clipper.setEnabled(enabled);
      } else {
        // Toggle based on current state
        const currentState = this.viewer.clipper.getEnabled();
        this.viewer.clipper.setEnabled(!currentState);
      }
    }
  }

  // ============================================================================
  // NEW FUNCTIONS: Visualization Modes
  // ============================================================================

  /**
   * Toggle cluster/exploded view
   */
  public async toggleClusterView() {
    if (!this.viewer.cluster) {
      console.warn('Cluster module not available');
      return;
    }

    if (this.viewer.cluster.isClusteringActive()) {
      await this.viewer.cluster.exitToColorView();
    } else {
      await this.viewer.cluster.toggleClusters();
    }
  }

  /**
   * Toggle space visibility
   */
  public async toggleSpaceVisibility() {
    if (!this.viewer.spaceVisibility) {
      console.warn('SpaceVisibility module not available');
      return;
    }

    await this.viewer.spaceVisibility.toggleSpaceVisibility();
  }

  /**
   * Toggle first-person walk mode
   */
  public async toggleFirstPerson() {
    if (!this.viewer.firstPersonControls) {
      console.warn('FirstPersonControls module not available');
      return;
    }

    // Check if already enabled by looking at the module's internal state
    const fp = this.viewer.firstPersonControls;
    // Toggle based on current state - if enabled, disable; if disabled, enable
    if ((fp as any).isEnabled) {
      fp.disable();
    } else {
      fp.enable();
    }
  }

  // ============================================================================
  // NEW FUNCTIONS: Model Information
  // ============================================================================

  /**
   * Get model information
   */
  public async getModelInfo(): Promise<{
    modelCount: number;
    totalElements: number;
    categories: string[];
  }> {
    const result = {
      modelCount: this.fragments.list.size,
      totalElements: 0,
      categories: [] as string[],
    };

    const allCategories = new Set<string>();

    for (const [, model] of this.fragments.list) {
      try {
        const categories = await (model as any).getCategories();
        categories.forEach((cat: string) => allCategories.add(cat));

        // Count elements per category
        for (const cat of categories) {
          const items = await (model as any).getItemsOfCategories([new RegExp(`^${cat}$`)]);
          for (const category in items) {
            result.totalElements += items[category]?.length || 0;
          }
        }
      } catch (e) {
        console.warn('Error getting model info:', e);
      }
    }

    result.categories = Array.from(allCategories).sort();
    return result;
  }

  /**
   * List all element types in the model
   */
  public async listElementTypes(): Promise<string[]> {
    const allCategories = new Set<string>();

    for (const [, model] of this.fragments.list) {
      try {
        const categories = await (model as any).getCategories();
        categories.forEach((cat: string) => allCategories.add(cat));
      } catch (e) {
        console.warn('Error listing element types:', e);
      }
    }

    return Array.from(allCategories).sort();
  }

  /**
   * Get building storeys
   */
  public async getStoreys(): Promise<{ name: string; elevation: number }[]> {
    const storeys: { name: string; elevation: number }[] = [];

    for (const [, model] of this.fragments.list) {
      try {
        const storeyItems = await (model as any).getItemsOfCategories([/BUILDINGSTOREY/]);
        const categoryKey = Object.keys(storeyItems).find(key => key.includes('BUILDINGSTOREY'));

        if (categoryKey && storeyItems[categoryKey]) {
          const localIds = storeyItems[categoryKey];
          const data = await (model as any).getItemsData(localIds, {
            attributesDefault: false,
            attributes: ['Name', 'Elevation']
          });

          for (const attrs of data) {
            const nameAttr = attrs.Name as any;
            const elevationAttr = attrs.Elevation as any;
            storeys.push({
              name: nameAttr?.value || 'Unknown Storey',
              elevation: elevationAttr?.value || 0,
            });
          }
        }
      } catch (e) {
        console.warn('Error getting storeys:', e);
      }
    }

    return storeys.sort((a, b) => a.elevation - b.elevation);
  }

  // ============================================================================
  // NEW FUNCTIONS: Floor Plans
  // ============================================================================

  /**
   * Show floor plan for a specific storey
   */
  public async showFloorPlan(storeyName?: string): Promise<boolean> {
    if (!this.viewer.floorPlan) {
      console.warn('FloorPlan module not available');
      return false;
    }

    try {
      const storeys = await this.viewer.floorPlan.getAllStoreys();
      if (storeys.length === 0) {
        console.warn('No storeys found in model');
        return false;
      }

      // Find the requested storey or use the first one
      let targetStorey = storeys[0];
      if (storeyName) {
        const found = storeys.find(s => 
          s.name.toLowerCase().includes(storeyName.toLowerCase())
        );
        if (found) targetStorey = found;
      }

      console.log('Target storey:', targetStorey);

      // First, create the floor plan view if it doesn't exist
      const createdView = await this.viewer.floorPlan.createFloorPlanView(targetStorey.name);
      if (!createdView) {
        console.warn('Could not create floor plan view for:', targetStorey.name);
        return false;
      }

      // Open using the view's ID (which is set by createFloorPlanView)
      return await this.viewer.floorPlan.openView(createdView.id);
    } catch (e) {
      console.error('Error showing floor plan:', e);
      return false;
    }
  }

  /**
   * Exit floor plan mode
   */
  public async exitFloorPlan() {
    if (!this.viewer.floorPlan) return;
    
    // Reset to 3D perspective view
    const world = this.viewer.worldManager.world;
    if (world && world.camera instanceof OBC.OrthoPerspectiveCamera) {
      await world.camera.projection.set('Perspective');
    }
    
    // Fit to model
    await this.fitAll();
  }

  // ============================================================================
  // NEW FUNCTIONS: Utility
  // ============================================================================

  /**
   * Take a screenshot of the current view
   */
  public async takeScreenshot(): Promise<string | null> {
    const world = this.viewer.worldManager.world;
    if (!world || !world.renderer) {
      console.warn('Renderer not available');
      return null;
    }

    try {
      // Get the canvas and create data URL
      const renderer = world.renderer.three as THREE.WebGLRenderer;
      renderer.render(world.scene.three, world.camera.three);
      const dataUrl = renderer.domElement.toDataURL('image/png');

      // Trigger download
      const link = document.createElement('a');
      link.download = `ifc-screenshot-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      return dataUrl;
    } catch (e) {
      console.error('Error taking screenshot:', e);
      return null;
    }
  }
}
