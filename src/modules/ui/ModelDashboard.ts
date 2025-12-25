/**
 * MODEL DASHBOARD (The "Statistics Center")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is like a mini Power BI dashboard for your 3D models. It shows charts, 
 * numbers, and statistics about what's inside your IFC files (e.g., "How many 
 * walls do I have?" or "What is the total volume of concrete?").
 * 
 * HOW IT CONNECTS:
 * - DataManager: Gets the raw numbers from the 3D model.
 * - ChartManager: Turns those numbers into visual graphs and pies.
 * - UIManager: Handles the buttons and layout of the dashboard panel.
 * --------------------------------------------------------------------------------
 */

import * as OBC from '@thatopen/components';
import { DashboardDataManager, ModelStatistics } from './dashboard/DataManager';
import { DashboardChartManager } from './dashboard/ChartManager';
import { DashboardUIManager } from './dashboard/UIManager';

export class ModelDashboard {
  private dashboardElement: HTMLDivElement | null = null;
  private dataManager: DashboardDataManager;
  private chartManager: DashboardChartManager;
  private uiManager: DashboardUIManager;

  constructor() {
    this.dataManager = new DashboardDataManager();
    this.chartManager = new DashboardChartManager();
    this.uiManager = new DashboardUIManager();
  }

  /**
   * Shows the dashboard with model statistics
   */
  public async show(
    models: Map<string, any>, 
    fragmentsManager: OBC.FragmentsManager, 
    storeyData?: { [storeyName: string]: { [category: string]: number } },
    ifcLoader?: any
  ): Promise<void> {
    console.log('📊 Dashboard.show() called');
    
    // Close existing dashboard if any
    this.close();

    // Gather statistics
    const stats = await this.dataManager.gatherStatistics(models, fragmentsManager, storeyData, ifcLoader);

    // Create dashboard UI
    this.dashboardElement = this.uiManager.createDashboardUI(
      stats, 
      () => this.close(),
      () => this.exportJSON(stats)
    );
    
    document.body.appendChild(this.dashboardElement);

    // Initialize Chart.js charts after DOM is ready
    setTimeout(() => {
      this.chartManager.initializeCharts(stats);
    }, 0);

    console.log('📊 Model dashboard opened');
  }

  /**
   * Closes the dashboard
   */
  public close(): void {
    this.chartManager.destroyCharts();
    
    if (this.dashboardElement) {
      this.dashboardElement.remove();
      this.dashboardElement = null;
      console.log('✅ Model dashboard closed');
    }
  }

  /**
   * Exports dashboard data as JSON
   */
  private exportJSON(stats: ModelStatistics): void {
    const json = JSON.stringify(stats, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `model-analytics-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('📥 Dashboard data exported as JSON');
  }
}
