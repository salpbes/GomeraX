/**
 * DASHBOARD UI MANAGER (The "Interior Designer")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module builds the actual "window" that the dashboard lives in. 
 * It creates the buttons, the scrollable areas, and the containers where 
 * the charts will be placed.
 * 
 * HOW IT CONNECTS:
 * - ModelDashboard: This is the "construction department" for the main dashboard.
 * - UIStyles: Uses the app's global styles to make sure the dashboard 
 *   matches the rest of the viewer.
 * --------------------------------------------------------------------------------
 */

import { ModelStatistics, ModelDetail, SpatialNode } from './DataManager';

export class DashboardUIManager {
  /**
   * Creates the dashboard UI
   */
  public createDashboardUI(stats: ModelStatistics, onClose: () => void, onExport: () => void): HTMLDivElement {
    const dashboard = document.createElement('div');
    dashboard.className = 'model-dashboard';
    dashboard.innerHTML = `
      <div class="dashboard-overlay"></div>
      <div class="dashboard-container">
        <div class="dashboard-header">
          <h2>📊 Model Analytics Dashboard</h2>
          <div class="dashboard-actions">
            <button class="dashboard-btn export-btn" id="exportDashboardJSON">
              <i class="fas fa-download"></i> Export JSON
            </button>
            <button class="dashboard-btn close-btn" id="closeDashboard">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div class="dashboard-content">
          <!-- Summary Cards -->
          <div class="dashboard-section">
            <h3>📈 Overview</h3>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                  <i class="fas fa-cubes"></i>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Total Models</div>
                  <div class="stat-value">${stats.totalModels.toLocaleString()}</div>
                </div>
              </div>

              <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);">
                  <i class="fas fa-layer-group"></i>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Element Types</div>
                  <div class="stat-value">${Object.keys(stats.elementTypes).length}</div>
                </div>
              </div>

              <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
                  <i class="fas fa-shapes"></i>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Triangles</div>
                  <div class="stat-value">${stats.totalTriangles.toLocaleString()}</div>
                </div>
              </div>

              <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                  <i class="fas fa-puzzle-piece"></i>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Fragments</div>
                  <div class="stat-value">${stats.totalFragments.toLocaleString()}</div>
                </div>
              </div>

              <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
                  <i class="fas fa-vector-square"></i>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Vertices</div>
                  <div class="stat-value">${stats.totalVertices.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Element Types Chart -->
          <div class="dashboard-section">
            <h3>🏗️ Element Distribution</h3>
            <div class="chart-container">
              <div class="charts-grid-three">
                <div class="chart-wrapper">
                  <canvas id="elementBarChart"></canvas>
                </div>
                <div class="chart-wrapper">
                  <canvas id="elementDonutChart"></canvas>
                </div>
                <div class="chart-wrapper">
                  <canvas id="triangleDistributionChart"></canvas>
                </div>
              </div>
            </div>
          </div>

          <!-- Building Storeys & Model Geometry Charts -->
          <div class="dashboard-section">
            <div class="charts-grid">
              <div class="chart-section-half">
                <h3>🏢 Building Storeys</h3>
                <div class="chart-container">
                  ${Object.keys(stats.storeyData).length > 0 ? `
                    <div class="chart-wrapper-full">
                      <canvas id="storeyChart"></canvas>
                    </div>
                  ` : `
                    <div class="no-data-message">
                      <i class="fas fa-info-circle"></i>
                      <p>No building storey data available</p>
                    </div>
                  `}
                </div>
              </div>

              <div class="chart-section-half">
                <h3>📐 Model Geometry</h3>
                <div class="chart-container">
                  ${stats.modelDetails.length > 0 ? `
                    <div class="chart-wrapper-full">
                      <canvas id="modelGeometryChart"></canvas>
                    </div>
                  ` : `
                    <div class="no-data-message">
                      <i class="fas fa-info-circle"></i>
                      <p>No model geometry data available</p>
                    </div>
                  `}
                </div>
              </div>
            </div>
          </div>

          <!-- Model Details Table -->
          <div class="dashboard-section">
            <h3>📦 Model Details</h3>
            <div class="table-container">
              ${this.createModelDetailsTable(stats.modelDetails)}
            </div>
          </div>

          <!-- Spatial Structure -->
          <div class="dashboard-section">
            <h3>🏛️ Spatial Structure</h3>
            <div class="tree-container">
              ${this.createSpatialTree(stats.spatialStructure)}
            </div>
          </div>

          <!-- Bounding Box Info -->
          <div class="dashboard-section">
            <h3>📐 Spatial Extent</h3>
            <div class="bbox-info">
              <div class="bbox-row">
                <span class="bbox-label">Center:</span>
                <span class="bbox-value">
                  X: ${stats.boundingBox.center.x.toFixed(2)}m, 
                  Y: ${stats.boundingBox.center.y.toFixed(2)}m, 
                  Z: ${stats.boundingBox.center.z.toFixed(2)}m
                </span>
              </div>
              <div class="bbox-row">
                <span class="bbox-label">Size:</span>
                <span class="bbox-value">
                  ${stats.boundingBox.size.x.toFixed(2)}m × 
                  ${stats.boundingBox.size.y.toFixed(2)}m × 
                  ${stats.boundingBox.size.z.toFixed(2)}m
                </span>
              </div>
              <div class="bbox-row">
                <span class="bbox-label">Volume:</span>
                <span class="bbox-value">
                  ${(stats.boundingBox.size.x * stats.boundingBox.size.y * stats.boundingBox.size.z).toFixed(2)}m³
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.injectStyles();

    dashboard.querySelector('#closeDashboard')?.addEventListener('click', onClose);
    dashboard.querySelector('.dashboard-overlay')?.addEventListener('click', onClose);
    dashboard.querySelector('#exportDashboardJSON')?.addEventListener('click', onExport);

    return dashboard;
  }

  private createModelDetailsTable(details: ModelDetail[]): string {
    return `
      <table class="dashboard-table">
        <thead>
          <tr>
            <th>Model Name</th>
            <th>Fragments</th>
            <th>Vertices</th>
            <th>Triangles</th>
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          ${details.map(m => `
            <tr>
              <td>${m.name}</td>
              <td>${m.fragmentCount.toLocaleString()}</td>
              <td>${m.vertexCount.toLocaleString()}</td>
              <td>${m.triangleCount.toLocaleString()}</td>
              <td>(${m.position.x.toFixed(1)}, ${m.position.y.toFixed(1)}, ${m.position.z.toFixed(1)})</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  private createSpatialTree(nodes: SpatialNode[]): string {
    return `
      <ul class="spatial-tree">
        ${nodes.map(node => `
          <li class="tree-node">
            <div class="node-header">
              <span class="node-icon">${this.getCategoryIcon(node.type)}</span>
              <span class="node-name">${node.name}</span>
              <span class="node-count">${node.count} items</span>
            </div>
            ${node.children ? `
              <ul class="node-children">
                ${node.children.map(child => `
                  <li class="child-node">
                    <span class="child-name">${child.name}</span>
                    <span class="child-count">${child.count}</span>
                  </li>
                `).join('')}
              </ul>
            ` : ''}
          </li>
        `).join('')}
      </ul>
    `;
  }

  private getCategoryIcon(category: string): string {
    switch (category) {
      case 'Structural': return '🏗️';
      case 'Architectural': return '🏠';
      case 'MEP': return '🔧';
      default: return '📦';
    }
  }

  private injectStyles(): void {
    if (document.getElementById('dashboard-styles')) return;
    const style = document.createElement('style');
    style.id = 'dashboard-styles';
    style.textContent = `
      .model-dashboard {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .dashboard-overlay {
        position: absolute;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
      }
      .dashboard-container {
        position: relative;
        width: 90%;
        max-width: 1200px;
        height: 85%;
        background: #f9fafb;
        border-radius: 20px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: dashboardFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes dashboardFadeIn {
        from { opacity: 0; transform: scale(0.95) translateY(20px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      .dashboard-header {
        padding: 20px 30px;
        background: white;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .dashboard-header h2 { margin: 0; font-size: 20px; color: #111827; font-weight: 700; }
      .dashboard-actions { display: flex; gap: 12px; }
      .dashboard-btn {
        padding: 8px 16px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
      }
      .export-btn { background: #4f46e5; color: white; }
      .export-btn:hover { background: #4338ca; }
      .close-btn { background: #f3f4f6; color: #4b5563; }
      .close-btn:hover { background: #e5e7eb; color: #111827; }
      .dashboard-content { flex: 1; overflow-y: auto; padding: 30px; display: flex; flex-direction: column; gap: 30px; }
      .dashboard-section h3 { margin: 0 0 15px 0; font-size: 16px; color: #374151; font-weight: 600; display: flex; align-items: center; gap: 10px; }
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
      .stat-card { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e5e7eb; display: flex; align-items: center; gap: 15px; transition: transform 0.2s; }
      .stat-card:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
      .stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; }
      .stat-label { font-size: 12px; color: #6b7280; font-weight: 500; }
      .stat-value { font-size: 20px; color: #111827; font-weight: 700; margin-top: 2px; }
      .chart-container { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e5e7eb; }
      .charts-grid-three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
      .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .chart-wrapper { height: 300px; position: relative; }
      .chart-wrapper-full { height: 350px; position: relative; }
      .table-container { background: white; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; }
      .dashboard-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .dashboard-table th { background: #f9fafb; padding: 12px 20px; text-align: left; color: #4b5563; font-weight: 600; border-bottom: 1px solid #e5e7eb; }
      .dashboard-table td { padding: 12px 20px; color: #111827; border-bottom: 1px solid #f3f4f6; }
      .dashboard-table tr:last-child td { border-bottom: none; }
      .tree-container { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e5e7eb; }
      .spatial-tree, .node-children { list-style: none; padding: 0; margin: 0; }
      .tree-node { margin-bottom: 15px; }
      .node-header { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #f3f4f6; border-radius: 8px; font-weight: 600; font-size: 14px; }
      .node-count { margin-left: auto; font-size: 12px; color: #6b7280; background: white; padding: 2px 8px; border-radius: 10px; }
      .node-children { padding-left: 35px; margin-top: 8px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
      .child-node { display: flex; justify-content: space-between; padding: 6px 12px; background: white; border: 1px solid #f3f4f6; border-radius: 6px; font-size: 12px; }
      .child-count { color: #4f46e5; font-weight: 600; }
      .bbox-info { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: 10px; }
      .bbox-row { display: flex; gap: 15px; font-size: 14px; }
      .bbox-label { font-weight: 600; color: #4b5563; min-width: 80px; }
      .bbox-value { color: #111827; }
      .no-data-message { height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #9ca3af; gap: 10px; }
      .no-data-message i { font-size: 30px; }
    `;
    document.head.appendChild(style);
  }
}
