/**
 * CLASH UI MANAGER (The "Clash Report Coordinator")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES:
 * Manages the UI for clash detection — toolbar button state, results panel,
 * and interaction with clash markers. Follows the same pattern as
 * ClusterUIManager for consistency.
 *
 * HOW IT CONNECTS:
 * - ClashDetectionModule: Triggers detection and reads results
 * - ToolbarHandlers: Called from toolbar button click handlers
 * - NotificationHelper: Shows user-facing notifications
 * --------------------------------------------------------------------------------
 */

import { NotificationHelper } from './NotificationHelper';
import { ClashDetectionModule, ClashResult, ClashDetectionOptions, DetectionScope } from '../webgl/ClashDetectionModule';

export class ClashUIManager {
  private resultsPanel: HTMLElement | null = null;
  private settingsPanel: HTMLElement | null = null;
  private selectedClashIds: Set<string> = new Set();
  private currentSort: { column: string; ascending: boolean } = { column: 'id', ascending: true };
  private currentClashes: ClashResult[] = [];

  constructor(
    private viewer: any,
    private getClashModule: () => ClashDetectionModule | null
  ) {}

  /**
   * Toggle clash detection on/off.
   * If inactive → show settings panel so user can configure before running.
   * If active → clear results.
   */
  public async handleToggleClashDetection(): Promise<void> {
    const clashModule = this.getClashModule();
    if (!clashModule) return;

    if (this.isWebGPUMode()) {
      NotificationHelper.show({
        title: 'Clash Detection Unavailable',
        message: 'Clash detection is not supported in WebGPU mode. Switch to WebGL mode first.',
        type: 'warning',
        duration: 4000,
      });
      return;
    }

    try {
      if (clashModule.isActive()) {
        // Turn off
        clashModule.clearClashes();
        this.hideResultsPanel();
        this.hideSettingsPanel();
        this.updateButtonState(false);
        NotificationHelper.show({
          title: 'Clash Detection',
          message: 'Clash detection cleared.',
          type: 'info',
          duration: 2000,
        });
      } else {
        // Show settings panel first (if settings panel already open, close it)
        if (this.settingsPanel) {
          this.hideSettingsPanel();
          this.updateButtonState(false);
        } else {
          await this.showSettingsPanel();
        }
      }
    } catch (error) {
      console.error('❌ Error in clash detection:', error);
      NotificationHelper.show({
        title: 'Clash Detection Error',
        message: 'An error occurred during clash detection. Check the console for details.',
        type: 'error',
        duration: 5000,
      });
    }
  }

  /**
   * Run detection with user-configured options (called from settings panel)
   */
  private async runWithOptions(options: Partial<ClashDetectionOptions>): Promise<void> {
    const clashModule = this.getClashModule();
    if (!clashModule) return;

    this.hideSettingsPanel();

    try {
      clashModule.setOptions(options);
      // Results display is handled by onClashesDetected callback
      const clashes = await clashModule.toggleClashDetection();

      if (clashes.length === 0) {
        NotificationHelper.show({
          title: 'No Clashes Found',
          message: 'No mesh-level clashes detected between the selected element types.',
          type: 'success',
          duration: 4000,
        });
        this.updateButtonState(false);
      }
    } catch (error) {
      console.error('❌ Error running clash detection:', error);
      NotificationHelper.show({
        title: 'Clash Detection Error',
        message: 'An error occurred. Check the console for details.',
        type: 'error',
        duration: 5000,
      });
      this.updateButtonState(false);
    }
  }

  /**
   * Cancel clash detection mode — clear results and reset UI
   */
  public async handleCancelClashMode(): Promise<void> {
    const clashModule = this.getClashModule();
    if (!clashModule || !clashModule.isActive()) return;

    try {
      clashModule.clearClashes();
      this.hideResultsPanel();
      this.hideSettingsPanel();
      this.updateButtonState(false);
    } catch (error) {
      console.error('❌ Error canceling clash mode:', error);
    }
  }

  /**
   * Update the toolbar button visual state
   */
  public updateButtonState(isActive: boolean): void {
    const btn = document.getElementById('clashDetectionMainBtn');
    if (!btn) return;

    if (isActive) {
      btn.classList.add('active');
      btn.style.background = 'linear-gradient(135deg, #f56565 0%, #c53030 100%)';
      btn.style.color = 'white';
    } else {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.color = '';
    }
  }

  /**
   * Public entry point to display clash results (called from onClashesDetected callback)
   * Unlike handleToggleClashDetection, this does NOT toggle — it only shows results.
   */
  public showClashResults(clashes: ClashResult[]): void {
    this.updateButtonState(true);
    this.showResultsPanel(clashes);
    NotificationHelper.show({
      title: 'Clash Detection Complete',
      message: `Found ${clashes.length} clashes. See the results panel for details.`,
      type: 'warning',
      duration: 5000,
    });
  }

  // ========================================================================
  // Settings Panel (tolerance + category selection)
  // ========================================================================

