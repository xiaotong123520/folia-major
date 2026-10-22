<?php
declare(strict_types=1);

/** Build an index without moving, renaming, modifying or uploading any audio files. */
if (PHP_SAPI !== 'cli' || count($argv) !== 3) {
    fwrite(STDERR, "Usage: php build-index.php /absolute/music/folder /private/path/music-index.json\n");
    exit(2);
}
$root = realpath($argv[1]);
$target = $argv[2];
$parent = realpath(dirname($target));
if (!$root || !is_dir($root) || !$parent || !is_dir($parent) || !is_writable($parent)) {
    fwrite(STDERR, "Music folder or index output directory is invalid.\n");
    exit(2);
}
if ($parent === $root || str_starts_with($parent, $root . DIRECTORY_SEPARATOR)) {
    fwrite(STDERR, "Index output must be outside the music directory.\n");
    exit(2);
}
$allowed = ['mp3' => true, 'm4a' => true, 'aac' => true, 'flac' => true,
            'wav' => true, 'ogg' => true, 'opus' => true];
$scan = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::LEAVES_ONLY
);
$tracks = [];
foreach ($scan as $entry) {
    if (!$entry->isFile() || $entry->isLink()) continue;
    $full = $entry->getRealPath();
    if (!$full || !str_starts_with($full, $root . DIRECTORY_SEPARATOR)) continue;
    $relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($full, strlen($root) + 1));
    $extension = strtolower(pathinfo($relative, PATHINFO_EXTENSION));
    if (!isset($allowed[$extension])) continue;
    $name = pathinfo($relative, PATHINFO_FILENAME);
    $artist = '';
    $separator = strpos($name, ' - ');
    if ($separator !== false) {
        $artist = trim(substr($name, 0, $separator));
        $name = trim(substr($name, $separator + 3));
    }
    $parentFolder = str_replace(DIRECTORY_SEPARATOR, '/', dirname($relative));
    $tracks[] = [
        'id' => substr(hash('sha256', $relative), 0, 24),
        'path' => $relative,
        'name' => $name,
        'artist' => $artist,
        'album' => $parentFolder === '.' ? '' : basename($parentFolder),
    ];
    if (count($tracks) > 20000) {
        fwrite(STDERR, "Index limited to 20000 tracks; create smaller libraries.\n");
        exit(2);
    }
}
usort($tracks, static fn (array $a, array $b): int => strcmp($a['path'], $b['path']));
$json = json_encode($tracks, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
$temp = tempnam($parent, '.music-index-');
if ($temp === false || file_put_contents($temp, $json, LOCK_EX) === false) {
    fwrite(STDERR, "Could not write index.\n");
    exit(2);
}
chmod($temp, 0600);
if (!rename($temp, $target)) {
    @unlink($temp);
    fwrite(STDERR, "Could not publish index.\n");
    exit(2);
}
fwrite(STDOUT, "Indexed " . count($tracks) . " files; audio files unchanged.\n");
