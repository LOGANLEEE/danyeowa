export interface Fr24Row {
  dateText: string;
  origin: string;
  dest: string;
  depLocal: string;
  arrLocal: string;
}

export interface Fr24Leg {
  legSeq: number;
  origin: string;
  dest: string;
  depLocal: string;
  arrLocal: string;
  dayOffset: number;
  daysOfWeek: string;
}

export function parseFr24Rows(html: string): Fr24Row[];
export function looksBlocked(html: string): boolean;
export function deriveLegSchedule(rows: Fr24Row[]): Fr24Leg[];
