import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import type { AIBimActions } from './AIBimActions';

export class AIRuleEngine {
  private types = [
    { keywords: ['wall', 'walls'], ifcType: 'IFCWALL', label: 'walls' },
    { keywords: ['window', 'windows'], ifcType: 'IFCWINDOW', label: 'windows' },
    { keywords: ['door', 'doors'], ifcType: 'IFCDOOR', label: 'doors' },
    { keywords: ['slab', 'slabs', 'floor', 'floors'], ifcType: 'IFCSLAB', label: 'slabs' },
    { keywords: ['column', 'columns', 'pillar', 'pillars'], ifcType: 'IFCCOLUMN', label: 'columns' },
    { keywords: ['beam', 'beams'], ifcType: 'IFCBEAM', label: 'beams' },
    { keywords: ['stair', 'stairs'], ifcType: 'IFCSTAIR', label: 'stairs' },
    { keywords: ['member', 'members'], ifcType: 'IFCMEMBER', label: 'members' },
    { keywords: ['furniture', 'furnitures'], ifcType: 'IFCFURNISHINGELEMENT', label: 'furniture' },
    { keywords: ['pipe', 'pipes'], ifcType: 'IFCPIPESEGMENT', label: 'pipes' },
    { keywords: ['duct', 'ducts'], ifcType: 'IFCDUCTSEGMENT', label: 'ducts' },
  ];

  constructor(private actions: AIBimActions, private components: OBC.Components) {}

  public async handleTypeCommand(command: string): Promise<string> {
    const matchedTypes = this.types.filter(type => 
      type.keywords.some(k => command.includes(k))
    );

    if (matchedTypes.length === 0) {
      return "I couldn't identify the element type you're looking for.";
    }

    const labels = matchedTypes.map(t => t.label).join(' and ');
    let totalCount = 0;

    if (command.includes('select')) {
      const highlighter = this.components.get(OBF.Highlighter);
      if (highlighter) highlighter.clear('select');
      
      const allIdsByModel: Record<string, Set<number>> = {};
      for (const type of matchedTypes) {
        const idsByModel = await this.actions.getIdsByType(type.ifcType);
        for (const [modelId, ids] of idsByModel) {
          if (!allIdsByModel[modelId]) allIdsByModel[modelId] = new Set();
          ids.forEach(id => allIdsByModel[modelId].add(id));
          totalCount += ids.size;
        }
      }
      
      if (totalCount > 0 && highlighter) {
        highlighter.highlightByID('select', allIdsByModel);
      }
      return `I've selected ${totalCount} ${labels} for you.`;

    } else if (command.includes('unhide') || command.includes('show')) {
      const hider = this.components.get(OBC.Hider);
      const allIdsByModel: Record<string, Set<number>> = {};
      for (const type of matchedTypes) {
        const idsByModel = await this.actions.getIdsByType(type.ifcType);
        for (const [modelId, ids] of idsByModel) {
          if (!allIdsByModel[modelId]) allIdsByModel[modelId] = new Set();
          ids.forEach(id => allIdsByModel[modelId].add(id));
          totalCount += ids.size;
        }
      }
      if (totalCount > 0 && hider) hider.set(true, allIdsByModel);
      return `I've shown ${totalCount} ${labels}.`;

    } else if (command.includes('hide')) {
      const hider = this.components.get(OBC.Hider);
      const allIdsByModel: Record<string, Set<number>> = {};
      for (const type of matchedTypes) {
        const idsByModel = await this.actions.getIdsByType(type.ifcType);
        for (const [modelId, ids] of idsByModel) {
          if (!allIdsByModel[modelId]) allIdsByModel[modelId] = new Set();
          ids.forEach(id => allIdsByModel[modelId].add(id));
          totalCount += ids.size;
        }
      }
      if (totalCount > 0 && hider) hider.set(false, allIdsByModel);
      return `I've hidden ${totalCount} ${labels}.`;

    } else if (command.includes('isolate')) {
      const hider = this.components.get(OBC.Hider);
      const allIdsByModel: Record<string, Set<number>> = {};
      for (const type of matchedTypes) {
        const idsByModel = await this.actions.getIdsByType(type.ifcType);
        for (const [modelId, ids] of idsByModel) {
          if (!allIdsByModel[modelId]) allIdsByModel[modelId] = new Set();
          ids.forEach(id => allIdsByModel[modelId].add(id));
          totalCount += ids.size;
        }
      }
      if (totalCount > 0 && hider) hider.isolate(allIdsByModel);
      return `I've isolated ${totalCount} ${labels}.`;

    } else if (command.includes('zoom') || command.includes('focus')) {
      const overallBox = new THREE.Box3();
      for (const type of matchedTypes) {
        const idsByModel = await this.actions.getIdsByType(type.ifcType);
        for (const [modelId, ids] of idsByModel) {
          const model = this.actions.fragments.list.get(modelId);
          if (model) {
            const bbox = await (model as any).getMergedBox(Array.from(ids));
            if (bbox && !bbox.isEmpty()) {
              overallBox.union(bbox);
              totalCount += ids.size;
            }
          }
        }
      }
      if (totalCount > 0 && !overallBox.isEmpty()) {
        const world = this.actions.viewer.worldManager.world;
        if (world && world.camera instanceof OBC.OrthoPerspectiveCamera) {
          await world.camera.controls.fitToBox(overallBox, true);
        }
      }
      return `I've zoomed to ${totalCount} ${labels}.`;

    } else if (command.includes('count') || command.includes('how many')) {
      for (const type of matchedTypes) {
        const idsByModel = await this.actions.getIdsByType(type.ifcType);
        idsByModel.forEach(ids => totalCount += ids.size);
      }
      return `There are ${totalCount} ${labels} in the model.`;
    }

    return "I couldn't identify the element type you're looking for.";
  }
}
