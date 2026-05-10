import { formatDistance } from 'cutlist';

export default function () {
  const { distanceUnit } = useProjectSettings();

  return (m: number | undefined | null) => {
    const unit = toValue(distanceUnit);
    if (m == null || unit == null) return;
    return formatDistance(m, unit);
  };
}
