import * as THREE from "three";
import "./style.css";
import { GATES, amplitudeMagnitude, basisLabel, generatePuzzle, gateMapIndex, rankSolution, runCircuit, statesEqual, traceCircuit } from "./quantum.js";

const els = Object.fromEntries([
  ["canvas", "#scene"], ["level", "#level"], ["streak", "#streak"], ["par", "#par"],
  ["target", "#target-state"], ["live", "#live-state"], ["tray", "#gate-tray"], ["slots", "#slots"],
  ["moves", "#move-count"], ["pulse", "#pulse"], ["undo", "#undo"], ["reset", "#reset"],
  ["result", "#result"], ["rank", "#rank"], ["resultGates", "#result-gates"], ["resultPar", "#result-par"],
  ["resultCopy", "#result-copy"], ["next", "#next"], ["sound", "#sound-toggle"],
  ["tutorialReplay", "#tutorial-replay"], ["tutorialCoach", "#tutorial-coach"], ["tutorialStep", "#tutorial-step"],
  ["tutorialTitle", "#tutorial-title"], ["tutorialCopy", "#tutorial-copy"], ["tutorialSkip", "#tutorial-skip"],
  ["physicsStatus", "#physics-status"], ["physicsStatusText", "#physics-status-text"],
  ["routingStatus", "#routing-status"], ["shell", ".game-shell"],
].map(([key, selector]) => [key, document.querySelector(selector)]));

const previewLevel = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("sector")) : 0;
const curriculumVersion = "1";
if (!previewLevel && localStorage.getItem("quantum-loom-curriculum-version") !== curriculumVersion) {
  const previousLevel = Number(localStorage.getItem("quantum-loom-level") || 1);
  if (previousLevel > 1) localStorage.setItem("quantum-loom-pre-curriculum-level", String(previousLevel));
  localStorage.setItem("quantum-loom-level", "1");
  localStorage.setItem("quantum-loom-curriculum-version", curriculumVersion);
}
let level = Math.max(1, previewLevel || Number(localStorage.getItem("quantum-loom-level") || 1));
let streak = Number(localStorage.getItem("quantum-loom-streak") || 0);
let puzzle;
let placed = [];
let current = [];
let tutorialActive = false;
let simulation = null;
let soundOn = true;
let audioContext;
let screenShake = 0;

const INPUT_Y = 2.75;
const OUTPUT_Y = -2.15;
const phasePalette = { positive: 0x49e7ff, negative: 0xa77cff, imaginary: 0x70ff9d, negativeImaginary: 0xffcc58, zero: 0x183646 };
const gatePhysics = {
  X: { equation: "swap paired lanes", action: "BASIS LANES PERMUTED" },
  H: { equation: "split ±0.707", action: "AMPLITUDE SPLIT" },
  Z: { equation: "flip relative phase", action: "PHASE SIGN FLIPPED" },
  CX: { equation: "control=1 → flip", action: "CONDITIONAL FLIP" },
};

const renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070c, 0.055);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 0.2, 11);
scene.add(new THREE.AmbientLight(0x37506f, 1.35));
const keyLight = new THREE.PointLight(0x4aeaff, 44, 18);
keyLight.position.set(-4, 5, 6);
scene.add(keyLight);
const magentaLight = new THREE.PointLight(0xff357f, 30, 15);
magentaLight.position.set(4, -3, 5);
scene.add(magentaLight);

const loom = new THREE.Group();
const network = new THREE.Group();
const nodes = new THREE.Group();
const markers = new THREE.Group();
const pulseActors = new THREE.Group();
const bursts = new THREE.Group();
loom.add(network, nodes, markers, pulseActors, bursts);
scene.add(loom);

const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x151b26, metalness: 0.86, roughness: 0.26 });
for (const x of [-3.08, 3.08]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 6.65, 0.18), frameMaterial);
  rail.position.x = x;
  loom.add(rail);
}
for (const y of [-3.28, 3.28]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.14, 0.18), frameMaterial);
  rail.position.y = y;
  loom.add(rail);
}

