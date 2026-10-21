const form = document.querySelector("#search-form");
const input = document.querySelector("#card-query");
const image = document.querySelector("#card-image");
const flipButton = document.querySelector("#flip-card");
const caption = document.querySelector("#card-caption");
const status = document.querySelector("#status");

const NAMED_CARD_URL = "https://api.scryfall.com/cards/named";

let requestId = 0;
let faces = [];
let faceIndex = 0;
let setName = "";

function displayFaces(card) {
  const withImages = (card.card_faces ?? []).filter((face) => face.image_uris?.normal);
  const uniqueUrls = new Set(withImages.map((face) => face.image_uris.normal));
  if (withImages.length > 1 && uniqueUrls.size > 1) return withImages;
  if (card.image_uris?.normal) {
    return [{ name: card.name, image_uris: card.image_uris }];
  }
  return withImages;
}

function showFace(index) {
  const face = faces[index];
  faceIndex = index;
  image.src = face.image_uris.normal;
  image.alt = face.name;
  image.hidden = false;

  const set = document.createElement("span");
  set.className = "card-set";
  set.textContent = setName;
  caption.replaceChildren(face.name, set);
  caption.hidden = false;

  const canFlip = faces.length > 1;
  flipButton.hidden = !canFlip;
  if (canFlip) {
    const next = faces[(index + 1) % faces.length];
    flipButton.setAttribute("aria-label", `Flip to ${next.name}`);
  }
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

async function showCard(name) {
  const id = ++requestId;
  setStatus(`Looking up ${name}…`);

  try {
    const url = new URL(NAMED_CARD_URL);
    url.searchParams.set("fuzzy", name);
    const response = await fetch(url);
    const card = await response.json();
    if (id !== requestId) return;

    if (!response.ok) {
      setStatus(card.details || "Scryfall could not find that card.", true);
      return;
    }

    const nextFaces = displayFaces(card);
    if (nextFaces.length === 0) {
      setStatus(`${card.name} has no card image.`, true);
      return;
    }

    faces = nextFaces;
    setName = card.set_name;
    showFace(0);
    faces.forEach((face) => {
      const preload = new Image();
      preload.src = face.image_uris.normal;
    });
    setStatus("");
  } catch {
    if (id !== requestId) return;
    setStatus("Could not reach Scryfall.", true);
  }
}

flipButton.addEventListener("click", () => {
  if (faces.length < 2) return;
  showFace((faceIndex + 1) % faces.length);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;
  showCard(query);
});

showCard("Forest");
