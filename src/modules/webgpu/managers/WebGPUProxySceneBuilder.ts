/**
 * WebGPUProxySceneBuilder (The "Scene Sculptor")
 * 
 * Responsible for translating OBC Fragment models into WebGPU-compatible THREE.Scene.
 * Handles geometry sanitization, material conversion, and performance optimizations like merging.
 */

import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import { WebGPUMaterialFactory } from './WebGPUMaterialFactory';
import { WebGPUCategoryPalette } from './WebGPUCategoryPalette';
import { WebGPUColorPicker } from './WebGPUColorPicker';
import { WebGPUElementSelector } from './WebGPUElementSelector';
import { WebGPUInPlaceOptions } from './WebGPUTypes';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';


export class WebGPUProxySceneBuilder {
  private materialFactory: WebGPUMaterialFactory;
  private categoryPalette: WebGPUCategoryPalette;
  
  // State tracked during build
  public createdGeometries: THREE.BufferGeometry[] = [];
  public mergedMeshes: THREE.Mesh[] = [];
  public modelGroups: THREE.Group[] = [];

  constructor(materialFactory: WebGPUMaterialFactory, categoryPalette: WebGPUCategoryPalette) {
    this.materialFactory = materialFactory;
    this.categoryPalette = categoryPalette;
  }

  /**
   * Cleans up resources from previous builds
   */
  public dispose() {
    for (const geo of this.createdGeometries) {
      geo.dispose();
    }
    this.createdGeometries = [];
    this.mergedMeshes = [];
    this.modelGroups = [];
  }

  /**
   * Clears tracking arrays without disposing resources.
   * Used when starting a new build while old resources are still in use.
   */
  public clear() {
    this.createdGeometries = [];
    this.mergedMeshes = [];
    this.modelGroups = [];
  }

  /**
   * Sanitizes geometry for WebGPU compatibility.
   * WebGPU is strict about attribute formats (e.g., no Int16 normals, no interleaved attributes).
   */
  public sanitizeGeometryForWebGPU(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const newGeo = new THREE.BufferGeometry();

    // Position
    const pos = geometry.getAttribute('position');
    if (pos) {
      newGeo.setAttribute('position', new THREE.Float32BufferAttribute(this.toFloat32Array(pos), 3));
    }

    // Normal
    const norm = geometry.getAttribute('normal');
    if (norm) {
      newGeo.setAttribute('normal', new THREE.Float32BufferAttribute(this.toFloat32Array(norm, 1 / 32767), 3));
    } else {
      newGeo.computeVertexNormals();
    }

    // Index
    const index = geometry.getIndex();
    if (index) {
      newGeo.setIndex(new THREE.Uint32BufferAttribute(new Uint32Array(index.array), 1));
    }

    return newGeo;
  }

  private toFloat32Array(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, scale = 1): Float32Array {
    if (attr instanceof THREE.InterleavedBufferAttribute) {
      const count = attr.count;
      const itemSize = attr.itemSize;
      const array = new Float32Array(count * itemSize);
      for (let i = 0; i < count; i++) {
        for (let j = 0; j < itemSize; j++) {
          array[i * itemSize + j] = attr.getX(i) * scale; // Simplified for demo, real logic uses getX/Y/Z
        }
      }
      // Re-implementing the precise logic from WebGPURendererModule
      const data = (attr as any).data.array;
      const offset = (attr as any).offset ?? 0;
      const stride = (attr as any).data.stride ?? itemSize;
      const result = new Float32Array(count * itemSize);
      for (let i = 0; i < count; i++) {
        for (let j = 0; j < itemSize; j++) {
          result[i * itemSize + j] = data[i * stride + offset + j] * scale;
        }
      }
      return result;
    }

    if (attr.array instanceof Float32Array && scale === 1) {
      return attr.array;
    }

    return new Float32Array(Array.from(attr.array).map(v => v * scale));
  }

