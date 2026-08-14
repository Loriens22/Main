import { useState } from 'react';
import type { PermissionRequest } from '@ornight/protocol';
import { GlassButton } from '@ornight/glass';
import { useOrnight } from '@/state/store';
import { usePendingPermissions } from '@/state/selectors';
import { InlineDiff } from './InlineDiff';
import { splitMultiFileDiff } from '@ornight/protocol/diff';
import './PermissionPrompt.css';

const RISK_COPY: Record<PermissionRequest['risk'], string> = {
  low: 'Low risk',
  medium: 'Worth a look',
  high: 'Destructive',
};

/**
 * The approval gate.
 *
 * Deliberately the loudest thing on screen and deliberately not dismissible:
 * an agent is stopped waiting on this, and a prompt that can be swiped away by
 * accident turns into a thread that mysteriously never finishes. The three
 * actions are thumb-sized because this is the one control people hit while
 * holding the tablet one-handed.
 */
export function PermissionPrompt({ request }: { request: PermissionRequest }) {
  const decide = useOrnight((s) => s.decidePermission);
  const queue = usePendingPermissions(request.threadId);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState('');

  const remaining = queue.length - 1;
  const patch = request.diff ? splitMultiFileDiff(request.diff)[0] : null;

  return (
    <div className="on-rev-perm" data-risk={request.risk} role="alertdialog" aria-live="assertive">
      <div className="on-rev-perm-head">
        <span className="on-rev-perm-dot" aria-hidden="true" />
        <div className="on-rev-perm-heading">
          <strong>{request.title}</strong>
          <span className="on-rev-perm-meta">
            {request.tool} · {RISK_COPY[request.risk]}
            {remaining > 0 ? ` · ${remaining} more waiting` : ''}
          </span>
        </div>
      </div>

      <pre className="on-rev-perm-detail">{request.detail}</pre>

      {patch && (
        <div className="on-rev-perm-diff">
          <InlineDiff patch={patch} compact />
        </div>
      )}

      {denying ? (
        <div className="on-rev-perm-deny">
          <textarea
            className="on-rev-perm-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Tell the agent why, so it can try another way (optional)"
            rows={2}
            autoFocus
          />
          <div className="on-rev-perm-actions">
            <GlassButton variant="quiet" size="lg" onClick={() => setDenying(false)}>
              Back
            </GlassButton>
            <GlassButton
              variant="danger"
              size="lg"
              onClick={() =>
                decide(request.id, { kind: 'deny', ...(reason.trim() ? { reason: reason.trim() } : null) })
              }
            >
              Deny
            </GlassButton>
          </div>
        </div>
      ) : (
        <div className="on-rev-perm-actions">
          <GlassButton variant="primary" size="lg" onClick={() => decide(request.id, { kind: 'allow' })}>
            Allow
          </GlassButton>
          <GlassButton
            variant="ghost"
            size="lg"
            onClick={() => decide(request.id, { kind: 'allow-always' })}
          >
            Always
          </GlassButton>
          <GlassButton variant="quiet" size="lg" onClick={() => setDenying(true)}>
            Deny
          </GlassButton>
        </div>
      )}
    </div>
  );
}
