import { formatDistance, type Micrometres } from 'cutlist';

/**
 * Reactive formatter that reads the active project's distance unit and
 * precision, returning a function callable with an integer-micrometre
 * value. One formatter, one rule — same string everywhere a stored
 * value is shown (BOM, layout, PDF, viewer labels).
 */
export default function () {
  const { distanceUnit, precision } = useProjectSettings();

  return (um: Micrometres | undefined | null) => {
    const unit = toValue(distanceUnit);
    if (um == null || unit == null) return;
    return formatDistance(um, unit, precision.value);
  };
}
