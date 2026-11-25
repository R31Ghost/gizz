export function controlReadout(value, unit) {
  if (!unit) return String(value);
  return value + (unit === '%' ? '%' : ' ' + unit);
}

export function lfoRateReadout(hertz) {
  const period = 1000 / hertz;
  const duration = period >= 1000
    ? controlReadout(Number((period / 1000).toFixed(2)), 's')
    : controlReadout(Number(period.toFixed(1)), 'ms');
  return controlReadout(hertz, 'Hz') + ' · ' + duration + '/cycle';
}

export function scopeTimeReadout(milliseconds) {
  const rounded = (value) => Number(value.toFixed(2));
  return rounded(milliseconds) + ' ms across · ' + rounded(milliseconds / 8) + ' ms/div';
}
