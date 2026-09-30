import Foundation
import UserNotifications
import UIKit

/// iOS's notification centre, behind the Chrome-shaped API the page asks
/// through (`ios.js`). Asking is done straight out of the switch's press,
/// like the extension does; a refusal is "not granted", never an error.
/// `muted` is the page having pressed "stop" on its switch: the permission
/// cannot be given back on iOS the way a Chrome optional permission can, so
/// the app simply stops posting until the switch asks again.
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
  static let shared = Notifier()
  private let center = UNUserNotificationCenter.current()
  private var muted: Bool {
    get { UserDefaults.standard.bool(forKey: "notifyMuted") }
    set { UserDefaults.standard.set(newValue, forKey: "notifyMuted") }
  }

  func install() {
    center.delegate = self
  }

  func status(_ done: @escaping (Bool) -> Void) {
    center.getNotificationSettings { [muted] s in
      done(s.authorizationStatus == .authorized && !muted)
    }
  }

  func request(_ done: @escaping (Bool) -> Void) {
    muted = false
    center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
      done(granted)
    }
  }

  func mute() { muted = true }

  func post(id: String, title: String, message: String) {
    guard !muted else { return }
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = message
    content.sound = .default
    let request = UNNotificationRequest(identifier: "pricetab-\(id)", content: content, trigger: nil)
    center.add(request, withCompletionHandler: nil)
  }

  /// A hit while the app is in front still shows as a banner — the page's
  /// own toast says it too, but the banner is what somebody looking at
  /// another app gets, and the two should not differ by where you were.
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                              withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([.banner, .sound, .list])
  }
}
