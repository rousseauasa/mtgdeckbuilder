## VERSION 1.2.x
This is a huge overhaul to the existing site. Under each incremented version below is a list of features that version will add.

## v1.2.0
- Stats button, that will open a new stats page for the current deck. This page displays information (with graphs) including:
    - Card types (how many cards there are of each type, i.e. instants, creatures, etc.)
    - Card colors
    - Commander Color identity
- The site will now open to a homepage rather than straight to the deck editor. On this homepage, there will be a large box in the middle to upload a decklist, either by dragging and dropping or clicking a button to browse. As the decklist is being scanned, a visual will appear of an outline of a circle slowly being filled until 100% of the cards are imported, similar to how the charging looks on an Apple watch. The site will then say "deck loaded", before proceeding to the deck editor page we already have.

## v1.2.0.1
- Add note cards to the deck editor, so I can add little cards with a title and body text to them. Make these collapsable too so it would just say the title when collapsed.
- Also, add a little bit of juicy animations to the cards when they get picked up and dragged around. I'm thinking a little scaling, maybe some squishing and wiggling.

## v1.2.0.2
- Update to the home page, above the import deck box is a "NEW DECK" button to create a blank deck.
- Semantics, update the navbar to say deck instead of decks on the tab that will take you back to the current working deck.

## v1.2.0.3
- Add a drop shadow representing where a card will be when its put down to allow for more precice placement.
- Remove wiggle animation from stacks when they're being dragged around the screen, but keep the pickup and put down animations
- Put a red outline around any cards that are added to the canvas if they don't fit in the commander's color identity to indicate that they aren't legal in the deck
- Use the same red border for a card that is not legal in commander

## v1.2.0.4
- Remove that drop shadow, I don't like how it looks
- Lets make that red outline be fitted around the card (match the corner roundedness)
- Lets add to the illegal card feature. Add the following features to it:
    - Add a red tint to the card image as well as the outline for a card thats illegal
    - Make both the outline and the tint a yellow color for a card that doesn't fit the colors, keeping red for illegal cards

## v1.2.0.5
- Lets add a feature to the categories where it will say how many cards are in the category at the top
- Lets also make the sidebar on the right with the card searching feature, adding categories/notes, and sorting your categories collapsable.
    - The search bar should stay, and on its right side should now be an arrow button to collapse the sidebar.

## v1.2.0.6
- Edits to the collapsing feature for the sidebar
    - Make the searchbar be visible even when the sidebar is collapsed
    - Clicking into the search bar should open the sidebar
    - The collapse button should be on the right side of the search bar, and should just be an arrow pointing down when the sidebar is open and up when the sidebar is collapsed

## v1.2.0.7
- Card printing switcher:
    - New option on the right click menu
    - Opens a popup with a list of all the sets a card was printed in
    - When you click on an entry in the list, the cards image will switch to its printing from that set
- Make the delete card text option on the right click menu red

## v1.2.1
- Lets make it so if you click on the empty canvas off of the sidebar for searching cards, managing categories, etc., it hides the sidebar.
- Lets also switch the direction of the arrows on the collapse button, so it points up when the sidebar is open and down when it is collapsed.

## v1.2.2
- For cards that do not fit the commanders color identity, add the warning icon (Icons/warning.png) to the middle of the card, overlayed on top. Make sure its reasonably sized in the card so as to not cover up too much of its content.
- Do the same thing for with (Icons/remove.png) for illegal cards
- New page, located on the far right side of the nav bar, Credits. Read (Reference/credits.md), and display these credits in an aesthetic way on the page.
- Remove the import button from the navbar, we don't need it anymore since the homepage has an import tool
- Go through all pages and make sure navbar is consistent

## v1.2.2.1
- When you hover over an illegal card, a custom aesthetic tooltip popup will appear displaying the Icons/remove.png icon and reading "This card is not legal in commander"
- When you hover over a card that doesn't match with the commander's color identity, the same popup will appear but this time showing Icons/warning.png and reading "This card does not match your commander's color identity"

## v1.2.3
- Add the Icons/crown.png icon to the commander card if it's on the board, just above the card in the middle.