const stars = new THREE.BufferGeometry();
const starPositions = new Float32Array(180 * 3);
for (let index = 0; index < starPositions.length; index += 3) {
  starPositions[index] = (Math.random() - 0.5) * 12;
  starPositions[index + 1] = (Math.random() - 0.5) * 18;
  starPositions[index + 2] = -2 - Math.random() * 6;
}
stars.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const starField = new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x34647d, size: 0.035, transparent: true, opacity: 0.72 }));
scene.add(starField);

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse?.((part) => { part.geometry?.dispose(); part.material?.dispose(); });
  }
}

function laneXs(count) {
  const width = count <= 4 ? 5.1 : count <= 8 ? 5.55 : 5.75;
  const spacing = count <= 1 ? 0 : width / (count - 1);
  return Array.from({ length: count }, (_, index) => -width / 2 + index * spacing);
}

function amplitudePhase(amplitude) {
  if (amplitudeMagnitude(amplitude) < 1e-5) return "zero";
  if (Math.abs(amplitude.im) > Math.abs(amplitude.re)) return amplitude.im >= 0 ? "imaginary" : "negativeImaginary";
  return amplitude.re >= 0 ? "positive" : "negative";
}

function phaseColor(amplitude) {
  return phasePalette[amplitudePhase(amplitude)];
}

function amplitudeText(amplitude, bits) {
  const magnitude = amplitudeMagnitude(amplitude);
  const phase = amplitudePhase(amplitude);
  const coefficient = magnitude > 0.995 ? "" : magnitude.toFixed(2).replace(/^0/, "");
  const sign = phase === "negative" ? "−" : phase === "imaginary" ? "i" : phase === "negativeImaginary" ? "−i" : "";
  return `${sign}${coefficient}|${bits}〉`;
}

function renderState(container, state) {
  const active = state.map((amplitude, index) => ({ amplitude, index })).filter(({ amplitude }) => amplitudeMagnitude(amplitude) > 1e-4);
  container.innerHTML = active.map(({ amplitude, index }) => {
    const phase = amplitudePhase(amplitude);
    return `<span class="state-chip s-${phase}"><i>${(amplitudeMagnitude(amplitude) ** 2 * 100).toFixed(0)}%</i>${amplitudeText(amplitude, basisLabel(index, puzzle.qubitCount))}</span>`;
  }).join("");
}

function makeWire(startX, startY, endX, endY, color, active = false) {
  const curve = new THREE.LineCurve3(new THREE.Vector3(startX, startY, 0), new THREE.Vector3(endX, endY, 0));
  const geometry = new THREE.TubeGeometry(curve, 8, active ? 0.025 : 0.013, 5, false);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: active ? 0.9 : 0.34, blending: THREE.AdditiveBlending });
  return new THREE.Mesh(geometry, material);
}

function gateDestinations(index, gate, qubitCount) {
  if (gate.type === "H") {
    const mask = 1 << (qubitCount - gate.qubit - 1);
    return [index, index ^ mask];
  }
  return [gateMapIndex(index, gate, qubitCount)];
}

function addGateMarker(gate, y) {
  const color = GATES[gate.type].color;
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.035, 8, 24),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3.2, metalness: 0.4, roughness: 0.15 }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(gate.type === "CX" ? 0.72 : 0.5, 0.04, 0.08), new THREE.MeshBasicMaterial({ color }));
  group.add(bar);
  group.position.set(0, y, 0.24);
  group.userData = { gate, recoil: 0, baseY: y };
  markers.add(group);
}

