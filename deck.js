const viewport = document.querySelector("#viewport");
const world = document.querySelector("#world");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#card-query");
const searchStatus = document.querySelector("#search-status");
const results = document.querySelector("#results");
const newCategoryButton = document.querySelector("#new-category");
const newNoteButton = document.querySelector("#new-note");
const categoryList = document.querySelector("#category-list");
const commanderForm = document.querySelector("#commander-form");
const commanderInput = document.querySelector("#commander-name");
const commanderStatus = document.querySelector("#commander-status");
const commanderPreview = document.querySelector("#commander-preview");
const importDeckButton = document.querySelector("#import-deck");
const decklistFile = document.querySelector("#decklist-file");
const saveDeckButton = document.querySelector("#save-deck");
const decklistStatus = document.querySelector("#decklist-status");
const cardCount = document.querySelector("#card-count");
const dragGhost = document.querySelector("#drag-ghost");
const hoverPreview = document.querySelector("#hover-preview");
const cardMenu = document.querySelector("#card-menu");
const menuDelete = document.querySelector("#menu-delete");
const menuFlip = document.querySelector("#menu-flip");
const menuCommander = document.querySelector("#menu-commander");
const menuCategory = document.querySelector("#menu-category");
const categoryPicker = document.querySelector("#category-picker");
const categoryPickerList = document.querySelector("#category-picker-list");
const categoryPickerEmpty = document.querySelector("#category-picker-empty");
const categoryPickerBackdrop = document.querySelector("#category-picker-backdrop");

const STACK_OFFSET = 30;
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
let drag = null;
let commander = null;
let menuCardId = null;
let categoryPickerCardId = null;
let deckReady = false;

function flippableFaces(oracleId) {
  const card = cardDatabase.get(oracleId);
  const withImages = (card?.card_faces ?? []).filter((face) => face.image_uris?.normal);
  const uniqueUrls = new Set(withImages.map((face) => face.image_uris.normal));
  if (withImages.length > 1 && uniqueUrls.size > 1) return withImages;
  return [];
}

function cardDisplay(oracleId, faceIndex = 0) {
  const card = cardDatabase.get(oracleId);
  if (!card) return { name: "Unknown card", image: null, canFlip: false, fullName: "Unknown card" };
  const faces = flippableFaces(oracleId);
  if (faces.length > 1) {
    const face = faces[((faceIndex % faces.length) + faces.length) % faces.length];
    return { name: face.name, image: face.image_uris.normal, canFlip: true, fullName: card.name };
  }
  const image =
    card.image_uris?.normal ??
    card.card_faces?.find((face) => face.image_uris)?.image_uris.normal ??
    null;
  return { name: card.name, image, canFlip: false, fullName: card.name };
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
    renderBoard();
  } catch (error) {
    setSearchStatus(error.message, true);
  }
}

function placeKnownCard(oracleId, drop) {
  const instance = createInstance(oracleId, drop.x, drop.y);
  applyDrop(instance, drop);
  renderBoard();
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
  renderBoard();
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
  renderBoard();
  const created = state.notes[state.notes.length - 1];
  const input = elementById("note", created.id)?.querySelector(".note-title");
  input?.focus();
  input?.select();
}

function applyPan() {
  world.style.transform = `translate(${panX}px, ${panY}px)`;
  viewport.style.backgroundPosition = `${panX}px ${panY}px`;
}

function clientToCanvas(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: clientX - rect.left - panX,
    y: clientY - rect.top - panY,
  };
}

function renderBoard() {
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
    renderBoard();
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
  const display = cardDisplay(card.oracleId, card.faceIndex);
  const article = document.createElement("article");
  article.className = "free-card";
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
    renderBoard();
  });
  bar.append(grip, input, toggle);

  const members = state.cards.filter((card) => card.categoryId === category.id);
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
    item.dataset.id = card.instanceId;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.textContent = cardDisplay(card.oracleId, card.faceIndex).name;
    watchCardName(item, () => {
      const display = cardDisplay(card.oracleId, card.faceIndex);
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
  renderBoard();
}

function moveStack(stack, x, y) {
  stack.x = x;
  stack.y = y;
  layoutStack(stack);
  const element = elementById("stack", stack.id);
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
  if (event.target.closest(".decklist-bar")) {
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
}

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
  const display = cardDisplay(card.oracleId, card.faceIndex);
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
  element?.classList.add("is-dragging");
  if (element) element.style.zIndex = DRAG_LAYER;
  beginCardJuice(element);
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
  elementById("note", id)?.classList.add("is-dragging");
}

function beginCardJuice(element) {
  if (!drag || !element) return;
  drag.juiceElement = element;
  drag.juiceX = null;
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
      const wobble = Math.sin(now / 75) * 1.7;
      visual.style.transform = `rotate(${drag.juiceRot + wobble}deg) scale(${drag.juiceSx}, ${drag.juiceSy})`;
    }
    drag.juiceFrame = requestAnimationFrame(tick);
  };
  drag.juiceFrame = requestAnimationFrame(tick);
}

