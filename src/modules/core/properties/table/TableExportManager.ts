import { PropertyRow } from './TableDataManager';

export class TableExportManager {
  public async exportToCSV(data: PropertyRow[]): Promise<void> {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const val = row[header];
        const strVal = val !== undefined && val !== null ? String(val) : '';
        return `"${strVal.replace(/"/g, '""')}"`;
      }).join(','))
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const fileName = `ifc_properties_${new Date().getTime()}.csv`;

    await this.saveFile(blob, fileName, [
      {
        description: 'CSV File',
        accept: { 'text/csv': ['.csv'] },
      },
    ]);
  }

  public async exportToJSON(data: PropertyRow[]): Promise<void> {
    if (data.length === 0) return;

    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const fileName = `ifc_properties_${new Date().getTime()}.json`;

    await this.saveFile(blob, fileName, [
      {
        description: 'JSON File',
        accept: { 'application/json': ['.json'] },
      },
    ]);
  }

  private async saveFile(blob: Blob, suggestedName: string, types: any[]): Promise<void> {
    // Check if File System Access API is supported (Chrome, Edge, Opera)
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err: any) {
        // If user cancels, just return
        if (err.name === 'AbortError') return;
        console.warn('File System Access API failed or was cancelled, falling back to download:', err);
      }
    }

    // Fallback to traditional download for Firefox, Safari, or if API fails
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', suggestedName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}
