const viewport = document.querySelector("#viewport");
const world = document.querySelector("#world");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#card-query");
const searchStatus = document.querySelector("#search-status");
const results = document.querySelector("#results");
const newCategoryButton = document.querySelector("#new-category");
const newNoteButton = document.querySelector("#new-note");
const sidebar = document.querySelector("#sidebar");
const sidebarCollapse = document.querySelector("#sidebar-collapse");
const categoryList = document.querySelector("#category-list");
const commanderForm = document.querySelector("#commander-form");
const commanderInput = document.querySelector("#commander-name");
const commanderStatus = document.querySelector("#commander-status");
const commanderPreview = document.querySelector("#commander-preview");
const saveDeckButton = document.querySelector("#save-deck");
const decklistStatus = document.querySelector("#decklist-status");
const cardCount = document.querySelector("#card-count");
const dragGhost = document.querySelector("#drag-ghost");
const hoverPreview = document.querySelector("#hover-preview");
const legalityTooltip = document.querySelector("#legality-tooltip");
const legalityTooltipIcon = document.querySelector("#legality-tooltip-icon");
const legalityTooltipText = document.querySelector("#legality-tooltip-text");
const cardMenu = document.querySelector("#card-menu");
const menuDelete = document.querySelector("#menu-delete");
const menuDetails = document.querySelector("#menu-details");
const menuFlip = document.querySelector("#menu-flip");
const menuCommander = document.querySelector("#menu-commander");
const menuCategory = document.querySelector("#menu-category");
const categoryPicker = document.querySelector("#category-picker");
const categoryPickerList = document.querySelector("#category-picker-list");
const categoryPickerEmpty = document.querySelector("#category-picker-empty");
const categoryPickerBackdrop = document.querySelector("#category-picker-backdrop");
const menuPrinting = document.querySelector("#menu-printing");
const printingPicker = document.querySelector("#printing-picker");
const printingPickerList = document.querySelector("#printing-picker-list");
const printingPickerStatus = document.querySelector("#printing-picker-status");
const printingPickerBackdrop = document.querySelector("#printing-picker-backdrop");
const cardDetails = document.querySelector("#card-details");
const cardDetailsBackdrop = document.querySelector("#card-details-backdrop");
const cardDetailsClose = document.querySelector("#card-details-close");
const cardDetailsImage = document.querySelector("#card-details-image");
const cardDetailsNoImage = document.querySelector("#card-details-noimage");
const cardDetailsTitle = document.querySelector("#card-details-title");
const cardDetailsStatus = document.querySelector("#card-details-status");
const cardDetailsBody = document.querySelector("#card-details-body");
const trashCan = document.querySelector("#trash-can");

const STACK_OFFSET = 30;
const CARD_WIDTH = 200;
const CARD_HEIGHT = 279;
const DRAG_LAYER = "2000";

const state = {
  cards: [],
  categories: [],
  stacks: [],
  notes: [],
};

let panX = 0;
let panY = 0;
let searchToken = 0;
let suggestionTimer = 0;
let hoverToken = 0;
let hoverTimer = 0;
let hoverAnchor = null;
let legalityTooltipTimer = 0;
let legalityTooltipTarget = null;
let drag = null;
let pendingMove = null;
let moveFrame = 0;
let lastDropKey = null;
let lastCommanderTarget = false;
let lastTrashTarget = false;
let persistTimer = 0;
let persistPending = false;
let commander = null;
let menuCardId = null;
let categoryPickerCardId = null;
let printingPickerCardId = null;
let printingPickerToken = 0;
let cardDetailsToken = 0;
let deckReady = false;

const printingDatabase = new Map();

function flippableFaces(oracleId, printingId = null) {
  const card = (printingId && printingDatabase.get(printingId)) || cardDatabase.get(oracleId);
  const withImages = (card?.card_faces ?? []).filter((face) => face.image_uris?.normal);
  const uniqueUrls = new Set(withImages.map((face) => face.image_uris.normal));
  if (withImages.length > 1 && uniqueUrls.size > 1) return withImages;
  return [];
}

function cardDisplay(oracleId, faceIndex = 0, printingId = null) {
  const oracle = cardDatabase.get(oracleId);
  const card = (printingId && printingDatabase.get(printingId)) || oracle;
  if (!card) return { name: "Unknown card", image: null, canFlip: false, fullName: "Unknown card" };
  const faces = flippableFaces(oracleId, printingId);
  if (faces.length > 1) {
    const face = faces[((faceIndex % faces.length) + faces.length) % faces.length];
    return { name: face.name, image: face.image_uris.normal, canFlip: true, fullName: oracle?.name ?? card.name };
  }
  const image =
    card.image_uris?.normal ??
    card.card_faces?.find((face) => face.image_uris)?.image_uris.normal ??
    null;
  return { name: card.name, image, canFlip: false, fullName: oracle?.name ?? card.name };
}

function isFormatIllegal(oracleId) {
  const status = cardDatabase.get(oracleId)?.legalities?.commander;
  return Boolean(status && status !== "legal");
}

function cardLegality(card) {
  const data = cardDatabase.get(card.oracleId);
  if (!data) return null;
  if (isFormatIllegal(card.oracleId)) return "illegal";
  if (!commander?.oracleId) return null;
  const identity = cardDatabase.get(commander.oracleId)?.color_identity;
  if (!identity) return null;
  return (data.color_identity ?? []).every((color) => identity.includes(color)) ? null : "off-color";
}

function markLegality(element, card) {
  const legality = card ? cardLegality(card) : null;
  element.classList.toggle("is-illegal", legality === "illegal");
  element.classList.toggle("is-off-color", legality === "off-color");
}

function markCommanderCard(element, card) {
  if (!element.classList.contains("free-card")) return;
  const isCommander = Boolean(card && commander?.oracleId && card.oracleId === commander.oracleId);
  element.classList.toggle("is-commander", isCommander);
  let crown = element.querySelector(":scope > .commander-crown");
  if (isCommander && !crown) {
    // A plain span with a background image, not an <img>: an image inside the
    // card can be grabbed/native-dragged on its own and fights the card's
    // drag handling. The span is purely decorative but still part of the
    // card, so pressing on the crown starts a normal card drag.
    crown = document.createElement("span");
    crown.className = "commander-crown";
    crown.setAttribute("aria-hidden", "true");
    element.append(crown);
  } else if (!isCommander && crown) {
    crown.remove();
  }
}

function refreshIllegalMarkings() {
  for (const element of world.querySelectorAll(".free-card, .category-card")) {
    const card = cardById(element.dataset.id);
    markLegality(element, card);
    markCommanderCard(element, card);
  }
  commanderForm.classList.toggle("is-illegal", Boolean(commander?.oracleId && isFormatIllegal(commander.oracleId)));
}

function setSearchStatus(message, isError = false) {
  searchStatus.textContent = message;
  searchStatus.classList.toggle("is-error", isError);
}

function renderResults(items, emptyMessage) {
  results.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "results-empty";
    empty.textContent = emptyMessage;
    results.append(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("li");
    row.className = "result";
    const name = document.createElement("span");
    name.className = "result-name";
    name.textContent = item.name;
    name.tabIndex = 0;
    name.setAttribute("role", "button");
    name.setAttribute("aria-label", item.name);
    watchCardName(name, () => imageForResult(item));
    name.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.ctrlKey) return;
      startSpawnDrag(item, event);
    });
    name.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      placeNewCard(item, null);
    });
    row.append(name);
    results.append(row);
  }
}

async function lookupSuggestions(query) {
  const token = ++searchToken;
  setSearchStatus("Searching…");
  try {
    const url = new URL(AUTOCOMPLETE_URL);
    url.searchParams.set("q", query);
    const body = await scryfallJson(url);
    if (token !== searchToken) return;
    const items = body.data.slice(0, 15).map((name) => ({ name, card: null }));
    renderResults(items, "No matching cards.");
    setSearchStatus("");
  } catch (error) {
    if (token !== searchToken) return;
    renderResults([], "");
    setSearchStatus(error.message, true);
  }
}

async function runSearch(query) {
  const token = ++searchToken;
  setSearchStatus("Searching…");
  try {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("unique", "cards");
    const body = await scryfallJson(url);
    if (token !== searchToken) return;
    const items = body.data.slice(0, 25).map((card) => {
      rememberCard(card);
      return { name: card.name, card };
    });
    renderResults(items, "No matching cards.");
    setSearchStatus("");
  } catch (error) {
    if (token !== searchToken) return;
    renderResults([], "");
    setSearchStatus(error.message, true);
  }
}

function visibleOrigin(count) {
  const rect = viewport.getBoundingClientRect();
  const slot = count % 6;
  return {
    x: rect.width / 2 - panX - 100 + slot * 26,
    y: rect.height / 2 - panY - 140 + slot * 22,
  };
}

async function loadItemCard(item) {
  if (item.card?.oracle_id) return item.card;
  if (!item.loading) {
    item.loading = (async () => {
      try {
        const url = new URL(SEARCH_URL);
        url.searchParams.set("q", `!"${item.name.replaceAll('"', "")}"`);
        url.searchParams.set("unique", "cards");
        const body = await scryfallJson(url);
        item.card = body.data[0] ?? null;
        if (item.card) rememberCard(item.card);
        return item.card;
      } catch (error) {
        item.loading = null;
        throw error;
      }
    })();
  }
  return item.loading;
}

function createInstance(oracleId, x, y) {
  const instance = {
    instanceId: crypto.randomUUID(),
    oracleId,
    x,
    y,
    categoryId: null,
    stackId: null,
    faceIndex: 0,
    printingId: null,
  };
  state.cards.push(instance);
  return instance;
}

function applyDrop(instance, drop) {
  if (drop.overCommander) {
    const rect = commanderForm.getBoundingClientRect();
    const spot = clientToCanvas(rect.left, rect.bottom + 16);
    instance.x = spot.x;
    instance.y = spot.y;
    assignCommander(instance);
    return;
  }
  if (drop.categoryId) {
    instance.categoryId = drop.categoryId;
    return;
  }
  if (drop.target?.type === "stack") {
    addToStack(instance, drop.target.id);
    return;
  }
  if (drop.target?.type === "card") {
    const anchor = cardById(drop.target.id);
    if (anchor) createStack(anchor, instance);
  }
}

