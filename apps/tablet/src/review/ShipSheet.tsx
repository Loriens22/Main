import { useEffect, useMemo, useState } from 'react';
import type { ShipStep } from '@ornight/protocol';
import { GlassButton, GlassSheet, GlassSpinner } from '@ornight/glass';
import { useOrnight } from '@/state/store';
import { useGitState } from '@/state/selectors';
import {
  SUBJECT_HARD_LIMIT,
  SUBJECT_SOFT_LIMIT,
  generateCommitMessage,
  generatePrBody,
  generatePrTitle,
  joinCommitMessage,
  subjectOf,
} from './util';
import './ShipSheet.css';

const STEP_LABEL: Record<ShipStep, string> = {
  commit: 'Commit',
  push: 'Push',
  'pull-request': 'Pull request',
};

export interface ShipSheetProps {
  threadId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Commit → push → PR, as one gesture with three visible parts.
 *
 * The steps are separable because they fail separately: pushing can be rejected
 * long after a commit succeeded, and re-running the whole flow would then try to
 * commit nothing. Progress is reported per step so a partial success reads as a
 * partial success rather than as a failure of the lot.
 */
export function ShipSheet({ threadId, open, onClose }: ShipSheetProps) {
  const git = useGitState(threadId);
  const ship = useOrnight((s) => s.ship);
  const progress = useOrnight((s) => s.shipProgress[threadId] ?? null);

  const files = useMemo(() => git?.files ?? [], [git]);
  const staged = useMemo(() => files.filter((f) => f.staged), [files]);
  const included = staged.length > 0 ? staged : files;

  const draft = useMemo(() => generateCommitMessage(included), [included]);
  const canOpenPr = Boolean(git?.branch) && included.length > 0;

  const [steps, setSteps] = useState<ShipStep[]>(['commit', 'push', 'pull-request']);
  const [message, setMessage] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [sent, setSent] = useState(false);

  // Re-seed the fields when the sheet opens, but never while it is open — the
  // operator's typing must survive a diff refresh landing underneath them.
  useEffect(() => {
    if (!open) return;
    setMessage(joinCommitMessage(draft));
    setPrTitle(generatePrTitle(draft, git?.branch ?? ''));
    setPrBody(generatePrBody(draft, included));
    setSent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on open
  }, [open]);

  const subject = subjectOf(message);
  const subjectTooLong = subject.length > SUBJECT_HARD_LIMIT;
  const wantsPr = steps.includes('pull-request');

  const toggle = (step: ShipStep) =>
    setSteps((current) =>
      current.includes(step) ? current.filter((s) => s !== step) : [...current, step],
    );

  const submit = () => {
    ship({
      threadId,
      steps,
      commitMessage: message.trim(),
      paths: staged.length > 0 ? staged.map((f) => f.path) : [],
      ...(wantsPr ? { prTitle: prTitle.trim(), prBody: prBody.trim() } : null),
    });
    setSent(true);
  };

  const done = progress?.state === 'done' && progress.step === steps[steps.length - 1];

  return (
    <GlassSheet open={open} onClose={onClose} title="Ship" side="bottom" size="lg">
      <div className="on-rev-ship">
        {sent ? (
          <ShipProgressView progress={progress} onRetry={() => setSent(false)} onClose={onClose} />
        ) : (
          <>
            <div className="on-rev-ship-steps">
              {(['commit', 'push', 'pull-request'] as ShipStep[]).map((step) => {
                const disabled = step === 'pull-request' && !canOpenPr;
                return (
                  <button
                    key={step}
                    type="button"
                    className="on-rev-ship-step"
                    data-on={steps.includes(step) && !disabled}
                    disabled={disabled}
                    onClick={() => toggle(step)}
                  >
                    <span aria-hidden="true">{steps.includes(step) && !disabled ? '☑' : '☐'}</span>
                    {STEP_LABEL[step]}
                  </button>
                );
              })}
            </div>

            <p className="on-rev-ship-summary">
              {included.length === 0
                ? 'Nothing to ship — this worktree has no changes.'
                : `${included.length} ${included.length === 1 ? 'file' : 'files'}${
                    staged.length > 0 && staged.length !== files.length ? ' (staged only)' : ''
                  } · +${included.reduce((n, f) => n + f.insertions, 0)} −${included.reduce(
                    (n, f) => n + f.deletions,
                    0,
                  )}`}
            </p>

            <label className="on-rev-ship-label" htmlFor="on-ship-message">
              Commit message
            </label>
            <textarea
              id="on-ship-message"
              className="on-rev-ship-input on-rev-ship-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
            />
            <p className="on-rev-ship-hint" data-warn={subjectTooLong}>
              Subject {subject.length}/{SUBJECT_SOFT_LIMIT}
              {subjectTooLong ? ' — git will truncate this in one-line logs' : ''}
            </p>

            {wantsPr && (
              <>
                <label className="on-rev-ship-label" htmlFor="on-ship-pr-title">
                  Pull request title
                </label>
                <input
                  id="on-ship-pr-title"
                  className="on-rev-ship-input"
                  value={prTitle}
                  onChange={(event) => setPrTitle(event.target.value)}
                />
                <label className="on-rev-ship-label" htmlFor="on-ship-pr-body">
                  Description
                </label>
                <textarea
                  id="on-ship-pr-body"
                  className="on-rev-ship-input on-rev-ship-message"
                  value={prBody}
                  onChange={(event) => setPrBody(event.target.value)}
                  rows={5}
                />
              </>
            )}

            <div className="on-rev-ship-actions">
              <GlassButton variant="quiet" size="lg" onClick={onClose}>
                Cancel
              </GlassButton>
              <GlassButton
                variant="primary"
                size="lg"
                disabled={steps.length === 0 || included.length === 0 || !message.trim()}
                onClick={submit}
              >
                {steps.map((s) => STEP_LABEL[s]).join(' → ')}
              </GlassButton>
            </div>
          </>
        )}

        {done && <span className="on-rev-ship-done" aria-hidden="true" />}
      </div>
    </GlassSheet>
  );
}

/* -------------------------------------------------------------------------- */

function ShipProgressView({
  progress,
  onRetry,
  onClose,
}: {
  progress: { step: ShipStep; state: string; detail: string; pullRequest?: { url: string; number: number; title: string } } | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  if (!progress) {
    return (
      <div className="on-rev-ship-progress">
        <GlassSpinner size={20} />
        <p>Starting…</p>
      </div>
    );
  }

  if (progress.state === 'error') {
    return (
      <div className="on-rev-ship-progress">
        <h3 className="on-rev-ship-failed">{STEP_LABEL[progress.step]} failed</h3>
        <pre className="on-rev-ship-error">{progress.detail}</pre>
        <p className="on-rev-ship-hint">
          Your message is still here — nothing was lost. Fix the cause and run it again.
        </p>
        <div className="on-rev-ship-actions">
          <GlassButton variant="quiet" size="lg" onClick={onClose}>
            Close
          </GlassButton>
          <GlassButton variant="primary" size="lg" onClick={onRetry}>
            Back to edit
          </GlassButton>
        </div>
      </div>
    );
  }

  const pr = progress.pullRequest;

  return (
    <div className="on-rev-ship-progress">
      <div className="on-rev-ship-step-live">
        {progress.state === 'running' ? <GlassSpinner size={18} /> : <span aria-hidden="true">✓</span>}
        <div>
          <strong>{STEP_LABEL[progress.step]}</strong>
          <span>{progress.detail}</span>
        </div>
      </div>

      {pr && (
        <a className="on-rev-ship-pr" href={pr.url} target="_blank" rel="noreferrer">
          <span className="on-rev-ship-pr-number">#{pr.number}</span>
          <span className="on-rev-ship-pr-title">{pr.title}</span>
          <span className="on-rev-ship-pr-go" aria-hidden="true">
            ↗
          </span>
        </a>
      )}

      {progress.state === 'done' && (
        <GlassButton variant="quiet" size="lg" block onClick={onClose}>
          Done
        </GlassButton>
      )}
    </div>
  );
}
