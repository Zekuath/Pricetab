import SwiftUI
import WebKit

/// The web app, served to a WKWebView from the bundle over its own scheme
/// (`pricetab://app/…`). A scheme of its own rather than file:// so the page
/// has a real origin: localStorage is keyed to it and kept in the default
/// website data store, which persists across launches — that is the app's
/// memory — and cross-origin fetches to the public price APIs carry a clean
/// origin the way the extension's did.
/// A handle the bar presses through: the coordinator keeps the web view,
/// and `press` runs the page's own shortcut in it.
final class WebBridgeHandle {
  static let shared = WebBridgeHandle()
  weak var webView: WKWebView?
  func press(_ key: String) {
    let js = "window.PriceTabIOS && window.PriceTabIOS.press(\(jsString(key)))"
    DispatchQueue.main.async { self.webView?.evaluateJavaScript(js, completionHandler: nil) }
  }
  /// Answers a round trip the shim started (`ask`), on the main thread.
  func resolve(_ id: Int?, _ value: Bool) {
    guard let id else { return }
    let js = "window.PriceTabIOS && window.PriceTabIOS.resolve(\(id), \(value ? "true" : "false"))"
    DispatchQueue.main.async { self.webView?.evaluateJavaScript(js, completionHandler: nil) }
  }
  private func jsString(_ s: String) -> String {
    let data = try? JSONSerialization.data(withJSONObject: [s])
    let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
    return String(text.dropFirst().dropLast())
  }
}

struct WebView: UIViewRepresentable {
  var handle: WebBridgeHandle
  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    config.setURLSchemeHandler(AppSchemeHandler(), forURLScheme: AppSchemeHandler.scheme)
    config.allowsInlineMediaPlayback = true
    /* The alarm is a generated tone; a page nobody has touched yet may still
       sound it — the shim also unlocks a context on the first touch. */
    config.mediaTypesRequiringUserActionForPlayback = []
    config.defaultWebpagePreferences.allowsContentJavaScript = true
    let controller = WKUserContentController()
    controller.add(context.coordinator, name: Bridge.handlerName)
    config.userContentController = controller

    let webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = context.coordinator
    webView.uiDelegate = context.coordinator
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.scrollView.backgroundColor = .clear
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.bounces = false
    webView.allowsBackForwardNavigationGestures = false
    webView.allowsLinkPreview = false
    if #available(iOS 16.4, *) {
      // Safari → Develop → your iPhone → PriceTab, for the page's console.
      webView.isInspectable = true
    }
    context.coordinator.webView = webView
    handle.webView = webView
    /* The bar floats over the foot of the page; the page's own bottom
       padding (the shim's safe-area rule) keeps its last row above it. */
    webView.scrollView.contentInset.bottom = 0
    webView.load(URLRequest(url: AppSchemeHandler.indexURL))
    return webView
  }

  func updateUIView(_ uiView: WKWebView, context: Context) {}

  final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    weak var webView: WKWebView?

    /// Links out of the app (a headline, a policy page) open in Safari;
    /// everything under the app's own scheme stays here.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
      guard let url = navigationAction.request.url else { return decisionHandler(.allow) }
      if url.scheme == AppSchemeHandler.scheme { return decisionHandler(.allow) }
      if navigationAction.navigationType == .linkActivated || navigationAction.targetFrame == nil {
        UIApplication.shared.open(url)
        return decisionHandler(.cancel)
      }
      decisionHandler(.allow)
    }

    /// `target="_blank"` links ask for a new window; there is none, so Safari.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
      if let url = navigationAction.request.url { UIApplication.shared.open(url) }
      return nil
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
      Bridge.receive(message)
    }
  }
}
