// Oyuncunun ilerlemesi: tamamlanan görevler, rozetler, ansiklopedi ve incelenen gerçek gezegenler.
export interface Progress {
  completedMissions: string[];
  activeMission: string | null;
  badges: string[];
  discovered: string[];
  realViewed: string[];
}

const KEY = 'gezegen-atolyesi:progress';

export function loadProgress(): Progress {
  const empty: Progress = { completedMissions: [], activeMission: null, badges: [], discovered: [], realViewed: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Progress> | null;
    if (!raw || typeof raw !== 'object') return empty;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return {
      completedMissions: list(raw.completedMissions),
      activeMission: typeof raw.activeMission === 'string' ? raw.activeMission : null,
      badges: list(raw.badges),
      discovered: list(raw.discovered),
      realViewed: list(raw.realViewed),
    };
  } catch {
    return empty;
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // depolama kapalıysa ilerleme yalnızca bu oturumda tutulur
  }
}
