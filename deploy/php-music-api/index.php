<?php
declare(strict_types=1);

/**
 * Tongsheng Music: read-only PHP 8+ adapter for media already stored on your server.
 * Run via "php -S 127.0.0.1:8092 index.php" from this directory, or behind Baota PHP-FPM.
 * Never accept filesystem paths or remote URLs from browser query parameters.
 */
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, no-store');

$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$allowed = array_filter(array_map('trim', explode(',', (string) (getenv('MUSIC_PUBLIC_ORIGINS') ?: ''))));
if ($origin !== '' && in_array($origin, $allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
    header('Access-Control-Allow-Headers: Range, Accept');
    header('Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges');
    header('Vary: Origin');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code($origin !== '' && in_array($origin, $allowed, true) ? 204 : 403);
    exit;
}
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    reply(405, ['code' => 405, 'msg' => 'Method not allowed']);
}

$apiKey = (string) (getenv('MUSIC_BACKEND_API_KEY') ?: '');
$provided = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
$hasBearer = $apiKey !== '' && str_starts_with($provided, 'Bearer ')
    && hash_equals($apiKey, substr($provided, 7));
// Public-origin mode is only for files you are legally allowed to serve to everyone.
// A forged Origin can bypass CORS restrictions; do not use this mode for private libraries.
$publicRead = $origin !== '' && in_array($origin, $allowed, true);
if (!$hasBearer && !$publicRead && parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) !== '/healthz') {
    reply(401, ['code' => 401, 'msg' => 'Unauthorized']);
}

$root = realpath((string) (getenv('MUSIC_LIBRARY_ROOT') ?: ''));
$index = (string) (getenv('MUSIC_LIBRARY_INDEX') ?: '');
if (!$root || !is_dir($root) || !is_file($index) || !is_readable($index)) {
    reply(503, ['code' => 503, 'msg' => 'Music library is not configured']);
}
$raw = file_get_contents($index, false, null, 0, 10_000_001);
if ($raw === false || strlen($raw) > 10_000_000) {
    reply(503, ['code' => 503, 'msg' => 'Music index is unavailable']);
}
$items = json_decode($raw, true);
if (!is_array($items) || array_keys($items) !== array_keys(array_values($items))) {
    reply(503, ['code' => 503, 'msg' => 'Music index is invalid']);
}
$path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
switch ($path) {
    case '/healthz':
        header('Content-Type: text/plain; charset=utf-8');
        http_response_code(200);
        if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') echo 'ok';
        exit;
    case '/api/v1/music/search':
        $q = trim((string) ($_GET['q'] ?? ''));
        if (strlen($q) > 240) reply(400, ['code' => 400, 'msg' => 'Query too long']);
        $limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
        $offset = min(100_000, max(0, (int) ($_GET['offset'] ?? 0)));
        $matches = array_values(array_filter($items, static function ($track) use ($q): bool {
            if (!is_array($track) || !isset($track['id'], $track['name'])) return false;
            return $q === '' || stripos((string) $track['name'], $q) !== false
                || stripos((string) ($track['artist'] ?? ''), $q) !== false;
        }));
        $songs = array_map(static fn ($track): array => [
            'id' => $track['id'],
            'source' => 'local',
            'name' => $track['name'],
            'artist' => $track['artist'] ?? '',
            'album' => $track['album'] ?? '',
            'durationMs' => 0,
        ], array_slice($matches, $offset, $limit));
        reply(200, ['code' => 200, 'data' => ['songs' => $songs, 'total' => count($matches)]]);
    case '/api/v1/music/lyric':
        reply(200, ['code' => 200, 'data' => ['lyric' => '']]);
    case '/api/v1/music/stream':
        if ((string) ($_GET['source'] ?? '') !== 'local') {
            reply(404, ['code' => 404, 'msg' => 'Unknown source']);
        }
        $id = (string) ($_GET['id'] ?? '');
        if (!preg_match('/^[a-f0-9]{24}$/D', $id)) reply(400, ['code' => 400, 'msg' => 'Invalid song id']);
        $track = null;
        foreach ($items as $entry) {
            if (is_array($entry) && ($entry['id'] ?? null) === $id) { $track = $entry; break; }
        }
        if (!is_array($track) || !is_string($track['path'] ?? null)) {
            reply(404, ['code' => 404, 'msg' => 'Song not found']);
        }
        // Only indexed files residing inside the configured directory are eligible.
        $relative = $track['path'];
        if ($relative === '' || str_contains($relative, "\0") || str_starts_with($relative, '/')
            || str_contains($relative, '\\') || in_array('..', explode('/', $relative), true)) {
            reply(404, ['code' => 404, 'msg' => 'Song not found']);
        }
        $file = realpath($root . DIRECTORY_SEPARATOR . $relative);
        if (!$file || !str_starts_with($file, $root . DIRECTORY_SEPARATOR) || !is_file($file) || !is_readable($file)) {
            reply(404, ['code' => 404, 'msg' => 'Song not found']);
        }
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $mimes = ['mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'aac' => 'audio/aac',
                  'flac' => 'audio/flac', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'opus' => 'audio/ogg'];
        if (!isset($mimes[$ext])) reply(415, ['code' => 415, 'msg' => 'Unsupported audio type']);
        $size = filesize($file);
        if ($size === false || $size < 1) reply(404, ['code' => 404, 'msg' => 'Empty audio file']);
        $start = 0; $end = $size - 1; $partial = false;
        $range = (string) ($_SERVER['HTTP_RANGE'] ?? '');
        if ($range !== '') {
            if (!preg_match('/^bytes=(\d*)-(\d*)$/D', $range, $parts)
                || ($parts[1] === '' && $parts[2] === '')) {
                header("Content-Range: bytes */$size");
                reply(416, ['code' => 416, 'msg' => 'Invalid range']);
            }
            if ($parts[1] === '') {
                $suffix = (int) $parts[2];
                if ($suffix < 1) {
                    header("Content-Range: bytes */$size");
                    reply(416, ['code' => 416, 'msg' => 'Invalid range']);
                }
                $start = max(0, $size - $suffix);
            } else {
                $start = (int) $parts[1];
                if ($parts[2] !== '') $end = min($end, (int) $parts[2]);
            }
            if ($start >= $size || $start > $end) {
                header("Content-Range: bytes */$size");
                reply(416, ['code' => 416, 'msg' => 'Range not satisfiable']);
            }
            $partial = true;
        }
        $handle = fopen($file, 'rb');
        if ($handle === false) reply(404, ['code' => 404, 'msg' => 'Song not readable']);
        http_response_code($partial ? 206 : 200);
        header('Content-Type: ' . $mimes[$ext]);
        header('Accept-Ranges: bytes');
        header('Content-Length: ' . ($end - $start + 1));
        if ($partial) header("Content-Range: bytes $start-$end/$size");
        if ($_SERVER['REQUEST_METHOD'] === 'HEAD') { fclose($handle); exit; }
        fseek($handle, $start);
        $remaining = $end - $start + 1;
        while ($remaining > 0 && !feof($handle) && connection_status() === CONNECTION_NORMAL) {
            $chunk = fread($handle, min(65536, $remaining));
            if ($chunk === false || $chunk === '') break;
            echo $chunk;
            $remaining -= strlen($chunk);
            flush();
        }
        fclose($handle);
        exit;
    default:
        reply(404, ['code' => 404, 'msg' => 'Route not found']);
}

function reply(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') {
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    exit;
}
