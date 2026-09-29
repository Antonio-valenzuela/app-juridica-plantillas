import type { ReactNode, SVGProps } from 'react';

export type LexIconName =
  | 'home'
  | 'scale'
  | 'document'
  | 'library'
  | 'folder'
  | 'calendar'
  | 'book'
  | 'bell'
  | 'settings'
  | 'help'
  | 'search'
  | 'menu'
  | 'plus'
  | 'check'
  | 'person'
  | 'chevron-down';

type LexIconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: LexIconName;
  size?: number;
  label?: string;
};

const paths: Record<LexIconName, ReactNode> = {
  home: <path d="m3.5 10.8 8.5-7 8.5 7M5.5 9.7v10.1h13V9.7M9.2 19.8v-5.5h5.6v5.5" />,
  scale: <><path d="M12 4v16M6 5.5h12M4.2 8.5h3.6l-1.8 3.1a2.1 2.1 0 0 1-3.6 0l1.8-3.1ZM17.8 8.5h3.6l-1.8 3.1a2.1 2.1 0 0 1-3.6 0l1.8-3.1ZM8 20h8" /><path d="M4.5 20h15" /></>,
  document: <><path d="M6.5 3.5h7l4 4v13h-11v-17Z" /><path d="M13.5 3.5v4h4M9 12h6M9 15.5h6" /></>,
  library: <><path d="M4 5.5h4v13H4zM10 3.5h4v15h-4zM16 6h4v12.5h-4z" /><path d="M3 20.5h18" /></>,
  folder: <path d="M3.5 6.5h6l1.8 2h9.2v9.8a2 2 0 0 1-2 2h-15v-13.8Z" />,
  calendar: <><rect x="4" y="5.5" width="16" height="15" rx="2" /><path d="M7.5 3.5v4M16.5 3.5v4M4 9.5h16M8 13h3M13 13h3M8 16.5h3" /></>,
  book: <><path d="M5 4.5h12a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2v-13Z" /><path d="M5 17.5a2 2 0 0 1 2-2h12M9 8h6M9 11h6" /></>,
  bell: <><path d="M18 10.5a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18c0-1.5-3-1.5-3-8.5ZM10 22h4" /></>,
  settings: <><path d="m12 3 1.1 1.9 2.1.5.5 2.1L17.5 9l-1.8 1.6.2 2.2 1.8 1.1-1.1 2-2.1-.2-1.5 1.6.2 2.1-2.2.6-1.1-1.8-2.2.2-1-1.8 1.5-1.5-.5-2.1-2-1 .7-2.1 2.1-.5.5-2.1L10.1 5 12 3Z" /><circle cx="12" cy="12" r="2.7" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.3a2.4 2.4 0 1 1 3.8 1.9c-1 .7-1.6 1.1-1.6 2.4M12 16.8v.1" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.2" /><path d="m15.5 15.5 5 5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  person: <><circle cx="12" cy="8" r="3.3" /><path d="M5.5 20.5a6.5 6.5 0 0 1 13 0" /></>,
  'chevron-down': <path d="m7 9 5 5 5-5" />,
};

export function LexIcon({ name, size = 18, label, className = '', ...props }: LexIconProps) {
  return (
    <svg
      {...props}
      data-lex-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`lex-icon ${className}`.trim()}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths[name]}
    </svg>
  );
}
