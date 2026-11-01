# Contributing

Thanks for helping. You don't need to be a developer: reporting a broken site or a better data source is just as valuable.

## Most common: a site stopped being measured
AI sites change their page structure. Each site's rules live in [`extension/src/sites.js`](extension/src/sites.js):
- `assistant` and `user`: CSS selectors for reply and prompt elements. Several can be given; the first that matches is used.
- `modelOf` (optional): reads the model name from the page.

To fix one:
1. Open the site, right-click a reply, choose **Inspect**, and find a stable attribute (`data-*` attributes are best; avoid generated class names).
2. Update `sites.js`, and the matching fake markup in `extension/test/e2e/extension.e2e.js` if it changed.
3. Run the tests (below) and open a pull request with a screenshot of the badge working.

Adding a new site works the same way: add an entry to `sites.js`, then regenerate the manifest matches (a test checks they agree).

## Translations
Each language is one file in `extension/src/locales/`, for example `hi.js` for Hindi. To add one:
1. Copy `en.js` to `<code>.js` and translate the values. Keep `{placeholders}` exactly as they are.
2. Write the comparisons ("Like a ceiling fan running for {time}") the way people would naturally say them, not word for word.
3. For plurals, use the forms your language needs (`one`, `few`, `many`, `other`).
4. Add the file's `<script>` line to the four pages (`popup.html`, `options.html`, `welcome.html`, `share.html`), and add it to the background list in `src/background.js` and `tools/build.js`.
5. Run `npm test`. A test checks that every key and placeholder matches English.

Reviews by native speakers of the existing Hindi and Spanish drafts are very welcome.

## Country data
`extension/src/regions-data.js` (grid carbon intensity and electricity use per person, by country) is generated from Ember data. To refresh it, follow the commands at the top of `extension/tools/build-regions.py`. Don't edit it by hand.

## Tests
```bash
cd dashboard && npm install && npm test
cd ../extension && npm test
npm install && npx playwright install chromium && npm run test:e2e
npm run lint:firefox     # builds dist/firefox and runs Mozilla's add-on validator
```

## Ground rules
- **Privacy is the product.** Never store or send prompt or reply text. Pull requests that add analytics, remote code or broader permissions won't be merged.
- **Numbers need sources.** Changes to coefficients must cite a source in the pull request and update [METHODOLOGY.md](METHODOLOGY.md). Keep the extension and dashboard figures equal (a test checks this).
- **Plain JavaScript, no build step,** so anyone can read exactly what runs.
- **Keep the tone kind.** Nudges should inform, never shame.

By contributing you agree that your contribution is licensed under the Apache License 2.0.
