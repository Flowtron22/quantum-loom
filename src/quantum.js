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

export function routeState(state, routing = state.map((_, index) => index)) {
  const output = Array(state.length);
  routing.forEach((exit, source) => { output[exit] = state[source]; });
  return output;
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

export function qubitCountForLevel(level) {
  if (level < 3) return 2;
  if (level < 5) return 3;
  if (level < 8) return 4;
  if (level < 11) return 5;
  if (level < 15) return 6;
  if (level < 19) return 7;
  if (level < 23) return 8;
  if (level < 30) return 10;
  return 12;
}

function generateRouting(count, level, random) {
  const routing = Array.from({ length: count }, (_, index) => index);
  if (level < 6) return routing;

  const swaps = level >= 23
    ? count * 2
    : Math.min(count + 2, 1 + Math.floor((level - 6) / 2));
  for (let i = 0; i < swaps; i += 1) {
    const left = randomInt(count - 1, random);
    [routing[left], routing[left + 1]] = [routing[left + 1], routing[left]];
  }
  if (routing.every((exit, source) => exit === source)) {
    [routing[0], routing[1]] = [routing[1], routing[0]];
  }
  return routing;
}

function countCrossings(routing) {
  let crossings = 0;
  for (let left = 0; left < routing.length; left += 1) {
    for (let right = left + 1; right < routing.length; right += 1) {
      if (routing[left] > routing[right]) crossings += 1;
    }
  }
  return crossings;
}

export function generatePuzzle(level = 1, random = Math.random) {
  const qubitCount = qubitCountForLevel(level);
  const initial = Array.from({ length: qubitCount }, () => STATES[randomInt(2, random)]);
  const routing = generateRouting(qubitCount, level, random);
  const internalTarget = initial.slice();
  const indices = Array.from({ length: qubitCount }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const other = randomInt(i + 1, random);
    [indices[i], indices[other]] = [indices[other], indices[i]];
  }
  const activeCount = Math.min(qubitCount, 2 + Math.floor(level / 4));
  indices.slice(0, activeCount).forEach((qubit) => {
    const alternatives = STATES.filter((value) => value !== initial[qubit]);
    internalTarget[qubit] = alternatives[randomInt(alternatives.length, random)];
  });
  const solution = internalTarget.flatMap((value, qubit) => shortestPath(initial[qubit], value, qubit));
  const target = routeState(internalTarget, routing);
  const crossings = countCrossings(routing);

  return {
    initial,
    target,
    solution,
    par: solution.length,
    maxMoves: solution.length + 2,
    qubitCount,
    routing,
    crossings,
    nexus: level >= 20 && level % 10 === 0,
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
    routing: [0, 1],
    crossings: 0,
    nexus: false,
    isTutorial: true,
  };
}

export function rankSolution(moves, par) {
  if (moves <= par) return "S";
  if (moves === par + 1) return "A";
  if (moves === par + 2) return "B";
  return "C";
}
