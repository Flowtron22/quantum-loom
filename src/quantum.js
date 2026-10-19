const SQRT1_2 = Math.SQRT1_2;
const EPSILON = 1e-7;

export const GATES = {
  X: { name: "BIT FLIP", short: "X", color: 0x49e7ff },
  H: { name: "SPLIT", short: "H", color: 0xffcc58 },
  Z: { name: "PHASE", short: "Z", color: 0xff4f94 },
  CX: { name: "CONTROL", short: "C·X", color: 0x70ff9d },
};

export function qubitCountForLevel(level) {
  if (level < 3) return 1;
  if (level < 7) return 2;
  if (level < 12) return 3;
  return 4;
}

export function basisLabel(index, qubitCount) {
  return index.toString(2).padStart(qubitCount, "0");
}

export function basisState(qubitCount, index = 0) {
  return Array.from({ length: 2 ** qubitCount }, (_, lane) => ({ re: lane === index ? 1 : 0, im: 0 }));
}

export function cloneState(state) {
  return state.map(({ re, im }) => ({ re, im }));
}

function bitMask(qubit, qubitCount) {
  return 1 << (qubitCount - qubit - 1);
}

export function gateMapIndex(index, gate, qubitCount) {
  const targetMask = bitMask(gate.qubit, qubitCount);
  if (gate.type === "X") return index ^ targetMask;
  if (gate.type === "CX") {
    const controlMask = bitMask(gate.control, qubitCount);
    return index & controlMask ? index ^ targetMask : index;
  }
  return index;
}

export function applyGate(state, gate, qubitCount = Math.log2(state.length)) {
  const next = state.map(() => ({ re: 0, im: 0 }));
  const mask = bitMask(gate.qubit, qubitCount);
  if (gate.type === "X" || gate.type === "CX") {
    state.forEach((amplitude, index) => {
      next[gateMapIndex(index, gate, qubitCount)] = { ...amplitude };
    });
    return next;
  }
  if (gate.type === "Z") {
    return state.map((amplitude, index) => {
      const sign = index & mask ? -1 : 1;
      return { re: amplitude.re * sign, im: amplitude.im * sign };
    });
  }
  if (gate.type === "H") {
    for (let index = 0; index < state.length; index += 1) {
      if (index & mask) continue;
      const paired = index | mask;
      next[index] = { re: (state[index].re + state[paired].re) * SQRT1_2, im: (state[index].im + state[paired].im) * SQRT1_2 };
      next[paired] = { re: (state[index].re - state[paired].re) * SQRT1_2, im: (state[index].im - state[paired].im) * SQRT1_2 };
    }
    return next;
  }
  throw new Error(`Unknown gate: ${gate.type}`);
}

export function runCircuit(initial, gates, qubitCount = Math.log2(initial.length)) {
  return gates.reduce((state, gate) => applyGate(state, gate, qubitCount), cloneState(initial));
}

export function traceCircuit(initial, gates, qubitCount = Math.log2(initial.length)) {
  const states = [cloneState(initial)];
  for (const gate of gates) states.push(applyGate(states.at(-1), gate, qubitCount));
  return states;
}

export function amplitudeMagnitude({ re, im }) {
  return Math.hypot(re, im);
}

export function statesEqual(a, b, epsilon = 1e-5) {
  if (a.length !== b.length) return false;
  const anchor = a.findIndex((amplitude) => amplitudeMagnitude(amplitude) > epsilon);
  const otherAnchor = b.findIndex((amplitude) => amplitudeMagnitude(amplitude) > epsilon);
  if (anchor < 0 || otherAnchor < 0) return anchor === otherAnchor;
  if (anchor !== otherAnchor) return false;
  const left = a[anchor];
  const right = b[anchor];
  const denominator = right.re * right.re + right.im * right.im;
  const phase = {
    re: (left.re * right.re + left.im * right.im) / denominator,
    im: (left.im * right.re - left.re * right.im) / denominator,
  };
  if (Math.abs(Math.hypot(phase.re, phase.im) - 1) > epsilon) return false;
  return a.every((amplitude, index) => {
    const expected = {
      re: b[index].re * phase.re - b[index].im * phase.im,
      im: b[index].re * phase.im + b[index].im * phase.re,
    };
    return Math.abs(amplitude.re - expected.re) < epsilon && Math.abs(amplitude.im - expected.im) < epsilon;
  });
}

function randomInt(max, random) {
  return Math.floor(random() * max);
}

export function gateCatalog(qubitCount, includeControl = true) {
  const gates = [];
  for (const type of ["X", "H", "Z"]) {
    for (let qubit = 0; qubit < qubitCount; qubit += 1) gates.push({ type, qubit });
  }
  if (includeControl && qubitCount > 1) {
    for (let control = 0; control < qubitCount; control += 1) {
      for (let qubit = 0; qubit < qubitCount; qubit += 1) {
        if (control !== qubit) gates.push({ type: "CX", control, qubit });
      }
    }
  }
  return gates;
}

function sameGate(a, b) {
  return a?.type === b?.type && a?.qubit === b?.qubit && a?.control === b?.control;
}

function createSolution(level, qubitCount, random) {
  const includeControl = level >= 5;
  const catalog = gateCatalog(qubitCount, includeControl);
  const length = Math.min(7, 1 + Math.ceil(level / 2));
  const solution = [];
  if (level >= 2) solution.push({ type: "H", qubit: randomInt(qubitCount, random) });
  if (includeControl) {
    const control = randomInt(qubitCount, random);
    solution.push({ type: "CX", control, qubit: (control + 1 + randomInt(qubitCount - 1, random)) % qubitCount });
  }
  while (solution.length < length) {
    const candidate = catalog[randomInt(catalog.length, random)];
    if (!sameGate(candidate, solution.at(-1))) solution.push({ ...candidate });
  }
  for (let index = solution.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1, random);
    [solution[index], solution[other]] = [solution[other], solution[index]];
  }
  return solution;
}

export function generatePuzzle(level = 1, random = Math.random) {
  const qubitCount = qubitCountForLevel(level);
  const initial = basisState(qubitCount, randomInt(2 ** qubitCount, random));
  let solution;
  let target;
  let attempts = 0;
  do {
    solution = createSolution(level, qubitCount, random);
    target = runCircuit(initial, solution, qubitCount);
    attempts += 1;
  } while (statesEqual(initial, target) && attempts < 12);
  return {
    initial, target, solution,
    par: solution.length,
    maxMoves: solution.length + 2,
    qubitCount,
    laneCount: 2 ** qubitCount,
    includeControl: level >= 5,
  };
}

export function tutorialPuzzle() {
  return {
    initial: basisState(1, 0),
    target: basisState(1, 1),
    solution: [{ type: "X", qubit: 0 }],
    par: 1,
    maxMoves: 3,
    qubitCount: 1,
    laneCount: 2,
    includeControl: false,
    isTutorial: true,
  };
}

export function rankSolution(moves, par) {
  if (moves <= par) return "S";
  if (moves === par + 1) return "A";
  if (moves === par + 2) return "B";
  return "C";
}

export function probabilityTotal(state) {
  return state.reduce((total, { re, im }) => total + re * re + im * im, 0);
}

export function isNormalized(state) {
  return Math.abs(probabilityTotal(state) - 1) < EPSILON;
}
