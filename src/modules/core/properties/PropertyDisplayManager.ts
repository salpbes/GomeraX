/**
 * PROPERTY DISPLAY MANAGER (The "Information Desk")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module is responsible for showing the properties of a single 
 * selected object in the side panel. It handles the layout and 
 * formatting of the data.
 * 
 * WHY IT MATTERS: 
 * It's the primary way users see the details of what they've clicked. 
 * It ensures that the information is presented clearly and that 
 * the user can easily find the specific property they are looking for.
 * --------------------------------------------------------------------------------
 */
import * as THREE from 'three';
import { PropertiesContext } from './SelectionManager';

export class PropertyDisplayManager {
  private propertiesElement: HTMLDivElement | null = null;
  private propsExpandTab: HTMLDivElement | null = null;

  constructor(private context: PropertiesContext) {}

  public setPropertiesElement(element: HTMLDivElement): void {
    this.propertiesElement = element;
  }

  public getPropsExpandTab(): HTMLDivElement | null {
    return this.propsExpandTab;
  }

  /**
   * Creates the properties panel (right side)
   */
  public createPropertiesPanel(): HTMLElement {
    const propsPanel = document.createElement('div');
    propsPanel.id = 'ifc-properties-panel';
    propsPanel.className = 'ifc-properties-panel collapsed';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <h3><i class="fas fa-info-circle"></i> Properties</h3>
      <button id="collapse-props-btn" class="icon-btn" title="Expand Panel">
        <i class="fas fa-plus"></i>
      </button>
    `;
    propsPanel.appendChild(header);

    const propsContent = document.createElement('div');
    propsContent.id = 'properties-content';
    propsContent.className = 'properties-content';
    propsContent.innerHTML = '<p class="no-selection">Click an element to view properties</p>';
    propsPanel.appendChild(propsContent);

    this.propertiesElement = propsContent as HTMLDivElement;

    const collapseBtn = header.querySelector('#collapse-props-btn');
    
    const expandTab = document.createElement('div');
    expandTab.className = 'expand-tab expand-tab-right';
    expandTab.innerHTML = '<i class="fas fa-info-circle"></i>';
    expandTab.title = 'Show Properties';
    expandTab.style.opacity = '1';
    expandTab.style.pointerEvents = 'auto';
    this.propsExpandTab = expandTab;
    
    collapseBtn?.addEventListener('click', () => {
      propsPanel.classList.toggle('collapsed');
      const icon = collapseBtn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-minus');
        icon.classList.toggle('fa-plus');
      }
      if (this.propsExpandTab) {
        if (propsPanel.classList.contains('collapsed')) {
          this.propsExpandTab.style.opacity = '1';
          this.propsExpandTab.style.pointerEvents = 'auto';
        } else {
          this.propsExpandTab.style.opacity = '0';
          this.propsExpandTab.style.pointerEvents = 'none';
        }
      }
    });
    
    expandTab.addEventListener('click', () => {
      propsPanel.classList.remove('collapsed');
      const icon = collapseBtn?.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-plus');
        icon.classList.add('fa-minus');
      }
      expandTab.style.opacity = '0';
      expandTab.style.pointerEvents = 'none';
    });

    return propsPanel;
  }

  /**
   * Retrieves and displays IFC properties from the fragment model
   */
  public async showIfcProperties(modelId: string, localId: number, mesh: THREE.Object3D): Promise<void> {
    if (!this.propertiesElement || !this.context.fragmentsManager) {
      console.warn('⚠️ Properties element or fragments manager not available');
      this.showProperties(mesh);
      return;
    }

    try {
      const model = this.context.fragmentsManager.list.get(modelId);
      if (!model) {
        this.showProperties(mesh);
        return;
      }

      if (typeof (model as any).getItemsData !== 'function') {
        this.showProperties(mesh);
        return;
      }

      const ifcDataArray = await (model as any).getItemsData([localId], {
        attributesDefault: true,
        relations: {
          IsDefinedBy: { attributes: true, relations: true },
          DefinesOcurrence: { attributes: false, relations: false },
        },
      });

      if (!ifcDataArray || ifcDataArray.length === 0) {
        this.showProperties(mesh);
        return;
      }

      const ifcData = ifcDataArray[0];
      this.displayIfcData(ifcData, mesh);
    } catch (error) {
      console.error('❌ Error fetching IFC data:', error);
      this.showProperties(mesh);
    }
  }

  /**
   * Displays IFC data in the properties panel
   */
  private displayIfcData(ifcData: any, mesh: THREE.Object3D): void {
    if (!this.propertiesElement) return;

    let html = '<div class="property-groups">';

    html += '<div class="property-group">';
    html += '<div class="property-group-header">🏗️ IFC Information</div>';

    for (const [key, value] of Object.entries(ifcData)) {
      if (key.startsWith('_') || Array.isArray(value)) continue;

      const attr = value as any;
      if (attr && typeof attr === 'object' && 'value' in attr && attr.value !== undefined && attr.value !== null) {
        html += `<div class="property-row">
          <span class="property-key">${key}:</span>
          <span class="property-value">${this.formatValue(attr.value)}</span>
        </div>`;
      }
    }

    html += '</div>';

    if (ifcData.IsDefinedBy && Array.isArray(ifcData.IsDefinedBy)) {
      html += '<div class="property-group">';
      html += '<div class="property-group-header">📐 Property Sets</div>';

      for (const pset of ifcData.IsDefinedBy) {
        const psetName = pset.Name?.value || 'Unknown PropertySet';
        html += `<div class="property-row" style="font-weight: 600; margin-top: 8px;">
          <span class="property-key">${psetName}</span>
        </div>`;

        if (pset.HasProperties && Array.isArray(pset.HasProperties)) {
          for (const prop of pset.HasProperties) {
            const propName = prop.Name?.value || 'Unknown';
            const propValue = prop.NominalValue?.value || 'N/A';
            html += `<div class="property-row" style="padding-left: 16px;">
              <span class="property-key">${propName}:</span>
              <span class="property-value">${this.formatValue(propValue)}</span>
            </div>`;
          }
        }
      }

      html += '</div>';
    }

    if (mesh instanceof THREE.Mesh && mesh.geometry) {
      html += '<div class="property-group">';
      html += '<div class="property-group-header">📦 Geometry</div>';

      const geometry = mesh.geometry;
      if (geometry.attributes.position) {
        html += `<div class="property-row">
          <span class="property-key">Vertices:</span>
          <span class="property-value">${geometry.attributes.position.count.toLocaleString()}</span>
        </div>`;
      }

      if (geometry.index) {
        html += `<div class="property-row">
          <span class="property-key">Faces:</span>
          <span class="property-value">${Math.floor(geometry.index.count / 3).toLocaleString()}</span>
        </div>`;
      }
      
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox();
      }
      
      if (geometry.boundingBox) {
        const bbox = geometry.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        
        html += `<div class="property-row">
          <span class="property-key">BBox Size:</span>
          <span class="property-value">${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}</span>
        </div>`;
        
        html += `<div class="property-row">
          <span class="property-key">BBox Center:</span>
          <span class="property-value">${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}</span>
        </div>`;
      }

      html += '</div>';
    }

    html += '<div class="property-group">';
    html += '<div class="property-group-header">📍 Transform</div>';
    html += `<div class="property-row">
      <span class="property-key">Position:</span>
      <span class="property-value">${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)}</span>
    </div>`;
    
    const rotX = THREE.MathUtils.radToDeg(mesh.rotation.x);
    const rotY = THREE.MathUtils.radToDeg(mesh.rotation.y);
    const rotZ = THREE.MathUtils.radToDeg(mesh.rotation.z);
    html += `<div class="property-row">
      <span class="property-key">Rotation (°):</span>
      <span class="property-value">${rotX.toFixed(1)}°, ${rotY.toFixed(1)}°, ${rotZ.toFixed(1)}°</span>
    </div>`;
    
    html += `<div class="property-row">
      <span class="property-key">Scale:</span>
      <span class="property-value">${mesh.scale.x.toFixed(2)}, ${mesh.scale.y.toFixed(2)}, ${mesh.scale.z.toFixed(2)}</span>
    </div>`;
    
    html += '</div>';

    html += '</div>';
    this.propertiesElement.innerHTML = html;
  }

  /**
   * Shows properties for selected object (fallback)
   */
  public showProperties(object: THREE.Object3D): void {
    if (!this.propertiesElement) return;

    try {
      const mesh = object as any;
      let html = '<div class="property-groups">';
      
      const hasIfcData = mesh.userData && Object.keys(mesh.userData).length > 0;
      if (hasIfcData) {
        html += '<div class="property-group">';
        html += '<div class="property-group-header">🏗️ IFC Information</div>';
        
        if (mesh.userData.expressID !== undefined) {
          html += `<div class="property-row">
            <span class="property-key">Express ID:</span>
            <span class="property-value">${mesh.userData.expressID}</span>
          </div>`;
        }
        
        if (mesh.userData.type || mesh.userData.ifcType) {
          html += `<div class="property-row">
            <span class="property-key">IFC Type:</span>
            <span class="property-value">${mesh.userData.type || mesh.userData.ifcType}</span>
          </div>`;
        }
        
        if (mesh.userData.GlobalId) {
          html += `<div class="property-row">
            <span class="property-key">Global ID:</span>
            <span class="property-value small">${mesh.userData.GlobalId}</span>
          </div>`;
        }
        
        if (mesh.userData.Name) {
          html += `<div class="property-row">
            <span class="property-key">IFC Name:</span>
            <span class="property-value">${mesh.userData.Name}</span>
          </div>`;
        }
        
        if (mesh.userData.Description) {
          html += `<div class="property-row">
            <span class="property-key">Description:</span>
            <span class="property-value">${mesh.userData.Description}</span>
          </div>`;
        }
        
        html += '</div>';
      }
      
      html += '<div class="property-group">';
      html += '<div class="property-group-header">📦 Object Information</div>';
      
      html += `<div class="property-row">
        <span class="property-key">Type:</span>
        <span class="property-value">${object.type}</span>
      </div>`;
      
      if (object.name) {
        html += `<div class="property-row">
          <span class="property-key">Name:</span>
          <span class="property-value">${object.name}</span>
        </div>`;
      }
      
      if (mesh.id !== undefined) {
        html += `<div class="property-row">
          <span class="property-key">Mesh ID:</span>
          <span class="property-value">${mesh.id}</span>
        </div>`;
      }
      
      if (mesh.fragment) {
        html += `<div class="property-row">
          <span class="property-key">Fragment ID:</span>
          <span class="property-value small">${mesh.fragment.id}</span>
        </div>`;
      }
      
      if (object.uuid) {
        html += `<div class="property-row">
          <span class="property-key">UUID:</span>
          <span class="property-value small">${object.uuid.substring(0, 8)}...</span>
        </div>`;
      }
      
      html += '</div>';
      
      if (object instanceof THREE.Mesh && object.geometry) {
        html += '<div class="property-group">';
        html += '<div class="property-group-header">📐 Geometry</div>';
        
        const geometry = object.geometry;
        if (geometry.attributes.position) {
          html += `<div class="property-row">
            <span class="property-key">Vertices:</span>
            <span class="property-value">${geometry.attributes.position.count.toLocaleString()}</span>
          </div>`;
        }
        
        if (geometry.index) {
          html += `<div class="property-row">
            <span class="property-key">Faces:</span>
            <span class="property-value">${Math.floor(geometry.index.count / 3).toLocaleString()}</span>
          </div>`;
        }
        
        try {
          if (!geometry.boundingBox) geometry.computeBoundingBox();
          if (geometry.boundingBox) {
            const bbox = geometry.boundingBox;
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const center = new THREE.Vector3();
            bbox.getCenter(center);
            
            html += `<div class="property-row">
              <span class="property-key">BBox Size:</span>
              <span class="property-value">${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}</span>
            </div>`;
            
            html += `<div class="property-row">
              <span class="property-key">BBox Center:</span>
              <span class="property-value">${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}</span>
            </div>`;
          }
        } catch (e) {}
        
        html += '</div>';
      }
      
      html += '<div class="property-group">';
      html += '<div class="property-group-header">📍 Transform</div>';
      
      html += `<div class="property-row">
        <span class="property-key">Position:</span>
        <span class="property-value">${object.position.x.toFixed(2)}, ${object.position.y.toFixed(2)}, ${object.position.z.toFixed(2)}</span>
      </div>`;
      
      const rotX = THREE.MathUtils.radToDeg(object.rotation.x);
      const rotY = THREE.MathUtils.radToDeg(object.rotation.y);
      const rotZ = THREE.MathUtils.radToDeg(object.rotation.z);
      html += `<div class="property-row">
        <span class="property-key">Rotation (°):</span>
        <span class="property-value">${rotX.toFixed(1)}°, ${rotY.toFixed(1)}°, ${rotZ.toFixed(1)}°</span>
      </div>`;
      
      html += `<div class="property-row">
        <span class="property-key">Scale:</span>
        <span class="property-value">${object.scale.x.toFixed(2)}, ${object.scale.y.toFixed(2)}, ${object.scale.z.toFixed(2)}</span>
      </div>`;
      
      html += '</div>';
      
      if (object instanceof THREE.Mesh && object.material) {
        html += '</div><div class="property-group">';
        html += '<div class="property-group-header">🎨 Material</div>';
        
        const material = object.material as THREE.Material;
        if (material.name) {
          html += `<div class="property-row">
            <span class="property-key">Name:</span>
            <span class="property-value">${material.name}</span>
          </div>`;
        }
        
        html += `<div class="property-row">
          <span class="property-key">Type:</span>
          <span class="property-value">${material.type}</span>
        </div>`;
        
        html += `<div class="property-row">
          <span class="property-key">Transparent:</span>
          <span class="property-value">${material.transparent ? 'Yes' : 'No'}</span>
        </div>`;
        
        if ((material as any).color) {
          const color = (material as any).color;
          html += `<div class="property-row">
            <span class="property-key">Color:</span>
            <span class="property-value">#${color.getHexString()}</span>
          </div>`;
        }
      }
      
      if (mesh.userData && Object.keys(mesh.userData).length > 0) {
        html += '<div class="property-group">';
        html += '<div class="property-group-header">🔧 Additional Data</div>';
        html += '<pre style="font-size: 10px; overflow-x: auto; margin: 8px; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; max-height: 200px;">';
        html += JSON.stringify(mesh.userData, null, 2);
        html += '</pre>';
        html += '</div>';
      }
      
      html += '</div>';
      this.propertiesElement.innerHTML = html;
    } catch (error) {
      console.error('❌ Error showing properties:', error);
      this.propertiesElement.innerHTML = '<div class="error">Error loading properties</div>';
    }
  }

  public clearProperties(): void {
    if (this.propertiesElement) {
      this.propertiesElement.innerHTML = '<p class="no-selection">Click an element to view properties</p>';
    }
  }

  private formatValue(value: any): string {
    if (typeof value === 'number') return value.toFixed(2);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string') return value.length > 50 ? value.substring(0, 50) + '...' : value;
    return String(value);
  }
}
