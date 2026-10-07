import type { SVGProps } from 'react'

/* Inline icon set. Each path is drawn on a 24x24 grid, stroke based, so icons scale with text size. */
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10',
  pantry: 'M4 4h16v16H4zM4 10h16M4 16h16M9 4v16',
  cook: 'M6 3v6M9 3v6M7.5 9v12M15 3c2.5 0 4 2 4 4.5S17.5 11 17.5 11V21M17.5 11c-1.5 0-3-1.5-3-3.5S16 3 15 3',
  shop: 'M3 4h2l2.4 11h11.2L21 7H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  house: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6M12 7.5v.01',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4M8 21h8',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5 10 17 19 7',
  close: 'M6 6l12 12M18 6 6 18',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  search: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM20 20l-4.5-4.5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4',
  snowflake: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M12 3l-2 2m2-2 2 2M12 21l-2-2m2 2 2-2M4.2 7.5 7 7.3M4.2 7.5l.3 2.7M19.8 16.5l-2.8.2m2.8-.2-.3-2.7M4.2 16.5l2.8.2m-2.8-.2.3-2.7M19.8 7.5 17 7.3m2.8.2-.3 2.7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  alert: 'M12 3 2.5 20h19zM12 9v5M12 17v.01',
  flame: 'M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1.5.5-2.5 1-3.5.5 1.2 1 2 2 2.5C11 8 11 5 12 3z',
  dollar: 'M12 3v18M16 7.5c0-1.7-1.8-2.5-4-2.5s-4 .9-4 2.5 1.5 2.4 4 3c2.5.6 4 1.3 4 3s-1.8 2.5-4 2.5-4-.9-4-2.5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  people: 'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 11a3 3 0 1 0 0-6M17 14a5 5 0 0 1 4.5 6',
  send: 'M21 3 3 10.5l7.5 3L13.5 21z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v7h14v-7',
  print: 'M7 8V3h10v5M5 8h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2zM7 14h10',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  textSize: 'M4 18 9 6l5 12M5.8 14h6.4M15 18l2.5-6 2.5 6M16 16h3',
  swap: 'M4 7h13l-3-3M20 17H7l3 3',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  edit: 'M4 20h4l11-11-4-4L4 16zM13 7l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  cart: 'M3 4h2l2.4 11h11.2L21 7H7',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4M9 2h6M12 2v4',
  energy: 'M13 2 4 14h7l-1 8 9-12h-7z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  leaf: 'M5 20c0-8 5-14 14-14 0 9-5 14-14 14zM5 20c3-4 6-7 10-9',
  bag: 'M6 8h12l1 13H5zM9 8V6a3 3 0 0 1 6 0v2',
  arrowRight: 'M4 12h16M14 6l6 6-6 6',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  play: 'M7 4l12 8-12 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  chair: 'M6 4h12v8H6zM5 12h14v3H5zM7 15v6M17 15v6',
  compost: 'M12 21c-4 0-7-3-7-7 0-3 2-5 4-6-1 2 0 4 2 4 0-3 2-5 5-6-1 3 1 5 1 8 0 4-2 7-5 7z',
} as const

export type IconName = keyof typeof PATHS

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  /** Size in px, scales with text size by default via 1em. */
  size?: number | string
  title?: string
}

export function Icon({ name, size = '1.25em', title, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  )
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[]
