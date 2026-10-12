import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Configuration (long-press the widget → Edit)

/// Which coin the small widget follows. "First on my list" tracks whatever
/// the app's coin list starts with, so the widget changes when the app does.
enum CoinChoice: String, AppEnum {
  case first = "FIRST"
  case btc = "BTC", eth = "ETH", sol = "SOL", xrp = "XRP", bnb = "BNB", ada = "ADA"
  case doge = "DOGE", ltc = "LTC", dot = "DOT", link = "LINK", avax = "AVAX", ton = "TON"

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Coin"
  // A literal: the AppIntents metadata processor reads this at build time.
  static var caseDisplayRepresentations: [CoinChoice: DisplayRepresentation] = [
    .first: "First on my list",
    .btc: "BTC", .eth: "ETH", .sol: "SOL", .xrp: "XRP", .bnb: "BNB", .ada: "ADA",
    .doge: "DOGE", .ltc: "LTC", .dot: "DOT", .link: "LINK", .avax: "AVAX", .ton: "TON",
  ]
}

struct CoinIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "PriceTab"
  static var description = IntentDescription("Which coin the widget shows.")

  @Parameter(title: "Coin", default: .first)
  var coin: CoinChoice
}

// MARK: - Timeline

struct PriceEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot
  let coin: String
  let live: [String: Double]
}

struct Provider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> PriceEntry {
    PriceEntry(date: Date(), snapshot: .placeholder, coin: "BTC", live: [:])
  }

  func snapshot(for configuration: CoinIntent, in context: Context) async -> PriceEntry {
    let snap = WidgetStore.load() ?? .placeholder
    return PriceEntry(date: Date(), snapshot: snap, coin: pick(configuration, snap), live: [:])
  }

  func timeline(for configuration: CoinIntent, in context: Context) async -> Timeline<PriceEntry> {
    let snap = WidgetStore.load() ?? .placeholder
    let coin = pick(configuration, snap)
    // The coins on screen, refreshed live: the chosen one, then the list's
    // first four. Fetched together, each on its own timeout.
    var wanted = [coin]
    for c in snap.coins.prefix(4) where !wanted.contains(c) { wanted.append(c) }
    var live: [String: Double] = [:]
    await withTaskGroup(of: (String, Double?).self) { group in
      for c in wanted {
        group.addTask { (c, await CoinbaseSpot.fetch(coin: c, currency: snap.currency)) }
      }
      for await (c, price) in group { if let price { live[c] = price } }
    }
    let entry = PriceEntry(date: Date(), snapshot: snap, coin: coin, live: live)
    let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
    return Timeline(entries: [entry], policy: .after(next))
  }

  private func pick(_ configuration: CoinIntent, _ snap: WidgetSnapshot) -> String {
    if configuration.coin == .first { return snap.coins.first ?? "BTC" }
    return configuration.coin.rawValue
  }
}

// MARK: - Views

struct PriceTabWidgetEntryView: View {
  @Environment(\.widgetFamily) private var family
  let entry: PriceEntry

  var body: some View {
    switch family {
    case .systemMedium: medium
    case .accessoryRectangular: rectangular
    default: small
    }
  }

  private func price(_ coin: String) -> Double? {
    entry.live[coin] ?? entry.snapshot.prices[coin]?.price
  }

  private func text(_ value: Double?) -> String {
    guard let value else { return "—" }
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.minimumFractionDigits = value >= 1000 ? 0 : 2
    f.maximumFractionDigits = value >= 1000 ? 0 : value >= 1 ? 2 : 4
    return entry.snapshot.symbol + (f.string(from: NSNumber(value: value)) ?? "—")
  }

  private func change(_ coin: String) -> (String, Color)? {
    guard let c = entry.snapshot.prices[coin]?.change else { return nil }
    let s = (c >= 0 ? "+" : "") + String(format: "%.2f%%", c)
    return (s, c >= 0 ? Color(red: 0.06, green: 0.72, blue: 0.51) : Color(red: 0.94, green: 0.27, blue: 0.27))
  }

  private var small: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(entry.coin).font(.system(.caption, design: .monospaced)).fontWeight(.bold)
        .foregroundStyle(.secondary)
      Spacer(minLength: 0)
      Text(text(price(entry.coin)))
        .font(.system(.title2, design: .monospaced)).fontWeight(.semibold)
        .minimumScaleFactor(0.6).lineLimit(1)
      if let (s, color) = change(entry.coin) {
        Text(s).font(.system(.caption, design: .monospaced)).foregroundStyle(color)
      }
      Spacer(minLength: 0)
      Text(entry.date, style: .time).font(.system(.caption2, design: .monospaced)).foregroundStyle(.tertiary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .containerBackground(.fill.tertiary, for: .widget)
  }

  private var medium: some View {
    let coins = Array(entry.snapshot.coins.prefix(4))
    return VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text("PriceTab").font(.system(.caption, design: .monospaced)).fontWeight(.bold).foregroundStyle(.secondary)
        Spacer()
        Text(entry.date, style: .time).font(.system(.caption2, design: .monospaced)).foregroundStyle(.tertiary)
      }
      ForEach(coins.isEmpty ? ["BTC"] : coins, id: \.self) { coin in
        HStack {
          Text(coin).font(.system(.callout, design: .monospaced)).fontWeight(.semibold)
          Spacer()
          Text(text(price(coin))).font(.system(.callout, design: .monospaced))
          if let (s, color) = change(coin) {
            Text(s).font(.system(.caption, design: .monospaced)).foregroundStyle(color)
              .frame(width: 64, alignment: .trailing)
          }
        }
      }
      Spacer(minLength: 0)
    }
    .containerBackground(.fill.tertiary, for: .widget)
  }

  private var rectangular: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(entry.coin).font(.system(.caption2, design: .monospaced)).fontWeight(.bold)
      Text(text(price(entry.coin))).font(.system(.headline, design: .monospaced))
      if let (s, _) = change(entry.coin) { Text(s).font(.system(.caption2, design: .monospaced)) }
    }
    .containerBackground(.fill.tertiary, for: .widget)
  }
}

struct PriceTabWidget: Widget {
  let kind = "PriceTabWidget"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: CoinIntent.self, provider: Provider()) { entry in
      PriceTabWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("PriceTab")
    .description("Your coins' prices, from the app's own list.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
  }
}

@main
struct PriceTabWidgetBundle: WidgetBundle {
  var body: some Widget {
    PriceTabWidget()
  }
}
