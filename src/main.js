import * as THREE from "three";
import "./style.css";
import { GATES, generatePuzzle, rankSolution, routeState, runCircuit, statesEqual, traceCircuit, tutorialPuzzle } from "./quantum.js";

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
  physicsStatus: document.querySelector("#physics-status"),
  physicsStatusText: document.querySelector("#physics-status-text"),
  routingStatus: document.querySelector("#routing-status"),
  shell: document.querySelector(".game-shell"),
};

const previewLevel = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("sector")) : 0;
let level = Math.max(1, previewLevel || Number(localStorage.getItem("quantum-loom-level") || 1));
let streak = Number(localStorage.getItem("quantum-loom-streak") || 0);
let puzzle;
let placed = [];
let current = [];
let soundOn = true;
let audioContext;
let tutorialActive = false;
let simulation = null;
let screenShake = 0;

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
const gateMachines = new THREE.Group();
const pulseActors = new THREE.Group();
const burstParticles = new THREE.Group();
const targetChambers = new THREE.Group();
const junctions = new THREE.Group();
loom.add(strands, nodes, particles, junctions, gateMachines, targetChambers, pulseActors, burstParticles);

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

function makeWireBetween(startX, startY, endX, endY, color, radius = 0.024) {
  const curve = new THREE.LineCurve3(
    new THREE.Vector3(startX, startY, 0),
    new THREE.Vector3(endX, endY, 0),
  );
  const geometry = new THREE.TubeGeometry(curve, 12, radius, 6, false);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending });
  return new THREE.Mesh(geometry, material);
}

function makeRoutedWire(startX, endX, color, count, nexus = false) {
  const group = new THREE.Group();
  const radius = count >= 10 ? 0.012 : count >= 7 ? 0.017 : 0.024;
  const shoulder = nexus ? 0.72 : 0.92;
  group.add(makeWireBetween(startX, 2.85, startX, shoulder, color, radius));
  if (nexus) {
    group.add(makeWireBetween(startX, shoulder, 0, 0, color, radius));
    group.add(makeWireBetween(0, 0, endX, -shoulder, color, radius));
  } else {
    group.add(makeWireBetween(startX, shoulder, endX, -shoulder, color, radius));
  }
  group.add(makeWireBetween(endX, -shoulder, endX, -2.85, color, radius));
  return group;
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse?.((part) => {
      part.geometry?.dispose();
      part.material?.dispose();
    });
  }
}

function qubitXs(count) {
  const spacing = count <= 1 ? 0 : Math.min(1.85, 5.45 / (count - 1));
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * spacing);
}

function gateY(index, total) {
  return total <= 1 ? 0 : 2.05 - index * (4.1 / Math.max(1, total - 1));
}

function createGateMachine(gate, index, xs) {
  const color = GATES[gate.type].color;
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x18232d, metalness: 0.92, roughness: 0.22 });
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4, metalness: 0.35, roughness: 0.18 });
  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.12), metal);
  group.add(chip);
  const signalBar = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.035, 0.15), glow);
  group.add(signalBar);
  for (const y of [-0.14, 0.14]) {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), glow);
    pin.position.y = y;
    group.add(pin);
  }

  if (gate.type === "X") {
    for (const rotation of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.08), glow);
      bar.rotation.z = rotation;
      bar.position.z = 0.08;
      group.add(bar);
    }
  } else if (gate.type === "H") {
    for (const x of [-0.055, 0.055]) {
      const prong = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.15, 0.06), glow);
      prong.position.x = x;
      prong.position.z = 0.08;
      group.add(prong);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.06), glow);
    bridge.position.z = 0.08;
    group.add(bridge);
  } else {
    const wave = new THREE.Mesh(new THREE.TorusKnotGeometry(0.065, 0.014, 28, 5, 2, 3), glow);
    wave.scale.y = 0.7;
    wave.position.z = 0.08;
    group.add(wave);
  }

  group.position.set(xs[gate.qubit], gateY(index, placed.length), 0.22);
  group.scale.setScalar(xs.length >= 10 ? 0.62 : xs.length >= 7 ? 0.78 : 1);
  group.userData = { gate, recoil: 0, baseY: group.position.y, baseScale: 1 };
  return group;
}

