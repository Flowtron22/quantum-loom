export const STATES = ["0", "1", "+", "-"];

export const GATES = {
  X: {
    name: "BIT FLIP",
    short: "X",
    color: 0x49e7ff,
    apply(value) {
      return ({ "0": "1", "1": "0", "+": "+", "-": "-" })[value];
    },
  },
  H: {
    name: "SPLIT",
    short: "H",
    color: 0xffcc58,
    apply(value) {
      return ({ "0": "+", "1": "-", "+": "0", "-": "1" })[value];
    },
  },
  Z: {
    name: "PHASE",
    short: "Z",
    color: 0xff4f94,
    apply(value) {
      return ({ "0": "0", "1": "1", "+": "-", "-": "+" })[value];
    },
  },
};

export function applyGate(state, gate) {
  const next = state.slice();
  next[gate.qubit] = GATES[gate.type].apply(next[gate.qubit]);
  return next;
}

export function runCircuit(initial, gates) {
  return gates.reduce(applyGate, initial.slice());
}

export function traceCircuit(initial, gates) {
  const states = [initial.slice()];
  for (const gate of gates) states.push(applyGate(states.at(-1), gate));
  return states;
}

export function statesEqual(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function randomInt(max, random) {
  return Math.floor(random() * max);
}

export function shortestPath(from, to, qubit) {
  if (from === to) return [];
  const queue = [{ value: from, path: [] }];
  const visited = new Set([from]);
  while (queue.length) {
    const current = queue.shift();
    for (const type of Object.keys(GATES)) {
      const value = GATES[type].apply(current.value);
      const path = [...current.path, { type, qubit }];
      if (value === to) return path;
      if (!visited.has(value)) {
        visited.add(value);
        queue.push({ value, path });
      }
    }
  }
  return [];
}

export function generatePuzzle(level = 1, random = Math.random) {
  const qubitCount = level < 3 ? 2 : 3;
  const initial = Array.from({ length: qubitCount }, () => STATES[randomInt(2, random)]);
  const minimumPar = Math.min(qubitCount * 2, 2 + Math.floor(level / 2));
  let target = initial.slice();
  let solution = [];

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const candidate = Array.from({ length: qubitCount }, () => STATES[randomInt(STATES.length, random)]);
    const candidateSolution = candidate.flatMap((value, qubit) => shortestPath(initial[qubit], value, qubit));
    if (candidateSolution.length >= minimumPar || attempt === 79) {
      target = candidate;
      solution = candidateSolution;
      break;
    }
  }

  if (!solution.length) {
    target[0] = initial[0] === "0" ? "1" : "0";
    solution = shortestPath(initial[0], target[0], 0);
  }

  return {
    initial,
    target,
    solution,
    par: solution.length,
    maxMoves: Math.min(7, solution.length + 2),
    qubitCount,
  };
}

export function tutorialPuzzle() {
  return {
    initial: ["1", "0"],
    target: ["+", "1"],
    solution: [
      { type: "X", qubit: 0 },
      { type: "H", qubit: 0 },
      { type: "X", qubit: 1 },
    ],
    par: 3,
    maxMoves: 5,
    qubitCount: 2,
    isTutorial: true,
  };
}

export function rankSolution(moves, par) {
  if (moves <= par) return "S";
  if (moves === par + 1) return "A";
  if (moves === par + 2) return "B";
  return "C";
}
