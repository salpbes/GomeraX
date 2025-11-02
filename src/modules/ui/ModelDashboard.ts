/**
 * Model Dashboard
 * Professional data visualization dashboard for loaded IFC models
 * Provides insights, statistics, and charts similar to Power BI
 */

import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { Chart, DoughnutController, ArcElement, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement } from 'chart.js';

export interface ModelStatistics {
  totalModels: number;
  totalFragments: number;
  totalVertices: number;
  totalTriangles: number;
  modelDetails: ModelDetail[];
  elementTypes: { [key: string]: number };
  spatialStructure: SpatialNode[];
  storeyData: { [storeyName: string]: { [category: string]: number } };
  boundingBox: {
    min: THREE.Vector3;
    max: THREE.Vector3;
    size: THREE.Vector3;
    center: THREE.Vector3;
  };
  memoryEstimate: {
    geometryMB: number;
    totalMB: number;
  };
}

export interface ModelDetail {
  uuid: string;
  name: string;
  fragmentCount: number;
  vertexCount: number;
  triangleCount: number;
  boundingBox: {
    min: THREE.Vector3;
    max: THREE.Vector3;
    size: THREE.Vector3;
  };
  position: THREE.Vector3;
  ifcMetadata?: {
    ifcType?: string;
    description?: string;
    schema?: string;
  };
}

export interface SpatialNode {
  type: string;
  name: string;
  count: number;
  children?: SpatialNode[];
}

export class ModelDashboard {
  private dashboardElement: HTMLDivElement | null = null;
  private charts: Chart[] = [];

  constructor() {
    // Register Chart.js components
    Chart.register(DoughnutController, ArcElement, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement);
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
    console.log('📊 Dashboard.show() called with:');
    console.log('  - Models count:', models.size);
    console.log('  - Storey data provided:', storeyData);
    console.log('  - Storey data keys:', storeyData ? Object.keys(storeyData) : 'undefined');
    
    // Close existing dashboard if any
    this.close();

    // Gather statistics
    const stats = await this.gatherStatistics(models, fragmentsManager, storeyData, ifcLoader);

    // Create dashboard UI
    this.dashboardElement = this.createDashboardUI(stats);
    document.body.appendChild(this.dashboardElement);

    console.log('📊 Model dashboard opened');
  }

  /**
   * Closes the dashboard
   */
  public close(): void {
    // Destroy all Chart.js instances
    this.charts.forEach(chart => chart.destroy());
    this.charts = [];
    
    if (this.dashboardElement) {
      this.dashboardElement.remove();
      this.dashboardElement = null;
      console.log('✅ Model dashboard closed');
    }
  }

