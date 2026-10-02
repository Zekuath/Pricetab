# PriceTab Privacy Policy

Last updated: October 1, 2026

PriceTab has no user account, advertising, analytics, or telemetry. The
developer does not operate a server that receives your portfolio, settings, or
activity.

## Data stored on your device

PriceTab stores its settings and feature data in browser storage. Depending on
the features you use, this can include:

- selected coins, currencies, display settings, and cached public market data;
- portfolio entries, transaction history, target allocations, and watched
  public blockchain addresses;
- price targets, calls, chart drawings, and Practice Lab activity; and
- news preferences and read status.

This data remains on your device unless you export it. Exported backup, CSV,
image, or report files are saved where you choose and are outside PriceTab's
control. Local extension storage is not encrypted by PriceTab.

## Network requests

PriceTab sends HTTPS requests directly from your browser to third-party public
data services when their related features are used. The providers are:

- Coinbase, Kraken, Coinlore, Alternative.me, OKX, Bybit, mempool.space, and
  Blockchair for market, exchange-rate, index-comparison, derivatives,
  sentiment, or Bitcoin network data;
- mempool.space, Blockchair, and PublicNode for optional public-address
  watching; and
- CNBC, MarketWatch/Dow Jones, Bitcoin.com, CryptoPotato, Algolia's Hacker
  News search, and Blockchair for news available without extra permission.
  Optional news sources are Cointelegraph, Decrypt, CryptoSlate, Bitcoin
  Magazine, CoinJournal, BBC, CoinDesk, and The Block.

Those requests work as follows:

- market prices, charts, exchange rates, derivatives data, sentiment data, and
  transaction-fee estimates are requested from the providers used by the app;
- a watched public blockchain address is sent to the selected blockchain data
  provider so its balance and activity can be retrieved; and
- news feeds are requested from their publishers when you enable or open the
  relevant news source, and the text of a story is requested from its
  publisher when you open that story in the news preview.

PriceTab does not add your portfolio, settings, or other local records to these
requests. As with an ordinary web request, the service operator can receive
network information such as your IP address, user agent, request time, and the
requested market, feed, or public address. Those services are governed by
their own privacy policies.

Tax reference data and the sanctions address list are bundled with the
extension and do not require a lookup request. External websites are contacted
only after you follow a link.

## Permissions

PriceTab requests no required Chrome permissions at installation. It may ask
for these optional permissions only when you enable the related feature:

- `notifications`, to show a price-target notification; and
- access to individual news publisher origins, to load those feeds and the
  stories you open from them.

Optional permissions can be revoked in Chrome's extension settings. A local
notification does not send its contents to the developer.

## Use and sharing

Data handled by PriceTab is used only to provide the feature you requested.
The developer does not sell data, use it for advertising, build user profiles,
or share it with third parties except for the direct provider requests
described above.

PriceTab's use of information received from Google APIs complies with the
Chrome Web Store User Data Policy, including its Limited Use requirements.

## Retention and control

Local feature data remains until you remove it in PriceTab, clear the
extension's storage, or uninstall the extension. Cached public data expires or
is replaced as the app refreshes it. You can export supported records before
removing them.

## The website

The project website (zekuath.github.io/Pricetab) remembers three things in your
browser's local storage, on that device: the theme you chose, the language you
chose, and whether you have seen its "what's new" note, with a count of visits
that decides when the note appears. It sets no cookie, has no analytics, and
sends none of this anywhere. To draw its live chart and price bar it asks
Coinbase and Coinlore for public prices directly from your browser, the same
kind of request the extension makes. Clearing the site's data in your browser
removes what it remembered.

## Changes and contact

Material changes will be reflected here and in the extension's release notes.
Questions can be submitted through the repository's issue tracker.
