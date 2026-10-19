import test from "node:test";
import assert from "node:assert/strict";
import { applyGate, generatePuzzle, qubitCountForLevel, rankSolution, routeState, runCircuit, shortestPath, statesEqual, traceCircuit, tutorialPuzzle } from "./loom.js";

test("gates transform basis and phase states", () => {
  assert.deepEqual(applyGate(["0", "+"], { type: "X", qubit: 0 }), ["1", "+"]);
  assert.deepEqual(applyGate(["0", "+"], { type: "H", qubit: 0 }), ["+", "+"]);
  assert.deepEqual(applyGate(["0", "+"], { type: "Z", qubit: 1 }), ["0", "-"]);
});

test("generated puzzles retain a valid routed solution", () => {
  for (let level = 1; level <= 40; level += 1) {
    const puzzle = generatePuzzle(level, seeded(level));
    assert.ok(statesEqual(routeState(runCircuit(puzzle.initial, puzzle.solution), puzzle.routing), puzzle.target));
    assert.equal(puzzle.solution.length, puzzle.par);
    assert.ok(puzzle.maxMoves >= puzzle.par);
  }
});

test("generated par is composed of shortest per-qubit paths", () => {
  for (let level = 1; level <= 20; level += 1) {
    const puzzle = generatePuzzle(level, seeded(level * 31));
    const internalTarget = Array(puzzle.qubitCount);
    puzzle.routing.forEach((exit, source) => { internalTarget[source] = puzzle.target[exit]; });
    const optimalLength = internalTarget.reduce(
      (total, value, qubit) => total + shortestPath(puzzle.initial[qubit], value, qubit).length,
      0,
    );
    assert.equal(puzzle.par, optimalLength);
  }
});

test("strand progression reaches dense endgame networks", () => {
  assert.equal(qubitCountForLevel(1), 2);
  assert.equal(qubitCountForLevel(6), 4);
  assert.equal(qubitCountForLevel(23), 10);
  assert.equal(qubitCountForLevel(30), 12);
  assert.ok(generatePuzzle(6, seeded(6)).crossings > 0);
});

test("solution ranks reward par", () => {
  assert.equal(rankSolution(3, 3), "S");
  assert.equal(rankSolution(4, 3), "A");
  assert.equal(rankSolution(5, 3), "B");
});

test("tutorial teaches a three-gate optimal solution", () => {
  const puzzle = tutorialPuzzle();
  assert.deepEqual(runCircuit(puzzle.initial, puzzle.solution), puzzle.target);
  assert.equal(puzzle.solution.length, puzzle.par);
  assert.equal(
    puzzle.target.reduce((total, value, qubit) => total + shortestPath(puzzle.initial[qubit], value, qubit).length, 0),
    puzzle.par,
  );
});

test("circuit trace exposes every physical transformation", () => {
  const puzzle = tutorialPuzzle();
  assert.deepEqual(traceCircuit(puzzle.initial, puzzle.solution), [
    ["1", "0"],
    ["0", "0"],
    ["+", "0"],
    ["+", "1"],
  ]);
});

function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

