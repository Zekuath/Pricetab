import SwiftUI

/// The app's own bar, floating over the page in Liquid Glass on iOS 26 and
/// later (a thin material before that): the six places a hand reaches for —
/// the chart, targets, calls, the portfolio, the derivatives desk, settings.
/// Each press is the page's own keyboard shortcut, sent through the shim, so
/// the bar adds a way in and never a second implementation.
struct GlassBar: View {
  let press: (String) -> Void

  private let items: [(key: String, label: String, symbol: String)] = [
    ("Escape", "Chart", "chart.xyaxis.line"),
    ("a", "Targets", "scope"),
    ("k", "Calls", "square.grid.3x3.square"),
    ("p", "Portfolio", "briefcase"),
    ("f", "Futures", "arrow.left.arrow.right"),
    ("s", "Settings", "gearshape"),
  ]

  var body: some View {
    HStack(spacing: 2) {
      ForEach(items, id: \.key) { item in
        Button {
          press(item.key)
        } label: {
          VStack(spacing: 3) {
            // A fixed box for the glyph: the symbols differ in height, and
            // without it the labels sat on six different baselines.
            Image(systemName: item.symbol)
              .font(.system(size: 17, weight: .medium))
              .frame(width: 24, height: 22)
            Text(item.label)
              .font(.system(size: 10, weight: .medium, design: .monospaced))
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.label)
      }
    }
    .padding(.horizontal, 6)
    .frame(height: 58)
    .modifier(GlassSurface())
    .padding(.horizontal, 12)
  }
}

/// Liquid Glass where the system has it, a material where it does not.
private struct GlassSurface: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) {
      content.glassEffect(.regular.interactive(), in: .capsule)
    } else {
      content
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.18), lineWidth: 0.5))
    }
  }
}
