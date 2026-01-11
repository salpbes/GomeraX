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

  /**
   * Select all elements on a specific storey/level
   */
  public async selectElementsByStorey(storeyName: string): Promise<number> {
    const highlighter = this.components.get(OBF.Highlighter);
    if (!highlighter) return 0;

    highlighter.clear('select');
    
    let totalCount = 0;
    const selection: Record<string, Set<number>> = {};

    // Get all storeys
    for (const [modelId, model] of this.fragments.list) {
      try {
        // Get building storeys
        const storeys = await model.getItemsOfCategories([/BUILDINGSTOREY/]);
        const categoryKey = Object.keys(storeys).find(key => key.includes('BUILDINGSTOREY'));
        
        if (!categoryKey || !storeys[categoryKey]) continue;
        
        const storeyIds = storeys[categoryKey];
        const storeyData = await model.getItemsData(storeyIds, {
          attributesDefault: false,
          attributes: ['Name', 'LongName']
        });
        
        // Find the matching storey
        for (const attrs of storeyData) {
          const nameAttr = attrs.Name as any;
          const longNameAttr = attrs.LongName as any;
          const name = nameAttr?.value || longNameAttr?.value || '';
          
          // Case-insensitive partial match
          if (name.toLowerCase().includes(storeyName.toLowerCase())) {
            const storeyId = attrs.id as unknown as number;
            
            // Get all elements contained in this storey
            const relations = await model.getItemsOfCategories([/RELCONTAINEDINSPATIALSTRUCTURE/]);
            const relKey = Object.keys(relations).find(key => key.includes('RELCONTAINEDINSPATIALSTRUCTURE'));
            
            if (relKey && relations[relKey]) {
              const relIds = relations[relKey];
              const relData = await model.getItemsData(relIds, {
                attributesDefault: false,
                attributes: ['RelatingStructure', 'RelatedElements']
              });
              
              for (const rel of relData) {
                const relatingStructure = rel.RelatingStructure as any;
                if (relatingStructure?.value === storeyId) {
                  const relatedElements = rel.RelatedElements as any;
                  if (relatedElements && Array.isArray(relatedElements)) {
                    if (!selection[modelId]) {
                      selection[modelId] = new Set();
                    }
                    
                    relatedElements.forEach((elem: any) => {
                      const elemId = elem.value;
                      if (typeof elemId === 'number') {
                        selection[modelId].add(elemId);
                        totalCount++;
                      }
                    });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn(`Could not get storey elements for model ${modelId}`, e);
      }
    }
    
    if (totalCount > 0) {
      highlighter.highlightByID('select', selection);
    }
    
    return totalCount;
  }

  /**
   * Select elements by both storey and type (combined filter)
   * Uses spatial structure tree to find elements in storey
   */
  public async selectElementsByStoreyAndType(storeyName: string, elementTypes: string[]): Promise<number> {
    const highlighter = this.components.get(OBF.Highlighter);
    if (!highlighter) return 0;

    highlighter.clear('select');
    
    let totalCount = 0;
    const selection: Record<string, Set<number>> = {};

    console.log(`🔍 Selecting ${elementTypes.join(', ')} on storey "${storeyName}"`);

    for (const [modelId, model] of this.fragments.list) {
      try {
        // Get the spatial structure
        const spatialStructure = await (model as any).getSpatialStructure();
        if (!spatialStructure) {
          console.warn('⚠️ No spatial structure found');
          continue;
        }
        
        // Find the storey node in the spatial structure
        const storeyResult = await this.findStoreyNode(model, spatialStructure, storeyName);
        if (!storeyResult) {
          console.warn(`⚠️ Could not find storey matching "${storeyName}"`);
          continue;
        }
        
        const { node: storeyNode, localId: storeyLocalId, name: matchedStoreyName } = storeyResult;
        console.log(`✅ Matched storey: "${matchedStoreyName}" with ID ${storeyLocalId}`);
        
        // Get all elements of the requested types
        const allTypeIds: number[] = [];
        for (const type of elementTypes) {
          const regex = new RegExp(type, 'i');
          const items = await model.getItemsOfCategories([regex]);
          
          for (const [_key, ids] of Object.entries(items)) {
            if (ids && Array.isArray(ids)) {
              allTypeIds.push(...ids);
            }
          }
        }
        
        console.log(`📊 Found ${allTypeIds.length} total elements of type ${elementTypes.join(', ')}`);
        
        if (allTypeIds.length === 0) continue;
        
        // Query ContainedInStructure for these elements
        const itemsData = await model.getItemsData(allTypeIds, {
          attributesDefault: false,
          attributes: [],
          relations: {
            ContainedInStructure: { attributes: false, relations: false },
          },
        });
        
        if (!selection[modelId]) {
          selection[modelId] = new Set();
        }
        
        // Check each element for containment in storey
        for (let i = 0; i < itemsData.length; i++) {
          const data = itemsData[i];
          const localId = allTypeIds[i];
          
          if (data.ContainedInStructure && Array.isArray(data.ContainedInStructure)) {
            const isInStorey = data.ContainedInStructure.some((rel: any) => {
              const relLocalId = rel._localId?.value || rel.localId;
              return relLocalId === storeyLocalId;
            });
            
            if (isInStorey) {
              selection[modelId].add(localId);
              totalCount++;
            }
          }
        }
        
        if (totalCount === 0) {
          // Fallback: try collecting from spatial tree children
          const typeSet = new Set(allTypeIds);
          const elementsInStorey = this.collectElementsFromStoreyNode(storeyNode, typeSet);
          
          for (const elemId of elementsInStorey) {
            selection[modelId].add(elemId);
            totalCount++;
          }
        }
        
        console.log(`✨ Selected ${totalCount} ${elementTypes.join(', ')} on "${matchedStoreyName}"`);
        
      } catch (e) {
        console.warn(`Could not get storey elements for model ${modelId}`, e);
      }
    }
    
    if (totalCount > 0) {
      highlighter.highlightByID('select', selection);
    }
    
    return totalCount;
  }
  
  /**
   * Find storey node in spatial structure by name
   * Returns { node, localId, name } if found
   */
  private async findStoreyNode(model: any, node: any, storeyName: string, depth: number = 0, parentCategory: string = ''): Promise<{ node: any; localId: number; name: string } | null> {
    if (!node) return null;
    
    const category = node.category || node._category?.value || '';
    const localId = node.localId || node._localId?.value;
    
    // Check if this node is a storey:
    // 1. Has category IFCBUILDINGSTOREY and localId
    // 2. OR parent has category IFCBUILDINGSTOREY and this node has localId (actual storey data)
    const isStoreyNode = (category.includes('BUILDINGSTOREY') && localId) || 
                         (parentCategory.includes('BUILDINGSTOREY') && localId && !category);
    
    if (isStoreyNode) {
      // Get name from itemsData
      let name = node.name || node.Name?.value || '';
      
      try {
        const [itemData] = await model.getItemsData([localId], {
          attributesDefault: false,
          attributes: ['Name', 'LongName'],
        });
        if (itemData) {
          name = itemData.Name?.value || itemData.LongName?.value || name;
        }
      } catch (e) {}
      
      if (name.toLowerCase().includes(storeyName.toLowerCase())) {
        return { node, localId, name };
      }
    }
    
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = await this.findStoreyNode(model, child, storeyName, depth + 1, category);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  /**
   * Collect element IDs from storey node's children that match type filter
   */
  private collectElementsFromStoreyNode(storeyNode: any, typeIds: Set<number>): number[] {
    const result: number[] = [];
    
    if (!storeyNode.children) return result;
    
    for (const categoryGroup of storeyNode.children) {
      const groupCategory = categoryGroup.category || categoryGroup._category?.value || '';
      
      // Skip spatial structure categories
      if (['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE'].includes(groupCategory)) {
        continue;
      }
      
      if (categoryGroup.children && Array.isArray(categoryGroup.children)) {
        for (const elem of categoryGroup.children) {
          const elemId = elem.localId || elem._localId?.value;
          if (typeof elemId === 'number' && typeIds.has(elemId)) {
            result.push(elemId);
          }
        }
      }
    }
    
    return result;
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

  /**
   * Hide specific element types
   */
  public async hideElementTypes(elementTypes: string[]): Promise<number> {
    const hider = this.components.get(OBC.Hider);
    if (!hider) return 0;

    let totalCount = 0;
    for (const type of elementTypes) {
      const count = await this.hideByType(type);
      totalCount += count;
    }
    return totalCount;
  }

  /**
   * Show only specific element types (hide all others)
   */
  public async showOnlyElementTypes(elementTypes: string[]): Promise<number> {
    const hider = this.components.get(OBC.Hider);
    if (!hider) return 0;

    // First, hide everything
    hider.set(false);

    // Then show only the requested types
    const showData: Record<string, Set<number>> = {};
    let totalCount = 0;

    for (const type of elementTypes) {
      const idsByModel = await this.getIdsByType(type);
      for (const [modelId, ids] of idsByModel) {
        if (!showData[modelId]) {
          showData[modelId] = new Set();
        }
        ids.forEach(id => showData[modelId].add(id));
        totalCount += ids.size;
      }
    }

    if (totalCount > 0) {
      hider.set(true, showData);
    }

    return totalCount;
  }

  /**
   * Show all elements of specific types
   */
  public async showAllElements() {
    const hider = this.components.get(OBC.Hider);
    if (hider) hider.set(true);
  }

  /**
   * Set transparency for element types
   */
  public async setElementTransparency(elementTypes: string[], opacity: number): Promise<number> {
    // Clamp opacity between 0 and 1
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    
    // Get all fragments for the types
    let totalCount = 0;
    for (const type of elementTypes) {
      const idsByModel = await this.getIdsByType(type);
      
      const fragments = this.components.get(OBC.FragmentsManager);
      for (const [modelId, ids] of idsByModel) {
        const model = fragments.list.get(modelId);
        if (model) {
          // Set opacity for each fragment
          for (const id of ids) {
            const fragment = model.getFragmentByID(id);
            if (fragment && fragment.mesh.material) {
              const material = fragment.mesh.material as any;
              material.transparent = clampedOpacity < 1;
              material.opacity = clampedOpacity;
              totalCount++;
            }
          }
        }
      }
    }
    
    return totalCount;
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

  // Store full web content for progressive loading
  private webPageCache: {
    url: string;
    title: string;
    fullContent: string;
    currentChunk: number;
    chunkSize: number;
  } | null = null;

  /**
   * Fetch content from a web page with progressive loading
   * Uses multiple CORS proxies with fallback
   */
  public async fetchWebPage(url: string, loadMore: boolean = false): Promise<{ 
    success: boolean; 
    content: string; 
    title: string; 
    url: string;
    hasMore: boolean;
    totalChars: number;
    loadedChars: number;
  }> {
    const CHUNK_SIZE = 1000;
    
    // If loadMore and we have cached content, return next chunk
    if (loadMore && this.webPageCache) {
      const { fullContent, currentChunk, chunkSize, title, url: cachedUrl } = this.webPageCache;
      const start = currentChunk * chunkSize;
      const end = Math.min(start + chunkSize, fullContent.length);
      const chunk = fullContent.substring(start, end);
      
      this.webPageCache.currentChunk++;
      const hasMore = end < fullContent.length;
      
      console.log(`📄 Loading more: chunk ${currentChunk + 1} (${start}-${end} of ${fullContent.length})`);
      
      return {
        success: true,
        content: chunk,
        title,
        url: cachedUrl,
        hasMore,
        totalChars: fullContent.length,
        loadedChars: end
      };
    }
    
    console.log(`🌐 Fetching web page: ${url}`);
    
    try {
      // Validate URL
      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      
      // List of CORS proxies to try (in order)
      const corsProxies = [
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        (url: string) => `https://proxy.cors.sh/${url}`,
      ];
      
      let htmlContent: string | null = null;
      let lastError: Error | null = null;
      
      // Try each proxy until one works
      for (const proxyFn of corsProxies) {
        try {
          const proxyUrl = proxyFn(normalizedUrl);
          console.log(`  Trying proxy: ${proxyUrl.substring(0, 50)}...`);
          
          const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
          });
          
          if (response.ok) {
            htmlContent = await response.text();
            console.log(`  ✅ Proxy succeeded`);
            break;
          }
        } catch (e) {
          lastError = e as Error;
          console.log(`  ❌ Proxy failed: ${(e as Error).message}`);
        }
      }
      
      if (!htmlContent) {
        throw lastError || new Error('All proxies failed');
      }
      
      // Parse HTML and extract text
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      // Get title
      const title = doc.querySelector('title')?.textContent?.trim() || 'Untitled';
      
      // Remove script, style, nav, footer, header elements
      const removeSelectors = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'iframe'];
      removeSelectors.forEach(selector => {
        doc.querySelectorAll(selector).forEach(el => el.remove());
      });
      
      // Get main content (try article, main, or body)
      let mainContent = doc.querySelector('article') || doc.querySelector('main') || doc.body;
      
      // Extract text content
      let fullContent = mainContent?.textContent || '';
      
      // Clean up whitespace
      fullContent = fullContent
        .replace(/\s+/g, ' ')  // Multiple spaces to single
        .replace(/\n\s*\n/g, '\n')  // Multiple newlines to single
        .trim();
      
      // Cache full content for progressive loading
      this.webPageCache = {
        url: normalizedUrl,
        title,
        fullContent,
        currentChunk: 1, // We're returning chunk 0 now
        chunkSize: CHUNK_SIZE
      };
      
      // Return first chunk only
      const firstChunk = fullContent.substring(0, CHUNK_SIZE);
      const hasMore = fullContent.length > CHUNK_SIZE;
      
      console.log(`✅ Fetched "${title}" (${fullContent.length} chars, showing first ${CHUNK_SIZE})`);
      
      return {
        success: true,
        content: firstChunk,
        title,
        url: normalizedUrl,
        hasMore,
        totalChars: fullContent.length,
        loadedChars: Math.min(CHUNK_SIZE, fullContent.length)
      };
      
    } catch (error) {
      console.error('❌ Failed to fetch web page:', error);
      return {
        success: false,
        content: `Failed to fetch the page: ${error instanceof Error ? error.message : 'Unknown error'}. The website may be blocking requests.`,
        title: 'Error',
        url,
        hasMore: false,
        totalChars: 0,
        loadedChars: 0
      };
    }
  }
  
  /**
   * Get more content from the cached web page
   * @param chunkCount Number of 1k chunks to load (default 1)
   */
  public getMoreWebContent(chunkCount: number = 1): { content: string; hasMore: boolean; loadedTotal: number } | null {
    if (!this.webPageCache) return null;
    
    const { fullContent, currentChunk, chunkSize } = this.webPageCache;
    const start = currentChunk * chunkSize;
    
    if (start >= fullContent.length) {
      return { content: '', hasMore: false, loadedTotal: fullContent.length };
    }
    
    // Load multiple chunks based on count
    const bytesToLoad = chunkCount * chunkSize;
    const end = Math.min(start + bytesToLoad, fullContent.length);
    const chunk = fullContent.substring(start, end);
    
    // Update chunk counter
    this.webPageCache.currentChunk += chunkCount;
    
    return {
      content: chunk,
      hasMore: end < fullContent.length,
      loadedTotal: end
    };
  }
  
  /**
   * Get all loaded web content so far (for AI context)
   */
  public getLoadedWebContent(): string | null {
    if (!this.webPageCache) return null;
    
    const { fullContent, currentChunk, chunkSize } = this.webPageCache;
    const loadedEnd = currentChunk * chunkSize;
    return fullContent.substring(0, Math.min(loadedEnd, fullContent.length));
  }

  /**
   * Search a web page for specific terms and return only relevant snippets
   * More efficient than loading the entire page when looking for specific info
   */
  public async searchWebPage(url: string, searchTerms: string): Promise<{
    success: boolean;
    snippets: string[];
    title: string;
    url: string;
    matchCount: number;
  }> {
    console.log(`🔍 Searching "${searchTerms}" on ${url}`);
    
    try {
      // First fetch the full page
      const fetchResult = await this.fetchWebPage(url);
      
      if (!fetchResult.success) {
        return {
          success: false,
          snippets: [fetchResult.content],
          title: fetchResult.title,
          url: fetchResult.url,
          matchCount: 0
        };
      }
      
      // Get full content from cache
      const fullContent = this.webPageCache?.fullContent || fetchResult.content;
      
      // Split search terms into individual words for flexible matching
      const terms = searchTerms.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      
      // Find sentences/paragraphs containing the search terms
      // Split content into sentences
      const sentences = fullContent.split(/(?<=[.!?])\s+/);
      
      const relevantSnippets: { text: string; score: number }[] = [];
      const CONTEXT_CHARS = 150; // Characters before/after match
      
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        const lowerSentence = sentence.toLowerCase();
        
        // Count how many search terms appear in this sentence
        let matchScore = 0;
        for (const term of terms) {
          if (lowerSentence.includes(term)) {
            matchScore++;
          }
        }
        
        if (matchScore > 0) {
          // Include surrounding sentences for context
          const startIdx = Math.max(0, i - 1);
          const endIdx = Math.min(sentences.length - 1, i + 1);
          const contextSnippet = sentences.slice(startIdx, endIdx + 1).join(' ').trim();
          
          // Only add if not too similar to existing snippets
          const isDuplicate = relevantSnippets.some(s => 
            s.text.includes(sentence.substring(0, 50)) || 
            sentence.includes(s.text.substring(0, 50))
          );
          
          if (!isDuplicate && contextSnippet.length > 20) {
            relevantSnippets.push({ text: contextSnippet, score: matchScore });
          }
        }
      }
      
      // Sort by relevance score and take top results
      relevantSnippets.sort((a, b) => b.score - a.score);
      const topSnippets = relevantSnippets.slice(0, 5).map(s => s.text);
      
      // If no matches found, try a broader search with character positions
      if (topSnippets.length === 0) {
        const lowerContent = fullContent.toLowerCase();
        for (const term of terms) {
          let pos = lowerContent.indexOf(term);
          while (pos !== -1 && topSnippets.length < 5) {
            const start = Math.max(0, pos - CONTEXT_CHARS);
            const end = Math.min(fullContent.length, pos + term.length + CONTEXT_CHARS);
            const snippet = (start > 0 ? '...' : '') + 
                           fullContent.substring(start, end).trim() + 
                           (end < fullContent.length ? '...' : '');
            
            // Check for duplicates
            if (!topSnippets.some(s => s.includes(snippet.substring(10, 50)))) {
              topSnippets.push(snippet);
            }
            
            pos = lowerContent.indexOf(term, pos + 1);
          }
        }
      }
      
      console.log(`✅ Found ${topSnippets.length} relevant snippets for "${searchTerms}"`);
      
      return {
        success: true,
        snippets: topSnippets.length > 0 ? topSnippets : ['No relevant content found for the search terms.'],
        title: fetchResult.title,
        url: fetchResult.url,
        matchCount: topSnippets.length
      };
      
    } catch (error) {
      console.error('❌ Failed to search web page:', error);
      return {
        success: false,
        snippets: [`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        title: 'Error',
        url,
        matchCount: 0
      };
    }
  }

  // Cache for page sections (headers + content)
  private pageSectionsCache: {
    url: string;
    title: string;
    sections: Array<{ level: number; heading: string; content: string }>;
  } | null = null;

  /**
   * Get all section headers (H1-H6) from a webpage
   * Returns a list of headers for AI to choose from
   */
  public async getPageSections(url: string): Promise<{
    success: boolean;
    title: string;
    url: string;
    headers: Array<{ level: number; heading: string; index: number }>;
  }> {
    console.log(`📑 Getting page sections: ${url}`);
    
    try {
      // Validate URL
      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      
      // List of CORS proxies to try
      const corsProxies = [
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        (url: string) => `https://proxy.cors.sh/${url}`,
      ];
      
      let htmlContent: string | null = null;
      
      for (const proxyFn of corsProxies) {
        try {
          const proxyUrl = proxyFn(normalizedUrl);
          const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
          });
          
          if (response.ok) {
            htmlContent = await response.text();
            break;
          }
        } catch (e) {
          console.log(`  ❌ Proxy failed: ${(e as Error).message}`);
        }
      }
      
      if (!htmlContent) {
        throw new Error('All proxies failed');
      }
      
      // Parse HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      const title = doc.querySelector('title')?.textContent?.trim() || 'Untitled';
      
      // Remove non-content elements (including Wikipedia edit links)
      ['script', 'style', 'nav', 'footer', 'aside', 'noscript', 'iframe', '.mw-editsection', '.edit-page', '.navbox', '.infobox', '.toc', '.references', '.reflist', '.sidebar', '.metadata'].forEach(sel => {
        doc.querySelectorAll(sel).forEach(el => el.remove());
      });
      
      // Get main content area (Wikipedia uses #mw-content-text or #bodyContent)
      const mainContent = doc.querySelector('#mw-content-text .mw-parser-output') ||
                          doc.querySelector('#mw-content-text') || 
                          doc.querySelector('article') || 
                          doc.querySelector('main') || 
                          doc.querySelector('#bodyContent') ||
                          doc.body;
      
      // Extract all headers with their content
      const sections: Array<{ level: number; heading: string; content: string }> = [];
      const headers: Array<{ level: number; heading: string; index: number }> = [];
      
      // Get all direct children to process in order
      const children = Array.from(mainContent?.children || []);
      
      let currentHeading = '';
      let currentLevel = 0;
      let currentContent = '';
      const MAX_CHARS = 2000;
      
      for (const child of children) {
        const tagName = child.tagName.toLowerCase();
        
        // Check if this is a heading (direct or wrapped in mw-heading)
        let headingEl: Element | null = null;
        if (tagName.match(/^h[1-6]$/)) {
          headingEl = child;
        } else if (child.classList.contains('mw-heading')) {
          headingEl = child.querySelector('h1, h2, h3, h4, h5, h6');
        }
        
        if (headingEl) {
          // Save previous section if exists
          if (currentHeading && currentContent.length > 0) {
            const cleanContent = currentContent
              .replace(/\[\d+\]/g, '')
              .replace(/\[edit\]/gi, '')
              .replace(/\[citation needed\]/gi, '')
              .replace(/\s+/g, ' ')
              .trim();
            
            if (cleanContent.length > 20) {
              sections.push({
                level: currentLevel,
                heading: currentHeading,
                content: cleanContent
              });
              headers.push({
                level: currentLevel,
                heading: currentHeading,
                index: sections.length - 1
              });
            }
          }
          
          // Start new section
          currentLevel = parseInt(headingEl.tagName.charAt(1));
          currentHeading = headingEl.textContent?.trim() || '';
          currentHeading = currentHeading.replace(/\[edit\]/gi, '').replace(/\[.*?\]/g, '').trim();
          currentContent = '';
        } else if (currentHeading) {
          // Accumulate content for current section
          if (!child.classList.contains('navbox') && 
              !child.classList.contains('infobox') &&
              !child.classList.contains('references') &&
              !child.classList.contains('reflist') &&
              currentContent.length < MAX_CHARS) {
            const text = child.textContent?.trim() || '';
            if (text.length > 10) {
              currentContent += text + ' ';
            }
          }
        }
      }
      
      // Don't forget the last section
      if (currentHeading && currentContent.length > 0) {
        const cleanContent = currentContent
          .replace(/\[\d+\]/g, '')
          .replace(/\[edit\]/gi, '')
          .replace(/\[citation needed\]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (cleanContent.length > 20) {
          sections.push({
            level: currentLevel,
            heading: currentHeading,
            content: cleanContent
          });
          headers.push({
            level: currentLevel,
            heading: currentHeading,
            index: sections.length - 1
          });
        }
      }
      
      console.log(`📑 Extracted ${sections.length} sections with content`);
      
      // Cache the sections for later retrieval
      this.pageSectionsCache = {
        url: normalizedUrl,
        title,
        sections
      };
      
      console.log(`✅ Found ${headers.length} sections in "${title}"`);
      
      return {
        success: true,
        title,
        url: normalizedUrl,
        headers
      };
      
    } catch (error) {
      console.error('❌ Failed to get page sections:', error);
      return {
        success: false,
        title: 'Error',
        url,
        headers: []
      };
    }
  }

  /**
   * Get content from specific sections by their indices
   * Called after AI decides which sections are relevant
   */
  public getSectionContent(sectionIndices: number[]): {
    success: boolean;
    sections: Array<{ heading: string; content: string }>;
  } {
    if (!this.pageSectionsCache) {
      return { success: false, sections: [] };
    }
    
    const result: Array<{ heading: string; content: string }> = [];
    
    for (const idx of sectionIndices) {
      if (idx >= 0 && idx < this.pageSectionsCache.sections.length) {
        const section = this.pageSectionsCache.sections[idx];
        result.push({
          heading: section.heading,
          content: section.content
        });
      }
    }
    
    console.log(`📄 Retrieved ${result.length} section(s)`);
    
    return {
      success: true,
      sections: result
    };
  }

  /**
   * Smart search: Automatically finds and fetches relevant sections from a webpage
   * Single function that combines getPageSections + getSectionContent + smart matching
   */
  public async smartSearch(url: string, topic: string): Promise<{
    success: boolean;
    title: string;
    url: string;
    matchedSections: Array<{ heading: string; content: string; relevance: number }>;
    allHeaders: string[];
  }> {
    console.log(`🧠 Smart searching "${topic}" on ${url}`);
    
    try {
      // First get all sections
      const sectionsResult = await this.getPageSections(url);
      
      if (!sectionsResult.success || !this.pageSectionsCache) {
        return {
          success: false,
          title: 'Error',
          url,
          matchedSections: [],
          allHeaders: []
        };
      }
      
      const { sections } = this.pageSectionsCache;
      const allHeaders = sections.map(s => s.heading);
      
      // Split topic into search terms
      const searchTerms = topic.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      
      // Score each section by relevance
      const scoredSections: Array<{ 
        heading: string; 
        content: string; 
        relevance: number;
        index: number;
      }> = [];
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const headingLower = section.heading.toLowerCase();
        const contentLower = section.content.toLowerCase();
        
        let relevance = 0;
        
        for (const term of searchTerms) {
          // Heading match is worth more
          if (headingLower.includes(term)) {
            relevance += 10;
          }
          // Content match
          if (contentLower.includes(term)) {
            relevance += 3;
            // Bonus for multiple occurrences
            const occurrences = (contentLower.match(new RegExp(term, 'g')) || []).length;
            relevance += Math.min(occurrences - 1, 5);
          }
        }
        
        // Also check for exact phrase match
        if (headingLower.includes(topic.toLowerCase())) {
          relevance += 20;
        }
        if (contentLower.includes(topic.toLowerCase())) {
          relevance += 10;
        }
        
        if (relevance > 0) {
          scoredSections.push({
            heading: section.heading,
            content: section.content,
            relevance,
            index: i
          });
        }
      }
      
      // Sort by relevance and take top 3
      scoredSections.sort((a, b) => b.relevance - a.relevance);
      const topSections = scoredSections.slice(0, 3);
      
      console.log(`✅ Found ${topSections.length} relevant section(s) for "${topic}"`);
      
      return {
        success: true,
        title: sectionsResult.title,
        url: sectionsResult.url,
        matchedSections: topSections.map(s => ({
          heading: s.heading,
          content: s.content,
          relevance: s.relevance
        })),
        allHeaders
      };
      
    } catch (error) {
      console.error('❌ Smart search failed:', error);
      return {
        success: false,
        title: 'Error',
        url,
        matchedSections: [],
        allHeaders: []
      };
    }
  }
}
