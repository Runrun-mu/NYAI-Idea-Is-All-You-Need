// Chart Component - Canvas-based pie chart
const Chart = (() => {
  function renderPieChart(container, data) {
    container.innerHTML = '';

    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">No data to display</div></div>';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'chart-container';

    // Canvas
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'chart-canvas-wrap';
    const canvas = document.createElement('canvas');
    const size = 180;
    canvas.width = size;
    canvas.height = size;
    canvasWrap.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 10;

    let startAngle = -Math.PI / 2;

    data.forEach(d => {
      const sliceAngle = (d.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Inner circle for donut effect
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.55, 0, 2 * Math.PI);
    ctx.fillStyle = '#111111';
    ctx.fill();

    // Center text
    ctx.fillStyle = '#e5e5e5';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, centerX, centerY - 8);
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillStyle = '#a3a3a3';
    ctx.fillText('Total', centerX, centerY + 12);

    // Legend
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    data.forEach(d => {
      const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-color" style="background:${d.color}"></span>
        <span>${d.label}</span>
        <span class="legend-value">${d.value} (${pct}%)</span>
      `;
      legend.appendChild(item);
    });

    wrap.appendChild(canvasWrap);
    wrap.appendChild(legend);
    container.appendChild(wrap);
  }

  return { renderPieChart };
})();