  /**
   * Gathers comprehensive statistics from loaded models
   */
  private async gatherStatistics(
    models: Map<string, any>, 
    fragmentsManager: OBC.FragmentsManager, 
    storeyData?: { [storeyName: string]: { [category: string]: number } },
    ifcLoader?: any
  ): Promise<ModelStatistics> {
    const modelDetails: ModelDetail[] = [];
    let totalFragments = 0;
    let totalVertices = 0;
    let totalTriangles = 0;
    const elementTypes: { [key: string]: number } = {};
    
    // Calculate overall bounding box
    const overallMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    const overallMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    // Process each model
    for (const [uuid, model] of models) {
      let modelVertices = 0;
      let modelTriangles = 0;
      let modelFragments = 0;

      // Try to get metadata from IFC loader first (more accurate)
      if (ifcLoader) {
        const metadata = ifcLoader.getModelMetadata(uuid);
        if (metadata) {
          modelFragments = metadata.meshCount;
          modelVertices = metadata.vertexCount;
          totalFragments += modelFragments;
          totalVertices += modelVertices;
          // Estimate triangles from vertices (assuming mostly triangulated meshes)
          modelTriangles = Math.floor(modelVertices / 3);
          totalTriangles += modelTriangles;
        }
      }

      // Fallback: Get model meshes directly if metadata not available
      if (modelFragments === 0 && model.children) {
        for (const child of model.children) {
          if (child.geometry) {
            modelFragments++;
            const geometry = child.geometry;
            const positionAttr = geometry.attributes?.position;
            if (positionAttr) {
              const vertCount = positionAttr.count;
              modelVertices += vertCount;
              totalVertices += vertCount;
              
              // Estimate triangles
              if (geometry.index) {
                const triCount = geometry.index.count / 3;
                modelTriangles += triCount;
                totalTriangles += triCount;
              } else {
                const triCount = vertCount / 3;
                modelTriangles += triCount;
                totalTriangles += triCount;
              }
            }
          }
        }
      }

      totalFragments += modelFragments;

      // Extract real IFC element types from the model
      try {
        const categories = await model.getCategories();
        console.log(`📊 Categories found for model:`, categories);
        
        // Filter out non-element categories (material, property sets, etc.)
        const spatialCategories = ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE'];
        const nonElementCategories = ['IFCMATERIAL', 'IFCMATERIALLAYER', 'IFCMATERIALLAYERSET', 'IFCMATERIALLAYERSETUSAGE', 
                                       'IFCPROPERTYSET', 'IFCPROPERTYSINGLEVALUE', 'IFCELEMENTQUANTITY', 'IFCQUANTITYAREA'];
        const elementCategories = categories.filter((cat: string) => 
          !spatialCategories.includes(cat) && !nonElementCategories.includes(cat)
        );
        
        // Get items for all element categories at once
        const categoryRegexps = elementCategories.map((cat: string) => new RegExp(`^${cat}$`));
        const itemsByCategory = await model.getItemsOfCategories(categoryRegexps);
        
        // Count items per category
        for (const [category, localIds] of Object.entries(itemsByCategory)) {
          const ids = localIds as number[];
          const count = ids.length;
          
          if (count > 0) {
            elementTypes[category] = (elementTypes[category] || 0) + count;
          }
        }
        
        console.log(`📊 Element types extracted:`, elementTypes);
      } catch (error) {
        console.warn('⚠️ Could not extract IFC categories:', error);
        // Fallback to estimated data
        if (modelFragments > 0) {
          elementTypes['IFCWALL'] = (elementTypes['IFCWALL'] || 0) + Math.floor(modelFragments * 0.3);
          elementTypes['IFCSLAB'] = (elementTypes['IFCSLAB'] || 0) + Math.floor(modelFragments * 0.2);
          elementTypes['IFCBEAM'] = (elementTypes['IFCBEAM'] || 0) + Math.floor(modelFragments * 0.15);
        }
      }

      // Calculate model bounding box
      const modelMin = new THREE.Vector3();
      const modelMax = new THREE.Vector3();
      
      if (model.boundingBox) {
        modelMin.copy(model.boundingBox.min);
        modelMax.copy(model.boundingBox.max);
      } else if (model.position) {
        // Use position as fallback
        modelMin.copy(model.position);
        modelMax.copy(model.position);
        
        // Try to compute from children geometries
        if (model.children) {
          for (const child of model.children) {
            if (child.geometry && child.geometry.boundingBox) {
              if (!child.geometry.boundingBox) {
                child.geometry.computeBoundingBox();
              }
              if (child.geometry.boundingBox) {
                modelMin.min(child.geometry.boundingBox.min);
                modelMax.max(child.geometry.boundingBox.max);
              }
            }
          }
        }
      } else {
        // Default to origin
        modelMin.set(0, 0, 0);
        modelMax.set(1, 1, 1);
      }

      // Update overall bounding box
      overallMin.min(modelMin);
      overallMax.max(modelMax);

      const modelSize = new THREE.Vector3().subVectors(modelMax, modelMin);

      // Get model name from IFC loader metadata if available
      let modelName = model.name || model.uuid?.substring(0, 8) || 'Unnamed Model';
      if (ifcLoader) {
        const metadata = ifcLoader.getModelMetadata(uuid);
        if (metadata && metadata.name) {
          modelName = metadata.name;
        }
      }

      modelDetails.push({
        uuid,
        name: modelName,
        fragmentCount: modelFragments,
        vertexCount: modelVertices,
        triangleCount: Math.floor(modelTriangles),
        boundingBox: {
          min: modelMin,
          max: modelMax,
          size: modelSize
        },
        position: model.position || new THREE.Vector3(),
        ifcMetadata: {
          ifcType: 'IFC Model',
          description: model.name || '',
          schema: 'IFC4'
        }
      });
    }

    const overallSize = new THREE.Vector3().subVectors(overallMax, overallMin);
    const overallCenter = new THREE.Vector3().addVectors(overallMin, overallMax).multiplyScalar(0.5);

    // Estimate memory usage (rough approximation)
    const geometryMB = (totalVertices * 12 * 3) / (1024 * 1024); // 12 bytes per float, 3 floats per vertex (position)
    const totalMB = geometryMB * 2; // Rough estimate including normals, uvs, etc.

    // Build spatial structure (simplified)
    const spatialStructure = this.buildSpatialStructure(elementTypes);

    // Use provided storey data or gather it
    console.log('📊 Received storeyData:', storeyData);
    console.log('📊 StoreyData type:', typeof storeyData);
    console.log('📊 StoreyData is undefined?', storeyData === undefined);
    console.log('📊 StoreyData is empty object?', storeyData && Object.keys(storeyData).length === 0);
    
    // Check if storeyData is provided and has content
    const hasStoreyData = storeyData && Object.keys(storeyData).length > 0;
    const finalStoreyData = hasStoreyData ? storeyData : await this.gatherStoreyData(models);
    
    console.log('📊 Final storeyData:', finalStoreyData);
    console.log('📊 Final storeyData keys:', Object.keys(finalStoreyData));

    console.log('📊 Dashboard statistics gathered:', {
      totalModels: models.size,
      totalFragments,
      elementTypesCount: Object.keys(elementTypes).length,
      elementTypes,
      storeyData: finalStoreyData
    });

    return {
      totalModels: models.size,
      totalFragments,
      totalVertices,
      totalTriangles: Math.floor(totalTriangles),
      modelDetails,
      elementTypes,
      spatialStructure,
      storeyData: finalStoreyData,
      boundingBox: {
        min: overallMin,
        max: overallMax,
        size: overallSize,
        center: overallCenter
      },
      memoryEstimate: {
        geometryMB: Math.round(geometryMB * 100) / 100,
        totalMB: Math.round(totalMB * 100) / 100
      }
    };
  }

