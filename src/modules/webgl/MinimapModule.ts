/**
 * MinimapModule
 * Provides a minimap overlay for first-person walking mode
 * Shows the user's position and viewing direction on a 2D floor plan
 */

import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { FloorPlanModule, StoreyInfo, FloorPlanSnapshot } from './FloorPlanModule';

const DEFAULT_PLANE_NORMAL = new THREE.Vector3(0, 1, 0);
const DEFAULT_PLANE_RIGHT = new THREE.Vector3(0, 0, 1);
const DEFAULT_PLANE_UP = new THREE.Vector3(1, 0, 0);

export interface MinimapConfig {
  width: number;
  height: number;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  zoom: number; // Camera zoom level for minimap
  opacity: number; // 0-1
}

export class MinimapModule {
  private components: OBC.Components;
  private world: OBC.World;
  private floorPlan: FloorPlanModule;
  private container: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private minimapCamera: THREE.OrthographicCamera | null = null;
  private minimapScene: THREE.Scene | null = null;
  private userMarker: THREE.Mesh | null = null;
  private viewCone: THREE.Mesh | null = null;
  private isEnabled: boolean = false;
  private animationFrameId: number | null = null;
  private currentStorey: StoreyInfo | null = null;
  private activeSnapshot: FloorPlanSnapshot | null = null;
  private geometryCenter: THREE.Vector3 = new THREE.Vector3(0, 0, 0); // Center of loaded geometry
  private lastDebugLog: number = 0;
  private mirrorHorizontalAxis = true;
  private floorPlanViewMargin = 0.85; // Reduce to zoom in more (was 1.15)
  private scratchPosition: THREE.Vector3 = new THREE.Vector3();
  private scratchDirection: THREE.Vector3 = new THREE.Vector3();
  private scratchOffset: THREE.Vector3 = new THREE.Vector3();
  private scratchProjected: THREE.Vector3 = new THREE.Vector3();
  private scratchPlane: THREE.Plane = new THREE.Plane();
  
  // Minimap interaction state (for panning inside minimap)
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private cameraOffsetX: number = 0;
  private cameraOffsetZ: number = 0;
  private currentZoomLevel: number = 1;
  private minZoom: number = 0.5;
  private maxZoom: number = 4;
  
  // Minimap window dragging state
  private isWindowDragging: boolean = false;
  private windowDragStartX: number = 0;
  private windowDragStartY: number = 0;
  private windowPosX: number = 0;
  private windowPosY: number = 0;
  
  // Minimize state
  private isMinimized: boolean = false;
  
  private config: MinimapConfig = {
    width: 300,
    height: 300,
    position: 'bottom-right',
    zoom: 50, // Orthographic camera size
    opacity: 0.9
  };

  constructor(components: OBC.Components, world: OBC.World, floorPlan: FloorPlanModule) {
    this.components = components;
    this.world = world;
    this.floorPlan = floorPlan;
  }

  /**
   * Initialize the minimap module
   */
  async initialize(): Promise<void> {
    console.log('🗺️ Initializing minimap module...');
    
    // Create minimap container
    this.createMinimapContainer();
    
    // Create minimap scene and camera
    this.setupMinimapScene();
    
    console.log('✅ Minimap module initialized');
  }

