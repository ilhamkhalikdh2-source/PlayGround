import { Game, TURN_TIME, WORLD } from './game.js';
import { Renderer } from './render.js';
import { AudioEngine } from './audio.js';
import { clamp } from './logic.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const canvas = $('#game');
const hud = $('#hud');
const startScreen = $('#startScreen');
const endScreen = $('#endScreen');
const audio = new AudioEngine();

let toastTimeout = 0;
let gameoverTimeout = 0;
let hudClock = 0;
const memberRefs = [];

let game;
game = new Game({ audio, onEvent: handleEvent });
const renderer = new Renderer(canvas, game);

const els = {
  turnLabel: $('#turnLabel'),
  turnNumber: $('#turnNumber'),
  phaseTag: $('#phaseTag'),
  timer: $('#timer'),
  timerFill: $('#timerFill'),
  windArrow: $('#windArrow'),
  windValue: $('#windValue'),
  windTrack: $('#windTrack'),
  playerMembers: $('#playerMembers'),
  enemyMembers: $('#enemyMembers'),
  playerAlive: $('#playerAlive'),
  enemyAlive: $('#enemyAlive'),
  activeName: $('#activeName'),
  activeHealth: $('#activeHealth'),
  activeHealthBar: $('#activeHealthBar'),
  activeAvatar: $('#activeAvatar'),
  matWood: $('#matWood'),
  matBrick: $('#matBrick'),
  matMetal: $('#matMetal'),
  materials: $('#materials'),
  buildBar: $('#buildBar'),
  weaponBar: $('#weaponBar'),
  buildCount: $('#buildCount'),
  buildPips: $('#buildPips'),
  ammoGrenade: $('#ammoGrenade'),
  ammoCluster: $('#ammoCluster'),
  btnEnd: $('#btnEnd'),
  btnMute: $('#btnMute'),
  hint: $('#hint'),
  toast: $('#toast'),
  toastText: $('#toastText'),
  touchFire: $('#touchFire'),
  touchControls: $('#touchControls'),
  rotateHint: $('#rotateHint'),
  endEyebrow: $('#endEyebrow'),
  endTitle: $('#endTitle'),
  endSub: $('#endSub'),
  endStats: $('#endStats'),
};

const COSTS = { wall: 20, floor: 15, ramp: 25 };
for (const btn of $$('.build-btn')) {
  const type = btn.dataset.build;
  const small = btn.querySelector('.loadout-copy small');
  if (small) small.textContent = COSTS[type];
}

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const materialsDock = $('#materialsDock');
const operatorCard = $('.operator-card');
let materialsDetached = false;

function layoutMaterials() {
  const compact = window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
  if (compact === materialsDetached) return;
  materialsDetached = compact;
  if (compact) {
    materialsDock.appendChild(els.materials);
    materialsDock.classList.remove('hidden');
  } else {
    operatorCard.appendChild(els.materials);
    materialsDock.classList.add('hidden');
  }
}

function handleEvent(event) {
  if (!game) return;
  switch (event.type) {
    case 'toast':
      showToast(event.text, event.bad);
      break;
    case 'teams':
      buildTeams();
      updateHud();
      break;
    case 'refresh':
      updateHud();
      break;
    case 'turn':
      updateHud();
      break;
    case 'gameover':
      showGameOver(event.winner);
      break;
    default:
      break;
  }
}

function showToast(text, bad = false) {
  if (!text) return;
  els.toastText.textContent = text;
  els.toast.classList.toggle('bad', bad);
  els.toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => els.toast.classList.remove('show'), 2100);
}

function memberHTML(worm) {
  return `<div class="member" data-team="${worm.team}" data-index="${worm.index}">
    <span class="member-name">${worm.name}</span>
    <div class="member-hp"><i></i></div>
  </div>`;
}

function buildTeams() {
  memberRefs.length = 0;
  els.playerMembers.innerHTML = game.worms.filter((w) => w.team === 0).map(memberHTML).join('');
  els.enemyMembers.innerHTML = game.worms.filter((w) => w.team === 1).map(memberHTML).join('');
  for (const el of $$('.member')) {
    const worm = game.worms.find((w) => w.team === Number(el.dataset.team) && w.index === Number(el.dataset.index));
    if (worm) memberRefs.push({ el, worm, hp: el.querySelector('.member-hp i') });
  }
}

