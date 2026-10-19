import * as THREE from "three";
import "./style.css";
import { GATES, generatePuzzle, rankSolution, runCircuit, statesEqual, tutorialPuzzle } from "./quantum.js";

const els = {
  canvas: document.querySelector("#scene"),
  level: document.querySelector("#level"),
  streak: document.querySelector("#streak"),
  par: document.querySelector("#par"),
  target: document.querySelector("#target-state"),
  live: document.querySelector("#live-state"),
  tray: document.querySelector("#gate-tray"),
  slots: document.querySelector("#slots"),
  moves: document.querySelector("#move-count"),
  pulse: document.querySelector("#pulse"),
  undo: document.querySelector("#undo"),
  reset: document.querySelector("#reset"),
  result: document.querySelector("#result"),
  rank: document.querySelector("#rank"),
  resultGates: document.querySelector("#result-gates"),
  resultPar: document.querySelector("#result-par"),
  resultCopy: document.querySelector("#result-copy"),
  next: document.querySelector("#next"),
  sound: document.querySelector("#sound-toggle"),
  tutorialReplay: document.querySelector("#tutorial-replay"),
  tutorialCoach: document.querySelector("#tutorial-coach"),
  tutorialStep: document.querySelector("#tutorial-step"),
  tutorialTitle: document.querySelector("#tutorial-title"),
  tutorialCopy: document.querySelector("#tutorial-copy"),
  tutorialSkip: document.querySelector("#tutorial-skip"),
};

let level = 1;
let streak = Number(localStorage.getItem("quantum-loom-streak") || 0);
let puzzle;
let placed = [];
let current = [];
let soundOn = true;
let audioContext;
let tutorialActive = false;

const tutorialPrompts = [
  {
    title: "Flip the first strand",
    copy: "LIVE q0 is |1〉, but we need to approach |+〉. Tap X₀ to flip q0 into |0〉.",
  },
  {
    title: "Split the first strand",
    copy: "Good. Now tap H₀. The H gate splits q0 from |0〉 into the target |+〉 state.",
  },
  {
    title: "Fix the second strand",
    copy: "q0 now matches. Tap X₁ to flip q1 from |0〉 to the target |1〉.",
  },
  {
    title: "Stabilize the signature",
    copy: "Both LIVE states match the TARGET. Press PULSE CIRCUIT to lock the branch.",
  },
];

const renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070c, 0.055);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 0.2, 11);

scene.add(new THREE.AmbientLight(0x37506f, 1.4));
const keyLight = new THREE.PointLight(0x4aeaff, 45, 18);
keyLight.position.set(-4, 5, 6);
scene.add(keyLight);
const magentaLight = new THREE.PointLight(0xff357f, 32, 15);
magentaLight.position.set(4, -3, 5);
scene.add(magentaLight);

const loom = new THREE.Group();
scene.add(loom);
const strands = new THREE.Group();
const nodes = new THREE.Group();
const particles = new THREE.Group();
loom.add(strands, nodes, particles);

const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x151b26, metalness: 0.86, roughness: 0.26 });
const railGeometry = new THREE.BoxGeometry(0.16, 6.8, 0.18);
for (const x of [-3.05, 3.05]) {
  const rail = new THREE.Mesh(railGeometry, frameMaterial);
  rail.position.x = x;
  loom.add(rail);
}
for (const y of [-3.35, 3.35]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(6.25, 0.16, 0.18), frameMaterial);
  rail.position.y = y;
  loom.add(rail);
}

const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(180 * 3);
for (let i = 0; i < starPositions.length; i += 3) {
  starPositions[i] = (Math.random() - 0.5) * 12;
  starPositions[i + 1] = (Math.random() - 0.5) * 18;
  starPositions[i + 2] = -2 - Math.random() * 6;
}
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const starField = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0x34647d, size: 0.035, transparent: true, opacity: 0.72 }));
scene.add(starField);

function stateColor(value) {
  return { "0": 0x49e7ff, "1": 0xff4f94, "+": 0xffcc58, "-": 0xa77cff }[value];
}

function stateLabel(value) {
  return { "0": "|0〉", "1": "|1〉", "+": "|+〉", "-": "|−〉" }[value];
}

function renderState(container, state) {
  container.innerHTML = state
    .map((value, index) => {
      const stateClass = { "0": "zero", "1": "one", "+": "plus", "-": "minus" }[value];
      return `<span class="state-chip s-${stateClass}"><i>q${index}</i>${stateLabel(value)}</span>`;
    })
    .join("");
}

