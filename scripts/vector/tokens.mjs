// Design tokens for the Vector-Noir scene pack (the art-direction notes are kept out of the public repo: they quote the client brief).
// Hex values are PROPOSALS, not Genesis values; names marked [ours] are working names.
import { interpolate, formatHex } from 'culori';

export const C = {
  ink: '#0A0D24',       // Ink Indigo [ours]: ground, deepest shadow
  royal: '#161C52',     // Royal Indigo (named on genesis.com): ribs, sky mid
  majestic: '#2C4FA3',  // Majestic Blue (named on genesis.com): horizon, highlight line
  silk: '#3D2F5B',      // Purple Silk (named on genesis.com): upholstery, credenza panel
  violet: '#6E5A8A',    // Vintage Violet [name unverified]: lit edge of the silk, jar shadow
  white: '#EEE9DE',     // Moon Jar White [ours]
  cashmere: '#CDBB9E',  // Warm Cashmere [ours: name and tint]
  amber: '#F4B15A',     // Linear Amber [ours]: the two light lines only
};

// Three line tiers, in px at a 390-wide screen. Round caps and joins everywhere.
export const W = { structure: 2.4, object: 1.2, detail: 0.6 };

export const mix = (a, b, t) => formatHex(interpolate([a, b], 'oklab')(t));
export const n = (x) => +x.toFixed(2);
