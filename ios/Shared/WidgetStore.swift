import Foundation

/// One coin's last known quote, in the app's display currency.
struct CoinQuote: Codable, Equatable {
  var price: Double
  /// 24-hour change in percent, when the app's ticker had one.
  var change: Double?
}

/// What the widget draws: the user's coin list in its order, the prices the
/// app last had, the currency, and when the app last said so.
struct WidgetSnapshot: Codable, Equatable {
  var coins: [String]
  var prices: [String: CoinQuote]
  var currency: String
  var symbol: String
  var updated: Date

  static let placeholder = WidgetSnapshot(
    coins: ["BTC", "ETH", "XRP", "LTC"],
    prices: [
      "BTC": CoinQuote(price: 43250.5, change: 1.24),
      "ETH": CoinQuote(price: 2310.2, change: -0.6),
      "XRP": CoinQuote(price: 0.61, change: 2.1),
      "LTC": CoinQuote(price: 72.4, change: 0.3),
    ],
    currency: "USD", symbol: "$", updated: Date()
  )
}

/// The App Group store the app writes and the widget reads. The group id
/// has to match the entitlement of both targets (project.yml); if the group
/// is missing — signing without it — the standard defaults are used, so the
/// app still runs and the widget shows the default coins.
enum WidgetStore {
  static let group = "group.com.pricetab.app"
  private static let key = "widgetSnapshot"

  static var defaults: UserDefaults {
    UserDefaults(suiteName: group) ?? .standard
  }

  static func save(_ snapshot: WidgetSnapshot) {
    if let data = try? JSONEncoder().encode(snapshot) {
      defaults.set(data, forKey: key)
    }
  }

  static func load() -> WidgetSnapshot? {
    guard let data = defaults.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }
}