function nudgeCardJuice(event) {
  if (!drag?.juiceElement) return;
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
  visual.getBoundingClientRect();
  visual.style.transform = "";
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
  elementById("category", id)?.classList.add("is-dragging");
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
  const element = elementById("note", note.id);
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
  const element = elementById("category", category.id);
  if (!element) return;
  element.style.left = `${category.x}px`;
  element.style.top = `${category.y}px`;
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
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
    const fromCommander = drag.kind === "commander-card";
    const overCommander = !fromCommander && commanderAtPoint(event.clientX, event.clientY);
    markCommanderTarget(overCommander);
    const blocked = overCommander || (fromCommander && commanderAtPoint(event.clientX, event.clientY));
    const categoryId = blocked ? null : categoryAtPoint(event.clientX, event.clientY);
    const target = blocked || categoryId ? null : dropTargetAtPoint(event.clientX, event.clientY, null);
    markDropTarget(categoryId, target?.type === "stack" ? target.id : null, target?.type === "card" ? target.id : null);
    return;
  }

  const point = clientToCanvas(event.clientX, event.clientY);
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
    markDropTarget(categoryAtPoint(event.clientX, event.clientY), null, null);
    return;
  }

  if (drag.mode === "extract" && !drag.detached) {
    const card = cardById(drag.id);
    detachFromStack(card);
    drag.detached = true;
    drag.mode = "free";
    card.x = nextX;
    card.y = nextY;
    renderBoard();
    const lifted = elementById("free-card", card.instanceId);
    lifted?.classList.add("is-dragging");
    if (lifted) lifted.style.zIndex = DRAG_LAYER;
    beginCardJuice(lifted);
    return;
  }

  const overCommander = commanderAtPoint(event.clientX, event.clientY);
  markCommanderTarget(overCommander);
  const categoryId = overCommander ? null : categoryAtPoint(event.clientX, event.clientY);
  const target = categoryId || overCommander ? null : landingTarget(event.clientX, event.clientY, drag.id);
  markDropTarget(categoryId, target?.type === "stack" ? target.id : null, target?.type === "card" ? target.id : null);
  if (drag.mode === "compact") {
    moveGhost(event.clientX, event.clientY);
    return;
  }

  const card = cardById(drag.id);
  card.x = nextX;
  card.y = nextY;
  const element = elementById("free-card", card.instanceId);
  if (!element) return;
  element.style.left = `${card.x}px`;
  element.style.top = `${card.y}px`;
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  endCardJuice();
  const distance = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
  if (distance > (drag.threshold ?? 4)) drag.moved = true;
  if (drag.moved && drag.kind !== "spawn" && drag.kind !== "commander-card") settleDrag(event.clientX, event.clientY);

  const current = drag;
  const placed = current.moved && (current.kind === "spawn" || current.kind === "commander-card") && pointerInside(viewport, event.clientX, event.clientY)
    ? readDrop(event.clientX, event.clientY, null)
    : null;
  const overCommander = current.kind === "card" && current.moved && commanderAtPoint(event.clientX, event.clientY);
  const categoryId = current.kind === "card" && !overCommander ? categoryAtPoint(event.clientX, event.clientY) : null;
  const target = current.kind === "card" && current.moved && !categoryId && !overCommander
    ? landingTarget(event.clientX, event.clientY, current.id)
    : null;
  drag = null;
  viewport.classList.remove("is-panning");
  world.style.zIndex = "";
  markDropTarget(null);
  markCommanderTarget(false);
  dragGhost.hidden = true;
  if (typeof event.pointerId === "number" && viewport.hasPointerCapture?.(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }

  if (current.kind === "spawn") {
    if (!current.moved) placeNewCard(current.item, null);
    else if (placed) placeNewCard(current.item, placed);
    return;
  }
  if (current.kind === "commander-card") {
    if (current.moved && placed && !placed.overCommander) placeKnownCard(commander.oracleId, placed);
    return;
  }
  if (current.kind === "pan") return;
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
  renderBoard();
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
  const element = elementById("free-card", card.instanceId);
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

newCategoryButton.addEventListener("click", createCategory);
newNoteButton.addEventListener("click", createNote);

viewport.addEventListener("pointerdown", onPointerDown);
document.addEventListener("pointermove", onPointerMove);
document.addEventListener("pointerup", onPointerUp);
document.addEventListener("pointercancel", onPointerUp);
viewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (event.target.closest(".commander, .decklist-bar, .note")) return;
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
  commanderForm.classList.toggle("is-drop-target", active);
}

