import type { PanZoom, Transform } from 'panzoom';
import panzoom from 'panzoom';

const DOT_GAP = 24;
const FIT_PADDING = 32;

export default function (
  container: Ref<HTMLElement | undefined>,
  gridEl?: Ref<HTMLElement | undefined>,
) {
  let instance: PanZoom | undefined;
  const scale = ref<number>();
  let initialTransform: Transform | undefined;

  const syncGrid = () => {
    const grid = gridEl?.value;
    if (!grid || !instance) return;
    const t = instance.getTransform();
    const gap = DOT_GAP * t.scale;
    grid.style.backgroundSize = `${gap}px ${gap}px`;
    grid.style.backgroundPosition = `${t.x}px ${t.y}px`;
  };

  const fitToViewport = (el: HTMLElement, pz: PanZoom) => {
    const parent = el.parentElement;
    if (!parent) return;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    const cw = el.scrollWidth || el.offsetWidth;
    const ch = el.scrollHeight || el.offsetHeight;
    if (!pw || !ph || !cw || !ch) return;
    const s = Math.min(
      (pw - FIT_PADDING * 2) / cw,
      (ph - FIT_PADDING * 2) / ch,
      1,
    );
    const x = (pw - cw * s) / 2;
    const y = (ph - ch * s) / 2;
    pz.zoomAbs(0, 0, s);
    pz.moveTo(x, y);
    initialTransform = { x, y, scale: s };
    scale.value = s;
  };

  const dispose = () => {
    instance?.dispose();
    instance = undefined;
  };

  whenever(container, (el) => {
    if (instance) return;
    const { isRulerActive } = useRulerStore();
    const { manualMode } = useManualLayout();
    instance = panzoom(el, {
      autocenter: true,
      minZoom: 0.05,
      maxZoom: 10,
      beforeMouseDown: () => isRulerActive.value || manualMode.value,
    });
    instance.on('zoom', () => {
      scale.value = instance?.getTransform().scale;
    });
    instance.on('transform', syncGrid);
    fitToViewport(el, instance);
    syncGrid();
  });
  whenever(() => !container.value, dispose);
  onUnmounted(dispose);

  const setZoom = (cb: (scale: number) => number, x?: number, y?: number) => {
    if (!instance) return;
    const current = instance.getTransform();
    const newScale = cb(current.scale);
    instance.smoothZoom(
      x ?? current.x,
      y ?? current.y,
      newScale / current.scale,
    );
  };
  const zoomBy = (increment: number) => setZoom((s) => s + increment);

  return {
    scale,
    zoomIn: () => zoomBy(0.1),
    zoomOut: () => zoomBy(-0.1),
    resetZoom: () => {
      if (!initialTransform) return;
      const { scale, x, y } = initialTransform;
      setZoom(() => scale, x, y);
      setTimeout(() => instance?.smoothMoveTo(x, y), 200);
    },
  };
}
