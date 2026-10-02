/* THE NEWS PREVIEW (1 Oct 2026) — the first press on a row reads the story
 * in the column beside the list; a second press on the same row opens it on
 * the newsroom's site, as every press did before. From 1100px only: under it
 * there is no column, and a press opens the story as it always has.
 *
 * The text and the reading come from `news-reader.js`; this file is the
 * panel's half — its handlers (attached to NewsPanel with the
 * `Object.assign(this, …Handlers(this))` idiom the app's splits use) and the
 * column it draws in place of the overview. Loads after news-reader.js and
 * before news.js. */

const NEWS_PREVIEW_MEDIA = "(min-width: 1100px)";

const newsPreviewWide = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(NEWS_PREVIEW_MEDIA).matches;

const newsPreviewHandlers = (panel) => ({
  /* A plain press on a row's link, on a screen with the column: the first one
     previews, a second on the same row is let through to open the story. A
     press with a modifier, or the middle button, always opens it. */
  handlePreviewPress(e, item) {
    if (!item || !item.url || !newsPreviewWide()) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const open = panel.state.preview;
    if (open && open.url === item.url) return;
    e.preventDefault();
    panel.openPreview(item);
  },

  openPreview(item) {
    panel.setState({ preview: item, article: null });
    if (!panel.previewKeyOn) {
      document.addEventListener("keydown", panel.handlePreviewKey, true);
      panel.previewKeyOn = true;
    }
    fetchNewsArticle(item, panel.state.granted).then((article) => {
      if (panel.gone) return;
      const now = panel.state.preview;
      if (now && now.url === item.url) panel.setState({ article });
    });
  },

  closePreview() {
    if (panel.previewKeyOn) {
      document.removeEventListener("keydown", panel.handlePreviewKey, true);
      panel.previewKeyOn = false;
    }
    if (!panel.gone) panel.setState({ preview: null, article: null });
  },

  /* Esc puts the story away before it reaches the handler that closes the
     panel: three layers want the key here and only the capture phase decides
     between listeners that share the document. */
  handlePreviewKey(e) {
    if (e.key !== "Escape" || !panel.state.preview) return;
    e.preventDefault();
    e.stopPropagation();
    panel.closePreview();
  },

  /* Straight out of the click, like every permission ask in this panel. */
  handlePreviewAllow(source) {
    requestNewsOrigin(source.id).then(() => {
      if (panel.gone) return;
      grantedNewsSources().then((granted) => {
        if (panel.gone) return;
        const grew = granted.length > panel.state.granted.length;
        panel.setState({ granted }, () => {
          const item = panel.state.preview;
          if (item) panel.openPreview(item);
        });
        if (grew && panel.props.onSourcesChange) panel.props.onSourcesChange();
      });
    });
  },
});

const NEWS_KIND_NAMES = () => ({
  regulation: msg("news_kind_regulation", "regulation"),
  funds: msg("news_kind_funds", "funds and ETFs"),
  security: msg("news_kind_security", "security"),
  macro: msg("news_kind_macro", "the economy"),
  technology: msg("news_kind_technology", "technology"),
  markets: msg("news_kind_markets", "markets and trading"),
  business: msg("news_kind_business", "business"),
  mining: msg("news_kind_mining", "mining"),
});

const newsReadRow = (key, label, value) =>
  React.createElement(
    Fragment,
    { key },
    React.createElement(NewsReadKey, null, label),
    React.createElement(NewsReadValue, { "data-news-read": key }, value),
  );

