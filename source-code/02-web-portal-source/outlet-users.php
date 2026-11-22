<?php
/**
 * outlet-users.php — outlet profiles: an HPCL login that belongs to ONE outlet (one SAP number, an HPCL Retail Outlet) and can only place / follow the orders of that outlet.
 * They go under the HPCL Zone Officers of the outlet's region and place orders like any HPCL officer (the Rohan Energy super admin approves them).
 *
 * Why a table and not users.php: the outlet list has thousands of outlets (the Cluster 2 sheet has 6,868). users.php is read and re-written as a whole on
 * every request / every save, so thousands of accounts there would slow the whole portal down. These accounts live in the database table
 * portal_outlet_users instead; the outlet's zone / region / sales area are NOT copied into it - they are read from portal_outlets every time, so a
 * change made on the SAP Numbers page applies to the profile at once.
 *
 * The login name is the SAP number. The password rule used by the Excel upload is   <outlet name, lower case, letters and digits only>_<3 digits>
 * where the 3 digits change after every 1,000 rows of the sheet (OU_SUFFIXES).
 *
 * Shared by auth.php (login, the Outlet Profiles page) and orders.php (the signed-in outlet's scope).
 */

const OU_T = 'portal_outlet_users';
/** The 3 digits after the underscore: rows 1-1000 of an upload get the first, rows 1001-2000 the second, ... (the list starts again after the last one). */
const OU_SUFFIXES = ['123', '321', '456', '654', '789', '987', '147', '741', '258', '852', '369', '963'];
const OU_BLOCK    = 1000;

/** Database connection (own one, so auth.php does not depend on orders.php). */
function ouDb(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}

/** Create the table the first time it is needed. */
function ouEnsure(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . OU_T . "` (
        `sap_code`   VARCHAR(12)  NOT NULL PRIMARY KEY,
        `label`      VARCHAR(150) NOT NULL,
        `pass`       VARCHAR(100) NOT NULL,
        `pass_view`  VARCHAR(400) NULL,
        `pass_by`    VARCHAR(100) NOT NULL DEFAULT '',
        `pass_at`    DATETIME NULL,
        `created_by` VARCHAR(100) NOT NULL DEFAULT '',
        `created_at` DATETIME NULL,
        KEY `idx_label` (`label`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $done = true;
}

/** The profile of a SAP number joined with its outlet (zone / region / sales area from the outlet list), or null. */
function ouFind(PDO $pdo, string $sap): ?array {
    if (!preg_match('/^\d{6,12}$/', $sap)) return null;
    ouEnsure($pdo);
    $st = $pdo->prepare("SELECT u.*, o.zone, o.ro, o.sales_area, o.state, o.outlet_name FROM `" . OU_T . "` u LEFT JOIN portal_outlets o ON o.sap_code = u.sap_code WHERE u.sap_code = ?");
    $st->execute([$sap]);
    $r = $st->fetch();
    return $r ?: null;
}

/** Is this username an outlet profile? (the orders created by it belong to the outlet, and the Rohan officers who cover the outlet may follow them) */
function ouIsProfile(PDO $pdo, string $name): bool {
    if (!preg_match('/^\d{6,12}$/', $name)) return false;
    static $cache = [];
    if (!isset($cache[$name])) {
        ouEnsure($pdo);
        $st = $pdo->prepare("SELECT 1 FROM `" . OU_T . "` WHERE sap_code = ?");
        $st->execute([$name]);
        $cache[$name] = (bool)$st->fetchColumn();
    }
    return $cache[$name];
}

/** The session record of a signed-in outlet (same shape as an officer's, plus 'outlet' => true). Null when the outlet has no usable zone / region. */
function ouSession(array $r): ?array {
    if (empty($r['zone']) || empty($r['ro'])) return null;
    return [
        'username'    => (string)$r['sap_code'],
        'role'        => 'zone',
        'label'       => (string)$r['label'],
        'filter'      => ['zone' => (string)$r['zone']],
        'hidden_cols' => [],
        'org'         => 'hpcl',
        'ros'         => [(string)$r['ro']],
        'level'       => 'regional',   // an outlet profile IS an HPCL Regional Officer, limited to its one SAP number ('outlet' / 'sap_code' below narrow every list and action to it)
        'sales_areas' => trim((string)$r['sales_area']) !== '' ? [(string)$r['sales_area']] : [],
        'outlet'      => true,
        'sap_code'    => (string)$r['sap_code'],
    ];
}

/** Does the signed-in session belong to an outlet profile? */
function ouSessionIsOutlet(): bool {
    return !empty($_SESSION['hpcl_user']['outlet']);
}

// ── the password rule ────────────────────────────────────────────────────────────────

/** The outlet name as it appears in the password: lower case, letters and digits only ("Naruttam Motor & Engineering Wo" -> "naruttammotorengineeringwo"). */
function ouRuleName(string $name): string {
    $n = preg_replace('/[^a-z0-9]+/', '', strtolower(trim($name)));
    return $n !== '' ? $n : 'outlet';
}

/** The 3 digits for the row at this position of the sheet (0 = first row). */
function ouSuffix(int $index): string {
    $block = intdiv(max(0, $index), OU_BLOCK);
    return OU_SUFFIXES[$block % count(OU_SUFFIXES)];
}

/** outletname_123 for the row at this position of the sheet. */
function ouRulePassword(string $name, int $index): string {
    return ouRuleName($name) . '_' . ouSuffix($index);
}

/** Hash for an outlet password. Cost 8 (not 10): thousands are made in one upload and the passwords follow a published rule anyway. */
function ouHash(string $plain): string {
    return password_hash($plain, PASSWORD_BCRYPT, ['cost' => 8]);
}
