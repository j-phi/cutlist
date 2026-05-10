import { formatDistance } from 'cutlist';

/**
 * Reactive formatter that reads the active project's distance unit and
 * precision, returning a function callable with a meter value. One
 * formatter, one rule — same string everywhere a stored value is shown
 * (BOM, layout, PDF, viewer labels).
 */
export default function () {
  const { distanceUnit, precision } = useProjectSettings();

  return (m: number | undefined | null) => {
    const unit = toValue(distanceUnit);
    if (m == null || unit == null) return;
    return formatDistance(m, unit, precision.value);
  };
}