async function placeNewCard(item, drop) {
  try {
    const card = await loadItemCard(item);
    if (!card?.oracle_id) {
      setSearchStatus(`Couldn't load ${item.name}.`, true);
      return;
    }
    const position = drop ?? visibleOrigin(state.cards.length);
    const instance = createInstance(card.oracle_id, position.x, position.y);
    if (drop) applyDrop(instance, drop);
    syncCardPlacement(instance, { categoryId: null, stackId: null, stackMemberIds: [] });
  } catch (error) {
    setSearchStatus(error.message, true);
  }
}

function placeKnownCard(oracleId, drop) {
  const instance = createInstance(oracleId, drop.x, drop.y);
  applyDrop(instance, drop);
  syncCardPlacement(instance, { categoryId: null, stackId: null, stackMemberIds: [] });
}

function createCategory() {
  const slot = state.categories.length;
  state.categories.push({
    id: crypto.randomUUID(),
    name: "Category",
    x: 48 - panX + slot * 28,
    y: 48 - panY + slot * 28,
    display: "names",
  });
  const newCategory = state.categories[state.categories.length - 1];
  world.append(renderCategory(newCategory));
  updateCardCount();
  persistDeck();
  renderCategoryIndex();
  const created = state.categories[state.categories.length - 1];
  const input = elementById("category", created.id)?.querySelector(".category-name");
  input?.focus();
  input?.select();
}

function createNote() {
  const slot = state.notes.length;
  state.notes.push({
    id: crypto.randomUUID(),
    title: "Note",
    body: "",
    x: 80 - panX + slot * 28,
    y: 200 - panY + slot * 28,
    collapsed: false,
  });
  const created = state.notes[state.notes.length - 1];
  world.append(renderNote(created));
  persistDeck();
  const input = elementById("note", created.id)?.querySelector(".note-title");
  input?.focus();
  input?.select();
}

function applyPan() {
  world.style.transform = `translate(${panX}px, ${panY}px)`;
  viewport.style.backgroundPosition = `${panX}px ${panY}px`;
}

function clientToCanvas(clientX, clientY) {
  const rect = drag?.viewportRect ?? viewport.getBoundingClientRect();
  return {
    x: clientX - rect.left - panX,
    y: clientY - rect.top - panY,
  };
}

// Gather everything hit-testing needs once, when a drag starts, so mouse-move
// handling can work from plain numbers instead of re-measuring the page.
function prepareDragCache() {
  if (!drag || drag.viewportRect) return;
  drag.viewportRect = viewport.getBoundingClientRect();
  drag.commanderRect = commanderForm.getBoundingClientRect();
  drag.categoryBoxes = state.categories.map((category) => {
    const element = elementById("category", category.id);
    const rect = element?.getBoundingClientRect();
    return {
      id: category.id,
      left: rect ? rect.left - drag.viewportRect.left - panX : category.x,
      top: rect ? rect.top - drag.viewportRect.top - panY : category.y,
      right: rect ? rect.right - drag.viewportRect.left - panX : category.x + 240,
      bottom: rect ? rect.bottom - drag.viewportRect.top - panY : category.y + CARD_HEIGHT,
    };
  });
}

function categoryAtCanvasPoint(x, y) {
  if (!drag?.categoryBoxes) return null;
  for (let index = drag.categoryBoxes.length - 1; index >= 0; index -= 1) {
    const box = drag.categoryBoxes[index];
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return box.id;
  }
  return null;
}

function dropTargetAtCanvasPoint(x, y, ignoreId) {
  for (let index = state.cards.length - 1; index >= 0; index -= 1) {
    const card = state.cards[index];
    if (card.instanceId === ignoreId || card.categoryId || card.stackId) continue;
    if (x >= card.x && x <= card.x + CARD_WIDTH && y >= card.y && y <= card.y + CARD_HEIGHT) {
      return { type: "card", id: card.instanceId };
    }
  }
  for (let index = state.stacks.length - 1; index >= 0; index -= 1) {
    const stack = state.stacks[index];
    for (let member = stack.cardIds.length - 1; member >= 0; member -= 1) {
      if (stack.cardIds[member] === ignoreId) continue;
      const top = stack.y + member * STACK_OFFSET;
      if (x >= stack.x && x <= stack.x + CARD_WIDTH && y >= top && y <= top + CARD_HEIGHT) {
        return { type: "stack", id: stack.id };
      }
    }
  }
  return null;
}

function commanderAtClientPoint(clientX, clientY) {
  const rect = drag?.commanderRect ?? commanderForm.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function renderBoard() {
  lastDropKey = null;
  world.replaceChildren();
  for (const category of state.categories) {
    world.append(renderCategory(category));
  }
  for (const stack of state.stacks) {
    world.append(renderStack(stack));
  }
  let layer = 2;
  for (const card of state.cards) {
    if (card.categoryId || card.stackId) continue;
    const element = renderFreeCard(card);
    element.style.zIndex = String(layer);
    layer += 1;
    world.append(element);
  }
  for (const note of state.notes) {
    world.append(renderNote(note));
  }
  refreshIllegalMarkings();
  updateCardCount();
  persistDeck();
}

function renderStack(stack) {
  const group = document.createElement("div");
  group.className = "stack";
  group.dataset.id = stack.id;
  group.style.left = `${stack.x}px`;
  group.style.top = `${stack.y}px`;
  cardsInStack(stack.id).forEach((card, index) => {
    const element = renderFreeCard(card);
    element.classList.add("in-stack");
    element.style.left = "0px";
    element.style.top = `${index * STACK_OFFSET}px`;
    element.style.zIndex = String(index + 1);
    group.append(element);
  });
  return group;
}

// --- Targeted updates -------------------------------------------------
// Changing one card used to rebuild the whole board. These helpers touch
// only the category, stack, or card that actually changed, and fall back
// to a full renderBoard() if the expected element is not there.

function placementOf(card) {
  if (!card) return { categoryId: null, stackId: null, stackMemberIds: [] };
  return {
    categoryId: card.categoryId ?? null,
    stackId: card.stackId ?? null,
    stackMemberIds: card.stackId ? cardsInStack(card.stackId).map((member) => member.instanceId) : [],
  };
}

function cardElements(cardId) {
  return [...world.querySelectorAll(".free-card, .category-card")].filter(
    (element) => element.dataset.id === cardId,
  );
}

function removeCardElements(cardId) {
  for (const element of cardElements(cardId)) element.remove();
}

function refreshFreeCardLayers() {
  let layer = 2;
  for (const card of state.cards) {
    if (card.categoryId || card.stackId) continue;
    const element = cardElements(card.instanceId).find(
      (item) =>
        item.classList.contains("free-card") &&
        !item.classList.contains("in-stack") &&
        !item.classList.contains("in-category-stack"),
    );
    if (element) element.style.zIndex = String(layer);
    layer += 1;
  }
}

function rerenderCategory(categoryId) {
  const category = categoryById(categoryId);
  if (!category) return;
  const existing = elementById("category", categoryId);
  const fresh = renderCategory(category);
  if (existing) existing.replaceWith(fresh);
  else world.append(fresh);
}

function rerenderStack(stackId) {
  const stack = stackById(stackId);
  if (!stack) return false;
  const existing = elementById("stack", stackId);
  if (existing) {
    existing.replaceWith(renderStack(stack));
    return true;
  }
  for (const memberId of stack.cardIds) {
    const anchor = cardElements(memberId).find(
      (item) =>
        item.classList.contains("free-card") &&
        !item.classList.contains("in-stack") &&
        !item.classList.contains("in-category-stack"),
    );
    if (anchor) {
      anchor.replaceWith(renderStack(stack));
      return true;
    }
  }
  return false;
}

function syncDissolvedStack(stackId, memberIds, excludeId = null) {
  const group = elementById("stack", stackId);
  if (!group) return;
  const remaining = (memberIds ?? [])
    .filter((id) => id !== excludeId)
    .map((id) => cardById(id))
    .filter((card) => card && !card.categoryId && !card.stackId);
  if (remaining.length === 1) group.replaceWith(renderFreeCard(remaining[0]));
  else group.remove();
}

function ensureFreeCardElement(card) {
  const existing = cardElements(card.instanceId).find(
    (item) =>
      item.classList.contains("free-card") &&
      !item.classList.contains("in-stack") &&
      !item.classList.contains("in-category-stack"),
  );
  if (existing) {
    existing.style.left = `${card.x}px`;
    existing.style.top = `${card.y}px`;
    existing.style.transform = "";
    existing.classList.remove("is-dragging", "is-lifted");
    markLegality(existing, card);
    markCommanderCard(existing, card);
    return;
  }
  world.append(renderFreeCard(card));
}

function syncCardPlacement(card, before) {
  if (!card) return;
  const after = placementOf(card);
  if (before.categoryId && before.categoryId !== after.categoryId) rerenderCategory(before.categoryId);
  if (before.stackId && before.stackId !== after.stackId) {
    if (stackById(before.stackId)) rerenderStack(before.stackId);
    else syncDissolvedStack(before.stackId, before.stackMemberIds, card.instanceId);
  }
  if (after.categoryId) {
    if (before.categoryId !== after.categoryId) removeCardElements(card.instanceId);
    rerenderCategory(after.categoryId);
  } else if (after.stackId) {
    if (before.stackId !== after.stackId) {
      removeCardElements(card.instanceId);
      if (!rerenderStack(after.stackId)) {
        renderBoard();
        return;
      }
    } else {
      rerenderStack(after.stackId);
    }
  } else {
    ensureFreeCardElement(card);
  }
  refreshFreeCardLayers();
  refreshIllegalMarkings();
  updateCardCount();
  persistDeck();
  if (state.cards.some((item) => !cardElements(item.instanceId).length)) renderBoard();
}

function updateCardDisplay(card) {
  const display = cardDisplay(card.oracleId, card.faceIndex, card.printingId);
  for (const element of cardElements(card.instanceId)) {
    if (element.classList.contains("category-card")) {
      element.textContent = display.name;
    } else {
      element.replaceChildren();
      if (display.image) {
        const image = document.createElement("img");
        image.src = display.image;
        image.alt = display.name;
        image.draggable = false;
        element.append(image);
      } else {
        const fallback = document.createElement("p");
        fallback.className = "free-card-name";
        fallback.textContent = display.name;
        element.append(fallback);
      }
      element.setAttribute("aria-label", display.name);
    }
    markLegality(element, card);
    markCommanderCard(element, card);
  }
  persistDeck();
}

function renderCategoryIndex() {
  categoryList.replaceChildren();
  if (state.categories.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "category-index-empty";
    cell.textContent = "No categories yet.";
    row.append(cell);
    categoryList.append(row);
    return;
  }

  for (const category of state.categories) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-jump";
    button.textContent = category.name.trim() || "Category";
    button.addEventListener("click", () => focusCategory(category));
    cell.append(button);
    row.append(cell);
    categoryList.append(row);
  }
}

