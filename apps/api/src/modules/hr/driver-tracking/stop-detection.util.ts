import { type LatLng, haversineMeters } from '../attendance-geo/haversine.util.js';

/**
 * FIELD-rejim to'xtash aniqlash — sof funksiya, DB'siz (TZ 2026-07-28 §7).
 *
 * Ping-oqimini «harakatда» / «to'xtaган» segmentlarga ajratadi va hozirgi
 * (davom etayotган) to'xtash davomiyligini beradi — dispecher yon-panelidagi
 * «X daqiqa to'xtagan» ko'rsatkichi shundan. Gisterezis (30m kirish, 40m chiqish)
 * GPS «titrashi»ni susaytiradi; to'xtash faqat ≥3 daqiqa barqarorlikda TASDIQLANADI
 * (har svetoforда mildirab ketmasligi uchun).
 */

export interface StopPing extends LatLng {
  at: Date;
  /** Instantaneous GPS speed (m/s). null → faqat siljish signaliga tayaniladi. */
  speed?: number | null;
}

export interface StopSegment {
  startedAt: Date;
  /** null = hali davom etmoqda (oxirgi ping'gача). */
  endedAt: Date | null;
  durationSec: number;
  /** To'xtash markazi (yaqinlashtirilган — anchor nuqtasi). */
  centroid: LatLng;
}

export interface MovementState {
  status: 'moving' | 'stopped' | 'unknown';
  /** Tasdiqlangan davom etayotган to'xtash boshlanish vaqti (null = to'xtamagan). */
  currentStopStartedAt: Date | null;
  /** Hozir necha soniya to'xtagan (0 = harakatда). `now`gа nisbatan. */
  currentStopSec: number;
  /** Tasdiqlangan to'xtash segmentlari (yopilган + davom etayotган). */
  stops: StopSegment[];
  /** Oyna bo'yicha jami harakat / to'xtash soniyalari (smena yig'masi uchun). */
  movingSec: number;
  stoppedSec: number;
}

// TZ §7 ostonalari (tunable — bitta joyda). Gisterezis: STOP < MOVE.
export const STOP_RADIUS_M = 30; // shu ostonadan kam siljish → statsionar-nomzod
export const STOP_SPEED_MPS = 1.5; // ~5.4 km/h
export const STOP_MIN_SEC = 180; // 3 daqiqa uzluksiz → to'xtash TASDIQLANADI
export const MOVE_RADIUS_M = 40; // anchor'dan shu masofa → harakat boshlandi
export const MOVE_SPEED_MPS = 2.0; // ~7.2 km/h
// Ping'lar orasidagi bo'shliq shundan katta bo'lsa (oflayn-bufer, tunnel, ilova
// fon'да) — nima bo'lganini bilmaymiz: intervalни NA harakat NA to'xtash bucket'iga
// qo'shmaymiz (field-ingest distance MAX_GAP_FOR_DISTANCE_SEC=15min bilan simmetrik).
export const MAX_GAP_SEC = 15 * 60;

const secBetween = (a: Date, b: Date): number => Math.max(0, (b.getTime() - a.getTime()) / 1000);

const isStationaryStep = (dispM: number, speed?: number | null): boolean =>
  dispM < STOP_RADIUS_M || (speed != null && speed < STOP_SPEED_MPS);

// Chiqish: masofa ≥40m, YOKI speed≥2 m/s LEKIN anchor'дan real siljish ham bor
// (>30m). Sof Doppler-spike turgan joyда (disp~0) to'xtashni buzmaydi — kirish
// tomoni 3 daqiqa talab qilarkan, chiqish ham bitta shovqinли sample'dan qat'iy.
const isMovingAway = (dispFromAnchorM: number, speed?: number | null): boolean =>
  dispFromAnchorM >= MOVE_RADIUS_M ||
  (speed != null && speed >= MOVE_SPEED_MPS && dispFromAnchorM > STOP_RADIUS_M);

/**
 * Ping oynasini (VAQT BO'YICHA O'SIB tartiblangan) tahlil qilib harakat holatini
 * qaytaradi. `now` — hozirgi vaqt (davom etayotган to'xtashni shungача cho'zadi).
 * Bo'sh/yagona ping → 'unknown' (hukm chiqarishга yetarli emas).
 */