// What the reading says, one line a fact
const renderNewsReading = (item, reading, coin) => {
  const quiet = (text) => React.createElement(NewsReadQuiet, null, text);
  const names = NEWS_KIND_NAMES();
  const tone = reading.tone || {};
  const toneText =
    tone.tone === "up"
      ? msg("news_read_tone_up", "worded up")
      : tone.tone === "down"
        ? msg("news_read_tone_down", "worded down")
        : tone.tone === "mixed"
          ? msg("news_read_tone_mixed", "mixed wording")
          : null;
  const words = (list) => [...new Set(list)].slice(0, 5).join(", ");
  const rows = [
    newsReadRow(
      "kind",
      msg("news_read_kind", "Reads as"),
      reading.kinds.length
        ? reading.kinds.map((k) => `${names[k.kind] || k.kind} (${k.words.join(", ")})`).join(" · ")
        : quiet(msg("news_read_kind_none", "no one kind of story's words stand out")),
    ),
    newsReadRow(
      "coins",
      msg("news_read_coins", "Coins named"),
      reading.coins.length
        ? reading.coins.map((c) => `${c.coin} ×${c.n}`).join(" · ")
        : quiet(msg("news_read_coins_none", "none of the coins this app follows")),
    ),
    newsReadRow(
      "tone",
      msg("news_read_tone", "Wording"),
      toneText
        ? [
            toneText,
            tone.up && tone.up.length ? ` — ${msg("news_read_up_words", "up: $1", words(tone.up))}` : "",
            tone.down && tone.down.length ? ` — ${msg("news_read_down_words", "down: $1", words(tone.down))}` : "",
          ].join("")
        : quiet(msg("news_read_tone_none", "neither way — no counted word")),
    ),
    newsReadRow(
      "figures",
      msg("news_read_figures", "Figures cited"),
      reading.figures.length ? reading.figures.join(" · ") : quiet(msg("news_read_figures_none", "none")),
    ),
  ];
  if (reading.since) {
    rows.push(
      newsReadRow(
        "since",
        msg("news_read_since", "Since then"),
        msg(
          "news_read_since_line",
          "$1 on the chart moved $2% in the $3 since it was published — the same hours, not a cause",
          coin,
          signedFixed(reading.since.change, 2),
          spanText(reading.since.ms),
        ),
      ),
    );
  }
  rows.push(
    newsReadRow(
      "coverage",
      msg("news_read_coverage", "Coverage"),
      reading.newsrooms > 1
        ? msg("news_read_coverage_n", "$1 newsrooms in this feed ran it", String(reading.newsrooms))
        : quiet(msg("news_read_coverage_one", "this newsroom alone, in this feed")),
    ),
  );
  return React.createElement(NewsReadGrid, null, ...rows);
};

// The article's own text, or why only the summary is here
const renderNewsText = (panel, item, article) => {
  const summary = item.summary ? React.createElement("p", null, item.summary) : null;
  if (!article) {
    return React.createElement(
      "div",
      { "data-news-read-state": "loading", "aria-busy": "true" },
      ...["100%", "96%", "88%", "92%", "60%"].map((w, i) => React.createElement(NewsReadSkeleton, { key: i, w })),
    );
  }
  if (article.state === "read") {
    return React.createElement(
      "div",
      { "data-news-read-state": "read" },
      React.createElement(
        NewsReadText,
        { "data-news-read-text": "" },
        ...article.shown.map((p, i) =>
          p.startsWith("§ ") ? React.createElement("h4", { key: i }, p.slice(2)) : React.createElement("p", { key: i }, p),
        ),
      ),
      React.createElement(
        NewsReadNote,
        null,
        article.shown.length >= article.total
          ? msg("news_read_shown_all", "The whole text, about $1 words, without pictures. The page itself is on $2.", localeNumber(article.words), item.source)
          : msg(
          "news_read_shown",
          "The opening $1 of $2 paragraphs, about $3 words in all, without pictures. The rest is on $4.",
          String(article.shown.length),
          String(article.total),
          localeNumber(article.words),
          item.source,
        ),
      ),
    );
  }
  const why =
    article.state === "ask"
      ? msg("news_read_why_ask", "$1's articles can be read here once it is allowed — the same permission its headlines use.", article.source.name)
      : article.state === "failed"
        ? article.cooling
          ? msg("news_read_why_cooling", "$1 asked this browser to slow down, so it is left alone for a while.", item.source)
          : msg("news_read_why_failed", "The article could not be read just now.")
        : msg("news_read_why_no", "$1 does not let a page outside its own site read its articles, so this is the feed's summary.", item.source);
  return React.createElement(
    "div",
    { "data-news-read-state": article.state },
    summary ? React.createElement(NewsReadText, null, summary) : null,
    React.createElement(NewsReadNote, null, why),
    article.state === "ask"
      ? React.createElement(
          NewsPreviewActions,
          null,
          React.createElement(
            NewsPreviewBtn,
            { onClick: () => panel.handlePreviewAllow(article.source), "data-news-read-allow": article.source.id },
            msg("news_read_allow", "Allow $1", article.source.name),
          ),
        )
      : null,
  );
};