function rebuildLoom() {
  clearGroup(network);
  clearGroup(nodes);
  clearGroup(markers);
  const xs = laneXs(puzzle.laneCount);
  const trace = traceCircuit(puzzle.initial, placed, puzzle.qubitCount);
  const layers = Math.max(1, placed.length);

  if (!placed.length) {
    puzzle.initial.forEach((amplitude, lane) => network.add(makeWire(xs[lane], INPUT_Y, xs[lane], OUTPUT_Y, phaseColor(amplitude), amplitudeMagnitude(amplitude) > 1e-4)));
  } else {
    placed.forEach((gate, stage) => {
      const startY = THREE.MathUtils.lerp(INPUT_Y, OUTPUT_Y, stage / layers);
      const endY = THREE.MathUtils.lerp(INPUT_Y, OUTPUT_Y, (stage + 1) / layers);
      const input = trace[stage];
      const output = trace[stage + 1];
      input.forEach((amplitude, lane) => {
        const active = amplitudeMagnitude(amplitude) > 1e-4;
        for (const destination of gateDestinations(lane, gate, puzzle.qubitCount)) {
          const color = active ? phaseColor(output[destination]) : phasePalette.zero;
          network.add(makeWire(xs[lane], startY, xs[destination], endY, color, active));
        }
      });
      addGateMarker(gate, (startY + endY) / 2);
    });
  }

  puzzle.initial.forEach((amplitude, lane) => {
    const active = amplitudeMagnitude(amplitude) > 1e-4;
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(active ? 0.11 : 0.055, 16, 16),
      new THREE.MeshStandardMaterial({ color: phaseColor(amplitude), emissive: phaseColor(amplitude), emissiveIntensity: active ? 3 : 0.8 }),
    );
    node.position.set(xs[lane], INPUT_Y, 0.05);
    nodes.add(node);
  });

  current.forEach((amplitude, lane) => {
    const targetAmplitude = puzzle.target[lane];
    const targetMagnitude = amplitudeMagnitude(targetAmplitude);
    const ringColor = targetMagnitude > 1e-4 ? phaseColor(targetAmplitude) : 0x315466;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(targetMagnitude > 1e-4 ? 0.16 : 0.09, 0.035, 8, 24),
      new THREE.MeshStandardMaterial({ color: ringColor, emissive: ringColor, emissiveIntensity: targetMagnitude > 1e-4 ? 2.7 : 0.6 }),
    );
    ring.position.set(xs[lane], OUTPUT_Y, 0.1);
    nodes.add(ring);
    if (amplitudeMagnitude(amplitude) > 1e-4) {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.06 + amplitudeMagnitude(amplitude) * 0.09, 16, 16),
        new THREE.MeshStandardMaterial({ color: phaseColor(amplitude), emissive: phaseColor(amplitude), emissiveIntensity: 3.4 }),
      );
      core.position.set(xs[lane], OUTPUT_Y, 0.16);
      nodes.add(core);
    }
  });
}

function gateLabel(gate) {
  return gate.type === "CX" ? `C${gate.control}→X${gate.qubit}` : `${gate.type}${gate.qubit}`;
}

function makeGateButton(gate) {
  const def = GATES[gate.type];
  const button = document.createElement("button");
  button.className = `gate gate-${gate.type.toLowerCase()}`;
  button.draggable = true;
  button.dataset.type = gate.type;
  button.dataset.qubit = gate.qubit;
  if (gate.control !== undefined) button.dataset.control = gate.control;
  const symbol = gate.type === "CX" ? `C<sub>${gate.control}</sub>→X<sub>${gate.qubit}</sub>` : `${def.short}<sub>${gate.qubit}</sub>`;
  button.innerHTML = `<strong>${symbol}</strong><span>${def.name}</span>`;
  button.setAttribute("aria-label", gate.type === "CX" ? `Controlled flip from qubit ${gate.control} to qubit ${gate.qubit}` : `${def.name} gate on qubit ${gate.qubit}`);
  button.addEventListener("click", () => addGate({ ...gate }));
  button.addEventListener("dragstart", (event) => event.dataTransfer.setData("application/json", JSON.stringify(gate)));
  return button;
}

function renderTray() {
  els.tray.innerHTML = "";
  const banks = puzzle.availableTypes || (puzzle.includeControl ? ["X", "H", "Z", "CX"] : ["X", "H", "Z"]);
  banks.forEach((type) => {
    const gates = [];
    if (type === "CX") {
      for (let control = 0; control < puzzle.qubitCount; control += 1) {
        for (let qubit = 0; qubit < puzzle.qubitCount; qubit += 1) if (control !== qubit) gates.push({ type, control, qubit });
      }
    } else {
      for (let qubit = 0; qubit < puzzle.qubitCount; qubit += 1) gates.push({ type, qubit });
    }
    const bank = document.createElement("section");
    bank.className = `gate-bank gate-bank-${type.toLowerCase()}`;
    const label = document.createElement("div");
    label.className = "gate-bank-label";
    label.innerHTML = `<span><strong>${GATES[type].short}</strong>${GATES[type].name}</span><em>${gatePhysics[type].equation}</em>`;
    const row = document.createElement("div");
    row.className = "gate-row";
    row.style.setProperty("--qubits", gates.length);
    gates.forEach((gate) => row.appendChild(makeGateButton(gate)));
    bank.append(label, row);
    els.tray.appendChild(bank);
  });
}

