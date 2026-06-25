// Flat line icons as inline SVG — no icon-font/CDN dependency, fully themeable,
// and they inherit `currentColor` so they adapt to dark mode automatically.
// Style: 24x24 viewBox, 1.8px stroke, round caps — a consistent "feather/lucide" look.

function Svg({ size = 20, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MapIcon = (p) => (
  <Svg {...p}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></Svg>
);
export const TicketIcon = (p) => (
  <Svg {...p}><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z" /><path d="M13 6v12" strokeDasharray="2 2" /></Svg>
);
export const ChartIcon = (p) => (
  <Svg {...p}><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" rx="1" /><rect x="12" y="7" width="3" height="10" rx="1" /><rect x="17" y="13" width="3" height="4" rx="1" /></Svg>
);
export const BellIcon = (p) => (
  <Svg {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Svg>
);
export const CheckIcon = (p) => (<Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>);
export const CheckCircleIcon = (p) => (
  <Svg {...p}><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><path d="m9 11 3 3L22 4" /></Svg>
);
export const SunIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
);
export const MoonIcon = (p) => (<Svg {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></Svg>);
export const LogOutIcon = (p) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Svg>
);
export const UsersIcon = (p) => (
  <Svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1A4 4 0 0 1 16 11" /></Svg>
);
export const BoltIcon = (p) => (<Svg {...p}><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" /></Svg>);
export const ClockIcon = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>);
export const AlertIcon = (p) => (
  <Svg {...p}><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></Svg>
);
export const SparkleIcon = (p) => (
  <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></Svg>
);
export const ClipboardIcon = (p) => (
  <Svg {...p}><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></Svg>
);
export const PowerIcon = (p) => (<Svg {...p}><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></Svg>);

// Ticket-type icons.
export const ProjectorIcon = (p) => (
  <Svg {...p}><rect x="2" y="7" width="20" height="11" rx="2" /><circle cx="9" cy="12.5" r="3" /><path d="M16 11h2M6 18v2M18 18v2" /></Svg>
);
export const SnowflakeIcon = (p) => (
  <Svg {...p}><path d="M12 2v20M4 6l16 12M20 6 4 18" /><path d="M9 4l3 2 3-2M9 20l3-2 3 2M4.5 9.5 5 6l3.5.5M19.5 14.5 19 18l-3.5-.5M4.5 14.5 5 18l3.5-.5M19.5 9.5 19 6l-3.5.5" /></Svg>
);
export const BulbIcon = (p) => (
  <Svg {...p}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8 13a6 6 0 1 1 8 0c-1 .8-1.5 1.6-1.5 3h-5c0-1.4-.5-2.2-1.5-3Z" /></Svg>
);
export const DropletIcon = (p) => (<Svg {...p}><path d="M12 2.7 6.3 9a8 8 0 1 0 11.4 0L12 2.7Z" /></Svg>);
export const BoxIcon = (p) => (
  <Svg {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></Svg>
);
export const DotsIcon = (p) => (<Svg {...p}><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></Svg>);

// Map ticket type -> icon component.
export const TICKET_ICON = {
  projector: ProjectorIcon,
  ac: SnowflakeIcon,
  lights: BulbIcon,
  spill: DropletIcon,
  fallen_object: BoxIcon,
  other: DotsIcon,
};