/* The column itself, in place of the overview while a story is open. */
const renderNewsPreview = (panel) => {
  const item = panel.state.preview;
  const article = panel.state.article;
  const { props } = panel;
  const reading = newsReading(item, article, {
    coins: SUGGESTED_COINS,
    coin: props.coin,
    prices: props.prices,
  });
  const kept = Array.isArray(props.saved) ? props.saved.some((s) => s.url === item.url) : false;
  return React.createElement(
    NewsPreview,
    { "data-news-preview": item.url, "aria-label": msg("news_preview_label", "The story, read beside the list") },
    React.createElement(
      NewsPreviewInner,
      null,
      React.createElement(
        NewsPreviewBar,
        null,
        React.createElement(NewsPreviewSource, null, item.source),
        React.createElement("span", null, newsAge(item.time)),
        React.createElement(NewsPreviewSpacer, null),
        React.createElement(
          NewsPreviewBtn,
          {
            onClick: panel.closePreview,
            "aria-label": msg("news_preview_close", "Close the preview (Esc)"),
            title: msg("news_preview_close", "Close the preview (Esc)"),
            "data-news-preview-close": "",
          },
          "×",
        ),
      ),
      React.createElement(NewsPreviewTitle, null, item.title),
      React.createElement(NewsPreviewWhen, null, newsExactTime(item.time).replace(/^\s*·\s*/, "")),
      React.createElement(
        NewsPreviewActions,
        null,
        React.createElement(
          NewsPreviewLink,
          { href: item.url, target: "_blank", rel: "noopener noreferrer", "data-news-preview-open": "" },
          msg("news_preview_open", "Read it on $1 ↗", item.source),
        ),
        typeof props.onToggleSaved === "function"
          ? React.createElement(
              NewsPreviewBtn,
              { onClick: () => props.onToggleSaved(item), "aria-pressed": kept ? "true" : "false" },
              icon(kept ? "bookmarkOn" : "bookmark", 0.9, 2),
              kept ? msg("news_preview_saved", "Saved") : msg("news_preview_save", "Save"),
            )
          : null,
      ),
      React.createElement(
        NewsPreviewSection,
        { "data-news-reading": reading.full ? "article" : "summary" },
        React.createElement(NewsAsideLabel, null, msg("news_read_head", "A reading — counted, not judged")),
        renderNewsReading(item, reading, props.coin),
        React.createElement(
          NewsReadNote,
          null,
          reading.full
            ? msg("news_read_from_article", "Counted from the article's own words. Nothing here says what a price will do.")
            : msg("news_read_from_summary", "Counted from the headline and summary only. Nothing here says what a price will do."),
        ),
      ),
      reading.sentences.length
        ? React.createElement(
            NewsPreviewSection,
            { "data-news-sentences": String(reading.sentences.length) },
            React.createElement(NewsAsideLabel, null, msg("news_read_sentences", "Its own sentences, the most repeated words")),
            ...reading.sentences.map((s, i) => React.createElement(NewsReadSentence, { key: i }, s)),
          )
        : null,
      React.createElement(
        NewsPreviewSection,
        null,
        React.createElement(
          NewsAsideLabel,
          null,
          article && article.state !== "read" ? msg("news_read_text_feed", "From the feed") : msg("news_read_text", "From the article"),
        ),
        renderNewsText(panel, item, article),
      ),
    ),
  );
};