  /**
   * Gathers element counts per building storey
   */
  private async gatherStoreyData(models: Map<string, any>): Promise<{ [storeyName: string]: { [category: string]: number } }> {
    const storeyData: { [storeyName: string]: { [category: string]: number } } = {};

    for (const [, model] of models) {
      try {
        const categories = await model.getCategories();
        
        // Get all building storeys using getItemsOfCategories
        const storeyRegexp = [new RegExp('^IFCBUILDINGSTOREY$')];
        const storeyItems = await model.getItemsOfCategories(storeyRegexp);
        const storeyIds = (storeyItems['IFCBUILDINGSTOREY'] || []) as number[];
        
        if (storeyIds.length === 0) {
          console.log('📊 No storeys found');
          continue;
        }

        console.log(`📊 Found ${storeyIds.length} storeys:`, storeyIds);

        // Get storey names
        const storeysData = await model.getItemsData(storeyIds, {
          attributesDefault: false,
          attributes: ['Name', 'LongName']
        });

        // Filter out spatial and non-element categories
        const spatialCategories = ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE'];
        const nonElementCategories = ['IFCMATERIAL', 'IFCMATERIALLAYER', 'IFCMATERIALLAYERSET', 'IFCMATERIALLAYERSETUSAGE', 
                                       'IFCPROPERTYSET', 'IFCPROPERTYSINGLEVALUE', 'IFCELEMENTQUANTITY', 'IFCQUANTITYAREA'];
        const elementCategories = categories.filter((cat: string) => 
          !spatialCategories.includes(cat) && !nonElementCategories.includes(cat)
        );

        // Get all element items
        const categoryRegexps = elementCategories.map((cat: string) => new RegExp(`^${cat}$`));
        const itemsByCategory = await model.getItemsOfCategories(categoryRegexps);

        // For each storey
        for (let i = 0; i < storeyIds.length; i++) {
          const storeyId = storeyIds[i];
          const storeyDataItem = storeysData[i];
          const storeyName = storeyDataItem?.Name?.value || storeyDataItem?.LongName?.value || `Storey ${i + 1}`;

          // Initialize storey data
          if (!storeyData[storeyName]) {
            storeyData[storeyName] = {};
          }

          console.log(`📊 Processing storey: "${storeyName}" (ID: ${storeyId})`);

          // For each element category
          for (const [category, allLocalIds] of Object.entries(itemsByCategory)) {
            const ids = allLocalIds as number[];
            if (ids.length === 0) continue;

            try {
              // Get items data with ContainedInStructure relation (same as PropertiesPanel)
              const itemsData = await model.getItemsData(ids, {
                attributesDefault: false,
                attributes: [],
                relations: {
                  ContainedInStructure: { attributes: false, relations: false }
                }
              });

              // Count items in this storey
              let count = 0;
              for (let j = 0; j < itemsData.length; j++) {
                const data = itemsData[j];
                
                // Check if this item is contained in the current storey
                if (data.ContainedInStructure && Array.isArray(data.ContainedInStructure)) {
                  const isInStorey = data.ContainedInStructure.some((rel: any) => {
                    const relLocalId = rel._localId?.value || rel.localId;
                    return relLocalId === storeyId;
                  });
                  
                  if (isInStorey) {
                    count++;
                  }
                }
              }

              if (count > 0) {
                storeyData[storeyName][category] = (storeyData[storeyName][category] || 0) + count;
              }
            } catch (error) {
              console.warn(`⚠️ Could not get items for category ${category}:`, error);
            }
          }

          console.log(`📊 Storey "${storeyName}" counts:`, storeyData[storeyName]);
        }
      } catch (error) {
        console.warn('⚠️ Could not extract storey data:', error);
      }
    }

    console.log('📊 Final storey data:', storeyData);
    return storeyData;
  }

