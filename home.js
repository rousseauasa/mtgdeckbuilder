const dropbox = document.querySelector("#dropbox");
const dropboxPrompt = document.querySelector("#dropbox-prompt");
const progress = document.querySelector("#progress");
const ringValue = document.querySelector("#ring-value");
const ringLabel = document.querySelector("#ring-label");
const homeStatus = document.querySelector("#home-status");
const browse = document.querySelector("#browse");
const newDeckButton = document.querySelector("#new-deck");
const fileInput = document.querySelector("#decklist-file");

const ringRadius = Number(ringValue.getAttribute("r"));
const ringLength = 2 * Math.PI * ringRadius;
ringValue.style.strokeDasharray = String(ringLength);
ringValue.style.strokeDashoffset = String(ringLength);

let busy = false;
let dragDepth = 0;

function setStatus(message, isError = false) {
  homeStatus.textContent = message;
  homeStatus.classList.toggle("is-error", isError);
}

function showProgress(fraction) {
  dropboxPrompt.hidden = true;
  progress.hidden = false;
  const clamped = Math.min(1, Math.max(0, fraction));
  ringValue.style.strokeDashoffset = String(ringLength * (1 - clamped));
  ringLabel.textContent = `${Math.round(clamped * 100)}%`;
}

function hideProgress() {
  progress.hidden = true;
  dropboxPrompt.hidden = false;
  ringValue.style.strokeDashoffset = String(ringLength);
  ringLabel.textContent = "0%";
}

async function importText(text) {
  if (busy) return;
  const parsed = parseDecklist(text);
  if (parsed.error) {
    setStatus(parsed.error, true);
    return;
  }
  busy = true;
  setStatus("");
  showProgress(0);
  const names = [...new Set([...parsed.cards.map((entry) => entry.name), parsed.commander.name])];
  const found = new Map();
  try {
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      const card = await lookupExact(name);
      if (!card) throw new Error(`Couldn't find ${name}.`);
      found.set(name.toLowerCase(), card);
      showProgress((index + 1) / names.length);
    }
    const width = Math.max(320, window.innerWidth - 360);
    const laid = layoutImportedDeck(parsed, found, width, 0, 0);
    const cardsByOracle = {};
    for (const card of found.values()) {
      const trimmed = trimCard(card);
      cardsByOracle[trimmed.oracle_id] = trimmed;
    }
    const commanderCard = found.get(parsed.commander.name.toLowerCase());
    saveDeckState({
      cards: laid.cards,
      categories: laid.categories,
      stacks: [],
      commander: {
        query: commanderCard.name,
        name: commanderCard.name,
        oracleId: commanderCard.oracle_id,
      },
      cardsByOracle,
    });
    showProgress(1);
    await sleep(400);
    ringLabel.textContent = "Deck loaded";
    await sleep(800);
    window.location.href = "deck.html";
  } catch (error) {
    hideProgress();
    setStatus(error.message, true);
    busy = false;
  }
}

function readDeckFile(file) {
  const reader = new FileReader();
  reader.onload = () => importText(String(reader.result ?? ""));
  reader.onerror = () => setStatus("Couldn't read that file.", true);
  reader.readAsText(file);
}

browse.addEventListener("click", () => {
  fileInput.click();
});

newDeckButton.addEventListener("click", () => {
  if (busy) return;
  saveDeckState({
    cards: [],
    categories: [],
    stacks: [],
    notes: [],
    commander: null,
    cardsByOracle: {},
  });
  window.location.href = "deck.html";
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (file) readDeckFile(file);
});

dropbox.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropbox.classList.add("is-dragover");
});

dropbox.addEventListener("dragover", (event) => {
  event.preventDefault();
});

dropbox.addEventListener("dragleave", () => {
  dragDepth -= 1;
  if (dragDepth <= 0) {
    dragDepth = 0;
    dropbox.classList.remove("is-dragover");
  }
});

dropbox.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropbox.classList.remove("is-dragover");
  const file = event.dataTransfer?.files?.[0];
  if (file) readDeckFile(file);
});
