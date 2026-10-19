import test from "node:test";
import assert from "node:assert/strict";
import { applyGate, basisState, curriculumPuzzle, generatePuzzle, isNormalized, qubitCountForLevel, rankSolution, runCircuit, statesEqual, traceCircuit, tutorialPuzzle } from "./quantum.js";

test("X permutes computational basis lanes", () => {
  assert.ok(statesEqual(applyGate(basisState(2, 0), { type: "X", qubit: 0 }, 2), basisState(2, 2)));
  assert.ok(statesEqual(applyGate(basisState(2, 1), { type: "X", qubit: 1 }, 2), basisState(2, 0)));
});

test("H splits and recombines amplitude", () => {
  const split = applyGate(basisState(1, 0), { type: "H", qubit: 0 }, 1);
  assert.ok(Math.abs(split[0].re - Math.SQRT1_2) < 1e-8);
  assert.ok(Math.abs(split[1].re - Math.SQRT1_2) < 1e-8);
  assert.ok(statesEqual(applyGate(split, { type: "H", qubit: 0 }, 1), basisState(1, 0)));
});

test("Z changes relative phase", () => {
  const split = applyGate(basisState(1, 0), { type: "H", qubit: 0 }, 1);
  const phased = applyGate(split, { type: "Z", qubit: 0 }, 1);
  assert.ok(phased[0].re > 0 && phased[1].re < 0);
});

test("controlled X only flips when its control bit is one", () => {
  const gate = { type: "CX", control: 0, qubit: 1 };
  assert.ok(statesEqual(applyGate(basisState(2, 0), gate, 2), basisState(2, 0)));
  assert.ok(statesEqual(applyGate(basisState(2, 2), gate, 2), basisState(2, 3)));
});

test("generated puzzles have normalized reachable targets", () => {
  for (let level = 1; level <= 30; level += 1) {
    const puzzle = generatePuzzle(level, seeded(level));
    assert.ok(isNormalized(puzzle.target));
    assert.ok(statesEqual(runCircuit(puzzle.initial, puzzle.solution, puzzle.qubitCount), puzzle.target));
    assert.equal(puzzle.laneCount, 2 ** puzzle.qubitCount);
  }
});

test("progression reaches sixteen basis lanes", () => {
  assert.equal(qubitCountForLevel(1), 1);
  assert.equal(qubitCountForLevel(6), 2);
  assert.equal(qubitCountForLevel(14), 3);
  assert.equal(qubitCountForLevel(20), 4);
});

test("nine-lesson curriculum introduces one concept at a time", () => {
  for (let level = 1; level <= 9; level += 1) {
    const lesson = curriculumPuzzle(level);
    assert.ok(lesson.isLesson);
    assert.equal(lesson.lesson.number, level);
    assert.equal(lesson.lesson.steps.length, lesson.solution.length + 1);
    assert.ok(statesEqual(runCircuit(lesson.initial, lesson.solution, lesson.qubitCount), lesson.target));
  }
  assert.deepEqual(curriculumPuzzle(8).solution.map(({ type }) => type), ["H", "Z", "H"]);
  assert.equal(curriculumPuzzle(9).laneCount, 4);
});

test("tutorial and traces expose every state-vector step", () => {
  const puzzle = tutorialPuzzle();
  const trace = traceCircuit(puzzle.initial, puzzle.solution, puzzle.qubitCount);
  assert.equal(trace.length, 2);
  assert.ok(statesEqual(trace.at(-1), puzzle.target));
  assert.equal(rankSolution(1, 1), "S");
});

function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
