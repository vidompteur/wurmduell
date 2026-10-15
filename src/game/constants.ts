/** Feste Spielkonstanten. Einheiten: Welt-Pixel, Sekunden. */

export const TICK_RATE = 50;
export const DT = 1 / TICK_RATE;

export const WORLD_W = 2560;
export const WORLD_H = 1440;
/** Wasseroberfläche. Alles, was darunter landet, ertrinkt. */
export const WATER_Y = 1300;
/** Ein Wurm, dessen Füße diese Höhe erreichen, gilt als ertrunken. */
export const DROWN_Y = WATER_Y - 6;

export const GRAVITY = 900;

export const TURN_TIME = 45;
export const RETREAT_TIME = 3;
/** Mindestdauer der Auswertungsphase nach einem Zug. */
export const SETTLE_TIME = 1.0;
/** Maximaldauer der Auswertungsphase (Sicherung gegen hängende Würmer). */
export const SETTLE_MAX = 14;

export const WORM_MAX_HP = 100;
/** Ein Wurm ist grob 10 px breit und 16 px hoch; (x, y) sind die Füße. */
export const WORM_HALF_W = 5;
export const WORM_BODY_H = 16;
export const WORM_CENTER_OFFSET = 8;
export const WORM_HIT_RADIUS = 10;
export const WALK_SPEED = 70;
export const CLIMB_STEP = 6;
export const FALL_DAMAGE_THRESHOLD = 60;
export const FALL_DAMAGE_MAX = 50;

export const AIM_RATE = 60;
export const AIM_MIN = -85;
export const AIM_MAX = 85;
export const POWER_RATE = 0.8;

export const WIND_ACCEL = 140;
