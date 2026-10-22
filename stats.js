const COLOR_SWATCH = {
  White: "#d8c27a",
  Blue: "#2a6fdb",
  Black: "#3a3a3a",
  Red: "#c44536",
  Green: "#2f7d4a",
  Multicolor: "#7a5ea7",
  Colorless: "#b7b1a8",
};

const IDENTITY = [
  ["W", "White", "#d8c27a"],
  ["U", "Blue", "#2a6fdb"],
  ["B", "Black", "#3a3a3a"],
  ["R", "Red", "#c44536"],
  ["G", "Green", "#2f7d4a"],
];

const statsEmpty = document.querySelector("#stats-empty");
const statsBody = document.querySelector("#stats-body");
const statsCount = document.querySelector("#stats-count");
const typeBars = document.querySelector("#type-bars");
const colorChart = document.querySelector("#color-chart");
const colorLegend = document.querySelector("#color-legend");
const commanderName = document.querySelector("#commander-name");
const identity = document.querySelector("#identity");

function renderBars(container, rows) {
  container.replaceChildren();
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "stats-note";
    empty.textContent = "No cards to chart.";
    container.append(empty);
    return;
  }
  for (const row of rows) {
    const line = document.createElement("div");
    line.className = "bar-row";
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = row.label;
    const track = document.createElement("span");
    track.className = "bar-track";
    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.width = `${(row.count / max) * 100}%`;
    track.append(fill);
    const count = document.createElement("span");
    count.className = "bar-count";
    count.textContent = String(row.count);
    line.append(label, track, count);
    container.append(line);
  }
}

function renderDonut(rows) {
  colorChart.replaceChildren();
  colorLegend.replaceChildren();
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (!total) {
    const empty = document.createElement("p");
    empty.className = "stats-note";
    empty.textContent = "No cards to chart.";
    colorLegend.append(empty);
    return;
  }
  const radius = 42;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("aria-hidden", "true");
  let angle = -Math.PI / 2;
  for (const row of rows) {
    const sweep = (row.count / total) * Math.PI * 2;
    const segment = document.createElementNS("http://www.w3.org/2000/svg", rows.length === 1 ? "circle" : "path");
    segment.setAttribute("fill", "none");
    segment.setAttribute("stroke", COLOR_SWATCH[row.label] || "#1f1c19");
    segment.setAttribute("stroke-width", "16");
    if (rows.length === 1) {
      segment.setAttribute("cx", "60");
      segment.setAttribute("cy", "60");
      segment.setAttribute("r", String(radius));
    } else {
      const start = angle;
      const end = angle + sweep;
      const p1 = { x: 60 + radius * Math.cos(start), y: 60 + radius * Math.sin(start) };
      const p2 = { x: 60 + radius * Math.cos(end), y: 60 + radius * Math.sin(end) };
      const large = sweep > Math.PI ? 1 : 0;
      segment.setAttribute("d", `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${large} 1 ${p2.x} ${p2.y}`);
      angle = end;
    }
    svg.append(segment);
  }
  colorChart.append(svg);

  for (const row of rows) {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = COLOR_SWATCH[row.label] || "#1f1c19";
    const name = document.createElement("span");
    name.textContent = row.label;
    const count = document.createElement("span");
    count.className = "legend-count";
    count.textContent = String(row.count);
    item.append(swatch, name, count);
    colorLegend.append(item);
  }
}

function renderIdentity(stats) {
  identity.replaceChildren();
  if (!stats.commanderName) {
    commanderName.textContent = "No commander set.";
    return;
  }
  commanderName.textContent = stats.commanderName;
  for (const [code, label, hex] of IDENTITY) {
    const pip = document.createElement("div");
    pip.className = "identity-pip";
    const disc = document.createElement("span");
    disc.className = "identity-disc";
    const on = stats.identity.includes(code);
    if (on) {
      disc.style.background = hex;
      disc.style.borderColor = hex;
    }
    const name = document.createElement("span");
    name.className = "identity-label";
    name.textContent = label;
    if (!on) name.classList.add("is-off");
    pip.append(disc, name);
    identity.append(pip);
  }
  if (stats.identity.length === 0) {
    const note = document.createElement("p");
    note.className = "stats-note";
    note.textContent = "Colorless";
    identity.append(note);
  }
}

const snapshot = loadDeckState();
if (!snapshot || deckEntries(snapshot).length === 0) {
  statsEmpty.hidden = false;
  statsBody.hidden = true;
} else {
  const stats = deckStatistics(snapshot);
  statsEmpty.hidden = true;
  statsBody.hidden = false;
  statsCount.textContent = stats.total === 1 ? "1 card" : `${stats.total} cards`;
  renderBars(typeBars, stats.types);
  renderDonut(stats.colors);
  renderIdentity(stats);
}