function rebuildMachines(xs) {
  clearGroup(gateMachines);
  clearGroup(targetChambers);
  placed.forEach((gate, index) => gateMachines.add(createGateMachine(gate, index, xs)));
  puzzle.target.forEach((value, index) => {
    const color = stateColor(value);
    const chamberRadius = xs.length >= 10 ? 0.105 : xs.length >= 7 ? 0.18 : 0.28;
    const chamber = new THREE.Mesh(
      new THREE.TorusGeometry(chamberRadius, chamberRadius * 0.2, 8, 32),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2, metalness: 0.48, roughness: 0.2 }),
    );
    chamber.position.set(xs[index], -2.9, 0.16);
    chamber.userData.baseScale = 1;
    targetChambers.add(chamber);
  });
}

function rebuildLoom() {
  clearGroup(strands);
  clearGroup(nodes);
  clearGroup(particles);
  clearGroup(junctions);
  const count = current.length;
  const xs = qubitXs(count);

  current.forEach((value, index) => {
    const exit = puzzle.routing[index];
    strands.add(makeRoutedWire(xs[index], xs[exit], stateColor(value), count, puzzle.nexus));

    for (const y of [2.9, -2.9]) {
      const endpointValue = y > 0 ? puzzle.initial[index] : value;
      const color = stateColor(endpointValue);
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.8, roughness: 0.25 });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(count >= 10 ? 0.075 : 0.14, 20, 20), material);
      sphere.position.set(y > 0 ? xs[index] : xs[exit], y, 0.05);
      nodes.add(sphere);
    }

    for (let p = 0; p < (count >= 10 ? 2 : 5); p += 1) {
      const color = stateColor(value);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.026 + Math.random() * 0.018, 8, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }),
      );
      const particleY = (Math.random() - 0.5) * 5.7;
      const routeProgress = Math.max(0, Math.min(1, (2.85 - particleY) / 5.7));
      dot.position.set(THREE.MathUtils.lerp(xs[index], xs[exit], routeProgress) + (Math.random() - 0.5) * 0.1, particleY, -0.2);
      dot.userData.speed = 0.002 + Math.random() * 0.004;
      particles.add(dot);
    }
  });
  if (puzzle.nexus) {
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 2),
      new THREE.MeshStandardMaterial({ color: 0xffcc58, emissive: 0xff4f94, emissiveIntensity: 4.2, metalness: 0.35, roughness: 0.12 }),
    );
    junctions.add(core);
  }
  rebuildMachines(xs);
}

function spawnPulseActors(state) {
  clearGroup(pulseActors);
  const xs = qubitXs(state.length);
  state.forEach((value, qubit) => {
    const color = stateColor(value);
    const actor = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.19, 2),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 4.5, roughness: 0.08 }),
    );
    actor.position.set(xs[qubit], 2.92, 0.5);
    actor.userData = { qubit, state: value, startX: xs[qubit], endX: xs[puzzle.routing[qubit]] };
    pulseActors.add(actor);
  });
}

function recolorPulseActors(state) {
  pulseActors.children.forEach((actor) => {
    const value = state[actor.userData.qubit];
    const color = stateColor(value);
    actor.userData.state = value;
    actor.material.color.setHex(color);
    actor.material.emissive.setHex(color);
    actor.scale.setScalar(value === "+" || value === "-" ? 1.28 : 1);
  });
}

function emitBurst(position, color, count = 18, force = 1) {
  for (let i = 0; i < count; i += 1) {
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.025 + Math.random() * 0.035, 7, 7),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
    );
    particle.position.copy(position);
    const angle = Math.random() * Math.PI * 2;
    particle.userData.velocity = new THREE.Vector3(
      Math.cos(angle) * (0.5 + Math.random() * 1.5) * force,
      Math.sin(angle) * (0.5 + Math.random() * 1.5) * force,
      (Math.random() - 0.5) * force,
    );
    particle.userData.life = 1;
    burstParticles.add(particle);
  }
}

