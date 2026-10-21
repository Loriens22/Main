import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/** Solid bottom sheet with drag-to-dismiss and an optional pinned footer for the primary action. */
export function Sheet({ open, onClose, title, children, actions, footer, tall }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; actions?: ReactNode; footer?: ReactNode; tall?: boolean }) {
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
            <div className="sheet" role="dialog" aria-modal="true" style={{ height: tall ? '90vh' : undefined }}>
              <div onPointerDown={(e) => drag.start(e)} style={{ touchAction: 'none' }}>
                <div className="sheet__grab" />
                {title !== undefined && (
                  <div className="sheet__head">
                    <div className="sheet__title">{title}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {actions}
                      <button className="icon-btn" onClick={onClose} aria-label="Close">
                        <Icon name="close" size={13} stroke={2.4} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="sheet__body">{children}</div>
              {footer && <div className="sheet__foot">{footer}</div>}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
