import "./style.css";

const modeSelect = document.querySelector("#mode-select");
const app = document.querySelector("#app");
const modeSwitch = document.querySelector("#mode-switch");
const params = new URLSearchParams(location.search);
const mode = params.get("mode");
const validModes = new Set(["loom", "quantum"]);

function progressLabel(storageKey, fallbackKey) {
  const sector = Math.max(1, Number(localStorage.getItem(storageKey) || localStorage.getItem(fallbackKey) || 1));
  return sector > 1 ? `CONTINUE SECTOR ${String(sector).padStart(2, "0")} →` : "BEGIN AT SECTOR 01 →";
}

document.querySelector("#loom-progress").textContent = progressLabel("quantum-loom-loom-level", "quantum-loom-pre-curriculum-level");
document.querySelector("#quantum-progress").textContent = progressLabel("quantum-loom-quantum-level", "quantum-loom-level");

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    const destination = new URL(location.href);
    destination.search = "";
    destination.searchParams.set("mode", button.dataset.mode);
    location.assign(destination);
  });
});

modeSwitch.addEventListener("click", () => {
  const destination = new URL(location.href);
  destination.search = "";
  location.assign(destination);
});

if (!validModes.has(mode)) {
  app.hidden = true;
  modeSelect.hidden = false;
  document.title = "Choose a mode — QuantumLoom";
} else {
  document.body.dataset.mode = mode;
  modeSelect.hidden = true;
  app.hidden = false;
  modeSwitch.textContent = "⌂ HOME";
  modeSwitch.setAttribute("aria-label", "Return to mode selection");
  document.querySelector(".gate-panel-heading p:last-child").textContent = mode === "loom"
    ? "Transform each strand, then trace it to its routed output"
    : "Build a reversible algorithm, then align every output amplitude";
  document.querySelector("#tutorial-coach .micro-label").textContent = mode === "loom" ? "LOOM TRAINING" : "QUANTUM TRAINING";
  if (mode === "loom") {
    import("./loom-mode.js");
  } else {
    import("./main.js");
  }
}