function makeCurve(start, end, bend, color) {
  const curve = new THREE.CubicBezierCurve3(
    start,
    new THREE.Vector3(start.x + bend, start.y - 1.2, 0.2),
    new THREE.Vector3(end.x - bend, end.y + 1.2, 0.2),
    end,
  );
  const geometry = new THREE.TubeGeometry(curve, 42, 0.025, 6, false);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending });
  return new THREE.Mesh(geometry, material);
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.geometry?.dispose();
    child.material?.dispose();
  }
}

function rebuildLoom() {
  clearGroup(strands);
  clearGroup(nodes);
  clearGroup(particles);
  const count = current.length;
  const xs = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * 1.85);

  current.forEach((value, index) => {
    const color = stateColor(value);
    const start = new THREE.Vector3(xs[index], 2.85, 0);
    const targetIndex = placed.reduce((acc, gate) => gate.qubit === index && gate.type === "X" ? count - 1 - acc : acc, index);
    const endX = xs[Math.max(0, Math.min(count - 1, targetIndex))];
    strands.add(makeCurve(start, new THREE.Vector3(endX, -2.85, 0), value === "+" ? 1.1 : value === "-" ? -1.1 : 0.28 * (index % 2 ? 1 : -1), color));

    for (const y of [2.9, -2.9]) {
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.8, roughness: 0.25 });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 20), material);
      sphere.position.set(y > 0 ? xs[index] : endX, y, 0.05);
      nodes.add(sphere);
    }

    for (let p = 0; p < 7; p += 1) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.026 + Math.random() * 0.018, 8, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }),
      );
      dot.position.set(xs[index] + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 5.7, -0.2);
      dot.userData.speed = 0.002 + Math.random() * 0.004;
      particles.add(dot);
    }
  });
}

function makeGateButton(type, qubit) {
  const def = GATES[type];
  const button = document.createElement("button");
  button.className = `gate gate-${type.toLowerCase()}`;
  button.draggable = true;
  button.dataset.type = type;
  button.dataset.qubit = qubit;
  button.innerHTML = `<strong>${def.short}<sub>${qubit}</sub></strong><span>${def.name}</span>`;
  button.setAttribute("aria-label", `${def.name} gate on qubit ${qubit}`);
  button.addEventListener("click", () => addGate({ type, qubit }));
  button.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("application/json", JSON.stringify({ type, qubit }));
  });
  return button;
}

function renderTray() {
  els.tray.innerHTML = "";
  Object.keys(GATES).forEach((type) => {
    for (let q = 0; q < puzzle.qubitCount; q += 1) els.tray.appendChild(makeGateButton(type, q));
  });
}

function tutorialPrefixIsCorrect() {
  return placed.every((gate, index) => {
    const expected = puzzle.solution[index];
    return expected && gate.type === expected.type && gate.qubit === expected.qubit;
  });
}

function updateTutorial() {
  els.tutorialCoach.hidden = !tutorialActive;
  els.tray.querySelectorAll(".gate").forEach((gate) => gate.classList.remove("hinted"));
  els.pulse.classList.remove("tutorial-hint");
  if (!tutorialActive) return;

  const correct = tutorialPrefixIsCorrect();
  const step = correct ? Math.min(placed.length, 3) : Math.min(placed.length, 2);
  const prompt = tutorialPrompts[step];
  els.tutorialStep.textContent = `${step + 1} / 4`;
  els.tutorialTitle.textContent = correct ? prompt.title : "Undo the last gate";
  els.tutorialCopy.textContent = correct
    ? prompt.copy
    : "That gate changes a different state. Tap the last filled slot or press UNDO, then follow the glowing gate.";
  els.tutorialCoach.classList.toggle("coach-error", !correct);

  if (correct && step < 3) {
    const expected = puzzle.solution[step];
    els.tray
      .querySelector(`[data-type="${expected.type}"][data-qubit="${expected.qubit}"]`)
      ?.classList.add("hinted");
  } else if (correct) {
    els.pulse.classList.add("tutorial-hint");
  }
}

function renderSlots() {
  els.slots.innerHTML = "";
  for (let i = 0; i < puzzle.maxMoves; i += 1) {
    const slot = document.createElement("button");
    slot.className = `slot ${placed[i] ? "filled" : ""}`;
    slot.dataset.index = i;
    slot.innerHTML = placed[i]
      ? `<b>${placed[i].type}<sub>${placed[i].qubit}</sub></b><span>${i + 1}</span>`
      : `<b>+</b><span>${i + 1}</span>`;
    slot.setAttribute("aria-label", placed[i] ? `Remove ${placed[i].type} gate from slot ${i + 1}` : `Empty gate slot ${i + 1}`);
    slot.addEventListener("click", () => placed[i] && removeGate(i));
    slot.addEventListener("dragover", (event) => event.preventDefault());
    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      try {
        addGate(JSON.parse(event.dataTransfer.getData("application/json")), i);
      } catch {}
    });
    els.slots.appendChild(slot);
  }
}

