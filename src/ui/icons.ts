// Arayüz ikonları: Lucide ikon paketi (yalnızca kullanılanlar pakete girer).
import {
  AlertTriangle,
  Award,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Cloud,
  Dices,
  Droplets,
  Eraser,
  Globe,
  type IconNode,
  Images,
  Lightbulb,
  Lock,
  Menu,
  Moon,
  Mountain,
  Orbit,
  Palette,
  Pause,
  Play,
  Rocket,
  Save,
  Settings,
  Snowflake,
  Sprout,
  Sun,
  Target,
  ThermometerSun,
  Zap,
  createElement,
} from 'lucide';

// Pakette olmayan iki ikon, Lucide çizgi stilinde
const svg = (children: NonNullable<IconNode[2]>): IconNode => ['svg', Sun[1], children];
const Comet = svg([
  ['circle', { cx: '16', cy: '8', r: '4' }],
  ['path', { d: 'M13 11 4 20' }],
  ['path', { d: 'M12.5 6.5 6 13' }],
  ['path', { d: 'M17.5 11.5 11 18' }],
]);
const Volcano = svg([
  ['path', { d: 'm2 21 7-11h6l7 11Z' }],
  ['path', { d: 'M10 6c0-1.7 1-2.5 2-2.5s2 .8 2 2.5' }],
  ['path', { d: 'M12 10V7' }],
]);

const ICONS = {
  alert: AlertTriangle,
  award: Award,
  book: BookOpen,
  camera: Camera,
  check: Check,
  chevron: ChevronRight,
  cloud: Cloud,
  comet: Comet,
  dice: Dices,
  droplets: Droplets,
  eraser: Eraser,
  globe: Globe,
  images: Images,
  lightbulb: Lightbulb,
  lock: Lock,
  menu: Menu,
  moon: Moon,
  mountain: Mountain,
  orbit: Orbit,
  palette: Palette,
  pause: Pause,
  play: Play,
  rocket: Rocket,
  save: Save,
  settings: Settings,
  snowflake: Snowflake,
  sprout: Sprout,
  sun: Sun,
  target: Target,
  thermometer: ThermometerSun,
  volcano: Volcano,
  zap: Zap,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 18): SVGElement {
  const el = createElement(ICONS[name]);
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('icon');
  return el;
}