function renderSlots() {
  els.slots.innerHTML = "";
  for (let index = 0; index < puzzle.maxMoves; index += 1) {
    const slot = document.createElement("button");
    slot.className = `slot ${placed[index] ? "filled" : ""}`;
    slot.innerHTML = placed[index] ? `<b>${gateLabel(placed[index])}</b><span>${index + 1}</span>` : `<b>+</b><span>${index + 1}</span>`;
    slot.setAttribute("aria-label", placed[index] ? `Remove ${gateLabel(placed[index])} from step ${index + 1}` : `Empty circuit step ${index + 1}`);
    slot.addEventListener("click", () => placed[index] && removeGate(index));
    slot.addEventListener("contextmenu", (event) => { if (placed[index]) { event.preventDefault(); removeGate(index); } });
    slot.addEventListener("dragover", (event) => event.preventDefault());
    slot.addEventListener("drop", (event) => { event.preventDefault(); try { addGate(JSON.parse(event.dataTransfer.getData("application/json")), index); } catch {} });
    els.slots.appendChild(slot);
  }
}

function updateTutorial() {
  els.tutorialCoach.hidden = !tutorialActive;
  els.tray.querySelectorAll(".gate").forEach((button) => button.classList.remove("hinted"));
  els.pulse.classList.remove("tutorial-hint");
  if (!tutorialActive) return;
  const lesson = puzzle.lesson;
  const correct = placed.every((gate, index) => {
    const expected = puzzle.solution[index];
    return expected && gate.type === expected.type && gate.qubit === expected.qubit && gate.control === expected.control;
  });
  const step = correct ? Math.min(placed.length, puzzle.solution.length) : Math.max(0, placed.length - 1);
  const ready = correct && step === puzzle.solution.length;
  els.tutorialStep.textContent = `${step + 1} / ${lesson.steps.length}`;
  els.tutorialTitle.textContent = correct ? lesson.title : "Undo the last gate";
  els.tutorialCopy.textContent = correct ? lesson.steps[step] : "That operation changes a different part of the state vector. Undo it and follow the glowing gate.";
  if (ready) {
    els.pulse.classList.add("tutorial-hint");
  } else if (correct) {
    const expected = puzzle.solution[step];
    const selector = `[data-type="${expected.type}"][data-qubit="${expected.qubit}"]${expected.control === undefined ? "" : `[data-control="${expected.control}"]`}`;
    els.tray.querySelector(selector)?.classList.add("hinted");
  }
}

function updateCircuit() {
  current = runCircuit(puzzle.initial, placed, puzzle.qubitCount);
  renderState(els.live, current);
  renderSlots();
  els.moves.textContent = `${placed.length} / ${puzzle.maxMoves}`;
  els.undo.disabled = placed.length === 0;
  els.reset.disabled = placed.length === 0;
  els.pulse.classList.toggle("ready", statesEqual(current, puzzle.target));
  rebuildLoom();
  updateTutorial();
}

function addGate(gate, index = placed.length) {
  if (placed.length >= puzzle.maxMoves) { flash(els.slots); tone(90, 0.08); return; }
  placed.splice(Math.min(index, placed.length), 0, gate);
  updateCircuit();
  tone(230 + gate.qubit * 60 + Object.keys(GATES).indexOf(gate.type) * 100, 0.055);
}

function removeGate(index) {
  placed.splice(index, 1);
  updateCircuit();
  tone(150, 0.045);
}

