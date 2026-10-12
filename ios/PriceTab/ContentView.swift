import SwiftUI

struct ContentView: View {
  @Environment(\.colorScheme) private var scheme
  @ObservedObject private var theme = PageTheme.shared
  private let bridge = WebBridgeHandle.shared

  var body: some View {
    ZStack(alignment: .bottom) {
      // The band under the status bar and behind the home indicator is
      // painted here, in the page's own ground colour once the page has
      // said what it is (the page's theme is its own setting and can differ
      // from the phone's), and in the system's until then — so a launch is
      // never a white flash on a dark phone. The page itself keeps to the
      // safe area, so its fixed corner controls sit under the clock rather
      // than behind it.
      (theme.background ?? (scheme == .dark ? Color.black : Color.white)).ignoresSafeArea()
      WebView(handle: bridge)
      GlassBar { key in
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        bridge.press(key)
      }
        .padding(.bottom, 6)
    }
  }
}
