import React from 'react';
import { IconName } from '../types';

export type AppIconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function AppIcon({ name, size = 24, color = '#17324D', strokeWidth = 1.8 }: AppIconProps) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  const content = (() => {
    switch (name) {
      case 'home':
        return (
          <>
            <path d="M3 11.5 12 4l9 7.5" {...common} />
            <path d="M5.5 10.5V21h13V10.5M9.5 21v-6h5v6" {...common} />
          </>
        );
      case 'target':
        return (
          <>
            <circle cx="11" cy="13" r="7" {...common} />
            <circle cx="11" cy="13" r="3" {...common} />
            <path d="m14 10 6-6M16 4h4v4" {...common} />
          </>
        );
      case 'plus':
        return (
          <>
            <line x1="12" y1="5" x2="12" y2="19" {...common} />
            <line x1="5" y1="12" x2="19" y2="12" {...common} />
          </>
        );
      case 'community':
        return (
          <>
            <circle cx="8" cy="9" r="3" {...common} />
            <circle cx="17" cy="10" r="2.5" {...common} />
            <path d="M2.5 20c.6-4 2.5-6 5.5-6s5 2 5.5 6M13 20c.4-3 1.8-4.7 4.2-4.7 2.2 0 3.8 1.5 4.3 4.7" {...common} />
          </>
        );
      case 'user':
        return (
          <>
            <circle cx="12" cy="8" r="4" {...common} />
            <path d="M4 21c.8-5 3.4-7.5 8-7.5s7.2 2.5 8 7.5" {...common} />
          </>
        );
      case 'book':
        return (
          <>
            <path d="M3.5 5.5c3.3-.8 6-.2 8.5 1.8v12c-2.5-2-5.2-2.6-8.5-1.8z" {...common} />
            <path d="M20.5 5.5c-3.3-.8-6-.2-8.5 1.8v12c2.5-2 5.2-2.6 8.5-1.8z" {...common} />
          </>
        );
      case 'chat':
        return (
          <>
            <path d="M4 4.5h16v11H9l-5 4v-15z" {...common} />
            <line x1="5" y1="20" x2="20" y2="3" {...common} />
          </>
        );
      case 'gift':
        return (
          <>
            <rect x="3" y="9" width="18" height="12" rx="2" {...common} />
            <rect x="2" y="6" width="20" height="5" rx="2" {...common} />
            <line x1="12" y1="6" x2="12" y2="21" {...common} />
            <path d="M12 6c-1.2-4-6-4.2-6-.8C6 7.2 9 7.2 12 6ZM12 6c1.2-4 6-4.2 6-.8 0 2-3 2-6 1" {...common} />
          </>
        );
      case 'coin':
        return (
          <>
            <circle cx="12" cy="12" r="8" {...common} />
            <path d="M15 8.5c-.8-.8-1.8-1.2-3-1.2-1.7 0-3 1-3 2.3 0 3.2 6 1.2 6 4.7 0 1.4-1.4 2.4-3.2 2.4-1.3 0-2.5-.5-3.3-1.4M12 5.5v13" {...common} />
          </>
        );
      case 'trophy':
        return (
          <>
            <path d="M8 4h8v4.5c0 3-1.7 5.3-4 5.3S8 11.5 8 8.5V4z" {...common} />
            <path d="M8 6H4v2c0 2.3 1.5 4 4 4M16 6h4v2c0 2.3-1.5 4-4 4M12 14v4M8.5 21h7M10 18h4" {...common} />
          </>
        );
      case 'check':
        return (
          <>
            <circle cx="12" cy="12" r="9" {...common} />
            <polyline points="8,12 11,15 17,8" {...common} />
          </>
        );
      case 'clock':
        return (
          <>
            <circle cx="12" cy="12" r="9" {...common} />
            <path d="M12 7v5l3.5 2" {...common} />
          </>
        );
      case 'calendar':
        return (
          <>
            <rect x="3" y="5" width="18" height="16" rx="2" {...common} />
            <line x1="7" y1="3" x2="7" y2="7" {...common} />
            <line x1="17" y1="3" x2="17" y2="7" {...common} />
            <line x1="3" y1="9" x2="21" y2="9" {...common} />
          </>
        );
      case 'heart':
        return <path d="M12 20s-8-4.8-8-10.2C4 6.8 6 5 8.5 5c1.7 0 2.9.8 3.5 2 .6-1.2 1.8-2 3.5-2C18 5 20 6.8 20 9.8 20 15.2 12 20 12 20z" {...common} />;
      case 'prayer':
        return (
          <>
            <path d="M4 21h16M6 21V10l6-5 6 5v11" {...common} />
            <path d="M9 21v-5h6v5M10 10h4" {...common} />
          </>
        );
      case 'charity':
        return (
          <>
            <rect x="4" y="8" width="16" height="13" rx="2" {...common} />
            <path d="M8 8V5h8v3M8 13h8" {...common} />
            <path d="M12 17s-3-1.7-3-3.6c0-1 .7-1.7 1.6-1.7.7 0 1.2.3 1.4.8.2-.5.7-.8 1.4-.8.9 0 1.6.7 1.6 1.7 0 1.9-3 3.6-3 3.6z" {...common} />
          </>
        );
      case 'flame':
        return <path d="M13 3c1 4-2 5-1 8 1.2-1 2.5-2.1 3-4 3 2.5 4 5.4 3 8.2C17.1 18.7 14.8 21 12 21c-3.7 0-6.5-2.8-6.5-6.5 0-3 1.7-5.4 4.7-8.1-.2 2.5.8 3.8 1.8 4.6-.5-3 1.2-4.8 1-8z" {...common} />;
      case 'bookmark':
        return <path d="M6 3.5h12v17l-6-4-6 4v-17z" {...common} />;
      case 'share':
        return (
          <>
            <circle cx="18" cy="5" r="2.5" {...common} />
            <circle cx="6" cy="12" r="2.5" {...common} />
            <circle cx="18" cy="19" r="2.5" {...common} />
            <line x1="8.2" y1="10.8" x2="15.8" y2="6.2" {...common} />
            <line x1="8.2" y1="13.2" x2="15.8" y2="17.8" {...common} />
          </>
        );
      case 'play':
        return (
          <>
            <circle cx="12" cy="12" r="9" {...common} />
            <path d="m10 8 6 4-6 4V8z" {...common} />
          </>
        );
      case 'pause':
        return (
          <>
            <circle cx="12" cy="12" r="9" {...common} />
            <line x1="10" y1="8" x2="10" y2="16" {...common} />
            <line x1="14" y1="8" x2="14" y2="16" {...common} />
          </>
        );
      case 'reset':
        return <path d="M4 7v5h5M5 12a7.5 7.5 0 1 0 2-5" {...common} />;
      case 'lightbulb':
        return <path d="M8.5 16c-1.7-1.2-2.7-3.1-2.7-5.2A6.2 6.2 0 0 1 12 4.5a6.2 6.2 0 0 1 6.2 6.3c0 2.1-1 4-2.7 5.2-.8.6-1.2 1.2-1.3 2H9.8c-.1-.8-.5-1.4-1.3-2zM9.5 21h5" {...common} />;
      case 'chart':
        return (
          <>
            <line x1="4" y1="20" x2="20" y2="20" {...common} />
            <rect x="6" y="12" width="3" height="8" rx="1" {...common} />
            <rect x="11" y="8" width="3" height="12" rx="1" {...common} />
            <rect x="16" y="4" width="3" height="16" rx="1" {...common} />
          </>
        );
      case 'crown':
        return (
          <>
            <path d="M4 8l4 4 4-7 4 7 4-4-2 10H6L4 8z" {...common} />
            <line x1="6" y1="21" x2="18" y2="21" {...common} />
          </>
        );
      case 'settings':
        return (
          <>
            <circle cx="12" cy="12" r="3" {...common} />
            <path d="M19 13.5v-3l-2.2-.6a7 7 0 0 0-.7-1.6l1.1-2-2.1-2.1-2 1.1a7 7 0 0 0-1.6-.7L11 2.5H8l-.6 2.2a7 7 0 0 0-1.6.7l-2-1.1-2.1 2.1 1.1 2a7 7 0 0 0-.7 1.6L0 10.5v3l2.2.6c.2.6.4 1.1.7 1.6l-1.1 2 2.1 2.1 2-1.1c.5.3 1 .5 1.6.7l.6 2.2h3l.6-2.2c.6-.2 1.1-.4 1.6-.7l2 1.1 2.1-2.1-1.1-2c.3-.5.5-1 .7-1.6l2-.6z" {...common} />
          </>
        );
      case 'chevronLeft':
        return <polyline points="15,5 8,12 15,19" {...common} />;
      case 'chevronRight':
        return <polyline points="9,5 16,12 9,19" {...common} />;
      case 'close':
        return (
          <>
            <line x1="6" y1="6" x2="18" y2="18" {...common} />
            <line x1="18" y1="6" x2="6" y2="18" {...common} />
          </>
        );
      case 'leaf':
        return (
          <>
            <path d="M20 4C12 4 6 7 5 14c5 1 11-1 15-10z" {...common} />
            <path d="M4 20c2-6 7-9 13-12" {...common} />
          </>
        );
      case 'cup':
        return (
          <>
            <path d="M5 6h12v8a6 6 0 0 1-6 6 6 6 0 0 1-6-6V6z" {...common} />
            <path d="M17 8h2a3 3 0 0 1 0 6h-2" {...common} />
          </>
        );
      case 'shield':
        return (
          <>
            <path d="M12 3 20 6v6c0 5-3.2 8-8 9-4.8-1-8-4-8-9V6l8-3z" {...common} />
            <polyline points="8.5,12 11,14.5 16,9" {...common} />
          </>
        );
      case 'star':
        return <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z" {...common} />;
      case 'bell':
        return (
          <>
            <path d="M5 17h14l-1.5-2V10a5.5 5.5 0 0 0-11 0v5L5 17z" {...common} />
            <path d="M10 20h4" {...common} />
          </>
        );
      case 'sun':
        return (
          <>
            <circle cx="12" cy="12" r="4" {...common} />
            <line x1="12" y1="2" x2="12" y2="5" {...common} />
            <line x1="12" y1="19" x2="12" y2="22" {...common} />
            <line x1="2" y1="12" x2="5" y2="12" {...common} />
            <line x1="19" y1="12" x2="22" y2="12" {...common} />
            <line x1="4.9" y1="4.9" x2="7" y2="7" {...common} />
            <line x1="17" y1="17" x2="19.1" y2="19.1" {...common} />
            <line x1="17" y1="7" x2="19.1" y2="4.9" {...common} />
            <line x1="4.9" y1="19.1" x2="7" y2="17" {...common} />
          </>
        );
      case 'moon':
        return <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z" {...common} />;
      case 'food':
        return <path d="M7 3v8M4 3v5c0 2 1 3 3 3s3-1 3-3V3M7 11v10M16 3v18M16 3c3 2 3 7 0 9" {...common} />;
      case 'scroll':
        return (
          <>
            <path d="M7 5h10v14H7z" {...common} />
            <path d="M7 5c-2 0-3 1-3 2.5S5 10 7 10M17 14c2 0 3 1 3 2.5S19 19 17 19" {...common} />
            <line x1="9" y1="9" x2="15" y2="9" {...common} />
            <line x1="9" y1="13" x2="15" y2="13" {...common} />
          </>
        );
      case 'ellipsis':
        return (
          <>
            <circle cx="5" cy="12" r="1" fill={color} />
            <circle cx="12" cy="12" r="1" fill={color} />
            <circle cx="19" cy="12" r="1" fill={color} />
          </>
        );
      case 'edit':
        return (
          <>
            <path d="m4 16 11-11 4 4-11 11H4v-4z" {...common} />
            <line x1="13.5" y1="6.5" x2="17.5" y2="10.5" {...common} />
          </>
        );
      case 'lock':
        return (
          <>
            <rect x="5" y="10" width="14" height="11" rx="2" {...common} />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" {...common} />
          </>
        );
      case 'logout':
        return <path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" {...common} />;
      default:
        return <circle cx="12" cy="12" r="9" {...common} />;
    }
  })();

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      {content}
    </svg>
  );
}
