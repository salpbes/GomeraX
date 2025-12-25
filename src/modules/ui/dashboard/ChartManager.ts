/**
 * DASHBOARD CHART MANAGER (The "Artist")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module takes the boring numbers from the building and turns them 
 * into beautiful, colorful charts (like pie charts and bar graphs). It 
 * uses a library called "Chart.js" to do the heavy lifting.
 * 
 * HOW IT CONNECTS:
 * - ModelDashboard: This is the "art department" for the main dashboard.
 * - DataManager: It gets the numbers it needs to draw from the Accountant.
 * --------------------------------------------------------------------------------
 */

import { Chart, DoughnutController, ArcElement, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement } from 'chart.js';
import { ModelStatistics } from './DataManager';

export class DashboardChartManager {
  private charts: Chart[] = [];

  constructor() {
    // Register Chart.js components
    Chart.register(DoughnutController, ArcElement, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement);
  }

  /**
   * Initializes Chart.js charts
   */
  public initializeCharts(stats: ModelStatistics): void {
    this.destroyCharts();

    // Prepare data
    const sortedTypes = Object.entries(stats.elementTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const labels = sortedTypes.map(([type]) => this.formatIfcType(type));
    const data = sortedTypes.map(([, count]) => count);
    const colors = [
      'rgba(239, 68, 68, 0.8)', 'rgba(59, 130, 246, 0.8)', 'rgba(34, 197, 94, 0.8)', 
      'rgba(251, 146, 60, 0.8)', 'rgba(168, 85, 247, 0.8)', 'rgba(236, 72, 153, 0.8)', 
      'rgba(14, 165, 233, 0.8)', 'rgba(250, 204, 21, 0.8)',
    ];

    // Doughnut Chart
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
                font: { size: 9, family: "'Inter', sans-serif" },
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
          animation: { animateRotate: true, animateScale: true, duration: 1000, easing: 'easeInOutQuart' }
        },
        plugins: [{
          id: 'centerText',
          beforeDraw: (chart) => {
            const { ctx } = chart;
            ctx.save();
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

    // Models Doughnut Chart
    const modelsCanvas = document.getElementById('elementBarChart') as HTMLCanvasElement;
    if (modelsCanvas) {
      const modelNames: string[] = [];
      const modelElementCounts: number[] = [];
      const modelColors = [
        'rgba(59, 130, 246, 0.8)', 'rgba(239, 68, 68, 0.8)', 'rgba(34, 197, 94, 0.8)', 
        'rgba(251, 146, 60, 0.8)', 'rgba(168, 85, 247, 0.8)', 'rgba(236, 72, 153, 0.8)', 
        'rgba(14, 165, 233, 0.8)', 'rgba(132, 204, 22, 0.8)',
      ];

      if (stats.modelDetails.length === 1) {
        const totalElements = Object.values(stats.elementTypes).reduce((sum, count) => sum + count, 0);
        modelNames.push(stats.modelDetails[0].name || 'Model');
        modelElementCounts.push(totalElements);
      } else {
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
                font: { size: 9, family: "'Inter', sans-serif" },
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
          animation: { animateRotate: true, animateScale: true, duration: 1000, easing: 'easeInOutQuart' }
        },
        plugins: [{
          id: 'centerText',
          beforeDraw: (chart) => {
            const { ctx } = chart;
            ctx.save();
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

    // Triangle Distribution Chart
    const triangleCanvas = document.getElementById('triangleDistributionChart') as HTMLCanvasElement;
    if (triangleCanvas) {
      const triangleNames: string[] = [];
      const triangleCounts: number[] = [];
      const triangleColors = [
        'rgba(255, 99, 132, 0.8)', 'rgba(255, 159, 64, 0.8)', 'rgba(255, 205, 86, 0.8)', 
        'rgba(75, 192, 192, 0.8)', 'rgba(54, 162, 235, 0.8)', 'rgba(153, 102, 255, 0.8)', 
        'rgba(201, 203, 207, 0.8)', 'rgba(255, 99, 255, 0.8)',
      ];

      for (const modelDetail of stats.modelDetails) {
        triangleNames.push(modelDetail.name || 'Unnamed Model');
        triangleCounts.push(modelDetail.triangleCount);
      }

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
                font: { size: 9, family: "'Inter', sans-serif" },
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
          animation: { animateRotate: true, animateScale: true, duration: 1000, easing: 'easeInOutQuart' }
        }
      });
      this.charts.push(triangleDonutChart);
    }

    // Storey Chart
    const storeyCanvas = document.getElementById('storeyChart') as HTMLCanvasElement;
    if (storeyCanvas && Object.keys(stats.storeyData).length > 0) {
      const storeyNames = Object.keys(stats.storeyData);
      const categories = Array.from(new Set(storeyNames.flatMap(s => Object.keys(stats.storeyData[s]))));
      const datasets = categories.map((cat, i) => ({
        label: this.formatIfcType(cat),
        data: storeyNames.map(s => stats.storeyData[s][cat] || 0),
        backgroundColor: colors[i % colors.length],
        borderRadius: 4,
      }));

      const storeyChart = new Chart(storeyCanvas, {
        type: 'bar',
        data: { labels: storeyNames, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
            y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } }
          },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } },
            tooltip: { mode: 'index', intersect: false }
          }
        }
      });
      this.charts.push(storeyChart);
    }

    // Model Geometry Chart
    const geometryCanvas = document.getElementById('modelGeometryChart') as HTMLCanvasElement;
    if (geometryCanvas && stats.modelDetails.length > 0) {
      const modelNames = stats.modelDetails.map(m => m.name);
      const vertexData = stats.modelDetails.map(m => m.vertexCount);
      const triangleData = stats.modelDetails.map(m => m.triangleCount);

      const geometryChart = new Chart(geometryCanvas, {
        type: 'bar',
        data: {
          labels: modelNames,
          datasets: [
            { label: 'Vertices', data: vertexData, backgroundColor: 'rgba(59, 130, 246, 0.7)', borderRadius: 4 },
            { label: 'Triangles', data: triangleData, backgroundColor: 'rgba(16, 185, 129, 0.7)', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
            x: { grid: { display: false }, ticks: { font: { size: 10 } } }
          },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } }
          }
        }
      });
      this.charts.push(geometryChart);
    }
  }

  public destroyCharts(): void {
    this.charts.forEach(chart => chart.destroy());
    this.charts = [];
  }

  private formatIfcType(type: string): string {
    return type.replace('IFC', '').replace(/([A-Z])/g, ' $1').trim();
  }
}
