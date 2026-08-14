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
            VStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Theme.accent, Theme.accent.opacity(0.6)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 88, height: 88)
                        .shadow(color: Theme.accent.opacity(0.35), radius: 20, y: 8)

                    Image(systemName: "bell.badge.fill")
                        .font(.system(size: 36, weight: .semibold))
                        .foregroundStyle(.white)
                }

                VStack(spacing: 6) {
                    Text("DinkDonk Alarm")
                        .font(.title2.bold())

                    Text("Log in with Discord to connect the alarm to your DinkDonk account.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
            }
            .padding(.top, 32)
            .padding(.bottom, 24)

            LoginWebView(serverURL: serverURL, onLoggedIn: onLoggedIn)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .padding(.horizontal)
                .padding(.bottom)
        }
        .background(
            LinearGradient(
                colors: [Theme.accent.opacity(0.12), Color(.systemBackground)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
    }
}

private struct LoginWebView: UIViewRepresentable {
    let serverURL: URL
    let onLoggedIn: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(serverURL: serverURL, onLoggedIn: onLoggedIn)
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
        private let serverURL: URL
        private let onLoggedIn: (String) -> Void
        private var didComplete = false

        init(serverURL: URL, onLoggedIn: @escaping (String) -> Void) {
            self.serverURL = serverURL
            self.onLoggedIn = onLoggedIn
        }

        // Checked after every navigation rather than matching a specific
        // redirect URL - simpler, and correct regardless of exactly which
        // dashboard path/query string the server's post-login redirect
        // lands on (see authRoutes.ts's handleProviderCallback).
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard !didComplete else { return }

            // The *first* didFinish fires while Discord's own consent page is
            // loaded, mid-flow - authRoutes.ts's GET /discord already causes
            // express-session to issue a connect.sid cookie by then (passport's
            // OAuth2 strategy stores the CSRF `state` param in the session
            // before redirecting to Discord), but that session has no
            // session.passport.user yet, and req.login() regenerates the
            // session id once login actually succeeds (see authRoutes.ts's
            // handleProviderCallback comment) - so grabbing the cookie here
            // would hand AppState a session socketServer.ts immediately
            // disconnects. Only look once navigation has landed back on the
            // DinkDonk host post-callback, never on Discord's own pages.
            guard webView.url?.host == serverURL.host else { return }

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
