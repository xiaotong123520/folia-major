package com.xiaotong.tingyufm;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

// HTTPS website shell; authorization stays in the existing website and API.
public final class MainActivity extends Activity {
    private static final String HOME = "https://music.xn--1lqq7iexp1vp.com/";
    private static final int PICK_FILE = 41;
    private WebView web;
    private ValueCallback<Uri[]> files;
    private boolean noticeOpen;
    private JSONObject update;
    private boolean firstWelcome;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        // Fit system bars including landscape cutouts, without hiding website controls.
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "music.xn--1lqq7iexp1vp.com".equals(uri.getHost())) return false;
                openExternal(uri);
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) { CookieManager.getInstance().flush(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (files != null) files.onReceiveValue(null);
                files = callback;
                try { startActivityForResult(params.createIntent(), PICK_FILE); }
                catch (android.content.ActivityNotFoundException e) { files.onReceiveValue(null); files = null; }
                return true;
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, android.os.Message message) {
                // Let platform login / OAuth windows run in the system browser; no native JS bridge exposed.
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        openExternal(request.getUrl()); v.destroy(); return true;
                    }
                });
                ((WebView.WebViewTransport) message.obj).setWebView(popup);
                message.sendToTarget();
                return true;
            }
        });
        if (state == null || web.restoreState(state) == null) web.loadUrl(HOME + "#player");
        firstWelcome = !getPreferences(MODE_PRIVATE).getBoolean("tingyu.notice.happy-listening.v1", false);
        if (firstWelcome) {
            noticeOpen = true;
            new AlertDialog.Builder(this).setTitle("听屿 FM 公告").setMessage("天天开心，听歌愉快")
                .setCancelable(false).setPositiveButton("开始听歌", (d, w) -> {
                    getPreferences(MODE_PRIVATE).edit().putBoolean("tingyu.notice.happy-listening.v1", true).apply();
                    noticeOpen = false; showUpdate();
                }).show();
        }
        fetchUpdate();
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null || scheme.equals("javascript") || scheme.equals("file") || scheme.equals("content") || scheme.equals("data") || scheme.equals("intent")) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (android.content.ActivityNotFoundException ignored) { }
    }
    private void fetchUpdate() {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(HOME + "app-updates.json").openConnection();
                connection.setConnectTimeout(15000); connection.setReadTimeout(15000);
                connection.setUseCaches(false); connection.setInstanceFollowRedirects(false);
                if (connection.getResponseCode() != 200) return;
                byte[] bytes;
                try (java.io.InputStream input = connection.getInputStream(); java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
                    byte[] chunk = new byte[4096]; int n;
                    while ((n = input.read(chunk)) != -1) { out.write(chunk, 0, n); if (out.size() > 32768) return; }
                    bytes = out.toByteArray();
                }
                JSONObject result = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                String id = result.getString("id"); JSONArray changes = result.getJSONArray("changes");
                if (id.isEmpty() || id.length() > 100 || changes.length() == 0 || changes.length() > 12) return;
                for (int i = 0; i < changes.length(); i++) if (changes.getString(i).length() > 500) return;
                runOnUiThread(() -> { update = result; showUpdate(); });
            } catch (Exception ignored) { /* A failed announcement must not block music or authorization. */ }
            finally { if (connection != null) connection.disconnect(); }
        }, "tingyu-announcement").start();
    }
    private void showUpdate() {
        if (isFinishing() || isDestroyed() || noticeOpen || update == null) return;
        String id = update.optString("id");
        if (firstWelcome) { getPreferences(MODE_PRIVATE).edit().putString("tingyu.notice.last-update.v1", id).apply(); firstWelcome = false; return; }
        if (id.equals(getPreferences(MODE_PRIVATE).getString("tingyu.notice.last-update.v1", ""))) return;
        StringBuilder text = new StringBuilder(update.optString("version"));
        JSONArray changes = update.optJSONArray("changes");
        for (int i = 0; i < changes.length(); i++) text.append("\n\n• ").append(changes.optString(i));
        noticeOpen = true;
        new AlertDialog.Builder(this).setTitle("听屿 FM 更新公告").setMessage(text.toString()).setPositiveButton("知道了", (d, w) -> {
            getPreferences(MODE_PRIVATE).edit().putString("tingyu.notice.last-update.v1", id).apply();
        }).setOnDismissListener(d -> noticeOpen = false).show();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && files != null) { files.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data)); files = null; }
    }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onStop() { super.onStop(); CookieManager.getInstance().flush(); }
    @Override protected void onDestroy() { if (files != null) files.onReceiveValue(null); web.destroy(); super.onDestroy(); }
}
