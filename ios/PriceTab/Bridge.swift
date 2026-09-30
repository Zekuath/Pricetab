import Foundation
import SwiftUI
import WebKit
import WidgetKit

/// What the page tells the app. One handler, one message shape:
///
///   { kind: "snapshot", coins: ["BTC", …], currency: "USD", symbol: "$",
///     prices: { BTC: { price: 43000.5, change: 1.2 }, … } }
///
/// The page's own ticker cache, read off localStorage by `ios.js` every
/// minute and on load — nothing is fetched twice. It lands in the App Group
/// store the widget reads, and the widget is asked to redraw.
/// The page's ground colour, for the band under the status bar.
final class PageTheme: ObservableObject {
  static let shared = PageTheme()
  @Published var background: Color?

  /// "rgb(0, 0, 0)" / "rgba(255, 255, 255, 1)" → Color; anything else is ignored.
  func apply(css: String) {
    let digits = css.split(whereSeparator: { !"0123456789.".contains($0) }).compactMap { Double($0) }
    guard digits.count >= 3 else { return }
    let alpha = digits.count >= 4 ? digits[3] : 1
    guard alpha > 0.5 else { return }
    DispatchQueue.main.async {
      self.background = Color(red: digits[0] / 255, green: digits[1] / 255, blue: digits[2] / 255)
    }
  }
}

enum Bridge {
  static let handlerName = "pricetab"

  static func receive(_ message: WKScriptMessage) {
    guard let body = message.body as? [String: Any] else { return }
    let kind = body["kind"] as? String ?? ""
    let id = (body["id"] as? NSNumber)?.intValue
    switch kind {
    case "theme":
      if let bg = body["bg"] as? String { PageTheme.shared.apply(css: bg) }
      return
    case "notifyStatus":
      Notifier.shared.status { granted in WebBridgeHandle.shared.resolve(id, granted) }
      return
    case "notifyRequest":
      Notifier.shared.request { granted in WebBridgeHandle.shared.resolve(id, granted) }
      return
    case "notifyOff":
      Notifier.shared.mute()
      return
    case "notify":
      Notifier.shared.post(id: body["id"] as? String ?? UUID().uuidString,
                           title: body["title"] as? String ?? "PriceTab",
                           message: body["message"] as? String ?? "")
      return
    case "snapshot":
      break
    default:
      return
    }
    let coins = (body["coins"] as? [String] ?? []).map { $0.uppercased() }
    let currency = (body["currency"] as? String ?? "USD").uppercased()
    let symbol = body["symbol"] as? String ?? ""
    var prices: [String: CoinQuote] = [:]
    if let raw = body["prices"] as? [String: [String: Any]] {
      for (coin, q) in raw {
        guard let price = (q["price"] as? NSNumber)?.doubleValue, price.isFinite, price > 0 else { continue }
        let change = (q["change"] as? NSNumber)?.doubleValue
        prices[coin.uppercased()] = CoinQuote(price: price, change: change?.isFinite == true ? change : nil)
      }
    }
    let snapshot = WidgetSnapshot(coins: coins, prices: prices, currency: currency, symbol: symbol, updated: Date())
    WidgetStore.save(snapshot)
    WidgetCenter.shared.reloadAllTimelines()
  }
}