function updateHud() {
  if (!game || game.phase === 'menu') return;
  const worm = game.currentWorm;
  const isPlayer = game.phase === 'player';
  const locked = !isPlayer;
  hud.classList.toggle('enemy-turn', locked);

  let label = 'YOUR TURN';
  let phase = 'PLAYER PHASE';
  let cls = 'player';
  if (game.isOver) {
    label = game.isWinner ? 'VICTORY ROYALE' : 'STORMED OUT';
    phase = 'MATCH OVER';
    cls = game.isWinner ? 'player' : 'enemy';
  } else if (game.phase === 'ai') {
    label = 'STORM TURN';
    phase = 'ENEMY PHASE';
    cls = 'enemy';
  } else if (game.phase === 'firing' || game.phase === 'resolving') {
    label = 'BOMBS AWAY';
    phase = 'RESOLVING';
    cls = 'enemy';
  } else if (game.phase === 'switching') {
    label = 'SWITCHING';
    phase = 'NEXT WORM';
    cls = 'enemy';
  }
  els.turnLabel.textContent = label;
  els.turnLabel.className = `turn-label ${cls}`;
  els.phaseTag.textContent = phase;
  els.turnNumber.textContent = `ROUND ${String(Math.min(99, game.turn)).padStart(2, '0')}`;

  if (isPlayer && !game.isOver) {
    const secs = Math.max(0, Math.ceil(game.timer));
    els.timer.textContent = secs;
    els.timerFill.style.width = `${clamp(game.timer / TURN_TIME, 0, 1) * 100}%`;
    els.timerFill.classList.toggle('danger', game.timer <= 10);
  } else {
    els.timer.textContent = game.isOver ? '--' : '--';
    els.timerFill.style.width = game.isOver ? '0%' : '100%';
    els.timerFill.classList.toggle('danger', false);
  }

  const windAbs = Math.abs(game.wind);
  els.windValue.textContent = windAbs;
  els.windArrow.style.transform = `rotate(${game.wind < 0 ? 180 : 0}deg)`;
  const windPct = clamp(windAbs / 70, 0, 1);
  const trackFill = els.windTrack.firstElementChild;
  if (trackFill) {
    trackFill.style.width = `${20 + windPct * 80}%`;
    trackFill.style.marginLeft = game.wind < 0 ? `${80 - windPct * 80}%` : '20%';
    trackFill.style.transform = game.wind < 0 ? 'scaleX(-1)' : 'scaleX(1)';
    trackFill.style.background = `linear-gradient(90deg, transparent, ${game.wind < 0 ? '#ff9c9f' : '#58eeff'})`;
  }

  els.playerAlive.textContent = `${game.aliveCount(0)} ALIVE`;
  els.enemyAlive.textContent = `${game.aliveCount(1)} ALIVE`;
  for (const ref of memberRefs) {
    const hp = clamp(ref.worm.health / ref.worm.maxHealth, 0, 1);
    ref.hp.style.width = `${hp * 100}%`;
    ref.el.classList.toggle('dead', ref.worm.dead);
    ref.el.classList.toggle('active', ref.worm === worm && !game.isOver);
    ref.el.classList.toggle('low', hp <= 0.32);
  }

  if (!worm) return;
  els.activeName.textContent = worm.name;
  els.activeHealth.textContent = Math.ceil(worm.health);
  els.activeHealthBar.style.width = `${clamp(worm.health / worm.maxHealth, 0, 1) * 100}%`;
  els.activeAvatar.style.filter = worm.team === 0 ? 'none' : 'hue-rotate(155deg) saturate(1.4)';

  const mats = game.materials[worm.team];
  els.matWood.textContent = mats.wood;
  els.matBrick.textContent = mats.brick;
  els.matMetal.textContent = mats.metal;
  for (const el of $$('.mat')) {
    el.classList.toggle('active', el.dataset.material === game.material);
    el.classList.toggle('locked', locked);
  }

  els.buildCount.textContent = `${game.buildsLeft} BUILDS`;
  const pips = els.buildPips.children;
  for (let i = 0; i < pips.length; i += 1) pips[i].classList.toggle('on', i < game.buildsLeft);

  for (const btn of $$('.build-btn')) {
    const active = game.buildMode && btn.dataset.build === game.selectedBuild && isPlayer;
    btn.classList.toggle('active', active);
    btn.classList.toggle('locked', locked);
  }
  for (const btn of $$('.weapon-btn')) {
    const active = !game.buildMode && btn.dataset.weapon === game.currentWeapon && isPlayer;
    btn.classList.toggle('active', active);
    btn.classList.toggle('locked', locked);
  }
  els.btnEnd.disabled = !isPlayer || game.isOver;

  const teamAmmo = game.ammo[game.currentTeam] || game.ammo[0];
  els.ammoGrenade.textContent = teamAmmo.grenade;
  els.ammoCluster.textContent = teamAmmo.cluster;

  if (game.buildMode) {
    els.hint.textContent = `CLICK TO PLACE ${game.selectedBuild.toUpperCase()} · 1-3 SWITCH · Z/X/C MATERIAL · B STOW`;
  } else if (game.currentWeapon === 'pickaxe') {
    els.hint.textContent = 'CLICK NEARBY TERRAIN OR BUILDS TO HARVEST · Q/E/R WEAPONS · 1-3 BUILD';
  } else if (game.charging) {
    els.hint.textContent = 'RELEASE TO FIRE · WIND PUSHES THE ARC · A/D MOVE · W JUMP';
  } else if (isPlayer) {
    els.hint.textContent = 'A/D MOVE · W JUMP · HOLD CLICK TO CHARGE · 1-3 BUILD · SPACE END TURN';
  } else if (game.phase === 'ai') {
    els.hint.textContent = 'STORM SQUAD IS AIMING · WATCH THE ARC';
  } else {
    els.hint.textContent = '';
  }

  if (game.buildMode) {
    els.touchFire.querySelector('span').textContent = 'PLACE';
  } else if (game.currentWeapon === 'pickaxe') {
    els.touchFire.querySelector('span').textContent = 'MINE';
  } else {
    els.touchFire.querySelector('span').textContent = 'FIRE';
  }
  els.touchFire.style.opacity = locked ? '0.55' : '1';
}

