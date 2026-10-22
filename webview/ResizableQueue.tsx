import { useRef, type ReactNode } from 'react';

export function ResizableQueue({ children, open, onWidth }: { children: ReactNode; open: boolean; onWidth: (width: number | undefined) => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null);
  const resize = (width: number) => {
    const available = panel.current?.parentElement?.clientWidth ?? window.innerWidth;
    const maximum = window.innerWidth <= 750 ? available * .85 : Math.min(480, available - 480);
    onWidth(Math.round(Math.max(Math.min(160, maximum), Math.min(width, maximum))));
  };
  return <div ref={panel} className={`queue-panel ${open ? 'queue-panel-open' : ''}`}>
    {children}
    <button type="button" className="queue-resizer" aria-label="Resize review queue" title="Drag to resize · Arrow keys adjust · Double-click to reset"
      onDoubleClick={() => onWidth(undefined)}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, x: event.clientX, width: panel.current?.getBoundingClientRect().width ?? 205 };
      }}
      onPointerMove={event => { const start = drag.current; if (start?.pointer === event.pointerId) resize(start.width + event.clientX - start.x); }}
      onPointerUp={event => { if (drag.current?.pointer === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
      onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); resize((panel.current?.getBoundingClientRect().width ?? 205) + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 80 : 20));
        }
        if (event.key === 'Home') { event.preventDefault(); onWidth(undefined); }
      }}/>
  </div>;
}