  /**
   * Show the settings panel where users configure tolerance and IFC categories.
   */
  private async showSettingsPanel(): Promise<void> {
    this.hideSettingsPanel();
    this.hideResultsPanel();

    const clashModule = this.getClashModule();
    if (!clashModule) return;

    this.updateButtonState(true);

    // Fetch available categories from loaded models
    let categories: Array<{ name: string; count: number }> = [];
    let loadedModels: Array<{ id: string; name: string; elementCount: number }> = [];
    try {
      categories = await clashModule.getAvailableCategories();
      loadedModels = clashModule.getLoadedModels();
    } catch (e) {
      console.warn('⚠️ Could not fetch categories:', e);
    }

    const currentOptions = clashModule.getOptions();

    const panel = document.createElement('div');
    panel.id = 'clashSettingsPanel';
    panel.innerHTML = this.buildSettingsPanelHTML(categories, currentOptions, loadedModels);
    this.applySettingsPanelStyles(panel);
    document.body.appendChild(panel);
    this.settingsPanel = panel;

    this.bindSettingsPanelEvents(categories, currentOptions, loadedModels);
  }

  /** Hide and remove the settings panel */
  private hideSettingsPanel(): void {
    if (this.settingsPanel) {
      this.settingsPanel.remove();
      this.settingsPanel = null;
    }
    const existing = document.getElementById('clashSettingsPanel');
    if (existing) existing.remove();
  }

  /** Build settings panel HTML */
  private buildSettingsPanelHTML(
    categories: Array<{ name: string; count: number }>,
    options: ClashDetectionOptions,
    loadedModels: Array<{ id: string; name: string; elementCount: number }> = []
  ): string {
    // Determine which categories are currently included
    const excludeSet = new Set(options.excludeCategories.map(c => c.toUpperCase()));
    const includeSet = new Set(options.includeCategories.map(c => c.toUpperCase()));

    // Build category checkboxes
    let categoryRows = '';
    for (const cat of categories) {
      const upper = cat.name.toUpperCase();
      // If includeCategories is non-empty, only those are checked.
      // If includeCategories is empty, everything NOT in excludeCategories is checked.
      let checked: boolean;
      if (includeSet.size > 0) {
        checked = includeSet.has(upper);
      } else {
        checked = !excludeSet.has(upper);
      }
      const cleanName = cat.name.replace(/^IFC/, '');
      categoryRows += `
        <label class="clash-cat-row" title="${cat.name} (${cat.count} elements)">
          <input type="checkbox" class="clash-cat-cb" data-category="${upper}" ${checked ? 'checked' : ''} />
          <span class="clash-cat-name">${cleanName}</span>
          <span class="clash-cat-count">${cat.count}</span>
        </label>
      `;
    }

    const toleranceCm = (options.tolerance * 100).toFixed(1);

    // Build model selection rows (only shows if 2+ models loaded)
    let modelSection = '';
    if (loadedModels.length >= 2) {
      let modelRows = '';
      for (const m of loadedModels) {
        const selected = options.selectedModelIds.length === 0 || options.selectedModelIds.includes(m.id);
        modelRows += `
          <label class="clash-cat-row" title="${m.id}">
            <input type="checkbox" class="clash-model-cb" data-model-id="${m.id}" ${selected ? 'checked' : ''} />
            <span class="clash-cat-name">${m.name}</span>
            <span class="clash-cat-count">${m.elementCount}</span>
          </label>
        `;
      }
      const scopeAll = options.detectionScope === 'all' ? 'selected' : '';
      const scopeCross = options.detectionScope === 'cross-model' ? 'selected' : '';
      const scopeWithin = options.detectionScope === 'within-model' ? 'selected' : '';

      modelSection = `
      <div class="clash-settings-section">
        <label class="clash-settings-label">Models (${loadedModels.length} loaded)</label>
        <div class="clash-cat-list clash-model-list" id="clashModelList">
          ${modelRows}
        </div>
      </div>

      <div class="clash-settings-section">
        <label class="clash-settings-label">Detection Scope</label>
        <select id="clashDetectionScope" class="clash-scope-select">
          <option value="all" ${scopeAll}>All pairs (within &amp; between models)</option>
          <option value="cross-model" ${scopeCross}>Between models only</option>
          <option value="within-model" ${scopeWithin}>Within each model only</option>
        </select>
        <div class="clash-tolerance-hint">
          "Between models only" compares elements from different IFC files — useful for coordination checks.
        </div>
      </div>
      `;
    }

    return `
      <div class="clash-settings-header">
        <span class="clash-settings-title">
          <i class="fas fa-cogs" style="color: #99aaff; margin-right: 6px;"></i>
          Clash Detection Settings
        </span>
        <button class="clash-settings-close" id="clashSettingsCloseBtn" title="Close">✕</button>
      </div>

      <div class="clash-settings-body">
        <div class="clash-settings-section">
          <label class="clash-settings-label">Tolerance (cm)</label>
          <div class="clash-tolerance-row">
            <input type="range" id="clashToleranceSlider" min="0.1" max="20" step="0.1" value="${toleranceCm}" class="clash-slider" />
            <input type="number" id="clashToleranceInput" min="0.1" max="100" step="0.1" value="${toleranceCm}" class="clash-number-input" />
          </div>
          <div class="clash-tolerance-hint">
            Minimum penetration depth to report. Smaller = more sensitive.
          </div>
        </div>

        ${modelSection}

        <div class="clash-settings-section">
          <div class="clash-settings-label-row">
            <label class="clash-settings-label">IFC Types to Include</label>
            <span class="clash-cat-actions">
              <button id="clashCatSelectAll" class="clash-cat-action-btn" title="Select all">All</button>
              <button id="clashCatSelectNone" class="clash-cat-action-btn" title="Deselect all">None</button>
            </span>
          </div>
          <div class="clash-cat-search-row">
            <input type="text" id="clashCatSearch" placeholder="Search categories..." class="clash-cat-search" />
          </div>
          <div class="clash-cat-list" id="clashCatList">
            ${categoryRows || '<div class="clash-cat-empty">No models loaded</div>'}
          </div>
        </div>

        <div class="clash-settings-section">
          <label class="clash-settings-row-option">
            <input type="checkbox" id="clashCrossCategory" ${options.crossCategoryOnly ? 'checked' : ''} />
            <span>Cross-category only</span>
          </label>
          <div class="clash-tolerance-hint">
            Only detect clashes between different IFC types (e.g., Wall↔Beam). Uncheck to also find same-type clashes.
          </div>
        </div>
      </div>

      <div class="clash-settings-footer">
        <button class="clash-run-btn" id="clashRunBtn">
          <i class="fas fa-play"></i> Run Clash Detection
        </button>
        <button class="clash-cancel-btn" id="clashCancelSettingsBtn">Cancel</button>
      </div>
    `;
  }

