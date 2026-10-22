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

## Edit 2
- When you're dragging a card around, it will be in front of all other elements
- A new way of displaying cards, the STACK
    - A stack is cards will be displayed on top of eachother, offset vertically just enough to read the name of the other card below it
    - These stacks will be able to keep going with as many cards as you want
    - Clicking and dragging on the left side of any card on the stack will move the entire stack, rather than the individual card
    - Clicking and dragging on the right side of any card in the stack will remove that card from the stack, and have you moving it individually on the canvas. The rest of the stack will adjust down for the missing card

## Edit 3
- Right clicking on a card brings up a little edit menu for that card containing:
    - Delete card button
    - Flip card button (greyed out if the card doesn't have a flip side)
    - Make commander button, to assign that card as the commander for the deck
- Can drag a card on the canvas onto the commander spot, making that card the new commander for the deck

## Edit 4
- Categories now have the option to display as stacks within the category instead of as just card names, this is toggleable at the top of each category
- You can click and drag on the commander slot in the top corner to drag the card that is currently the commander onto the canvas
- The "add" button is removed from the adding cards feature, rather just clicking on their name OR clicking and dragging either places it onto the canvas like before or lets you drag it to where you want

## Edit 5
- Add the ability to import and export to decklists (txt files). The format will be a number, which is the card count of that card in the deck, followed by the card name. The very last entry in the list should be the commander. An example decklist is found in the reference folder, called decklist.txt. There should be a save button in the bottom left corner of the canvas that will export the decklist to a txt file. On the navbar will be a new button to import a decklist, which will have you select a decklist txt file, read it, and either put all those cards onto the canvas or give an error message if the txt file doesn't match the format.

## Edit 6
- Lets expand that saving and importing. After the name of a card, it can have tags, which will be the @ sign followed by a letter. The only tag I can think of so far is @C, which will be the category tag, indicating that that card is in a category. The tag will be used like this:
    @C_example+name
Where the + will be replaced with a space when the file is read. The first card in a decklist to have a @C tag with a given name will create that category when loading the list, and subsequent cards that share the category name will go in that existing category. Make the reader/writer able to read and write decklists fine both if there are or aren't categories present.
- Also make it so you can drag an entire stack into a category, and it will seperate out the cards, and add them to that category.
- The default view for categories should be as a stack rather than as a list

## Edit 7
- Decklist reader can read / and // as the same thing for dual/double sided cards
- Add a card counter to the canvas, so you can see how many cards you have in the deck

## Edit 8
- New option to the right click menu, the option to add a card to a category. When clicked, a popup will open (slightly dimming the background) where you click which category you want it to go to, and the card will move into that category.