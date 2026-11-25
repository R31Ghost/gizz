export function drawScope(canvas, traces, active, range) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas;
  context.fillStyle = '#232d28';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#4c6054';
  context.beginPath();
  for (let i = 1; i < 8; i++) {
    context.moveTo(i * width / 8, 0);
    context.lineTo(i * width / 8, height);
  }
  for (let i = 1; i < 4; i++) {
    context.moveTo(0, i * height / 4);
    context.lineTo(width, i * height / 4);
  }
  context.stroke();
  if (!traces) return;

  traces.forEach((samples, index) => {
    if (!active[index]) return;
    context.strokeStyle = index === 0 ? '#a3e3b9' : '#ffc58f';
    context.beginPath();
    const y = (value) => Math.min(height - 1, Math.max(0, height / 2 * (1 - value / range)));
    if (samples.length <= width) {
      context.moveTo(0, y(samples[0]));
      for (let i = 1; i < samples.length; i++) {
        context.lineTo(i * (width - 1) / (samples.length - 1), y(samples[i]));
      }
    } else {
      // Plot each pixel column's minimum and maximum to retain short peaks.
      for (let x = 0; x < width; x++) {
        const end = Math.floor((x + 1) * samples.length / width);
        let min = Infinity;
        let max = -Infinity;
        for (let i = Math.floor(x * samples.length / width); i < end; i++) {
          min = Math.min(min, samples[i]);
          max = Math.max(max, samples[i]);
        }
        context.moveTo(x, y(max));
        context.lineTo(x, y(min));
      }
    }
    context.stroke();
  });
}