function renderNote(note) {
  const article = document.createElement("article");
  article.className = "note";
  article.dataset.id = note.id;
  article.classList.toggle("is-collapsed", note.collapsed);
  article.style.left = `${note.x}px`;
  article.style.top = `${note.y}px`;

  const bar = document.createElement("div");
  bar.className = "note-bar";
  const grip = document.createElement("span");
  grip.className = "grip";
  grip.tabIndex = 0;
  grip.setAttribute("role", "button");
  grip.setAttribute("aria-label", "Drag note");
  grip.textContent = "⠿";
  const title = document.createElement("input");
  title.className = "note-title";
  title.value = note.title;
  title.setAttribute("aria-label", "Note title");
  title.addEventListener("input", () => {
    note.title = title.value;
    persistDeck();
  });
  title.addEventListener("blur", () => {
    note.title = title.value.trim() || "Note";
    title.value = note.title;
    persistDeck();
  });
  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      title.blur();
    }
  });
  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.className = "note-collapse";
  collapse.textContent = note.collapsed ? "▸" : "▾";
  collapse.setAttribute("aria-expanded", note.collapsed ? "false" : "true");
  collapse.setAttribute("aria-label", note.collapsed ? "Expand note" : "Collapse note");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "note-delete";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Delete note");
  remove.addEventListener("click", () => {
    state.notes = state.notes.filter((item) => item.id !== note.id);
    article.remove();
    persistDeck();
  });
  bar.append(grip, title, collapse, remove);

  const body = document.createElement("textarea");
  body.className = "note-body";
  body.value = note.body;
  body.placeholder = "Write a note";
  body.setAttribute("aria-label", "Note text");
  body.hidden = note.collapsed;
  body.addEventListener("input", () => {
    note.body = body.value;
    persistDeck();
  });
  collapse.addEventListener("click", () => {
    note.collapsed = !note.collapsed;
    body.hidden = note.collapsed;
    article.classList.toggle("is-collapsed", note.collapsed);
    collapse.textContent = note.collapsed ? "▸" : "▾";
    collapse.setAttribute("aria-expanded", note.collapsed ? "false" : "true");
    collapse.setAttribute("aria-label", note.collapsed ? "Expand note" : "Collapse note");
    persistDeck();
  });
  article.append(bar, body);
  return article;
}

function focusCategory(category) {
  panX = 24 - category.x;
  panY = 96 - category.y;
  applyPan();
}

function bringToFront(card) {
  const index = state.cards.indexOf(card);
  if (index < 0 || index === state.cards.length - 1) return;
  state.cards.splice(index, 1);
  state.cards.push(card);
}

function renderFreeCard(card) {
  const display = cardDisplay(card.oracleId, card.faceIndex, card.printingId);
  const article = document.createElement("article");
  article.className = "free-card";
  markLegality(article, card);
  markCommanderCard(article, card);
  article.dataset.id = card.instanceId;
  article.tabIndex = 0;
  article.setAttribute("role", "button");
  article.setAttribute("aria-label", display.name);
  article.style.left = `${card.x}px`;
  article.style.top = `${card.y}px`;
  if (display.image) {
    const image = document.createElement("img");
    image.src = display.image;
    image.alt = display.name;
    image.draggable = false;
    article.append(image);
  } else {
    const fallback = document.createElement("p");
    fallback.className = "free-card-name";
    fallback.textContent = display.name;
    article.append(fallback);
  }
  return article;
}