function updateCircuit() {
  current = runCircuit(puzzle.initial, placed);
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
  if (placed.length >= puzzle.maxMoves) {
    flash(els.slots);
    tone(90, 0.08);
    return;
  }
  placed.splice(Math.min(index, placed.length), 0, gate);
  updateCircuit();
  tone(220 + gate.qubit * 70 + Object.keys(GATES).indexOf(gate.type) * 110, 0.055);
}

function removeGate(index) {
  placed.splice(index, 1);
  updateCircuit();
  tone(150, 0.045);
}

function pulseCircuit() {
  loom.userData.pulse = 1;
  if (statesEqual(current, puzzle.target)) {
    tone(440, 0.08);
    setTimeout(() => tone(660, 0.1), 90);
    setTimeout(showResult, 360);
  } else {
    els.pulse.textContent = "SIGNATURE MISMATCH";
    flash(els.live);
    tone(105, 0.14);
    setTimeout(() => { els.pulse.textContent = "PULSE CIRCUIT"; }, 850);
  }
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
    localStorage.setItem("quantum-loom-tutorial", "complete");
    tutorialActive = false;
    els.resultCopy.textContent = "Training complete. You matched LIVE to TARGET and stabilized your first branch.";
  } else {
    els.resultCopy.textContent = rank === "S" ? "Optimal weave. No wasted motion." : rank === "A" ? "Clean signal. One gate from perfect." : "Stable, but the loom can be tighter.";
  }
  els.result.hidden = false;
  requestAnimationFrame(() => els.result.classList.add("visible"));
}

function startLevel(forceTutorial = false) {
  tutorialActive = forceTutorial || (level === 1 && localStorage.getItem("quantum-loom-tutorial") !== "complete");
  puzzle = tutorialActive ? tutorialPuzzle() : generatePuzzle(level);
  placed = [];
  current = puzzle.initial.slice();
  els.level.textContent = String(level).padStart(2, "0");
  els.streak.textContent = streak;
  els.par.textContent = puzzle.par;
  renderState(els.target, puzzle.target);
  renderTray();
  updateCircuit();
  els.result.classList.remove("visible");
  els.result.hidden = true;
}

function flash(element) {
  element.classList.remove("flash");
  void element.offsetWidth;
  element.classList.add("flash");
}

function tone(frequency, duration) {
  if (!soundOn) return;
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.045, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

els.pulse.addEventListener("click", pulseCircuit);
els.undo.addEventListener("click", () => placed.length && removeGate(placed.length - 1));
els.reset.addEventListener("click", () => { placed = []; updateCircuit(); tone(120, 0.06); });
els.next.addEventListener("click", () => { level += 1; startLevel(); });
els.tutorialReplay.addEventListener("click", () => {
  level = 1;
  els.result.classList.remove("visible");
  els.result.hidden = true;
  startLevel(true);
});
els.tutorialSkip.addEventListener("click", () => {
  tutorialActive = false;
  localStorage.setItem("quantum-loom-tutorial", "complete");
  updateTutorial();
});
els.sound.addEventListener("click", () => {
  soundOn = !soundOn;
  els.sound.textContent = soundOn ? "◉" : "○";
  els.sound.setAttribute("aria-label", soundOn ? "Mute sound" : "Enable sound");
});

function resize() {
  const rect = els.canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(els.canvas);

const clock = new THREE.Clock();
function animate() {
  const t = clock.getElapsedTime();
  loom.rotation.y = Math.sin(t * 0.32) * 0.045;
  loom.position.y = Math.sin(t * 0.7) * 0.035;
  nodes.children.forEach((node, i) => {
    const scale = 1 + Math.sin(t * 3.2 + i) * 0.12 + (loom.userData.pulse || 0) * 0.5;
    node.scale.setScalar(scale);
  });
  particles.children.forEach((dot) => {
    dot.position.y -= dot.userData.speed * 12;
    if (dot.position.y < -2.9) dot.position.y = 2.9;
  });
  loom.userData.pulse = Math.max(0, (loom.userData.pulse || 0) - 0.035);
  starField.rotation.z = t * 0.008;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

startLevel();
resize();
animate();
