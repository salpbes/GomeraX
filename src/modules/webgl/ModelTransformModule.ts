/**
 * MODEL TRANSFORM (The "House Movers")
 * --------------------------------------------------------------------------------
 * WHAT IT DOES: 
 * This module handles the position of the building in 3D space. If you load 
 * multiple buildings and they are floating in the wrong places, this tool 
 * helps align them or center them so they are easy to view.
 * 
 * HOW IT CONNECTS:
 * - WorldManager: Moves the objects around inside the 3D scene.
 * - ToolbarHandlers: Provides the "Center Model" and "Reset View" actions.
 * --------------------------------------------------------------------------------
 */

import * as THREE from 'three';
import * as OBC from '@thatopen/components';

export class ModelTransformModule {
  private components: OBC.Components;
  private fragments: OBC.FragmentsManager;
  private world: OBC.World;

  constructor(components: OBC.Components, fragments: OBC.FragmentsManager, world: OBC.World) {
    this.components = components;
    this.fragments = fragments;
    this.world = world;
  }

  /**
   * Gets the bounding box of a model
   * @param modelId - ID of the model
   * @returns Bounding box or null if model not found
   */
  public getModelBounds(modelId: string): THREE.Box3 | null {
    const model = this.fragments.list.get(modelId);
    if (!model) {
      console.warn(`Model ${modelId} not found`);
      return null;
    }

    const box = new THREE.Box3();
    box.setFromObject(model.object);
    return box;
  }

  /**
   * Gets the bounding box of all loaded models
   */
  public getAllModelsBounds(): THREE.Box3 {
    const box = new THREE.Box3();
    
    for (const [, model] of this.fragments.list) {
      const modelBox = new THREE.Box3().setFromObject(model.object);
      box.union(modelBox);
    }

    return box;
  }

  /**
   * Centers a specific model at the origin
   * @param modelId - ID of the model to center
   */
  public centerModel(modelId: string): void {
    const model = this.fragments.list.get(modelId);
    if (!model) {
      console.warn(`Model ${modelId} not found`);
      return;
    }

    const box = new THREE.Box3().setFromObject(model.object);
    const center = box.getCenter(new THREE.Vector3());
    
    // Move model so its center is at the origin
    model.object.position.sub(center);
    
    this.fragments.core.update(true);
    console.log(`✅ Model ${modelId} centered at origin`);
  }

  /**
   * Centers all loaded models as a group
   */
  public centerAllModels(): void {
    const box = this.getAllModelsBounds();
    const center = box.getCenter(new THREE.Vector3());
    
    // Move all models to center the group
    for (const [, model] of this.fragments.list) {
      model.object.position.sub(center);
    }

    this.fragments.core.update(true);
    console.log(`✅ All models centered at origin`);
  }

  /**
   * Moves a model to be on top of the grid (y = 0)
   * Useful when models are below the ground
   * @param modelId - ID of the model
   */
  public moveModelToGround(modelId: string): void {
    const model = this.fragments.list.get(modelId);
    if (!model) {
      console.warn(`Model ${modelId} not found`);
      return;
    }

    const box = new THREE.Box3().setFromObject(model.object);
    const minY = box.min.y;
    
    // Move model up so its bottom is at y = 0
    model.object.position.y -= minY;
    
    this.fragments.core.update(true);
    console.log(`✅ Model ${modelId} moved to ground level`);
  }

  /**
   * Moves all models to ground level
   */
  public moveAllModelsToGround(): void {
    const box = this.getAllModelsBounds();
    const minY = box.min.y;
    
    // Move all models up so the lowest point is at y = 0
    for (const [, model] of this.fragments.list) {
      model.object.position.y -= minY;
    }

    this.fragments.core.update(true);
    console.log(`✅ All models moved to ground level`);
  }

  /**
   * Adjusts model height (useful for aligning multiple models)
   * @param modelId - ID of the model
   * @param offsetY - Amount to move (positive = up, negative = down)
   */
  public adjustModelHeight(modelId: string, offsetY: number): void {
    const model = this.fragments.list.get(modelId);
    if (!model) {
      console.warn(`Model ${modelId} not found`);
      return;
    }

    model.object.position.y += offsetY;
    this.fragments.core.update(true);
    console.log(`✅ Model ${modelId} height adjusted by ${offsetY}`);
  }

  /**
   * Moves a model by a specific offset
   * @param modelId - ID of the model
   * @param offset - Vector3 offset (x, y, z)
   */
  public moveModel(modelId: string, offset: THREE.Vector3): void {
    const model = this.fragments.list.get(modelId);
    if (!model) {
      console.warn(`Model ${modelId} not found`);
      return;
    }

    model.object.position.add(offset);
    this.fragments.core.update(true);
    console.log(`✅ Model ${modelId} moved by (${offset.x}, ${offset.y}, ${offset.z})`);
  }

  /**
   * Resets a model's position to origin
   * @param modelId - ID of the model
   */
  public resetModelPosition(modelId: string): void {
    const model = this.fragments.list.get(modelId);
    if (!model) {
      console.warn(`Model ${modelId} not found`);
      return;
    }

    model.object.position.set(0, 0, 0);
    this.fragments.core.update(true);
    console.log(`✅ Model ${modelId} position reset`);
  }

  /**
   * Fits the camera to view all models
   */
  public async fitCameraToModels(): Promise<void> {
    const box = this.getAllModelsBounds();
    
    if (box.isEmpty()) {
      console.warn('No models to fit camera to');
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Calculate camera distance based on model size
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2;
    
    // Position camera to view the model
    const cameraPos = new THREE.Vector3(
      center.x + distance * 0.7,
      center.y + distance * 0.5,
      center.z + distance * 0.7
    );

    if (this.world.camera.controls) {
      await this.world.camera.controls.setLookAt(
        cameraPos.x, cameraPos.y, cameraPos.z,
        center.x, center.y, center.z
      );
    }

    console.log(`✅ Camera fitted to view all models`);
  }

  /**
   * Gets information about all loaded models
   */
  public getModelsInfo(): Array<{
    id: string;
    position: THREE.Vector3;
    bounds: { min: THREE.Vector3; max: THREE.Vector3; size: THREE.Vector3 };
  }> {
    const info = [];

    for (const [id, model] of this.fragments.list) {
      const box = new THREE.Box3().setFromObject(model.object);
      
      info.push({
        id,
        position: model.object.position.clone(),
        bounds: {
          min: box.min.clone(),
          max: box.max.clone(),
          size: box.getSize(new THREE.Vector3()),
        },
      });
    }

    return info;
  }

  /**
   * Aligns two models by their bounding box centers
   * @param sourceModelId - Model to move
   * @param targetModelId - Model to align to
   */
  public alignModelToModel(sourceModelId: string, targetModelId: string): void {
    const sourceModel = this.fragments.list.get(sourceModelId);
    const targetModel = this.fragments.list.get(targetModelId);

    if (!sourceModel || !targetModel) {
      console.warn('One or both models not found');
      return;
    }

    const sourceBox = new THREE.Box3().setFromObject(sourceModel.object);
    const targetBox = new THREE.Box3().setFromObject(targetModel.object);

    const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
    const targetCenter = targetBox.getCenter(new THREE.Vector3());

    const offset = targetCenter.sub(sourceCenter);
    sourceModel.object.position.add(offset);

    this.fragments.core.update(true);
    console.log(`✅ Model ${sourceModelId} aligned to ${targetModelId}`);
  }
}
