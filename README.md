# Verse Screen

Listens to the preacher, spots Bible references, and shows the verse on a second screen.

## Files
    index.html          operator page (listening, detected verses, controls)
    notes.html          service notes: everything said, saved and editable
    store.js            saves and exports the notes
    display.html        the clean screen for the projector
    parser.js           finds verse references in speech
    api/verse.js        fetches verse text
    api/translations.js lists the translations you can use
    lib/books.js        book codes shared by the two functions

Keep the `api` and `lib` folders exactly as named.

## Deploy
1. Push this folder to GitHub.
2. On vercel.com: Add New > Project > import the repo > Deploy.
3. Open your Vercel link in Chrome or Edge.

## Using it in church
1. Click "Open display window". Drag that window to the projector and press F11.
2. Click "Start listening". The wave bars move when the mic hears sound.
3. Detected verses appear on the right. Click "Show" (or press Enter) to put one on screen. Esc clears.
4. Leave "Show detected verses automatically" off until you trust the setup.

The operator page and the display window must be in the same browser on the same computer.
The pill at the top says "Display connected" when they are linked.

## Service notes
Everything said while "Start listening" is on is saved automatically to the notes, with timestamps.
Click "Service notes" at the top of the operator page to open them (the notes page also updates live).

- Speech is grouped into paragraphs wherever the preacher pauses.
- Every verse you put on screen is added to the notes at that moment, with its text and translation.
- Click into any paragraph to fix a mistake. "Key point" marks the important lines; they are listed at the top.
- "Add a note" lets you type your own comment into the timeline.
- Rename the service and add the preacher's name at the top of the page.
- Export: Copy, Markdown, Word, or Print / save as PDF.
- Search finds words across every saved service.
- "New service" on the operator page starts a fresh set of notes.

Where the notes live: in the browser on the church computer (browser storage), not on a server.
Clearing the browser's data deletes them. Use "Download backup" on the notes page now and then,
and "Restore backup" to put them back or move them to another computer.

The browser's speech recognition does not add punctuation, so the notes read as plain paragraphs.

## Adding NIV, NKJV, NLT and other translations
The free built-in translations are KJV, WEB, BBE and OEB. Modern copyrighted translations are licensed,
so they come from API.Bible (run by the American Bible Society).

1. Create a free account at https://scripture.api.bible and make an app. The free Starter plan is for
   non-commercial use and lets you choose up to 3 licensed Bibles (for example NIV, NKJV, NLT).
   Some translations may need approval from the publisher.
2. Copy your API key.
3. In Vercel: Project > Settings > Environment Variables. Add
       BIBLE_API_KEY = your key
4. Redeploy (Deployments > the latest one > Redeploy).
5. Reload the operator page. Every Bible your key can access now appears in the Translation list.

Optional:
- ESV: get a key at https://api.esv.org and add ESV_API_KEY the same way.
- Other languages: add BIBLE_LANGS, for example  eng,yor,hau,ibo  (language codes from API.Bible).

Licensed translations show their copyright line small at the bottom of the screen. Keep it there.
Read each translation's terms for public display and for live streaming.

## Run on your own computer
    npm i -g vercel
    vercel dev
Put the keys in a file called .env.local:
    BIBLE_API_KEY=your-key
