import { Distance, toFraction, WOODWORKER_FRACTION_THRESHOLD } from 'cutlist';

export default function () {
  const { distanceUnit } = useProjectSettings();

  return (m: number | undefined | null) => {
    if (m == null || toValue(distanceUnit) == null) return;

    const distance = new Distance(m);
    if (toValue(distanceUnit) === 'in') {
      return `${toFraction(distance.in, WOODWORKER_FRACTION_THRESHOLD)}"`;
    }
    return `${roundMetric(distance.mm, 2)}mm`;
  };
}

function roundMetric(value: number, precision = 3) {
  return String(Number(value.toFixed(precision)));
}
