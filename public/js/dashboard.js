async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('İstek başarısız: ' + r.status);
  return r.json();
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#','');
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fmtNumber(n) {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n);
}

function fmtMoneyCompact(n) {
  const abs = Math.abs(Number(n));
  if (abs >= 1e9) return `${fmtNumber(n / 1e9)} milyar`;
  if (abs >= 1e6) return `${fmtNumber(n / 1e6)} milyon`;
  if (abs >= 1e3) return `${fmtNumber(n / 1e3)} bin`;
  return fmtNumber(n);
}

function pickMoneyStep(maxVal) {
  const abs = Math.abs(Number(maxVal));
  if (abs >= 3e9) return 500000000;
  if (abs >= 1e9) return 250000000;
  if (abs >= 5e8) return 100000000;
  return 50000000;
}

function setKpi(id, value, unitSuffix = '') {
  const el = document.querySelector(`#${id} .value`);
  if (el) el.textContent = `${fmtNumber(value)} ${unitSuffix}`.trim();
}

async function loadKpis() {
  try {
    const data = await fetchJSON('/api/kpi');
    setKpi('kpi-uretim', data.toplamUretimMWh, elUnit('kpi-uretim'));
    setKpi('kpi-gelir', data.toplamGelirTL, elUnit('kpi-gelir'));
    setKpi('kpi-gider', data.toplamGiderTL, elUnit('kpi-gider'));
    setKpi('kpi-kar', data.toplamKarTL, elUnit('kpi-kar'));
    setKpi('kpi-marj', data.karMarjiYuzde, '%');
    setKpi('kpi-risk', data.riskliTesisSayisi, elUnit('kpi-risk'));
    if (data.uyarı) {
      console.warn(data.uyarı);
    }
  } catch (e) {
    console.error(e);
  }
}

function elUnit(id) {
  const el = document.querySelector(`#${id} .value`);
  return el ? el.dataset.unit : '';
}

