export const IconPlus = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" {...props}>
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

export const IconMapPin = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="currentColor"/>
  </svg>
);

export const IconFilter = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
    <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><circle cx="10" cy="18" r="2" fill="currentColor"/>
  </svg>
);

export const IconClock = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14" strokeLinecap="round"/>
  </svg>
);

export const IconCheck = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

export const IconX = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ── Clear, recognizable category icons (24×24) ──
export const CatPotholes = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="5.5"/><path d="M4 12h2M18 12h2"/>
  </svg>
);
//           ╶ hole ───────╯   ╶ road dashes ╯

export const CatStreetlight = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 5v15"/><path d="M8 8h8"/><circle cx="12" cy="5" r="3"/><path d="M5 5h2M17 5h2"/>
  </svg>
);

export const CatGraffiti = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="8" y="9" width="8" height="12" rx="2"/><path d="M12 9V6"/><path d="M16 12q3 2 3 5" strokeWidth="1.3" fill="none"/>
  </svg>
);

export const CatDumping = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 13h14M7 13v7a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-7"/><path d="M9 9h6"/>
  </svg>
);

export const CatSidewalk = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="5" r="2"/><path d="M12 7v5M8 12l4 5 4-5"/>
  </svg>
);

export const CatTraffic = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="9" y="3" width="6" height="18" rx="2"/><circle cx="12" cy="7" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="17" r="2"/>
  </svg>
);

export const CatNoise = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6 10h3l4-4v12l-4-4H6z"/><path d="M15 9a4 4 0 0 1 0 6"/>
  </svg>
);

export const CatWater = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2L4 14a8 8 0 0 0 16 0z"/>
  </svg>
);

export const CatPark = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 4L4 15h16z"/><path d="M12 15v5"/>
  </svg>
);

export const CatOther = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10"/><path d="M12 9a3 3 0 1 1 0 5v1M12 17v.01"/>
  </svg>
);

export const CATEGORIES = [
  { value: 'potholes', label: 'Potholes', Icon: CatPotholes },
  { value: 'streetlight', label: 'Lights', Icon: CatStreetlight },
  { value: 'graffiti', label: 'Graffiti', Icon: CatGraffiti },
  { value: 'illegal_dumping', label: 'Dumping', Icon: CatDumping },
  { value: 'sidewalk', label: 'Sidewalk', Icon: CatSidewalk },
  { value: 'traffic', label: 'Traffic', Icon: CatTraffic },
  { value: 'noise', label: 'Noise', Icon: CatNoise },
  { value: 'water', label: 'Drainage', Icon: CatWater },
  { value: 'other', label: 'Other', Icon: CatOther },
];

export const CAT_ICON_MAP = Object.fromEntries(
  CATEGORIES.map(({ value, Icon }) => [value, Icon])
);

export function getCategoryIcon(value, size = 18) {
  const Icon = CAT_ICON_MAP[value] || CatOther;
  return <Icon width={size} height={size} />;
}