function renderCategory(category) {
  const article = document.createElement("article");
  article.className = "category";
  article.dataset.id = category.id;
  article.style.left = `${category.x}px`;
  article.style.top = `${category.y}px`;

  const bar = document.createElement("div");
  bar.className = "category-bar";
  const grip = document.createElement("span");
  grip.className = "grip";
  grip.tabIndex = 0;
  grip.setAttribute("role", "button");
  grip.setAttribute("aria-label", "Drag category");
  grip.textContent = "⠿";
  const input = document.createElement("input");
  input.className = "category-name";
  input.value = category.name;
  input.setAttribute("aria-label", "Category name");
  input.addEventListener("input", () => {
    category.name = input.value;
    renderCategoryIndex();
    persistDeck();
  });
  input.addEventListener("blur", () => {
    category.name = input.value.trim() || "Category";
    input.value = category.name;
    renderCategoryIndex();
    persistDeck();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "category-display";
  const stacked = category.display === "stack";
  toggle.textContent = "Stack";
  toggle.setAttribute("aria-pressed", stacked ? "true" : "false");
  toggle.setAttribute("aria-label", "Show cards as a stack");
  toggle.addEventListener("click", () => {
    category.display = category.display === "stack" ? "names" : "stack";
    rerenderCategory(category.id);
    persistDeck();
  });
  const members = state.cards.filter((card) => card.categoryId === category.id);
  const count = document.createElement("span");
  count.className = "category-count";
  count.textContent = members.length === 1 ? "1 card" : `${members.length} cards`;
  bar.append(grip, input, count, toggle);

  article.append(bar, renderCategoryBody(category, members));
  return article;
}

function renderCategoryBody(category, members) {
  if (category.display === "stack" && members.length > 0) {
    const pile = document.createElement("div");
    pile.className = "category-stack";
    pile.style.height = `${(members.length - 1) * STACK_OFFSET + CARD_HEIGHT}px`;
    members.forEach((card, index) => {
      const element = renderFreeCard(card);
      element.classList.add("in-category-stack");
      element.style.left = "0px";
      element.style.top = `${index * STACK_OFFSET}px`;
      element.style.zIndex = String(index + 1);
      pile.append(element);
    });
    return pile;
  }

  const list = document.createElement("ul");
  list.className = "category-cards";
  if (members.length === 0) {
    const hint = document.createElement("li");
    hint.className = "category-hint";
    hint.textContent = "Drop cards here";
    list.append(hint);
    return list;
  }
  for (const card of members) {
    const item = document.createElement("li");
    item.className = "category-card";
    markLegality(item, card);
    item.dataset.id = card.instanceId;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.textContent = cardDisplay(card.oracleId, card.faceIndex, card.printingId).name;
    watchCardName(item, () => {
      const display = cardDisplay(card.oracleId, card.faceIndex, card.printingId);
      return { url: display.image, name: display.name };
    });
    list.append(item);
  }
  return list;
}

function stackById(id) {
  return state.stacks.find((stack) => stack.id === id);
}

function cardsInStack(stackId) {
  const stack = stackById(stackId);
  if (!stack) return [];
  return stack.cardIds.map((id) => cardById(id)).filter(Boolean);
}

function layoutStack(stack) {
  stack.cardIds.forEach((id, index) => {
    const card = cardById(id);
    if (!card) return;
    card.x = stack.x;
    card.y = stack.y + index * STACK_OFFSET;
  });
}

function createStack(back, front) {
  const stack = {
    id: crypto.randomUUID(),
    x: back.x,
    y: back.y,
    cardIds: [back.instanceId, front.instanceId],
  };
  back.stackId = stack.id;
  back.categoryId = null;
  front.stackId = stack.id;
  front.categoryId = null;
  state.stacks.push(stack);
  layoutStack(stack);
}

function addToStack(card, stackId) {
  const stack = stackById(stackId);
  if (!stack) return;
  if (card.stackId && card.stackId !== stackId) detachFromStack(card);
  card.categoryId = null;
  card.stackId = stackId;
  if (!stack.cardIds.includes(card.instanceId)) stack.cardIds.push(card.instanceId);
  layoutStack(stack);
}

function detachFromStack(card) {
  const stack = stackById(card.stackId);
  if (!stack) {
    card.stackId = null;
    return;
  }
  stack.cardIds = stack.cardIds.filter((id) => id !== card.instanceId);
  card.stackId = null;
  if (stack.cardIds.length > 1) {
    layoutStack(stack);
    return;
  }
  const last = cardById(stack.cardIds[0]);
  if (last) {
    last.stackId = null;
    last.x = stack.x;
    last.y = stack.y;
  }
  state.stacks = state.stacks.filter((item) => item.id !== stack.id);
}

function moveStackIntoCategory(stackId, categoryId) {
  for (const card of cardsInStack(stackId)) {
    card.stackId = null;
    card.categoryId = categoryId;
  }
  state.stacks = state.stacks.filter((stack) => stack.id !== stackId);
  elementById("stack", stackId)?.remove();
  rerenderCategory(categoryId);
  refreshFreeCardLayers();
  updateCardCount();
  persistDeck();
}

function moveStack(stack, x, y) {
  if (!stack) return;
  stack.x = x;
  stack.y = y;
  layoutStack(stack);
  const element = drag?.kind === "stack" && drag.id === stack.id ? drag.element : elementById("stack", stack.id);
  if (!element) return;
  element.style.left = `${stack.x}px`;
  element.style.top = `${stack.y}px`;
}

function cardById(id) {
  return state.cards.find((card) => card.instanceId === id);
}

function categoryById(id) {
  return state.categories.find((category) => category.id === id);
}

function noteById(id) {
  return state.notes.find((note) => note.id === id);
}

function elementById(className, id) {
  return [...world.querySelectorAll(`.${className}`)].find((element) => element.dataset.id === id);
}

function categoryAtPoint(clientX, clientY) {
  const elements = [...world.querySelectorAll(".category")];
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    const rect = element.getBoundingClientRect();
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (inside) return element.dataset.id;
  }
  return null;
}

function markDropTarget(categoryId, stackId, cardId) {
  const key = `${categoryId ?? ""}|${stackId ?? ""}|${cardId ?? ""}`;
  if (key === lastDropKey) return;
  lastDropKey = key;
  for (const element of world.querySelectorAll(".category, .stack, .free-card")) {
    const selected =
      (element.classList.contains("category") && element.dataset.id === categoryId) ||
      (element.classList.contains("stack") && element.dataset.id === stackId) ||
      (element.classList.contains("free-card") &&
        !element.classList.contains("in-stack") &&
        element.dataset.id === cardId);
    element.classList.toggle("is-drop-target", selected);
  }
}

function landingTarget(clientX, clientY, ignoreId) {
  const target = dropTargetAtPoint(clientX, clientY, ignoreId);
  if (!target || !drag?.originStackId) return target;
  if (target.type === "stack" && target.id === drag.originStackId) return null;
  if (target.type === "card" && drag.extractIds?.has(target.id)) return null;
  return target;
}

function dropTargetAtPoint(clientX, clientY, ignoreId) {
  const elements = [...world.querySelectorAll(".free-card")].reverse();
  for (const element of elements) {
    if (element.dataset.id === ignoreId) continue;
    const rect = element.getBoundingClientRect();
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (!inside) continue;
    const card = cardById(element.dataset.id);
    if (!card || card.categoryId) continue;
    if (card.stackId) return { type: "stack", id: card.stackId };
    return { type: "card", id: card.instanceId };
  }
  return null;
}

function startSpawnDrag(item, event) {
  hideHoverPreview();
  event.preventDefault();
  drag = {
    kind: "spawn",
    item,
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    offsetX: 100,
    offsetY: 36,
    moved: false,
    lastX: event.clientX,
    lastY: event.clientY,
  };
  holdPointer(event);
  loadItemCard(item).then(() => {
    if (drag?.kind === "spawn" && drag.item === item && drag.shown) {
      showSpawnGhost(item, drag.lastX, drag.lastY);
    }
  });
}

function startCommanderCardDrag(event) {
  if (!commander?.oracleId || !cardDatabase.has(commander.oracleId)) return;
  hideHoverPreview();
  drag = {
    kind: "commander-card",
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    offsetX: 100,
    offsetY: 36,
    moved: false,
    threshold: 8,
    lastX: event.clientX,
    lastY: event.clientY,
  };
}

function showSpawnGhost(item, clientX, clientY) {
  const display = item.card?.oracle_id ? cardDisplay(item.card.oracle_id) : null;
  dragGhost.replaceChildren();
  if (display?.image) {
    const image = document.createElement("img");
    image.src = display.image;
    image.alt = "";
    image.draggable = false;
    dragGhost.append(image);
  } else {
    const fallback = document.createElement("p");
    fallback.className = "free-card-name";
    fallback.textContent = item.name;
    dragGhost.append(fallback);
  }
  dragGhost.hidden = false;
  dragGhost.classList.add("is-juicy");
  moveGhost(clientX, clientY);
  beginCardJuice(dragGhost);
}

function readDrop(clientX, clientY, ignoreId) {
  const overCommander = commanderAtPoint(clientX, clientY);
  const categoryId = overCommander ? null : categoryAtPoint(clientX, clientY);
  const target = categoryId || overCommander ? null : dropTargetAtPoint(clientX, clientY, ignoreId);
  const point = clientToCanvas(clientX - drag.offsetX, clientY - drag.offsetY);
  return { overCommander, categoryId, target, x: point.x, y: point.y };
}

function pointerInside(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function onPointerDown(event) {
  if (event.button !== 0 || event.ctrlKey) return;
  if (event.target.closest(".decklist-bar, .trash-can")) {
    closeCardMenu();
    return;
  }
  if (event.target.closest(".commander")) {
    closeCardMenu();
    startCommanderCardDrag(event);
    return;
  }
  closeCardMenu();
  const row = event.target.closest(".category-card");
  if (row) {
    startCardDrag(row.dataset.id, event, "compact");
    return;
  }
  const free = event.target.closest(".free-card");
  if (free) {
    const card = cardById(free.dataset.id);
    if (card?.categoryId) {
      startCardDrag(card.instanceId, event, "compact");
      return;
    }
    if (card?.stackId) {
      const rect = free.getBoundingClientRect();
      const onRight = event.clientX >= rect.left + rect.width / 2;
      if (onRight) startCardDrag(card.instanceId, event, "extract");
      else startStackDrag(card.stackId, event);
      return;
    }
    startCardDrag(free.dataset.id, event, "free");
    return;
  }
  const note = event.target.closest(".note");
  if (note) {
    if (event.target.closest("input, textarea, button")) return;
    startNoteDrag(note.dataset.id, event);
    return;
  }
  const category = event.target.closest(".category");
  if (category) {
    if (event.target.closest("input, button")) return;
    startCategoryDrag(category.dataset.id, event);
    return;
  }
  startPan(event);
}

function startPan(event) {
  drag = {
    kind: "pan",
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    panX,
    panY,
    moved: false,
  };
  holdPointer(event);
  viewport.classList.add("is-panning");
}

function hideHoverPreview() {
  window.clearTimeout(hoverTimer);
  hoverToken += 1;
  hoverAnchor = null;
  hoverPreview.hidden = true;
  hideLegalityTooltip();
}

const LEGALITY_TOOLTIPS = {
  illegal: {
    icon: "Icons/remove.png",
    text: "This card is not legal in commander",
  },
  "off-color": {
    icon: "Icons/warning.png",
    text: "This card does not match your commander's color identity",
  },
};

function hideLegalityTooltip() {
  window.clearTimeout(legalityTooltipTimer);
  legalityTooltipTarget = null;
  legalityTooltip.hidden = true;
}

function placeLegalityTooltip() {
  if (legalityTooltip.hidden || !legalityTooltipTarget?.isConnected) return;
  const rect = legalityTooltipTarget.getBoundingClientRect();
  const tooltipRect = legalityTooltip.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(rect.left + rect.width / 2 - tooltipRect.width / 2, window.innerWidth - tooltipRect.width - 8),
  );
  let top = rect.top - tooltipRect.height - 10;
  if (top < 8) top = rect.bottom + 10;
  top = Math.max(8, Math.min(top, window.innerHeight - tooltipRect.height - 8));
  legalityTooltip.style.left = `${left}px`;
  legalityTooltip.style.top = `${top}px`;
}

function showLegalityTooltip(element) {
  if (drag) return;
  const legality = element.classList.contains("is-illegal")
    ? "illegal"
    : element.classList.contains("is-off-color")
      ? "off-color"
      : null;
  if (!legality) {
    hideLegalityTooltip();
    return;
  }
  if (legalityTooltipTarget === element && !legalityTooltip.hidden) return;
  window.clearTimeout(legalityTooltipTimer);
  legalityTooltipTarget = element;
  legalityTooltipTimer = window.setTimeout(() => {
    if (legalityTooltipTarget !== element || drag) return;
    const info = LEGALITY_TOOLTIPS[legality];
    legalityTooltipIcon.src = info.icon;
    legalityTooltipText.textContent = info.text;
    legalityTooltip.classList.toggle("is-illegal", legality === "illegal");
    legalityTooltip.classList.toggle("is-off-color", legality === "off-color");
    legalityTooltip.hidden = false;
    placeLegalityTooltip();
  }, 220);
}

world.addEventListener("pointerover", (event) => {
  const target = event.target.closest(".free-card, .category-card");
  if (target) showLegalityTooltip(target);
});

world.addEventListener("pointermove", () => {
  if (!legalityTooltip.hidden) placeLegalityTooltip();
});

world.addEventListener("pointerout", (event) => {
  const target = event.target.closest(".free-card, .category-card");
  if (target && !target.contains(event.relatedTarget)) hideLegalityTooltip();
});

world.addEventListener("pointerdown", hideLegalityTooltip);

world.addEventListener("focusin", (event) => {
  const target = event.target.closest(".free-card, .category-card");
  if (target) showLegalityTooltip(target);
});

world.addEventListener("focusout", hideLegalityTooltip);
window.addEventListener("blur", hideLegalityTooltip);
window.addEventListener("resize", placeLegalityTooltip);

function placeHoverPreview(anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = 200;
  const height = hoverPreview.getBoundingClientRect().height || 280;
  let left = rect.left - width - 16;
  if (left < 8) left = rect.right + 16;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  const maxTop = window.innerHeight - height - 8;
  const top = Math.max(8, Math.min(rect.top, maxTop));
  hoverPreview.style.left = `${left}px`;
  hoverPreview.style.top = `${top}px`;
}

function watchCardName(element, resolveImage) {
  const show = () => {
    window.clearTimeout(hoverTimer);
    const token = ++hoverToken;
    hoverTimer = window.setTimeout(async () => {
      if (token !== hoverToken) return;
      try {
        const image = await resolveImage();
        if (token !== hoverToken || !image?.url) return;
        hoverAnchor = element;
        hoverPreview.src = image.url;
        hoverPreview.alt = image.name;
        hoverPreview.hidden = false;
        placeHoverPreview(element);
        hoverPreview.onload = () => {
          if (!hoverPreview.hidden && hoverAnchor) placeHoverPreview(hoverAnchor);
        };
      } catch {
        if (token === hoverToken) hoverPreview.hidden = true;
      }
    }, 80);
  };
  element.addEventListener("pointerenter", show);
  element.addEventListener("pointerleave", hideHoverPreview);
  element.addEventListener("focus", show);
  element.addEventListener("blur", hideHoverPreview);
}

async function imageForResult(item) {
  const card = await loadItemCard(item);
  if (!card?.oracle_id) return null;
  const display = cardDisplay(card.oracle_id);
  return { url: display.image, name: display.name };
}

function startCardDrag(id, event, mode) {
  const card = cardById(id);
  if (!card) return;
  hideHoverPreview();
  event.preventDefault();
  const point = clientToCanvas(event.clientX, event.clientY);
  drag = {
    kind: "card",
    mode,
    id,
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    offsetX: point.x - card.x,
    offsetY: point.y - card.y,
    moved: false,
  };
  if (mode === "extract") {
    drag.originStackId = card.stackId;
    drag.extractIds = new Set(
      cardsInStack(card.stackId).map((member) => member.instanceId).filter((memberId) => memberId !== id),
    );
  }
  holdPointer(event);
  world.style.zIndex = DRAG_LAYER;
  if (mode === "free" || mode === "extract") {
    const element = elementById("free-card", id);
    drag.element = element;
    drag.startX = card.x;
    drag.startY = card.y;
    element?.classList.add("is-dragging");
    if (element) element.style.zIndex = DRAG_LAYER;
    beginCardJuice(element);
    return;
  }
  elementById("category-card", id)?.classList.add("is-lifted");
  elementById("free-card", id)?.classList.add("is-lifted");
  drag.offsetX = 100;
  drag.offsetY = 36;
  showGhost(card, event.clientX, event.clientY);
}

function showGhost(card, clientX, clientY) {
  const display = cardDisplay(card.oracleId, card.faceIndex, card.printingId);
  dragGhost.replaceChildren();
  if (display.image) {
    const image = document.createElement("img");
    image.src = display.image;
    image.alt = "";
    image.draggable = false;
    dragGhost.append(image);
  } else {
    const fallback = document.createElement("p");
    fallback.className = "free-card-name";
    fallback.textContent = display.name;
    dragGhost.append(fallback);
  }
  dragGhost.hidden = false;
  dragGhost.classList.add("is-juicy");
  moveGhost(clientX, clientY);
  beginCardJuice(dragGhost);
}

function moveGhost(clientX, clientY) {
  dragGhost.style.left = `${clientX - drag.offsetX}px`;
  dragGhost.style.top = `${clientY - drag.offsetY}px`;
}

function startStackDrag(id, event) {
  const stack = stackById(id);
  if (!stack) return;
  hideHoverPreview();
  event.preventDefault();
  const point = clientToCanvas(event.clientX, event.clientY);
  drag = {
    kind: "stack",
    id,
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    offsetX: point.x - stack.x,
    offsetY: point.y - stack.y,
    moved: false,
  };
  holdPointer(event);
  world.style.zIndex = DRAG_LAYER;
  const element = elementById("stack", id);
  drag.element = element;
  drag.startX = stack.x;
  drag.startY = stack.y;
  element?.classList.add("is-dragging");
  if (element) element.style.zIndex = DRAG_LAYER;
  beginCardJuice(element, false);
}

function startNoteDrag(id, event) {
  const note = noteById(id);
  if (!note) return;
  event.preventDefault();
  const point = clientToCanvas(event.clientX, event.clientY);
  drag = {
    kind: "note",
    id,
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    offsetX: point.x - note.x,
    offsetY: point.y - note.y,
    moved: false,
  };
  holdPointer(event);
  world.style.zIndex = DRAG_LAYER;
  drag.element = elementById("note", id);
  drag.element?.classList.add("is-dragging");
}

function beginCardJuice(element, wiggle = true) {
  if (!drag || !element) return;
  drag.noWiggle = !wiggle;
  drag.juiceElement = element;
  drag.juiceX = null;
  drag.moveDx = 0;
  drag.moveDy = 0;
  drag.juiceRot = -2.5;
  drag.juiceSx = 1.08;
  drag.juiceSy = 0.96;
  element.style.transform = "rotate(-2.5deg) scale(1.08, 0.96)";
  if (drag.juicing) return;
  drag.juicing = true;
  const tick = (now) => {
    if (!drag?.juicing) return;
    const visual = drag.juiceElement;
    if (visual && drag.moved) {
      const wobble = drag.noWiggle ? 0 : Math.sin(now / 75) * 1.7;
      visual.style.transform = `translate(${drag.moveDx ?? 0}px, ${drag.moveDy ?? 0}px) rotate(${drag.juiceRot + wobble}deg) scale(${drag.juiceSx}, ${drag.juiceSy})`;
    }
    drag.juiceFrame = requestAnimationFrame(tick);
  };
  drag.juiceFrame = requestAnimationFrame(tick);
}

function nudgeCardJuice(event) {
  if (!drag?.juiceElement || drag.noWiggle) return;
  if (drag.juiceX == null) {
    drag.juiceX = event.clientX;
    drag.juiceY = event.clientY;
    return;
  }
  const dx = event.clientX - drag.juiceX;
  const dy = event.clientY - drag.juiceY;
  drag.juiceX = event.clientX;
  drag.juiceY = event.clientY;
  drag.lean = (drag.lean ?? 0) * 0.5 + dx * 0.5;
  drag.juiceRot = Math.max(-8, Math.min(8, drag.lean / 9));
  const stretch = Math.min(0.08, Math.hypot(dx, dy) / 380);
  drag.juiceSx = 1.05 + stretch;
  drag.juiceSy = 1.03 - stretch * 0.75 + Math.max(-0.03, Math.min(0.03, dy / 500));
}

function endCardJuice() {
  if (!drag) return;
  drag.juicing = false;
  if (drag.juiceFrame) cancelAnimationFrame(drag.juiceFrame);
  drag.juiceFrame = 0;
  const visual = drag.juiceElement;
  dragGhost.classList.remove("is-juicy");
  if (!visual) return;
  visual.classList.remove("is-dragging", "is-juicy");
  const movedByTransform = (drag.moveDx ?? 0) !== 0 || (drag.moveDy ?? 0) !== 0;
  if (!movedByTransform) {
    visual.style.transform = "";
    return;
  }
  // The card was moved by the transform's translate, and the caller is about
  // to write that same distance into left/top. If the whole transform simply
  // cleared (with the settle transition active), the card would briefly get
  // both offsets at once and jump. Strip only the translate now, without a
  // transition, and let just the tilt/scale animate back on the next frame.
  visual.style.transition = "none";
  visual.style.transform = `rotate(${drag.juiceRot ?? 0}deg) scale(${drag.juiceSx ?? 1}, ${drag.juiceSy ?? 1})`;
  visual.getBoundingClientRect();
  visual.style.transition = "";
  requestAnimationFrame(() => {
    if (visual.isConnected) visual.style.transform = "";
  });
}

function startCategoryDrag(id, event) {
  const category = categoryById(id);
  if (!category) return;
  event.preventDefault();
  const point = clientToCanvas(event.clientX, event.clientY);
  drag = {
    kind: "category",
    id,
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    offsetX: point.x - category.x,
    offsetY: point.y - category.y,
    moved: false,
  };
  holdPointer(event);
  world.style.zIndex = DRAG_LAYER;
  drag.element = elementById("category", id);
  drag.element?.classList.add("is-dragging");
}

function holdPointer(event) {
  if (typeof event.pointerId !== "number") return;
  try {
    viewport.setPointerCapture(event.pointerId);
  } catch {
    // The pointer is already gone, so later move events will not be captured.
  }
}

function moveNote(note, x, y) {
  if (!note) return;
  note.x = x;
  note.y = y;
  const element = drag?.kind === "note" && drag.id === note.id ? drag.element : elementById("note", note.id);
  if (!element) return;
  element.style.left = `${note.x}px`;
  element.style.top = `${note.y}px`;
}

function moveCategory(category, x, y) {
  const dx = x - category.x;
  const dy = y - category.y;
  category.x = x;
  category.y = y;
  for (const card of state.cards) {
    if (card.categoryId === category.id) {
      card.x += dx;
      card.y += dy;
    }
  }
  const element =
    drag?.kind === "category" && drag.id === category.id ? drag.element : elementById("category", category.id);
  if (!element) return;
  element.style.left = `${category.x}px`;
  element.style.top = `${category.y}px`;
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  prepareDragCache();
  const distance = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
  if (distance > (drag.threshold ?? 4)) drag.moved = true;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;

  if (drag.kind === "pan") {
    panX = drag.panX + (event.clientX - drag.originX);
    panY = drag.panY + (event.clientY - drag.originY);
    applyPan();
    return;
  }
  if (!drag.moved) return;
  nudgeCardJuice(event);

  if (drag.kind === "spawn" || drag.kind === "commander-card") {
    if (!drag.shown) {
      drag.shown = true;
      world.style.zIndex = DRAG_LAYER;
      if (drag.kind === "commander-card") {
        commanderInput.blur();
        window.getSelection()?.removeAllRanges();
        holdPointer(event);
        showGhost({ oracleId: commander.oracleId, faceIndex: 0 }, event.clientX, event.clientY);
      } else {
        showSpawnGhost(drag.item, event.clientX, event.clientY);
      }
    } else {
      moveGhost(event.clientX, event.clientY);
    }
    const overTrash = trashAtClientPoint(event.clientX, event.clientY);
    markTrashTarget(overTrash);
    const fromCommander = drag.kind === "commander-card";
    const overCommander = !overTrash && !fromCommander && commanderAtClientPoint(event.clientX, event.clientY);
    markCommanderTarget(overCommander);
    const blocked = overTrash || overCommander || (fromCommander && commanderAtClientPoint(event.clientX, event.clientY));
    const hoverPoint = clientToCanvas(event.clientX, event.clientY);
    const categoryId = blocked ? null : categoryAtCanvasPoint(hoverPoint.x, hoverPoint.y);
    const target = blocked || categoryId ? null : dropTargetAtCanvasPoint(hoverPoint.x, hoverPoint.y, null);
    markDropTarget(categoryId, target?.type === "stack" ? target.id : null, target?.type === "card" ? target.id : null);
    return;
  }

  const point = clientToCanvas(event.clientX, event.clientY);
  const nextX = point.x - drag.offsetX;
  const nextY = point.y - drag.offsetY;
  const overTrash = trashAtClientPoint(event.clientX, event.clientY);
  markTrashTarget(overTrash);

  if (drag.kind === "category") {
    moveCategory(categoryById(drag.id), nextX, nextY);
    return;
  }
  if (drag.kind === "note") {
    moveNote(noteById(drag.id), nextX, nextY);
    return;
  }
  if (drag.kind === "stack") {
    const stack = stackById(drag.id);
    if (stack) {
      stack.x = nextX;
      stack.y = nextY;
      layoutStack(stack);
      drag.moveDx = nextX - (drag.startX ?? nextX);
      drag.moveDy = nextY - (drag.startY ?? nextY);
    }
    markDropTarget(overTrash ? null : categoryAtCanvasPoint(point.x, point.y), null, null);
    return;
  }

  if (drag.mode === "extract" && !drag.detached) {
    const card = cardById(drag.id);
    const before = placementOf(card);
    detachFromStack(card);
    drag.detached = true;
    drag.mode = "free";
    card.x = nextX;
    card.y = nextY;
    if (before.stackId) {
      if (stackById(before.stackId)) rerenderStack(before.stackId);
      else syncDissolvedStack(before.stackId, before.stackMemberIds, card.instanceId);
    }
    removeCardElements(card.instanceId);
    const lifted = renderFreeCard(card);
    world.append(lifted);
    refreshFreeCardLayers();
    lifted.classList.add("is-dragging");
    lifted.style.zIndex = DRAG_LAYER;
    drag.element = lifted;
    drag.startX = card.x;
    drag.startY = card.y;
    beginCardJuice(lifted);
    return;
  }

  const overCommander = !overTrash && commanderAtClientPoint(event.clientX, event.clientY);
  markCommanderTarget(overCommander);
  const categoryId = overTrash || overCommander ? null : categoryAtCanvasPoint(point.x, point.y);
  let target = categoryId || overCommander || overTrash ? null : dropTargetAtCanvasPoint(point.x, point.y, drag.id);
  if (target && drag.originStackId) {
    if (target.type === "stack" && target.id === drag.originStackId) target = null;
    if (target.type === "card" && drag.extractIds?.has(target.id)) target = null;
  }
  markDropTarget(categoryId, target?.type === "stack" ? target.id : null, target?.type === "card" ? target.id : null);
  if (drag.mode === "compact") {
    moveGhost(event.clientX, event.clientY);
    return;
  }

  const card = cardById(drag.id);
  card.x = nextX;
  card.y = nextY;
  if (!drag.element?.isConnected) drag.element = elementById("free-card", card.instanceId);
  if (!drag.element) return;
  drag.moveDx = nextX - (drag.startX ?? nextX);
  drag.moveDy = nextY - (drag.startY ?? nextY);
  if (!drag.juiceElement) {
    drag.element.style.transform = `translate(${drag.moveDx}px, ${drag.moveDy}px)`;
  }
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (moveFrame) cancelAnimationFrame(moveFrame);
  moveFrame = 0;
  pendingMove = null;
  endCardJuice();
  const beforeCard = drag.kind === "card" ? cardById(drag.id) : null;
  const beforePlacement = placementOf(beforeCard);
  const distance = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
  if (distance > (drag.threshold ?? 4)) drag.moved = true;
  if (drag.moved && drag.kind !== "spawn" && drag.kind !== "commander-card") settleDrag(event.clientX, event.clientY);

  const current = drag;
  const overTrash = current.moved && trashAtClientPoint(event.clientX, event.clientY);
  const placed = current.moved && !overTrash && (current.kind === "spawn" || current.kind === "commander-card") && pointerInside(viewport, event.clientX, event.clientY)
    ? readDrop(event.clientX, event.clientY, null)
    : null;
  const overCommander = current.kind === "card" && current.moved && !overTrash && commanderAtPoint(event.clientX, event.clientY);
  const categoryId = current.kind === "card" && !overCommander && !overTrash ? categoryAtPoint(event.clientX, event.clientY) : null;
  const target = current.kind === "card" && current.moved && !categoryId && !overCommander && !overTrash
    ? landingTarget(event.clientX, event.clientY, current.id)
    : null;
  drag = null;
  viewport.classList.remove("is-panning");
  world.style.zIndex = "";
  markDropTarget(null);
  markCommanderTarget(false);
  markTrashTarget(false);
  dragGhost.hidden = true;
  if (typeof event.pointerId === "number" && viewport.hasPointerCapture?.(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }

  if (overTrash && trashDraggedItem(current)) return;
  if (current.kind === "spawn") {
    if (!current.moved) placeNewCard(current.item, null);
    else if (placed) placeNewCard(current.item, placed);
    return;
  }
  if (current.kind === "commander-card") {
    if (current.moved && placed && !placed.overCommander) placeKnownCard(commander.oracleId, placed);
    return;
  }
  if (current.kind === "pan") {
    if (!current.moved) setSidebarCollapsed(true);
    return;
  }
  if (current.kind === "category") {
    elementById("category", current.id)?.classList.remove("is-dragging");
    persistDeck();
    return;
  }
  if (current.kind === "note") {
    elementById("note", current.id)?.classList.remove("is-dragging");
    persistDeck();
    return;
  }
  if (current.kind === "stack") {
    const stackCategoryId = current.moved ? categoryAtPoint(event.clientX, event.clientY) : null;
    if (stackCategoryId) moveStackIntoCategory(current.id, stackCategoryId);
    else {
      elementById("stack", current.id)?.classList.remove("is-dragging");
      persistDeck();
    }
    return;
  }
  if (!current.moved) {
    elementById("free-card", current.id)?.classList.remove("is-dragging", "is-lifted");
    elementById("category-card", current.id)?.classList.remove("is-lifted");
    return;
  }

  const card = cardById(current.id);
  if (overCommander) {
    if (card.stackId) detachFromStack(card);
    card.categoryId = null;
    const rect = commanderForm.getBoundingClientRect();
    const spot = clientToCanvas(rect.left, rect.bottom + 16);
    card.x = spot.x;
    card.y = spot.y;
    bringToFront(card);
    assignCommander(card);
  } else if (categoryId) {
    if (card.stackId) detachFromStack(card);
    card.categoryId = categoryId;
  } else {
    card.categoryId = null;
    if (target?.type === "stack") addToStack(card, target.id);
    else if (target?.type === "card") createStack(cardById(target.id), card);
    else bringToFront(card);
  }
  syncCardPlacement(card, beforePlacement);
}

function settleDrag(clientX, clientY) {
  if (drag.kind === "pan") {
    panX = drag.panX + (clientX - drag.originX);
    panY = drag.panY + (clientY - drag.originY);
    applyPan();
    return;
  }
  const point = clientToCanvas(clientX, clientY);
  const nextX = point.x - drag.offsetX;
  const nextY = point.y - drag.offsetY;
  if (drag.kind === "category") {
    moveCategory(categoryById(drag.id), nextX, nextY);
    return;
  }
  if (drag.kind === "note") {
    moveNote(noteById(drag.id), nextX, nextY);
    return;
  }
  if (drag.kind === "stack") {
    moveStack(stackById(drag.id), nextX, nextY);
    return;
  }
  if (drag.kind !== "card") return;
  if (drag.mode === "extract" && !drag.detached) {
    detachFromStack(cardById(drag.id));
    drag.detached = true;
    drag.mode = "free";
  }
  const card = cardById(drag.id);
  card.x = nextX;
  card.y = nextY;
  if (drag.mode === "compact") {
    moveGhost(clientX, clientY);
    return;
  }
  const element = drag.element?.isConnected ? drag.element : elementById("free-card", card.instanceId);
  if (!element) return;
  element.style.left = `${card.x}px`;
  element.style.top = `${card.y}px`;
}

searchInput.addEventListener("input", () => {
  window.clearTimeout(suggestionTimer);
  const query = searchInput.value.trim();
  if (query.length < 2) {
    searchToken += 1;
    renderResults([], query ? "Type at least 2 letters." : "Search for a card, then add it to the canvas.");
    setSearchStatus("");
    return;
  }
  suggestionTimer = window.setTimeout(() => lookupSuggestions(query), 250);
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  window.clearTimeout(suggestionTimer);
  const query = searchInput.value.trim();
  if (!query) return;
  runSearch(query);
});

function setSidebarCollapsed(collapsed) {
  sidebar.classList.toggle("is-collapsed", collapsed);
  sidebarCollapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
  sidebarCollapse.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  sidebarCollapse.textContent = collapsed ? "▾" : "▴";
}

sidebarCollapse.addEventListener("click", () => {
  setSidebarCollapsed(!sidebar.classList.contains("is-collapsed"));
});

searchInput.addEventListener("focus", () => setSidebarCollapsed(false));
searchInput.addEventListener("pointerdown", () => setSidebarCollapsed(false));
searchInput.addEventListener("click", () => setSidebarCollapsed(false));

newCategoryButton.addEventListener("click", createCategory);
newNoteButton.addEventListener("click", createNote);

viewport.addEventListener("pointerdown", onPointerDown);
document.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) {
    onPointerMove(event);
    return;
  }
  // Mouse-move events can arrive faster than the screen refreshes. Keep only
  // the latest one and handle it on the next frame.
  pendingMove = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
  if (moveFrame) return;
  moveFrame = requestAnimationFrame(() => {
    moveFrame = 0;
    const move = pendingMove;
    pendingMove = null;
    if (move) onPointerMove(move);
  });
});
document.addEventListener("pointerup", onPointerUp);
document.addEventListener("pointercancel", onPointerUp);
viewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (event.target.closest(".commander, .decklist-bar, .trash-can, .note")) return;
    closeCardMenu();
    panX -= event.deltaX;
    panY -= event.deltaY;
    applyPan();
  },
  { passive: false },
);

