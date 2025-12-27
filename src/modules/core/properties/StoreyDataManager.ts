/**
 * STOREY DATA MANAGER (The "Floor Planner")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module understands the vertical structure of the building. It 
 * identifies which objects belong to which floor (storey) and allows 
 * you to filter the model by level.
 * 
 * WHY IT MATTERS: 
 * Buildings are complex. Being able to see just the "First Floor" or 
 * "Roof" is essential for understanding the design. This module 
 * provides the data needed to slice the building horizontally.
 * --------------------------------------------------------------------------------
 */
import { PropertiesContext } from './SelectionManager';

export class StoreyDataManager {
  public storeyData: { [storeyName: string]: { [category: string]: number } } = {};

  constructor(private context: PropertiesContext) {}

  /**
   * Gathers storey element counts from the spatial tree structure
   */
  public async gatherStoreyElementsFromTree(model: any, storeyNode: any, storeyLocalId: number): Promise<void> {
    let storeyName = storeyNode.name || storeyNode.Name?.value;
    if (!storeyName) {
      try {
        const [itemData] = await model.getItemsData([storeyLocalId], {
          attributesDefault: false,
          attributes: ['Name', 'LongName'],
        });
        storeyName = itemData?.Name?.value || itemData?.LongName?.value || `Storey ${storeyLocalId}`;
      } catch (error) {
        storeyName = `Storey ${storeyLocalId}`;
      }
    }

    if (!this.storeyData[storeyName]) {
      this.storeyData[storeyName] = {};
    }

    if (storeyNode.children && Array.isArray(storeyNode.children)) {
      for (const categoryGroup of storeyNode.children) {
        const groupCategory = categoryGroup.category || categoryGroup._category?.value;
        
        const spatialCategories = ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE'];
        if (!groupCategory || spatialCategories.includes(groupCategory)) {
          continue;
        }

        const elementCount = categoryGroup.children?.length || 0;
        
        if (elementCount > 0) {
          this.storeyData[storeyName][groupCategory] = elementCount;
        }
      }
    }
  }

  /**
   * Gathers element counts by category for a specific storey (data only, no HTML)
   */
  public async gatherElementsForStorey(model: any, modelId: string, storeyLocalId: number, storeyName: string): Promise<void> {
    try {
      const categories = await model.getCategories();
      const spatialCategories = ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE'];
      const elementCategories = categories.filter((cat: string) => !spatialCategories.includes(cat));
      
      if (elementCategories.length === 0) return;
      
      const categoryRegexps = elementCategories.map((cat: string) => new RegExp(`^${cat}$`));
      const itemsByCategory = await model.getItemsOfCategories(categoryRegexps);
      
      if (!this.storeyData[storeyName]) {
        this.storeyData[storeyName] = {};
      }
      
      for (const [category, allLocalIds] of Object.entries(itemsByCategory)) {
        const ids = allLocalIds as number[];
        if (ids.length === 0) continue;
        
        const itemsInStorey: number[] = [];
        
        try {
          const itemsData = await model.getItemsData(ids, {
            attributesDefault: false,
            attributes: [],
            relations: {
              ContainedInStructure: { attributes: false, relations: false },
            },
          });
          
          for (let i = 0; i < itemsData.length; i++) {
            const data = itemsData[i];
            const localId = ids[i];
            
            if (data.ContainedInStructure && Array.isArray(data.ContainedInStructure)) {
              const isInStorey = data.ContainedInStructure.some((rel: any) => {
                const relLocalId = rel._localId?.value || rel.localId;
                return relLocalId === storeyLocalId;
              });
              
              if (isInStorey) {
                itemsInStorey.push(localId);
              }
            }
          }
        } catch (error) {}
        
        if (itemsInStorey.length === 0) {
          try {
            const itemsData = await model.getItemsData(ids, {
              attributesDefault: false,
              attributes: [],
              relations: {
                ObjectPlacement: { attributes: false, relations: { PlacementRelTo: { attributes: false, relations: false } } },
              },
            });
            
            for (let i = 0; i < itemsData.length; i++) {
              const data = itemsData[i];
              const localId = ids[i];
              
              if (data.ObjectPlacement?.PlacementRelTo) {
                let currentPlacement = data.ObjectPlacement.PlacementRelTo;
                let depth = 0;
                while (currentPlacement && depth < 10) {
                  const placementId = currentPlacement._localId?.value || currentPlacement.localId;
                  if (placementId === storeyLocalId) {
                    itemsInStorey.push(localId);
                    break;
                  }
                  currentPlacement = currentPlacement.PlacementRelTo;
                  depth++;
                }
              }
            }
          } catch (error) {}
        }
        
        if (itemsInStorey.length > 0) {
          this.storeyData[storeyName][category] = (this.storeyData[storeyName][category] || 0) + itemsInStorey.length;
        }
      }
    } catch (error) {}
  }
}
