import type { ReactNode, SVGProps } from 'react';

/**
 * Hand-drawn 24px stroke icons. The app ships no icon dependency, and these are
 * the only glyphs the shell and chat need. Everything inherits `currentColor`
 * so tokens stay the single source of colour.
 */

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
}

function icon(body: ReactNode, displayName: string) {
  function Icon({ size = 20, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {body}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const MenuIcon = icon(
  <>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h10" />
  </>,
  'MenuIcon',
);

export const PlusIcon = icon(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>,
  'PlusIcon',
);

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </>,
  'SearchIcon',
);

export const SettingsIcon = icon(
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
  </>,
  'SettingsIcon',
);

export const DiffIcon = icon(
  <>
    <path d="M7 4v11" />
    <circle cx="7" cy="18" r="2.2" />
    <circle cx="17" cy="6" r="2.2" />
    <path d="M17 9v4a4 4 0 0 1-4 4h-3" />
  </>,
  'DiffIcon',
);

export const ShipIcon = icon(
  <>
    <path d="M12 20V6" />
    <path d="m6 11 6-6 6 6" />
    <path d="M4.5 20h15" />
  </>,
  'ShipIcon',
);

export const StopIcon = icon(<rect x="6.5" y="6.5" width="11" height="11" rx="2.6" />, 'StopIcon');

export const SendIcon = icon(
  <>
    <path d="M4.4 12 20 4.5l-4.2 15.2-3.6-5.4z" />
    <path d="m12.2 14.3 7.8-9.8" />
  </>,
  'SendIcon',
);

export const ChevronDownIcon = icon(<path d="m6 9.5 6 6 6-6" />, 'ChevronDownIcon');
export const ChevronRightIcon = icon(<path d="m9.5 6 6 6-6 6" />, 'ChevronRightIcon');
export const ArrowDownIcon = icon(
  <>
    <path d="M12 4.5v15" />
    <path d="m5.5 13 6.5 6.5 6.5-6.5" />
  </>,
  'ArrowDownIcon',
);

export const CloseIcon = icon(
  <>
    <path d="m6 6 12 12" />
    <path d="m18 6-12 12" />
  </>,
  'CloseIcon',
);

export const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7" />, 'CheckIcon');

export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2.6" />
    <path d="M15 5.5A2.5 2.5 0 0 0 12.5 4H6.5A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 5.5 15" />
  </>,
  'CopyIcon',
);

export const PinIcon = icon(
  <>
    <path d="M9 3.5h6l-.8 5.2 3 3.1-4.4.9-2.1 5.3-1.4-5.3-4.4-.9 3-3.1z" />
    <path d="M12 18v3" />
  </>,
  'PinIcon',
);

export const ArchiveIcon = icon(
  <>
    <rect x="3.5" y="4.5" width="17" height="4" rx="1.6" />
    <path d="M5.5 8.5V18a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5" />
    <path d="M10 12.5h4" />
  </>,
  'ArchiveIcon',
);

export const TrashIcon = icon(
  <>
    <path d="M4.5 6.5h15" />
    <path d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
  </>,
  'TrashIcon',
);

export const PencilIcon = icon(
  <>
    <path d="M4.5 19.5h4L20 8a2.1 2.1 0 0 0-3-3L5.5 16.5z" />
    <path d="m14.5 5.5 4 4" />
  </>,
  'PencilIcon',
);

export const BranchIcon = icon(
  <>
    <circle cx="7" cy="6" r="2.2" />
    <circle cx="7" cy="18" r="2.2" />
    <circle cx="17" cy="9" r="2.2" />
    <path d="M7 8.2v7.6" />
    <path d="M17 11.2c0 3-2.4 4.2-5 4.6" />
  </>,
  'BranchIcon',
);

export const ChatIcon = icon(
  <>
    <path d="M20 12.5c0 3.9-3.6 7-8 7a9.3 9.3 0 0 1-2.6-.4L4.5 20.5l1.2-3.6A6.7 6.7 0 0 1 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7Z" />
  </>,
  'ChatIcon',
);

export const BrainIcon = icon(
  <>
    <path d="M9.5 5A2.8 2.8 0 0 0 6.8 8 2.6 2.6 0 0 0 5 10.5c0 1 .5 1.8 1.3 2.3A2.7 2.7 0 0 0 9 17a2.5 2.5 0 0 0 3 .8V5.5A2.4 2.4 0 0 0 9.5 5Z" />
    <path d="M14.5 5A2.8 2.8 0 0 1 17.2 8 2.6 2.6 0 0 1 19 10.5c0 1-.5 1.8-1.3 2.3A2.7 2.7 0 0 1 15 17a2.5 2.5 0 0 1-3 .8" />
  </>,
  'BrainIcon',
);

export const FolderIcon = icon(
  <>
    <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.2l1.8 2.2h8A2 2 0 0 1 20.5 9.7v7.3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </>,
  'FolderIcon',
);

export const LinkIcon = icon(
  <>
    <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.4 1.4" />
    <path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.4-1.4" />
  </>,
  'LinkIcon',
);

export const SparkIcon = icon(
  <>
    <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z" />
  </>,
  'SparkIcon',
);