function setCommanderStatus(message, isError = false) {
  commanderStatus.textContent = message;
  commanderStatus.classList.toggle("is-error", isError);
}

async function chooseCommander(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    commander = null;
    commanderPreview.hidden = true;
    commanderPreview.removeAttribute("src");
    commanderPreview.alt = "";
    setCommanderStatus("");
    refreshCommanderDrag();
    return;
  }
  if (commander?.query === trimmed || commander?.name === trimmed) return;
  setCommanderStatus("Looking up…");
  try {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", `!"${trimmed.replaceAll('"', "")}"`);
    url.searchParams.set("unique", "cards");
    const body = await scryfallJson(url);
    const card = body.data[0];
    if (!card?.oracle_id) {
      setCommanderStatus(`Couldn't find ${trimmed}.`, true);
      return;
    }
    rememberCard(card);
    const display = cardDisplay(card.oracle_id);
    commander = { query: trimmed, name: display.fullName, oracleId: card.oracle_id };
    commanderInput.value = display.fullName;
    if (display.image) {
      commanderPreview.src = display.image;
      commanderPreview.alt = display.name;
      commanderPreview.hidden = false;
    } else {
      commanderPreview.hidden = true;
      commanderPreview.removeAttribute("src");
    }
    setCommanderStatus("");
    refreshCommanderDrag();
  } catch (error) {
    setCommanderStatus(error.message, true);
  }
}

commanderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  chooseCommander(commanderInput.value);
});

commanderInput.addEventListener("blur", () => {
  chooseCommander(commanderInput.value);
});

function commanderAtPoint(clientX, clientY) {
  const rect = commanderForm.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function markCommanderTarget(active) {
  if (active === lastCommanderTarget) return;
  lastCommanderTarget = active;
  commanderForm.classList.toggle("is-drop-target", active);
}

function trashAtClientPoint(clientX, clientY) {
  const rect = trashCan.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function markTrashTarget(active) {
  if (active === lastTrashTarget) return;
  lastTrashTarget = active;
  trashCan.classList.toggle("is-drop-target", active);
}

function deleteNote(note) {
  if (!note) return;
  state.notes = state.notes.filter((item) => item.id !== note.id);
  elementById("note", note.id)?.remove();
  persistDeck();
}

function deleteStack(stackId) {
  const stack = stackById(stackId);
  if (!stack) return;
  const memberIds = [...stack.cardIds];
  for (const id of memberIds) {
    const card = cardById(id);
    if (card) {
      card.stackId = null;
      state.cards = state.cards.filter((item) => item.instanceId !== id);
      removeCardElements(id);
    }
  }
  state.stacks = state.stacks.filter((item) => item.id !== stackId);
  elementById("stack", stackId)?.remove();
  refreshFreeCardLayers();
  updateCardCount();
  persistDeck();
}

function deleteCategory(categoryId) {
  const category = categoryById(categoryId);
  if (!category) return;
  const members = state.cards.filter((card) => card.categoryId === categoryId);
  for (const card of members) {
    if (card.stackId) detachFromStack(card);
    state.cards = state.cards.filter((item) => item.instanceId !== card.instanceId);
    removeCardElements(card.instanceId);
  }
  state.categories = state.categories.filter((item) => item.id !== categoryId);
  elementById("category", categoryId)?.remove();
  renderCategoryIndex();
  refreshFreeCardLayers();
  updateCardCount();
  persistDeck();
}

function trashDraggedItem(current) {
  if (current.kind === "card") {
    const card = cardById(current.id);
    if (card) deleteCard(card);
    return true;
  }
  if (current.kind === "stack") {
    deleteStack(current.id);
    return true;
  }
  if (current.kind === "category") {
    deleteCategory(current.id);
    return true;
  }
  if (current.kind === "note") {
    deleteNote(noteById(current.id));
    return true;
  }
  return false;
}

function assignCommander(card) {
  const display = cardDisplay(card.oracleId, card.faceIndex, card.printingId);
  commander = { query: display.fullName, name: display.fullName, oracleId: card.oracleId };
  commanderInput.value = display.fullName;
  if (display.image) {
    commanderPreview.src = display.image;
    commanderPreview.alt = display.name;
    commanderPreview.hidden = false;
  } else {
    commanderPreview.hidden = true;
    commanderPreview.removeAttribute("src");
    commanderPreview.alt = "";
  }
  setCommanderStatus("");
  refreshCommanderDrag();
}

function refreshCommanderDrag() {
  commanderForm.classList.toggle("can-drag", Boolean(commander?.oracleId));
  refreshIllegalMarkings();
  updateCardCount();
  persistDeck();
}

function updateCardCount() {
  const commanderOnCanvas = commander?.oracleId && state.cards.some((card) => card.oracleId === commander.oracleId);
  const total = state.cards.length + (commander?.oracleId && !commanderOnCanvas ? 1 : 0);
  cardCount.textContent = total === 1 ? "1 card" : `${total} cards`;
}

function closeCardMenu() {
  menuCardId = null;
  cardMenu.hidden = true;
}

function openCardMenu(card, clientX, clientY) {
  menuCardId = card.instanceId;
  menuFlip.disabled = !cardDisplay(card.oracleId, card.faceIndex, card.printingId).canFlip;
  cardMenu.hidden = false;
  cardMenu.style.left = `${clientX}px`;
  cardMenu.style.top = `${clientY}px`;
  const rect = cardMenu.getBoundingClientRect();
  const left = Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8));
  const top = Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8));
  cardMenu.style.left = `${left}px`;
  cardMenu.style.top = `${top}px`;
}

