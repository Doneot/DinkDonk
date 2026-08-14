import SwiftUI

/// Single accent color the whole app tints from (buttons, toggles, nav bars)
/// - set once here via .tint() on the root WindowGroup rather than scattered
/// hand-typed color literals, so the palette only has one place to change.
enum Theme {
    static let accent = Color(red: 0.42, green: 0.36, blue: 0.98)
}