function showGameOver(winner) {
  clearTimeout(gameoverTimeout);
  gameoverTimeout = setTimeout(() => {
    const win = winner === 0;
    endScreen.classList.remove('hidden', 'lose');
    endScreen.classList.toggle('lose', !win);
    els.endEyebrow.textContent = win ? 'MATCH COMPLETE · LAST SQUAD STANDING' : 'MATCH COMPLETE · THE STORM WON';
    els.endTitle.textContent = win ? 'VICTORY ROYALE' : 'STORMED OUT';
    els.endSub.textContent = win ? 'The island belongs to your squad. Build high, shoot low.' : 'Your squad got out-built and out-gunned. Run it back.';
    const stats = game.stats;
    els.endStats.innerHTML = `
      <div class="stat-chip"><b>${stats.turns}</b><span>TURNS</span></div>
      <div class="stat-chip"><b>${stats.shots[0]}</b><span>SHOTS FIRED</span></div>
      <div class="stat-chip"><b>${Math.round(stats.damage[0])}</b><span>DAMAGE DEALT</span></div>
      <div class="stat-chip"><b>${stats.builds[0]}</b><span>BUILDS PLACED</span></div>
    `;
    audio.play(win ? 'victory' : 'defeat');
  }, 1900);
}

function startMatch() {
  audio.init();
  audio.play('ui');
  startScreen.classList.add('leaving');
  $('#hud').classList.remove('hidden');
  endScreen.classList.add('hidden');
  clearTimeout(gameoverTimeout);
  game.start();
  audio.play('deploy');
  updateHud();
}

function rematch() {
  audio.init();
  endScreen.classList.add('hidden');
  game.newMatch((Date.now() ^ 0x5f3759df) & 0x7fffffff, false);
  game.start();
  audio.play('deploy');
  updateHud();
}

function toggleMute() {
  audio.init();
  const muted = audio.toggleMute();
  els.btnMute.classList.toggle('muted', muted);
  const toggle = $('#soundToggle');
  toggle.classList.toggle('on', !muted);
  toggle.lastChild.textContent = muted ? ' SOUND OFF' : ' SOUND ON';
  showToast(muted ? 'SOUND OFF' : 'SOUND ON');
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function worldPoint(event) {
  return renderer.screenToWorld(event.clientX, event.clientY);
}

canvas.addEventListener('pointermove', (event) => {
  const p = worldPoint(event);
  game.setPointer(p.x, p.y, true);
}, { passive: true });

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== undefined && event.button !== 0) return;
  audio.init();
  const p = worldPoint(event);
  game.setPointer(p.x, p.y, true);
  game.pointerDown();
  canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

