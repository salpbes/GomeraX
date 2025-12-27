/**
 * SLICER CHART MANAGER (The "Slicer Art Department")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module draws the charts specifically for the Slicer tool. When you 
 * see a pie chart in the Slicer panel that lets you filter by "Level" or 
 * "Type", this module is what's drawing it.
 * 
 * HOW IT CONNECTS:
 * - SlicerDashboard: This is the "art department" for the Slicer tool.
 * - SlicerDataManager: Gets the filtered numbers to update the charts 
 *   as you click.
 * --------------------------------------------------------------------------------
 */

import { Chart, DoughnutController, ArcElement, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale, PieController } from 'chart.js';

export class SlicerChartManager {
  private charts: Map<string, Chart> = new Map();
  private chartColors = [
    '#4a90e2', '#e91e63', '#4caf50', '#ff9800', '#9c27b0',
    '#00bcd4', '#ff5722', '#607d8b', '#8bc34a', '#ffc107',
    '#3f51b5', '#f44336', '#009688', '#ffeb3b', '#795548',
    '#673ab7', '#e91e63', '#2196f3', '#cddc39', '#607d8b'
  ];
  private typeColorMap: Map<string, string> = new Map();

  constructor() {
    Chart.register(DoughnutController, ArcElement, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale, PieController);
  }

  public getTypeColor(type: string): string {
    if (!this.typeColorMap.has(type)) {
      const index = this.typeColorMap.size % this.chartColors.length;
      this.typeColorMap.set(type, this.chartColors[index]);
    }
    return this.typeColorMap.get(type)!;
  }

  public createChart(canvas: HTMLCanvasElement, config: any, values: any[], chartType: 'pie' | 'bar', onClick: (value: string, isMulti: boolean) => void): Chart {
    const limit = chartType === 'bar' ? 20 : 10;
    const topValues = values.slice(0, limit);
    const chartColors = topValues.map((v) => this.getTypeColor(v.value));

    const doughnutLabelPlugin = {
      id: 'doughnutLabel',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset: any, i: number) => {
          const meta = chart.getDatasetMeta(i);
          if (!meta.hidden) {
            meta.data.forEach((element: any, index: number) => {
              const { startAngle, endAngle } = element;
              if (endAngle - startAngle > 0.25) {
                const { x, y } = element.tooltipPosition();
                ctx.save();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 3;
                ctx.fillText(String(dataset.data[index]), x, y);
                ctx.restore();
              }
            });
          }
        });
      }
    };

    const chart = new Chart(canvas, {
      type: chartType === 'pie' ? 'doughnut' : 'bar',
      plugins: chartType === 'pie' ? [doughnutLabelPlugin] : [],
      data: {
        labels: topValues.map(v => v.value.length > 15 ? v.value.substring(0, 15) + '...' : v.value),
        datasets: [{
          data: topValues.map(v => v.count),
          backgroundColor: chartColors,
          borderWidth: 0,
          // @ts-ignore
          fullValues: topValues.map(v => v.value),
          minBarLength: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: chartType === 'pie',
            position: 'right',
            labels: { color: '#888', font: { size: 11 }, boxWidth: 12 }
          }
        },
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            // @ts-ignore
            const fullValues = chart.data.datasets[0].fullValues;
            const value = fullValues ? fullValues[index] : topValues[index].value;
            const nativeEvent = event.native as MouseEvent;
            const isMultiSelect = nativeEvent && (nativeEvent.ctrlKey || nativeEvent.metaKey || nativeEvent.shiftKey);
            onClick(value, isMultiSelect);
          }
        }
      }
    });

    this.charts.set(config.id, chart);
    return chart;
  }

  public updateChart(id: string, valueCounts: Map<string, number>, chartType: 'pie' | 'bar'): void {
    const chart = this.charts.get(id);
    if (!chart) return;

    const sortedValues = Array.from(valueCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
    
    const limit = chartType === 'bar' ? 20 : 10;
    const topValues = sortedValues.slice(0, limit);
    
    chart.data.labels = topValues.map(v => v.value.length > 15 ? v.value.substring(0, 15) + '...' : v.value);
    chart.data.datasets[0].data = topValues.map(v => v.count);
    // @ts-ignore
    chart.data.datasets[0].fullValues = topValues.map(v => v.value);
    chart.data.datasets[0].backgroundColor = topValues.map(v => this.getTypeColor(v.value));
    
    chart.update();
  }

  public destroyCharts(): void {
    this.charts.forEach(chart => chart.destroy());
    this.charts.clear();
  }
}
