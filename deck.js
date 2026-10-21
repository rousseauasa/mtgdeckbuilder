const viewport = document.querySelector("#viewport");
const world = document.querySelector("#world");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#card-query");
const searchStatus = document.querySelector("#search-status");
const results = document.querySelector("#results");
const newCategoryButton = document.querySelector("#new-category");
const categoryList = document.querySelector("#category-list");
const commanderForm = document.querySelector("#commander-form");
const commanderInput = document.querySelector("#commander-name");
const commanderStatus = document.querySelector("#commander-status");
const commanderPreview = document.querySelector("#commander-preview");
const dragGhost = document.querySelector("#drag-ghost");
const hoverPreview = document.querySelector("#hover-preview");

const AUTOCOMPLETE_URL = "https://api.scryfall.com/cards/autocomplete";
const SEARCH_URL = "https://api.scryfall.com/cards/search";
const USER_AGENT = "MTGDecks/0.1 (personal deckbuilder)";
const MIN_REQUEST_GAP_MS = 100;

const cardDatabase = new Map();
const state = {
  cards: [],
  categories: [],
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
let lastRequestAt = 0;
let requestChain = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scryfallHeaders() {
  const headers = { Accept: "application/json" };
  try {
    new Headers({ "User-Agent": USER_AGENT });
    headers["User-Agent"] = USER_AGENT;
  } catch {
    // Browsers send their own User-Agent and reject a script-set replacement.
  }
  return headers;
}

const headers = scryfallHeaders();

function scryfallFetch(url) {
  const run = requestChain.then(async () => {
    const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fetch(url, { headers });
  });
  requestChain = run.then(
    () => {},
    () => {},
  );
  return run;
}

async function scryfallJson(url) {
  const response = await scryfallFetch(url);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.details || "Scryfall request failed.");
  }
  return body;
}

function rememberCard(card) {
  if (card?.oracle_id && !cardDatabase.has(card.oracle_id)) {
    cardDatabase.set(card.oracle_id, card);
  }
}

