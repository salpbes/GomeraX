/**
 * WEBGPU OPTIMIZATIONS (The "Speed Booster")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module contains several "under the hood" tricks to make WebGPU even 
 * faster. It merges thousands of small objects into a few large ones and 
 * stops the computer from drawing things that are behind your back or 
 * hidden behind walls.
 * 
 * HOW IT CONNECTS:
 * - WebGPURendererModule: Prepares the model data before it gets sent to 
 *   the graphics card.
 * --------------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OptimizationConfig } from './WebGPUTypes';

export class WebGPUOptimizations {
  private config: OptimizationConfig = {
    frustumCullingEnabled: true,
    geometryMergingEnabled: true,
    shadowCachingEnabled: true,
    cameraMovedThreshold: 0.001,
  };
  
  // Frustum culling state
  private frustum: THREE.Frustum = new THREE.Frustum();
  private projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4();
  
  // Camera tracking for movement detection
  private lastCameraPosition: THREE.Vector3 = new THREE.Vector3();
  private lastCameraQuaternion: THREE.Quaternion = new THREE.Quaternion();
  
  // Merged geometry tracking
  private mergedMeshes: THREE.Mesh[] = [];

  /**
   * Check if camera has moved significantly since last frame
   */
  public hasCameraMoved(camera: THREE.Camera): boolean {
    const pos = camera.position;
    const quat = camera.quaternion;
    
    const posDiff = pos.distanceToSquared(this.lastCameraPosition);
    const quatDiff = Math.abs(1 - Math.abs(quat.dot(this.lastCameraQuaternion)));
    
    const moved = posDiff > this.config.cameraMovedThreshold || quatDiff > 0.0001;
    
    if (moved) {
      this.lastCameraPosition.copy(pos);
      this.lastCameraQuaternion.copy(quat);
    }
    
    return moved;
  }

  /**
   * Perform frustum culling to hide objects outside camera view
   */
  public performFrustumCulling(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.config.frustumCullingEnabled) return;
    
    // Update frustum from camera
    this.projScreenMatrix.multiplyMatrices(
      (camera as THREE.PerspectiveCamera).projectionMatrix,
      camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    
    // Cull meshes outside frustum
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name !== 'webgpu-ground-plane') {
        // Use bounding sphere for fast culling
        if (!obj.geometry.boundingSphere) {
          obj.geometry.computeBoundingSphere();
        }
        
        if (obj.geometry.boundingSphere) {
          const sphere = obj.geometry.boundingSphere.clone();
          sphere.applyMatrix4(obj.matrixWorld);
          obj.visible = this.frustum.intersectsSphere(sphere);
        }
      }
    });
  }

  /**
   * Merge geometries with the same material to reduce draw calls
   */
  public mergeGeometriesByMaterial(
    meshes: THREE.Mesh[],
    scene: THREE.Scene
  ): THREE.Mesh[] {
    if (!this.config.geometryMergingEnabled) return meshes;
    
    // Clear previous merged meshes
    this.clearMergedMeshes(scene);
    
    // Group meshes by material color
    const materialGroups = new Map<string, THREE.Mesh[]>();
    
    for (const mesh of meshes) {
      if (mesh.name === 'webgpu-ground-plane') continue;
      
      const material = mesh.material as THREE.MeshStandardMaterial;
      const colorKey = material.color ? material.color.getHexString() : 'default';
      
      if (!materialGroups.has(colorKey)) {
        materialGroups.set(colorKey, []);
      }
      materialGroups.get(colorKey)!.push(mesh);
    }
    
    const mergedMeshes: THREE.Mesh[] = [];
    
    for (const [colorKey, groupMeshes] of materialGroups) {
      if (groupMeshes.length < 2) {
        // Not worth merging single meshes
        mergedMeshes.push(...groupMeshes);
        continue;
      }
      
      try {
        // Clone and transform geometries to world space
        const geometries: THREE.BufferGeometry[] = [];
        
        for (const mesh of groupMeshes) {
          const clonedGeom = mesh.geometry.clone();
          clonedGeom.applyMatrix4(mesh.matrixWorld);
          geometries.push(clonedGeom);
          
          // Hide original mesh
          mesh.visible = false;
        }
        
        // Merge geometries
        const mergedGeometry = mergeGeometries(geometries, false);
        
        if (mergedGeometry) {
          const material = (groupMeshes[0].material as THREE.Material).clone();
          const mergedMesh = new THREE.Mesh(mergedGeometry, material);
          mergedMesh.name = `webgpu-merged-${colorKey}`;
          mergedMesh.castShadow = true;
          mergedMesh.receiveShadow = true;
          
          scene.add(mergedMesh);
          mergedMeshes.push(mergedMesh);
          this.mergedMeshes.push(mergedMesh);
        }
        
        // Dispose cloned geometries
        geometries.forEach(g => g.dispose());
        
      } catch (e) {
        console.warn(`⚠️ Could not merge geometries for color ${colorKey}:`, e);
        // Keep original meshes visible
        groupMeshes.forEach(m => m.visible = true);
        mergedMeshes.push(...groupMeshes);
      }
    }
    
    console.log(`🔗 Merged ${meshes.length} meshes into ${mergedMeshes.length} groups`);
    return mergedMeshes;
  }

  /**
   * Clear merged meshes from scene
   */
  public clearMergedMeshes(scene: THREE.Scene): void {
    for (const mesh of this.mergedMeshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.mergedMeshes = [];
  }

  /**
   * Count visible meshes in the scene
   */
  public countVisibleMeshes(scene: THREE.Scene): number {
    let count = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.visible && obj.name !== 'webgpu-ground-plane') {
        count++;
      }
    });
    return count;
  }

  /**
   * Reset all meshes to visible
   */
  public resetVisibility(scene: THREE.Scene): void {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.visible = true;
      }
    });
  }

  // =========================================================================
  // Configuration Getters/Setters
  // =========================================================================

  public setFrustumCullingEnabled(enabled: boolean): void {
    this.config.frustumCullingEnabled = enabled;
    console.log(`🔍 Frustum culling ${enabled ? 'enabled' : 'disabled'}`);
  }

  public isFrustumCullingEnabled(): boolean {
    return this.config.frustumCullingEnabled;
  }

  public setGeometryMergingEnabled(enabled: boolean): void {
    this.config.geometryMergingEnabled = enabled;
    console.log(`🔗 Geometry merging ${enabled ? 'enabled' : 'disabled'} (applies to next model load)`);
  }

  public isGeometryMergingEnabled(): boolean {
    return this.config.geometryMergingEnabled;
  }

  public getMergedMeshCount(): number {
    return this.mergedMeshes.length;
  }

  public setCameraMovedThreshold(threshold: number): void {
    this.config.cameraMovedThreshold = threshold;
  }

  /**
   * Cleanup resources
   */
  public dispose(scene: THREE.Scene): void {
    this.clearMergedMeshes(scene);
  }
}