  /** Apply styles to the settings panel */
  private applySettingsPanelStyles(panel: HTMLElement): void {
    Object.assign(panel.style, {
      position: 'fixed',
      top: '80px',
      right: '16px',
      width: '340px',
      maxHeight: 'calc(100vh - 120px)',
      background: 'rgba(30, 30, 45, 0.96)',
      backdropFilter: 'blur(14px)',
      borderRadius: '12px',
      border: '1px solid rgba(120, 130, 255, 0.25)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '12px',
      zIndex: '10001',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    });

    const style = document.createElement('style');
    style.textContent = `
      #clashSettingsPanel .clash-settings-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.1);
        background: rgba(100, 110, 255, 0.08);
      }
      #clashSettingsPanel .clash-settings-title { font-size: 13px; font-weight: 600; color: #fff; }
      #clashSettingsPanel .clash-settings-close {
        background: none; border: none; color: #999; font-size: 16px;
        cursor: pointer; padding: 2px 6px; border-radius: 4px;
      }
      #clashSettingsPanel .clash-settings-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
      #clashSettingsPanel .clash-settings-body {
        flex: 1; overflow-y: auto; min-height: 0;
      }
      #clashSettingsPanel .clash-settings-body::-webkit-scrollbar { width: 5px; }
      #clashSettingsPanel .clash-settings-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
      #clashSettingsPanel .clash-settings-section {
        padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      #clashSettingsPanel .clash-settings-label {
        font-size: 11px; font-weight: 600; color: #bbb; text-transform: uppercase;
        letter-spacing: 0.5px; margin-bottom: 6px; display: block;
      }
      #clashSettingsPanel .clash-settings-label-row {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;
      }
      #clashSettingsPanel .clash-settings-label-row .clash-settings-label { margin-bottom: 0; }
      #clashSettingsPanel .clash-tolerance-row {
        display: flex; align-items: center; gap: 10px;
      }
      #clashSettingsPanel .clash-slider {
        flex: 1; height: 4px; appearance: none; background: rgba(255,255,255,0.15);
        border-radius: 2px; outline: none; cursor: pointer;
      }
      #clashSettingsPanel .clash-slider::-webkit-slider-thumb {
        appearance: none; width: 16px; height: 16px; border-radius: 50%;
        background: #7b8aff; cursor: pointer; border: 2px solid rgba(30,30,45,0.8);
      }
      #clashSettingsPanel .clash-number-input {
        width: 58px; padding: 4px 6px; background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15); border-radius: 6px;
        color: #fff; font-size: 12px; text-align: center; outline: none;
      }
      #clashSettingsPanel .clash-number-input:focus { border-color: #7b8aff; }
      #clashSettingsPanel .clash-tolerance-hint {
        font-size: 10px; color: #777; margin-top: 4px; line-height: 1.4;
      }
      #clashSettingsPanel .clash-cat-search-row { margin-bottom: 6px; }
      #clashSettingsPanel .clash-cat-search {
        width: 100%; padding: 6px 8px; background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;
        color: #ddd; font-size: 11px; outline: none; box-sizing: border-box;
      }
      #clashSettingsPanel .clash-cat-search:focus { border-color: #7b8aff; }
      #clashSettingsPanel .clash-cat-search::placeholder { color: #666; }
      #clashSettingsPanel .clash-cat-list {
        max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px;
      }
      #clashSettingsPanel .clash-cat-list::-webkit-scrollbar { width: 5px; }
      #clashSettingsPanel .clash-cat-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
      #clashSettingsPanel .clash-cat-row {
        display: flex; align-items: center; gap: 8px; padding: 5px 6px;
        border-radius: 4px; cursor: pointer; transition: background 0.12s;
      }
      #clashSettingsPanel .clash-cat-row:hover { background: rgba(255,255,255,0.06); }
      #clashSettingsPanel .clash-cat-cb { accent-color: #7b8aff; cursor: pointer; flex-shrink: 0; }
      #clashSettingsPanel .clash-cat-name { flex: 1; font-size: 11px; color: #ddd; }
      #clashSettingsPanel .clash-cat-count { font-size: 10px; color: #777; min-width: 28px; text-align: right; }
      #clashSettingsPanel .clash-cat-empty { color: #666; font-style: italic; padding: 12px; text-align: center; }
      #clashSettingsPanel .clash-cat-actions { display: flex; gap: 4px; }
      #clashSettingsPanel .clash-cat-action-btn {
        padding: 2px 8px; font-size: 10px; border: 1px solid rgba(255,255,255,0.15);
        background: rgba(255,255,255,0.05); color: #aaa; border-radius: 4px; cursor: pointer;
      }
      #clashSettingsPanel .clash-cat-action-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
      #clashSettingsPanel .clash-settings-row-option {
        display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: #ddd;
      }
      #clashSettingsPanel .clash-settings-row-option input { accent-color: #7b8aff; cursor: pointer; }
      #clashSettingsPanel .clash-settings-footer {
        display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid rgba(255,255,255,0.1);
        flex-shrink: 0;
      }
      #clashSettingsPanel .clash-run-btn {
        flex: 1; padding: 8px 14px; border: none; border-radius: 8px;
        background: linear-gradient(135deg, #5b6abf 0%, #7b8aff 100%);
        color: #fff; font-size: 12px; font-weight: 600; cursor: pointer;
        transition: opacity 0.15s;
      }
      #clashSettingsPanel .clash-run-btn:hover { opacity: 0.9; }
      #clashSettingsPanel .clash-cancel-btn {
        padding: 8px 14px; border: 1px solid rgba(255,255,255,0.15);
        border-radius: 8px; background: transparent; color: #aaa;
        font-size: 12px; cursor: pointer;
      }
      #clashSettingsPanel .clash-cancel-btn:hover { background: rgba(255,255,255,0.06); color: #fff; }
      #clashSettingsPanel .clash-model-list { max-height: 120px; }
      #clashSettingsPanel .clash-scope-select {
        width: 100%; padding: 6px 8px; background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15); border-radius: 6px;
        color: #ddd; font-size: 11px; outline: none; cursor: pointer;
        appearance: none; -webkit-appearance: none;
      }
      #clashSettingsPanel .clash-scope-select:focus { border-color: #7b8aff; }
      #clashSettingsPanel .clash-scope-select option { background: #1e1e2d; color: #ddd; }
    `;
    panel.prepend(style);
  }

