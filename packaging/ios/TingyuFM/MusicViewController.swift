import UIKit
import WebKit

// 使用持久化 WebKit 数据，避免嵌入本地页面后改变 API 与会话的来源。
final class MusicViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let startURL = URL(string: "https://folia-major-ai-radio-preview.vercel.app/")!
    private var browser: WKWebView!
    private let failure = UIStackView()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsAirPlayForMediaPlayback = true
        // 保留用户发起播放的要求，不注入自动播放脚本。
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        browser = WKWebView(frame: .zero, configuration: configuration)
        browser.navigationDelegate = self
        browser.uiDelegate = self
        browser.isOpaque = false
        browser.backgroundColor = .black
        browser.scrollView.backgroundColor = .black
        browser.allowsBackForwardNavigationGestures = true
        browser.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(browser)
        NSLayoutConstraint.activate([
            browser.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            browser.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            browser.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            browser.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor)
        ])
        failure.axis = .vertical
        failure.alignment = .center
        failure.spacing = 16
        failure.translatesAutoresizingMaskIntoConstraints = false
        let message = UILabel()
        message.text = "暂时无法打开听屿 FM，请检查网络后重试。"
        message.textColor = .white
        message.numberOfLines = 0
        message.textAlignment = .center
        let retry = UIButton(type: .system)
        retry.setTitle("重新打开", for: .normal)
        retry.addTarget(self, action: #selector(retryLoading), for: .touchUpInside)
        failure.addArrangedSubview(message)
        failure.addArrangedSubview(retry)
        view.addSubview(failure)
        NSLayoutConstraint.activate([
            failure.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            failure.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            failure.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -48)
        ])
        failure.isHidden = true
        retryLoading()
    }

    @objc private func retryLoading() {
        failure.isHidden = true
        browser.isHidden = false
        browser.load(URLRequest(url: startURL))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        failure.isHidden = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showFailure(error)
    }

    private func showFailure(_ error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        browser.isHidden = true
        failure.isHidden = false
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        browser.isHidden = true
        failure.isHidden = false
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "https" || scheme == "about" || scheme == "blob" {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            // 只有用户点击的外部应用链接才交给系统；不绕过 TLS 或 HTTP 安全检查。
            if navigationAction.navigationType == .linkActivated && scheme != "http" && scheme != "file" && scheme != "javascript" {
                UIApplication.shared.open(url, options: [:])
            }
        }
    }

    // 新窗口继续使用同一数据存储，登录完成后用户可关闭返回播放器。
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let popup = WKWebView(frame: .zero, configuration: configuration)
        popup.navigationDelegate = self
        popup.uiDelegate = self
        let controller = UIViewController()
        controller.view = popup
        controller.navigationItem.rightBarButtonItem = UIBarButtonItem(title: "完成", style: .done, target: self, action: #selector(closePopup))
        present(UINavigationController(rootViewController: controller), animated: true)
        return popup
    }

    func webViewDidClose(_ webView: WKWebView) { closePopup() }
    @objc private func closePopup() { presentedViewController?.dismiss(animated: true) }
}
