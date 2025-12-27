/** ModelAlignmentManager (The "Alignment Architect")
 * This handles all functionality for misaligned or not aligned IFC model alignment and coordinate extraction.
 */
import * as OBC from "@thatopen/components";
import * as THREE from "three";


export class ModelAlignmentManager {
  private components: OBC.Components;
  private ifcLoader: any;

  constructor(components: OBC.Components, ifcLoader: any) {
    this.components = components;
    this.ifcLoader = ifcLoader;
  }

  /**
   * Aligns a newly loaded model with existing models
   */
  public async alignModels(secondModelId: string): Promise<void> {
    try {
      const fragments = this.components.get(OBC.FragmentsManager);
      const models = Array.from(fragments.list);
      
      if (models.length < 2) return;

      // Find the first model (reference) and the second model (to align)
      const firstModelEntry = models.find(([id]) => id !== secondModelId);
      const secondModelEntry = models.find(([id]) => id === secondModelId);

      if (!firstModelEntry || !secondModelEntry) return;

      const [firstModelId, firstModel] = firstModelEntry;
      const [, secondModel] = secondModelEntry;

      console.log(`Aligning model ${secondModelId} with reference model ${firstModelId}...`);

      // Try to get original IFC coordinates from metadata if available
      const firstOriginalCoords = (firstModel as any).coordinationMatrix?.elements 
        ? new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray((firstModel as any).coordinationMatrix.elements))
        : null;
      
      const secondOriginalCoords = (secondModel as any).coordinationMatrix?.elements
        ? new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray((secondModel as any).coordinationMatrix.elements))
        : null;

      if (firstOriginalCoords && secondOriginalCoords) {
        const offset = secondOriginalCoords.clone().sub(firstOriginalCoords);
        secondModel.object.position.copy(offset);
        this.components.get(OBC.FragmentsManager).core.update(true);

        this.showSuccessNotification(
          'Models Aligned',
          'Successfully aligned models using original coordinates.'
        );
        return;
      }

      // Fallback: Try using IFC site coordinates
      const firstSiteCoords = await this.getSiteCoordinates(firstModel, firstModelId);
      const secondSiteCoords = await this.getSiteCoordinates(secondModel, secondModelId);

      if (firstSiteCoords && secondSiteCoords) {
        const latDiff = (secondSiteCoords.latitude - firstSiteCoords.latitude) * 111000;
        const lonDiff = (secondSiteCoords.longitude - firstSiteCoords.longitude) * 111000 * Math.cos(firstSiteCoords.latitude * Math.PI / 180);
        
        const firstPosition = firstModel.object.position.clone();
        
        if (Math.abs(latDiff) > 0.01 || Math.abs(lonDiff) > 0.01) {
          secondModel.object.position.set(
            firstPosition.x + lonDiff,
            firstPosition.y,
            firstPosition.z - latDiff
          );
        } else {
          const bbox1 = new THREE.Box3().setFromObject(firstModel.object);
          const bbox2 = new THREE.Box3().setFromObject(secondModel.object);
          
          const center1 = new THREE.Vector3();
          const center2 = new THREE.Vector3();
          bbox1.getCenter(center1);
          bbox2.getCenter(center2);
          
          const min2 = bbox2.min;
          const hasValidGeometry = isFinite(min2.x) && isFinite(min2.y) && isFinite(min2.z);
          
          if (!hasValidGeometry) {
            this.showManualOffsetControls();
            return;
          }
          
          const offset = center1.clone().sub(center2);
          if (offset.length() > 1.0) {
            secondModel.object.position.add(offset);
          } else {
            secondModel.object.position.copy(firstPosition);
          }
        }
      } else {
        const firstPosition = firstModel.object.position.clone();
        secondModel.object.position.copy(firstPosition);
      }
      
