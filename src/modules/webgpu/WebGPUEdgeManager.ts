/**
 * WebGPU Edge Manager
 * Handles edge/wireframe rendering for meshes
 */

import * as THREE from 'three';
import { EdgeConfig } from './WebGPUTypes';

export class WebGPUEdgeManager {
  private edgeLines: THREE.LineSegments[] = [];
  
  private config: EdgeConfig = {
    enabled: false,
    threshold: 15,  // angle threshold in degrees
    color: new THREE.Color(0x000000),
  };

  /**
   * Create edge lines for all meshes in the scene
   */
  public createEdges(scene: THREE.Scene): void {
    if (!this.config.enabled) return;
    
    this.removeEdges(scene);
    
    const meshes: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name !== 'webgpu-ground-plane') {
        meshes.push(obj);
      }
    });
    
    const edgeMaterial = new THREE.LineBasicMaterial({ 
      color: this.config.color,
      transparent: true,
      opacity: 0.3,
    });
    
    let edgeCount = 0;
    for (const mesh of meshes) {
      try {
        const edgesGeometry = new THREE.EdgesGeometry(
          mesh.geometry, 
          this.config.threshold
        );
        
        if (edgesGeometry.attributes.position && edgesGeometry.attributes.position.count > 0) {
          const lines = new THREE.LineSegments(edgesGeometry, edgeMaterial);
          lines.name = 'webgpu-edge-lines';
          
          // Copy transform from parent mesh
          lines.position.copy(mesh.position);
          lines.rotation.copy(mesh.rotation);
          lines.scale.copy(mesh.scale);
          lines.matrix.copy(mesh.matrix);
          lines.matrixWorld.copy(mesh.matrixWorld);
          
          mesh.add(lines);
          this.edgeLines.push(lines);
          edgeCount++;
        }
      } catch (e) {
        // Some geometries may not support edge detection
        console.warn('⚠️ Could not create edges for mesh:', mesh.name || mesh.uuid);
      }
    }
    
    console.log(`📐 Created ${edgeCount} edge overlays`);
  }

  /**
   * Remove all edge lines from the scene
   */
  public removeEdges(scene: THREE.Scene): void {
    for (const line of this.edgeLines) {
      if (line.parent) {
        line.parent.remove(line);
      }
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.edgeLines = [];
    console.log('📐 Removed edge overlays');
  }

  /**
   * Enable or disable edges
   */
  public setEnabled(scene: THREE.Scene, enabled: boolean): void {
    this.config.enabled = enabled;
    
    if (enabled) {
      this.createEdges(scene);
    } else {
      this.removeEdges(scene);
    }
    
    console.log(`📐 Edges ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if edges are enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Set edge angle threshold
   */
  public setThreshold(scene: THREE.Scene, degrees: number): void {
    this.config.threshold = Math.max(0, Math.min(90, degrees));
    
    if (this.config.enabled) {
      this.createEdges(scene);
    }
    
    console.log(`📐 Edge threshold set to ${this.config.threshold}°`);
  }

  /**
   * Get current edge threshold
   */
  public getThreshold(): number {
    return this.config.threshold;
  }

  /**
   * Set edge color
   */
  public setColor(color: THREE.Color | number): void {
    this.config.color = color instanceof THREE.Color ? color : new THREE.Color(color);
    
    // Update existing edge materials
    for (const line of this.edgeLines) {
      (line.material as THREE.LineBasicMaterial).color = this.config.color;
    }
  }

  /**
   * Get edge line count
   */
  public getEdgeCount(): number {
    return this.edgeLines.length;
  }

  /**
   * Cleanup resources
   */
  public dispose(scene: THREE.Scene): void {
    this.removeEdges(scene);
  }
}
