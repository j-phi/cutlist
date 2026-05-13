import type { Micrometres } from 'cutlist';

/**
 * Pixel scale for the layout preview: 1 px per 2000 µm (= 500 px per metre).
 */
export const PX_PER_UM = 1 / 2000;

export default function () {
  return (um: Micrometres) => `${um * PX_PER_UM}px`;
}