  /**
   * Builds a simplified spatial structure from element types
   */
  private buildSpatialStructure(elementTypes: { [key: string]: number }): SpatialNode[] {
    const structure: SpatialNode[] = [];
    
    // Group by major categories
    const categories: { [key: string]: { [key: string]: number } } = {
      'Structural': {},
      'Architectural': {},
      'MEP': {},
      'Other': {}
    };

    for (const [type, count] of Object.entries(elementTypes)) {
      const typeUpper = type.toUpperCase();
      if (typeUpper.includes('WALL') || typeUpper.includes('COLUMN') || typeUpper.includes('BEAM') || 
          typeUpper.includes('SLAB') || typeUpper.includes('FOOTING') || typeUpper.includes('REBAR')) {
        categories['Structural'][type] = count;
      } else if (typeUpper.includes('DOOR') || typeUpper.includes('WINDOW') || typeUpper.includes('STAIR') || 
                 typeUpper.includes('ROOF') || typeUpper.includes('COVERING')) {
        categories['Architectural'][type] = count;
      } else if (typeUpper.includes('PIPE') || typeUpper.includes('DUCT') || typeUpper.includes('CABLE') || 
                 typeUpper.includes('OUTLET') || typeUpper.includes('EQUIPMENT')) {
        categories['MEP'][type] = count;
      } else {
        categories['Other'][type] = count;
      }
    }

    // Build tree structure
    for (const [category, types] of Object.entries(categories)) {
      if (Object.keys(types).length > 0) {
        const totalCount = Object.values(types).reduce((sum, count) => sum + count, 0);
        const children = Object.entries(types).map(([type, count]) => ({
          type,
          name: type,
          count
        }));

        structure.push({
          type: category,
          name: category,
          count: totalCount,
          children
        });
      }
    }

    return structure;
  }

