MAGIC THE GATHERING (MTG) DECK BUILDING TOOL

This is the plan for this project, which is to build a MTG deck building tool that actually works for me. We'll build this in steps, focusing on my understanding of each step, as I want to use this project as a learning experience.

SCRYFALL SEARCH LINK - https://scryfall.com/search?q=sol+ring

Step 0: Basic Webpage
The basic webpage is simple colors, with a soft off white background with a grid of dots on it to create a texture, and a minimalist navigation bar, with a page title (placeholder is MTG DECKS) anchored to the left (clickable to take home) and the actual navbar anchored right.

Step 1: Scryfall Importer
The first thing to add to the website is a way to import card images from the website Scryfall. Listed above is the link for scryfall, with the search for the card "Sol Ring" entered. The page will have the following components:
    - Card display (displays a Forest by default)
    - Search bar (switches the card display to show the card searched for)
Any time a card needs to be displayed, the page should ping scryfall and pull the cards image from there. (scryfall_forest.html in the Reference folder has the HTML for a card page on scryfall)

PART 2 OF STEP 1
# Deckbuilder Canvas Page

## Layout
- Main panel: a freeform canvas (pannable surface) filling most of the screen.
- Right sidebar: card search bar pinned to the top. Results list below it, each with an "Add" button.

## Cards
- "Add" places the card on the canvas as a free card: shows the full card image (`normal`), draggable anywhere.
- Free cards can be dropped into a category or left on the canvas.

## Categories
- Containers the user can create, rename (e.g. "Lands", "Removal"), and drag around the canvas.
- Cards inside a category render compactly as a text row (card name only, no image).
- Dragging a card into a category converts it to the compact view; dragging it out restores the full image.
- Dragging a category moves its cards with it.

## Behavior rules
- A card belongs to at most one category, or none.
- Drop detection: a card is "in" a category when dropped over its bounds.
- Every card and category stores its own canvas x/y position.

## Data
- Card data follows Scryfall's JSON shape. Store only references in state:
  - cards: `{ instanceId, oracleId, x, y, categoryId | null }`
  - categories: `{ id, name, x, y }`
- Look up display data (name, image) from the card database by `oracleId`.
- Search via the Scryfall API (`/cards/autocomplete`, `/cards/search`); send a User-Agent header and stay under 10 requests/second.

## Edit 1
- Lets make the cards be able to be placed on top of eachother (if you pick up a card and drag it over top another card, it will appear in front of it on the page when dropped)
- Under the "new category" button, make a collapsable table of all the categories on the page, and when you click on a category name it jumps to that category on the page
- A commander field. Allows you to enter a card name for the decks commander, and it then displays that name, and when you hover over the name it will show the card. This will be located in the top left corner of the canvas area.

## NEW FEATURES
- 