function deleteCard(card) {
  const before = placementOf(card);
  if (card.stackId) detachFromStack(card);
  state.cards = state.cards.filter((item) => item.instanceId !== card.instanceId);
  removeCardElements(card.instanceId);
  if (before.categoryId) rerenderCategory(before.categoryId);
  if (before.stackId) {
    if (stackById(before.stackId)) rerenderStack(before.stackId);
    else syncDissolvedStack(before.stackId, before.stackMemberIds, card.instanceId);
  }
  refreshFreeCardLayers();
  updateCardCount();
  persistDeck();
}

function flipCard(card) {
  if (!cardDisplay(card.oracleId, card.faceIndex, card.printingId).canFlip) return;
  const total = flippableFaces(card.oracleId, card.printingId).length;
  card.faceIndex = ((card.faceIndex || 0) + 1) % total;
  updateCardDisplay(card);
}

viewport.addEventListener("contextmenu", (event) => {
  const element = event.target.closest(".free-card, .category-card");
  if (!element) return;
  event.preventDefault();
  const card = cardById(element.dataset.id);
  if (!card) return;
  openCardMenu(card, event.clientX, event.clientY);
});

menuDelete.addEventListener("click", () => {
  const card = cardById(menuCardId);
  closeCardMenu();
  if (card) deleteCard(card);
});

menuFlip.addEventListener("click", () => {
  const card = cardById(menuCardId);
  closeCardMenu();
  if (card) flipCard(card);
});

menuCommander.addEventListener("click", () => {
  const card = cardById(menuCardId);
  closeCardMenu();
  if (card) assignCommander(card);
});

menuCategory.addEventListener("click", () => {
  const card = cardById(menuCardId);
  closeCardMenu();
  if (card) openCategoryPicker(card);
});

menuDetails.addEventListener("click", () => {
  const card = cardById(menuCardId);
  closeCardMenu();
  if (card) openCardDetails(card);
});

function closeCategoryPicker() {
  categoryPickerCardId = null;
  categoryPicker.hidden = true;
}

function addCardToCategory(card, categoryId) {
  if (card.categoryId === categoryId) return;
  const before = placementOf(card);
  if (card.stackId) detachFromStack(card);
  card.categoryId = categoryId;
  syncCardPlacement(card, before);
}

function openCategoryPicker(card) {
  categoryPickerCardId = card.instanceId;
  categoryPickerList.replaceChildren();
  categoryPickerEmpty.hidden = state.categories.length > 0;
  for (const category of state.categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = category.name.trim() || "Category";
    button.addEventListener("click", () => {
      const chosen = cardById(categoryPickerCardId);
      const categoryId = category.id;
      closeCategoryPicker();
      if (chosen) addCardToCategory(chosen, categoryId);
    });
    categoryPickerList.append(button);
  }
  categoryPicker.hidden = false;
  categoryPicker.querySelector(".category-picker-dialog")?.focus();
}

categoryPickerBackdrop.addEventListener("click", closeCategoryPicker);

menuPrinting.addEventListener("click", () => {
  const card = cardById(menuCardId);
  closeCardMenu();
  if (card) openPrintingPicker(card);
});

function closePrintingPicker() {
  printingPickerCardId = null;
  printingPickerToken += 1;
  printingPicker.hidden = true;
}

function closeCardDetails() {
  cardDetailsToken += 1;
  cardDetails.hidden = true;
}

function colorNames(codes) {
  return (codes ?? []).map((code) => COLOR_LABELS.find(([letter]) => letter === code)?.[1] ?? code);
}

function detailRow(list, label, value) {
  if (value === null || value === undefined || value === "") return;
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  list.append(term, description);
}

