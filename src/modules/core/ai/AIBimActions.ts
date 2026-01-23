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
      const count = await this.setVisibilityByType(type, false);
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
    
    // Get all elements of the specified types
    let totalCount = 0;
    const transparencyData: Record<string, Set<number>> = {};
    
    for (const type of elementTypes) {
      const idsByModel = await this.getIdsByType(type);
      
      for (const [modelId, ids] of idsByModel) {
        if (!transparencyData[modelId]) {
          transparencyData[modelId] = new Set();
        }
        ids.forEach(id => transparencyData[modelId].add(id));
        totalCount += ids.size;
      }
    }
    
    // Note: Full transparency control requires custom shader/material handling
    // For now, if opacity is 0, hide the elements; otherwise show them
    if (totalCount > 0) {
      const hider = this.components.get(OBC.Hider);
      if (hider) {
        if (clampedOpacity === 0) {
          hider.set(false, transparencyData);
        } else {
          hider.set(true, transparencyData);
        }
      }
    }
    
    return totalCount;
  }

  // ============================================================================
  // NEW FUNCTIONS: Measurement
  // ============================================================================

  /**
   * Get element distribution by storey
   * Returns how many elements of each type are on each floor
   */
  public async getElementDistribution(
    elementTypes: string[]
  ): Promise<{
    success: boolean;
    distribution: Array<{
      storeyName: string;
      counts: Record<string, number>;
      total: number;
    }>;
    totalElements: number;
    storeys: string[];
  }> {
    console.log(`📊 Getting element distribution for types:`, elementTypes);

    try {
      // Get all storeys
      const storeyMap = new Map<string, { name: string; localId: number; counts: Record<string, number> }>();
      
      // First, get storey information
      for (const [modelId, model] of this.fragments.list) {
        try {
          const storeyRegex = /^IFCBUILDINGSTOREY$/i;
          const storeyItems = await (model as any).getItemsOfCategories([storeyRegex]);
          
          for (const category in storeyItems) {
            const storeyIds = storeyItems[category];
            for (const storeyId of storeyIds) {
              const storeyData = await (model as any).getItemsData([storeyId], {
                attributesDefault: true,
                relations: {},
              });
              
              if (storeyData && storeyData[0]) {
                const name = storeyData[0].Name?.value || `Storey ${storeyId}`;
                storeyMap.set(`${modelId}-${storeyId}`, {
                  name,
                  localId: storeyId,
                  counts: {}
                });
              }
            }
          }
        } catch (e) {
          console.warn(`Error getting storeys for model ${modelId}`, e);
        }
      }

      // Now count elements by storey for each type
      let totalElements = 0;
      
      for (const type of elementTypes) {
        const idsByModel = await this.getIdsByType(type);
        
        for (const [modelId, ids] of idsByModel) {
          const model = this.fragments.list.get(modelId);
          if (!model) continue;
          
          const idArray = Array.from(ids);
          totalElements += idArray.length;
          
          try {
            const itemsData = await (model as any).getItemsData(idArray, {
              attributesDefault: false,
              attributes: [],
              relations: {
                ContainedInStructure: { attributes: true, relations: false },
              },
            });
            
            for (let i = 0; i < itemsData.length; i++) {
              const data = itemsData[i];
              if (data?.ContainedInStructure && Array.isArray(data.ContainedInStructure)) {
                for (const rel of data.ContainedInStructure) {
                  const storeyLocalId = rel._localId?.value || rel.localId;
                  const storeyKey = `${modelId}-${storeyLocalId}`;
                  
                  if (storeyMap.has(storeyKey)) {
                    const storey = storeyMap.get(storeyKey)!;
                    storey.counts[type] = (storey.counts[type] || 0) + 1;
                  }
                }
              }
            }
          } catch (e) {
            console.warn(`Error getting containment for type ${type}`, e);
          }
        }
      }

      // Convert to output format
      const distribution = Array.from(storeyMap.values())
        .filter(s => Object.keys(s.counts).length > 0)
        .map(s => ({
          storeyName: s.name,
          counts: s.counts,
          total: Object.values(s.counts).reduce((sum, c) => sum + c, 0)
        }))
        .sort((a, b) => b.total - a.total);

      const storeys = distribution.map(d => d.storeyName);

      console.log(`✅ Found elements on ${distribution.length} storeys`);

      return {
        success: true,
        distribution,
        totalElements,
        storeys
      };
    } catch (error) {
      console.error('❌ Error getting element distribution:', error);
      return {
        success: false,
        distribution: [],
        totalElements: 0,
        storeys: []
      };
    }
  }

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

  // ============================================================================
  // CONTEXTUAL PROPERTY QUERIES
  // ============================================================================

  /**
   * Get properties for a set of elements
   * Returns a flat object with all properties for each element
   */
  public async getPropertiesForElements(
    idsByModel: Map<string, Set<number>>
  ): Promise<Array<{ expressID: number; modelId: string; properties: Record<string, any> }>> {
    const results: Array<{ expressID: number; modelId: string; properties: Record<string, any> }> = [];
    const BATCH_SIZE = 50;

    for (const [modelId, ids] of idsByModel) {
      const model = this.fragments.list.get(modelId);
      if (!model || typeof (model as any).getItemsData !== 'function') continue;

      const idArray = Array.from(ids);
      
      for (let i = 0; i < idArray.length; i += BATCH_SIZE) {
        const batchIds = idArray.slice(i, i + BATCH_SIZE);
        
        try {
          const ifcDataArray = await (model as any).getItemsData(batchIds, {
            attributesDefault: true,
            relations: {
              IsDefinedBy: { attributes: true, relations: true },
              HasAssociations: { attributes: true, relations: true },
            },
          });

          for (let j = 0; j < ifcDataArray.length; j++) {
            const ifcData = ifcDataArray[j];
            if (!ifcData) continue;

            const properties: Record<string, any> = {};
            
            // Extract direct attributes
            for (const [key, value] of Object.entries(ifcData)) {
              if (key.startsWith('_') || key === 'IsDefinedBy' || key === 'HasAssociations') continue;
              if (Array.isArray(value)) continue;
              if (typeof value === 'object' && value !== null) {
                const attr = value as any;
                if ('value' in attr && attr.value !== undefined && attr.value !== null) {
                  properties[key] = attr.value;
                }
              } else if (value !== undefined && value !== null) {
                properties[key] = value;
              }
            }

            // Extract property sets from IsDefinedBy
            if (ifcData.IsDefinedBy && Array.isArray(ifcData.IsDefinedBy)) {
              for (const pset of ifcData.IsDefinedBy) {
                const psetName = pset.Name?.value || 'Unknown';
                if (pset.HasProperties && Array.isArray(pset.HasProperties)) {
                  for (const prop of pset.HasProperties) {
                    const propName = prop.Name?.value;
                    const propValue = prop.NominalValue?.value;
                    if (propName && propValue !== undefined && propValue !== null) {
                      // Store with both short name and full path
                      properties[propName] = propValue;
                      properties[`${psetName}.${propName}`] = propValue;
                    }
                  }
                }
                // Also handle quantity sets
                if (pset.Quantities && Array.isArray(pset.Quantities)) {
                  for (const qty of pset.Quantities) {
                    const qtyName = qty.Name?.value;
                    // Quantities can have different value types
                    const qtyValue = qty.AreaValue?.value ?? qty.LengthValue?.value ?? 
                                     qty.VolumeValue?.value ?? qty.WeightValue?.value ?? 
                                     qty.CountValue?.value ?? qty.TimeValue?.value;
                    if (qtyName && qtyValue !== undefined && qtyValue !== null) {
                      properties[qtyName] = qtyValue;
                      properties[`${psetName}.${qtyName}`] = qtyValue;
                    }
                  }
                }
              }
            }

            // Extract materials from HasAssociations
            if (ifcData.HasAssociations && Array.isArray(ifcData.HasAssociations)) {
              for (const assoc of ifcData.HasAssociations) {
                // Check for material associations
                if (assoc.RelatingMaterial) {
                  const material = assoc.RelatingMaterial;
                  
                  // Single material
                  if (material.Name?.value) {
                    properties['Material'] = material.Name.value;
                  }
                  
                  // Material layer set
                  if (material.MaterialLayers && Array.isArray(material.MaterialLayers)) {
                    const layerNames = material.MaterialLayers
                      .map((layer: any) => layer.Material?.Name?.value)
                      .filter(Boolean);
                    if (layerNames.length > 0) {
                      properties['Material'] = layerNames.join(', ');
                      properties['MaterialLayers'] = layerNames;
                    }
                  }
                  
                  // Material constituent set
                  if (material.MaterialConstituents && Array.isArray(material.MaterialConstituents)) {
                    const constituentNames = material.MaterialConstituents
                      .map((c: any) => c.Material?.Name?.value)
                      .filter(Boolean);
                    if (constituentNames.length > 0) {
                      properties['Material'] = constituentNames.join(', ');
                      properties['MaterialConstituents'] = constituentNames;
                    }
                  }

                  // Material profile set
                  if (material.MaterialProfiles && Array.isArray(material.MaterialProfiles)) {
                    const profileNames = material.MaterialProfiles
                      .map((p: any) => p.Material?.Name?.value)
                      .filter(Boolean);
                    if (profileNames.length > 0) {
                      properties['Material'] = profileNames.join(', ');
                      properties['MaterialProfiles'] = profileNames;
                    }
                  }
                }
                
                // Check for classification associations
                if (assoc.RelatingClassification) {
                  const classification = assoc.RelatingClassification;
                  if (classification.Name?.value) {
                    properties['Classification'] = classification.Name.value;
                  }
                  if (classification.ItemReference?.value) {
                    properties['ClassificationCode'] = classification.ItemReference.value;
                  }
                }
              }
            }

            results.push({
              expressID: batchIds[j],
              modelId,
              properties
            });
          }
        } catch (error) {
          console.warn(`Error fetching properties for batch:`, error);
        }
      }
    }

    return results;
  }

  /**
   * Query property values from elements
   * Returns unique values with counts
   */
  public async queryPropertyValues(
    propertyName: string,
    elementTypes?: string[],
    storeyName?: string
  ): Promise<{
    success: boolean;
    propertyName: string;
    values: Array<{ value: string | number | boolean; count: number }>;
    totalElements: number;
    elementsWithProperty: number;
    uniqueValues: number;
  }> {
    console.log(`🔍 Querying property "${propertyName}" for types: ${elementTypes?.join(', ') || 'all'}`);

    try {
      // Get element IDs based on filters
      let idsByModel: Map<string, Set<number>>;
      
      if (elementTypes && elementTypes.length > 0) {
        idsByModel = new Map();
        for (const type of elementTypes) {
          const typeIds = await this.getIdsByType(type);
          for (const [modelId, ids] of typeIds) {
            if (!idsByModel.has(modelId)) {
              idsByModel.set(modelId, new Set());
            }
            ids.forEach(id => idsByModel.get(modelId)!.add(id));
          }
        }
      } else {
        // Get all elements
        idsByModel = await this.getAllElementIds();
      }

      // If storey filter is specified, further filter by storey
      if (storeyName) {
        idsByModel = await this.filterIdsByStorey(idsByModel, storeyName);
      }

      // Get properties for all matching elements
      const elements = await this.getPropertiesForElements(idsByModel);
      
      // Debug: Log first element's properties
      if (elements.length > 0) {
        console.log(`📋 Sample element properties:`, Object.keys(elements[0].properties));
        console.log(`📋 Sample values:`, elements[0].properties);
      }
      
      // Aggregate property values
      const valueCounts = new Map<string, number>();
      let elementsWithProperty = 0;
      const propertyNameLower = propertyName.toLowerCase();
      
      // Define fallback properties for common queries
      const fallbackProperties: Record<string, string[]> = {
        'material': ['ObjectType', 'Classification Description', 'Constituents', 'Finish'],
        'type': ['ObjectType', 'Name', 'Reference'],
        'classification': ['Classification Description', 'Classification Code'],
        'classificationcode': ['Classification Code'],
        'classificationdescription': ['Classification Description'],
      };
      
      // Check if this is a placeholder value (value equals property name or is generic)
      const isPlaceholderValue = (key: string, value: any): boolean => {
        if (value === undefined || value === null) return true;
        const valueStr = String(value).toLowerCase().trim();
        const keyLower = key.toLowerCase();
        const keyLastPart = keyLower.split('.').pop() || keyLower;
        // Common placeholder patterns
        if (valueStr === keyLower) return true;
        if (valueStr === keyLastPart) return true;
        if (valueStr === '' || valueStr === 'n/a' || valueStr === 'none' || valueStr === 'undefined') return true;
        return false;
      };

      for (const element of elements) {
        let foundValue: any = undefined;
        let foundKey: string | undefined = undefined;
        
        // Use flexible property matching
        foundValue = this.findPropertyValue(element.properties, propertyName);
        
        // Find the key that matched (for placeholder detection)
        if (foundValue !== undefined) {
          for (const [key, value] of Object.entries(element.properties)) {
            if (value === foundValue) {
              foundKey = key;
              break;
            }
          }
        }
        
        // Check if it's a placeholder value
        if (foundKey && isPlaceholderValue(foundKey, foundValue)) {
          foundValue = undefined;
        }
        
        // If not found or placeholder, try fallback properties
        if (foundValue === undefined && fallbackProperties[propertyNameLower]) {
          for (const fallbackProp of fallbackProperties[propertyNameLower]) {
            const value = element.properties[fallbackProp];
            if (value && !isPlaceholderValue(fallbackProp, value)) {
              // For ObjectType, extract the meaningful part (wall type name)
              if (fallbackProp === 'ObjectType' || fallbackProp === 'Name') {
                // Format: "Basic Wall:Interior - Partition (92mm Stud):128360"
                // Extract: "Interior - Partition (92mm Stud)"
                const parts = String(value).split(':');
                if (parts.length >= 2) {
                  foundValue = parts.slice(1, -1).join(':').trim() || parts[1].trim();
                } else {
                  foundValue = value;
                }
              } else {
                foundValue = value;
              }
              break;
            }
          }
        }

        if (foundValue !== undefined && foundValue !== null) {
          elementsWithProperty++;
          const valueStr = String(foundValue);
          valueCounts.set(valueStr, (valueCounts.get(valueStr) || 0) + 1);
        }
      }

      // Convert to array and sort by count
      const values = Array.from(valueCounts.entries())
        .map(([value, count]) => ({
          value: this.parsePropertyValue(value),
          count
        }))
        .sort((a, b) => b.count - a.count);

      console.log(`✅ Found ${values.length} unique values for "${propertyName}"`);

      return {
        success: true,
        propertyName,
        values,
        totalElements: elements.length,
        elementsWithProperty,
        uniqueValues: values.length
      };
    } catch (error) {
      console.error('❌ Error querying property values:', error);
      return {
        success: false,
        propertyName,
        values: [],
        totalElements: 0,
        elementsWithProperty: 0,
        uniqueValues: 0
      };
    }
  }

  /**
   * Aggregate a numeric property (sum, average, min, max, count)
   */
  public async aggregateProperty(
    propertyName: string,
    aggregation: 'sum' | 'average' | 'min' | 'max' | 'count',
    elementTypes?: string[],
    storeyName?: string
  ): Promise<{
    success: boolean;
    propertyName: string;
    aggregation: string;
    result: number;
    unit?: string;
    elementCount: number;
    elementsWithProperty: number;
  }> {
    console.log(`📊 Aggregating "${propertyName}" with ${aggregation}`);

    try {
      // Get element IDs based on filters
      let idsByModel: Map<string, Set<number>>;
      
      if (elementTypes && elementTypes.length > 0) {
        idsByModel = new Map();
        for (const type of elementTypes) {
          const typeIds = await this.getIdsByType(type);
          for (const [modelId, ids] of typeIds) {
            if (!idsByModel.has(modelId)) {
              idsByModel.set(modelId, new Set());
            }
            ids.forEach(id => idsByModel.get(modelId)!.add(id));
          }
        }
      } else {
        idsByModel = await this.getAllElementIds();
      }

      if (storeyName) {
        idsByModel = await this.filterIdsByStorey(idsByModel, storeyName);
      }

      const elements = await this.getPropertiesForElements(idsByModel);
      const propertyNameLower = propertyName.toLowerCase();
      const numericValues: number[] = [];

      for (const element of elements) {
        for (const [key, value] of Object.entries(element.properties)) {
          if (key.toLowerCase() === propertyNameLower || 
              key.toLowerCase().includes(propertyNameLower)) {
            const numValue = parseFloat(String(value));
            if (!isNaN(numValue)) {
              numericValues.push(numValue);
              break;
            }
          }
        }
      }

      let result: number;
      switch (aggregation) {
        case 'sum':
          result = numericValues.reduce((a, b) => a + b, 0);
          break;
        case 'average':
          result = numericValues.length > 0 
            ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length 
            : 0;
          break;
        case 'min':
          result = numericValues.length > 0 ? Math.min(...numericValues) : 0;
          break;
        case 'max':
          result = numericValues.length > 0 ? Math.max(...numericValues) : 0;
          break;
        case 'count':
          result = numericValues.length;
          break;
        default:
          result = 0;
      }

      // Detect unit from property name
      const unit = this.detectUnit(propertyName);

      console.log(`✅ ${aggregation} of "${propertyName}": ${result}${unit ? ' ' + unit : ''}`);

      return {
        success: true,
        propertyName,
        aggregation,
        result: Math.round(result * 100) / 100,
        unit,
        elementCount: elements.length,
        elementsWithProperty: numericValues.length
      };
    } catch (error) {
      console.error('❌ Error aggregating property:', error);
      return {
        success: false,
        propertyName,
        aggregation,
        result: 0,
        elementCount: 0,
        elementsWithProperty: 0
      };
    }
  }

  /**
   * Find elements by property value
   * Returns element IDs matching the criteria
   */
  public async findElementsByProperty(
    propertyName: string,
    operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'notEquals',
    value: string | number,
    elementTypes?: string[]
  ): Promise<{
    success: boolean;
    matchingElements: Map<string, Set<number>>;
    count: number;
    propertyName: string;
    criteria: string;
  }> {
    console.log(`🔎 Finding elements where "${propertyName}" ${operator} "${value}"`);

    try {
      let idsByModel: Map<string, Set<number>>;
      
      if (elementTypes && elementTypes.length > 0) {
        idsByModel = new Map();
        for (const type of elementTypes) {
          const typeIds = await this.getIdsByType(type);
          for (const [modelId, ids] of typeIds) {
            if (!idsByModel.has(modelId)) {
              idsByModel.set(modelId, new Set());
            }
            ids.forEach(id => idsByModel.get(modelId)!.add(id));
          }
        }
      } else {
        idsByModel = await this.getAllElementIds();
      }

      const elements = await this.getPropertiesForElements(idsByModel);
      const matchingElements = new Map<string, Set<number>>();

      for (const element of elements) {
        let foundValue: any = undefined;
        
        // Use flexible property matching
        foundValue = this.findPropertyValue(element.properties, propertyName);

        if (foundValue === undefined) continue;

        let matches = false;
        const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
        const numericPropValue = parseFloat(String(foundValue));
        const valueStr = String(value).toLowerCase().trim();
        const propValueStr = String(foundValue).toLowerCase().trim();

        switch (operator) {
          case 'equals':
            // Handle booleans specially
            if (typeof foundValue === 'boolean') {
              matches = (valueStr === 'true' && foundValue === true) || 
                       (valueStr === 'false' && foundValue === false);
            } else {
              matches = propValueStr === valueStr;
            }
            break;
          case 'notEquals':
            if (typeof foundValue === 'boolean') {
              matches = (valueStr === 'true' && foundValue === false) || 
                       (valueStr === 'false' && foundValue === true);
            } else {
              matches = propValueStr !== valueStr;
            }
            break;
          case 'contains':
            matches = propValueStr.includes(valueStr);
            break;
          case 'greaterThan':
            matches = !isNaN(numericPropValue) && !isNaN(numericValue) && numericPropValue > numericValue;
            break;
          case 'lessThan':
            matches = !isNaN(numericPropValue) && !isNaN(numericValue) && numericPropValue < numericValue;
            break;
        }

        if (matches) {
          if (!matchingElements.has(element.modelId)) {
            matchingElements.set(element.modelId, new Set());
          }
          matchingElements.get(element.modelId)!.add(element.expressID);
        }
      }

      let count = 0;
      matchingElements.forEach(ids => count += ids.size);

      console.log(`✅ Found ${count} elements matching criteria`);

      return {
        success: true,
        matchingElements,
        count,
        propertyName,
        criteria: `${propertyName} ${operator} ${value}`
      };
    } catch (error) {
      console.error('❌ Error finding elements by property:', error);
      return {
        success: false,
        matchingElements: new Map(),
        count: 0,
        propertyName,
        criteria: `${propertyName} ${operator} ${value}`
      };
    }
  }

  /**
   * Get properties for currently selected elements
   */
  public async getSelectedElementProperties(
    selectedIds: Map<string, Set<number>>
  ): Promise<{
    success: boolean;
    elements: Array<{
      expressID: number;
      modelId: string;
      type: string;
      name: string;
      properties: Record<string, any>;
    }>;
    commonProperties: string[];
    propertyStats: Record<string, { values: string[]; count: number }>;
  }> {
    console.log(`📋 Getting properties for selected elements`);

    try {
      const elements = await this.getPropertiesForElements(selectedIds);
      
      // Build property statistics
      const propertyStats: Record<string, { values: Set<string>; count: number }> = {};
      const formattedElements: Array<{
        expressID: number;
        modelId: string;
        type: string;
        name: string;
        properties: Record<string, any>;
      }> = [];

      for (const element of elements) {
        formattedElements.push({
          expressID: element.expressID,
          modelId: element.modelId,
          type: element.properties.type || element.properties.ObjectType || 'Unknown',
          name: element.properties.Name || element.properties.name || `Element ${element.expressID}`,
          properties: element.properties
        });

        for (const [key, value] of Object.entries(element.properties)) {
          if (!propertyStats[key]) {
            propertyStats[key] = { values: new Set(), count: 0 };
          }
          propertyStats[key].values.add(String(value));
          propertyStats[key].count++;
        }
      }

      // Find common properties (present in all elements)
      const commonProperties = Object.entries(propertyStats)
        .filter(([_, stats]) => stats.count === elements.length)
        .map(([key]) => key);

      // Convert sets to arrays for output
      const finalStats: Record<string, { values: string[]; count: number }> = {};
      for (const [key, stats] of Object.entries(propertyStats)) {
        finalStats[key] = {
          values: Array.from(stats.values).slice(0, 10), // Limit to 10 unique values
          count: stats.count
        };
      }

      console.log(`✅ Got properties for ${elements.length} elements`);

      return {
        success: true,
        elements: formattedElements,
        commonProperties,
        propertyStats: finalStats
      };
    } catch (error) {
      console.error('❌ Error getting selected properties:', error);
      return {
        success: false,
        elements: [],
        commonProperties: [],
        propertyStats: {}
      };
    }
  }

  /**
   * List available properties in the model
   */
  public async listAvailableProperties(
    elementTypes?: string[],
    sampleSize: number = 100
  ): Promise<{
    success: boolean;
    properties: Array<{ name: string; occurrences: number; sampleValues: string[] }>;
    totalSampled: number;
  }> {
    console.log(`📝 Listing available properties`);

    try {
      let idsByModel: Map<string, Set<number>>;
      
      if (elementTypes && elementTypes.length > 0) {
        idsByModel = new Map();
        for (const type of elementTypes) {
          const typeIds = await this.getIdsByType(type);
          for (const [modelId, ids] of typeIds) {
            if (!idsByModel.has(modelId)) {
              idsByModel.set(modelId, new Set());
            }
            // Take a sample
            let count = 0;
            for (const id of ids) {
              if (count >= sampleSize / elementTypes.length) break;
              idsByModel.get(modelId)!.add(id);
              count++;
            }
          }
        }
      } else {
        // Sample from all elements
        idsByModel = new Map();
        let totalCount = 0;
        for (const [modelId, model] of this.fragments.list) {
          if (totalCount >= sampleSize) break;
          try {
            const categories = await (model as any).getCategories();
            for (const cat of categories) {
              if (totalCount >= sampleSize) break;
              const items = await (model as any).getItemsOfCategories([new RegExp(`^${cat}$`)]);
              for (const category in items) {
                const ids = items[category] as number[];
                if (!ids) continue;
                if (!idsByModel.has(modelId)) {
                  idsByModel.set(modelId, new Set());
                }
                for (const id of ids) {
                  if (totalCount >= sampleSize) break;
                  idsByModel.get(modelId)!.add(id);
                  totalCount++;
                }
              }
            }
          } catch (e) {}
        }
      }

      const elements = await this.getPropertiesForElements(idsByModel);
      const propertyInfo: Map<string, { count: number; values: Set<string> }> = new Map();

      for (const element of elements) {
        for (const [key, value] of Object.entries(element.properties)) {
          // Skip internal properties
          if (key.startsWith('_') || key === 'type') continue;
          
          if (!propertyInfo.has(key)) {
            propertyInfo.set(key, { count: 0, values: new Set() });
          }
          const info = propertyInfo.get(key)!;
          info.count++;
          if (info.values.size < 5) {
            info.values.add(String(value).substring(0, 50));
          }
        }
      }

      const properties = Array.from(propertyInfo.entries())
        .map(([name, info]) => ({
          name,
          occurrences: info.count,
          sampleValues: Array.from(info.values)
        }))
        .sort((a, b) => b.occurrences - a.occurrences);

      console.log(`✅ Found ${properties.length} properties`);

      return {
        success: true,
        properties,
        totalSampled: elements.length
      };
    } catch (error) {
      console.error('❌ Error listing properties:', error);
      return {
        success: false,
        properties: [],
        totalSampled: 0
      };
    }
  }

  // ============================================================================
  // HELPER METHODS FOR PROPERTY QUERIES
  // ============================================================================

  /**
   * Get all element IDs from all models
   */
  private async getAllElementIds(): Promise<Map<string, Set<number>>> {
    const result = new Map<string, Set<number>>();

    for (const [modelId, model] of this.fragments.list) {
      try {
        const categories = await (model as any).getCategories();
        const spatialCategories = ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE'];
        const elementCategories = categories.filter((cat: string) => !spatialCategories.includes(cat));
        
        if (elementCategories.length === 0) continue;

        const categoryRegexes = elementCategories.map((cat: string) => new RegExp(`^${cat}$`));
        const itemsByCategory = await (model as any).getItemsOfCategories(categoryRegexes);

        const modelIds = new Set<number>();
        for (const category in itemsByCategory) {
          const ids = itemsByCategory[category] as number[];
          if (ids) {
            ids.forEach(id => modelIds.add(id));
          }
        }

        if (modelIds.size > 0) {
          result.set(modelId, modelIds);
        }
      } catch (e) {
        console.warn(`Error getting all element IDs for model ${modelId}`, e);
      }
    }

    return result;
  }

  /**
   * Filter element IDs by storey containment
   */
  private async filterIdsByStorey(
    idsByModel: Map<string, Set<number>>,
    storeyName: string
  ): Promise<Map<string, Set<number>>> {
    const result = new Map<string, Set<number>>();

    for (const [modelId, ids] of idsByModel) {
      const model = this.fragments.list.get(modelId);
      if (!model) continue;

      try {
        // Get storey local ID
        const storeyItems = await (model as any).getItemsOfCategories([/BUILDINGSTOREY/]);
        const categoryKey = Object.keys(storeyItems).find(key => key.includes('BUILDINGSTOREY'));
        if (!categoryKey) continue;

        const storeyIds = storeyItems[categoryKey];
        const storeyData = await (model as any).getItemsData(storeyIds, {
          attributesDefault: false,
          attributes: ['Name', 'LongName']
        });

        let storeyLocalId: number | null = null;
        for (let i = 0; i < storeyData.length; i++) {
          const nameAttr = storeyData[i].Name as any;
          const longNameAttr = storeyData[i].LongName as any;
          const name = nameAttr?.value || longNameAttr?.value || '';
          if (name.toLowerCase().includes(storeyName.toLowerCase())) {
            storeyLocalId = storeyIds[i];
            break;
          }
        }

        if (!storeyLocalId) continue;

        // Check containment for each element
        const idArray = Array.from(ids);
        const itemsData = await (model as any).getItemsData(idArray, {
          attributesDefault: false,
          attributes: [],
          relations: {
            ContainedInStructure: { attributes: false, relations: false },
          },
        });

        const filteredIds = new Set<number>();
        for (let i = 0; i < itemsData.length; i++) {
          const data = itemsData[i];
          if (data.ContainedInStructure && Array.isArray(data.ContainedInStructure)) {
            const isInStorey = data.ContainedInStructure.some((rel: any) => {
              const relLocalId = rel._localId?.value || rel.localId;
              return relLocalId === storeyLocalId;
            });
            if (isInStorey) {
              filteredIds.add(idArray[i]);
            }
          }
        }

        if (filteredIds.size > 0) {
          result.set(modelId, filteredIds);
        }
      } catch (e) {
        console.warn(`Error filtering by storey for model ${modelId}`, e);
      }
    }

    return result;
  }

  /**
   * Parse property value to appropriate type
   */
  private parsePropertyValue(value: string): string | number | boolean {
    // Try boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Try number
    const num = parseFloat(value);
    if (!isNaN(num) && isFinite(num)) return num;
    
    return value;
  }

  /**
   * Detect unit from property name
   */
  private detectUnit(propertyName: string): string | undefined {
    const lowerName = propertyName.toLowerCase();
    
    if (lowerName.includes('area')) return 'm²';
    if (lowerName.includes('volume')) return 'm³';
    if (lowerName.includes('length') || lowerName.includes('height') || lowerName.includes('width') || lowerName.includes('depth')) return 'm';
    if (lowerName.includes('angle')) return '°';
    if (lowerName.includes('weight') || lowerName.includes('mass')) return 'kg';
    if (lowerName.includes('temperature')) return '°C';
    
    return undefined;
  }

  /**
   * Normalize a property name for matching
   * Removes spaces, underscores, dots and converts to lowercase
   */
  private normalizePropertyName(name: string): string {
    return name.toLowerCase().replace(/[\s_\.]/g, '');
  }

  /**
   * Find a property value with flexible name matching
   * Handles spaces, underscores, case differences, and PSet prefixes
   */
  private findPropertyValue(properties: Record<string, any>, searchName: string): any {
    const normalizedSearch = this.normalizePropertyName(searchName);
    
    // Priority 1: Exact match (case-insensitive)
    for (const [key, value] of Object.entries(properties)) {
      if (key.toLowerCase() === searchName.toLowerCase()) {
        return value;
      }
    }
    
    // Priority 2: Normalized match (ignoring spaces, underscores, etc.)
    for (const [key, value] of Object.entries(properties)) {
      if (this.normalizePropertyName(key) === normalizedSearch) {
        return value;
      }
    }
    
    // Priority 3: Key ends with the search term (after the last dot)
    for (const [key, value] of Object.entries(properties)) {
      const keyParts = key.split('.');
      const lastPart = keyParts[keyParts.length - 1];
      if (this.normalizePropertyName(lastPart) === normalizedSearch) {
        return value;
      }
    }
    
    // Priority 4: Partial match (search term is contained in key)
    for (const [key, value] of Object.entries(properties)) {
      if (this.normalizePropertyName(key).includes(normalizedSearch)) {
        return value;
      }
    }
    
    return undefined;
  }
}
