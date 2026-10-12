import Foundation

/// The same spot endpoint the web app polls, asked by the widget so a
/// timeline is not a day old when the app has not been opened. Public, no
/// key; a failure returns nil and the widget keeps the app's last figure.
enum CoinbaseSpot {
  static func fetch(coin: String, currency: String) async -> Double? {
    guard let url = URL(string: "https://api.coinbase.com/v2/prices/\(coin)-\(currency)/spot") else { return nil }
    var request = URLRequest(url: url)
    request.timeoutInterval = 8
    guard let (data, response) = try? await URLSession.shared.data(for: request),
          (response as? HTTPURLResponse)?.statusCode == 200,
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let inner = json["data"] as? [String: Any],
          let amount = inner["amount"] as? String,
          let value = Double(amount), value.isFinite, value > 0 else { return nil }
    return value
  }
}
