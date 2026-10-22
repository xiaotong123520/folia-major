<?php
declare(strict_types=1);

/**
 * Tongsheng video library on Baota PHP 8.0+. Files and config remain OUTSIDE the web root.
 * GET ?action=list and ?action=stream&id=... are public ONLY when configured as a public gallery.
 * POST upload requires an authenticated same-origin admin browser session and a CSRF token.
 */
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
$cfgPath = getenv('TONGSHENG_VIDEO_CONFIG') ?: '/www/server/tongsheng-video/config.php';
if (!is_file($cfgPath) || !is_readable($cfgPath)) fail(503, 'Missing private video server configuration');
$cfg = require $cfgPath;
if (!is_array($cfg)) fail(503, 'Invalid configuration');
$root = realpath((string) ($cfg['storage_dir'] ?? ''));
$hash = (string) ($cfg['admin_password_hash'] ?? '');
if (!$root || !is_dir($root) || !$hash) fail(503, 'Video storage and admin account must be configured');
$public = ($cfg['public_gallery'] ?? false) === true;
$origin = (string) ($cfg['allowed_origin'] ?? '');
$action = (string) ($_GET['action'] ?? 'admin');
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($public && $origin !== '' && in_array($action, ['list', 'stream'], true)) {
    if ((string) ($_SERVER['HTTP_ORIGIN'] ?? '') === $origin) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
        header('Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges');
        header('Vary: Origin');
    }
}
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if (in_array($action, ['list', 'stream'], true)) {
    if (!$public) fail(403, 'Public gallery disabled');
    if (!in_array($method, ['GET', 'HEAD'], true)) fail(405, 'Method not allowed');
    if ($action === 'list') {
        $videos = array_reverse(readIndex($root));
        $data = array_map(static fn (array $v): array => [
            'id' => $v['id'],
            'title' => $v['title'],
            'mime' => $v['mime'],
            'size' => $v['size'],
            'createdAt' => $v['createdAt'],
        ], array_slice($videos, 0, 200));
        header('Cache-Control: no-store');
        header('Content-Type: application/json; charset=utf-8');
        if ($method !== 'HEAD') echo json_encode(['code' => 0, 'data' => ['videos' => $data]], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $id = (string) ($_GET['id'] ?? '');
    if (!preg_match('/^[a-f0-9]{32}$/D', $id)) fail(400, 'Invalid video ID');
    $video = null;
    foreach (readIndex($root) as $entry) {
        if (is_array($entry) && ($entry['id'] ?? '') === $id) { $video = $entry; break; }
    }
    if (!$video || !is_string($video['extension'] ?? null)) fail(404, 'Video not found');
    $ext = $video['extension'];
    $allowed = ['mp4' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime'];
    if (!isset($allowed[$ext]) || ($video['mime'] ?? '') !== $allowed[$ext]) fail(404, 'Invalid media');
    $path = $root . DIRECTORY_SEPARATOR . $id . '.' . $ext;
    if (!is_file($path) || !is_readable($path)) fail(404, 'Video unavailable');
    $size = filesize($path);
    if ($size === false || $size < 1) fail(404, 'Video unavailable');
    $start = 0;
    $end = $size - 1;
    $partial = false;
    $range = (string) ($_SERVER['HTTP_RANGE'] ?? '');
    if ($range !== '') {
        if (!preg_match('/^bytes=(\d*)-(\d*)$/D', $range, $matches)
            || ($matches[1] === '' && $matches[2] === '')) {
            header("Content-Range: bytes */$size");
            fail(416, 'Invalid Range');
        }
        if ($matches[1] === '') {
            $suffix = (int) $matches[2];
            if ($suffix < 1) {
                header("Content-Range: bytes */$size");
                fail(416, 'Invalid Range');
            }
            $start = max(0, $size - $suffix);
        } else {
            $start = (int) $matches[1];
            if ($matches[2] !== '') $end = min($end, (int) $matches[2]);
        }
        if ($start >= $size || $start > $end) {
            header("Content-Range: bytes */$size");
            fail(416, 'Range not satisfiable');
        }
        $partial = true;
    }
    $handle = fopen($path, 'rb');
    if ($handle === false) fail(404, 'Video unavailable');
    while (ob_get_level() > 0) ob_end_clean();
    http_response_code($partial ? 206 : 200);
    header('Content-Type: ' . $allowed[$ext]);
    header('Content-Length: ' . ($end - $start + 1));
    header('Accept-Ranges: bytes');
    header('Cache-Control: public, max-age=3600');
    if ($partial) header("Content-Range: bytes $start-$end/$size");
    if ($method === 'HEAD') { fclose($handle); exit; }
    fseek($handle, $start);
    $remaining = $end - $start + 1;
    while ($remaining > 0 && !feof($handle) && connection_status() === CONNECTION_NORMAL) {
        $bytes = fread($handle, min(65536, $remaining));
        if ($bytes === false || $bytes === '') break;
        echo $bytes;
        $remaining -= strlen($bytes);
        flush();
    }
    fclose($handle);
    exit;
}

$secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
$local = in_array((string) ($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true);
if (!$secure && !$local) fail(403, 'Admin requires HTTPS');
ini_set('session.use_strict_mode', '1');
session_name('TongshengVideoAdmin');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax']);
session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
$message = '';
if ($method === 'POST') {
    if (!hash_equals((string) $_SESSION['csrf'], (string) ($_POST['csrf'] ?? ''))) fail(403, 'Invalid CSRF token');
    if ($action === 'login') {
        if (($_SESSION['failures'] ?? 0) >= 5 && time() - (int) ($_SESSION['firstFailureAt'] ?? 0) < 900) fail(429, 'Too many login attempts');
        if (password_verify((string) ($_POST['password'] ?? ''), $hash)) {
            session_regenerate_id(true);
            $_SESSION['loggedIn'] = true;
            $_SESSION['csrf'] = bin2hex(random_bytes(24));
            unset($_SESSION['failures'], $_SESSION['firstFailureAt']);
            header('Location: ?action=admin', true, 303);
            exit;
        }
        if (empty($_SESSION['firstFailureAt']) || time() - $_SESSION['firstFailureAt'] >= 900) {
            $_SESSION['firstFailureAt'] = time(); $_SESSION['failures'] = 0;
        }
        $_SESSION['failures']++;
        $message = '密码错误';
    } elseif ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        header('Location: ?action=admin', true, 303);
        exit;
    } elseif ($action === 'upload') {
        if (empty($_SESSION['loggedIn'])) fail(401, 'Admin sign-in required');
        $max = min(2147483648, max(1, (int) ($cfg['max_upload_bytes'] ?? 536870912)));
        $upload = $_FILES['video'] ?? null;
        if (!is_array($upload) || $upload['error'] !== UPLOAD_ERR_OK
            || !is_string($upload['tmp_name'] ?? null) || !is_uploaded_file($upload['tmp_name'])) {
            $message = '上传失败；请检查视频大小、PHP 上传配置和网络';
        } elseif (($upload['size'] ?? 0) < 1 || $upload['size'] > $max) {
            $message = '文件超过配置上限，或文件为空';
        } else {
            $detected = (new finfo(FILEINFO_MIME_TYPE))->file($upload['tmp_name']);
            $types = ['video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov'];
            if (!is_string($detected) || !isset($types[$detected])) {
                $message = '仅支持 MP4 / WebM / MOV；视频编码还需要浏览器支持';
            } else {
                $id = bin2hex(random_bytes(16));
                $extension = $types[$detected];
                $target = $root . DIRECTORY_SEPARATOR . $id . '.' . $extension;
                $title = trim((string) ($_POST['title'] ?? ''));
                if ($title === '') $title = pathinfo((string) ($upload['name'] ?? '视频'), PATHINFO_FILENAME);
                $title = trim((string) preg_replace('/[\x00-\x1f\x7f]/', '', $title));
                $title = mbSafeLimit($title, 120);
                if ($title === '') $title = '视频';
                if (!move_uploaded_file($upload['tmp_name'], $target)) {
                    $message = '写入服务器失败，请检查视频存储目录权限';
                } else {
                    chmod($target, 0640);
                    $entry = [
                        'id' => $id, 'title' => $title, 'extension' => $extension,
                        'mime' => $detected, 'size' => filesize($target),
                        'createdAt' => gmdate('c'),
                    ];
                    if (!appendIndex($root, $entry)) {
                        @unlink($target);
                        $message = '保存索引失败，已撤销此次上传';
                    } else {
                        header('Location: ?action=admin&uploaded=1', true, 303);
                        exit;
                    }
                }
            }
        }
    } else {
        fail(405, 'Unsupported admin operation');
    }
} elseif ($method !== 'GET') {
    fail(405, 'Method not allowed');
}
if ($action !== 'admin' && $action !== 'login' && $action !== 'upload') fail(404, 'Unknown admin operation');
header('Cache-Control: no-store');
header('Content-Type: text/html; charset=utf-8');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
$authenticated = !empty($_SESSION['loggedIn']);
$csrf = htmlspecialchars((string) $_SESSION['csrf'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$notice = isset($_GET['uploaded']) ? '上传成功，可以返回音乐网站刷新视频库。' : $message;
$notice = htmlspecialchars($notice, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>桐声音乐 · 视频管理</title><style>
*{box-sizing:border-box}body{margin:0;background:#101017;color:#f8f7fc;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:40px 18px}main{max-width:580px;margin:auto}h1{font-size:26px}p{color:#beb9cc;line-height:1.6}form{display:grid;gap:14px;padding:22px;background:#1e1b29;border:1px solid #393448;border-radius:20px;margin-top:20px}label{display:grid;gap:8px}input{width:100%;min-height:48px;border-radius:12px;border:1px solid #484052;padding:12px;background:#11101a;color:white;font-size:16px}button{min-height:50px;border:0;background:#dfd2ff;color:#201331;border-radius:12px;font-weight:700;font-size:16px}.notice{color:#f3d8a5}.hint{font-size:13px}</style></head><body><main><h1>桐声音乐 · 视频管理</h1><p>管理员上传到宝塔服务器，不上传 GitHub。支持 MP4、WebM、MOV，建议使用 H.264/AAC 的 MP4。</p>';
if ($notice !== '') echo '<p class="notice">' . $notice . '</p>';
if (!$authenticated) {
    echo '<form method="post" action="?action=login"><input type="hidden" name="csrf" value="' . $csrf . '"><label>管理员密码<input name="password" type="password" required autocomplete="current-password"></label><button type="submit">登录</button></form>';
} else {
    echo '<form method="post" action="?action=upload" enctype="multipart/form-data"><input type="hidden" name="csrf" value="' . $csrf . '"><label>视频标题<input name="title" maxlength="120" placeholder="可选，默认使用文件名"></label><label>选择视频<input name="video" type="file" accept=".mp4,.webm,.mov" required></label><button type="submit">上传到我的宝塔服务器</button><p class="hint">上传前请确认 PHP upload_max_filesize / post_max_size，以及 Nginx client_max_body_size 足够。大文件上传时间取决于你的网络。视频发布后可通过公开视频库访问。</p></form>';
    echo '<form method="post" action="?action=logout"><input type="hidden" name="csrf" value="' . $csrf . '"><button type="submit">退出管理</button></form>';
}
echo '<p class="hint">注意：公开视频库允许所有知道接口地址的访问者播放。不能仅用 CORS 来保护私人影片。</p></main></body></html>';

function mbSafeLimit(string $value, int $length): string
{
    return function_exists('mb_substr') ? mb_substr($value, 0, $length) : substr($value, 0, $length);
}
function readIndex(string $root): array
{
    $index = $root . DIRECTORY_SEPARATOR . 'videos.json';
    if (!is_file($index)) return [];
    $contents = file_get_contents($index);
    $data = $contents === false ? null : json_decode($contents, true);
    return is_array($data) && array_keys($data) === array_keys(array_values($data)) ? $data : [];
}
function appendIndex(string $root, array $entry): bool
{
    $handle = fopen($root . DIRECTORY_SEPARATOR . 'videos.json', 'c+');
    if (!$handle || !flock($handle, LOCK_EX)) return false;
    rewind($handle);
    $raw = stream_get_contents($handle);
    $rows = $raw === '' ? [] : json_decode($raw ?: '', true);
    if (!is_array($rows) || array_keys($rows) !== array_keys(array_values($rows))) { flock($handle, LOCK_UN); fclose($handle); return false; }
    $rows[] = $entry;
    $encoded = json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $ok = is_string($encoded) && rewind($handle) && fwrite($handle, $encoded) === strlen($encoded) && ftruncate($handle, strlen($encoded)) && fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    return $ok;
}
function fail(int $status, string $message): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') echo json_encode(['code' => $status, 'msg' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}
