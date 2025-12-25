import * as OBC from '@thatopen/components';
import * as FRAGS from '@thatopen/fragments';
import * as THREE from 'three';
import { PropertiesContext } from './SelectionManager';
import { IFCLoaderModule } from '../IFCLoaderModule';
import { GhostModeManager } from './GhostModeManager';
import { StoreyDataManager } from './StoreyDataManager';
import { SelectionManager } from './SelectionManager';

export class TreeManager {
  private treeContainer: HTMLDivElement | null = null;
  private treeExpandTab: HTMLDivElement | null = null;
  private searchQuery: string = '';
  private searchInput: HTMLInputElement | null = null;
  private currentSearchId: number = 0;
  private currentMatches: HTMLElement[] = [];
  private currentMatchIndex: number = -1;
  private searchResultsElement: HTMLElement | null = null;

  constructor(
    private context: PropertiesContext,
    private ifcLoader: IFCLoaderModule,
    private ghostManager: GhostModeManager,
    private storeyManager: StoreyDataManager,
    private selectionManager: SelectionManager
  ) {}

  public setTreeContainer(container: HTMLDivElement): void {
    this.treeContainer = container;
  }

  public getTreeExpandTab(): HTMLDivElement | null {
    return this.treeExpandTab;
  }

  /**
   * Creates the IFC tree view panel (left side)
   */
  public createTreePanel(): HTMLElement {
    const treePanel = document.createElement('div');
    treePanel.id = 'ifc-tree-panel';
    treePanel.className = 'ifc-tree-panel collapsed';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <h3><i class="fas fa-sitemap"></i> IFC Tree</h3>
      <div class="header-actions">
        <button id="collapse-all-btn" class="icon-btn" title="Collapse All">
          <i class="fas fa-compress-alt"></i>
        </button>
        <button id="expand-all-btn" class="icon-btn" title="Expand All">
          <i class="fas fa-expand-alt"></i>
        </button>
        <button id="refresh-tree-btn" class="icon-btn" title="Refresh Tree">
          <i class="fas fa-sync-alt"></i>
        </button>
        <button id="collapse-tree-btn" class="icon-btn" title="Expand Panel">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    `;
    treePanel.appendChild(header);

    const searchContainer = document.createElement('div');
    searchContainer.className = 'tree-search-container';
    searchContainer.innerHTML = `
      <div class="tree-search-wrapper">
        <i class="fas fa-search tree-search-icon"></i>
        <input type="text" id="tree-search-input" class="tree-search-input" placeholder="Search elements..." />
        <button id="tree-search-clear" class="tree-search-clear" title="Clear search">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div id="tree-search-results" class="tree-search-results"></div>
    `;
    treePanel.appendChild(searchContainer);

    const treeContainer = document.createElement('div');
    treeContainer.id = 'tree-container';
    treeContainer.className = 'tree-container';
    treePanel.appendChild(treeContainer);

    this.treeContainer = treeContainer as HTMLDivElement;

    this.searchInput = searchContainer.querySelector('#tree-search-input');
    const searchClearBtn = searchContainer.querySelector('#tree-search-clear') as HTMLElement;
    const searchResultsDiv = searchContainer.querySelector('#tree-search-results') as HTMLElement;
    this.searchResultsElement = searchResultsDiv;

    let searchTimeout: number | null = null;
    this.searchInput?.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      if (searchClearBtn) searchClearBtn.style.display = query.length > 0 ? 'flex' : 'none';
      
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = window.setTimeout(() => {
        if (query.length > 0 && query.length < 3) {
          this.clearTreeSearch(searchResultsDiv);
          searchResultsDiv.innerHTML = '<span class="search-no-results" style="color: #888;">Type at least 3 characters</span>';
          searchResultsDiv.style.display = 'block';
        } else {
          this.performTreeSearch(query, searchResultsDiv);
        }
      }, 300);
    });

    searchClearBtn?.addEventListener('click', () => {
      if (this.searchInput) {
        this.searchInput.value = '';
        searchClearBtn.style.display = 'none';
        this.clearTreeSearch(searchResultsDiv);
      }
    });

    const refreshBtn = header.querySelector('#refresh-tree-btn');
    refreshBtn?.addEventListener('click', () => this.buildTree());

    const collapseAllBtn = header.querySelector('#collapse-all-btn');
    collapseAllBtn?.addEventListener('click', () => this.collapseAllTreeNodes());

    const expandAllBtn = header.querySelector('#expand-all-btn');
    expandAllBtn?.addEventListener('click', () => this.expandAllTreeNodes());

    const collapseBtn = header.querySelector('#collapse-tree-btn');
    
    const expandTab = document.createElement('div');
    expandTab.className = 'expand-tab expand-tab-left';
    expandTab.innerHTML = '<i class="fas fa-sitemap"></i>';
    expandTab.title = 'Show IFC Tree';
    expandTab.style.opacity = '1';
    expandTab.style.pointerEvents = 'auto';
    this.treeExpandTab = expandTab;
    
    collapseBtn?.addEventListener('click', () => {
      treePanel.classList.toggle('collapsed');
      const icon = collapseBtn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-minus');
        icon.classList.toggle('fa-plus');
      }
      if (this.treeExpandTab) {
        if (treePanel.classList.contains('collapsed')) {
          this.treeExpandTab.style.opacity = '1';
          this.treeExpandTab.style.pointerEvents = 'auto';
        } else {
          this.treeExpandTab.style.opacity = '0';
          this.treeExpandTab.style.pointerEvents = 'none';
        }
      }
    });
    
    expandTab.addEventListener('click', () => {
      treePanel.classList.remove('collapsed');
      const icon = collapseBtn?.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-plus');
        icon.classList.add('fa-minus');
      }
      expandTab.style.opacity = '0';
      expandTab.style.pointerEvents = 'none';
    });

    this.buildTree();

    return treePanel;
  }

  /**
   * Builds a hierarchical tree view of IFC entities with spatial structure
   */
  public async buildTree(): Promise<void> {
    if (!this.treeContainer || !this.context.fragmentsManager) return;

    const models = Array.from(this.context.fragmentsManager.list.values());
    if (models.length === 0) {
      this.treeContainer.innerHTML = '<div class="no-models">No models loaded</div>';
      return;
    }

    this.storeyManager.storeyData = {};

    let html = '<ul class="tree-root">';
    
    for (const model of models) {
      const modelId = (model as any).modelId || 'Unknown';
      const modelName = this.ifcLoader?.getModelMetadata(modelId)?.name || modelId;
      
      try {
        const spatialStructure = await (model as any).getSpatialStructure();
        html += await this.buildModelNode(model, modelId, modelName, spatialStructure);
      } catch (error) {
        html += await this.buildCategoryBasedTree(model, modelId);
      }
    }
    
    html += '</ul>';
    this.treeContainer.innerHTML = html;
    this.setupTreeInteractions();
  }

  private async buildModelNode(model: any, modelId: string, modelName: string, spatialStructure: any): Promise<string> {
    let html = `
      <li class="tree-node model-node expanded">
        <div class="tree-node-content" data-toggle="true">
          <span class="tree-toggle"><i class="fas fa-chevron-down"></i></span>
          <span class="tree-icon"><i class="fas fa-file-code"></i></span>
          <span class="tree-label" title="${modelName}">${modelName}</span>
        </div>
        <ul class="tree-children">
    `;
    
    const { html: spatialHtml } = await this.buildSpatialNode(model, modelId, spatialStructure, 0);
    html += spatialHtml;
    
    html += `
        </ul>
      </li>
    `;
    
    return html;
  }

  private async buildSpatialNode(model: any, modelId: string, node: any, level: number = 0): Promise<{ html: string, ids: number[] }> {
    if (!node) return { html: '', ids: [] };
    
    const localId = node.localId || node._localId?.value;
    const category = node.category || node._category?.value || 'UNKNOWN';
    
    if (category === 'IFCBUILDINGSTOREY' && !localId && node.children) {
      for (const storeyChild of node.children) {
        const storeyLocalId = storeyChild.localId || storeyChild._localId?.value;
        if (storeyLocalId) {
          await this.storeyManager.gatherStoreyElementsFromTree(model, storeyChild, storeyLocalId);
        }
      }
    }
    
    if (category === 'IFCBUILDINGSTOREY' && localId) {
      await this.storeyManager.gatherStoreyElementsFromTree(model, node, localId);
    }
    
    let name = node.name || node.Name?.value;
    
    if (!name && localId) {
      try {
        const [itemData] = await model.getItemsData([localId], {
          attributesDefault: false,
          attributes: ['Name', 'LongName', 'Description'],
        });
        if (itemData) {
          name = itemData.Name?.value || itemData.LongName?.value || itemData.Description?.value;
        }
      } catch (error) {}
    }
    
    if (!name || name === 'UNKNOWN') {
      const cleanCategory = category.replace(/^IFC/, '');
      name = cleanCategory
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    
    const children = node.children || [];
    const icon = this.getCategoryIcon(category);
    
    let collectedIds: number[] = [];
    if (localId) collectedIds.push(localId);

    let storeyHtml = '';
    let storeyIds: number[] = [];
    if (category === 'IFCBUILDINGSTOREY' && localId) {
       const result = await this.addElementsForStorey(model, modelId, localId, name);
       storeyHtml = result.html;
       storeyIds = result.ids;
       collectedIds.push(...storeyIds);
    }

    const hasChildren = children.length > 0 || storeyIds.length > 0;
    const isExpanded = level < 2;

    let childrenHtml = '';
    if (hasChildren) {
      childrenHtml += '<ul class="tree-children">';
      for (const child of children) {
        const { html: childHtml, ids: childIds } = await this.buildSpatialNode(model, modelId, child, level + 1);
        childrenHtml += childHtml;
        collectedIds.push(...childIds);
      }
      childrenHtml += storeyHtml;
      childrenHtml += '</ul>';
    }
    
    let html = `
      <li class="tree-node spatial-node ${isExpanded ? 'expanded' : ''}">
        <div class="tree-node-content ${localId ? 'selectable' : ''}" ${hasChildren ? 'data-toggle="true"' : ''} data-model-id="${modelId}" ${localId ? `data-local-id="${localId}"` : ''} data-ids="${collectedIds.join(',')}">
          ${hasChildren ? `<span class="tree-toggle"><i class="fas fa-chevron-${isExpanded ? 'down' : 'right'}"></i></span>` : '<span class="tree-spacer"></span>'}
          <span class="tree-icon"><i class="${icon}"></i></span>
          <span class="tree-label" title="${name}">${name}</span>
          ${children.length > 0 ? `<span class="tree-count">(${children.length})</span>` : ''}
          
          <div class="tree-actions">
            <button class="tree-action-btn visibility-btn" title="Toggle Visibility" data-action="visibility">
              <i class="fas fa-eye"></i>
            </button>
            <button class="tree-action-btn find-btn" title="Find" data-action="find">
              <i class="fas fa-search"></i>
            </button>
            <button class="tree-action-btn ghost-btn" title="Isolate" data-action="isolate">
              <i class="fas fa-cube"></i>
            </button>
          </div>
        </div>
    `;
    
    html += childrenHtml;
    html += '</li>';
    
    return { html, ids: collectedIds };
  }

  private async addElementsForStorey(model: any, modelId: string, storeyLocalId: number, storeyName?: string): Promise<{ html: string, ids: number[] }> {
    let html = '';
    let collectedIds: number[] = [];
    
    try {
      const categories = await model.getCategories();
      const spatialCategories = ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE'];
      const elementCategories = categories.filter((cat: string) => !spatialCategories.includes(cat));
      
      if (elementCategories.length === 0) return { html, ids: collectedIds };
      
      const categoryRegexps = elementCategories.map((cat: string) => new RegExp(`^${cat}$`));
      const itemsByCategory = await model.getItemsOfCategories(categoryRegexps);
      
      if (storeyName && !this.storeyManager.storeyData[storeyName]) {
        this.storeyManager.storeyData[storeyName] = {};
      }
      
      for (const [category, allLocalIds] of Object.entries(itemsByCategory)) {
        const ids = allLocalIds as number[];
        if (ids.length === 0) continue;
        
        const itemsInStorey: number[] = [];
        
        try {
          const itemsData = await model.getItemsData(ids, {
            attributesDefault: false,
            attributes: ['Name', 'Tag', 'ObjectType'],
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
              if (isInStorey) itemsInStorey.push(localId);
            }
          }
        } catch (error) {}
        
        if (itemsInStorey.length === 0) continue;

        collectedIds.push(...itemsInStorey);
        
        if (storeyName) {
          this.storeyManager.storeyData[storeyName][category] = (this.storeyManager.storeyData[storeyName][category] || 0) + itemsInStorey.length;
        }
        
        const categoryIcon = this.getCategoryIcon(category);
        html += `
          <li class="tree-node category-node">
            <div class="tree-node-content" data-toggle="true" data-model-id="${modelId}" data-category="${category}" data-ids="${itemsInStorey.join(',')}">
              <span class="tree-toggle"><i class="fas fa-chevron-right"></i></span>
              <span class="tree-icon"><i class="${categoryIcon}"></i></span>
              <span class="tree-label">${category}</span>
              <span class="tree-count">(${itemsInStorey.length})</span>
              
              <div class="tree-actions">
                <button class="tree-action-btn visibility-btn" title="Toggle Visibility" data-action="visibility">
                  <i class="fas fa-eye"></i>
                </button>
                <button class="tree-action-btn find-btn" title="Find" data-action="find">
                  <i class="fas fa-search"></i>
                </button>
                <button class="tree-action-btn ghost-btn" title="Isolate" data-action="isolate">
                  <i class="fas fa-cube"></i>
                </button>
              </div>
            </div>
            <ul class="tree-children">
        `;
        
        try {
          const itemsData = await model.getItemsData(itemsInStorey, {
            attributesDefault: false,
            attributes: ['Name', 'Tag', 'ObjectType'],
          });
          
          for (let i = 0; i < itemsData.length; i++) {
            const itemData = itemsData[i];
            const localId = itemsInStorey[i];
            
            let itemName = '';
            if (itemData.Name?.value) itemName = itemData.Name.value;
            else if (itemData.Tag?.value) itemName = `${category} [${itemData.Tag.value}]`;
            else if (itemData.ObjectType?.value) itemName = itemData.ObjectType.value;
            else itemName = `${category} #${localId}`;
            
            html += `
              <li class="tree-node element-node">
                <div class="tree-node-content selectable" data-model-id="${modelId}" data-local-id="${localId}">
                  <span class="tree-spacer"></span>
                  <span class="tree-icon"><i class="fas fa-cube"></i></span>
                  <span class="tree-label">${itemName}</span>
                  
                  <div class="tree-actions">
                    <button class="tree-action-btn visibility-btn" title="Toggle Visibility" data-action="visibility">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button class="tree-action-btn find-btn" title="Find" data-action="find">
                      <i class="fas fa-search"></i>
                    </button>
                    <button class="tree-action-btn ghost-btn" title="Isolate" data-action="isolate">
                      <i class="fas fa-cube"></i>
                    </button>
                  </div>
                </div>
              </li>
            `;
          }
        } catch (error) {}
        
        html += `
            </ul>
          </li>
        `;
      }
    } catch (error) {}
    
    return { html, ids: collectedIds };
  }

  private async buildCategoryBasedTree(model: any, modelId: string): Promise<string> {
    let html = '';
    try {
      const modelName = this.ifcLoader?.getModelMetadata(modelId)?.name || modelId;
      const categories = await model.getCategories();
      const categoryRegexps = categories.map((cat: string) => new RegExp(`^${cat}$`));
      const itemsByCategory = await model.getItemsOfCategories(categoryRegexps);
      
      let totalItems = 0;
      for (const ids of Object.values(itemsByCategory)) totalItems += (ids as number[]).length;
      
      html += `
        <li class="tree-node model-node expanded">
          <div class="tree-node-content" data-toggle="true">
            <span class="tree-toggle"><i class="fas fa-chevron-down"></i></span>
            <span class="tree-icon"><i class="fas fa-file-code"></i></span>
            <span class="tree-label" title="${modelName}">${modelName}</span>
            <span class="tree-count">(${totalItems} elements)</span>
          </div>
          <ul class="tree-children">
      `;
      
      for (const [category, localIds] of Object.entries(itemsByCategory)) {
        const ids = localIds as number[];
        if (ids.length === 0) continue;
        const categoryIcon = this.getCategoryIcon(category);
        html += `
          <li class="tree-node category-node">
            <div class="tree-node-content" data-toggle="true" data-model-id="${modelId}" data-category="${category}" data-ids="${ids.join(',')}">
              <span class="tree-toggle"><i class="fas fa-chevron-right"></i></span>
              <span class="tree-icon"><i class="${categoryIcon}"></i></span>
              <span class="tree-label">${category}</span>
              <span class="tree-count">(${ids.length})</span>
              <div class="tree-actions">
                <button class="tree-action-btn visibility-btn" title="Toggle Visibility" data-action="visibility">
                  <i class="fas fa-eye"></i>
                </button>
                <button class="tree-action-btn find-btn" title="Find" data-action="find">
                  <i class="fas fa-search"></i>
                </button>
                <button class="tree-action-btn ghost-btn" title="Isolate" data-action="isolate">
                  <i class="fas fa-cube"></i>
                </button>
              </div>
            </div>
            <ul class="tree-children">
        `;
        try {
          const itemsData = await model.getItemsData(ids, {
            attributesDefault: false,
            attributes: ['Name', 'Tag', 'ObjectType'],
          });
          for (let i = 0; i < itemsData.length; i++) {
            const itemData = itemsData[i];
            const localId = ids[i];
            let itemName = itemData.Name?.value || (itemData.Tag?.value ? `${category} [${itemData.Tag.value}]` : (itemData.ObjectType?.value || `${category} #${localId}`));
            html += `
              <li class="tree-node element-node">
                <div class="tree-node-content selectable" data-model-id="${modelId}" data-local-id="${localId}">
                  <span class="tree-spacer"></span>
                  <span class="tree-icon"><i class="fas fa-cube"></i></span>
                  <span class="tree-label">${itemName}</span>
                  <div class="tree-actions">
                    <button class="tree-action-btn visibility-btn" title="Toggle Visibility" data-action="visibility">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button class="tree-action-btn find-btn" title="Find" data-action="find">
                      <i class="fas fa-search"></i>
                    </button>
                    <button class="tree-action-btn ghost-btn" title="Isolate" data-action="isolate">
                      <i class="fas fa-cube"></i>
                    </button>
                  </div>
                </div>
              </li>
            `;
          }
        } catch (error) {}
        html += `</ul></li>`;
      }
      html += `</ul></li>`;
    } catch (error) {}
    return html;
  }

  private getCategoryIcon(category: string): string {
    const iconMap: Record<string, string> = {
      'IFCPROJECT': 'fas fa-project-diagram',
      'IFCSITE': 'fas fa-map-marked-alt',
      'IFCBUILDING': 'fas fa-building',
      'IFCBUILDINGSTOREY': 'fas fa-layer-group',
      'IFCSPACE': 'fas fa-vector-square',
      'IFCWALL': 'fas fa-th-large',
      'IFCWALLSTANDARDCASE': 'fas fa-th-large',
      'IFCSLAB': 'fas fa-square',
      'IFCCOLUMN': 'fas fa-grip-lines-vertical',
      'IFCBEAM': 'fas fa-minus',
      'IFCDOOR': 'fas fa-door-closed',
      'IFCWINDOW': 'fas fa-window-maximize',
      'IFCROOF': 'fas fa-home',
      'IFCSTAIR': 'fas fa-stairs',
      'IFCRAILING': 'fas fa-grip-horizontal',
      'IFCFURNISHINGELEMENT': 'fas fa-chair',
      'IFCBUILDINGELEMENTPROXY': 'fas fa-cube',
      'IFCMEMBER': 'fas fa-ruler-combined',
      'IFCPLATE': 'fas fa-rectangle-landscape',
      'IFCCOVERING': 'fas fa-fill',
      'IFCFOOTING': 'fas fa-grip-horizontal',
      'IFCPILE': 'fas fa-arrow-down',
    };
    return iconMap[category] || 'fas fa-cube';
  }

  private setupTreeInteractions(): void {
    if (!this.treeContainer) return;

    const toggles = this.treeContainer.querySelectorAll('[data-toggle="true"]');
    toggles.forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const node = (toggle as HTMLElement).closest('.tree-node');
        if (node) {
          node.classList.toggle('expanded');
          const icon = toggle.querySelector('.tree-toggle i');
          if (icon) {
            icon.classList.toggle('fa-chevron-right');
            icon.classList.toggle('fa-chevron-down');
          }
        }
      });
    });

    const selectables = this.treeContainer.querySelectorAll('.selectable');
    selectables.forEach(selectable => {
      selectable.addEventListener('click', async (e) => {
        if ((e.target as HTMLElement).closest('.tree-action-btn')) return;
        e.stopPropagation();
        const previousSelected = this.treeContainer?.querySelector('.tree-node-content.selected');
        if (previousSelected) previousSelected.classList.remove('selected');
        (selectable as HTMLElement).classList.add('selected');
        const modelId = (selectable as HTMLElement).dataset.modelId;
        const localIdStr = (selectable as HTMLElement).dataset.localId;
        if (modelId && localIdStr) {
          const localId = parseInt(localIdStr, 10);
          const model = this.context.fragmentsManager?.list.get(modelId);
          if (model) {
            await this.context.showIfcProperties(modelId, localId, model.object);
            this.selectionManager.highlightObject(model.object, modelId, localId);
          }
        }
      });
    });

    const visibilityBtns = this.treeContainer.querySelectorAll('.visibility-btn');
    visibilityBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const button = e.currentTarget as HTMLElement;
        const content = button.closest('.tree-node-content') as HTMLElement;
        if (!content) return;
        const isVisible = !button.classList.contains('hidden-state');
        const updateNodeUI = (nodeContent: HTMLElement, hidden: boolean) => {
            if (hidden) {
                nodeContent.classList.add('node-hidden');
                const btn = nodeContent.querySelector('.visibility-btn');
                if (btn) {
                    btn.classList.add('hidden-state');
                    const i = btn.querySelector('i');
                    if (i) i.className = 'fas fa-eye-slash';
                }
            } else {
                nodeContent.classList.remove('node-hidden');
                const btn = nodeContent.querySelector('.visibility-btn');
                if (btn) {
                    btn.classList.remove('hidden-state');
                    const i = btn.querySelector('i');
                    if (i) i.className = 'fas fa-eye';
                }
            }
        };
        const parentLi = content.closest('.tree-node');
        if (parentLi) {
            parentLi.querySelectorAll('.tree-node-content').forEach(node => updateNodeUI(node as HTMLElement, isVisible));
        } else updateNodeUI(content, isVisible);
        const modelId = content.dataset.modelId;
        const idsToToggle = this.getIdsFromContent(content);
        if (modelId && idsToToggle.length > 0) {
          const model = this.context.fragmentsManager?.list.get(modelId);
          if (model) {
            const hider = this.context.components.get(OBC.Hider);
            if (hider) hider.set(!isVisible, { [modelId]: new Set(idsToToggle) });
            else await model.setVisible(idsToToggle, !isVisible);
            if (this.context.webgpuRenderer?.isEnabled()) this.context.webgpuRenderer.setElementVisibility(modelId, idsToToggle, !isVisible);
          }
        }
      });
    });

    const findBtns = this.treeContainer.querySelectorAll('.find-btn');
    findBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const button = e.currentTarget as HTMLElement;
        const content = button.closest('.tree-node-content') as HTMLElement;
        if (!content) return;
        const isFound = button.classList.contains('active-find');
        this.resetIsolationStates();
        const modelId = content.dataset.modelId;
        const model = modelId ? this.context.fragmentsManager?.list.get(modelId) : null;
        const hider = this.context.components.get(OBC.Hider);
        if (isFound) {
          await this.ghostManager.showAllModels(hider);
          return;
        }
        button.classList.add('active-find');
        content.classList.add('node-found');
        button.innerHTML = '<i class="fas fa-compress-arrows-alt"></i>';
        const idsToIsolate = this.getIdsFromContent(content);
        if (modelId && idsToIsolate.length > 0 && model && hider) {
           hider.isolate({ [modelId]: new Set(idsToIsolate) });
           this.selectionManager.zoomToElements(model, idsToIsolate);
           if (this.context.webgpuRenderer?.isEnabled()) this.context.webgpuRenderer.isolateElements(modelId, idsToIsolate);
        }
      });
    });

    const ghostBtns = this.treeContainer.querySelectorAll('.ghost-btn');
    ghostBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const button = e.currentTarget as HTMLElement;
        const content = button.closest('.tree-node-content') as HTMLElement;
        if (!content) return;
        const isGhost = button.classList.contains('active-ghost');
        this.resetIsolationStates();
        const modelId = content.dataset.modelId;
        const model = modelId ? this.context.fragmentsManager?.list.get(modelId) : null;
        const hider = this.context.components.get(OBC.Hider);
        if (isGhost) {
          await this.ghostManager.showAllModels(hider);
          return;
        }
        button.classList.add('active-ghost');
        content.classList.add('node-ghost');
        const idsToIsolate = this.getIdsFromContent(content);
        if (modelId && idsToIsolate.length > 0 && model && hider && this.context.fragmentsManager) {
            try {
              this.ghostManager.ghostAffectedModels.clear();
              this.ghostManager.ghostModeActive = true;
              this.ghostManager.ghostPrimaryModelId = modelId;
              this.ghostManager.ghostIdsToIsolate = idsToIsolate;
              const translucentMaterial: FRAGS.MaterialDefinition = { color: new THREE.Color(0x888888), opacity: 0.2, transparent: true, renderedFaces: FRAGS.RenderedFaces.TWO };
              const solidMaterial: FRAGS.MaterialDefinition = { color: new THREE.Color(0xb0e322), opacity: 1, transparent: false, renderedFaces: FRAGS.RenderedFaces.TWO };
              for (const [currentModelId, currentModel] of this.context.fragmentsManager.list) {
                try {
                  let allIds: number[] = [];
                  if (typeof (currentModel as any).getItemsIds === 'function') allIds = await (currentModel as any).getItemsIds();
                  else if (typeof (currentModel as any).getItemsIdsWithGeometry === 'function') allIds = await (currentModel as any).getItemsIdsWithGeometry();
                  else {
                    // @ts-ignore
                    if (currentModel.itemTypes && typeof currentModel.itemTypes.keys === 'function') allIds = Array.from(currentModel.itemTypes.keys());
                    else if ((currentModel as any).ids instanceof Set) allIds = Array.from((currentModel as any).ids);
                  }
                  if (allIds.length === 0) continue;
                  if (currentModelId === modelId) {
                    const others = allIds.filter(id => !idsToIsolate.includes(id));
                    this.ghostManager.ghostAffectedModels.set(currentModelId, { otherIds: others });
                    if (others.length > 0) await (currentModel as any).highlight(others, translucentMaterial);
                    await (currentModel as any).highlight(idsToIsolate, solidMaterial);
                  } else {
                    this.ghostManager.ghostAffectedModels.set(currentModelId, { otherIds: allIds });
                    await (currentModel as any).highlight(allIds, translucentMaterial);
                  }
                } catch (modelErr) {}
              }
              for (const [affectedModelId, _] of this.ghostManager.ghostAffectedModels) {
                const affectedModel = this.context.fragmentsManager.list.get(affectedModelId);
                if (affectedModel && (affectedModel as any).tiles?.onItemSet) {
                  const handler = async () => {
                    if (!this.ghostManager.ghostModeActive) return;
                    const modelData = this.ghostManager.ghostAffectedModels.get(affectedModelId);
                    if (!modelData) return;
                    try {
                      if (modelData.otherIds.length > 0) await (affectedModel as any).highlight(modelData.otherIds, translucentMaterial);
                      if (affectedModelId === this.ghostManager.ghostPrimaryModelId && this.ghostManager.ghostIdsToIsolate.length > 0) await (affectedModel as any).highlight(this.ghostManager.ghostIdsToIsolate, solidMaterial);
                    } catch (e) {}
                  };
                  this.ghostManager.tileUpdateHandlers.set(affectedModelId, handler);
                  (affectedModel as any).tiles.onItemSet.add(handler);
                }
              }
            } catch (err) {
              hider.isolate({ [modelId]: new Set(idsToIsolate) });
            }
            this.selectionManager.zoomToElements(model, idsToIsolate);
            if (this.context.webgpuRenderer?.isEnabled()) this.context.webgpuRenderer.isolateElements(modelId, idsToIsolate);
        }
      });
    });
  }

  private resetIsolationStates(): void {
    if (!this.treeContainer) return;
    this.treeContainer.querySelectorAll('.find-btn').forEach(b => {
      b.classList.remove('active-find');
      b.innerHTML = '<i class="fas fa-search"></i>';
    });
    this.treeContainer.querySelectorAll('.ghost-btn').forEach(b => b.classList.remove('active-ghost'));
    this.treeContainer.querySelectorAll('.node-found').forEach(node => node.classList.remove('node-found'));
    this.treeContainer.querySelectorAll('.node-ghost').forEach(node => node.classList.remove('node-ghost'));
  }

  private getIdsFromContent(content: HTMLElement): number[] {
    let ids: number[] = [];
    if (content.dataset.ids) ids = content.dataset.ids.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    else if (content.dataset.localId) ids.push(parseInt(content.dataset.localId, 10));
    else {
      content.parentElement?.querySelectorAll('.element-node .tree-node-content[data-local-id]')?.forEach(el => {
        const localId = (el as HTMLElement).dataset.localId;
        if (localId) ids.push(parseInt(localId, 10));
      });
    }
    return ids;
  }

  private async performTreeSearch(query: string, resultsDiv: HTMLElement): Promise<void> {
    this.searchQuery = query.toLowerCase().trim();
    const searchId = ++this.currentSearchId;
    if (!this.treeContainer) return;
    this.treeContainer.querySelectorAll('.tree-search-match').forEach(el => el.classList.remove('tree-search-match'));
    this.currentMatches = [];
    this.currentMatchIndex = -1;
    this.treeContainer.querySelectorAll('.tree-search-parent').forEach(el => {
      el.classList.remove('tree-search-parent');
      el.classList.remove('expanded');
      const icon = el.querySelector(':scope > .tree-node-content .tree-toggle i');
      if (icon) {
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-right');
      }
    });
    if (this.searchQuery.length === 0) {
      resultsDiv.innerHTML = '';
      resultsDiv.style.display = 'none';
      this.treeContainer.querySelectorAll('.tree-node').forEach(node => (node as HTMLElement).style.display = '');
      return;
    }
    resultsDiv.innerHTML = '<span class="search-result-count"><i class="fas fa-spinner fa-spin"></i> Searching...</span>';
    resultsDiv.style.display = 'block';
    await new Promise(resolve => setTimeout(resolve, 10));
    if (searchId !== this.currentSearchId) return;
    const allNodes = Array.from(this.treeContainer.querySelectorAll('.tree-node-content'));
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < allNodes.length; i += CHUNK_SIZE) {
      if (searchId !== this.currentSearchId) return;
      const chunk = allNodes.slice(i, i + CHUNK_SIZE);
      for (const nodeContent of chunk) {
        const labelEl = nodeContent.querySelector('.tree-label');
        if (!labelEl) continue;
        const label = labelEl.textContent?.toLowerCase() || '';
        if (label.includes(this.searchQuery)) {
          this.currentMatches.push(nodeContent as HTMLElement);
          (nodeContent as HTMLElement).classList.add('tree-search-match');
          const node = nodeContent.closest('.tree-node') as HTMLElement;
          if (node) node.style.display = '';
        }
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (searchId !== this.currentSearchId) return;
    if (this.currentMatches.length > 0) {
      this.updateSearchNavigationUI(resultsDiv);
      this.navigateToMatch(0);
    } else {
      resultsDiv.innerHTML = `<span class="search-no-results">No results found</span>`;
      resultsDiv.style.display = 'block';
    }
  }

  private updateSearchNavigationUI(resultsDiv: HTMLElement): void {
    const count = this.currentMatches.length;
    const index = this.currentMatchIndex + 1;
    resultsDiv.innerHTML = `
      <div class="search-nav-container" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <span class="search-result-count">${count} match${count !== 1 ? 'es' : ''}</span>
        <div class="search-nav-controls" style="display: flex; align-items: center; gap: 5px;">
          <button id="search-prev-btn" class="icon-btn small" title="Previous match" style="padding: 2px 6px;">
            <i class="fas fa-chevron-up"></i>
          </button>
          <span id="search-counter" style="font-size: 12px; min-width: 40px; text-align: center;">${index > 0 ? index : '-'}/${count}</span>
          <button id="search-next-btn" class="icon-btn small" title="Next match" style="padding: 2px 6px;">
            <i class="fas fa-chevron-down"></i>
          </button>
        </div>
      </div>
    `;
    resultsDiv.style.display = 'block';
    resultsDiv.querySelector('#search-prev-btn')?.addEventListener('click', () => {
      let newIndex = this.currentMatchIndex - 1;
      if (newIndex < 0) newIndex = this.currentMatches.length - 1;
      this.navigateToMatch(newIndex);
    });
    resultsDiv.querySelector('#search-next-btn')?.addEventListener('click', () => {
      let newIndex = this.currentMatchIndex + 1;
      if (newIndex >= this.currentMatches.length) newIndex = 0;
      this.navigateToMatch(newIndex);
    });
  }

  private navigateToMatch(index: number): void {
    if (index < 0 || index >= this.currentMatches.length) return;
    if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.currentMatches.length) this.currentMatches[this.currentMatchIndex].classList.remove('tree-search-active');
    this.currentMatchIndex = index;
    const match = this.currentMatches[index];
    match.classList.add('tree-search-active');
    let parent = match.closest('.tree-node')?.parentElement?.closest('.tree-node') as HTMLElement | null;
    while (parent) {
      if (!parent.classList.contains('expanded')) {
        parent.classList.add('expanded', 'tree-search-parent');
        const icon = parent.querySelector(':scope > .tree-node-content .tree-toggle i');
        if (icon) {
          icon.classList.remove('fa-chevron-right');
          icon.classList.add('fa-chevron-down');
        }
      }
      parent = parent.parentElement?.closest('.tree-node') as HTMLElement | null;
    }
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const counter = this.searchResultsElement?.querySelector('#search-counter');
    if (counter) counter.textContent = `${index + 1}/${this.currentMatches.length}`;
  }

  private clearTreeSearch(resultsDiv: HTMLElement): void {
    this.searchQuery = '';
    this.currentSearchId++;
    this.currentMatches = [];
    this.currentMatchIndex = -1;
    if (!this.treeContainer) return;
    this.treeContainer.querySelectorAll('.tree-search-match').forEach(el => el.classList.remove('tree-search-match'));
    this.treeContainer.querySelectorAll('.tree-search-active').forEach(el => el.classList.remove('tree-search-active'));
    this.treeContainer.querySelectorAll('.tree-search-parent').forEach(el => {
      el.classList.remove('tree-search-parent');
      el.classList.remove('expanded');
      const icon = el.querySelector(':scope > .tree-node-content .tree-toggle i');
      if (icon) {
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-right');
      }
    });
    this.treeContainer.querySelectorAll('.tree-node').forEach(node => (node as HTMLElement).style.display = '');
    resultsDiv.innerHTML = '';
    resultsDiv.style.display = 'none';
  }

  public collapseAllTreeNodes(): void {
    if (!this.treeContainer) return;
    const expandedNodes = this.treeContainer.querySelectorAll('.tree-node.expanded');
    expandedNodes.forEach(node => {
      node.classList.remove('expanded');
      const icon = node.querySelector(':scope > .tree-node-content .tree-toggle i');
      if (icon) {
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-right');
      }
    });
  }

  public expandAllTreeNodes(): void {
    if (!this.treeContainer) return;
    const collapsedNodes = this.treeContainer.querySelectorAll('.tree-node:not(.expanded)');
    collapsedNodes.forEach(node => {
      const hasChildren = node.querySelector(':scope > .tree-children');
      if (hasChildren) {
        node.classList.add('expanded');
        const icon = node.querySelector(':scope > .tree-node-content .tree-toggle i');
        if (icon) {
          icon.classList.remove('fa-chevron-right');
          icon.classList.add('fa-chevron-down');
        }
      }
    });
  }
}
