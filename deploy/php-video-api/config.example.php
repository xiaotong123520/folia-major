<?php
declare(strict_types=1);
/*
 * Example only; do NOT upload this file to the public PHP document root.
 * Copy to /www/server/tongsheng-video/config.php and edit there.
 *
 * Generate the password hash on your own server:
 * php -r 'echo password_hash("your-unique-long-password", PASSWORD_DEFAULT), PHP_EOL;'
 */
return [
    'storage_dir' => '/www/server/tongsheng-video/files',
    'admin_password_hash' => 'REPLACE_WITH_PHP_PASSWORD_HASH',
    // False means all list and streaming calls return 403.
    // Only turn on for videos you have rights to share with everyone.
    'public_gallery' => false,
    'allowed_origin' => 'https://xiaotong123520.github.io',
    'max_upload_bytes' => 536870912,
];