export function detectMovement(pings: StopPing[], now: Date): MovementState {
  const empty: MovementState = {
    status: 'unknown',
    currentStopStartedAt: null,
    currentStopSec: 0,
    stops: [],
    movingSec: 0,
    stoppedSec: 0,
  };
  if (pings.length < 2) return empty;

  const stops: StopSegment[] = [];
  let movingSec = 0;
  let stoppedSec = 0;
  // Statsionar «anchor» — statsionar-run boshlangan nuqta/vaqt.
  let anchor: { point: LatLng; since: Date } | null = null;
  // Anchor ≥3 daqiqaga yetsa TASDIQLANADI (anchor.since'dan boshlab).
  let confirmedStopStart: Date | null = null;

  for (let i = 1; i < pings.length; i++) {
    const prev = pings[i - 1];
    const cur = pings[i];
    if (!prev || !cur) continue;
    const dt = secBetween(prev.at, cur.at);

    // Uzoq bo'shliq (oflayn/tunnel): intervalni bucket'ga qo'shma. Davom etayotган
    // tasdiqlangan to'xtashni oxirgi ishonchli nuqta (prev.at) bilan yopib, holat-
    // mashinasini bo'shliqdan keyin toza qaytadan boshla.
    if (dt > MAX_GAP_SEC) {
      if (anchor && confirmedStopStart) {
        stops.push({
          startedAt: confirmedStopStart,
          endedAt: prev.at,
          durationSec: secBetween(confirmedStopStart, prev.at),
          centroid: anchor.point,
        });
      }
      anchor = null;
      confirmedStopStart = null;
      continue;
    }

    if (anchor) {
      const dispFromAnchor = haversineMeters(anchor.point, cur);
      if (isMovingAway(dispFromAnchor, cur.speed)) {
        // To'xtash tugadi. Tasdiqlangan bo'lsa — segmentni yop.
        if (confirmedStopStart) {
          stops.push({
            startedAt: confirmedStopStart,
            endedAt: cur.at,
            durationSec: secBetween(confirmedStopStart, cur.at),
            centroid: anchor.point,
          });
        }
        anchor = null;
        confirmedStopStart = null;
        movingSec += dt;
      } else {
        // Hali anchor atrofida statsionar.
        stoppedSec += dt;
        if (!confirmedStopStart && secBetween(anchor.since, cur.at) >= STOP_MIN_SEC) {
          confirmedStopStart = anchor.since; // retroaktiv — anchor boshlanishidan
        }
      }
    } else {
      // Harakatда — bu interval statsionar-boshlanishmi?
      const dispFromPrev = haversineMeters(prev, cur);
      if (isStationaryStep(dispFromPrev, cur.speed)) {
        anchor = { point: prev, since: prev.at }; // sekinlashgan joydan (prev)
        stoppedSec += dt;
        if (secBetween(anchor.since, cur.at) >= STOP_MIN_SEC) {
          confirmedStopStart = anchor.since;
        }
      } else {
        movingSec += dt;
      }
    }
  }

  // Davom etayotган (yopilmagan) tasdiqlangan to'xtash — `now`gача cho'z.
  if (anchor && confirmedStopStart) {
    const durationSec = secBetween(confirmedStopStart, now);
    stops.push({
      startedAt: confirmedStopStart,
      endedAt: null,
      durationSec,
      centroid: anchor.point,
    });
    return {
      status: 'stopped',
      currentStopStartedAt: confirmedStopStart,
      currentStopSec: durationSec,
      stops,
      movingSec,
      stoppedSec,
    };
  }

  return {
    status: 'moving',
    currentStopStartedAt: null,
    currentStopSec: 0,
    stops,
    movingSec,
    stoppedSec,
  };
}

/**
 * Ketma-ket ping'lar orasidagi jami bosib o'tilган masofa (metr) — smena
 * `distanceMeters` yig'masi uchun. Teleport (jump) filtrlan­magan deb hisoblaydi;
 * chaqiruvchi allaqachon jump-filter'dan o'tkazgan bo'ladi.
 */
export function pathDistanceMeters(pings: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < pings.length; i++) {
    const a = pings[i - 1];
    const b = pings[i];
    if (a && b) total += haversineMeters(a, b);
  }
  return total;
}
