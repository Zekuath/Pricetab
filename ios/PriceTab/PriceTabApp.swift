import SwiftUI
import AVFoundation

/// PriceTab on iPhone: the same web app the extension ships, inside a
/// WKWebView, with its own storage that survives relaunches (the "memory"),
/// a bridge that hands the home-screen widget what it shows, and iOS's own
/// notifications behind the page's alarm switch.
@main
struct PriceTabApp: App {
  init() {
    Notifier.shared.install()
    /* Ambient: the alarm's two tones mix with whatever is playing and obey
       the ring/silent switch, which is what a person expects of an app that
       is not a music player. */
    try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
    try? AVAudioSession.sharedInstance().setActive(true)
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}
