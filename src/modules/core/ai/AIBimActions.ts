import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import type { IFCViewer } from '../../../IFCViewer';

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

  public async addClippingPlane() {
    const clipper = this.components.get(OBC.Clipper);
    const world = this.viewer.worldManager.world;
    if (clipper && world) {
      clipper.enabled = true;
      clipper.create(world);
    }
  }

  public async clearSelection() {
    const highlighter = this.components.get(OBF.Highlighter);
    if (highlighter) highlighter.clear('select');
  }

  public async resetView() {
    const highlighter = this.components.get(OBF.Highlighter);
    if (highlighter) highlighter.clear('select');
    
    const hider = this.components.get(OBC.Hider);
    if (hider) hider.set(true);

    const clipper = this.components.get(OBC.Clipper);
    if (clipper) {
      clipper.deleteAll();
      clipper.enabled = false;
    }

    // Exit color splash mode if active
    if (this.viewer.colorSplash?.isColorSplashActive()) {
      await this.viewer.colorSplash.toggleColorSplash();
    }

    // Exit cluster mode if active
    if (this.viewer.cluster?.isClusteringActive()) {
      await this.viewer.cluster.exitToColorView();
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
}