function cardDisplay(oracleId) {
  const card = cardDatabase.get(oracleId);
  if (!card) return { name: "Unknown card", image: null };
  const image =
    card.image_uris?.normal ??
    card.card_faces?.find((face) => face.image_uris)?.image_uris.normal ??
    null;
  return { name: card.name, image };
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
    watchCardName(name, () => imageForResult(item));
    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-card";
    add.textContent = "Add";
    add.setAttribute("aria-label", `Add ${item.name}`);
    add.addEventListener("click", () => addCard(item, add));
    row.append(name, add);
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

async function addCard(item, button) {
  button.disabled = true;
  try {
    let card = item.card;
    if (!card) {
      const url = new URL(SEARCH_URL);
      url.searchParams.set("q", `!"${item.name.replaceAll('"', "")}"`);
      url.searchParams.set("unique", "cards");
      const body = await scryfallJson(url);
      card = body.data[0];
    }
    if (!card?.oracle_id) {
      setSearchStatus(`Couldn't load ${item.name}.`, true);
      return;
    }
    rememberCard(card);
    const position = visibleOrigin(state.cards.length);
    state.cards.push({
      instanceId: crypto.randomUUID(),
      oracleId: card.oracle_id,
      x: position.x,
      y: position.y,
      categoryId: null,
    });
    renderBoard();
  } catch (error) {
    setSearchStatus(error.message, true);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

function createCategory() {
  const slot = state.categories.length;
  state.categories.push({
    id: crypto.randomUUID(),
    name: "Category",
    x: 48 - panX + slot * 28,
    y: 48 - panY + slot * 28,
  });
  renderBoard();
  renderCategoryIndex();
  const created = state.categories[state.categories.length - 1];
  const input = elementById("category", created.id)?.querySelector(".category-name");
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
  let layer = 2;
  for (const card of state.cards) {
    if (card.categoryId) continue;
    const element = renderFreeCard(card);
    element.style.zIndex = String(layer);
    layer += 1;
    world.append(element);
  }
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

function screenRect(x, y, width, height) {
  const origin = viewport.getBoundingClientRect();
  const left = origin.left + panX + x;
  const top = origin.top + panY + y;
  return { left, top, right: left + width, bottom: top + height };
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function overlapsAnotherCard(card) {
  const own = elementById("free-card", card.instanceId);
  const ownRect = own
    ? own.getBoundingClientRect()
    : screenRect(card.x, card.y, 200, dragGhost.offsetHeight || 280);
  return state.cards.some((other) => {
    if (other.instanceId === card.instanceId || other.categoryId) return false;
    const element = elementById("free-card", other.instanceId);
    return element ? rectsOverlap(ownRect, element.getBoundingClientRect()) : false;
  });
}

function renderFreeCard(card) {
  const display = cardDisplay(card.oracleId);
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
  });
  input.addEventListener("blur", () => {
    category.name = input.value.trim() || "Category";
    input.value = category.name;
    renderCategoryIndex();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });
  bar.append(grip, input);

  const list = document.createElement("ul");
  list.className = "category-cards";
  const members = state.cards.filter((card) => card.categoryId === category.id);
  if (members.length === 0) {
    const hint = document.createElement("li");
    hint.className = "category-hint";
    hint.textContent = "Drop cards here";
    list.append(hint);
  } else {
    for (const card of members) {
      const item = document.createElement("li");
      item.className = "category-card";
      item.dataset.id = card.instanceId;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.textContent = cardDisplay(card.oracleId).name;
      watchCardName(item, () => {
        const display = cardDisplay(card.oracleId);
        return { url: display.image, name: display.name };
      });
      list.append(item);
    }
  }

  article.append(bar, list);
  return article;
}

function cardById(id) {
  return state.cards.find((card) => card.instanceId === id);
}

function categoryById(id) {
  return state.categories.find((category) => category.id === id);
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

function markDropTarget(categoryId) {
  for (const element of world.querySelectorAll(".category")) {
    element.classList.toggle("is-drop-target", element.dataset.id === categoryId);
  }
}

function onPointerDown(event) {
  if (event.button !== 0 || event.target.closest(".commander")) return;
  const row = event.target.closest(".category-card");
  if (row) {
    startCardDrag(row.dataset.id, event, "compact");
    return;
  }
  const free = event.target.closest(".free-card");
  if (free) {
    startCardDrag(free.dataset.id, event, "free");
    return;
  }
  const category = event.target.closest(".category");
  if (category) {
    if (event.target.closest("input")) return;
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
  if (!item.card) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", `!"${item.name.replaceAll('"', "")}"`);
    url.searchParams.set("unique", "cards");
    const body = await scryfallJson(url);
    item.card = body.data[0] ?? null;
  }
  if (!item.card?.oracle_id) return null;
  rememberCard(item.card);
  const display = cardDisplay(item.card.oracle_id);
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
  holdPointer(event);
  if (mode === "free") {
    elementById("free-card", id)?.classList.add("is-dragging");
    return;
  }
  elementById("category-card", id)?.classList.add("is-lifted");
  drag.offsetX = 100;
  drag.offsetY = 36;
  showGhost(card, event.clientX, event.clientY);
}

function showGhost(card, clientX, clientY) {
  const display = cardDisplay(card.oracleId);
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
  moveGhost(clientX, clientY);
}

function moveGhost(clientX, clientY) {
  dragGhost.style.left = `${clientX - drag.offsetX}px`;
  dragGhost.style.top = `${clientY - drag.offsetY}px`;
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
  if (distance > 4) drag.moved = true;

  if (drag.kind === "pan") {
    panX = drag.panX + (event.clientX - drag.originX);
    panY = drag.panY + (event.clientY - drag.originY);
    applyPan();
    return;
  }
  if (!drag.moved) return;

  const point = clientToCanvas(event.clientX, event.clientY);
  const nextX = point.x - drag.offsetX;
  const nextY = point.y - drag.offsetY;

  if (drag.kind === "category") {
    moveCategory(categoryById(drag.id), nextX, nextY);
    return;
  }

  markDropTarget(categoryAtPoint(event.clientX, event.clientY));
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
  const distance = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
  if (distance > 4) drag.moved = true;
  if (drag.moved) settleDrag(event.clientX, event.clientY);

  const current = drag;
  drag = null;
  viewport.classList.remove("is-panning");
  markDropTarget(null);
  dragGhost.hidden = true;
  if (typeof event.pointerId === "number" && viewport.hasPointerCapture?.(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }

  if (current.kind === "pan") return;
  if (current.kind === "category") {
    elementById("category", current.id)?.classList.remove("is-dragging");
    return;
  }
  if (!current.moved) {
    elementById("free-card", current.id)?.classList.remove("is-dragging");
    elementById("category-card", current.id)?.classList.remove("is-lifted");
    return;
  }

  const card = cardById(current.id);
  card.categoryId = categoryAtPoint(event.clientX, event.clientY);
  if (!card.categoryId && overlapsAnotherCard(card)) bringToFront(card);
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
  if (drag.kind !== "card") return;
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

viewport.addEventListener("pointerdown", onPointerDown);
viewport.addEventListener("pointermove", onPointerMove);
viewport.addEventListener("pointerup", onPointerUp);
viewport.addEventListener("pointercancel", onPointerUp);
viewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (event.target.closest(".commander")) return;
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
    commander = { query: trimmed, name: display.name, oracleId: card.oracle_id };
    commanderInput.value = display.name;
    if (display.image) {
      commanderPreview.src = display.image;
      commanderPreview.alt = display.name;
      commanderPreview.hidden = false;
    } else {
      commanderPreview.hidden = true;
      commanderPreview.removeAttribute("src");
    }
    setCommanderStatus("");
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

results.addEventListener("scroll", hideHoverPreview);

renderResults([], "Search for a card, then add it to the canvas.");
renderCategoryIndex();
applyPan();
