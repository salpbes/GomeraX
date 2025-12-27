/**
 * WEBGPU EDGE MANAGER (The "Turkish Barber")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module handles the generation and management of edge outlines for 
 * 3D models in WebGPU mode. It creates sharp, clean lines that help 
 * define the building's geometry and architectural features,and
 * gives models a "technical drawing" look.
 * 
 * HOW IT CONNECTS:
 * - WebGPURendererModule: Provides the proxy scene and triggers edge creation.
 * --------------------------------------------------------------------------------
 */

import * as THREE from 'three';

export class WebGPUEdgeManager {
  private edgesEnabled: boolean = false;
  private edgeLines: THREE.LineSegments[] = [];
  private edgeThreshold: number = 15; // angle threshold in degrees
  private edgeMaterial: THREE.LineBasicMaterial | null = null;

  /**
   * Enable or disable edge rendering
   */
  public async setEdgesEnabled(enabled: boolean, scene: THREE.Scene | null, ghostMaterial: THREE.Material | null, isolatedElements: boolean): Promise<void> {
    this.edgesEnabled = enabled;
    
    if (enabled && scene && this.edgeLines.length === 0) {
      await this.createEdges(scene, ghostMaterial, isolatedElements);
    }
    
    // Toggle visibility of existing edge lines
    for (const line of this.edgeLines) {
      line.visible = enabled;
    }
    
    console.log(`✏️ Edges ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current edge rendering state
   */
  public isEdgesEnabled(): boolean {
    return this.edgesEnabled;
  }

  /**
   * Set edge detection threshold angle (in degrees)
   */
  public async setEdgeThreshold(degrees: number, scene: THREE.Scene | null, ghostMaterial: THREE.Material | null, isolatedElements: boolean): Promise<void> {
    this.edgeThreshold = Math.max(1, Math.min(90, degrees));
    
    // Recreate edges with new threshold if enabled
    if (this.edgesEnabled && scene) {
      this.removeEdges();
      await this.createEdges(scene, ghostMaterial, isolatedElements);
    }
    
    console.log(`✏️ Edge threshold set to ${this.edgeThreshold}°`);
  }

  /**
   * Get current edge threshold
   */
  public getEdgeThreshold(): number {
    return this.edgeThreshold;
  }

  /**
   * Create edge lines for all meshes in the scene
   */
  public async createEdges(scene: THREE.Scene, ghostMaterial: THREE.Material | null, isolatedElements: boolean): Promise<void> {
    const thresholdRadians = (this.edgeThreshold * Math.PI) / 180;
    let edgeCount = 0;
    let processedCount = 0;
    
    // Reuse or create the shared material for all edges
    if (!this.edgeMaterial) {
      this.edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 1,
        transparent: true,
        opacity: 0.8,
      });
    }
    
    // Collect meshes first
    const meshes: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry && obj.name !== 'webgpu-ground-plane' && obj.name !== 'edge-line') {
        meshes.push(obj);
      }
    });

    for (const obj of meshes) {
      // Skip edges for ghosted items during isolation
      if (isolatedElements && ghostMaterial && obj.material === ghostMaterial) {
        continue;
      }

      try {
        // Create edges geometry
        const edgesGeometry = new THREE.EdgesGeometry(obj.geometry, this.edgeThreshold);
        
        if (edgesGeometry.attributes.position && edgesGeometry.attributes.position.count > 0) {
          const lineSegments = new THREE.LineSegments(edgesGeometry, this.edgeMaterial);
          
          // Copy transform
          lineSegments.position.copy(obj.position);
          lineSegments.rotation.copy(obj.rotation);
          lineSegments.scale.copy(obj.scale);
          lineSegments.matrix.copy(obj.matrix);
          lineSegments.matrixWorld.copy(obj.matrixWorld);
          lineSegments.matrixAutoUpdate = false;
          
          lineSegments.name = 'edge-line';
          lineSegments.visible = this.edgesEnabled;
          lineSegments.frustumCulled = true;
          
          if (obj.parent) {
            obj.parent.add(lineSegments);
          } else {
            scene.add(lineSegments);
          }
          
          this.edgeLines.push(lineSegments);
          edgeCount++;
        }
      } catch (e) {
        // Skip meshes that can't have edges computed
      }

      processedCount++;
      if (processedCount % 50 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    
    console.log(`✏️ Created ${edgeCount} edge outlines`);
  }

  /**
   * Remove all edge lines
   */
  public removeEdges(): void {
    for (const line of this.edgeLines) {
      if (line.parent) {
        line.parent.remove(line);
      }
      if (line.geometry) {
        line.geometry.dispose();
      }
    }
    this.edgeLines = [];
  }

  /**
   * Get all edge lines
   */
  public getEdgeLines(): THREE.LineSegments[] {
    return this.edgeLines;
  }

  /**
   * Clear edge lines array without disposing (used during rebuild)
   */
  public clearEdgeLines(): void {
    this.edgeLines = [];
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.removeEdges();
    if (this.edgeMaterial) {
      try {
        this.edgeMaterial.dispose();
      } catch (e) {
        // Ignore disposal errors
      }
      this.edgeMaterial = null;
    }
  }
}
