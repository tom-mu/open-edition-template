# Open Edition, on your own address

One Are.na board, one photographer's site. This is the whole site: one page that
reads your board and lays it out, the same way [openedition.page](https://openedition.page)
does. You host it yourself, on your own domain.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/tom-mu/open-edition-template)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/tom-mu/open-edition-template)

## Three steps

1. **Make your board on Are.na.** Your photographs as image blocks, in the order you
   want them. A text block with a few lines about you and the setting lines below. The
   board must be public or closed, not private.
2. **Press one of the buttons above.** It copies this into your own GitHub account and
   puts it online.
3. **Tell it your board.** Netlify asks for `BOARD` as it sets up: paste your board's
   address (`https://www.are.na/you/your-board`) or just its slug (`your-board-slug`). On
   Cloudflare, add `BOARD` under Settings → Build → Variables and secrets. Or skip the
   variable and change `data-board` in `index.html`.

Then add your domain in your host's settings. Photographs you add to the board show up
on the next visit; nothing needs building again.

## Your board

The settings go in that text block, each on its own line, and are taken out of the text:

```
theme: pairs
name: Jane Doe
role: photographer, Leeds
background: black
```

- `theme`: grid, slideshow, column, pairs, line, rhythm, riffle or salon (or 1–8)
- `name`: the name top left (otherwise your Are.na name)
- `role`: the line under it (otherwise the board's title)
- `background`: black or white (otherwise it follows the visitor's device)

The same can go on the script tag in `index.html`, where they come first:
`data-theme`, `data-name`, `data-role`, `data-background`.

## The build

`build.mjs` runs when your host deploys (`node build.mjs`, nothing to install). It reads
your board once and writes the page's title and link-preview tags, so a link to your
site shows your name and first photograph in a message. If Are.na can't be reached the
page still goes out, just without them.

**BOARD** is read here first; without it, the build uses `data-board` in `index.html`.

**ARENA_TOKEN** is optional: an Are.na personal access token (from your Are.na
settings), so the build's reads count against your account. Use your own token, as an encrypted variable on your host
(Netlify: Site configuration → Environment variables, marked secret; Cloudflare: a
secret build variable). It is only sent to Are.na and never goes in the page. Open
Edition never gives one out.

**SITE_URL** is optional too: your address, for the link preview's `og:url`. Netlify
fills it in itself.

## Without the build

`index.html` works on its own on any static host (GitHub Pages included): put your board
in `data-board` and upload it. You only miss the link-preview tags.

## How it works

`index.html` loads `https://openedition.page/v1/open-edition.js`. The visitor's browser
reads your board from Are.na's public API and shows it. Nothing is stored anywhere else,
and no key is needed. `v1` keeps working as it is; fixes reach it within a day.

To put it on a site you already have (Cargo, Squarespace, Format, plain HTML), you don't
need this repository: make a new page there and paste

```html
<div id="open-edition"></div>
<script src="https://openedition.page/v1/open-edition.js" data-board="your-board-slug" async></script>
```

The portfolio takes over that page, the way it fills a page of its own here. If your
site sets a Content-Security-Policy, it needs to allow scripts and styles from
`https://openedition.page`, `connect-src https://api.are.na`, and images from `https://images.are.na`,
`https://*.are.na`, `https://d2w9rnfcy7mm78.cloudfront.net` and
`https://arena-attachments.s3.amazonaws.com`.
