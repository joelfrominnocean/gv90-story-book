/** World units: the page is 1 wide. The spine runs along Y at x = 0; the right page is x in [0, PAGE_W]. */
export const PAGE_W = 1;
/** Modelled on the reference photo: a tall, narrow page (about 0.69). */
export const PAGE_H = 1.45;
/** Soft wrapper boards are thicker than a single leaf. */
export const TH_COVER = 0.02;
/** Thickest a single leaf gets; long books cap their total thickness instead (see Stack). */
export const TH_LEAF = 0.011;
/** Columns across a bending leaf. */
export const SEGMENTS = 40;
/** In reading pose the page overfills the viewport height by this much, so no table shows. */
export const READING_FIT = 1.04;
/** Camera field of view, degrees. Narrow, so the book keeps its proportions when tilted. */
export const FOV = 22;
