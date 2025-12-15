/**
 * WebGPU Geometry Utilities
 * Helper functions for geometry manipulation and conversion
 */

import * as THREE from 'three';

/**
 * Check if a value is a TypedArray view
 */
export function isTypedArrayView(value: any): boolean {
  return !!value && ArrayBuffer.isView(value) && !(value instanceof DataView);
}

/**
 * Convert any array-like to Float32Array
 */
export function toFloat32Array(value: any): Float32Array | null {
  if (value === undefined || value === null) return null;
  if (isTypedArrayView(value)) return new Float32Array(value as any);
  if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) {
    return new Float32Array(value as any);
  }
  if (Array.isArray(value)) return new Float32Array(value);
  return null;
}

/**
 * Convert any array-like to Uint32Array
 */
export function toUint32Array(value: any): Uint32Array | null {
  if (value === undefined || value === null) return null;
  if (isTypedArrayView(value)) return new Uint32Array(value as any);
  if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) {
    return new Uint32Array(value as any);
  }
  if (Array.isArray(value)) return new Uint32Array(value);
  return null;
}

/**
 * Copy buffer attribute as Float32 (for WebGPU compatibility)
 */
export function copyAttributeAsFloat32(attr: any): THREE.BufferAttribute | null {
  if (!attr) return null;

  const itemSize: number = attr.itemSize;
  const count: number = attr.count;
  if (!itemSize || !count) return null;

  // InterleavedBufferAttribute: de-interleave from underlying data array
  if ((attr.isInterleavedBufferAttribute || attr.data?.stride !== undefined) && attr.data) {
    const raw = attr.data.array;
    const src = toFloat32Array(raw);
    const stride: number = attr.data.stride;
    const offset: number = attr.offset;

    if (src === null) return null;
    if (!stride && stride !== 0) return null;
    if (offset === undefined || offset === null) return null;

    const out = new Float32Array(count * itemSize);
    for (let i = 0; i < count; i++) {
      const base = i * stride + offset;
      for (let k = 0; k < itemSize; k++) {
        out[i * itemSize + k] = (src as any)[base + k] ?? 0;
      }
    }
    return new THREE.BufferAttribute(out, itemSize, !!attr.normalized);
  }

  // Fast path: attribute has array-like storage
  {
    const direct = toFloat32Array(attr.array);
    if (direct) {
      return new THREE.BufferAttribute(direct, itemSize, !!attr.normalized);
    }
  }

  // If array is missing, don't attempt getComponent (it can crash)
  if (attr.array === undefined || attr.array === null) {
    return null;
  }

  // Fallback: sample via getComponent
  if (typeof attr.getComponent === 'function') {
    try {
      const out = new Float32Array(count * itemSize);
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < itemSize; k++) {
          out[i * itemSize + k] = attr.getComponent(i, k);
        }
      }
      return new THREE.BufferAttribute(out, itemSize, !!attr.normalized);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Convert Int16 normals to Float32 (required for WebGPU)
 * WebGPU requires vertex buffer stride to be a multiple of 4 bytes.
 * Int16 vec3 = 6 bytes → INVALID for WebGPU
 * Float32 vec3 = 12 bytes → valid for WebGPU
 */
export function convertNormalsToFloat32(normals: Int16Array | Float32Array | Float64Array): Float32Array {
  if (normals instanceof Float32Array) return normals;
  
  const out = new Float32Array(normals.length);
  
  if (normals instanceof Int16Array) {
    const scale = 1 / 32767; // Int16 normalized range
    for (let i = 0; i < normals.length; i++) {
      out[i] = normals[i] * scale;
    }
  } else {
    // Float64 to Float32
    for (let i = 0; i < normals.length; i++) {
      out[i] = normals[i];
    }
  }
  
  return out;
}

/**
 * Sanitize geometry for WebGPU compatibility
 * Converts all attributes to proper Float32/Uint32 format
 */
export function sanitizeGeometryForWebGPU(src: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const position = copyAttributeAsFloat32(src.getAttribute('position'));
  if (!position || position.count === 0) return null;

  const next = new THREE.BufferGeometry();
  next.setAttribute('position', position);

  const normal = copyAttributeAsFloat32(src.getAttribute('normal'));
  if (normal && normal.count === position.count) {
    next.setAttribute('normal', normal);
  }

  const uv = copyAttributeAsFloat32(src.getAttribute('uv'));
  if (uv && uv.count === position.count) {
    next.setAttribute('uv', uv);
  }

  // Copy index if valid
  const idx: any = src.getIndex();
  if (idx && idx.count > 0) {
    const idxArray = toUint32Array(idx.array);
    if (idxArray) {
      next.setIndex(new THREE.BufferAttribute(idxArray, 1));
    } else if (typeof idx.getX === 'function') {
      try {
        const out = new Uint32Array(idx.count);
        for (let i = 0; i < idx.count; i++) out[i] = idx.getX(i);
        next.setIndex(new THREE.BufferAttribute(out, 1));
      } catch {
        // Skip index if not readable
      }
    }
  }

  next.computeBoundingBox();
  next.computeBoundingSphere();
  return next;
}

/**
 * Create a WebGPU-compatible material from any THREE material
 */
export function createCompatibleMaterial(
  original: THREE.Material | THREE.Material[],
  options?: {
    useStandard?: boolean;
    roughness?: number;
    metalness?: number;
  }
): THREE.Material {
  const base = Array.isArray(original) ? original[0] : original;
  const opts = options || {};

  // Extract color
  let color: any = 0x888888;
  if (base && (base as any).color) {
    color = (base as any).color;
  } else if (base && (base as any).uniforms?.diffuse?.value) {
    color = (base as any).uniforms.diffuse.value;
  }

  const transparent = !!(base && (base as any).transparent);
  const opacity = (base && typeof (base as any).opacity === 'number') ? (base as any).opacity : 1.0;
  const side = (base as any)?.side ?? THREE.DoubleSide;

  if (opts.useStandard) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 1,
      metalness: opts.metalness ?? 0,
      side,
      transparent,
      opacity,
    });
  }

  return new THREE.MeshBasicMaterial({
    color,
    side,
    transparent,
    opacity,
    wireframe: !!(base && (base as any).wireframe)
  });
}