  /** Bind events for the settings panel */
  private bindSettingsPanelEvents(
    categories: Array<{ name: string; count: number }>,
    _currentOptions: ClashDetectionOptions,
    _loadedModels: Array<{ id: string; name: string; elementCount: number }> = []
  ): void {
    const panel = this.settingsPanel;
    if (!panel) return;

    // Close button
    panel.querySelector('#clashSettingsCloseBtn')?.addEventListener('click', () => {
      this.hideSettingsPanel();
      this.updateButtonState(false);
    });

    // Cancel button
    panel.querySelector('#clashCancelSettingsBtn')?.addEventListener('click', () => {
      this.hideSettingsPanel();
      this.updateButtonState(false);
    });

    // Tolerance slider ↔ number input sync
    const slider = panel.querySelector('#clashToleranceSlider') as HTMLInputElement;
    const numInput = panel.querySelector('#clashToleranceInput') as HTMLInputElement;
    if (slider && numInput) {
      slider.addEventListener('input', () => { numInput.value = slider.value; });
      numInput.addEventListener('input', () => { slider.value = numInput.value; });
    }

    // Select All / None
    panel.querySelector('#clashCatSelectAll')?.addEventListener('click', () => {
      panel.querySelectorAll<HTMLInputElement>('.clash-cat-cb').forEach(cb => {
        if ((cb.closest('.clash-cat-row') as HTMLElement)?.style.display !== 'none') {
          cb.checked = true;
        }
      });
    });
    panel.querySelector('#clashCatSelectNone')?.addEventListener('click', () => {
      panel.querySelectorAll<HTMLInputElement>('.clash-cat-cb').forEach(cb => cb.checked = false);
    });

    // Category search filter
    const searchInput = panel.querySelector('#clashCatSearch') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase();
      panel.querySelectorAll<HTMLElement>('.clash-cat-row').forEach(row => {
        const name = row.querySelector('.clash-cat-name')?.textContent?.toLowerCase() || '';
        row.style.display = name.includes(query) ? '' : 'none';
      });
    });

    // Run button
    panel.querySelector('#clashRunBtn')?.addEventListener('click', () => {
      // Gather tolerance
      const toleranceCm = parseFloat(numInput?.value || '1');
      const tolerance = Math.max(0.001, toleranceCm / 100); // convert cm → meters

      // Gather selected categories
      const selectedCategories: string[] = [];
      panel.querySelectorAll<HTMLInputElement>('.clash-cat-cb').forEach(cb => {
        if (cb.checked) {
          selectedCategories.push(cb.dataset.category || '');
        }
      });

      if (selectedCategories.length < 2) {
        NotificationHelper.show({
          title: 'Select Categories',
          message: 'Please select at least 2 IFC types to run clash detection.',
          type: 'warning',
          duration: 3000,
        });
        return;
      }

      // Gather cross-category option
      const crossCatOnly = (panel.querySelector('#clashCrossCategory') as HTMLInputElement)?.checked ?? true;

      // Gather detection scope
      const scopeSelect = panel.querySelector('#clashDetectionScope') as HTMLSelectElement;
      const detectionScope = (scopeSelect?.value || 'all') as DetectionScope;

      // Gather selected model IDs
      const selectedModelIds: string[] = [];
      panel.querySelectorAll<HTMLInputElement>('.clash-model-cb').forEach(cb => {
        if (cb.checked) {
          selectedModelIds.push(cb.dataset.modelId || '');
        }
      });

      // Compute exclude list as all unselected categories
      const allCategoryNames = categories.map(c => c.name.toUpperCase());
      const selectedSet = new Set(selectedCategories);
      const excludeCategories = allCategoryNames.filter(c => !selectedSet.has(c));

      this.runWithOptions({
        tolerance,
        crossCategoryOnly: crossCatOnly,
        detectionScope,
        includeCategories: [], // empty = all (we use exclude to filter)
        excludeCategories,
        selectedModelIds,
      });
    });
  }

  // ========================================================================
  // Results Panel
  // ========================================================================

  /**
   * Show the clash results panel
   */
  private showResultsPanel(clashes: ClashResult[]): void {
    this.hideResultsPanel();
    this.currentClashes = clashes;
    this.selectedClashIds.clear();

    const panel = document.createElement('div');
    panel.id = 'clashResultsPanel';
    panel.innerHTML = this.buildResultsPanelHTML(this.getSortedClashes());
    this.applyPanelStyles(panel);
    document.body.appendChild(panel);
    this.resultsPanel = panel;

    // Bind event handlers
    this.bindPanelEvents();
  }

  /**
   * Hide and remove the results panel
   */
  private hideResultsPanel(): void {
    if (this.resultsPanel) {
      this.resultsPanel.remove();
      this.resultsPanel = null;
    }
    this.selectedClashIds.clear();
    // Also try by ID in case reference was lost
    const existing = document.getElementById('clashResultsPanel');
    if (existing) existing.remove();
  }

  /**
   * Build the HTML content for the results panel
   */
  private buildResultsPanelHTML(clashes: ClashResult[]): string {
    const allClashes = this.currentClashes;
    const hardCount = allClashes.filter(c => c.severity === 'hard').length;
    const softCount = allClashes.filter(c => c.severity === 'soft').length;

    // Check if there are cross-model clashes (show model names if so)
    const hasCrossModel = allClashes.some(c => c.elementA.modelId !== c.elementB.modelId);
    const crossModelCount = allClashes.filter(c => c.elementA.modelId !== c.elementB.modelId).length;

    let rows = '';
    for (const clash of clashes) {
      const catA = clash.elementA.ifcCategory.replace('IFC', '');
      const catB = clash.elementB.ifcCategory.replace('IFC', '');
      const triPairs = (clash as any).intersectingTrianglePairs ?? 0;
      const triLabel = triPairs > 0 ? `${triPairs} △` : '—';
      const sevColor = clash.severity === 'hard' ? '#ff4444' : '#ff8800';
      const sevLabel = clash.severity === 'hard' ? 'Hard' : 'Soft';
      const isSelected = this.selectedClashIds.has(clash.id);

      // Show model names if cross-model clashes exist
      const isCrossModel = clash.elementA.modelId !== clash.elementB.modelId;
      const modelTag = hasCrossModel && isCrossModel
        ? `<div class="clash-model-tag" title="${clash.elementA.modelName} ↔ ${clash.elementB.modelName}">
             <span class="clash-model-a">${clash.elementA.modelName}</span> ↔ <span class="clash-model-b">${clash.elementB.modelName}</span>
           </div>`
        : '';

      rows += `
        <div class="clash-row${isSelected ? ' clash-row-selected' : ''}" data-clash-id="${clash.id}" title="Click to select. Ctrl/Cmd+click for multi-select.">
          <div class="clash-id">${clash.id.replace('clash_', '#')}</div>
          <div class="clash-pair-col">
            <div class="clash-pair"><span class="clash-dot-red">●</span> ${catA} ↔ <span class="clash-dot-green">●</span> ${catB}</div>
            ${modelTag}
          </div>
          <div class="clash-vol">${triLabel}</div>
          <span class="clash-severity" style="color: ${sevColor};">${sevLabel}</span>
        </div>
      `;
    }

    const crossModelNote = hasCrossModel
      ? `<span class="clash-cross-model">🔀 ${crossModelCount} cross-model</span>`
      : '';

    const sortIcon = (col: string) => {
      if (this.currentSort.column !== col) return '';
      return this.currentSort.ascending ? ' ▲' : ' ▼';
    };

    const selCount = this.selectedClashIds.size;
    const selLabel = selCount > 0 ? ` (${selCount} selected)` : '';

    return `
      <div class="clash-panel-header">
        <span class="clash-panel-title">
          <i class="fas fa-exclamation-triangle" style="color: #ff4444; margin-right: 6px;"></i>
          Clash Detection Results
        </span>
        <button class="clash-panel-close" id="clashPanelCloseBtn" title="Close panel">✕</button>
      </div>
      <div class="clash-summary">
        <span class="clash-total">${allClashes.length} clashes found${selLabel}</span>
        <span class="clash-hard" style="color: #ff4444;">● ${hardCount} hard</span>
        <span class="clash-soft" style="color: #ff8800;">● ${softCount} soft</span>
        ${crossModelNote}
      </div>
      <div class="clash-selection-bar">
        <button class="clash-sel-btn" id="clashSelectAllBtn" title="Select all visible clashes">Select All</button>
        <button class="clash-sel-btn" id="clashDeselectAllBtn" title="Deselect all">Deselect All</button>
      </div>
      <div class="clash-list-header">
        <div class="clash-id clash-sort-col" data-sort="id">ID${sortIcon('id')}</div>
        <div class="clash-pair clash-sort-col" data-sort="category">Category Pair${sortIcon('category')}</div>
        <div class="clash-vol clash-sort-col" data-sort="tris">Tris${sortIcon('tris')}</div>
        <span class="clash-severity clash-sort-col" data-sort="severity">Sev.${sortIcon('severity')}</span>
      </div>
      <div class="clash-list">
        ${rows}
      </div>
      ${allClashes.length > 500 ? `<div class="clash-truncated">Showing ${allClashes.length} clashes — large result set may affect scroll performance</div>` : ''}
      <div class="clash-panel-footer">
        <button class="clash-export-btn" id="clashExportBtn" title="Export clashes as JSON">
          <i class="fas fa-file-export"></i> Export JSON
        </button>
        <button class="clash-clear-btn" id="clashClearBtn" title="Clear all clashes">
          <i class="fas fa-times-circle"></i> Clear
        </button>
      </div>
    `;
  }

  /**
   * Apply CSS styles to the panel
   */
  private applyPanelStyles(panel: HTMLElement): void {
    Object.assign(panel.style, {
      position: 'fixed',
      top: '80px',
      right: '16px',
      width: '380px',
      maxHeight: 'calc(100vh - 180px)',
      background: 'rgba(30, 30, 45, 0.95)',
      backdropFilter: 'blur(12px)',
      borderRadius: '12px',
      border: '1px solid rgba(255, 68, 68, 0.3)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '12px',
      zIndex: '10000',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    });

    // Add scoped styles via a <style> tag inside the panel
    const style = document.createElement('style');
    style.textContent = `
      #clashResultsPanel .clash-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 68, 68, 0.1);
      }
      #clashResultsPanel .clash-panel-title {
        font-size: 13px;
        font-weight: 600;
        color: #fff;
      }
      #clashResultsPanel .clash-panel-close {
        background: none;
        border: none;
        color: #999;
        font-size: 16px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
      }
      #clashResultsPanel .clash-panel-close:hover {
        background: rgba(255,255,255,0.1);
        color: #fff;
      }
      #clashResultsPanel .clash-summary {
        display: flex;
        gap: 12px;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 11px;
      }
      #clashResultsPanel .clash-total { font-weight: 600; color: #fff; }
      #clashResultsPanel .clash-list-header {
        display: flex;
        align-items: center;
        padding: 6px 14px;
        gap: 8px;
        font-size: 10px;
        color: #888;
        text-transform: uppercase;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      #clashResultsPanel .clash-list {
        overflow-y: auto;
        flex: 1;
        max-height: calc(100vh - 380px);
      }
      #clashResultsPanel .clash-row {
        display: flex;
        align-items: center;
        padding: 8px 14px;
        gap: 8px;
        cursor: pointer;
        transition: background 0.15s;
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      #clashResultsPanel .clash-row:hover {
        background: rgba(255, 68, 68, 0.15);
      }
      #clashResultsPanel .clash-id {
        width: 36px;
        flex-shrink: 0;
        color: #999;
        font-size: 10px;
      }
      #clashResultsPanel .clash-pair {
        flex: 1;
        color: #ddd;
        font-size: 11px;
      }
      #clashResultsPanel .clash-pair-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      #clashResultsPanel .clash-model-tag {
        font-size: 9px;
        color: #8899cc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #clashResultsPanel .clash-model-a { color: #88bbff; }
      #clashResultsPanel .clash-model-b { color: #ffbb88; }
      #clashResultsPanel .clash-dot-red { color: #ff2222; font-size: 10px; margin-right: 1px; }
      #clashResultsPanel .clash-dot-green { color: #22cc44; font-size: 10px; margin-right: 1px; }
      #clashResultsPanel .clash-cross-model {
        font-size: 10px;
        color: #88aaff;
      }
      #clashResultsPanel .clash-vol {
        width: 70px;
        text-align: right;
        color: #aaa;
        font-size: 10px;
        flex-shrink: 0;
      }
      #clashResultsPanel .clash-severity {
        width: 36px;
        text-align: center;
        font-size: 10px;
        font-weight: 600;
        flex-shrink: 0;
      }
      #clashResultsPanel .clash-truncated {
        text-align: center;
        padding: 8px;
        color: #888;
        font-size: 10px;
        font-style: italic;
      }
      #clashResultsPanel .clash-panel-footer {
        display: flex;
        gap: 8px;
        padding: 10px 14px;
        border-top: 1px solid rgba(255,255,255,0.1);
      }
      #clashResultsPanel .clash-export-btn,
      #clashResultsPanel .clash-clear-btn {
        flex: 1;
        padding: 6px 10px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: background 0.15s;
      }
      #clashResultsPanel .clash-export-btn {
        background: rgba(100, 100, 255, 0.2);
        color: #99aaff;
      }
      #clashResultsPanel .clash-export-btn:hover {
        background: rgba(100, 100, 255, 0.35);
      }
      #clashResultsPanel .clash-clear-btn {
        background: rgba(255, 68, 68, 0.2);
        color: #ff8888;
      }
      #clashResultsPanel .clash-clear-btn:hover {
        background: rgba(255, 68, 68, 0.35);
      }
      #clashResultsPanel .clash-list::-webkit-scrollbar {
        width: 6px;
      }
      #clashResultsPanel .clash-list::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.15);
        border-radius: 3px;
      }
      #clashResultsPanel .clash-row-selected {
        background: rgba(255, 68, 68, 0.25) !important;
      }
      #clashResultsPanel .clash-sort-col {
        cursor: pointer;
        user-select: none;
        transition: color 0.15s;
      }
      #clashResultsPanel .clash-sort-col:hover {
        color: #ccc;
      }
      #clashResultsPanel .clash-selection-bar {
        display: flex;
        gap: 6px;
        padding: 4px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      #clashResultsPanel .clash-sel-btn {
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.12);
        color: #bbb;
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s;
      }
      #clashResultsPanel .clash-sel-btn:hover {
        background: rgba(255,255,255,0.15);
        color: #fff;
      }
    `;
    panel.prepend(style);
  }

  /**
   * Bind click events to the results panel
   */
  private bindPanelEvents(): void {
    const panel = this.resultsPanel;
    if (!panel) return;

    const clashes = this.currentClashes;

    // Close button
    const closeBtn = panel.querySelector('#clashPanelCloseBtn');
    closeBtn?.addEventListener('click', () => this.hideResultsPanel());

    // Export button
    const exportBtn = panel.querySelector('#clashExportBtn');
    exportBtn?.addEventListener('click', () => this.exportClashesJSON(clashes));

    // Clear button
    const clearBtn = panel.querySelector('#clashClearBtn');
    clearBtn?.addEventListener('click', () => this.handleCancelClashMode());

    // Select All / Deselect All
    const selectAllBtn = panel.querySelector('#clashSelectAllBtn');
    selectAllBtn?.addEventListener('click', () => {
      const sorted = this.getSortedClashes();
      for (const c of sorted) this.selectedClashIds.add(c.id);
      this.refreshResultRows();
      this.applyHighlightsForSelection();
    });

    const deselectAllBtn = panel.querySelector('#clashDeselectAllBtn');
    deselectAllBtn?.addEventListener('click', () => {
      this.selectedClashIds.clear();
      this.refreshResultRows();
      const clashModule = this.getClashModule();
      clashModule?.clearClashHighlights();
    });

    // Sortable column headers
    const sortCols = panel.querySelectorAll('.clash-sort-col');
    sortCols.forEach(col => {
      col.addEventListener('click', () => {
        const sortKey = (col as HTMLElement).dataset.sort;
        if (!sortKey) return;
        if (this.currentSort.column === sortKey) {
          this.currentSort.ascending = !this.currentSort.ascending;
        } else {
          this.currentSort.column = sortKey;
          this.currentSort.ascending = true;
        }
        this.refreshResultRows();
      });
    });

    // Row clicks — multi-select with Ctrl/Cmd
    this.bindRowClickEvents();
  }

  /**
   * Bind click events on clash rows (called after re-render too)
   */
  private bindRowClickEvents(): void {
    const panel = this.resultsPanel;
    if (!panel) return;

    const rows = panel.querySelectorAll('.clash-row');
    rows.forEach(row => {
      row.addEventListener('click', async (e: Event) => {
        const clashId = (row as HTMLElement).dataset.clashId;
        if (!clashId) return;

        const mouseEvt = e as MouseEvent;
        const isMulti = mouseEvt.ctrlKey || mouseEvt.metaKey;

        if (isMulti) {
          // Toggle this clash in the selection
          if (this.selectedClashIds.has(clashId)) {
            this.selectedClashIds.delete(clashId);
          } else {
            this.selectedClashIds.add(clashId);
          }
        } else {
          // Single select — replace selection
          this.selectedClashIds.clear();
          this.selectedClashIds.add(clashId);
        }

        // Update row visuals
        rows.forEach(r => {
          const rid = (r as HTMLElement).dataset.clashId ?? '';
          (r as HTMLElement).classList.toggle('clash-row-selected', this.selectedClashIds.has(rid));
        });

        // Update selection count in summary
        this.updateSelectionCount();

        // Apply highlights
        await this.applyHighlightsForSelection();

        // Zoom to the clicked clash (if single select)
        if (!isMulti) {
          const clashModule = this.getClashModule();
          await clashModule?.zoomToClash(clashId);
        }
      });
    });
  }

  /**
   * Apply highlight + ghost for the current selection
   */
  private async applyHighlightsForSelection(): Promise<void> {
    const clashModule = this.getClashModule();
    if (!clashModule) return;

    const ids = Array.from(this.selectedClashIds);
    if (ids.length === 0) {
      clashModule.clearClashHighlights();
    } else {
      await clashModule.highlightClashElements(ids);
    }
  }

  /**
   * Update selection count in the summary bar
   */
  private updateSelectionCount(): void {
    const panel = this.resultsPanel;
    if (!panel) return;
    const totalEl = panel.querySelector('.clash-total');
    if (!totalEl) return;
    const selCount = this.selectedClashIds.size;
    const selLabel = selCount > 0 ? ` (${selCount} selected)` : '';
    totalEl.textContent = `${this.currentClashes.length} clashes found${selLabel}`;
  }

  /**
   * Get clashes sorted by the current sort column/direction
   */
  private getSortedClashes(): ClashResult[] {
    const clashes = [...this.currentClashes];
    const { column, ascending } = this.currentSort;
    const dir = ascending ? 1 : -1;

    clashes.sort((a, b) => {
      switch (column) {
        case 'id': {
          const numA = parseInt(a.id.replace('clash_', ''), 10);
          const numB = parseInt(b.id.replace('clash_', ''), 10);
          return (numA - numB) * dir;
        }
        case 'category': {
          const catA = `${a.elementA.ifcCategory} ${a.elementB.ifcCategory}`;
          const catB = `${b.elementA.ifcCategory} ${b.elementB.ifcCategory}`;
          return catA.localeCompare(catB) * dir;
        }
        case 'tris': {
          const tA = (a as any).intersectingTrianglePairs ?? 0;
          const tB = (b as any).intersectingTrianglePairs ?? 0;
          return (tA - tB) * dir;
        }
        case 'severity': {
          const sevOrder = (s: string) => s === 'hard' ? 0 : 1;
          return (sevOrder(a.severity) - sevOrder(b.severity)) * dir;
        }
        default:
          return 0;
      }
    });
    return clashes;
  }

  /**
   * Re-render just the rows + header (preserves panel structure)
   */
  private refreshResultRows(): void {
    const panel = this.resultsPanel;
    if (!panel) return;

    // Re-render entire panel content with current sort
    panel.innerHTML = this.buildResultsPanelHTML(this.getSortedClashes());

    // Re-apply scoped styles (innerHTML wipes the <style> tag)
    this.applyPanelStyles(panel);

    // Re-bind events (sort cols and row clicks)
    this.bindPanelEvents();
  }

  /**
   * Export clashes as a JSON file
   */
  private exportClashesJSON(clashes: ClashResult[]): void {
    const exportData = clashes.map(c => ({
      id: c.id,
      severity: c.severity,
      overlapVolume: c.overlapVolume,
      intersectingTrianglePairs: (c as any).intersectingTrianglePairs ?? 0,
      center: { x: c.center.x, y: c.center.y, z: c.center.z },
      elementA: {
        modelId: c.elementA.modelId,
        modelName: c.elementA.modelName,
        localId: c.elementA.localId,
        ifcCategory: c.elementA.ifcCategory,
      },
      elementB: {
        modelId: c.elementB.modelId,
        modelName: c.elementB.modelName,
        localId: c.elementB.localId,
        ifcCategory: c.elementB.ifcCategory,
      },
    }));

    const json = JSON.stringify({ clashCount: clashes.length, clashes: exportData }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clash-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    NotificationHelper.show({
      title: 'Export Complete',
      message: `Exported ${clashes.length} clashes to JSON.`,
      type: 'success',
      duration: 3000,
    });
  }

  /**
   * Check if WebGPU mode is active
   */
  private isWebGPUMode(): boolean {
    if (!this.viewer) return false;
    return this.viewer.getWebGPURenderer?.()?.isEnabled?.() || false;
  }
}
