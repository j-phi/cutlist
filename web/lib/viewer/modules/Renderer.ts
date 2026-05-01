/**
 * Owns the WebGLRenderer, the rAF loop, and on-demand render scheduling.
 * Calls into a render function only when `requestRender()` has been invoked
 * since the last frame.
 */

import type { EventBus } from './EventBus';
import type { ViewerEvent } from '../types';

type WebGLRenderer = import('three').WebGLRenderer;

interface RendererDeps {
  THREE: typeof import('three');
  container: HTMLElement;
  bus: EventBus<ViewerEvent>;
  onFrame: (dtMs: number) => void;
}

export class Renderer {
  readonly renderer: WebGLRenderer;
  private rafId = 0;
  private dirty = true;
  private resizeObserver: ResizeObserver;
  private lastFrameTime = 0;
  private frameCallbacks = new Set<(dtMs: number) => void>();
  private resizeListeners = new Set<(w: number, h: number) => void>();
  private disposed = false;

  constructor(private deps: RendererDeps) {
    const { THREE, container } = deps;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0c0c0f);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const rect = container.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height);
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.resizeObserver = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      this.renderer.setSize(r.width, r.height);
      for (const cb of this.resizeListeners) cb(r.width, r.height);
      this.requestRender();
    });
    this.resizeObserver.observe(container);
  }

  start(render: () => void): void {
    const tick = (now: number) => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(tick);
      const dt = this.lastFrameTime ? now - this.lastFrameTime : 0;
      this.lastFrameTime = now;
      this.deps.onFrame(dt);
      for (const cb of this.frameCallbacks) cb(dt);
      if (this.dirty) {
        render();
        this.dirty = false;
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  requestRender(): void {
    this.dirty = true;
    this.deps.bus.emit({ type: 'render-requested' });
  }

  onFrame(cb: (dtMs: number) => void): () => void {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  onResize(cb: (w: number, h: number) => void): () => void {
    this.resizeListeners.add(cb);
    return () => this.resizeListeners.delete(cb);
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.resizeListeners.clear();
    this.frameCallbacks.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
