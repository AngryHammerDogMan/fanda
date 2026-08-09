(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart: Cost Breakdown (Pie) ---
  var chartCost = echarts.init(document.getElementById('chart-cost'), null, { renderer: 'svg' });
  
  var costData = [
    { name: '微信认证', value: 25 },
    { name: '抖音认证', value: 25 },
    { name: '轻量服务器', value: 24 },
    { name: 'RDS PostgreSQL', value: 10 },
    { name: 'OSS 对象存储', value: 8 },
    { name: 'Redis 缓存', value: 7 },
    { name: '域名', value: 5 },
    { name: '短信服务', value: 4 },
    { name: 'CDN 加速', value: 2 }
  ];

  var pieColors = [accent, accent2, '#6b4c9a', '#d4a843', '#4a8ca8', '#c9705a', '#7a9e6b', '#8a7e74', '#b0a89c'];

  chartCost.setOption({
    animation: false,
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: function(p) {
        return p.name + '：<strong>¥' + p.value + '/月</strong>（' + p.percent + '%）';
      }
    },
    color: pieColors,
    series: [{
      type: 'pie',
      radius: ['45%', '78%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 4,
        borderColor: bg2,
        borderWidth: 3
      },
      label: {
        show: true,
        position: 'outside',
        formatter: '{b}\n¥{c}',
        fontFamily: 'InstrumentSans, sans-serif',
        fontSize: 12,
        color: ink,
        lineHeight: 18
      },
      labelLine: {
        lineStyle: { color: rule }
      },
      emphasis: {
        label: { fontSize: 16, fontWeight: 'bold' },
        scaleSize: 8
      },
      data: costData
    }]
  });

  window.addEventListener('resize', function() { chartCost.resize(); });
})();