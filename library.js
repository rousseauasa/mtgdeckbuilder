var cardDatabase = new Map();

var SEARCH_URL = "https://api.scryfall.com/cards/search";
var AUTOCOMPLETE_URL = "https://api.scryfall.com/cards/autocomplete";
var USER_AGENT = "MTGDecks/0.1 (personal deckbuilder)";
var MIN_REQUEST_GAP_MS = 100;
var DECK_KEY = "mtg-deck";

var CARD_TYPES = ["Creature", "Planeswalker", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Battle", "Kindred", "Tribal"];
var COLOR_LABELS = [
  ["W", "White"],
  ["U", "Blue"],
  ["B", "Black"],
  ["R", "Red"],
  ["G", "Green"],
];

var lastRequestAt = 0;
var requestChain = Promise.resolve();

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

var headers = scryfallHeaders();

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

function trimFace(face) {
  const trimmed = {
    name: face.name,
    type_line: face.type_line || "",
    colors: face.colors || [],
    mana_cost: face.mana_cost || "",
    oracle_text: face.oracle_text || "",
  };
  if (face.power !== undefined) trimmed.power = face.power;
  if (face.toughness !== undefined) trimmed.toughness = face.toughness;
  if (face.loyalty !== undefined) trimmed.loyalty = face.loyalty;
  if (face.defense !== undefined) trimmed.defense = face.defense;
  if (face.image_uris?.normal) trimmed.image_uris = { normal: face.image_uris.normal };
  return trimmed;
}

function trimCard(card) {
  const trimmed = {
    id: card.id || "",
    oracle_id: card.oracle_id,
    name: card.name,
    type_line: card.type_line || "",
    colors: card.colors || [],
    color_identity: card.color_identity || [],
    legalities: card.legalities ? { commander: card.legalities.commander || "" } : {},
    mana_cost: card.mana_cost || "",
    oracle_text: card.oracle_text || "",
    cmc: card.cmc ?? null,
    rarity: card.rarity || "",
    set_name: card.set_name || "",
    set: card.set || "",
    collector_number: card.collector_number || "",
    artist: card.artist || "",
  };
  if (card.power !== undefined) trimmed.power = card.power;
  if (card.toughness !== undefined) trimmed.toughness = card.toughness;
  if (card.loyalty !== undefined) trimmed.loyalty = card.loyalty;
  if (card.defense !== undefined) trimmed.defense = card.defense;
  if (card.image_uris?.normal) trimmed.image_uris = { normal: card.image_uris.normal };
  if (card.card_faces?.length) trimmed.card_faces = card.card_faces.map(trimFace);
  return trimmed;
}

function rememberCard(card) {
  if (card?.oracle_id && !cardDatabase.has(card.oracle_id)) {
    cardDatabase.set(card.oracle_id, trimCard(card));
  }
}

function parseCardLine(rest) {
  const parts = rest.split(/\s+/);
  const tags = [];
  while (parts.length > 0 && /^@[A-Za-z]/.test(parts[parts.length - 1])) {
    tags.unshift(parts.pop());
  }
  const name = parts.join(" ");
  if (!name) return { error: "That file doesn't match the decklist format." };
  let category = null;
  for (const tag of tags) {
    if (!/^@[Cc]_/.test(tag)) return { error: "That file doesn't match the decklist format." };
    if (category) return { error: "That file doesn't match the decklist format." };
    category = tag.slice(3).replaceAll("+", " ").trim();
    if (!category) return { error: "That file doesn't match the decklist format." };
  }
  return { name, category };
}

function categoryTag(name) {
  return `@C_${name.trim().replaceAll(" ", "+")}`;
}

function parseDecklist(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s+(.+)$/);
    if (!match) return { error: "That file doesn't match the decklist format." };
    const count = Number(match[1]);
    if (!Number.isInteger(count) || count < 1 || count > 250) {
      return { error: "That file doesn't match the decklist format." };
    }
    const parsed = parseCardLine(match[2].trim());
    if (parsed.error) return parsed;
    entries.push({ count, name: parsed.name, category: parsed.category });
  }
  if (entries.length === 0) return { error: "That file doesn't match the decklist format." };
  return { cards: entries.slice(0, -1), commander: entries[entries.length - 1] };
}

function canonicalCardName(name) {
  return name.trim().replace(/\s*\/+\s*/g, " // ");
}

function sameCardName(a, b) {
  return canonicalCardName(a).toLowerCase() === canonicalCardName(b).toLowerCase();
}

async function fetchExact(name) {
  try {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", `!"${name.replaceAll('"', "")}"`);
    url.searchParams.set("unique", "cards");
    const body = await scryfallJson(url);
    const card = body.data?.find((entry) => sameCardName(entry.name, name))
      ?? body.data?.find((entry) => entry.card_faces?.some((face) => sameCardName(face.name, name)));
    if (!card?.oracle_id) return null;
    return card;
  } catch (error) {
    if (/no cards found/i.test(error.message)) return null;
    throw error;
  }
}

