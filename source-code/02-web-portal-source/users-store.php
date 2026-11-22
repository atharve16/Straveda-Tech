<?php
/**
 * users-store.php — the one safe way to read and write users.php (every account of the portal).
 *
 * Why this file exists: users.php used to be loaded with `require` and rewritten in place.
 *  1. PHP's OPcache keeps a compiled copy of every PHP file it has seen and may keep serving it for a while (and each PHP worker has its own
 *     copy) - so right after an officer was added, the list could still show the old accounts until the page was reloaded a few times.
 *  2. file_put_contents() empties the file before it writes it, so a request that read users.php at that very moment saw an empty or half-written
 *     list (accounts "missing", or the signed-in user thrown out with "This account no longer exists").
 *  3. Two administrators saving at the same moment each started from the same old copy, and the second save wiped the first one's account.
 * Now: reads go straight to the file (never through OPcache), writes are atomic (a complete new file replaces the old one in one step), and
 * every saving request holds usersLock() from the moment it reads until it has written, so saves queue up instead of overwriting each other.
 */

/** Where users.php lives. */
function usersPath(): string { return __DIR__ . '/users.php'; }

/** Folder for the lock file and the temporary copy while saving: mis-data/ is closed to browsers (.htaccess), falls back to this folder. */
function usersWorkDir(): string {
    $d = __DIR__ . '/mis-data';
    return (is_dir($d) && is_writable($d)) ? $d : __DIR__;
}

/**
 * Hold an exclusive lock until this request ends (PHP releases it by itself). Call it BEFORE reading the users you are about to change.
 * Reading alone never needs it.
 */
function usersLock(): void {
    static $h = null;
    if ($h) return;
    $h = @fopen(usersWorkDir() . '/users.lock', 'c');
    if ($h) @flock($h, LOCK_EX);
}

/** Turn the text of a users file into the array, or null when it is not a complete, valid users file. */
function usersParse(string $raw): ?array {
    $code = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
    $code = preg_replace('/^\s*<\?php/', '', $code, 1, $n);
    if (!$n || trim($code) === '') return null;
    try { $u = eval($code); }
    catch (Throwable $e) { return null; }
    return (is_array($u) && $u) ? $u : null;
}

/** All accounts, always the current content of the file. */
function usersLoad(): array {
    $f = usersPath();
    for ($try = 0; $try < 5; $try++) {
        clearstatcache(true, $f);
        $raw = @file_get_contents($f);
        if ($raw !== false) {
            $u = usersParse($raw);
            if ($u !== null) return $u;
        }
        usleep(80000);   // a save may be in its last moment: look again
    }
    if (function_exists('opcache_invalidate')) @opcache_invalidate($f, true);   // last resort: the ordinary way
    $u = @include $f;
    if (is_array($u) && $u) return $u;
    error_log('users-store: users.php could not be read');
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'The user list could not be read. Please try again in a moment.']);
    exit;
}

/** Save all accounts: a complete new file replaces the old one in one step. Stops with an error message (never silently) when it cannot be saved. */
function usersWrite(array $users): void {
    $f = usersPath();
    $code = "<?php\nreturn " . var_export_short($users) . ";\n";
    $check = usersParse($code);   // never replace the good file with one that cannot be read back
    if ($check === null || count($check) !== count($users)) usersWriteFail('The user list could not be prepared.');
    $tmp = usersWorkDir() . '/users.tmp.' . bin2hex(random_bytes(6));
    $ok = @file_put_contents($tmp, $code, LOCK_EX) === strlen($code);
    if ($ok) {
        $perm = @fileperms($f);
        if ($perm !== false) @chmod($tmp, $perm & 0777);
        $ok = @rename($tmp, $f);
    }
    if (!$ok) {
        @unlink($tmp);
        // the atomic way is not possible here (folder rights): write the file itself, with a lock
        $ok = @file_put_contents($f, $code, LOCK_EX) === strlen($code);
    }
    if (!$ok) usersWriteFail('The change could not be saved on the server (users.php is not writable). Nothing was changed.');
    clearstatcache(true, $f);
    if (function_exists('opcache_invalidate')) @opcache_invalidate($f, true);
}

function usersWriteFail(string $msg): void {
    error_log('users-store: ' . $msg);
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}