function assignCommander(card) {
  const display = cardDisplay(card.oracleId, card.faceIndex);
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
  menuFlip.disabled = !cardDisplay(card.oracleId, card.faceIndex).canFlip;
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
  if (card.stackId) detachFromStack(card);
  state.cards = state.cards.filter((item) => item.instanceId !== card.instanceId);
  renderBoard();
}

function flipCard(card) {
  if (!cardDisplay(card.oracleId, card.faceIndex).canFlip) return;
  const total = flippableFaces(card.oracleId).length;
  card.faceIndex = ((card.faceIndex || 0) + 1) % total;
  renderBoard();
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

function closeCategoryPicker() {
  categoryPickerCardId = null;
  categoryPicker.hidden = true;
}

function addCardToCategory(card, categoryId) {
  if (card.categoryId === categoryId) return;
  if (card.stackId) detachFromStack(card);
  card.categoryId = categoryId;
  renderBoard();
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

document.addEventListener("pointerdown", (event) => {
  if (cardMenu.hidden || event.target.closest("#card-menu")) return;
  closeCardMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
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
  const cardsByOracle = {};
  cardDatabase.forEach((card, id) => {
    cardsByOracle[id] = card;
  });
  saveDeckState({
    cards: state.cards,
    categories: state.categories,
    stacks: state.stacks,
    notes: state.notes,
    commander,
    cardsByOracle,
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

async function importDecklist(text) {
  const parsed = parseDecklist(text);
  if (parsed.error) {
    setDecklistStatus(parsed.error, true);
    return;
  }
  const names = [...new Set([...parsed.cards.map((entry) => entry.name), parsed.commander.name])];
  const found = new Map();
  try {
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      setDecklistStatus(`Importing ${index + 1} of ${names.length}…`);
      const card = await lookupExact(name);
      if (!card) {
        setDecklistStatus(`Couldn't find ${name}.`, true);
        return;
      }
      rememberCard(card);
      found.set(name.toLowerCase(), card);
    }
  } catch (error) {
    setDecklistStatus(error.message, true);
    return;
  }

  const laid = layoutImportedDeck(parsed, found, viewport.getBoundingClientRect().width, panX, panY);
  state.categories.push(...laid.categories);
  state.cards.push(...laid.cards);
  assignCommander({ oracleId: laid.commanderOracleId, faceIndex: 0 });
  renderBoard();
  renderCategoryIndex();
  const placed = laid.cards.length;
  setDecklistStatus(placed === 1 ? "Imported 1 card." : `Imported ${placed} cards.`);
}

function exportDecklist() {
  if (!commander?.name) {
    setDecklistStatus("Set a commander before saving.", true);
    return;
  }
  const counts = new Map();
  for (const card of state.cards) {
    const name = cardDisplay(card.oracleId, card.faceIndex).fullName;
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

importDeckButton.addEventListener("click", () => {
  decklistFile.click();
});

decklistFile.addEventListener("change", async () => {
  const file = decklistFile.files?.[0];
  decklistFile.value = "";
  if (!file) return;
  try {
    await importDecklist(await file.text());
  } catch (error) {
    setDecklistStatus(error.message, true);
  }
});

saveDeckButton.addEventListener("click", exportDecklist);

renderResults([], "Search for a card, then add it to the canvas.");
applyPan();
if (!restoreDeck()) renderCategoryIndex();
deckReady = true;

document.querySelector("#nav-stats")?.addEventListener("click", () => {
  persistDeck();
});
