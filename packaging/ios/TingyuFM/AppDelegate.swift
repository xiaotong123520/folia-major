import UIKit

// 独立 iOS 入口，网页与后端继续由现有部署提供。
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = MusicViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
