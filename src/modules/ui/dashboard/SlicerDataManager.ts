/**
 * SLICER DATA MANAGER (The "Slicer Account Department")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module is the brain of the filtering system. It keeps track of 
 * which objects are currently "selected" in the Slicer and calculates 
 * which other objects should be hidden or shown as a result.
 * 
 * HOW IT CONNECTS:
 * - SlicerDashboard: This is the "data department" for the Slicer tool.
 * - IFC Models: It reads the properties of every object to know which 
 *   level or category they belong to.
 * --------------------------------------------------------------------------------
 */

export interface SlicerConfig {
  id: string;
  title: string;
  type: 'dropdown' | 'checkbox' | 'range' | 'chart-pie' | 'chart-bar' | 'search' | 'tile';
  property: string;
  multiSelect?: boolean;
  showCounts?: boolean;
  collapsed?: boolean;
}

export interface SlicerState {
  id: string;
  selectedValues: Set<string>;
  rangeMin?: number;
  rangeMax?: number;
  searchText?: string;
}

export interface PropertyData {
  expressID: number;
  modelId: string;
  [key: string]: any;
}

export class SlicerDataManager {
  public convertSlicerDataToPropertyData(slicerData: any, primaryModelId: string): PropertyData[] {
    const dataMap = new Map<string, PropertyData>();
    
    const parseKey = (key: string): { modelId: string, expressID: number } => {
      const colonIdx = key.indexOf(':');
      if (colonIdx !== -1) {
        return {
          modelId: key.substring(0, colonIdx),
          expressID: parseInt(key.substring(colonIdx + 1), 10)
        };
      }
      return { modelId: primaryModelId, expressID: parseInt(key, 10) };
    };
    
    for (const [category, keys] of slicerData.categories) {
      for (const key of keys as Set<string>) {
        const { modelId, expressID } = parseKey(key);
        if (!dataMap.has(key)) {
          dataMap.set(key, { expressID, modelId, type: category });
        } else {
          dataMap.get(key)!.type = category;
        }
      }
    }
    
    for (const [propName, valueMap] of slicerData.properties) {
      for (const [value, keys] of valueMap as Map<string, Set<string>>) {
        for (const key of keys) {
          const { modelId, expressID } = parseKey(key);
          if (!dataMap.has(key)) {
            dataMap.set(key, { expressID, modelId, [propName]: value });
          } else {
            dataMap.get(key)![propName] = value;
          }
        }
      }
    }
    
    for (const [propName, propData] of slicerData.numericProperties) {
      for (const [value, keys] of (propData as any).values) {
        for (const key of keys as Set<string>) {
          const { modelId, expressID } = parseKey(key);
          if (!dataMap.has(key)) {
            dataMap.set(key, { expressID, modelId, [propName]: value });
          } else {
            dataMap.get(key)![propName] = value;
          }
        }
      }
    }
    
    return Array.from(dataMap.values());
  }

  public autoGenerateSlicersFromData(slicerData: any): SlicerConfig[] {
    const configs: SlicerConfig[] = [];
    let slicerId = 0;
    
    const priorityProperties = [
      'Building Level', 'Space', 'PredefinedType', 'Material',
      'Name', 'ObjectType', 'Description', 'Level', 'IsExternal', 'Tag', 'Layer'
    ];
    
    if (slicerData.categories.size > 0) {
      configs.push({
        id: `slicer-${slicerId++}`,
        title: 'IFC Type',
        type: 'chart-bar',
        property: 'type',
        multiSelect: true,
        showCounts: true
      });
    }
    
    for (const propName of priorityProperties) {
      if (configs.length >= 20) break;
      const valueMap = slicerData.properties.get(propName);
      const isBuildingLevel = propName === 'Building Level';
      const isSpace = propName === 'Space';
      const minSize = (isBuildingLevel || isSpace) ? 1 : 2;
      const maxSize = 500;
      
      if (valueMap && valueMap.size >= minSize && valueMap.size <= maxSize) {
        let slicerType: any = valueMap.size <= 6 ? 'tile' : 'checkbox';
        if (isBuildingLevel) slicerType = 'chart-pie';
        else if (isSpace) slicerType = 'chart-bar';
        else if (propName === 'PredefinedType' || propName === 'Material') slicerType = 'chart-bar';
        
        configs.push({
          id: `slicer-${slicerId++}`,
          title: this.formatPropertyName(propName),
          type: slicerType,
          property: propName,
          multiSelect: true,
          showCounts: true
        });
        slicerData.properties.delete(propName);
      }
    }
    
    for (const [propName, valueMap] of slicerData.properties) {
      if (configs.length >= 20) break;
      const uniqueValues = (valueMap as Map<string, any>).size;
      if (uniqueValues > 1 && uniqueValues <= 200) {
        configs.push({
          id: `slicer-${slicerId++}`,
          title: this.formatPropertyName(propName),
          type: uniqueValues <= 6 ? 'tile' : 'checkbox',
          property: propName,
          multiSelect: true,
          showCounts: true
        });
      }
    }
    
    for (const [propName, propData] of slicerData.numericProperties) {
      if (configs.length >= 20) break;
      if ((propData as any).max > (propData as any).min) {
        configs.push({
          id: `slicer-${slicerId++}`,
          title: this.formatPropertyName(propName),
          type: 'range',
          property: propName,
          showCounts: true
        });
      }
    }
    
    return configs;
  }

  private formatPropertyName(prop: string): string {
    return prop.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
  }

  public getPropertyValues(property: string, data: PropertyData[]): { value: string; count: number }[] {
    const valueCounts = new Map<string, number>();
    data.forEach(row => {
      const value = row[property];
      if (value !== null && value !== undefined && value !== '') {
        const strValue = String(value);
        valueCounts.set(strValue, (valueCounts.get(strValue) || 0) + 1);
      }
    });
    return Array.from(valueCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }
}
