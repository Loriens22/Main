import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Glass } from '@/glass/Glass';
import { Icon } from './Icon';

/** Liquid Glass bottom sheet with drag-to-dismiss. */
export function Sheet({ open, onClose, title, children, actions, tall }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; actions?: ReactNode; tall?: boolean }) {
  const drag = useDragControls();
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="sheet-motion"
            style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61 }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320, mass: 0.9 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.8 }}
            onDragEnd={onDragEnd}
          >
            <Glass className="sheet" variant="strong" radius={32} blur={30} refract style={{ position: 'relative', height: tall ? '92vh' : undefined, borderRadius: '32px 32px 0 0' }} role="dialog" aria-modal="true">
              <div onPointerDown={(e) => drag.start(e)} style={{ touchAction: 'none' }}>
                <div className="sheet__grab" />
                {title !== undefined && (
                  <div className="sheet__head">
                    <div className="sheet__title">{title}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {actions}
                      <button className="circle-btn circle-btn--sm" onClick={onClose} aria-label="Close" style={{ background: 'var(--card-2)', borderRadius: '50%' }}>
                        <Icon name="close" size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="sheet__body">{children}</div>
            </Glass>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