function renderCardDetails(data, instance) {
  const display = cardDisplay(instance.oracleId, instance.faceIndex, instance.printingId);
  cardDetailsTitle.textContent = data?.name ?? display.fullName;
  if (display.image) {
    cardDetailsImage.src = display.image;
    cardDetailsImage.alt = display.name;
    cardDetailsImage.hidden = false;
    cardDetailsNoImage.hidden = true;
  } else {
    cardDetailsImage.hidden = true;
    cardDetailsImage.removeAttribute("src");
    cardDetailsNoImage.hidden = false;
  }

  cardDetailsBody.replaceChildren();
  const faces = data?.card_faces?.length ? data.card_faces : [data];
  for (const face of faces) {
    if (!face) continue;
    const section = document.createElement("section");
    section.className = "card-details-face";
    if (faces.length > 1) {
      const heading = document.createElement("h3");
      heading.textContent = face.name ?? "";
      section.append(heading);
    }
    if (face.type_line) {
      const type = document.createElement("p");
      type.className = "card-details-type";
      type.textContent = face.type_line;
      section.append(type);
    }
    if (face.oracle_text) {
      const text = document.createElement("p");
      text.className = "card-details-text";
      text.textContent = face.oracle_text;
      section.append(text);
    }
    const faceList = document.createElement("dl");
    faceList.className = "card-details-list";
    detailRow(faceList, "Mana cost", face.mana_cost);
    if (face.power !== undefined && face.toughness !== undefined) {
      detailRow(faceList, "Power / Toughness", `${face.power} / ${face.toughness}`);
    }
    if (face.loyalty !== undefined) detailRow(faceList, "Loyalty", face.loyalty);
    if (face.defense !== undefined) detailRow(faceList, "Defense", face.defense);
    if (faceList.childElementCount) section.append(faceList);
    cardDetailsBody.append(section);
  }

  const list = document.createElement("dl");
  list.className = "card-details-list";
  if (data) {
    if (data.power !== undefined && data.toughness !== undefined && !data.card_faces?.length) {
      detailRow(list, "Power / Toughness", `${data.power} / ${data.toughness}`);
    }
    if (data.loyalty !== undefined && !data.card_faces?.length) detailRow(list, "Loyalty", data.loyalty);
    if (data.defense !== undefined && !data.card_faces?.length) detailRow(list, "Defense", data.defense);
    detailRow(list, "Mana value", data.cmc !== null && data.cmc !== undefined ? String(data.cmc) : "");
    const colors = colorNames(data.colors?.length ? data.colors : cardColorsOf(data));
    detailRow(list, "Colors", colors.join(", "));
    const identity = colorNames(data.color_identity);
    detailRow(list, "Color identity", identity.length ? identity.join(", ") : "Colorless");
    detailRow(list, "Rarity", data.rarity ? data.rarity[0].toUpperCase() + data.rarity.slice(1) : "");
    const set = data.set_name
      ? `${data.set_name}${data.set ? ` (${data.set.toUpperCase()})` : ""}${data.collector_number ? ` #${data.collector_number}` : ""}`
      : "";
    detailRow(list, "Set", set);
    detailRow(list, "Artist", data.artist);
    const legality = data.legalities?.commander;
    detailRow(list, "Commander", legality ? (legality === "legal" ? "Legal" : legality[0].toUpperCase() + legality.slice(1)) : "");
  }
  if (list.childElementCount) cardDetailsBody.append(list);
}

// Older saved decks only kept a few fields per card. If the details are not
// there yet, fetch the full card from Scryfall and remember it for next time.
function hasCardDetails(data) {
  return Boolean(data && (data.oracle_text !== undefined || data.card_faces?.length));
}

async function loadFullCard(instance) {
  const printing = instance.printingId ? printingDatabase.get(instance.printingId) : null;
  const printingId = printing?.id || cardDatabase.get(instance.oracleId)?.id;
  let raw = null;
  if (printingId) {
    raw = await scryfallJson(new URL(`https://api.scryfall.com/cards/${printingId}`));
  } else {
    const body = await scryfallJson(new URL(SEARCH_URL + `?q=oracleid:${instance.oracleId}`));
    raw = body.data?.[0] ?? null;
  }
  if (!raw?.oracle_id) return null;
  const trimmed = trimCard(raw);
  if (instance.printingId) printingDatabase.set(trimmed.id, trimmed);
  cardDatabase.set(trimmed.oracle_id, { ...cardDatabase.get(trimmed.oracle_id), ...trimmed });
  persistDeck();
  return instance.printingId ? printingDatabase.get(instance.printingId) : cardDatabase.get(instance.oracleId);
}

async function openCardDetails(instance) {
  closeCardMenu();
  hideHoverPreview();
  const token = ++cardDetailsToken;
  const printing = instance.printingId ? printingDatabase.get(instance.printingId) : null;
  let data = printing ?? cardDatabase.get(instance.oracleId) ?? null;
  renderCardDetails(data, instance);
  cardDetailsStatus.textContent = hasCardDetails(data) ? "" : "Loading details…";
  cardDetails.hidden = false;
  cardDetails.querySelector(".card-details-dialog")?.focus();
  if (hasCardDetails(data)) return;
  try {
    const full = await loadFullCard(instance);
    if (token !== cardDetailsToken || cardDetails.hidden || !full) return;
    data = full;
    renderCardDetails(data, instance);
    cardDetailsStatus.textContent = "";
  } catch {
    if (token === cardDetailsToken) cardDetailsStatus.textContent = "Couldn't load the full details.";
  }
}

cardDetailsBackdrop.addEventListener("click", closeCardDetails);
cardDetailsClose.addEventListener("click", closeCardDetails);

async function fetchPrintings(oracleId) {
  const found = [];
  let url = new URL(SEARCH_URL);
  url.searchParams.set("q", `oracleid:${oracleId}`);
  url.searchParams.set("unique", "prints");
  url.searchParams.set("order", "released");
  while (url) {
    const body = await scryfallJson(url);
    found.push(...(body.data ?? []));
    url = body.has_more && body.next_page ? new URL(body.next_page) : null;
  }
  return found;
}

async function openPrintingPicker(card) {
  printingPickerCardId = card.instanceId;
  const token = ++printingPickerToken;
  printingPickerList.replaceChildren();
  printingPickerStatus.textContent = "Loading printings…";
  printingPicker.hidden = false;
  printingPicker.querySelector(".category-picker-dialog")?.focus();
  try {
    const printings = await fetchPrintings(card.oracleId);
    if (token !== printingPickerToken || printingPicker.hidden) return;
    const currentId = cardById(printingPickerCardId)?.printingId || cardDatabase.get(card.oracleId)?.id || "";
    printingPickerStatus.textContent = printings.length ? "" : "No printings found.";
    for (const printing of printings) {
      if (!printing.id) continue;
      printingDatabase.set(printing.id, trimCard(printing));
      const button = document.createElement("button");
      button.type = "button";
      const setName = printing.set_name || printing.set || "Unknown set";
      const setCode = printing.set ? ` (${printing.set.toUpperCase()})` : "";
      const number = printing.collector_number ? ` #${printing.collector_number}` : "";
      button.textContent = `${setName}${setCode}${number}${printing.id === currentId ? " · current" : ""}`;
      if (printing.id === currentId) button.classList.add("is-current");
      button.addEventListener("click", () => {
        const chosen = cardById(printingPickerCardId);
        const printingId = printing.id;
        closePrintingPicker();
        if (!chosen) return;
        chosen.printingId = printingId;
        updateCardDisplay(chosen);
      });
      printingPickerList.append(button);
    }
  } catch (error) {
    if (token !== printingPickerToken) return;
    printingPickerStatus.textContent = error.message;
  }
}

printingPickerBackdrop.addEventListener("click", closePrintingPicker);

document.addEventListener("pointerdown", (event) => {
  if (cardMenu.hidden || event.target.closest("#card-menu")) return;
  closeCardMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!cardDetails.hidden) {
    closeCardDetails();
    return;
  }
  if (!printingPicker.hidden) {
    closePrintingPicker();
    return;
  }
  if (!categoryPicker.hidden) {
    closeCategoryPicker();
    return;
  }
  closeCardMenu();
});

results.addEventListener("scroll", hideHoverPreview);

function setDecklistStatus(message, isError = false) {
  decklistStatus.textContent = message;
  decklistStatus.classList.toggle("is-error", isError);
}

function persistDeck() {
  if (!deckReady) return;
  persistPending = true;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = 0;
    persistDeckNow();
  }, 250);
}

function flushPersist() {
  if (!persistPending) return;
  window.clearTimeout(persistTimer);
  persistTimer = 0;
  persistDeckNow();
}

function persistDeckNow() {
  persistPending = false;
  if (!deckReady) return;
  const cardsByOracle = {};
  cardDatabase.forEach((card, id) => {
    cardsByOracle[id] = card;
  });
  const printingsById = {};
  printingDatabase.forEach((printing, id) => {
    printingsById[id] = printing;
  });
  saveDeckState({
    cards: state.cards,
    categories: state.categories,
    stacks: state.stacks,
    notes: state.notes,
    commander,
    cardsByOracle,
    printingsById,
  });
}

function restoreDeck() {
  const saved = loadDeckState();
  if (!saved) return false;
  state.cards = saved.cards ?? [];
  state.categories = saved.categories ?? [];
  state.stacks = saved.stacks ?? [];
  state.notes = saved.notes ?? [];
  commander = saved.commander ?? null;
  cardDatabase.clear();
  for (const [id, card] of Object.entries(saved.cardsByOracle ?? {})) {
    cardDatabase.set(id, card);
  }
  printingDatabase.clear();
  for (const [id, printing] of Object.entries(saved.printingsById ?? {})) {
    printingDatabase.set(id, printing);
  }
  if (commander?.name) {
    commanderInput.value = commander.name;
    const display = cardDisplay(commander.oracleId, 0);
    if (display.image) {
      commanderPreview.src = display.image;
      commanderPreview.alt = display.name;
      commanderPreview.hidden = false;
    }
  }
  renderBoard();
  renderCategoryIndex();
  refreshCommanderDrag();
  return true;
}

function exportDecklist() {
  if (!commander?.name) {
    setDecklistStatus("Set a commander before saving.", true);
    return;
  }
  const counts = new Map();
  for (const card of state.cards) {
    const name = cardDisplay(card.oracleId, card.faceIndex, card.printingId).fullName;
    const category = card.categoryId ? categoryById(card.categoryId)?.name?.trim() ?? "" : "";
    const key = `${name}\0${category}`;
    const entry = counts.get(key) ?? { name, category, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const lines = [...counts.values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.category.localeCompare(b.category))
    .map((entry) => `${entry.count} ${entry.name}${entry.category ? ` ${categoryTag(entry.category)}` : ""}`);
  lines.push("", `1 ${commander.name}`);
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "decklist.txt";
  link.click();
  URL.revokeObjectURL(url);
  setDecklistStatus("");
}

saveDeckButton.addEventListener("click", exportDecklist);

renderResults([], "Search for a card, then add it to the canvas.");
applyPan();
if (!restoreDeck()) renderCategoryIndex();
deckReady = true;

document.querySelector("#nav-stats")?.addEventListener("click", () => {
  flushPersist();
});

window.addEventListener("pagehide", flushPersist);