function spawnTransitionActors(stage) {
  clearGroup(pulseActors);
  const xs = laneXs(puzzle.laneCount);
  const trace = simulation.trace;
  const gate = placed[stage];
  const input = trace[stage] || puzzle.initial;
  const output = trace[stage + 1] || input;
  const layers = Math.max(1, placed.length);
  const startY = THREE.MathUtils.lerp(INPUT_Y, OUTPUT_Y, stage / layers);
  const endY = THREE.MathUtils.lerp(INPUT_Y, OUTPUT_Y, (stage + 1) / layers);
  input.forEach((amplitude, lane) => {
    if (amplitudeMagnitude(amplitude) < 1e-4) return;
    const destinations = gate ? gateDestinations(lane, gate, puzzle.qubitCount) : [lane];
    destinations.forEach((destination) => {
      const magnitude = gate?.type === "H" ? amplitudeMagnitude(amplitude) * Math.SQRT1_2 : amplitudeMagnitude(amplitude);
      const color = phaseColor(output[destination]);
      const actor = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.07 + magnitude * 0.1, 2),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 4.5, roughness: 0.08 }),
      );
      actor.position.set(xs[lane], startY, 0.5);
      actor.userData = { startX: xs[lane], endX: xs[destination], startY, endY };
      pulseActors.add(actor);
    });
  });
}

function setControlsLocked(locked) {
  els.pulse.disabled = locked;
  els.undo.disabled = locked || placed.length === 0;
  els.reset.disabled = locked || placed.length === 0;
  els.tray.querySelectorAll("button").forEach((button) => { button.disabled = locked; });
  els.slots.querySelectorAll("button").forEach((button) => { button.disabled = locked; });
  els.shell.classList.toggle("simulating", locked);
}

function pulseCircuit() {
  if (simulation) return;
  simulation = {
    startedAt: clock.getElapsedTime(),
    duration: Math.max(1.5, Math.max(1, placed.length) * 0.55),
    trace: traceCircuit(puzzle.initial, placed, puzzle.qubitCount),
    stage: -1,
    success: statesEqual(current, puzzle.target),
    finished: false,
  };
  els.physicsStatus.hidden = false;
  els.physicsStatus.className = "physics-status active";
  els.physicsStatusText.textContent = "STATE VECTOR RELEASED";
  els.pulse.textContent = "LOOM RUNNING";
  setControlsLocked(true);
  tone(150, 0.18);
}

function emitBurst(position, color, count = 20) {
  for (let index = 0; index < count; index += 1) {
    const particle = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    particle.position.copy(position);
    particle.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5));
    particle.userData.life = 1;
    bursts.add(particle);
  }
}

function finishSimulation() {
  if (!simulation || simulation.finished) return;
  simulation.finished = true;
  renderState(els.live, current);
  if (simulation.success) {
    els.physicsStatus.className = "physics-status active success";
    els.physicsStatusText.textContent = "STATE VECTOR ALIGNED";
    pulseActors.children.forEach((actor) => emitBurst(actor.position, actor.material.color.getHex(), 18));
    screenShake = 0.8;
    tone(330, 0.12); setTimeout(() => tone(495, 0.16), 110); setTimeout(() => tone(742, 0.22), 230);
    setTimeout(() => { simulation = null; els.physicsStatus.hidden = true; showResult(); }, 700);
  } else {
    els.physicsStatus.className = "physics-status active failure";
    els.physicsStatusText.textContent = "OUTPUT DOES NOT MATCH";
    screenShake = 0.6; tone(82, 0.3); flash(els.live);
    setTimeout(() => {
      simulation = null; clearGroup(pulseActors); els.physicsStatus.hidden = true;
      els.pulse.textContent = "PULSE CIRCUIT"; setControlsLocked(false);
    }, 900);
  }
}

function animateSimulation(time) {
  if (!simulation || simulation.finished) return;
  const progress = Math.min(1, (time - simulation.startedAt) / simulation.duration);
  const layers = Math.max(1, placed.length);
  const scaled = Math.min(layers - 1e-6, progress * layers);
  const stage = Math.floor(scaled);
  const local = scaled - stage;
  if (stage !== simulation.stage) {
    simulation.stage = stage;
    spawnTransitionActors(stage);
    const state = simulation.trace[Math.min(stage, simulation.trace.length - 1)];
    renderState(els.live, state);
    if (placed[stage]) els.physicsStatusText.textContent = `${gatePhysics[placed[stage].type].action} · ${gateLabel(placed[stage])}`;
  }
  const eased = local * local * (3 - 2 * local);
  pulseActors.children.forEach((actor) => {
    actor.position.x = THREE.MathUtils.lerp(actor.userData.startX, actor.userData.endX, eased);
    actor.position.y = THREE.MathUtils.lerp(actor.userData.startY, actor.userData.endY, eased);
    actor.rotation.x += 0.1; actor.rotation.y += 0.14;
  });
  if (progress >= 1) finishSimulation();
}

