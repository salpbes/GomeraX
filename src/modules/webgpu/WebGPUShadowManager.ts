/**
 * WebGPU Shadow Manager
 * Handles shadow light setup, ground plane, and shadow-related operations
 */

import * as THREE from 'three';
import { ShadowConfig, GroundPlaneConfig } from './WebGPUTypes';

export class WebGPUShadowManager {
  private shadowLight: THREE.DirectionalLight | null = null;
  private groundPlane: THREE.Mesh | null = null;
  private sceneCenter: THREE.Vector3 = new THREE.Vector3();
  private sceneMaxDim: number = 100;
  
  private config: ShadowConfig = {
    enabled: true,
    angle: 45,
    elevation: 45,
    mapSize: 2048,
    bias: -0.0005,
    normalBias: 0.02,
  };
  
  private groundConfig: GroundPlaneConfig = {
    enabled: true,
    color: 0x909090,
    roughness: 0.9,
    metalness: 0,
  };
  
  // Flag for shadow map update
  public shadowMapNeedsUpdate: boolean = true;

  /**
   * Setup shadow-casting directional light
   */
  public setupShadowLight(scene: THREE.Scene): void {
    const shadowLight = new THREE.DirectionalLight(0xffffff, 0.8);
    shadowLight.name = 'webgpu-shadow-light';
    
    // Position light at an angle for nice shadows
    shadowLight.position.set(50, 100, 50);
    shadowLight.target.position.set(0, 0, 0);
    
    if (this.config.enabled) {
      shadowLight.castShadow = true;
      
      // Shadow map size
      shadowLight.shadow.mapSize.width = this.config.mapSize;
      shadowLight.shadow.mapSize.height = this.config.mapSize;
      
      // Shadow camera frustum - will be adjusted to fit the scene
      const shadowCam = shadowLight.shadow.camera;
      shadowCam.left = -100;
      shadowCam.right = 100;
      shadowCam.top = 100;
      shadowCam.bottom = -100;
      shadowCam.near = 1;
      shadowCam.far = 500;
      
      // Reduce shadow artifacts
      shadowLight.shadow.bias = this.config.bias;
      shadowLight.shadow.normalBias = this.config.normalBias;
    }
    
    scene.add(shadowLight);
    scene.add(shadowLight.target);
    this.shadowLight = shadowLight;
  }