  /**
   * Creates the dashboard UI
   */
  private createDashboardUI(stats: ModelStatistics): HTMLDivElement {
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

          <!-- Building Storeys & Model Geometry Charts (Side by Side) -->
          <div class="dashboard-section">
            <div class="charts-grid">
              <!-- Building Storeys Chart -->
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
                      <p>No building storey data available in this model</p>
                    </div>
                  `}
                </div>
              </div>

              <!-- Model Geometry Chart -->
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

    // Add styles
    this.injectStyles();

    // Add event listeners
    const closeBtn = dashboard.querySelector('#closeDashboard');
    const exportBtn = dashboard.querySelector('#exportDashboardJSON');
    const overlay = dashboard.querySelector('.dashboard-overlay');

    closeBtn?.addEventListener('click', () => this.close());
    overlay?.addEventListener('click', () => this.close());
    exportBtn?.addEventListener('click', () => this.exportJSON(stats));

    // Initialize Chart.js charts after DOM is ready
    setTimeout(() => this.initializeCharts(stats), 0);

    return dashboard;
  }

  /**
   * Initializes Chart.js charts
   */
  private initializeCharts(stats: ModelStatistics): void {
    // Prepare data
    const sortedTypes = Object.entries(stats.elementTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8); // Top 8 for better visibility

    const labels = sortedTypes.map(([type]) => this.formatIfcType(type));
    const data = sortedTypes.map(([, count]) => count);
    // Distinct, vibrant colors for element types - easily differentiable
    const colors = [
      'rgba(239, 68, 68, 0.8)',    // Red
      'rgba(59, 130, 246, 0.8)',   // Blue
      'rgba(34, 197, 94, 0.8)',    // Green
      'rgba(251, 146, 60, 0.8)',   // Orange
      'rgba(168, 85, 247, 0.8)',   // Purple
      'rgba(236, 72, 153, 0.8)',   // Pink
      'rgba(14, 165, 233, 0.8)',   // Cyan
      'rgba(250, 204, 21, 0.8)',   // Yellow
    ];

    // Doughnut Chart with center text
    const donutCanvas = document.getElementById('elementDonutChart') as HTMLCanvasElement;
    if (donutCanvas) {
      const totalElements = data.reduce((sum, val) => sum + val, 0);
      
      const donutChart = new Chart(donutCanvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: '#ffffff',
            hoverOffset: 10,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              align: 'center',
              labels: {
                padding: 10,
                font: {
                  size: 9,
                  family: "'Inter', sans-serif"
                },
                color: '#374151',
                usePointStyle: true,
                pointStyle: 'circle',
                boxWidth: 8,
                boxHeight: 8
              }
            },
            tooltip: {
              backgroundColor: 'rgba(31, 41, 55, 0.95)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              padding: 12,
              cornerRadius: 8,
              displayColors: true,
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0) as number;
                  const percentage = ((value / total) * 100).toFixed(1);
                  return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                }
              }
            }
          },
          animation: {
            animateRotate: true,
            animateScale: true,
            duration: 1000,
            easing: 'easeInOutQuart'
          }
        },
        plugins: [{
          id: 'centerText',
          beforeDraw: (chart) => {
            const { ctx, width, height } = chart;
            ctx.save();
            
            // Get the actual chart area (excluding legend)
            const chartArea = chart.chartArea;
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2;
            
            ctx.font = 'bold 24px Inter, sans-serif';
            ctx.fillStyle = '#1f2937';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(totalElements.toLocaleString(), centerX, centerY - 8);
            
            ctx.font = '12px Inter, sans-serif';
            ctx.fillStyle = '#6b7280';
            ctx.fillText('Total Elements', centerX, centerY + 16);
            ctx.restore();
          }
        }]
      });
      this.charts.push(donutChart);
    }

    // Models Doughnut Chart (elements per model)
    const modelsCanvas = document.getElementById('elementBarChart') as HTMLCanvasElement;
    if (modelsCanvas) {
      // Get element counts per model
      const modelNames: string[] = [];
      const modelElementCounts: number[] = [];
      // Distinct, easily differentiable colors for models
      const modelColors = [
        'rgba(59, 130, 246, 0.8)',   // Bright Blue
        'rgba(239, 68, 68, 0.8)',    // Bright Red
        'rgba(34, 197, 94, 0.8)',    // Bright Green
        'rgba(251, 146, 60, 0.8)',   // Bright Orange
        'rgba(168, 85, 247, 0.8)',   // Bright Purple
        'rgba(236, 72, 153, 0.8)',   // Bright Pink
        'rgba(14, 165, 233, 0.8)',   // Sky Blue
        'rgba(132, 204, 22, 0.8)',   // Lime Green
      ];

      // If single model, show total
      if (stats.modelDetails.length === 1) {
        const totalElements = Object.values(stats.elementTypes).reduce((sum, count) => sum + count, 0);
        modelNames.push(stats.modelDetails[0].name || 'Model');
        modelElementCounts.push(totalElements);
      } else {
        // Multiple models - distribute elements proportionally by fragments
        const totalFragments = stats.modelDetails.reduce((sum, m) => sum + m.fragmentCount, 0);
        const totalElements = Object.values(stats.elementTypes).reduce((sum, count) => sum + count, 0);
        
        for (const modelDetail of stats.modelDetails) {
          modelNames.push(modelDetail.name || 'Unnamed Model');
          const proportion = modelDetail.fragmentCount / totalFragments;
          modelElementCounts.push(Math.round(totalElements * proportion));
        }
      }

      const modelDonutChart = new Chart(modelsCanvas, {
        type: 'doughnut',
        data: {
          labels: modelNames,
          datasets: [{
            data: modelElementCounts,
            backgroundColor: modelColors,
            borderWidth: 2,
            borderColor: '#ffffff',
            hoverOffset: 10,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              align: 'center',
              labels: {
                padding: 10,
                font: {
                  size: 9,
                  family: "'Inter', sans-serif"
                },
                color: '#374151',
                usePointStyle: true,
                pointStyle: 'circle',
                boxWidth: 8,
                boxHeight: 8
              }
            },
            tooltip: {
              backgroundColor: 'rgba(31, 41, 55, 0.95)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              padding: 12,
              cornerRadius: 8,
              displayColors: true,
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0) as number;
                  const percentage = ((value / total) * 100).toFixed(1);
                  return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                }
              }
            }
          },
          animation: {
            animateRotate: true,
            animateScale: true,
            duration: 1000,
            easing: 'easeInOutQuart'
          }
        },
        plugins: [{
          id: 'centerText',
          beforeDraw: (chart) => {
            const { ctx, width, height } = chart;
            ctx.save();
            
            // Get the actual chart area (excluding legend)
            const chartArea = chart.chartArea;
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2;
            
            ctx.font = 'bold 24px Inter, sans-serif';
            ctx.fillStyle = '#1f2937';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(stats.totalModels.toString(), centerX, centerY - 8);
            
            ctx.font = '12px Inter, sans-serif';
            ctx.fillStyle = '#6b7280';
            ctx.fillText(stats.totalModels === 1 ? 'Model' : 'Models', centerX, centerY + 16);
            ctx.restore();
          }
        }]
      });
      this.charts.push(modelDonutChart);
    }

    // Triangle Distribution by Model Doughnut Chart
    const triangleCanvas = document.getElementById('triangleDistributionChart') as HTMLCanvasElement;
    if (triangleCanvas) {
      const triangleNames: string[] = [];
      const triangleCounts: number[] = [];
      const triangleColors = [
        'rgba(255, 99, 132, 0.8)',
        'rgba(255, 159, 64, 0.8)',
        'rgba(255, 205, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(153, 102, 255, 0.8)',
        'rgba(201, 203, 207, 0.8)',
        'rgba(255, 99, 255, 0.8)',
      ];

      for (const modelDetail of stats.modelDetails) {
        triangleNames.push(modelDetail.name || 'Unnamed Model');
        triangleCounts.push(modelDetail.triangleCount);
      }

      const totalTriangles = triangleCounts.reduce((sum, val) => sum + val, 0);

      const triangleDonutChart = new Chart(triangleCanvas, {
        type: 'doughnut',
        data: {
          labels: triangleNames,
          datasets: [{
            data: triangleCounts,
            backgroundColor: triangleColors,
            borderWidth: 2,
            borderColor: '#ffffff',
            hoverOffset: 10,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              align: 'center',
              labels: {
                padding: 10,
                font: {
                  size: 9,
                  family: "'Inter', sans-serif"
                },
                color: '#374151',
                usePointStyle: true,
                pointStyle: 'circle',
                boxWidth: 8,
                boxHeight: 8
              }
            },
            tooltip: {
              backgroundColor: 'rgba(31, 41, 55, 0.95)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              padding: 12,
              cornerRadius: 8,
              displayColors: true,
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0) as number;
                  const percentage = ((value / total) * 100).toFixed(1);
                  return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                }
              }
            }
          },
          animation: {
            animateRotate: true,
            animateScale: true,
            duration: 1000,
            easing: 'easeInOutQuart'
          }
        },
        plugins: [{
          id: 'centerText',
          beforeDraw: (chart) => {
            const { ctx, width, height } = chart;
            ctx.save();
            
            // Get the actual chart area (excluding legend)
            const chartArea = chart.chartArea;
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2;
            
            ctx.font = 'bold 24px Inter, sans-serif';
            ctx.fillStyle = '#1f2937';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(totalTriangles.toLocaleString(), centerX, centerY - 8);
            
            ctx.font = '12px Inter, sans-serif';
            ctx.fillStyle = '#6b7280';
            ctx.fillText('Total Triangles', centerX, centerY + 16);
            ctx.restore();
          }
        }]
      });
      this.charts.push(triangleDonutChart);
    }

    // Storey Stacked Bar Chart
    const storeyCanvas = document.getElementById('storeyChart') as HTMLCanvasElement;
    if (storeyCanvas && Object.keys(stats.storeyData).length > 0) {
      // Prepare storey data
      const storeyNames = Object.keys(stats.storeyData);
      const allCategories = new Set<string>();
      
      // Collect all unique categories across all storeys
      storeyNames.forEach(storey => {
        Object.keys(stats.storeyData[storey]).forEach(cat => allCategories.add(cat));
      });
      
      const categories = Array.from(allCategories);
      const categoryColors: { [key: string]: string } = {};
      const chartColors = [
        'rgba(102, 126, 234, 0.8)',
        'rgba(240, 147, 251, 0.8)',
        'rgba(79, 172, 254, 0.8)',
        'rgba(67, 233, 123, 0.8)',
        'rgba(250, 112, 154, 0.8)',
        'rgba(48, 207, 208, 0.8)',
        'rgba(168, 237, 234, 0.8)',
        'rgba(255, 154, 158, 0.8)',
      ];
      
      // Assign colors to categories
      categories.forEach((cat, index) => {
        categoryColors[cat] = chartColors[index % chartColors.length];
      });
      
      // Create datasets (one per category)
      const datasets = categories.map(category => ({
        label: this.formatIfcType(category),
        data: storeyNames.map(storey => stats.storeyData[storey][category] || 0),
        backgroundColor: categoryColors[category],
        borderRadius: 4,
        borderSkipped: false
      }));

      const storeyChart = new Chart(storeyCanvas, {
        type: 'bar',
        data: {
          labels: storeyNames,
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 8,
                font: {
                  size: 9,
                  family: "'Inter', sans-serif"
                },
                color: '#374151',
                usePointStyle: true,
                pointStyle: 'rect',
                boxWidth: 12,
                boxHeight: 12
              },
              maxHeight: 80
            },
            tooltip: {
              backgroundColor: 'rgba(31, 41, 55, 0.95)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              padding: 12,
              cornerRadius: 8,
              displayColors: true,
              callbacks: {
                label: (context) => {
                  const label = context.dataset.label || '';
                  const value = context.parsed.y || 0;
                  return `${label}: ${value.toLocaleString()}`;
                }
              }
            }
          },
          scales: {
            x: {
              stacked: true,
              grid: {
                display: false
              },
              ticks: {
                color: '#374151',
                font: {
                  size: 10,
                  family: "'Inter', sans-serif"
                }
              }
            },
            y: {
              stacked: true,
              beginAtZero: true,
              grid: {
                color: 'rgba(229, 231, 235, 0.5)'
              },
              ticks: {
                color: '#6b7280',
                font: {
                  size: 10,
                  family: "'Inter', sans-serif"
                },
                callback: function(value) {
                  return typeof value === 'number' ? value.toLocaleString() : value;
                }
              }
            }
          },
          animation: {
            duration: 1000,
            easing: 'easeInOutQuart'
          }
        }
      });
      this.charts.push(storeyChart);
    }

    // Model Geometry Chart (Fragments & Vertices per model)
    const geometryCanvas = document.getElementById('modelGeometryChart') as HTMLCanvasElement;
    if (geometryCanvas && stats.modelDetails.length > 0) {
      const modelNames = stats.modelDetails.map(m => m.name || 'Unknown');
      const fragmentCounts = stats.modelDetails.map(m => m.fragmentCount);
      const vertexCounts = stats.modelDetails.map(m => m.vertexCount);
      
      const geometryChart = new Chart(geometryCanvas, {
        type: 'bar',
        data: {
          labels: modelNames,
          datasets: [
            {
              label: 'Fragments (Meshes)',
              data: fragmentCounts,
              backgroundColor: 'rgba(102, 126, 234, 0.8)',
              borderColor: 'rgba(102, 126, 234, 1)',
              borderWidth: 2,
              borderRadius: 6,
              yAxisID: 'y'
            },
            {
              label: 'Vertices',
              data: vertexCounts,
              backgroundColor: 'rgba(67, 233, 123, 0.8)',
              borderColor: 'rgba(67, 233, 123, 1)',
              borderWidth: 2,
              borderRadius: 6,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                padding: 15,
                font: {
                  size: 12,
                  family: "'Inter', sans-serif"
                },
                color: '#374151',
                usePointStyle: true,
                pointStyle: 'circle'
              }
            },
            tooltip: {
              backgroundColor: 'rgba(31, 41, 55, 0.95)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              padding: 12,
              cornerRadius: 8,
              displayColors: true,
              callbacks: {
                label: (context) => {
                  const label = context.dataset.label || '';
                  const value = context.parsed.y || 0;
                  return `${label}: ${value.toLocaleString()}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                display: false
              },
              ticks: {
                color: '#6b7280',
                font: {
                  size: 11,
                  family: "'Inter', sans-serif"
                }
              }
            },
            y: {
              type: 'linear',
              position: 'left',
              beginAtZero: true,
              grid: {
                color: 'rgba(229, 231, 235, 0.5)'
              },
              ticks: {
                color: '#6b7280',
                font: {
                  size: 11,
                  family: "'Inter', sans-serif"
                },
                callback: function(value) {
                  return typeof value === 'number' ? value.toLocaleString() : value;
                }
              },
              title: {
                display: true,
                text: 'Fragments',
                color: '#374151',
                font: {
                  size: 12,
                  weight: 'bold',
                  family: "'Inter', sans-serif"
                }
              }
            },
            y1: {
              type: 'linear',
              position: 'right',
              beginAtZero: true,
              grid: {
                drawOnChartArea: false
              },
              ticks: {
                color: '#6b7280',
                font: {
                  size: 11,
                  family: "'Inter', sans-serif"
                },
                callback: function(value) {
                  return typeof value === 'number' ? value.toLocaleString() : value;
                }
              },
              title: {
                display: true,
                text: 'Vertices',
                color: '#374151',
                font: {
                  size: 12,
                  weight: 'bold',
                  family: "'Inter', sans-serif"
                }
              }
            }
          },
          animation: {
            duration: 1000,
            easing: 'easeInOutQuart'
          }
        }
      });
      this.charts.push(geometryChart);
    }
  }

  /**
   * Formats IFC type names for better readability
   */
  private formatIfcType(type: string): string {
    // Remove IFC prefix and format
    const cleaned = type.replace(/^Ifc/i, '');
    // Insert space before capital letters
    return cleaned
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Creates a table of model details
   */
  private createModelDetailsTable(models: ModelDetail[]): string {
    const rows = models.map((model, index) => `
      <tr>
        <td>${index + 1}</td>
        <td class="table-cell-name">${model.name}</td>
        <td>${model.fragmentCount.toLocaleString()}</td>
        <td>${model.vertexCount.toLocaleString()}</td>
        <td>${model.triangleCount.toLocaleString()}</td>
        <td>${model.boundingBox.size.x.toFixed(1)}×${model.boundingBox.size.y.toFixed(1)}×${model.boundingBox.size.z.toFixed(1)}m</td>
      </tr>
    `).join('');

    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Model Name</th>
            <th>Fragments</th>
            <th>Vertices</th>
            <th>Triangles</th>
            <th>Size (m)</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  /**
   * Creates a tree view of spatial structure
   */
  private createSpatialTree(structure: SpatialNode[]): string {
    const createNode = (node: SpatialNode, level: number = 0): string => {
      const indent = level * 20;
      const hasChildren = node.children && node.children.length > 0;
      
      let html = `
        <div class="tree-node" style="margin-left: ${indent}px;">
          <div class="tree-node-header">
            ${hasChildren ? '<i class="fas fa-folder"></i>' : '<i class="fas fa-file"></i>'}
            <span class="tree-node-name">${node.name}</span>
            <span class="tree-node-count">${node.count.toLocaleString()}</span>
          </div>
      `;

      if (hasChildren) {
        html += '<div class="tree-node-children">';
        for (const child of node.children!) {
          html += createNode(child, level + 1);
        }
        html += '</div>';
      }

      html += '</div>';
      return html;
    };

    return structure.map(node => createNode(node)).join('');
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

  /**
   * Injects dashboard styles
   */
  private injectStyles(): void {
    if (document.getElementById('model-dashboard-styles')) return;

    const style = document.createElement('style');
    style.id = 'model-dashboard-styles';
    style.textContent = `
      .model-dashboard {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      }

      .dashboard-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        animation: fadeIn 0.3s ease-out;
      }

      .dashboard-container {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 1200px;
        max-height: 90vh;
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        animation: slideIn 0.3s ease-out;
      }

      .dashboard-header {
        padding: 20px 24px;
        border-bottom: 2px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 12px 12px 0 0;
      }

      .dashboard-header h2 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
      }

      .dashboard-actions {
        display: flex;
        gap: 8px;
      }

      .dashboard-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .export-btn {
        background: rgba(255, 255, 255, 0.2);
        color: white;
        backdrop-filter: blur(10px);
      }

      .export-btn:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: translateY(-1px);
      }

      .close-btn {
        background: rgba(255, 255, 255, 0.2);
        color: white;
        backdrop-filter: blur(10px);
      }

      .close-btn:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: translateY(-1px);
      }

      .dashboard-content {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
      }

      .dashboard-section {
        margin-bottom: 32px;
      }

      .dashboard-section h3 {
        margin: 0 0 16px 0;
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
      }

      .stat-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        display: flex;
        gap: 12px;
        align-items: center;
        transition: all 0.2s;
      }

      .stat-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .stat-icon {
        width: 48px;
        height: 48px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 20px;
      }

      .stat-content {
        flex: 1;
      }

      .stat-label {
        font-size: 12px;
        color: #6b7280;
        margin-bottom: 4px;
      }

      .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: #1f2937;
      }

      .chart-container {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 20px;
      }

      .bar-chart {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .chart-bar {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .chart-label {
        min-width: 150px;
        font-size: 13px;
        color: #374151;
        font-weight: 500;
      }

      .chart-bar-container {
        flex: 1;
        position: relative;
        height: 32px;
        background: #f3f4f6;
        border-radius: 4px;
        overflow: hidden;
      }

      .chart-bar-fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        transition: width 0.5s ease-out;
      }

      .chart-bar-value {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 12px;
        font-weight: 600;
        color: #1f2937;
      }

      /* Chart.js Styles */
      .charts-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 32px;
        align-items: center;
      }

      .charts-grid-three {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 24px;
        align-items: center;
      }

      .chart-wrapper {
        position: relative;
        height: 350px;
        background: white;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .chart-wrapper canvas {
        max-height: 100%;
        max-width: 100%;
      }

      .chart-wrapper-full {
        position: relative;
        height: 500px;
        background: white;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }

      .chart-wrapper-full canvas {
        max-height: 100%;
        width: 100% !important;
        height: 100% !important;
      }

      .chart-section-half {
        flex: 1;
        min-width: 0;
      }

      .chart-section-half h3 {
        margin: 0 0 16px 0;
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      @media (max-width: 1200px) {
        .charts-grid {
          grid-template-columns: 1fr;
          gap: 24px;
        }

        .charts-grid-three {
          grid-template-columns: 1fr;
          gap: 24px;
        }
        
        .chart-wrapper {
          height: 300px;
        }
      }

      .table-container {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        overflow: hidden;
      }

      .data-table {
        width: 100%;
        border-collapse: collapse;
      }

      .data-table thead {
        background: #f9fafb;
      }

      .data-table th {
        padding: 12px 16px;
        text-align: left;
        font-size: 12px;
        font-weight: 600;
        color: #6b7280;
        text-transform: uppercase;
        border-bottom: 2px solid #e5e7eb;
      }

      .data-table td {
        padding: 12px 16px;
        font-size: 14px;
        color: #374151;
        border-bottom: 1px solid #e5e7eb;
      }

      .data-table tbody tr:hover {
        background: #f9fafb;
      }

      .table-cell-name {
        font-weight: 500;
        color: #1f2937;
      }

      .tree-container {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 20px;
      }

      .tree-node {
        margin-bottom: 8px;
      }

      .tree-node-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 6px;
        transition: background 0.2s;
      }

      .tree-node-header:hover {
        background: #f3f4f6;
      }

      .tree-node-header i {
        color: #6b7280;
      }

      .tree-node-name {
        flex: 1;
        font-size: 14px;
        color: #374151;
        font-weight: 500;
      }

      .tree-node-count {
        font-size: 12px;
        color: #6b7280;
        font-weight: 600;
        background: #f3f4f6;
        padding: 2px 8px;
        border-radius: 4px;
      }

      .tree-node-children {
        margin-top: 4px;
      }

      .bbox-info {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 20px;
      }

      .bbox-row {
        display: flex;
        padding: 12px 0;
        border-bottom: 1px solid #e5e7eb;
      }

      .bbox-row:last-child {
        border-bottom: none;
      }

      .bbox-label {
        min-width: 100px;
        font-size: 14px;
        font-weight: 600;
        color: #6b7280;
      }

      .bbox-value {
        font-size: 14px;
        color: #374151;
        font-family: 'Courier New', monospace;
      }

      .no-data-message {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        color: #6b7280;
        text-align: center;
      }

      .no-data-message i {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
      }

      .no-data-message p {
        margin: 0;
        font-size: 14px;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes slideIn {
        from {
          transform: translate(-50%, -50%) scale(0.9);
          opacity: 0;
        }
        to {
          transform: translate(-50%, -50%) scale(1);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
