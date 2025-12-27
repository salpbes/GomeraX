/**
 * PROPERTIES PANEL MODULE (The "Building Inspector")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is the "Information Center" for the building. It manages the 
 * selection of objects, the tree view of the building structure, and 
 * the display of all the technical data for whatever you've clicked.
 * 
 * WHY IT MATTERS: 
 * A 3D model is just a picture without its data. This module connects 
 * the visual shapes to their real-world information, allowing you to 
 * inspect every nut, bolt, and wall in the project.
 * --------------------------------------------------------------------------------
 */

import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as FRAGS from '@thatopen/fragments';
import * as THREE from 'three';
import { WorldManager, ClusterModule } from '../webgl';
import { IFCLoaderModule } from './IFCLoaderModule';

// Import sub-managers
import { SelectionManager, PropertiesContext } from './properties/SelectionManager';
import { PropertyDisplayManager } from './properties/PropertyDisplayManager';
import { TreeManager } from './properties/TreeManager';
import { GhostModeManager } from './properties/GhostModeManager';
import { StoreyDataManager } from './properties/StoreyDataManager';

export class PropertiesPanelModule implements PropertiesContext {
  public components: OBC.Components;
  public world: OBC.World | null = null;
  public fragmentsManager: OBC.FragmentsManager | null = null;
  public highlighter: OBCF.Highlighter | null = null;
  public clusterModule: ClusterModule | null = null;
  public webgpuRenderer: any = null;
  public worldManager: WorldManager;
  
  // Sub-managers
  private selectionManager: SelectionManager;
  private propertyDisplayManager: PropertyDisplayManager;
  private treeManager: TreeManager;
  private ghostModeManager: GhostModeManager;
  private storeyDataManager: StoreyDataManager;

  private modelLoadListener: any = null;
  private cameraRestHandler: (() => void) | null = null;

  constructor(worldManager: WorldManager, private ifcLoader: IFCLoaderModule) {
    this.worldManager = worldManager;
    this.components = worldManager.getComponents();
    
    // Initialize sub-managers
    this.selectionManager = new SelectionManager(this);
    this.propertyDisplayManager = new PropertyDisplayManager(this);
    this.ghostModeManager = new GhostModeManager(this);
    this.storeyDataManager = new StoreyDataManager(this);
    this.treeManager = new TreeManager(
      this, 
      this.ifcLoader, 
      this.ghostModeManager, 
      this.storeyDataManager, 
      this.selectionManager
    );
  }

  // Getters for storey data (used by dashboard)
  public get storeyData() {
    return this.storeyDataManager.storeyData;
  }

  /**
   * Set the cluster module reference
   */
  public setClusterModule(clusterModule: ClusterModule): void {
    this.clusterModule = clusterModule;
  }

  /**
   * Set the WebGPU renderer reference
   */
  public setWebGPURenderer(renderer: any): void {
    this.webgpuRenderer = renderer;
  }

  /**
   * Initializes the properties panel
   */
  public async initialize(world: OBC.World): Promise<void> {
    this.world = world;
    this.fragmentsManager = this.components.get(OBC.FragmentsManager);
    
    // Listen for new models being added
    this.modelLoadListener = this.fragmentsManager.list.onItemSet.add((data) => {
      console.log('📦 Model loaded, updating tree...');
      
      setTimeout(() => {
        const model = data?.value;
        const hasGeometry = model && model.object && model.object.children && model.object.children.length > 0;
        if (hasGeometry) {
          this.treeManager.buildTree();
        }
      }, 500);
      
      setTimeout(() => {
        const model = data?.value;
        const hasGeometry = model && model.object && model.object.children && model.object.children.length > 0;
        if (hasGeometry) {
          this.treeManager.buildTree();
        }
      }, 2500);
    });
    
    // Setup Highlighter
    try {
      this.highlighter = this.components.get(OBCF.Highlighter);
      await this.highlighter.setup({ world });
      
      this.highlighter.styles.set('translucent', {
        color: new THREE.Color(0x888888),
        transparent: true,
        opacity: 0.7,
        depthTest: true,
        renderedFaces: FRAGS.RenderedFaces.TWO,
        alphaToCoverage: true,
        depthWrite: false
      } as any);
      
      this.highlighter.events.select.onHighlight.add(async () => {
        if (this.ghostModeManager.ghostModeActive) {
          setTimeout(() => this.ghostModeManager.reapplyGhostMode(), 50);
        }
      });
      
      this.highlighter.events.select.onClear.add(async () => {
        if (this.ghostModeManager.ghostModeActive) {
          setTimeout(() => this.ghostModeManager.reapplyGhostMode(), 50);
        }
      });
    } catch (error) {
      console.warn('Highlighter not available');
    }

    this.selectionManager.setupSelection();
    
    // Listen for camera rest events to reapply ghost mode
    if (world.camera.controls) {
      this.cameraRestHandler = async () => {
        if (this.ghostModeManager.ghostModeActive && this.ghostModeManager.ghostPrimaryModelId) {
          await this.ghostModeManager.reapplyGhostMode();
        }
      };
      world.camera.controls.addEventListener('rest', this.cameraRestHandler);
    }
    
    console.log('✅ Properties panel initialized');
  }

  /**
   * Creates both panels (tree and properties)
   */
  public createPanel(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ifc-panels-container';

    const treePanel = this.treeManager.createTreePanel();
    container.appendChild(treePanel);

    const propsPanel = this.propertyDisplayManager.createPropertiesPanel();
    container.appendChild(propsPanel);

    const treeExpandTab = this.treeManager.getTreeExpandTab();
    if (treeExpandTab) document.body.appendChild(treeExpandTab);

    const propsExpandTab = this.propertyDisplayManager.getPropsExpandTab();
    if (propsExpandTab) document.body.appendChild(propsExpandTab);

    return container;
  }

  /**
   * Public method to build tree (called by UIManager)
   */
  public async buildTree(): Promise<void> {
    return this.treeManager.buildTree();
  }

  /**
   * Implementation of PropertiesContext.showIfcProperties
   */
  public async showIfcProperties(modelId: string, localId: number, mesh: THREE.Object3D): Promise<void> {
    return this.propertyDisplayManager.showIfcProperties(modelId, localId, mesh);
  }

  /**
   * Implementation of PropertiesContext.clearSelection
   */
  public clearSelection(): void {
    this.selectionManager.highlightObject(null as any); // Clear highlight
    this.propertyDisplayManager.clearProperties();
  }

  /**
   * Implementation of PropertiesContext.isPointVisible
   */
  public isPointVisible(point?: THREE.Vector3): boolean {
    if (!point) return true;
    
    try {
      const clipper = this.components.get(OBC.Clipper);
      if (!clipper || clipper.list.size === 0) return true;

      for (const [, clippingPlane] of clipper.list) {
        if (!clippingPlane.enabled) continue;
        const plane = clippingPlane.three;
        if (!plane) continue;

        const distance = plane.distanceToPoint(point);
        if (distance < 0) return false;
      }
      return true;
    } catch (error) {
      return true;
    }
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    if (this.highlighter) {
      this.highlighter.clear('select');
    }
    if (this.modelLoadListener) {
      this.fragmentsManager?.list.onItemSet.remove(this.modelLoadListener);
    }
    if (this.world?.camera.controls && this.cameraRestHandler) {
      this.world.camera.controls.removeEventListener('rest', this.cameraRestHandler);
    }
    console.log('✅ Properties panel disposed');
  }

  // Ghost mode state tracking (for internal use by sub-managers)
  public get ghostModeActive(): boolean {
    return this.ghostModeManager.ghostModeActive;
  }
}