function pointerRelease(event) {
  game.pointerUp();
  if (event && canvas.hasPointerCapture?.(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

canvas.addEventListener('pointerup', pointerRelease);
canvas.addEventListener('pointercancel', pointerRelease);
canvas.addEventListener('pointerleave', () => { game.mouse.active = false; });
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

const keyState = { left: false, right: false };

function setMove(key, value) {
  if (key === 'left') {
    keyState.left = value;
    game.keys.left = value;
  } else if (key === 'right') {
    keyState.right = value;
    game.keys.right = value;
  }
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'tab'].includes(key)) event.preventDefault();
  if (!startScreen.classList.contains('leaving') && !startScreen.classList.contains('hidden')) {
    if (key === 'enter' || key === ' ') startMatch();
    return;
  }
  if (!endScreen.classList.contains('hidden')) {
    if (key === 'enter' || key === ' ') rematch();
    return;
  }
  audio.init();
  if (key === 'a' || key === 'arrowleft') setMove('left', true);
  if (key === 'd' || key === 'arrowright') setMove('right', true);
  if (key === 'w' || key === 'arrowup') game.keys.jump = true;
  if (key === ' ') game.endTurn(true);
  if (key === '1') game.toggleBuild('wall');
  if (key === '2') game.toggleBuild('floor');
  if (key === '3') game.toggleBuild('ramp');
  if (key === 'b') game.toggleBuild();
  if (key === 'q') game.setWeapon('bazooka');
  if (key === 'e') game.setWeapon('grenade');
  if (key === 'r') game.setWeapon('cluster');
  if (key === '4') game.setWeapon('pickaxe');
  if (key === 'z') game.setMaterial('wood');
  if (key === 'x') game.setMaterial('brick');
  if (key === 'c') game.setMaterial('metal');
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'a' || key === 'arrowleft') setMove('left', false);
  if (key === 'd' || key === 'arrowright') setMove('right', false);
});

window.addEventListener('blur', () => {
  setMove('left', false);
  setMove('right', false);
  game.keys.jump = false;
});

for (const button of $$('[data-touch]')) {
  const action = button.dataset.touch;
  const press = (event) => {
    event.preventDefault();
    audio.init();
    if (action === 'jump') game.keys.jump = true;
    else setMove(action, true);
    button.classList.add('active');
  };
  const release = (event) => {
    event.preventDefault();
    if (action === 'jump') game.keys.jump = false;
    else setMove(action, false);
    button.classList.remove('active');
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
}

const touchFire = els.touchFire;
touchFire.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  audio.init();
  if (game.buildMode) {
    game.placeBuild();
  } else if (game.currentWeapon === 'pickaxe') {
    game.harvest(game.mouse.x, game.mouse.y);
  } else {
    game.beginCharge();
    touchFire.classList.add('charging');
  }
});
touchFire.addEventListener('pointerup', (event) => {
  event.preventDefault();
  event.stopPropagation();
  game.releaseCharge();
  touchFire.classList.remove('charging');
});
touchFire.addEventListener('pointercancel', () => {
  game.releaseCharge();
  touchFire.classList.remove('charging');
});

// UI buttons
$('#btnDeploy').addEventListener('click', startMatch);
$('#btnRematch').addEventListener('click', rematch);
$('#soundToggle').addEventListener('click', toggleMute);
els.btnMute.addEventListener('click', toggleMute);
els.btnEnd.addEventListener('click', () => game.endTurn(true));

for (const btn of $$('.build-btn')) {
  btn.addEventListener('click', () => {
    audio.init();
    game.toggleBuild(btn.dataset.build);
  });
}
for (const btn of $$('.weapon-btn')) {
  btn.addEventListener('click', () => {
    audio.init();
    game.setWeapon(btn.dataset.weapon);
  });
}
for (const btn of $$('.mat')) {
  btn.addEventListener('click', () => {
    audio.init();
    game.setMaterial(btn.dataset.material);
  });
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

function updateRotateHint() {
  const portrait = window.innerHeight > window.innerWidth;
  els.rotateHint.classList.toggle('hidden', !(isTouch && portrait));
  layoutMaterials();
}

window.addEventListener('resize', updateRotateHint);
window.addEventListener('orientationchange', updateRotateHint);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    setMove('left', false);
    setMove('right', false);
  }
});

let lastTime = performance.now();
let menuTime = 0;

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.0005, (now - lastTime) / 1000));
  lastTime = now;
  try {
    game.update(dt);
    renderer.draw(game, dt);
  } catch (error) {
    console.error('frame error', error);
  }

  // In the menu, let the camera breathe behind the overlay.
  if (game.phase === 'menu') {
    menuTime += dt;
    if (menuTime > 2.4) {
      menuTime = 0;
      game.mouse.active = false;
    }
  }

  hudClock += dt;
  if (hudClock > 0.06) {
    hudClock = 0;
    updateHud();
  }

  requestAnimationFrame(frame);
}

buildTeams();
updateRotateHint();
requestAnimationFrame(frame);

// Expose a tiny debug handle for browser verification and console tinkering.
window.__fortworm = { game, renderer, audio };