function showResult() {
  const rank = rankSolution(placed.length, puzzle.par);
  streak += 1;
  localStorage.setItem("quantum-loom-streak", String(streak));
  els.streak.textContent = streak;
  els.rank.textContent = rank;
  els.resultGates.textContent = placed.length;
  els.resultPar.textContent = puzzle.par;
  if (tutorialActive) {
    localStorage.setItem(`quantum-loom-lesson-${level}`, "complete");
    tutorialActive = false;
    els.resultCopy.textContent = puzzle.lesson ? `${puzzle.lesson.title} complete. The next sector introduces one more idea.` : "Training complete.";
  } else {
    els.resultCopy.textContent = rank === "S" ? "Optimal state-vector alignment." : rank === "A" ? "Stable circuit. One step from par." : "Aligned, but the algorithm can be shorter.";
  }
  els.result.hidden = false;
  requestAnimationFrame(() => els.result.classList.add("visible"));
}

function startLevel(forceTutorial = false) {
  simulation = null;
  clearGroup(pulseActors); clearGroup(bursts);
  els.physicsStatus.hidden = true;
  els.pulse.textContent = "PULSE CIRCUIT";
  setControlsLocked(false);
  puzzle = generatePuzzle(level);
  tutorialActive = Boolean(puzzle.isLesson && (forceTutorial || localStorage.getItem(`quantum-loom-lesson-${level}`) !== "skipped"));
  placed = [];
  current = puzzle.initial.map((amplitude) => ({ ...amplitude }));
  els.level.textContent = String(level).padStart(2, "0");
  els.streak.textContent = streak;
  els.par.textContent = puzzle.par;
  els.routingStatus.textContent = `${puzzle.qubitCount} QUBIT${puzzle.qubitCount > 1 ? "S" : ""} · ${puzzle.laneCount} BASIS LANES`;
  renderState(els.target, puzzle.target);
  renderTray(); updateCircuit();
  els.result.classList.remove("visible"); els.result.hidden = true;
}

function flash(element) { element.classList.remove("flash"); void element.offsetWidth; element.classList.add("flash"); }
function tone(frequency, duration) {
  if (!soundOn) return;
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.04, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
}

els.pulse.addEventListener("click", pulseCircuit);
els.undo.addEventListener("click", () => placed.length && removeGate(placed.length - 1));
els.reset.addEventListener("click", () => { placed = []; updateCircuit(); tone(120, 0.06); });
els.next.addEventListener("click", () => { level += 1; localStorage.setItem("quantum-loom-level", String(level)); startLevel(); });
els.tutorialReplay.addEventListener("click", () => { els.result.classList.remove("visible"); els.result.hidden = true; startLevel(true); });
els.tutorialSkip.addEventListener("click", () => { tutorialActive = false; localStorage.setItem(`quantum-loom-lesson-${level}`, "skipped"); updateTutorial(); });
els.sound.addEventListener("click", () => { soundOn = !soundOn; els.sound.textContent = soundOn ? "◉" : "○"; });

function resize() {
  const rect = els.canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(els.canvas);

const clock = new THREE.Clock();
function animate() {
  const time = clock.getElapsedTime();
  animateSimulation(time);
  loom.rotation.y = Math.sin(time * 0.3) * 0.025 + (Math.random() - 0.5) * screenShake * 0.02;
  loom.position.x = (Math.random() - 0.5) * screenShake * 0.06;
  screenShake *= 0.91;
  nodes.children.forEach((node, index) => node.scale.setScalar(1 + Math.sin(time * 2.8 + index) * 0.04));
  markers.children.forEach((marker, index) => { marker.rotation.z = Math.sin(time * 1.8 + index) * 0.08; });
  bursts.children.slice().forEach((particle) => {
    particle.userData.life -= 0.03; particle.position.addScaledVector(particle.userData.velocity, 0.025);
    particle.material.opacity = Math.max(0, particle.userData.life);
    if (particle.userData.life <= 0) { bursts.remove(particle); particle.geometry.dispose(); particle.material.dispose(); }
  });
  starField.rotation.z = time * 0.008;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

startLevel(); resize(); animate();
