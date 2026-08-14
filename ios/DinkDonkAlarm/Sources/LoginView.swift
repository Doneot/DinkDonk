import SwiftUI
import WebKit

/// Runs DinkDonk's existing Discord OAuth flow (server/src/http/routes/authRoutes.ts)
/// in a WKWebView - identical to what happens in a browser tab - then lifts
/// the resulting `connect.sid` session cookie out of the shared cookie store
/// once login completes. httpOnly only blocks *page JavaScript* from reading
/// the cookie; native code reading it via WKHTTPCookieStore is unaffected.
struct LoginView: View {
    let serverURL: URL
    let onLoggedIn: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Text("Log in with Discord to connect the alarm to your DinkDonk account.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding()

            LoginWebView(serverURL: serverURL, onLoggedIn: onLoggedIn)
        }
    }
}

private struct LoginWebView: UIViewRepresentable {
    let serverURL: URL
    let onLoggedIn: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onLoggedIn: onLoggedIn)
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        // Mirrors configureRoutes.ts's mount point: `${prefix}/auth` at
        // "/api/auth", with Passport's Discord strategy at "/discord".
        let authURL = serverURL.appendingPathComponent("api/auth/discord")
        webView.load(URLRequest(url: authURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let onLoggedIn: (String) -> Void
        private var didComplete = false

        init(onLoggedIn: @escaping (String) -> Void) {
            self.onLoggedIn = onLoggedIn
        }

        // Checked after every navigation rather than matching a specific
        // redirect URL - simpler, and correct regardless of exactly which
        // dashboard path/query string the server's post-login redirect
        // lands on (see authRoutes.ts's handleProviderCallback).
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard !didComplete else { return }

            webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
                guard let self, !self.didComplete else { return }
                guard let sessionCookie = cookies.first(where: { $0.name == "connect.sid" }) else { return }

                self.didComplete = true
                let value = sessionCookie.value
                DispatchQueue.main.async {
                    self.onLoggedIn(value)
                }
            }
        }
    }
}