function setControlsLocked(locked) {
  els.pulse.disabled = locked;
  els.undo.disabled = locked || placed.length === 0;
  els.reset.disabled = locked || placed.length === 0;
  els.tray.querySelectorAll("button").forEach((button) => { button.disabled = locked; });
  els.slots.querySelectorAll("button").forEach((button) => { button.disabled = locked; });
  els.shell.classList.toggle("simulating", locked);
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
    const def = GATES[type];
    const bank = document.createElement("section");
    bank.className = `gate-bank gate-bank-${type.toLowerCase()}`;
    bank.setAttribute("aria-label", `${def.name} gates`);
    const label = document.createElement("div");
    label.className = "gate-bank-label";
    label.innerHTML = `<strong>${def.short}</strong><span>${def.name}</span>`;
    const row = document.createElement("div");
    row.className = "gate-row";
    for (let q = 0; q < puzzle.qubitCount; q += 1) row.appendChild(makeGateButton(type, q));
    bank.append(label, row);
    els.tray.appendChild(bank);
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
  const output = routeState(current, puzzle.routing);
  renderState(els.live, output);
  renderSlots();
  els.moves.textContent = `${placed.length} / ${puzzle.maxMoves}`;
  els.undo.disabled = placed.length === 0;
  els.reset.disabled = placed.length === 0;
  els.pulse.classList.toggle("ready", statesEqual(output, puzzle.target));
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
  if (simulation) return;
  const success = statesEqual(routeState(current, puzzle.routing), puzzle.target);
  simulation = {
    startedAt: clock.getElapsedTime(),
    duration: Math.max(1.65, placed.length * 0.34 + 0.92),
    trace: traceCircuit(puzzle.initial, placed),
    lastGate: -1,
    success,
    finished: false,
  };
  spawnPulseActors(puzzle.initial);
  renderState(els.live, routeState(puzzle.initial, puzzle.routing));
  els.physicsStatus.hidden = false;
  els.physicsStatus.className = "physics-status active";
  els.physicsStatusText.textContent = "ENERGY RELEASED";
  els.pulse.textContent = "LOOM RUNNING";
  setControlsLocked(true);
  tone(150, 0.18);
}

function finishPhysicalRun() {
  if (!simulation || simulation.finished) return;
  simulation.finished = true;
  renderState(els.live, routeState(current, puzzle.routing));
  if (simulation.success) {
    els.physicsStatus.className = "physics-status active success";
    els.physicsStatusText.textContent = "TIMELINES STABILIZED";
    targetChambers.children.forEach((chamber) => emitBurst(chamber.position, chamber.material.color.getHex(), 34, 1.55));
    targetChambers.children.forEach((chamber) => { chamber.userData.burst = 1; });
    loom.userData.pulse = 1;
    screenShake = 1;
    tone(330, 0.12);
    setTimeout(() => tone(495, 0.16), 110);
    setTimeout(() => tone(742, 0.24), 230);
    navigator.vibrate?.([35, 35, 80]);
    setTimeout(() => {
      simulation = null;
      els.physicsStatus.hidden = true;
      showResult();
    }, 760);
  } else {
    els.physicsStatus.className = "physics-status active failure";
    els.physicsStatusText.textContent = "BRANCH COLLISION";
    pulseActors.children.forEach((actor) => emitBurst(actor.position, 0xff315f, 24, 1.8));
    pulseActors.visible = false;
    screenShake = 0.75;
    tone(82, 0.32);
    navigator.vibrate?.(90);
    flash(els.live);
    setTimeout(() => {
      simulation = null;
      pulseActors.visible = true;
      clearGroup(pulseActors);
      els.physicsStatus.hidden = true;
      els.pulse.textContent = "PULSE CIRCUIT";
      setControlsLocked(false);
    }, 1050);
  }
}