  /**
   * Update shadow camera to fit the scene bounds
   */
  public updateShadowBounds(scene: THREE.Scene): void {
    // Ensure all world matrices are up to date
    scene.updateMatrixWorld(true);
    
    // Calculate scene bounding box (excluding ground plane)
    const box = new THREE.Box3();
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry && obj.name !== 'webgpu-ground-plane') {
        obj.geometry.computeBoundingBox();
        if (obj.geometry.boundingBox) {
          const meshBox = obj.geometry.boundingBox.clone();
          meshBox.applyMatrix4(obj.matrixWorld);
          box.union(meshBox);
        }
      }
    });
    
    if (box.isEmpty()) return;
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Store scene bounds
    this.sceneCenter.copy(center);
    this.sceneMaxDim = maxDim;
    
    // Update shadow light if available
    if (this.shadowLight) {
      const shadowCam = this.shadowLight.shadow.camera;
      const padding = maxDim * 0.5;
      shadowCam.left = -maxDim - padding;
      shadowCam.right = maxDim + padding;
      shadowCam.top = maxDim + padding;
      shadowCam.bottom = -maxDim - padding;
      shadowCam.near = 1;
      shadowCam.far = maxDim * 4;
      shadowCam.updateProjectionMatrix();
      
      // Position light based on current angle settings
      this.updateShadowLightPosition();
    }
    
    // Setup ground plane
    this.setupGroundPlane(scene, box);
    
    console.log('🌤️ Shadow bounds updated:', {
      center: center.toArray().map(v => v.toFixed(1)),
      size: size.toArray().map(v => v.toFixed(1)),
      maxDim: maxDim.toFixed(1)
    });
  }

  /**
   * Setup ground plane that receives shadows
   */
  private setupGroundPlane(scene: THREE.Scene, boundingBox: THREE.Box3): void {
    if (!this.groundConfig.enabled) return;
    
    // Remove existing ground plane
    if (this.groundPlane) {
      scene.remove(this.groundPlane);
      this.groundPlane.geometry.dispose();
      (this.groundPlane.material as THREE.Material).dispose();
      this.groundPlane = null;
    }
    
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z) * 2;
    
    const geometry = new THREE.PlaneGeometry(maxDim, maxDim);
    const material = new THREE.MeshStandardMaterial({
      color: this.groundConfig.color,
      roughness: this.groundConfig.roughness,
      metalness: this.groundConfig.metalness,
      side: THREE.DoubleSide,
    });
    
    this.groundPlane = new THREE.Mesh(geometry, material);
    this.groundPlane.name = 'webgpu-ground-plane';
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.set(center.x, -0.5, center.z);
    this.groundPlane.receiveShadow = true;
    this.groundPlane.castShadow = false;
    
    scene.add(this.groundPlane);
    
    console.log('🏗️ Ground plane added:', {
      position: `(${center.x.toFixed(1)}, -0.5, ${center.z.toFixed(1)})`,
      size: maxDim.toFixed(1)
    });
  }

  /**
   * Update shadow light position based on angle and elevation
   */
  private updateShadowLightPosition(): void {
    if (!this.shadowLight) return;
    
    const angleRad = (this.config.angle * Math.PI) / 180;
    const elevationRad = (this.config.elevation * Math.PI) / 180;
    
    const distance = this.sceneMaxDim * 2;
    const x = this.sceneCenter.x + distance * Math.sin(angleRad) * Math.cos(elevationRad);
    const y = this.sceneCenter.y + distance * Math.sin(elevationRad);
    const z = this.sceneCenter.z + distance * Math.cos(angleRad) * Math.cos(elevationRad);
    
    this.shadowLight.position.set(x, y, z);
    this.shadowLight.target.position.copy(this.sceneCenter);
    
    this.shadowMapNeedsUpdate = true;
  }

  /**
   * Set shadow map resolution (creates new light to avoid WebGPU issues)
   */
  public setShadowMapResolution(scene: THREE.Scene, resolution: number): void {
    if (!this.shadowLight) return;
    
    const currentSize = this.shadowLight.shadow.mapSize.x;
    if (currentSize === resolution) return;
    
    // Save current configuration
    const savedPosition = this.shadowLight.position.clone();
    const savedTargetPosition = this.shadowLight.target.position.clone();
    const savedIntensity = this.shadowLight.intensity;
    const shadowCam = this.shadowLight.shadow.camera;
    const savedCam = {
      left: shadowCam.left,
      right: shadowCam.right,
      top: shadowCam.top,
      bottom: shadowCam.bottom,
      near: shadowCam.near,
      far: shadowCam.far,
    };
    
    // Remove old light (don't dispose - let GC handle it)
    scene.remove(this.shadowLight);
    scene.remove(this.shadowLight.target);
    
    // Create new light with new resolution
    const newLight = new THREE.DirectionalLight(0xffffff, savedIntensity);
    newLight.name = 'webgpu-shadow-light';
    newLight.position.copy(savedPosition);
    newLight.target.position.copy(savedTargetPosition);
    
    if (this.config.enabled) {
      newLight.castShadow = true;
      newLight.shadow.mapSize.width = resolution;
      newLight.shadow.mapSize.height = resolution;
      
      const newShadowCam = newLight.shadow.camera;
      newShadowCam.left = savedCam.left;
      newShadowCam.right = savedCam.right;
      newShadowCam.top = savedCam.top;
      newShadowCam.bottom = savedCam.bottom;
      newShadowCam.near = savedCam.near;
      newShadowCam.far = savedCam.far;
      newShadowCam.updateProjectionMatrix();
      
      newLight.shadow.bias = this.config.bias;
      newLight.shadow.normalBias = this.config.normalBias;
    }
    
    scene.add(newLight);
    scene.add(newLight.target);
    this.shadowLight = newLight;
    this.config.mapSize = resolution;
    this.shadowMapNeedsUpdate = true;
    
    console.log(`🌑 Shadow map resolution set to ${resolution}x${resolution}`);
  }

  // =========================================================================
  // Getters and Setters
  // =========================================================================

  public setShadowsEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (this.shadowLight) {
      this.shadowLight.castShadow = enabled;
      this.shadowLight.visible = enabled;
    }
    console.log(`🌤️ Shadows ${enabled ? 'enabled' : 'disabled'}`);
  }

  public isShadowsEnabled(): boolean {
    return this.config.enabled;
  }

  public setShadowAngle(angle: number): void {
    this.config.angle = angle % 360;
    this.updateShadowLightPosition();
  }

  public getShadowAngle(): number {
    return this.config.angle;
  }

  public setShadowElevation(elevation: number): void {
    this.config.elevation = Math.max(10, Math.min(90, elevation));
    this.updateShadowLightPosition();
  }

  public getShadowElevation(): number {
    return this.config.elevation;
  }

  public getShadowMapResolution(): number {
    return this.shadowLight?.shadow?.mapSize?.x ?? this.config.mapSize;
  }

  public setGroundPlaneEnabled(enabled: boolean): void {
    this.groundConfig.enabled = enabled;
    if (this.groundPlane) {
      this.groundPlane.visible = enabled;
    }
    console.log(`🏗️ Ground plane ${enabled ? 'enabled' : 'disabled'}`);
  }

  public isGroundPlaneEnabled(): boolean {
    return this.groundConfig.enabled;
  }

  public getShadowLight(): THREE.DirectionalLight | null {
    return this.shadowLight;
  }

  public getSceneCenter(): THREE.Vector3 {
    return this.sceneCenter.clone();
  }

  public getSceneMaxDim(): number {
    return this.sceneMaxDim;
  }

  /**
   * Check if shadow map needs update based on camera movement
   */
  public shouldUpdateShadowMap(cameraMoved: boolean): boolean {
    if (cameraMoved || this.shadowMapNeedsUpdate) {
      this.shadowMapNeedsUpdate = false;
      return true;
    }
    return false;
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    this.shadowLight = null;
    this.groundPlane = null;
  }
}
