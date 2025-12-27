/**
 * SLICER UI MANAGER (The "Slicer Layout Department")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module builds the visual panel for the Slicer tool. It creates the 
 * dropdown menus, the search bars, and the clickable tiles that you use 
 * to filter the building.
 * 
 * HOW IT CONNECTS:
 * - SlicerDashboard: This is the "construction department" for the Slicer tool.
 * - UIStyles: Uses the app's global styles to make the Slicer panel look 
 *   sleek and modern.
 * --------------------------------------------------------------------------------
 */

import { SlicerConfig, SlicerState, PropertyData } from './SlicerDataManager';

export class SlicerUIManager {
  public createDashboardUI(onClose: () => void): HTMLDivElement {
    const dashboard = document.createElement('div');
    dashboard.id = 'slicer-dashboard';
    dashboard.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 50%;
      height: 100vh;
      background: linear-gradient(180deg, rgba(15, 15, 25, 0.98) 0%, rgba(20, 20, 35, 0.98) 100%);
      border-left: 2px solid rgba(74, 144, 226, 0.3);
      box-shadow: -10px 0 40px rgba(0, 0, 0, 0.5);
      z-index: 10001;
      display: flex;
      flex-direction: column;
      font-family: 'Segoe UI', system-ui, sans-serif;
      animation: slideIn 0.3s ease;
    `;

    this.injectStyles();
    return dashboard;
  }

  public createHeader(onClose: () => void): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px;
      background: linear-gradient(135deg, rgba(74, 144, 226, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
      border-bottom: 1px solid rgba(74, 144, 226, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 28px;">🎛️</span>
        <div>
          <h2 style="margin: 0; color: #fff; font-size: 18px; font-weight: 600;">Visual Slicers</h2>
          <p style="margin: 4px 0 0 0; color: #888; font-size: 11px;">Interactive data filtering</p>
        </div>
      </div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.2s;
    `;
    closeBtn.addEventListener('click', onClose);
    header.appendChild(closeBtn);

    return header;
  }

  public createSummaryBar(totalCount: number): HTMLElement {
    const bar = document.createElement('div');
    bar.id = 'slicer-summary-bar';
    bar.style.cssText = `
      padding: 12px 20px;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    bar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="color: #4a90e2; font-size: 18px;">📊</span>
          <span id="filtered-count" style="color: #4a90e2; font-weight: 600; font-size: 14px;">${totalCount}</span>
          <span style="color: #888; font-size: 12px;">of ${totalCount} items</span>
        </div>
        <div id="active-filters" style="display: flex; gap: 6px; flex-wrap: wrap;"></div>
      </div>
    `;

    return bar;
  }

  public createFooter(onClear: () => void, onExport: () => void): HTMLElement {
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px 20px;
      background: rgba(0, 0, 0, 0.3);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      gap: 10px;
    `;

    const clearBtn = document.createElement('button');
    clearBtn.innerHTML = '🔄 Clear All Filters';
    clearBtn.className = 'footer-btn clear-btn';
    clearBtn.style.cssText = `
      flex: 1; padding: 10px; background: rgba(255, 152, 0, 0.2); border: 1px solid rgba(255, 152, 0, 0.4);
      border-radius: 8px; color: #ff9800; font-size: 12px; cursor: pointer;
    `;
    clearBtn.addEventListener('click', onClear);

    const exportBtn = document.createElement('button');
    exportBtn.innerHTML = '📥 Export Filtered';
    exportBtn.className = 'footer-btn export-btn';
    exportBtn.style.cssText = `
      flex: 1; padding: 10px; background: rgba(76, 175, 80, 0.2); border: 1px solid rgba(76, 175, 80, 0.4);
      border-radius: 8px; color: #4caf50; font-size: 12px; cursor: pointer;
    `;
    exportBtn.addEventListener('click', onExport);

    footer.appendChild(clearBtn);
    footer.appendChild(exportBtn);
    return footer;
  }

  private injectStyles(): void {
    if (document.getElementById('slicer-dashboard-styles')) return;
    const style = document.createElement('style');
    style.id = 'slicer-dashboard-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .slicer-item:hover { background: rgba(74, 144, 226, 0.15) !important; transform: translateX(4px); }
      .slicer-item.selected { background: rgba(74, 144, 226, 0.25) !important; border-left: 3px solid #4a90e2 !important; }
      .tile-item:hover { transform: scale(1.05); box-shadow: 0 4px 15px rgba(74, 144, 226, 0.3); }
      .tile-item.selected { background: linear-gradient(135deg, rgba(74, 144, 226, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%) !important; border-color: #4a90e2 !important; }
      #slicers-container::-webkit-scrollbar { width: 10px; }
      #slicers-container::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); border-radius: 5px; }
      #slicers-container::-webkit-scrollbar-thumb { background: rgba(74, 144, 226, 0.3); border-radius: 5px; border: 2px solid rgba(0, 0, 0, 0.1); }
    `;
    document.head.appendChild(style);
  }
}