  /**
   * Create the HTML container for the minimap
   */
  private createMinimapContainer(): void {
    // Create outer wrapper for title + minimap
    const wrapper = document.createElement('div');
    wrapper.id = 'minimap-wrapper';
    wrapper.style.position = 'fixed';
    wrapper.style.zIndex = '1000';
    wrapper.style.display = 'none'; // Hidden by default
    
    // Create title bar above minimap (draggable)
    const titleBar = document.createElement('div');
    titleBar.id = 'minimap-title-bar';
    titleBar.style.display = 'flex';
    titleBar.style.justifyContent = 'space-between';
    titleBar.style.alignItems = 'center';
    titleBar.style.background = '#363c6a';
    titleBar.style.color = 'white';
    titleBar.style.padding = '6px 10px';
    titleBar.style.borderRadius = '8px 8px 0 0';
    titleBar.style.fontSize = '12px';
    titleBar.style.fontWeight = 'bold';
    titleBar.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
    titleBar.style.cursor = 'move';
    titleBar.style.userSelect = 'none';
    
    // Setup window dragging on title bar
    this.setupWindowDragging(titleBar, wrapper);
    
    // Title text with drag hint
    const titleText = document.createElement('span');
    titleText.innerHTML = '<i class="fas fa-grip-vertical" style="margin-right: 6px; color: rgba(255,255,255,0.4);"></i><i class="fas fa-map-marked-alt" style="margin-right: 6px; color: #4dabf7;"></i>Minimap';
    titleText.title = 'Drag to move';
    titleBar.appendChild(titleText);
    
    // Controls container (zoom buttons + minimize + close)
    const controlsContainer = document.createElement('div');
    controlsContainer.style.display = 'flex';
    controlsContainer.style.alignItems = 'center';
    controlsContainer.style.gap = '4px';
    
    // Helper function to create control buttons
    const createControlBtn = (icon: string, title: string, onClick: () => void, id?: string) => {
      const btn = document.createElement('button');
      if (id) btn.id = id;
      btn.innerHTML = `<i class="fas ${icon}"></i>`;
      btn.style.background = 'transparent';
      btn.style.border = 'none';
      btn.style.color = 'rgba(255,255,255,0.6)';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '12px';
      btn.style.padding = '2px 6px';
      btn.style.borderRadius = '4px';
      btn.style.transition = 'all 0.2s ease';
      btn.title = title;
      btn.onmouseenter = () => {
        btn.style.background = 'rgba(255,255,255,0.15)';
        btn.style.color = 'white';
      };
      btn.onmouseleave = () => {
        btn.style.background = 'transparent';
        btn.style.color = 'rgba(255,255,255,0.6)';
      };
      btn.onclick = (e) => {
        e.stopPropagation(); // Prevent drag from triggering
        onClick();
      };
      return btn;
    };
    
    // Zoom in button
    const zoomInBtn = createControlBtn('fa-search-plus', 'Zoom In', () => {
      this.currentZoomLevel = Math.min(this.maxZoom, this.currentZoomLevel * 1.2);
      this.applyMinimapZoom();
    });
    controlsContainer.appendChild(zoomInBtn);
    
    // Zoom out button
    const zoomOutBtn = createControlBtn('fa-search-minus', 'Zoom Out', () => {
      this.currentZoomLevel = Math.max(this.minZoom, this.currentZoomLevel * 0.8);
      this.applyMinimapZoom();
    });
    controlsContainer.appendChild(zoomOutBtn);
    
    // Reset view button
    const resetBtn = createControlBtn('fa-compress-arrows-alt', 'Reset View (Double-click)', () => {
      this.resetMinimapView();
    });
    controlsContainer.appendChild(resetBtn);
    
    // Separator
    const separator = document.createElement('span');
    separator.style.width = '1px';
    separator.style.height = '14px';
    separator.style.background = 'rgba(255,255,255,0.2)';
    separator.style.margin = '0 4px';
    controlsContainer.appendChild(separator);
    
    // Minimize button
    const minimizeBtn = createControlBtn('fa-window-minimize', 'Minimize', () => {
      this.toggleMinimize();
    }, 'minimap-minimize-btn');
    controlsContainer.appendChild(minimizeBtn);
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.id = 'minimap-close-btn';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.color = 'rgba(255,255,255,0.6)';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '14px';
    closeBtn.style.padding = '2px 6px';
    closeBtn.style.borderRadius = '4px';
    closeBtn.style.transition = 'all 0.2s ease';
    closeBtn.title = 'Close Minimap';
    closeBtn.onmouseenter = () => {
      closeBtn.style.background = 'rgba(255,100,100,0.3)';
      closeBtn.style.color = '#ff6b6b';
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.background = 'transparent';
      closeBtn.style.color = 'rgba(255,255,255,0.6)';
    };
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.disable();
      // Also update the minimap button state
      const minimapBtn = document.getElementById('minimapBtn');
      if (minimapBtn) {
        minimapBtn.classList.remove('active');
        const label = minimapBtn.querySelector('.label');
        if (label) label.textContent = 'Show Minimap';
      }
    };
    controlsContainer.appendChild(closeBtn);
    
