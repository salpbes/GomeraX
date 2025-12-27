/**
 * Main Entry Point (The "Pandora's Box")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This is the "Start" button of the application. It's the very first file 
 * that runs when you open the website. It sets up the basic environment 
 * and kicks off the IFC Viewer.
 * 
 * WHY IT MATTERS: 
 * Every app needs a beginning. This file ensures that the styles are loaded, 
 * the 3D viewer is initialized, and the user interface is ready for you 
 * to start working.
 * --------------------------------------------------------------------------------
 */

import { IFCViewer } from './IFCViewer';
import './styles.css';

// HMR Debug Logging
// @ts-ignore - Vite HMR API
if (import.meta.hot) {
  console.log('🔥 HMR is enabled');
  
  // Track HMR updates
  // @ts-ignore
  import.meta.hot.on('vite:beforeUpdate', () => {
    console.log('⚠️ HMR: About to update (file change detected)');
  });
  
  // @ts-ignore
  import.meta.hot.on('vite:afterUpdate', () => {
    console.log('✅ HMR: Update completed');
  });
  
  // Track full page reloads
  // @ts-ignore
  import.meta.hot.on('vite:beforeFullReload', () => {
    console.error('🔄 HMR: FULL PAGE RELOAD triggered!');
    console.trace('Reload stack trace:');
  });
  
  // Accept updates for this module
  // @ts-ignore
  import.meta.hot.accept((newModule: any) => {
    if (newModule) {
      console.log('♻️ HMR: main.ts hot-reloaded');
    }
  });
}

// Prevent re-initialization on HMR
let viewerInitialized = false;

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async () => {
  // Skip initialization if already done (HMR hot-reload)
  if (viewerInitialized) {
    console.log('⚡ HMR: Skipping re-initialization (viewer already running)');
    return;
  }
  
  console.log('🌟 Starting GOMERA IFC Viewer...');

  // Create the viewer instance
  const viewer = new IFCViewer();

  try {
    // Initialize the viewer
    // - 'container' is the ID of the div where the 3D scene will render
    // - true enables the performance monitor
    await viewer.initialize('container', true);

    // Customize measurement line width (make lines thicker for better visibility)
    viewer.getMeasurement()?.setLineWidth(20); // 5x thicker lines (default is 1, we set it to 5)

    // Mark as initialized
    viewerInitialized = true;

    // Make the viewer globally accessible for debugging (optional)
    // You can access it via window.viewer in the browser console
    (window as any).viewer = viewer;

    console.log('💡 Tip: Access the viewer via window.viewer in the console');
  } catch (error) {
    console.error('Failed to start GOMERA viewer:', error);
    
    // Show error message to user
    const container = document.getElementById('container');
    if (container) {
      container.innerHTML = `
        <div style="color: red; padding: 20px; text-align: center;">
          <h2>Failed to initialize GOMERA viewer</h2>
          <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      `;
    }
  }
});