function animatePhysicalRun(t) {
  if (!simulation) return;
  const progress = Math.min(1, (t - simulation.startedAt) / simulation.duration);
  const eased = progress * progress * (3 - 2 * progress);
  const y = 2.92 - eased * 5.82;
  pulseActors.children.forEach((actor, index) => {
    actor.position.y = y;
    actor.rotation.x += 0.12;
    actor.rotation.y += 0.16;
    if (puzzle.nexus) {
      actor.position.x = progress < 0.5
        ? THREE.MathUtils.lerp(actor.userData.startX, 0, progress * 2)
        : THREE.MathUtils.lerp(0, actor.userData.endX, (progress - 0.5) * 2);
    } else {
      actor.position.x = THREE.MathUtils.lerp(actor.userData.startX, actor.userData.endX, eased);
    }
  });

  const crossed = placed.reduce((count, _gate, index) => progress >= (index + 1) / (placed.length + 1) ? count + 1 : count, 0) - 1;
  while (simulation.lastGate < crossed) {
    simulation.lastGate += 1;
    const index = simulation.lastGate;
    const gate = placed[index];
    const state = simulation.trace[index + 1];
    recolorPulseActors(state);
    renderState(els.live, routeState(state, puzzle.routing));
    const machine = gateMachines.children[index];
    if (machine) {
      machine.userData.recoil = 1;
      emitBurst(machine.position, GATES[gate.type].color, gate.type === "H" ? 22 : 14, 0.75);
    }
    els.physicsStatusText.textContent = `${GATES[gate.type].name} q${gate.qubit}`;
    tone(240 + index * 70 + gate.qubit * 45, 0.09);
  }
  if (progress >= 1) finishPhysicalRun();
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
  simulation = null;
  clearGroup(pulseActors);
  clearGroup(burstParticles);
  els.physicsStatus.hidden = true;
  els.pulse.textContent = "PULSE CIRCUIT";
  setControlsLocked(false);
  tutorialActive = forceTutorial || (level === 1 && localStorage.getItem("quantum-loom-tutorial") !== "complete");
  puzzle = tutorialActive ? tutorialPuzzle() : generatePuzzle(level);
  placed = [];
  current = puzzle.initial.slice();
  els.level.textContent = String(level).padStart(2, "0");
  els.streak.textContent = streak;
  els.par.textContent = puzzle.par;
  els.routingStatus.textContent = puzzle.nexus
    ? `NEXUS · ${puzzle.qubitCount} STRANDS`
    : puzzle.crossings
      ? `${puzzle.crossings} CROSSINGS · ${puzzle.qubitCount} STRANDS`
      : `DIRECT · ${puzzle.qubitCount} STRANDS`;
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
els.next.addEventListener("click", () => {
  level += 1;
  localStorage.setItem("quantum-loom-level", String(level));
  startLevel();
});
els.tutorialReplay.addEventListener("click", () => {
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
  animatePhysicalRun(t);
  loom.rotation.y = Math.sin(t * 0.32) * 0.045 + (Math.random() - 0.5) * screenShake * 0.025;
  loom.position.x = (Math.random() - 0.5) * screenShake * 0.08;
  loom.position.y = Math.sin(t * 0.7) * 0.035 + (Math.random() - 0.5) * screenShake * 0.06;
  screenShake *= 0.92;
  nodes.children.forEach((node, i) => {
    const scale = 1 + Math.sin(t * 3.2 + i) * 0.12 + (loom.userData.pulse || 0) * 0.5;
    node.scale.setScalar(scale);
  });
  particles.children.forEach((dot) => {
    dot.position.y -= dot.userData.speed * 12;
    if (dot.position.y < -2.9) dot.position.y = 2.9;
  });
  gateMachines.children.forEach((machine, index) => {
    machine.userData.recoil *= 0.82;
    const kick = machine.userData.recoil;
    machine.scale.set(1 + kick * 0.32, 1 - kick * 0.18, 1 + kick * 0.32);
    machine.position.y = machine.userData.baseY + kick * 0.08;
  });
  targetChambers.children.forEach((chamber, index) => {
    chamber.rotation.z += 0.006 * (index % 2 ? -1 : 1);
    chamber.userData.burst = (chamber.userData.burst || 0) * 0.92;
    chamber.scale.setScalar(1 + chamber.userData.burst * 0.75 + Math.sin(t * 2.8 + index) * 0.035);
  });
  burstParticles.children.slice().forEach((particle) => {
    particle.userData.life -= 0.025;
    particle.position.addScaledVector(particle.userData.velocity, 0.025);
    particle.userData.velocity.multiplyScalar(0.965);
    particle.material.opacity = Math.max(0, particle.userData.life);
    particle.scale.setScalar(Math.max(0.1, particle.userData.life));
    if (particle.userData.life <= 0) {
      burstParticles.remove(particle);
      particle.geometry.dispose();
      particle.material.dispose();
    }
  });
  loom.userData.pulse = Math.max(0, (loom.userData.pulse || 0) - 0.035);
  starField.rotation.z = t * 0.008;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

startLevel();
resize();
animate();
