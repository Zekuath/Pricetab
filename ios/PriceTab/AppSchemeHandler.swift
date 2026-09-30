import Foundation
import WebKit
import UniformTypeIdentifiers

/// Serves `pricetab://app/<path>` from the `WebApp` folder inside the bundle.
/// One file per request, with its media type from the extension; anything
/// outside the folder, or not there, is a 404 rather than a crash.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
  static let scheme = "pricetab"
  static let host = "app"
  static let indexURL = URL(string: "\(scheme)://\(host)/index.html")!

  private static let root: URL = {
    Bundle.main.resourceURL!.appendingPathComponent("WebApp", isDirectory: true)
  }()

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    let url = urlSchemeTask.request.url!
    var path = url.path.isEmpty || url.path == "/" ? "/index.html" : url.path
    if path.hasSuffix("/") { path += "index.html" }
    let file = Self.root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
    // Never leave the folder, whatever the path says.
    guard file.path.hasPrefix(Self.root.standardizedFileURL.path),
          let data = try? Data(contentsOf: file) else {
      let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
      urlSchemeTask.didReceive(response)
      urlSchemeTask.didReceive(Data("not found".utf8))
      urlSchemeTask.didFinish()
      return
    }
    let type = Self.mediaType(for: file.pathExtension)
    let headers = [
      "Content-Type": type,
      "Content-Length": String(data.count),
      "Cache-Control": "no-cache",
    ]
    let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
    urlSchemeTask.didReceive(response)
    urlSchemeTask.didReceive(data)
    urlSchemeTask.didFinish()
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

  private static func mediaType(for ext: String) -> String {
    switch ext.lowercased() {
    case "html": return "text/html; charset=utf-8"
    case "js": return "text/javascript; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "json": return "application/json; charset=utf-8"
    case "svg": return "image/svg+xml"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "woff2": return "font/woff2"
    case "woff": return "font/woff"
    case "ttf": return "font/ttf"
    case "ico": return "image/x-icon"
    default:
      return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }
  }
}