  /**
   * Clones meshes from a standard THREE scene into a WebGPU-compatible proxy.
   */
  public tryCloneFragmentMeshes(
    originalScene: THREE.Scene,
    fragments: any,
    options: {
      frustumCulling: boolean;
      shadows: boolean;
      setupShadowLight: (scene: THREE.Scene) => void;
      updateShadowBounds: () => void;
    }
  ): { scene: THREE.Scene; kind: 'fragments' } | null {
    const proxy = new THREE.Scene();
    const bg = originalScene.background;
    proxy.background = bg instanceof THREE.Color ? bg.clone() : bg;

    // Copy lights
    originalScene.traverse((obj) => {
      if ((obj as any).isLight) {
        try {
          const light = obj.clone(true) as THREE.Light;
          (light as any).castShadow = false;
          proxy.add(light);
          if ((light as any).isDirectionalLight && (light as any).target) {
            proxy.add((light as any).target);
          }
        } catch { /* ignore */ }
      }
    });

    proxy.add(new THREE.AmbientLight(0xffffff, 0.5));
    options.setupShadowLight(proxy);

    const root = new THREE.Group();
    root.name = 'webgpu-fragments-cloned';
    proxy.add(root);

    let clonedMeshes = 0;

    for (const [modelId, model] of fragments.list as Map<string, any>) {
      const modelObj = model?.object as THREE.Object3D | undefined;
      if (!modelObj) continue;

      const modelGroup = new THREE.Group();
      modelGroup.name = `webgpu-clone-${modelId}`;
      modelObj.updateMatrixWorld(true);
      modelGroup.position.copy(modelObj.position);
      modelGroup.quaternion.copy(modelObj.quaternion);
      modelGroup.scale.copy(modelObj.scale);
      root.add(modelGroup);

      modelObj.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;

        const srcGeo = child.geometry as THREE.BufferGeometry;
        if (!srcGeo) return;

        const newGeo = this.sanitizeGeometryForWebGPU(srcGeo);
        const srcMat = Array.isArray(child.material) ? child.material[0] : child.material;
        const newMat = this.materialFactory.toStandardMaterial(srcMat);

        const newMesh = new THREE.Mesh(newGeo, newMat);
        child.updateMatrixWorld(true);
        const localMatrix = new THREE.Matrix4().copy(modelObj.matrixWorld).invert().multiply(child.matrixWorld);
        newMesh.applyMatrix4(localMatrix);

        newMesh.frustumCulled = options.frustumCulling;
        newMesh.castShadow = options.shadows;
        newMesh.receiveShadow = options.shadows;
        
        modelGroup.add(newMesh);
        this.createdGeometries.push(newGeo);
        clonedMeshes++;
      });
    }

    if (clonedMeshes === 0) return null;

    options.updateShadowBounds();
    return { scene: proxy, kind: 'fragments' };
  }

  /**
   * Builds a proxy scene by extracting geometry directly from FragmentsModel.
   * This is the most robust method for OBC models.
   */
  public async tryBuildProxySceneFromFragments(
    originalScene: THREE.Scene,
    components: OBC.Components,
    options: {
      frustumCulling: boolean;
      shadows: boolean;
      modelsVisible: boolean;
      geometryMerging: boolean;
      colorPickingEnabled: boolean;
      colorPicker: WebGPUColorPicker | null;
      elementSelector: WebGPUElementSelector | null;
      ghostModeActive: boolean;
      getGhostMaterial: () => THREE.MeshStandardMaterial;
      colorSplashActive: boolean;
      colorSplashColors: Map<string, THREE.Color>;
      hiddenCategories: Set<string>;
      hiddenElements: Map<string, Set<number>>;
      isolatedElements: Map<string, Set<number>> | null;
      slicerActive: boolean;
      slicerColors: Map<string, Map<number, THREE.Color>>;
      setupShadowLight: (scene: THREE.Scene) => void;
      updateShadowBounds: () => void;
    }
  ): Promise<{ scene: THREE.Scene; kind: 'fragments' } | null> {
    const fragments = components.get(OBC.FragmentsManager);
    if (!fragments?.list || fragments.list.size === 0) return null;

    const proxy = new THREE.Scene();
    const bg = originalScene.background;
    proxy.background = bg instanceof THREE.Color ? bg.clone() : bg;

    // Copy lights
    originalScene.traverse((obj) => {
      if ((obj as any).isLight) {
        try {
          const light = obj.clone(true) as THREE.Light;
          (light as any).castShadow = false;
          proxy.add(light);
          if ((light as any).isDirectionalLight && (light as any).target) {
            proxy.add((light as any).target);
          }
        } catch { /* ignore */ }
      }
    });

    proxy.add(new THREE.AmbientLight(0xffffff, 0.5));
    options.setupShadowLight(proxy);

    const root = new THREE.Group();
    root.name = 'webgpu-fragments-proxy';
    proxy.add(root);
    this.modelGroups.push(root);
    root.visible = options.modelsVisible;

    for (const [modelId, model] of fragments.list as Map<string, any>) {
      const modelGroup = new THREE.Group();
      modelGroup.name = `webgpu-model-${modelId}`;
      root.add(modelGroup);

      const modelObj = model?.object as THREE.Object3D | undefined;
      if (modelObj) {
        modelObj.updateMatrixWorld(true);
        modelGroup.position.copy(modelObj.position);
        modelGroup.quaternion.copy(modelObj.quaternion);
        modelGroup.scale.copy(modelObj.scale);
      }

      const itemIds = await this.getItemIdsWithGeometry(model);
      if (itemIds.length === 0) continue;

      // Load materials and samples for correct coloring
      const realMaterialsMap = await this.loadRealMaterials(model);
      const sampleToMaterialId = await this.loadSamples(model);
      const localIdToCategory = await this.loadCategories(model, itemIds);
      const localIdToMaterialDef = await this.loadMaterialDefinitions(model, itemIds);

      const shouldUseCategoryColors = this.checkIfShouldUseCategoryColors(localIdToMaterialDef);

      const geometriesByMaterial = new Map<string, { 
        geometries: THREE.BufferGeometry[]; 
        material: THREE.MeshStandardMaterial;
        category?: string;
      }>();

      const CHUNK_SIZE = 100;
      for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
        const chunkIds = itemIds.slice(i, i + CHUNK_SIZE);
        
        const activeChunkIds = chunkIds.filter(id => {
          const cat = localIdToCategory.get(id);
          if (cat && options.hiddenCategories.has(cat)) return false;
          const hidden = options.hiddenElements.get(modelId);
          if (hidden && hidden.has(id)) return false;
          return true;
        });

        if (activeChunkIds.length === 0) continue;

        const geometriesArray = await model.getItemsGeometry(activeChunkIds);

        for (let j = 0; j < activeChunkIds.length; j++) {
          const itemId = activeChunkIds[j];
          let geometries = geometriesArray[j];
          
          const itemCategory = localIdToCategory.get(itemId);
          const isGhost = options.isolatedElements && (!options.isolatedElements.get(modelId)?.has(itemId));

          if (!geometries || geometries.length === 0) {
            try {
              const children = await model.getItemsChildren([itemId]);
              if (children && children.length > 0) {
                const childrenGeometriesArray = await model.getItemsGeometry(children);
                geometries = childrenGeometriesArray.flat();
              }
            } catch { /* ignore */ }
          }

          if (!geometries || geometries.length === 0) continue;

          for (const meshData of geometries) {
            if (!meshData?.positions) continue;

            const localIdForMesh = typeof meshData.localId === 'number' ? meshData.localId : itemId;
            const meshCategory = localIdToCategory.get(localIdForMesh) || itemCategory;
            
            // Resolve Material
            let materialForMesh: THREE.MeshStandardMaterial | null = null;

            if (isGhost) {
              materialForMesh = options.getGhostMaterial();
            } else if (options.colorSplashActive && meshCategory) {
              const upperCat = meshCategory.toUpperCase();
              let splashColor = options.colorSplashColors.get(upperCat);
              
              if (!splashColor) {
                // Try prefix match (e.g. IFCWALLSTANDARDCASE matches IFCWALL)
                for (const [cat, color] of options.colorSplashColors.entries()) {
                  const upperTarget = cat.toUpperCase();
                  if (upperCat.startsWith(upperTarget)) {
                    splashColor = color;
                    break;
                  }
                }
              }

              if (splashColor) {
                materialForMesh = this.materialFactory.getOrCreateColorSplashMaterial(splashColor);
              }
            } else if (options.slicerActive) {
              const customColor = options.slicerColors.get(modelId)?.get(localIdForMesh);
              if (customColor) materialForMesh = this.materialFactory.getOrCreateSlicerMaterial(customColor);
            }

            if (!materialForMesh) {
              const sampleId = (meshData as any).sampleId;
              const matId = sampleToMaterialId.get(sampleId);
              if (typeof matId === 'number') {
                const rawMat = realMaterialsMap.get(matId);
                if (rawMat) materialForMesh = this.materialFactory.getOrCreateRealMaterial(matId, rawMat);
              }
            }

            if (!materialForMesh && shouldUseCategoryColors && meshCategory) {
              materialForMesh = this.categoryPalette.getMaterial(meshCategory);
            }

            if (!materialForMesh) {
              const def = localIdToMaterialDef.get(localIdForMesh);
              materialForMesh = def 
                ? this.materialFactory.getOrCreateMaterialFromDefinition(def)
                : this.materialFactory.getSharedMaterial();
            }

            // Ensure we have a material (fallback to shared if all else fails)
            if (!materialForMesh) {
              materialForMesh = this.materialFactory.getSharedMaterial();
            }

            // Build Geometry
            const geometry = new THREE.BufferGeometry();
            const posArray = meshData.positions instanceof Float64Array ? new Float32Array(meshData.positions) : meshData.positions;
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));

            if (meshData.normals && meshData.normals.length > 0) {
              const n = meshData.normals;
              const out = new Float32Array(n.length);
              const scale = 1 / 32767;
              for (let k = 0; k < n.length; k++) out[k] = n[k] * scale;
              geometry.setAttribute('normal', new THREE.Float32BufferAttribute(out, 3));
            } else {
              geometry.computeVertexNormals();
            }

            if (meshData.indices) {
              geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.indices, 1));
            }

            if (meshData.transform) {
              geometry.applyMatrix4(meshData.transform);
            }

            // Color Picking
            if (options.colorPicker && options.colorPickingEnabled) {
              const elementId = options.colorPicker.registerElement({
                localId: localIdForMesh,
                modelId,
                category: meshCategory,
              });
              options.colorPicker.createElementColorAttribute(geometry, elementId);
              geometry.userData.elementId = elementId;
            }

            if (options.geometryMerging) {
              const matKey = this.getMaterialKey(materialForMesh, options.colorSplashActive ? meshCategory : undefined);
              if (!geometriesByMaterial.has(matKey)) {
                geometriesByMaterial.set(matKey, { geometries: [], material: materialForMesh, category: meshCategory });
              }
              geometriesByMaterial.get(matKey)!.geometries.push(geometry);
            } else {
              const mesh = new THREE.Mesh(geometry, materialForMesh);
              mesh.castShadow = options.shadows;
              mesh.receiveShadow = options.shadows;
              mesh.frustumCulled = options.frustumCulling;
              modelGroup.add(mesh);
              this.createdGeometries.push(geometry);
              
              if (options.elementSelector && geometry.userData.elementId) {
                const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
                options.elementSelector.registerElementLocation(geometry.userData.elementId, mesh, 0, count);
              }
            }
          }
        }
        await new Promise<void>(r => setTimeout(r, 0));
      }

      // Merge Geometries
      if (options.geometryMerging) {
        for (const [matKey, { geometries, material }] of geometriesByMaterial) {
          if (geometries.length === 0) continue;
          const isGhost = material === options.getGhostMaterial();
          const maxVertices = isGhost ? 65535 : 65535 * 3;
          
          let currentBatch: THREE.BufferGeometry[] = [];
          let currentVertexCount = 0;

          const flush = () => {
            if (currentBatch.length === 0) return;
            try {
              const merged = currentBatch.length === 1 ? currentBatch[0] : mergeGeometries(currentBatch, false);
              if (merged) {
                const mesh = new THREE.Mesh(merged, material);
                mesh.castShadow = !isGhost && options.shadows;
                mesh.receiveShadow = !isGhost && options.shadows;
                mesh.frustumCulled = options.frustumCulling;
                modelGroup.add(mesh);
                this.createdGeometries.push(merged);
                this.mergedMeshes.push(mesh);

                if (options.elementSelector) {
                  let offset = 0;
                  for (const geo of currentBatch) {
                    const eid = geo.userData.elementId;
                    const count = geo.index ? geo.index.count : geo.attributes.position.count;
                    if (eid) options.elementSelector.registerElementLocation(eid, mesh, offset, count);
                    offset += count;
                  }
                }
              }
            } catch (e) {
              console.warn('Merge failed:', e);
            }
            currentBatch = [];
            currentVertexCount = 0;
          };

          for (const geo of geometries) {
            const count = geo.attributes.position.count;
            if (currentVertexCount + count > maxVertices) flush();
            currentBatch.push(geo);
            currentVertexCount += count;
          }
          flush();
        }
      }
    }

    options.updateShadowBounds();
    return { scene: proxy, kind: 'fragments' };
  }

  private getMaterialKey(mat: THREE.MeshStandardMaterial, category?: string): string {
    if (category) return `splash_${category}`;
    const c = mat.color;
    return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${mat.opacity.toFixed(3)},${mat.transparent ? 1 : 0}`;
  }

  private async getItemIdsWithGeometry(model: any): Promise<number[]> {
    if (typeof model?.getItemsIdsWithGeometry === 'function') return await model.getItemsIdsWithGeometry();
    if (typeof model?.getItemsWithGeometry === 'function') {
      const res = await model.getItemsWithGeometry();
      return Array.isArray(res) ? res.map((it: any) => typeof it === 'number' ? it : it?.localId ?? it?.id).filter((v: any) => typeof v === 'number') : [];
    }
    return [];
  }

  private async loadRealMaterials(model: any) {
    const map = new Map<number, { r: number; g: number; b: number; a?: number }>();
    try {
      if (typeof model?.getMaterials === 'function') {
        const all = await model.getMaterials();
        if (all instanceof Map) {
          for (const [id, m] of all) map.set(id, { r: (m as any).r ?? 200, g: (m as any).g ?? 200, b: (m as any).b ?? 200, a: (m as any).a });
        }
      }
    } catch { /* ignore */ }
    return map;
  }

  private async loadSamples(model: any) {
    const map = new Map<number, number>();
    try {
      if (typeof model?.getSamples === 'function') {
        const all = await model.getSamples();
        if (all instanceof Map) {
          for (const [id, s] of all) if (typeof (s as any).material === 'number') map.set(id, (s as any).material);
        }
      }
    } catch { /* ignore */ }
    return map;
  }

  private async loadCategories(model: any, itemIds: number[]) {
    const map = new Map<number, string>();
    try {
      // Method 1: Direct bulk query (fastest)
      if (typeof model?.getItemsWithGeometryCategories === 'function') {
        const cats = await model.getItemsWithGeometryCategories();
        if (Array.isArray(cats)) {
          for (let i = 0; i < Math.min(itemIds.length, cats.length); i++) {
            if (typeof itemIds[i] === 'number' && typeof cats[i] === 'string') {
              map.set(itemIds[i], cats[i].toUpperCase()); // Normalize to uppercase for matching
            }
          }
          if (map.size > 0) return map;
        }
      }

      // Method 2: Category-based query (fallback)
      if (typeof model?.getCategories === 'function' && typeof model?.getItemsOfCategories === 'function') {
        const categories = await model.getCategories();
        if (Array.isArray(categories)) {
          for (const category of categories) {
            const upperCat = category.toUpperCase();
            const categoryRegex = new RegExp(`^${category}$`);
            const items = await model.getItemsOfCategories([categoryRegex]);
            // items is usually an object like { "IFCWALL": [1, 2, 3] }
            for (const key in items) {
              if (Array.isArray(items[key])) {
                for (const id of items[key]) {
                  map.set(id, upperCat);
                }
              }
            }
          }
          if (map.size > 0) return map;
        }
      }
    } catch (e) { 
      console.warn('⚠️ Failed to load categories for WebGPU proxy:', e);
    }
    return map;
  }

  private async loadMaterialDefinitions(model: any, itemIds: number[]) {
    const map = new Map<number, any>();
    if (typeof model?.getItemsMaterialDefinition !== 'function') return map;
    const chunkSize = 250;
    for (let i = 0; i < itemIds.length; i += chunkSize) {
      try {
        const chunk = itemIds.slice(i, i + chunkSize);
        const defs = await model.getItemsMaterialDefinition(chunk);
        if (Array.isArray(defs)) {
          for (const entry of defs) {
            const def = entry?.definition;
            const ids = entry?.localIds;
            if (def && ids) {
              if (Array.isArray(ids)) for (const id of ids) map.set(id, def);
              else if (ids instanceof Set) for (const id of ids) map.set(id, def);
            }
          }
        }
      } catch { /* ignore */ }
    }
    return map;
  }

  private checkIfShouldUseCategoryColors(defs: Map<number, any>): boolean {
    const uniqueRgb = new Set<string>();
    for (const def of defs.values()) {
      const c = def?.color;
      if (c) uniqueRgb.add(`${c.r},${c.g},${c.b}`);
      if (uniqueRgb.size > 8) return false;
    }
    return uniqueRgb.size <= 8;
  }

  /**
   * Prepares a scene for WebGPU by swapping materials and sanitizing geometries in-place.
   * This is used when fragments are not available or when rendering the original scene.
   */
  public async tryBuildProxySceneInPlace(originalScene: THREE.Scene, options: WebGPUInPlaceOptions): Promise<boolean> {
    console.log('🔄 Preparing WebGPU scene (in-place material swap)...');

    // Ensure matrices are up-to-date
    originalScene.updateMatrixWorld(true);

    let swapped = 0;
    let hiddenUnsupported = 0;

    originalScene.traverse((obj) => {
      // Disable WebGL-specific callbacks
      if (typeof (obj as any).onBeforeRender === 'function') {
        if (!options.onBeforeRenderBackup.has(obj.uuid)) {
          options.onBeforeRenderBackup.set(obj.uuid, (obj as any).onBeforeRender);
        }
        (obj as any).onBeforeRender = () => {};
      }
      if (typeof (obj as any).onAfterRender === 'function') {
        if (!options.onAfterRenderBackup.has(obj.uuid)) {
          options.onAfterRenderBackup.set(obj.uuid, (obj as any).onAfterRender);
        }
        (obj as any).onAfterRender = () => {};
      }

      // Hide unsupported primitive types
      if (obj instanceof THREE.Line || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
        if (!options.visibilityBackup.has(obj.uuid)) {
          options.visibilityBackup.set(obj.uuid, obj.visible);
        }
        obj.visible = false;
        hiddenUnsupported++;
        return;
      }

      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        const mesh = obj as THREE.Mesh;

        // Sanitize geometry
        if (mesh.geometry && mesh.geometry instanceof THREE.BufferGeometry) {
          try {
            if (!options.geometryBackup.has(mesh.uuid)) {
              options.geometryBackup.set(mesh.uuid, mesh.geometry);
            }

            const sanitized = this.sanitizeGeometryForWebGPU(mesh.geometry);
            mesh.geometry = sanitized;
            this.createdGeometries.push(sanitized);
          } catch (e) {
            if (!options.visibilityBackup.has(mesh.uuid)) {
              options.visibilityBackup.set(mesh.uuid, mesh.visible);
            }
            mesh.visible = false;
            hiddenUnsupported++;
            return;
          }
        }

        // Swap material
        if (!options.materialBackup.has(mesh.uuid)) {
          options.materialBackup.set(mesh.uuid, mesh.material);
        }
        try {
          mesh.material = this.materialFactory.createCompatibleMaterial(mesh.material) as any;
          swapped++;
        } catch (e) {
          if (!options.visibilityBackup.has(mesh.uuid)) {
            options.visibilityBackup.set(mesh.uuid, mesh.visible);
          }
          mesh.visible = false;
          hiddenUnsupported++;
        }

        mesh.frustumCulled = options.frustumCulling;
      }
    });

    console.log(`✅ WebGPU scene prepared: swappedMaterials=${swapped}, hiddenUnsupported=${hiddenUnsupported}`);
    return true;
  }
}
