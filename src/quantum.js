const SQRT1_2 = Math.SQRT1_2;
const EPSILON = 1e-7;

export const GATES = {
  X: { name: "BIT FLIP", short: "X", color: 0x49e7ff },
  H: { name: "SPLIT", short: "H", color: 0xffcc58 },
  Z: { name: "PHASE", short: "Z", color: 0xff4f94 },
  CX: { name: "CONTROL", short: "C·X", color: 0x70ff9d },
};

export function qubitCountForLevel(level) {
  if (level < 6) return 1;
  if (level < 14) return 2;
  if (level < 20) return 3;
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

function lessonState(initial, gates, qubitCount) {
  return runCircuit(initial, gates, qubitCount);
}

function makeLesson(level, { qubitCount, initial, solution, availableTypes, title, steps }) {
  return {
    initial,
    target: lessonState(initial, solution, qubitCount),
    solution,
    par: solution.length,
    maxMoves: solution.length + 2,
    qubitCount,
    laneCount: 2 ** qubitCount,
    includeControl: availableTypes.includes("CX"),
    availableTypes,
    isLesson: true,
    lesson: { number: level, total: 9, title, steps },
  };
}

export function curriculumPuzzle(level) {
  const lessons = {
    1: {
      qubitCount: 1, initial: basisState(1, 0), solution: [{ type: "X", qubit: 0 }], availableTypes: ["X"],
      title: "Move an amplitude",
      steps: ["The sigil begins on |0〉. Tap X₀ to exchange the |0〉 and |1〉 lanes.", "The output now matches |1〉. Pulse the circuit."],
    },
    2: {
      qubitCount: 1, initial: basisState(1, 1), solution: [{ type: "X", qubit: 0 }], availableTypes: ["X"],
      title: "X is reversible",
      steps: ["X works both ways. Tap X₀ to move the sigil from |1〉 back to |0〉.", "One X reversed the bit flip. Pulse the circuit."],
    },
    3: {
      qubitCount: 1, initial: basisState(1, 0), solution: [{ type: "H", qubit: 0 }], availableTypes: ["X", "H"],
      title: "Split the sigil",
      steps: ["Tap H₀. It divides one amplitude into two equal 0.71 waves.", "Both lanes now carry 50% probability. Pulse the circuit."],
    },
    4: {
      qubitCount: 1, initial: basisState(1, 1), solution: [{ type: "H", qubit: 0 }], availableTypes: ["H"],
      title: "Meet negative amplitude",
      steps: ["H on |1〉 creates +0.71 on |0〉 and −0.71 on |1〉. Tap H₀.", "Purple means negative amplitude—not negative probability. Pulse the circuit."],
    },
    5: {
      qubitCount: 1,
      initial: lessonState(basisState(1, 0), [{ type: "H", qubit: 0 }], 1),
      solution: [{ type: "Z", qubit: 0 }], availableTypes: ["H", "Z"],
      title: "Flip the phase",
      steps: ["The two lanes start positive. Tap Z₀ to reverse only the |1〉 amplitude.", "Z changed phase without moving probability. Pulse the circuit."],
    },
    6: {
      qubitCount: 2, initial: basisState(2, 0), solution: [{ type: "X", qubit: 0 }], availableTypes: ["X"],
      title: "Four basis lanes",
      steps: ["Two qubits create |00〉, |01〉, |10〉, and |11〉. Tap X₀ to exchange the first-bit pairs.", "The sigil moved from |00〉 to |10〉. Pulse the circuit."],
    },
    7: {
      qubitCount: 2, initial: basisState(2, 2), solution: [{ type: "CX", control: 0, qubit: 1 }], availableTypes: ["X", "CX"],
      title: "Conditional control",
      steps: ["The first bit of |10〉 is 1, so C₀→X₁ may flip the second bit. Tap it.", "The control condition passed, moving |10〉 to |11〉. Pulse the circuit."],
    },
    8: {
      qubitCount: 1, initial: basisState(1, 0),
      solution: [{ type: "H", qubit: 0 }, { type: "Z", qubit: 0 }, { type: "H", qubit: 0 }],
      availableTypes: ["H", "Z"], title: "Interference",
      steps: ["Tap H₀ to split the wave.", "Tap Z₀ to reverse one branch.", "Tap H₀ again. The branches recombine and cancel on |0〉.", "Only |1〉 remains. Pulse the circuit."],
    },
    9: {
      qubitCount: 2, initial: basisState(2, 0),
      solution: [{ type: "H", qubit: 0 }, { type: "CX", control: 0, qubit: 1 }],
      availableTypes: ["H", "CX"], title: "Entangle two qubits",
      steps: ["Tap H₀ to split |00〉 between |00〉 and |10〉.", "Tap C₀→X₁. Only the branch whose control bit is 1 flips.", "The result links |00〉 with |11〉. Pulse the circuit."],
    },
  };
  return lessons[level] ? makeLesson(level, lessons[level]) : null;
}

export function generatePuzzle(level = 1, random = Math.random) {
  const lesson = curriculumPuzzle(level);
  if (lesson) return lesson;
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
    includeControl: level >= 10,
    availableTypes: ["X", "H", "Z", "CX"],
  };
}

export function tutorialPuzzle() {
  return curriculumPuzzle(1);
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
