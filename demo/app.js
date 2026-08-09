import { createViewer } from '../src/molscene/viewer.js';

const stage = document.getElementById('stageFrame');
const errBox = document.getElementById('errBox');
const source = document.getElementById('source');
const molName = document.getElementById('molName');
const molDescription = document.getElementById('molDescription');
const legendEl = document.getElementById('legend');
const exampleSelect = document.getElementById('exampleSelect');
const reactionSection = document.getElementById('reactionSection');
const playReactionBtn = document.getElementById('playReactionBtn');
const reactionSlider = document.getElementById('reactionSlider');
const reactionVal = document.getElementById('reactionVal');

const viewer = createViewer(stage);

function renderLegend(entries){
  legendEl.innerHTML = '';
  entries.forEach(function(e){
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.innerHTML =
      '<span class="swatch" style="background:' + e.color + '; box-shadow:0 0 8px 1px ' + e.color + ';"></span>' +
      '<span class="legend-label">' + e.label + '</span>' +
      '<span class="legend-count">' + e.count + ' e⁻</span>';
    legendEl.appendChild(row);
  });
}

function run(){
  const text = source.value;
  const resolved = viewer.load(text);
  if (resolved.errors.length){
    errBox.style.display = 'block';
    errBox.textContent = resolved.errors.join('\n');
    legendEl.innerHTML = '';
    return;
  }
  errBox.style.display = 'none';
  molName.textContent = resolved.name || 'Editor en vivo';
  if (resolved.description){
    molDescription.textContent = resolved.description;
    molDescription.style.display = 'block';
  } else {
    molDescription.style.display = 'none';
  }
  renderLegend(viewer.getLegend());
  if (resolved.warnings && resolved.warnings.length){
    console.warn('molscene:', resolved.warnings.join(' | '));
  }

  const isReaction = viewer.isReaction();
  reactionSection.style.display = isReaction ? 'flex' : 'none';
  if (isReaction){ reactionSlider.value = '0'; reactionVal.textContent = 'reactivos'; }
}

document.getElementById('runBtn').addEventListener('click', run);

const modeCloudBtn = document.getElementById('modeCloudBtn');
const modeAtmoBtn = document.getElementById('modeAtmoBtn');
const modeBallStickBtn = document.getElementById('modeBallStickBtn');
function setMode(m){
  viewer.setMode(m);
  modeCloudBtn.classList.toggle('active', m === 'cloud');
  modeAtmoBtn.classList.toggle('active', m === 'atmosphere');
  modeBallStickBtn.classList.toggle('active', m === 'ballstick');
}
modeCloudBtn.addEventListener('click', function(){ setMode('cloud'); });
modeAtmoBtn.addEventListener('click', function(){ setMode('atmosphere'); });
modeBallStickBtn.addEventListener('click', function(){ setMode('ballstick'); });
setMode('cloud');

const playBtn = document.getElementById('playBtn');
let playing = true;
playBtn.addEventListener('click', function(){
  playing = !playing;
  viewer.setPlaying(playing);
  playBtn.textContent = playing ? 'Pausar' : 'Reproducir';
});

document.getElementById('resetBtn').addEventListener('click', function(){ viewer.resetCamera(); });

const speedSlider = document.getElementById('speedSlider');
const speedVal = document.getElementById('speedVal');
speedSlider.addEventListener('input', function(){
  const f = parseFloat(speedSlider.value);
  viewer.setSpeed(f);
  speedVal.textContent = f.toFixed(1) + '×';
});

const loneToggle = document.getElementById('loneToggle');
loneToggle.addEventListener('change', function(){
  ['lone', 'ionicLone'].forEach(function(role){ viewer.setRoleHidden(role, !loneToggle.checked); });
});

function reactionLabel(t){
  if (t <= 0) return 'reactivos';
  if (t >= 1) return 'productos';
  return t < 0.5 ? 'acercándose…' : 'productos';
}

playReactionBtn.addEventListener('click', function(){ viewer.playReaction(); });
reactionSlider.addEventListener('input', function(){
  const t = parseFloat(reactionSlider.value);
  viewer.setReactionProgress(t);
  reactionVal.textContent = reactionLabel(t);
  renderLegend(viewer.getLegend());
});

setInterval(function(){
  if (!viewer.isReaction()) return;
  const t = viewer.getReactionProgress();
  reactionSlider.value = String(t);
  reactionVal.textContent = reactionLabel(t);
  renderLegend(viewer.getLegend());
}, 150);

exampleSelect.addEventListener('change', loadExample);

async function loadExample(){
  const name = exampleSelect.value;
  const res = await fetch('../examples/' + name + '.molscene');
  source.value = await res.text();
  run();
}

loadExample();