      this.components.get(OBC.FragmentsManager).core.update(true);
      this.showSuccessNotification(
        'Models Aligned',
        'Successfully aligned models using IFC site coordinates.'
      );

    } catch (error) {
      console.error('Error aligning models:', error);
    }
  }

  /**
   * Extracts site coordinates from IFC model properties
   */
  private async getSiteCoordinates(
    model: any,
    _modelId: string
  ): Promise<{ latitude: number; longitude: number; elevation: number } | null> {
    try {
      if (typeof model.getSpatialStructure !== 'function') return null;
      const spatialStructure = await model.getSpatialStructure();
      if (!spatialStructure) return null;
      const siteNode = await this.findSiteInStructure(spatialStructure);
      
      if (siteNode) {
        const siteLocalId = siteNode.localId || siteNode._localId?.value;
        if (!siteLocalId) {
          if (siteNode.children && siteNode.children.length > 0) {
            const firstChild = siteNode.children[0];
            const childLocalId = firstChild.localId || firstChild._localId?.value;
            if (childLocalId) {
              return await this.extractSiteCoordinates(model, childLocalId);
            }
          }
          return null;
        }
        return await this.extractSiteCoordinates(model, siteLocalId);
      }
      return null;
    } catch (error) {
      console.error('Error reading site coordinates:', error);
      return null;
    }
  }

  /**
   * Extracts coordinates from site entity
   */
  private async extractSiteCoordinates(model: any, siteLocalId: number): Promise<{ latitude: number; longitude: number; elevation: number } | null> {
    try {
      const siteData = await model.getItemsData([siteLocalId], {
        attributesDefault: true
      });

      if (siteData && siteData.length > 0) {
        const site = siteData[0];
        let latitude = 0;
        let longitude = 0;
        let elevation = 0;

        const getNumericValue = (prop: any): number => {
          if (prop === undefined || prop === null) return 0;
          if (typeof prop === 'number') return prop;
          if (prop.value !== undefined) return typeof prop.value === 'number' ? prop.value : 0;
          return 0;
        };

        const getArrayValue = (prop: any): number[] | null => {
          if (prop === undefined || prop === null) return null;
          if (Array.isArray(prop)) return prop;
          if (prop.value !== undefined && Array.isArray(prop.value)) return prop.value;
          return null;
        };

        const latArray = getArrayValue(site.RefLatitude);
        if (latArray) latitude = this.convertDMSToDecimal(latArray);

        const lonArray = getArrayValue(site.RefLongitude);
        if (lonArray) longitude = this.convertDMSToDecimal(lonArray);

        elevation = getNumericValue(site.RefElevation);
        return { latitude, longitude, elevation };
      }
      return null;
    } catch (error) {
      console.error('Error extracting site coordinates:', error);
      return null;
    }
  }

  /**
   * Recursively searches for IFCSITE node in spatial structure
   */
  private async findSiteInStructure(node: any): Promise<any> {
    if (!node) return null;
    const category = node.category || node._category?.value;
    if (category === 'IFCSITE') return node;
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const result = await this.findSiteInStructure(child);
        if (result) return result;
      }
    }
    return null;
  }

  /**
   * Converts DMS (Degrees, Minutes, Seconds) array to decimal degrees
   */
  private convertDMSToDecimal(dmsArray: number[]): number {
    if (!Array.isArray(dmsArray) || dmsArray.length < 3) return 0;
    const degrees = dmsArray[0] || 0;
    const minutes = dmsArray[1] || 0;
    const seconds = dmsArray[2] || 0;
    const microseconds = dmsArray[3] || 0;
    return degrees + minutes / 60 + seconds / 3600 + microseconds / 3600000000;
  }

  /**
   * Shows a success notification popup
   */
  private showSuccessNotification(title: string, message: string, duration: number = 5000): void {
    const existing = document.getElementById('success-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'coordinate-warning';
    notification.id = 'success-notification';
    notification.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
    
    notification.innerHTML = `
      <div class="coordinate-warning-icon">OK</div>
      <div class="coordinate-warning-content">
        <div class="coordinate-warning-title">${title}</div>
        <div class="coordinate-warning-message">${message}</div>
      </div>
      <button class="coordinate-warning-close" title="Dismiss">×</button>
    `;

    const closeBtn = notification.querySelector('.coordinate-warning-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => notification.remove());
    }

    setTimeout(() => notification.remove(), duration);
    document.body.appendChild(notification);
  }

  /**
   * Show manual offset controls for model alignment
   */
  public showManualOffsetControls(): void {
    this.createModelAlignmentPanel();
  }

  /**
   * Create a reusable model alignment panel
   */
  public createModelAlignmentPanel(): void {
    const existing = document.getElementById('model-alignment-panel');
    if (existing) existing.remove();

    const fragments = this.components.get(OBC.FragmentsManager);
    if (!fragments) return;

    const models = Array.from(fragments.list) as Array<[string, any]>;

    const panel = document.createElement('div');
    panel.id = 'model-alignment-panel';
    panel.className = 'model-alignment-panel';
    
    panel.innerHTML = `
      <div class="model-alignment-header">
        <span class="model-alignment-title">Model Alignment</span>
        <div class="model-alignment-header-buttons">
          <button class="model-alignment-minimize" title="Minimize">-</button>
          <button class="model-alignment-close" title="Close">×</button>
        </div>
      </div>
      <div class="model-alignment-content">
        <div class="model-alignment-section">
          <label>Select Model:</label>
          <select id="alignment-model-select" class="model-alignment-select">
            ${models.map(([id]) => `<option value="${id}">${id}</option>`).join('')}
          </select>
        </div>
        <div class="model-alignment-section">
          <label>Position (meters):</label>
          <div class="model-alignment-inputs">
            <div class="model-alignment-input-group">
              <label>X</label>
              <input type="number" id="alignment-x" value="0" step="0.1" />
            </div>
            <div class="model-alignment-input-group">
              <label>Y</label>
              <input type="number" id="alignment-y" value="0" step="0.1" />
            </div>
            <div class="model-alignment-input-group">
              <label>Z</label>
              <input type="number" id="alignment-z" value="0" step="0.1" />
            </div>
          </div>
        </div>
        <div class="model-alignment-section">
          <label>Arrow Keys (step size):</label>
          <input type="number" id="alignment-step" value="1" step="0.1" min="0.1" />
          <div class="model-alignment-hint">
            • Arrow keys for X/Y<br>
            • Shift+Arrow keys for Z (elevation)
          </div>
        </div>
        <div class="model-alignment-buttons">
          <button class="model-alignment-apply">Apply</button>
          <button class="model-alignment-reset">Reset</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    this.makeDraggable(panel);

    const modelSelect = panel.querySelector('#alignment-model-select') as HTMLSelectElement;
    const xInput = panel.querySelector('#alignment-x') as HTMLInputElement;
    const yInput = panel.querySelector('#alignment-y') as HTMLInputElement;
    const zInput = panel.querySelector('#alignment-z') as HTMLInputElement;
    const stepInput = panel.querySelector('#alignment-step') as HTMLInputElement;
    const applyBtn = panel.querySelector('.model-alignment-apply') as HTMLButtonElement;
    const resetBtn = panel.querySelector('.model-alignment-reset') as HTMLButtonElement;
    const closeBtn = panel.querySelector('.model-alignment-close') as HTMLButtonElement;
    const minimizeBtn = panel.querySelector('.model-alignment-minimize') as HTMLButtonElement;

    const updateInputsFromModel = () => {
      const selectedId = modelSelect.value;
      const model = fragments.list.get(selectedId);
      if (model) {
        xInput.value = model.object.position.x.toFixed(2);
        zInput.value = model.object.position.y.toFixed(2);
        yInput.value = model.object.position.z.toFixed(2);
      }
    };

    modelSelect?.addEventListener('change', updateInputsFromModel);
    updateInputsFromModel();

    applyBtn?.addEventListener('click', () => {
      const selectedId = modelSelect.value;
      const model = fragments.list.get(selectedId);
      if (model) {
        const x = parseFloat(xInput.value) || 0;
        const y = parseFloat(zInput.value) || 0;
        const z = parseFloat(yInput.value) || 0;
        model.object.position.set(x, y, z);
        fragments.core.update(true);
        this.showSuccessNotification('Position Updated', `Model moved to X:${x.toFixed(2)}, Z:${y.toFixed(2)}, Y:${z.toFixed(2)}`);
      }
    });

    resetBtn?.addEventListener('click', () => {
      const selectedId = modelSelect.value;
      const model = fragments.list.get(selectedId);
      if (model) {
        model.object.position.set(0, 0, 0);
        xInput.value = '0';
        yInput.value = '0';
        zInput.value = '0';
        fragments.core.update(true);
        this.showSuccessNotification('Position Reset', 'Model moved to origin (0, 0, 0)');
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (panel.style.display === 'none') return;
      if (document.activeElement?.tagName === 'INPUT') return;

      const step = parseFloat(stepInput.value) || 1;
      const selectedId = modelSelect.value;
      const model = fragments.list.get(selectedId);
      if (!model) return;

      let updated = false;
      const pos = model.object.position;

      switch (e.key) {
        case 'ArrowLeft': pos.x -= step; xInput.value = pos.x.toFixed(2); updated = true; break;
        case 'ArrowRight': pos.x += step; xInput.value = pos.x.toFixed(2); updated = true; break;
        case 'ArrowUp':
          if (e.shiftKey) { pos.y += step; zInput.value = pos.y.toFixed(2); }
          else { pos.z += step; yInput.value = pos.z.toFixed(2); }
          updated = true;
          break;
        case 'ArrowDown':
          if (e.shiftKey) { pos.y -= step; zInput.value = pos.y.toFixed(2); }
          else { pos.z -= step; yInput.value = pos.z.toFixed(2); }
          updated = true;
          break;
      }

      if (updated) {
        e.preventDefault();
        fragments.core.update(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node === panel) {
            document.removeEventListener('keydown', handleKeyDown);
            observer.disconnect();
          }
        });
      });
    });
    observer.observe(document.body, { childList: true });
  }

  /**
   * Make an element draggable
   */
  private makeDraggable(element: HTMLElement): void {
    const header = element.querySelector('.model-alignment-header') as HTMLElement;
    if (!header) return;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    header.style.cursor = 'move';
    header.onmousedown = dragMouseDown;

    function dragMouseDown(e: MouseEvent) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e: MouseEvent) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      element.style.top = (element.offsetTop - pos2) + 'px';
      element.style.left = (element.offsetLeft - pos1) + 'px';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }
}