function initCharts() {
  const fontSize = 12;
  const PALETTE = ['#ff6b6b','#1f6feb','#f2cc60','#7ee787','#bf3989','#56b6c2'];
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false, labels: { color: '#fff', font: { size: fontSize, weight: '600' } } },
      tooltip: { titleColor: '#fff', bodyColor: '#fff' },
    },
    scales: {
      x: { ticks: { color: '#fff', font: { size: fontSize, weight: '400' }, maxRotation: 40, minRotation: 0 }, grid: { color: 'rgba(255,255,255,0.08)' } },
      y: { ticks: { color: '#fff', font: { size: fontSize, weight: '400' } }, grid: { color: 'rgba(255,255,255,0.08)' } },
    },
    elements: { point: { radius: 3 }, line: { borderWidth: 2 } },
  };
  const labels = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz'];
  const data = labels.map((_, i) => 50 + Math.random() * 50 + i * 5);

  const c1 = document.getElementById('chart1');
  const g1 = c1.getContext('2d').createLinearGradient(0,0,0,c1.height);
  g1.addColorStop(0, hexToRgba(PALETTE[0],0.45));
  g1.addColorStop(1, hexToRgba(PALETTE[0],0.05));
  const yearSel = document.getElementById('chart1-year');
  function populateYearsAndRender(){
    fetchJSON('/api/trend/years').then(years => {
      if (Array.isArray(years) && years.length) {
        yearSel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
        tryFirstNonZeroYear(years);
      } else {
        const y = new Date().getFullYear();
        yearSel.innerHTML = `<option value="${y}">${y}</option>`;
        renderTrend(y);
      }
    }).catch(() => {
      const y = new Date().getFullYear();
      yearSel.innerHTML = `<option value="${y}">${y}</option>`;
      renderTrend(y);
    });
  }
  function allZero(arr){ return !arr || arr.every(v => Number(v) === 0); }
  function tryFirstNonZeroYear(years){
    const testYears = years.slice();
    (function next(){
      const y = testYears.shift();
      if (y === undefined) return renderTrend(years[0]);
      fetchJSON(`/api/trend/uretim?year=${y}`).then(tr => {
        if (allZero(tr.values)) { next(); }
        else { yearSel.value = y; renderTrend(y); }
      }).catch(() => next());
    })();
  }
  function renderTrend(year){
    const h = c1.clientHeight || 260;
    const ctx = c1.getContext('2d');
    const g1 = ctx.createLinearGradient(0,0,0,h);
    g1.addColorStop(0, hexToRgba(PALETTE[0],0.45));
    g1.addColorStop(1, hexToRgba(PALETTE[0],0.05));
    const trendOpts = JSON.parse(JSON.stringify(baseOpts));
    trendOpts.scales.x.title = { display:true, text:'Aylar', color:'#fff', font:{ size: fontSize, weight:'400' } };
    trendOpts.scales.y.title = { display:true, text:'Üretim (MWh)', color:'#fff', font:{ size: fontSize, weight:'400' } };
    trendOpts.scales.x.ticks = { color:'#fff', font:{ size: fontSize, weight:'400' }, autoSkip:false, maxRotation:0, minRotation:0, padding:8 };
    trendOpts.layout = { padding: { bottom: 28 } };
    fetchJSON(`/api/trend/uretim?year=${year}`).then(tr => {
      if (window.__chart1) { window.__chart1.destroy(); }
      window.__chart1 = new Chart(c1, { type: 'line', data: { labels: tr.labels, datasets: [{ label:`Toplam Üretim (MWh) - ${tr.year}`, data: tr.values, borderColor: PALETTE[0], backgroundColor: g1, fill:true }] }, options: trendOpts });
    }).catch(()=>{
      if (window.__chart1) { window.__chart1.destroy(); }
      window.__chart1 = new Chart(c1, { type: 'line', data: { labels: ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'], datasets: [{ label:`Toplam Üretim (MWh) - ${year}`, data: Array(12).fill(0), borderColor: PALETTE[0], backgroundColor: g1, fill:true }] }, options: trendOpts });
    });
  }
  populateYearsAndRender();
  yearSel?.addEventListener('change', (e)=> renderTrend(e.target.value));

  const c2 = document.getElementById('chart2');
  const yearSel2 = document.getElementById('chart2-year');
  function renderEfficiency(year){
    const effOpts = JSON.parse(JSON.stringify(baseOpts));
    effOpts.scales.x.title = { display:false };
    effOpts.scales.y.title = { display:true, text:'Verimlilik (%)', color:'#fff', font:{ size: fontSize, weight:'400' } };
    effOpts.scales.y.min = 0;
    effOpts.scales.x.ticks = { color:'#fff', font:{ size: fontSize, weight:'400' }, autoSkip:true, maxRotation:40, minRotation:40, padding:6 };
    effOpts.scales.x.offset = true;
    effOpts.scales.x.grid = { color:'rgba(255,255,255,0.08)', offset:true };
    effOpts.layout = { padding: { bottom: 28 } };
    fetchJSON(`/api/verimlilik?year=${year}`).then(res => {
      const desired = ['Alaşehir','Eskişehir','Kızıldere','Kütahya','Lüleburgaz','Sivas'];
      function baseName(name){
        const n = name.toLowerCase();
        if (n.includes('alaşehir')) return 'Alaşehir';
        if (n.includes('eskişehir')) return 'Eskişehir';
        if (n.includes('kızıldere')) return 'Kızıldere';
        if (n.includes('kütahya')) return 'Kütahya';
        if (n.includes('lüleburgaz')) return 'Lüleburgaz';
        if (n.includes('sivas')) return 'Sivas';
        return null;
      }
      function colorForType(t){
        switch(t){
          case 'Güneş': return '#f2cc60';
          case 'Rüzgar': return '#1f6feb';
          case 'Doğalgaz': return '#ff6b6b';
          case 'Jeotermal': return '#ffa657';
          default: return hexToRgba(PALETTE[1],0.85);
        }
      }
      const items = res.labels.map((lbl, i) => ({ label: baseName(lbl), value: res.values[i], type: (res.types||[])[i] })).filter(it => it.label);
      const byLabel = new Map();
      items.forEach(it => { if (!byLabel.has(it.label)) byLabel.set(it.label, it); });
      const finalItems = desired.map(d => byLabel.get(d)).filter(Boolean);
      const labels = finalItems.map(it => it.label);
      const values = finalItems.map(it => it.value);
      const colors = finalItems.map(it => colorForType(it.type));
      if (window.__chart2) window.__chart2.destroy();
      window.__chart2 = new Chart(c2, { type: 'bar', data: { labels, datasets: [{ label:`Verimlilik - ${res.year}`, data: values, backgroundColor: colors, borderColor: colors, borderRadius: 8, borderSkipped: false, maxBarThickness: 22, categoryPercentage: 0.5, barPercentage: 0.9 }] }, options: effOpts });
    }).catch(()=>{
      if (window.__chart2) window.__chart2.destroy();
      window.__chart2 = new Chart(c2, { type: 'bar', data: { labels: [], datasets: [{ label:`Verimlilik - ${year}`, data: [], backgroundColor: hexToRgba(PALETTE[1],0.85), borderRadius: 8, borderSkipped: false }] }, options: effOpts });
    });
  }
  function initEffYears(){
    fetchJSON('/api/trend/years').then(years => {
      if (Array.isArray(years) && years.length) {
        yearSel2.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
        renderEfficiency(years[0]);
      } else {
        const y = new Date().getFullYear();
        yearSel2.innerHTML = `<option value="${y}">${y}</option>`;
        renderEfficiency(y);
      }
    }).catch(() => {
      const y = new Date().getFullYear();
      yearSel2.innerHTML = `<option value="${y}">${y}</option>`;
      renderEfficiency(y);
    });
  }
  initEffYears();
  yearSel2?.addEventListener('change', (e)=> renderEfficiency(e.target.value));
  const c3 = document.getElementById('chart3');
  const yearSel3 = document.getElementById('chart3-year');
  function colorForType(t){
    switch(t){
      case 'Güneş': return '#f2cc60';
      case 'Rüzgar': return '#1f6feb';
      case 'Doğalgaz': return '#ff6b6b';
      case 'Jeotermal': return '#ffa657';
      default: return '#56b6c2';
    }
  }
  function renderBubble(year){
    const bubbleOpts = JSON.parse(JSON.stringify(baseOpts));
    bubbleOpts.parsing = true;
    bubbleOpts.scales = {
      x: { type:'linear', title:{ display:true, text:'Kurulu Güç (MW)', color:'#fff', font:{ size: fontSize, weight:'400' } }, ticks:{ color:'#fff', font:{ size: fontSize, weight:'400' } }, grid:{ color:'rgba(255,255,255,0.08)' } },
      y: { type:'linear', title:{ display:true, text:'Verimlilik Skoru', color:'#fff', font:{ size: fontSize, weight:'400' } }, ticks:{ color:'#fff', font:{ size: fontSize, weight:'400' } }, grid:{ color:'rgba(255,255,255,0.08)' }, min: 0, suggestedMax: 1.2 },
    };
    bubbleOpts.layout = { padding: { bottom: 28 } };
    bubbleOpts.plugins.tooltip = {
      callbacks: {
        label: (ctx) => {
          const d = ctx.raw;
          return [
            `${d.name} • ${d.enerjiTuru}`,
            `Güç: ${fmtNumber(d.x)} MW`,
            `Verim: ${fmtNumber(d.y)}`,
            `Karbon Yoğunluğu: ${fmtNumber(d.ci)} t/MWh`
          ];
        }
      },
      displayColors: false,
      titleColor:'#fff', bodyColor:'#fff',
      bodyFont: { size: 12 }
    };
    fetchJSON(`/api/verimlilik-bubble?year=${year}`).then(res => {
      const minR = 6, maxR = 25;
      const colors = res.points.map(p => colorForType(p.enerjiTuru));
      const bgColors = res.points.map((p,i) => hexToRgba(colors[i], 0.6));
      const brColors = colors;
      const cis = res.points.map(p => Number(p.ci));
      const minCiLocal = cis.length ? Math.min(...cis) : 0;
      const maxCiLocal = cis.length ? Math.max(...cis) : 1;
      const range = Math.max(1e-9, maxCiLocal - minCiLocal);
      const dataPts = res.points.map(p => {
        const fallbackN = (Number(p.ci) - minCiLocal) / range;
        const baseN = Number.isFinite(Number(p.ciNorm)) ? Number(p.ciNorm) : fallbackN;
        const n = Math.max(0, Math.min(1, baseN));
        const r = Math.round(minR + Math.pow(n, 0.96) * (maxR - minR));
        return { x: Number(p.x), y: Number(p.y), r, name: p.name, enerjiTuru: p.enerjiTuru, ci: p.ci };
      });
      const maxX = dataPts.length ? Math.max(...dataPts.map(d=>d.x)) : 0;
      if (maxX > 0) {
        bubbleOpts.scales.x.min = 0;
        bubbleOpts.scales.x.suggestedMax = Math.ceil(maxX * 1.1);
      } else {
        bubbleOpts.scales.x.min = 0;
        bubbleOpts.scales.x.suggestedMax = 10;
      }
      if (window.__chart3) window.__chart3.destroy();
      window.__chart3 = new Chart(c3, { type:'bubble', data: { datasets: [{ label:`Verimlilik Skoru - ${res.year}`, data: dataPts, backgroundColor: bgColors, borderColor: brColors, borderWidth:1 }] }, options: bubbleOpts });
    }).catch(() => {
      if (window.__chart3) window.__chart3.destroy();
      window.__chart3 = new Chart(c3, { type:'bubble', data: { datasets: [{ label:`Verimlilik Skoru - ${year}`, data: [] }] }, options: bubbleOpts });
    });
  }
  function initBubbleYears(){
    fetchJSON('/api/trend/years').then(years => {
      if (Array.isArray(years) && years.length) {
        yearSel3.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
        (function pick(){
          const y = years[0];
          fetchJSON(`/api/verimlilik-bubble?year=${y}`).then(res => {
            if (res.points && res.points.length) { renderBubble(y); }
            else { renderBubble(years[years.length-1]); }
          }).catch(()=> renderBubble(years[0]));
        })();
      } else {
        const y = new Date().getFullYear();
        yearSel3.innerHTML = `<option value="${y}">${y}</option>`;
        renderBubble(y);
      }
    }).catch(() => {
      const y = new Date().getFullYear();
      yearSel3.innerHTML = `<option value="${y}">${y}</option>`;
      renderBubble(y);
    });
  }
  initBubbleYears();
  yearSel3?.addEventListener('change', (e)=> renderBubble(e.target.value));

  const c4 = document.getElementById('chart4');
  const yearSel4 = document.getElementById('chart4-year');
  function renderProfit(year){
    const opts4 = JSON.parse(JSON.stringify(baseOpts));
    opts4.scales.x.title = { display:false };
    opts4.scales.y.title = { display:true, text:'Tutar (TL)', color:'#fff', font:{ size: fontSize, weight:'400' } };
    opts4.scales.y.min = 0;
    opts4.scales.y.ticks = { color:'#fff', font:{ size: fontSize, weight:'400' }, callback: (v)=> fmtMoneyCompact(v) };
    opts4.scales.x.ticks = { color:'#fff', font:{ size: fontSize, weight:'400' }, autoSkip:true, maxRotation:40, minRotation:40, padding:6 };
    opts4.scales.x.offset = true;
    opts4.scales.x.grid = { color:'rgba(255,255,255,0.08)', offset:true };
    opts4.layout = { padding: { bottom: 28 } };
    opts4.plugins.legend = { display:true, labels:{ color:'#fff', font:{ size: fontSize, weight:'500' } } };
    opts4.plugins.tooltip = {
      callbacks:{
        label: (ctx) => `${ctx.dataset.label}: ${fmtNumber(ctx.parsed.y)} TL`
      }, titleColor:'#fff', bodyColor:'#fff'
    };
    fetchJSON(`/api/maliyet-gelir-kar?year=${year}`).then(res => {
      const labels = res.labels;
      const gelir = res.gelir;
      const maliyet = res.maliyet;
      const kar = res.kar;
      const maxVal = Math.max(0, ...gelir, ...maliyet, ...kar);
      const step = pickMoneyStep(maxVal);
      opts4.scales.y.ticks.stepSize = step;
      opts4.scales.y.suggestedMax = Math.ceil(maxVal / step) * step;
      opts4.scales.y.grace = '5%';
      if (window.__chart4) window.__chart4.destroy();
      window.__chart4 = new Chart(c4, {
        type:'bar',
        data: {
          labels,
          datasets: [
            { label:'Gelir', data: gelir, backgroundColor: '#7ee787', borderColor:'#7ee787', borderRadius:8, borderSkipped:false, maxBarThickness:30, categoryPercentage:0.65, barPercentage:0.9 },
            { label:'Maliyet', data: maliyet, backgroundColor: '#ff6b6b', borderColor:'#ff6b6b', borderRadius:8, borderSkipped:false, maxBarThickness:30, categoryPercentage:0.65, barPercentage:0.9 },
            { label:'Net Kar', data: kar, backgroundColor: '#f2cc60', borderColor:'#f2cc60', borderRadius:8, borderSkipped:false, maxBarThickness:30, categoryPercentage:0.65, barPercentage:0.9 },
          ]
        },
        options: opts4
      });
    }).catch(() => {
      if (window.__chart4) window.__chart4.destroy();
      window.__chart4 = new Chart(c4, { type:'bar', data:{ labels:[], datasets:[{ label:'Gelir', data:[], backgroundColor:'#7ee787' }] }, options: opts4 });
    });
  }
  function initProfitYears(){
    fetchJSON('/api/trend/years').then(years => {
      if (Array.isArray(years) && years.length) {
        yearSel4.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
        renderProfit(years[0]);
      } else {
        const y = new Date().getFullYear();
        yearSel4.innerHTML = `<option value="${y}">${y}</option>`;
        renderProfit(y);
      }
    }).catch(() => {
      const y = new Date().getFullYear();
      yearSel4.innerHTML = `<option value="${y}">${y}</option>`;
      renderProfit(y);
    });
  }
  initProfitYears();
  yearSel4?.addEventListener('change', (e)=> renderProfit(e.target.value));

  const c5 = document.getElementById('chart5');
  const yearSel5 = document.getElementById('chart5-year');
  function renderCarbon(year){
    const opts5 = JSON.parse(JSON.stringify(baseOpts));
    opts5.scales.x.title = { display:false };
    opts5.scales.y.title = { display:true, text:'Karbon Yoğunluğu (t/MWh)', color:'#fff', font:{ size: fontSize, weight:'400' } };
    opts5.scales.y.min = 0;
    opts5.scales.x.ticks = { color:'#fff', font:{ size: fontSize, weight:'400' }, autoSkip:true, maxRotation:40, minRotation:40, padding:6 };
    opts5.scales.x.offset = true;
    opts5.scales.x.grid = { color:'rgba(255,255,255,0.08)', offset:true };
    opts5.layout = { padding: { bottom: 28 } };
    opts5.plugins.legend = { display:false };
    opts5.plugins.tooltip = { callbacks:{ label:(ctx)=> `${ctx.label}: ${fmtNumber(ctx.parsed.y)} t/MWh` }, titleColor:'#fff', bodyColor:'#fff' };
    fetchJSON(`/api/karbon-yogunluk?year=${year}`).then(res => {
      const labels = res.labels;
      const values = res.values.map(v => Number(v));
      const refs = res.refs.map(v => Number(v||0));
      const colors = values.map((v,i) => v > refs[i] && refs[i] > 0 ? '#ff6b6b' : '#1f6feb');
      if (window.__chart5) window.__chart5.destroy();
      window.__chart5 = new Chart(c5, { type:'bar', data:{ labels, datasets:[{ data: values, backgroundColor: colors, borderColor: colors, borderRadius:8, borderSkipped:false, maxBarThickness:26, categoryPercentage:0.55, barPercentage:0.9 }] }, options: opts5 });
    }).catch(() => {
      if (window.__chart5) window.__chart5.destroy();
      window.__chart5 = new Chart(c5, { type:'bar', data:{ labels:[], datasets:[{ data:[] }] }, options: opts5 });
    });
  }
  function initCarbonYears(){
    fetchJSON('/api/trend/years').then(years => {
      if (Array.isArray(years) && years.length) {
        yearSel5.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
        renderCarbon(years[0]);
      } else {
        const y = new Date().getFullYear();
        yearSel5.innerHTML = `<option value="${y}">${y}</option>`;
        renderCarbon(y);
      }
    }).catch(() => {
      const y = new Date().getFullYear();
      yearSel5.innerHTML = `<option value="${y}">${y}</option>`;
      renderCarbon(y);
    });
  }
  initCarbonYears();
  yearSel5?.addEventListener('change', (e)=> renderCarbon(e.target.value));

  const c6 = document.getElementById('chart6');
  const yearSel6 = document.getElementById('chart6-year');
  let __matrixData = null;
  function renderMatrix(year){
    const mOpts = JSON.parse(JSON.stringify(baseOpts));
    mOpts.parsing = true;
    mOpts.scales = {
      x: { type:'linear', title:{ display:true, text:'Normalize Verimlilik Skoru', color:'#fff', font:{ size: fontSize, weight:'400' } }, ticks:{ color:'#fff', font:{ size: fontSize, weight:'400' } }, min:0, max:1, grid:{ color:'rgba(255,255,255,0.08)' }, grace:'6%' },
      y: { type:'linear', title:{ display:true, text:'Kar / MWh (TL)', color:'#fff', font:{ size: fontSize, weight:'400' } }, ticks:{ color:'#fff', font:{ size: fontSize, weight:'400' }, callback:(v)=> fmtMoneyCompact(v) }, grid:{ color:'rgba(255,255,255,0.08)' }, grace:'12%' },
    };
    mOpts.layout = { padding: { bottom: 28 } };
    mOpts.plugins.tooltip = {
      callbacks: {
        label: (ctx) => {
          const d = ctx.raw; return [ `${d.name} • ${d.enerjiTuru}`, `Verim (norm): ${fmtNumber(d.x)}`, `Kar/MWh: ${fmtMoneyCompact(d.y)}`, `Karbon Yoğunluğu: ${fmtNumber(d.ci)} t/MWh` ];
        }
      }, displayColors:false, titleColor:'#fff', bodyColor:'#fff'
    };
    const quadrantLinesOnly = { id:'quadrantLinesOnly', afterDraw(chart){
      const q = chart.options.plugins && chart.options.plugins.quadrant; if(!q) return;
      const {ctx, chartArea, scales} = chart; const xPx = scales.x.getPixelForValue(q.xThreshold); const yPx = scales.y.getPixelForValue(q.yThreshold);
      ctx.save(); ctx.setLineDash([6,6]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xPx, chartArea.top); ctx.lineTo(xPx, chartArea.bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(chartArea.left, yPx); ctx.lineTo(chartArea.right, yPx); ctx.stroke();
      ctx.restore();
    }};
    fetchJSON(`/api/performans-matrisi?year=${year}`).then(res => {
      __matrixData = res;
      const minR = 7, maxR = 22;
      const rawPts = res.points.map(p => ({ x:Number(p.x), y:Number(p.y), r: Math.round(minR + Math.max(0,Math.min(1, Number(p.ciNorm))) * (maxR-minR)), name:p.name, enerjiTuru:p.enerjiTuru, ci:Number(p.ci) }));
      const ysAll = rawPts.map(p=>p.y); const minYAll = ysAll.length?Math.min(...ysAll):0; const maxYAll = ysAll.length?Math.max(...ysAll):1; const rngAll = Math.max(1e-9, maxYAll - minYAll);
      const pts = rawPts.map(p => ({
        x: Math.min(0.95, Math.max(0.05, p.x)),
        y: Math.min(minYAll + rngAll*0.90, Math.max(minYAll + rngAll*0.10, p.y)),
        r: p.r,
        name: p.name,
        enerjiTuru: p.enerjiTuru,
        ci: p.ci,
      }));
      const colors = res.points.map(p => colorForType(p.enerjiTuru));
      const bgColors = colors.map(c => hexToRgba(c,0.6));
      const brColors = colors;
      const ys = pts.map(p=>p.y); const minY = ys.length?Math.min(...ys):0; const maxY = ys.length?Math.max(...ys):1; const range = Math.max(1e-9, maxY - minY);
      mOpts.scales.y.suggestedMin = Math.max(0, minY - range*0.10);
      mOpts.scales.y.suggestedMax = maxY + range*0.10;
      const meanY = ys.length ? ys.reduce((a,b)=>a+b,0)/ys.length : 0;
      mOpts.plugins.quadrant = { xThreshold: 0.7, yThreshold: meanY };
      if (window.__chart6) window.__chart6.destroy();
      window.__chart6 = new Chart(c6, { type:'bubble', data:{ datasets:[{ label:`Performans Matrisi - ${res.year}`, data: pts, backgroundColor: bgColors, borderColor: brColors, borderWidth:1 }] }, options: mOpts, plugins:[quadrantLinesOnly] });
    }).catch(() => {
      if (window.__chart6) window.__chart6.destroy();
      window.__chart6 = new Chart(c6, { type:'bubble', data:{ datasets:[{ label:'Performans Matrisi', data:[] }] }, options: mOpts });
    });
  }
  function initMatrixYears(){
    fetchJSON('/api/trend/years').then(years => {
      if (Array.isArray(years) && years.length) { yearSel6.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join(''); renderMatrix(years[0]); }
      else { const y = new Date().getFullYear(); yearSel6.innerHTML = `<option value="${y}">${y}</option>`; renderMatrix(y); }
    }).catch(() => { const y = new Date().getFullYear(); yearSel6.innerHTML = `<option value="${y}">${y}</option>`; renderMatrix(y); });
  }
  initMatrixYears();
  yearSel6?.addEventListener('change', (e)=> renderMatrix(e.target.value));
  const perfModal = document.getElementById('perf-modal');
  const perfClose = document.getElementById('perf-close');
  const detailBtn = document.getElementById('chart6-detail');
  function openPerf(){
    if (!__matrixData) return;
    const overlay = document.getElementById('risk-modal');
    const riskContent = overlay?.querySelector('.modal-content:not(#perf-modal)');
    if (riskContent) riskContent.style.display = 'none';
    perfModal.style.display = 'block';
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden','false');
    setTimeout(drawPerfLarge,0);
  }
  function closePerf(){ perfModal.style.display='none'; const overlay = document.getElementById('risk-modal'); overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden','true'); if (window.__perfChart) { window.__perfChart.destroy(); window.__perfChart = null; } }
  perfClose?.addEventListener('click', closePerf);
  detailBtn?.addEventListener('click', openPerf);
  function drawPerfLarge(){
    const canvas = document.getElementById('perf-canvas');
    const mOpts = JSON.parse(JSON.stringify(baseOpts));
    mOpts.parsing = true;
    mOpts.scales = {
      x: { type:'linear', title:{ display:true, text:'Normalize Verimlilik Skoru', color:'#fff', font:{ size: fontSize+2, weight:'400' } }, ticks:{ color:'#fff', font:{ size: fontSize+2, weight:'400' } }, min:0, max:1, grid:{ color:'rgba(255,255,255,0.12)' }, grace:'3%' },
      y: { type:'linear', title:{ display:true, text:'Kar / MWh (TL)', color:'#fff', font:{ size: fontSize+2, weight:'400' } }, ticks:{ color:'#fff', font:{ size: fontSize+2, weight:'400' }, callback:(v)=> fmtMoneyCompact(v) }, grid:{ color:'rgba(255,255,255,0.12)' }, grace:'6%' },
    };
    mOpts.layout = { padding: { bottom: 28 } };
    const minR = 12, maxR = 42;
    const colors = __matrixData.points.map(p => colorForType(p.enerjiTuru));
    const bgColors = colors.map(c => hexToRgba(c,0.6));
    const brColors = colors;
    const rawPts = __matrixData.points.map(p => ({ x:Number(p.x), y:Number(p.y), r: Math.round(minR + Math.max(0,Math.min(1, Number(p.ciNorm))) * (maxR-minR)), name:p.name, enerjiTuru:p.enerjiTuru, ci:Number(p.ci) }));
    const ysAll = rawPts.map(p=>p.y); const minYAll = ysAll.length?Math.min(...ysAll):0; const maxYAll = ysAll.length?Math.max(...ysAll):1; const rngAll = Math.max(1e-9, maxYAll - minYAll);
    const pts = rawPts.map(p => ({ x: Math.min(0.95, Math.max(0.05, p.x)), y: Math.min(minYAll + rngAll*0.92, Math.max(minYAll + rngAll*0.08, p.y)), r: p.r, name:p.name, enerjiTuru:p.enerjiTuru, ci:p.ci }));
    const ys = pts.map(p=>p.y); const minY = ys.length?Math.min(...ys):0; const maxY = ys.length?Math.max(...ys):1; const range = Math.max(1e-9, maxY - minY);
    mOpts.scales.y.suggestedMin = minY - range*0.06; mOpts.scales.y.suggestedMax = maxY + range*0.06;
    const meanY = ys.length ? ys.reduce((a,b)=>a+b,0)/ys.length : 0;
    mOpts.plugins.quadrant = { xThreshold: 0.7, yThreshold: meanY };
    const quadrantPlugin = { id:'quadrantLines', afterDraw(chart){
      const q = chart.options.plugins && chart.options.plugins.quadrant; if(!q) return;
      const {ctx, chartArea, scales} = chart; const xScale = scales.x; const yScale = scales.y;
      const xPx = xScale.getPixelForValue(q.xThreshold); const yPx = yScale.getPixelForValue(q.yThreshold);
      ctx.save(); ctx.setLineDash([8,8]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(xPx, chartArea.top); ctx.lineTo(xPx, chartArea.bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(chartArea.left, yPx); ctx.lineTo(chartArea.right, yPx); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.font = `${fontSize+2}px Arial`;
      const pad = 10;
      ctx.fillText('Ekonomik Güçlü – Teknik Zayıf', chartArea.left + pad, chartArea.top + 24);
      ctx.fillText('İdeal Tesisler', chartArea.right - 140, chartArea.top + 24);
      ctx.fillText('İyileştirme Adayı', chartArea.left + pad, chartArea.bottom - 10);
      ctx.fillText('Teknik Güçlü – Ekonomik Zayıf', chartArea.right - 220, chartArea.bottom - 10);
      ctx.restore();
    }};
    if (window.__perfChart) window.__perfChart.destroy();
    window.__perfChart = new Chart(canvas, { type:'bubble', data:{ datasets:[{ label:`Performans Matrisi - ${__matrixData.year}`, data: pts, backgroundColor: bgColors, borderColor: brColors, borderWidth:1 }] }, options: mOpts, plugins:[quadrantPlugin] });
  }
}

window.addEventListener('resize', () => {
  // Basitçe grafikleri yeniden oluşturmak için sayfayı yenileyelim
  // (Chart.js grafiklerini tek tek destroy edip yeniden kurmak yerine)
  clearTimeout(window.__chartReload);
  window.__chartReload = setTimeout(() => location.reload(), 200);
});

async function openRiskModal() {
  try {
    const summary = await fetchJSON('/api/risk-ozet?enerji_turu=Doğalgaz');
    const rows = await fetchJSON('/api/riskli-tesisler');
    const tbody = document.getElementById('risk-rows');
    const header = document.getElementById('risk-summary');
    if (header) {
      header.innerHTML = `
        <div>Enerji Türü: <strong>${summary.enerjiTuru}</strong></div>
        <div>Gerçek Karbon: <strong>${fmtNumber(summary.gercekKarbonTonMwh)}</strong> t/MWh</div>
        <div>Referans Karbon: <strong>${fmtNumber(summary.referansKarbonTonMwh)}</strong> t/MWh</div>
        <div>Aşım: <strong style="color:#ff6b6b">${fmtNumber(summary.farkTonMwh)}</strong> t/MWh</div>
      `;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.tesisAdi}</td>
        <td>${r.enerjiTuru}</td>
        <td>${fmtNumber(r.karbonTonMwh)}</td>
        <td>${fmtNumber(r.referansKarbonTonMwh)}</td>
      </tr>
    `).join('');
    const perfModal = document.getElementById('perf-modal');
    if (perfModal) perfModal.style.display = 'none';
    const riskContent = document.querySelector('#risk-modal .modal-content:not(#perf-modal)');
    if (riskContent) riskContent.style.display = 'block';
    showRiskModal();
  } catch (e) {
    console.error(e);
  }
}

function showRiskModal(){
  const modal = document.getElementById('risk-modal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
}

function hideRiskModal(){
  const modal = document.getElementById('risk-modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
}

function bindEvents() {
  const riskKpi = document.getElementById('kpi-risk');
  riskKpi?.addEventListener('click', openRiskModal);
  document.getElementById('modal-close')?.addEventListener('click', hideRiskModal);
  const modal = document.getElementById('risk-modal');
  modal?.addEventListener('click', (e) => { if (e.target.id === 'risk-modal') hideRiskModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideRiskModal(); });
}

document.addEventListener('DOMContentLoaded', () => {
  loadKpis();
  initCharts();
  bindEvents();
});