    titleBar.appendChild(controlsContainer);
    
    wrapper.appendChild(titleBar);
    
    // Create minimap container
    this.container = document.createElement('div');
    this.container.id = 'minimap-container';
    this.container.style.width = `${this.config.width}px`;
    this.container.style.height = `${this.config.height}px`;
    this.container.style.overflow = 'hidden';
    this.container.style.background = '#1a1a2e';
    this.container.style.borderRadius = '0 0 8px 8px';
    this.container.style.opacity = String(this.config.opacity);
    
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'grab';
    
    // Add mouse event handlers for zoom and drag
    this.setupMinimapInteraction();
    
    this.container.appendChild(this.canvas);
    wrapper.appendChild(this.container);
    
    // Apply wrapper styling
    wrapper.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4)';
    wrapper.style.borderRadius = '8px';
    wrapper.style.border = '1px solid rgba(255,255,255,0.1)';
    
    // Store wrapper reference for position updates
    (this.container as any)._wrapper = wrapper;
    
    // Position based on config
    this.updateContainerPosition();
    
    document.body.appendChild(wrapper);
  }

  /**
   * Setup mouse interaction for zoom and drag on minimap
   */
  private setupMinimapInteraction(): void {
    if (!this.canvas) return;

    // Mouse wheel for zoom
    this.canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1; // Zoom out or in
      this.currentZoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.currentZoomLevel * zoomDelta));
      
      this.applyMinimapZoom();
    }, { passive: false });

    // Mouse down for drag start
    this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) { // Left click only
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.canvas!.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });

    // Mouse move for dragging
    this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isDragging || !this.minimapCamera) return;
      
      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      
      // Calculate world units per pixel based on camera frustum
      const frustumWidth = this.minimapCamera.right - this.minimapCamera.left;
      const frustumHeight = this.minimapCamera.top - this.minimapCamera.bottom;
      const worldPerPixelX = frustumWidth / (this.config.width * this.minimapCamera.zoom);
      const worldPerPixelZ = frustumHeight / (this.config.height * this.minimapCamera.zoom);
      
      // Update camera offset (invert for natural drag direction)
      this.cameraOffsetX -= deltaX * worldPerPixelX;
      this.cameraOffsetZ -= deltaY * worldPerPixelZ;
      
      // Apply the offset to camera position
      this.minimapCamera.position.x = this.geometryCenter.x + this.cameraOffsetX;
      this.minimapCamera.position.z = this.geometryCenter.z + this.cameraOffsetZ;
      this.minimapCamera.lookAt(
        this.geometryCenter.x + this.cameraOffsetX,
        0,
        this.geometryCenter.z + this.cameraOffsetZ
      );
      
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
    });

    // Mouse up for drag end
    this.canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.canvas!.style.cursor = 'grab';
    });

    // Mouse leave also ends drag
    this.canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
      this.canvas!.style.cursor = 'grab';
    });

    // Double-click to reset view
    this.canvas.addEventListener('dblclick', (e: MouseEvent) => {
      e.preventDefault();
      this.resetMinimapView();
    });
  }

  /**
   * Apply current zoom level to minimap camera
   */
  private applyMinimapZoom(): void {
    if (!this.minimapCamera) return;
    
    // Store the base zoom from the snapshot and multiply by our zoom level
    const baseZoom = this.activeSnapshot ? (this.activeSnapshot.cameraFrustum.zoom ?? 1) * 2.5 : 1;
    this.minimapCamera.zoom = baseZoom * this.currentZoomLevel;
    this.minimapCamera.updateProjectionMatrix();
  }

  /**
   * Reset minimap view to default (center and zoom)
   */
  private resetMinimapView(): void {
    this.currentZoomLevel = 1;
    this.cameraOffsetX = 0;
    this.cameraOffsetZ = 0;
    
    if (this.minimapCamera) {
      this.applyMinimapZoom();
      this.minimapCamera.position.x = this.geometryCenter.x;
      this.minimapCamera.position.z = this.geometryCenter.z;
      this.minimapCamera.lookAt(this.geometryCenter.x, 0, this.geometryCenter.z);
    }
    
    console.log('🗺️ Minimap view reset');
  }

  /**
   * Setup window dragging on the title bar
   */
  private setupWindowDragging(titleBar: HTMLElement, wrapper: HTMLElement): void {
    titleBar.addEventListener('mousedown', (e: MouseEvent) => {
      // Only start drag if not clicking on a button
      if ((e.target as HTMLElement).closest('button')) return;
      
      this.isWindowDragging = true;
      this.windowDragStartX = e.clientX;
      this.windowDragStartY = e.clientY;
      
      // Get current position
      const rect = wrapper.getBoundingClientRect();
      this.windowPosX = rect.left;
      this.windowPosY = rect.top;
      
      // Clear any position presets
      wrapper.style.top = `${rect.top}px`;
      wrapper.style.left = `${rect.left}px`;
      wrapper.style.right = '';
      wrapper.style.bottom = '';
      
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isWindowDragging) return;
      
      const deltaX = e.clientX - this.windowDragStartX;
      const deltaY = e.clientY - this.windowDragStartY;
      
      let newX = this.windowPosX + deltaX;
      let newY = this.windowPosY + deltaY;
      
      // Constrain to viewport
      const wrapperRect = wrapper.getBoundingClientRect();
      const maxX = window.innerWidth - wrapperRect.width;
      const maxY = window.innerHeight - wrapperRect.height;
      
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
      
      wrapper.style.left = `${newX}px`;
      wrapper.style.top = `${newY}px`;
    });

    document.addEventListener('mouseup', () => {
      this.isWindowDragging = false;
    });
  }

  /**
   * Toggle minimize state of minimap
   */
  private toggleMinimize(): void {
    if (!this.container) return;
    
    this.isMinimized = !this.isMinimized;
    
    const minimizeBtn = document.getElementById('minimap-minimize-btn');
    const wrapper = (this.container as any)._wrapper as HTMLElement;
    
    if (this.isMinimized) {
      // Minimize - hide the container, keep title bar
      this.container.style.display = 'none';
      
      // Update title bar to show it's minimized
      if (wrapper) {
        wrapper.style.borderRadius = '8px';
        const titleBar = wrapper.querySelector('#minimap-title-bar') as HTMLElement;
        if (titleBar) {
          titleBar.style.borderRadius = '8px';
          titleBar.style.borderBottom = 'none';
        }
      }
      
      // Update button icon to restore
      if (minimizeBtn) {
        minimizeBtn.innerHTML = '<i class="fas fa-window-maximize"></i>';
        minimizeBtn.title = 'Restore';
      }
      
      console.log('🗺️ Minimap minimized');
    } else {
      // Restore - show the container
      this.container.style.display = 'block';
      
      // Restore title bar styling
      if (wrapper) {
        wrapper.style.borderRadius = '8px';
        const titleBar = wrapper.querySelector('#minimap-title-bar') as HTMLElement;
        if (titleBar) {
          titleBar.style.borderRadius = '8px 8px 0 0';
          titleBar.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        }
      }
      
      // Update button icon to minimize
      if (minimizeBtn) {
        minimizeBtn.innerHTML = '<i class="fas fa-window-minimize"></i>';
        minimizeBtn.title = 'Minimize';
      }
      
      console.log('🗺️ Minimap restored');
    }
  }

  /**
   * Update container position based on config
   */
  private updateContainerPosition(): void {
    if (!this.container) return;
    
    // Get the wrapper element
    const wrapper = (this.container as any)._wrapper as HTMLElement;
    if (!wrapper) return;
    
    // Reset all positions
    wrapper.style.top = '';
    wrapper.style.bottom = '';
    wrapper.style.left = '';
    wrapper.style.right = '';
    
    const margin = '20px';
    
    switch (this.config.position) {
      case 'top-left':
        wrapper.style.top = margin;
        wrapper.style.left = margin;
        break;
      case 'top-right':
        wrapper.style.top = margin;
        wrapper.style.right = margin;
        break;
      case 'bottom-left':
        wrapper.style.bottom = margin;
        wrapper.style.left = margin;
        break;
      case 'bottom-right':
        wrapper.style.bottom = margin;
        wrapper.style.right = margin;
        break;
    }
  }

  /**
   * Setup minimap scene with camera and renderer
   */
  private setupMinimapScene(): void {
    if (!this.canvas) return;
    
    // Create minimap scene
    this.minimapScene = new THREE.Scene();
    this.minimapScene.background = new THREE.Color(0x222222); // Dark background
    
    // Add strong ambient light so everything is fully visible
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    this.minimapScene.add(ambientLight);
    
    // Add directional light from above
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(0, 100, 0);
    this.minimapScene.add(dirLight);
    
    // Create orthographic camera for top-down view
    const aspect = this.config.width / this.config.height;
    const size = this.config.zoom;
    this.minimapCamera = new THREE.OrthographicCamera(
      -size * aspect, // left
      size * aspect,  // right
      size,           // top
      -size,          // bottom
      -500,           // near (negative to see below)
      500             // far (increased range)
    );
    this.minimapCamera.position.set(0, 100, 0); // Top-down view
    this.minimapCamera.lookAt(0, 0, 0);
    
    // Add test geometries to verify rendering works
    const testBox = new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
    );
    testBox.position.set(0, 0, 0);
    this.minimapScene.add(testBox);
    console.log('🎯 Added test box at origin for debugging');
    
    // Create WebGL renderer for minimap
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false // Disable alpha for solid background
    });
    this.renderer.setSize(this.config.width, this.config.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0xffffff, 1); // White background for floor plan
    this.renderer.localClippingEnabled = true; // Enable clipping planes for floor plan view
    
    // Create user position marker (circle)
    const markerGeometry = new THREE.CircleGeometry(1, 32);
    const markerMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, // Bright red for visibility
      side: THREE.DoubleSide 
    });
    this.userMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.userMarker.rotation.x = -Math.PI / 2; // Lay flat on XZ plane
    this.userMarker.renderOrder = 10; // Render on top of everything
    this.minimapScene.add(this.userMarker);
    
    // Create view direction cone
    const coneShape = new THREE.Shape();
    coneShape.moveTo(0, 0);
    coneShape.lineTo(-2, -4);
    coneShape.lineTo(2, -4);
    coneShape.lineTo(0, 0);
    
    const coneGeometry = new THREE.ShapeGeometry(coneShape);
    const coneMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, // Bright red for visibility
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    this.viewCone = new THREE.Mesh(coneGeometry, coneMaterial);
    this.viewCone.rotation.x = -Math.PI / 2; // Lay flat on XZ plane
    this.viewCone.renderOrder = 10; // Render on top of everything
    this.minimapScene.add(this.viewCone);
    
    console.log('✅ Minimap scene created');
  }

  /**
   * Enable the minimap display
   * @param storeyName - Optional storey name to display, auto-detects if not provided
   */
  async enable(storeyName?: string): Promise<void> {
    if (this.isEnabled) {
      console.log('ℹ️ Minimap already enabled');
      return;
    }
    
    console.log('🗺️ Enabling minimap...');
    
    // Reset zoom, pan, and minimize state
    this.currentZoomLevel = 1;
    this.cameraOffsetX = 0;
    this.cameraOffsetZ = 0;
    this.isMinimized = false;
    
    // Resolve storey information
    if (!storeyName) {
      const detectedStorey = await this.detectCurrentStorey();
      if (!detectedStorey) {
        console.warn('⚠️ Could not determine current storey for minimap');
        return;
      }
      this.currentStorey = detectedStorey;
      storeyName = detectedStorey.name;
    } else {
      const storeys = await this.floorPlan.getAllStoreys();
      this.currentStorey = storeys.find((storey) => storey.name === storeyName) || null;
      if (!this.currentStorey) {
        console.warn(`⚠️ Storey not found for minimap: ${storeyName}`);
        return;
      }
    }
    
    const loaded = await this.loadFloorPlanToMinimap(storeyName);
    if (!loaded) {
      console.error(`❌ Unable to prepare minimap snapshot for storey: ${storeyName}`);
      return;
    }
    
    // Show wrapper (which contains the container)
    if (this.container) {
      const wrapper = (this.container as any)._wrapper as HTMLElement;
      if (wrapper) {
        wrapper.style.display = 'block';
      }
    }
    
    this.isEnabled = true;
    this.startUpdateLoop();
    
    console.log(`✅ Minimap enabled for storey: ${storeyName}`);
  }

  /**
   * Disable the minimap display
   */
  disable(): void {
    if (!this.isEnabled) return;
    
    console.log('🗺️ Disabling minimap...');
    
    this.isEnabled = false;
    this.stopUpdateLoop();
    
    // Hide wrapper (which contains the container)
    if (this.container) {
      const wrapper = (this.container as any)._wrapper as HTMLElement;
      if (wrapper) {
        wrapper.style.display = 'none';
      }
    }
    
    // Clear floor plan geometry from minimap scene
    this.clearMinimapScene();
    
    console.log('✅ Minimap disabled');
  }

  /**
   * Toggle minimap on/off
   */
  async toggle(storeyName?: string): Promise<void> {
    if (this.isEnabled) {
      this.disable();
    } else {
      await this.enable(storeyName);
    }
  }

  /**
   * Detect current storey based on camera height
   */
  private async detectCurrentStorey(): Promise<StoreyInfo | null> {
    const storeys = await this.floorPlan.getAllStoreys();
    if (storeys.length === 0) return null;
    
    const cameraY = this.world.camera?.three.position.y || 0;
    
    // Find the storey whose elevation is closest to camera Y position
    let closestStorey = storeys[0];
    let minDiff = Math.abs(cameraY - closestStorey.elevation);
    
    for (const storey of storeys) {
      const diff = Math.abs(cameraY - storey.elevation);
      if (diff < minDiff) {
        minDiff = diff;
        closestStorey = storey;
      }
    }
    
    this.currentStorey = closestStorey;
    return closestStorey;
  }

  /**
   * Load floor plan view into minimap by capturing snapshot from FloorPlanModule
   */
  private async loadFloorPlanToMinimap(storeyName: string): Promise<boolean> {
    if (!this.minimapScene) return false;

    console.log(`🖼️ Preparing minimap snapshot for storey: ${storeyName}`);

    // Clear any existing floor plan geometry and textures
    this.clearMinimapScene();

    const snapshot = await this.floorPlan.captureFloorPlanSnapshot(storeyName, {
      offset: 1.5,
      range: 100
    });

    if (!snapshot) {
      console.warn('⚠️ Floor plan snapshot could not be captured');
      return false;
    }

    this.activeSnapshot = snapshot;

    const planeGeometry = new THREE.PlaneGeometry(snapshot.width, snapshot.height);
    const planeMaterial = new THREE.MeshBasicMaterial({
      map: snapshot.texture,
      side: THREE.DoubleSide,
      transparent: false
    });

    const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    planeMesh.rotation.x = -Math.PI / 2;
    planeMesh.position.set(snapshot.center.x, 0, snapshot.center.z);
    planeMesh.userData.isMinimapObject = true;
    this.minimapScene.add(planeMesh);

    this.geometryCenter.copy(snapshot.center);

    console.log(`📐 Floor plan mesh: width=${snapshot.width.toFixed(2)}, height=${snapshot.height.toFixed(2)}`);
    console.log(`📐 Floor plan mesh position: (${snapshot.center.x.toFixed(2)}, 0, ${snapshot.center.z.toFixed(2)})`);
    console.log(`📐 Floor plan covers X: [${(snapshot.center.x - snapshot.width/2).toFixed(2)}, ${(snapshot.center.x + snapshot.width/2).toFixed(2)}]`);
    console.log(`📐 Floor plan covers Z: [${(snapshot.center.z - snapshot.height/2).toFixed(2)}, ${(snapshot.center.z + snapshot.height/2).toFixed(2)}]`);

    this.updateMinimapCamera(snapshot);

    console.log('✅ Minimap floor plan snapshot integrated');
    return true;
  }

  private updateMinimapCamera(snapshot: FloorPlanSnapshot): void {
    const near = 0.1;
    const far = 1000;
    const zoom = (snapshot.cameraFrustum.zoom ?? 1) * 2.5; // Increased zoom multiplier for more zoom

    // Calculate the snapshot's aspect ratio
    const snapshotWidth = Math.abs(snapshot.cameraFrustum.right - snapshot.cameraFrustum.left);
    const snapshotHeight = Math.abs(snapshot.cameraFrustum.top - snapshot.cameraFrustum.bottom);
    const snapshotAspect = snapshotWidth / snapshotHeight;
    
    // Minimap aspect ratio (should be 1.0 for square minimap)
    const minimapAspect = this.config.width / this.config.height;
    
    // Adjust frustum to maintain snapshot aspect ratio within minimap
    let left = snapshot.cameraFrustum.left;
    let right = snapshot.cameraFrustum.right;
    let top = snapshot.cameraFrustum.top;
    let bottom = snapshot.cameraFrustum.bottom;
    
    if (snapshotAspect > minimapAspect) {
      // Snapshot is wider - adjust height
      const targetHeight = snapshotWidth / minimapAspect;
      const heightDiff = (targetHeight - snapshotHeight) / 2;
      top += heightDiff;
      bottom -= heightDiff;
    } else {
      // Snapshot is taller - adjust width  
      const targetWidth = snapshotHeight * minimapAspect;
      const widthDiff = (targetWidth - snapshotWidth) / 2;
      right += widthDiff;
      left -= widthDiff;
    }

    if (!this.minimapCamera) {
      this.minimapCamera = new THREE.OrthographicCamera(
        left,
        right,
        top,
        bottom,
        near,
        far
      );
    } else {
      this.minimapCamera.left = left;
      this.minimapCamera.right = right;
      this.minimapCamera.top = top;
      this.minimapCamera.bottom = bottom;
      this.minimapCamera.near = near;
      this.minimapCamera.far = far;
    }

    this.minimapCamera.zoom = zoom;
    this.minimapCamera.updateProjectionMatrix();

    const cameraHeight = Math.max(Math.abs(snapshot.cameraPosition.y || 0), 50);

    this.minimapCamera.position.set(
      this.geometryCenter.x,
      cameraHeight,
      this.geometryCenter.z
    );
    this.minimapCamera.lookAt(this.geometryCenter.x, 0, this.geometryCenter.z);
    this.minimapCamera.updateProjectionMatrix();
  }
  
  /**
   * This method is no longer needed - keeping for reference
   */
  private async cloneFloorPlanGeometry(floorY: number): Promise<void> {
    // Disabled - we now capture the actual floor plan render
  }

  /**
   * Clear floor plan geometry from minimap scene
   */
  private clearMinimapScene(): void {
    if (this.activeSnapshot) {
      this.activeSnapshot.dispose();
      this.activeSnapshot = null;
    }

    if (!this.minimapScene) return;

    // Remove all meshes except user marker and view cone
    const objectsToRemove: THREE.Object3D[] = [];
    
    this.minimapScene.traverse((object) => {
      if (object !== this.userMarker && 
          object !== this.viewCone && 
          object.type === 'Mesh') {
        objectsToRemove.push(object);
      }
    });
    
    objectsToRemove.forEach(obj => {
      this.minimapScene!.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  private mapWorldToMinimapPosition(source: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    const snapshot = this.activeSnapshot;
    if (!snapshot) {
      return target.copy(source);
    }

    // Map world coordinates directly - the floor plan mesh is already positioned at snapshot.center
    // and the minimap camera is also looking at the same center, so coordinates should match
    target.set(source.x, 0.1, source.z);
    return target;
  }

  /**
   * Start the update loop for minimap
   */
  private startUpdateLoop(): void {
    if (this.animationFrameId !== null) return;
    
    const update = () => {
      if (!this.isEnabled) return;
      
      this.updateMinimapView();
      this.renderMinimap();
      
      this.animationFrameId = requestAnimationFrame(update);
    };
    
    this.animationFrameId = requestAnimationFrame(update);
  }

  /**
   * Stop the update loop
   */
  private stopUpdateLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Update minimap camera and user marker based on main camera position
   */
  private updateMinimapView(): void {
    if (!this.world.camera || !this.userMarker || !this.viewCone) {
      return;
    }
    
    const mainCamera = this.world.camera.three;
    const position = mainCamera.position;
    const minimapPosition = this.mapWorldToMinimapPosition(position, this.scratchPosition);

    // Update user marker position in minimap coordinates (Y=0.1 for overlay visibility)
    this.userMarker.position.set(minimapPosition.x, 0.1, minimapPosition.z);
    this.viewCone.position.set(minimapPosition.x, 0.1, minimapPosition.z);
    
    // Log occasionally for debugging
    const now = Date.now();
    if (!this.lastDebugLog || now - this.lastDebugLog > 5000) {
      console.log(`User marker position (minimap): (${minimapPosition.x.toFixed(2)}, ${minimapPosition.z.toFixed(2)}), Floor plan center: (${this.geometryCenter.x.toFixed(2)}, ${this.geometryCenter.z.toFixed(2)})`);
    }
    
    // Get camera forward direction for view cone rotation
    const direction = this.scratchDirection;
    mainCamera.getWorldDirection(direction);

    // Simple heading calculation in world XZ plane
    const heading = Math.atan2(direction.x, direction.z);
    this.viewCone.rotation.z = heading;
  }

  /**
   * Render the minimap scene
   */
  private renderMinimap(): void {
    if (!this.renderer || !this.minimapCamera || !this.minimapScene) {
      return;
    }
    
    try {
      // Debug log occasionally
      const now = Date.now();
      if (!this.lastDebugLog || now - this.lastDebugLog > 3000) {
        console.log('Minimap rendering:', {
          sceneChildren: this.minimapScene.children.length,
          cameraPos: `(${this.minimapCamera.position.x.toFixed(1)}, ${this.minimapCamera.position.y.toFixed(1)}, ${this.minimapCamera.position.z.toFixed(1)})`,
          objects: this.minimapScene.children.map(c => `${c.type} at (${c.position.x.toFixed(1)}, ${c.position.y.toFixed(1)}, ${c.position.z.toFixed(1)})`)
        });
        this.lastDebugLog = now;
      }
      
      // Render our minimap scene (texture + user marker)
      this.renderer.render(this.minimapScene, this.minimapCamera);
      
    } catch (error) {
      console.error('Error rendering minimap:', error);
    }
  }

  /**
   * Update minimap configuration
   */
  updateConfig(config: Partial<MinimapConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.container) {
      this.container.style.width = `${this.config.width}px`;
      this.container.style.height = `${this.config.height}px`;
      this.container.style.opacity = String(this.config.opacity);
      this.updateContainerPosition();
    }
    
    if (this.canvas && this.renderer) {
      this.canvas.width = this.config.width;
      this.canvas.height = this.config.height;
      this.renderer.setSize(this.config.width, this.config.height);
    }
    
    if (this.minimapCamera) {
      const aspect = this.config.width / this.config.height;
      const size = this.config.zoom;
      this.minimapCamera.left = -size * aspect;
      this.minimapCamera.right = size * aspect;
      this.minimapCamera.top = size;
      this.minimapCamera.bottom = -size;
      this.minimapCamera.updateProjectionMatrix();
    }
  }

  /**
   * Set minimap zoom level
   */
  setZoom(zoom: number): void {
    this.updateConfig({ zoom });
  }

  /**
   * Set minimap opacity
   */
  setOpacity(opacity: number): void {
    this.updateConfig({ opacity: Math.max(0, Math.min(1, opacity)) });
  }

  /**
   * Set minimap position
   */
  setPosition(position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'): void {
    this.updateConfig({ position });
  }

  /**
   * Check if minimap is currently enabled
   */
  isActive(): boolean {
    return this.isEnabled;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    console.log('🗺️ Disposing minimap module...');
    
    this.disable();
    
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    
    // Remove wrapper (which contains the container)
    if (this.container) {
      const wrapper = (this.container as any)._wrapper as HTMLElement;
      if (wrapper && wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
    }
    
    this.clearMinimapScene();
    
    this.minimapScene = null;
    this.minimapCamera = null;
    this.userMarker = null;
    this.viewCone = null;
    
    console.log('✅ Minimap module disposed');
  }
}
