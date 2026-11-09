/**
 * Character roster. The crew are original characters created for this game. Dr. Miller, Dr. Mann and
 * Edmunds are alternate-timeline versions of the film's Lazarus explorers.
 */
export interface CharacterDef {
  id: string;
  name: string;
  role: string;
  bio: string;
  voice: { pitch?: number; rate?: number; female?: boolean };
  look: { suit: string; skin: string; hair: string; build: number; height: number; female: boolean; outfit: 'jumpsuit' | 'farmer' | 'staff' | 'suit' };
  crew?: boolean;
}

export const CHARACTERS: Record<string, CharacterDef> = {
  ward: {
    id: 'ward', name: 'Elias Ward', role: 'Flight Systems Engineer',
    bio: 'Former Navy aviator and propulsion engineer. Dry humour, unshakeable under pressure. Keeps the machines alive.',
    voice: { pitch: 0.9, rate: 1.0 }, crew: true,
    look: { suit: 'suit_white', skin: 'skin_dark', hair: 'hair_dark', build: 1.05, height: 1.84, female: false, outfit: 'jumpsuit' },
  },
  sato: {
    id: 'sato', name: 'Dr. Hana Sato', role: 'Planetary Scientist',
    bio: 'Astrobiologist and geochemist. Curious, quick, relentlessly data-driven — and quietly hopeful.',
    voice: { pitch: 1.12, rate: 1.04, female: true }, crew: true,
    look: { suit: 'suit_white', skin: 'skin', hair: 'hair_dark', build: 0.92, height: 1.63, female: true, outfit: 'jumpsuit' },
  },
  reyes: {
    id: 'reyes', name: 'Dr. Amara Reyes', role: 'Mission & Medical Specialist',
    bio: 'Flight surgeon and mission planner. Calm, protective, by-the-book until the book stops making sense.',
    voice: { pitch: 1.0, rate: 0.97, female: true }, crew: true,
    look: { suit: 'suit_white', skin: 'skin', hair: 'hair_brown', build: 0.95, height: 1.7, female: true, outfit: 'jumpsuit' },
  },
  kessler: {
    id: 'kessler', name: 'Director Ruth Kessler', role: 'Program Director, Lazarus/Endurance',
    bio: 'Runs what is left of NASA from a mountain bunker. Carries every decision personally.',
    voice: { pitch: 0.85, rate: 0.93, female: true },
    look: { suit: 'cloth_navy', skin: 'skin', hair: 'hair_gray', build: 0.95, height: 1.68, female: true, outfit: 'staff' },
  },
  walt: {
    id: 'walt', name: 'Walt Hollis', role: 'Neighbour, corn farmer',
    bio: 'Has farmed the section to the south for forty years. Has watched the wheat die, then the okra.',
    voice: { pitch: 0.75, rate: 0.9 },
    look: { suit: 'cloth_flannel', skin: 'skin', hair: 'hair_gray', build: 1.1, height: 1.78, female: false, outfit: 'farmer' },
  },
  june: {
    id: 'june', name: 'June Pike', role: 'Neighbour, mechanic',
    bio: 'Keeps half the county’s machinery running with salvaged parts and stubbornness.',
    voice: { pitch: 1.15, rate: 1.08, female: true },
    look: { suit: 'cloth_denim', skin: 'skin', hair: 'hair_brown', build: 0.9, height: 1.66, female: true, outfit: 'farmer' },
  },
  tomas: {
    id: 'tomas', name: 'Tomas Ruiz', role: 'Neighbour, grain hauler',
    bio: 'Drives the grain truck between farms and the co-op. Hears every rumour in the county.',
    voice: { pitch: 1.0, rate: 1.05 },
    look: { suit: 'cloth_khaki', skin: 'skin_dark', hair: 'hair_dark', build: 1.0, height: 1.76, female: false, outfit: 'farmer' },
  },
  miller: {
    id: 'miller', name: 'Dr. Laura Miller', role: 'Lazarus explorer — ocean world',
    bio: 'Survived on a planet where an hour costs seven years. Exhausted, frightened, still recording data.',
    voice: { pitch: 1.05, rate: 1.06, female: true },
    look: { suit: 'suit_white', skin: 'skin', hair: 'hair_brown', build: 0.88, height: 1.67, female: true, outfit: 'suit' },
  },
  mann: {
    id: 'mann', name: 'Dr. Mann', role: 'Lazarus explorer — ice world',
    bio: 'The most celebrated of the Lazarus volunteers. Charming, eloquent, and very, very lonely.',
    voice: { pitch: 0.85, rate: 0.95 },
    look: { suit: 'suit_white', skin: 'skin', hair: 'hair_brown', build: 1.0, height: 1.82, female: false, outfit: 'suit' },
  },
  capcom: {
    id: 'capcom', name: 'Mission Control', role: 'NASA',
    bio: '', voice: { pitch: 1.0, rate: 1.06 },
    look: { suit: 'cloth_navy', skin: 'skin', hair: 'hair_dark', build: 1, height: 1.75, female: false, outfit: 'staff' },
  },
  computer: {
    id: 'computer', name: 'Flight Computer', role: '', bio: '', voice: { pitch: 1.0, rate: 1.1 },
    look: { suit: 'cloth_navy', skin: 'skin', hair: 'hair_dark', build: 1, height: 1.75, female: false, outfit: 'staff' },
  },
};

export const CREW = ['ward', 'sato', 'reyes'];