async function lookupExact(name) {
  const canonical = canonicalCardName(name);
  const card = await fetchExact(canonical);
  if (card || canonical.toLowerCase() === name.trim().toLowerCase()) return card;
  return fetchExact(name.trim());
}

function layoutImportedDeck(parsed, found, width, panX, panY) {
  const cards = [];
  const categories = [];
  const categoriesByName = new Map();
  const ensureCategory = (name) => {
    const key = name.toLowerCase();
    const existing = categoriesByName.get(key);
    if (existing) return existing;
    const category = {
      id: crypto.randomUUID(),
      name,
      x: 24 - panX,
      y: 120 - panY,
      display: "names",
    };
    categories.push(category);
    categoriesByName.set(key, category);
    return category;
  };

  const loose = [];
  for (const entry of parsed.cards) {
    const card = found.get(entry.name.toLowerCase());
    const category = entry.category ? ensureCategory(entry.category) : null;
    for (let copy = 0; copy < entry.count; copy += 1) {
      const instance = {
        instanceId: crypto.randomUUID(),
        oracleId: card.oracle_id,
        x: 0,
        y: 0,
        categoryId: category ? category.id : null,
        stackId: null,
        faceIndex: 0,
        printingId: null,
      };
      cards.push(instance);
      if (!category) loose.push(instance);
    }
  }

  let nextY = 120 - panY;
  categories.forEach((category, index) => {
    category.x = 24 - panX + index * 260;
    category.y = 120 - panY;
    const count = cards.filter((card) => card.categoryId === category.id).length;
    const rows = Math.max(count, 1);
    nextY = Math.max(nextY, category.y + Math.max(112, 72 + rows * 36) + 32);
    for (const card of cards) {
      if (card.categoryId === category.id) {
        card.x = category.x;
        card.y = category.y;
      }
    }
  });

  const columns = Math.max(1, Math.floor((width - 40) / 220));
  loose.forEach((card, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    card.x = 24 - panX + col * 220;
    card.y = (categories.length ? nextY : 120 - panY) + row * 310;
  });

  return {
    cards,
    categories,
    commanderOracleId: found.get(parsed.commander.name.toLowerCase()).oracle_id,
  };
}

function saveDeckState(snapshot) {
  sessionStorage.setItem(DECK_KEY, JSON.stringify(snapshot));
}

function loadDeckState() {
  try {
    const raw = sessionStorage.getItem(DECK_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (!snapshot || !Array.isArray(snapshot.cards)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

function cardTypesOf(card) {
  const line = String(card?.type_line || card?.card_faces?.[0]?.type_line || "");
  const head = line.split(" // ")[0].split("—")[0].split(" - ")[0];
  const words = head.trim().split(/\s+/);
  return CARD_TYPES.filter((type) => words.includes(type));
}

function cardColorsOf(card) {
  const printed = Array.isArray(card?.colors) && card.colors.length
    ? card.colors
    : (card?.card_faces ?? []).flatMap((face) => face.colors ?? []);
  const unique = [...new Set(printed)];
  if (unique.length) return unique;
  return [...new Set(card?.color_identity ?? [])];
}

function deckEntries(snapshot) {
  const byOracle = snapshot.cardsByOracle ?? {};
  const entries = [];
  for (const instance of snapshot.cards ?? []) {
    const card = byOracle[instance.oracleId];
    if (card) entries.push(card);
  }
  const commanderId = snapshot.commander?.oracleId;
  if (commanderId && !entries.some((card) => card.oracle_id === commanderId)) {
    const commander = byOracle[commanderId];
    if (commander) entries.push(commander);
  }
  return entries;
}

function deckStatistics(snapshot) {
  const entries = deckEntries(snapshot);
  const typeCounts = new Map();
  const colorCounts = new Map();
  for (const card of entries) {
    for (const type of cardTypesOf(card)) {
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    }
    const colors = cardColorsOf(card);
    const label = colors.length === 0 ? "Colorless" : colors.length > 1 ? "Multicolor" : COLOR_LABELS.find(([code]) => code === colors[0])?.[1] ?? "Colorless";
    colorCounts.set(label, (colorCounts.get(label) ?? 0) + 1);
  }
  const types = [...typeCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || CARD_TYPES.indexOf(a.label) - CARD_TYPES.indexOf(b.label));
  const colorOrder = [...COLOR_LABELS.map(([, label]) => label), "Multicolor", "Colorless"];
  const colors = colorOrder
    .filter((label) => colorCounts.has(label))
    .map((label) => ({ label, count: colorCounts.get(label) }));
  const commanderCard = snapshot.commander?.oracleId ? snapshot.cardsByOracle?.[snapshot.commander.oracleId] : null;
  return {
    total: entries.length,
    types,
    colors,
    commanderName: snapshot.commander?.name ?? "",
    identity: commanderCard?.color_identity ?? [],
  };
}
