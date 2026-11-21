<?php
/**
 * mis-core.php — everything the MIS and the dashboard share: tables, rows that follow the orders, reading, editing, importing.
 * Used by mis.php (the MIS page) and api.php (Dashboard / Raw Data read the very same rows).
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/users-store.php';   // reads users.php fresh every time (never a stale OPcache copy)
require_once __DIR__ . '/mis-xlsx.php';
require_once __DIR__ . '/change-log.php';   // the change log of the SAP Numbers / MIS / FOC pages
require_once __DIR__ . '/regions.php';      // zones -> regions (who sees which MIS rows)
date_default_timezone_set('Asia/Kolkata');

const MIS_T       = 'portal_mis_rows';
const MIS_META    = 'portal_mis_meta';
const MIS_ORD     = 'portal_orders';
const MIS_ITEMS   = 'portal_order_items';
const MIS_OUT     = 'portal_outlets';
const MIS_PER_MAX = 200;
// the workbook's item names (the pivot tables list HP DEF with a trailing no-break space)
const MIS_ITEM_HP   = "HP DEF - 1X20L\xC2\xA0";
const MIS_ITEM_TATA = 'TATA MOTORS HP GENUINE DEF 20L';
const MIS_SALE_TYPE = 'HPCL Retail Outlet';
// editable fields: key => [column, max length | 'date' | 'num']
const MIS_FIELDS = ['d' => ['d', 'date'], 't' => ['sale_type', 80], 'o' => ['outlet', 200], 's' => ['sap', 30], 'l' => ['location', 150], 'di' => ['district', 120],
    'st' => ['state', 60], 'sa' => ['sales_area', 120], 'ro' => ['ro', 80], 'z' => ['zone', 60], 'i' => ['item', 100], 'e' => ['ea', 'num'], 'v' => ['litres', 'num']];

// ── responses ────────────────────────────────────────────────────────────────────────────────────────────────────────
function misFail(int $code, string $msg): void {
    http_response_code($code); header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $msg]); exit;
}
function misOut(array $data): void {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR); exit;
}
function misDB(): PDO {
    try {
        return new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    } catch (Exception $e) {
        error_log('mis.php DB connect failed: ' . $e->getMessage());
        misFail(500, 'Database connection failed.');
    }
}
/** The signed-in user. Everybody signed in may read and download; the Super Admin and Rohan Energy officers may edit. */
function misUser(): array {
    $uname = $_SESSION['hpcl_user']['username'] ?? '';
    if ($uname === '') misFail(401, 'Not authenticated. Please sign in again.');
    // an outlet profile ("SAP No." login) is an HPCL officer that lives in its own table: like every HPCL officer it may read and download the MIS
    if (!empty($_SESSION['hpcl_user']['outlet'])) return ['username' => $uname, 'label' => (string)($_SESSION['hpcl_user']['label'] ?? $uname), 'admin' => false, 'edit' => false];
    $users = usersLoad();
    if (!isset($users[$uname])) { session_destroy(); misFail(401, 'This account no longer exists.'); }
    $u = $users[$uname]; $role = $u['role'] ?? ''; $org = $u['org'] ?? null;
    $admin = $role === 'superadmin' && $org !== 'hpcl';   // the HPCL super admin only views and downloads, like the HPCL officers
    return ['username' => $uname, 'label' => $u['label'] ?? $uname, 'admin' => $admin, 'edit' => $admin || ($role === 'zone' && $org === 'rohan')];
}
// ── who sees which rows (Dashboard, Raw Data and MIS all read the same rows) ───────────────────────────────────────────
/** A name made comparable: upper case, runs of spaces made one ("MUZAFFARPUR  RETAIL" = "Muzaffarpur Retail"). */
function misKey(string $s): string { return strtoupper(trim(preg_replace('/\s+/', ' ', $s))); }
/** The same, as SQL for a column. */
function misKeySql(string $col): string { return "UPPER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE($col, ''), '  ', ' '), '  ', ' '), '  ', ' ')))"; }
/**
 * Which MIS rows the signed-in user may see: null = every row (the Rohan Energy and the HPCL super admin). Everybody else sees the regions (regional offices)
 * of their zone(s) - the regions they were given inside it, when they were given some; a Regional Officer only the sales areas (SA) they handle; an outlet login
 * (SAP No.) only its own SAP number. An account that cannot be placed sees nothing.
 * Otherwise: ['ros' => [comparable region names], 'sas' => [comparable sales areas; empty = all of the regions], 'sap' => '' | the one SAP number, 'none' => true when nothing is visible].
 */
function misScope(): ?array {
    static $done = false, $out = null;
    if ($done) return $out;
    $done = true;
    $none = ['ros' => [], 'sas' => [], 'sap' => '', 'none' => true];
    $s = $_SESSION['hpcl_user'] ?? [];
    $uname = (string)($s['username'] ?? '');
    if ($uname === '') return $out = $none;
    if (!empty($s['outlet'])) return $out = ['ros' => [], 'sas' => [], 'sap' => (string)($s['sap_code'] ?? $uname)];   // an outlet profile: its own SAP number
    $users = usersLoad();
    $u = $users[$uname] ?? null;
    if (!is_array($u)) return $out = $none;
    $role = $u['role'] ?? '';
    if ($role === 'superadmin') {   // a super admin made for some states sees the rows of those states only (the SAP numbers, orders and MIS rows alike)
        $ast = approvalStates($u);
        return $out = $ast ? ['ros' => [], 'sas' => [], 'sap' => '', 'states' => array_map('misKey', $ast)] : null;
    }
    if ($role !== 'zone') return $out = $none;
    $zones = array_values(array_filter(array_map('strval', (array)($u['zones'] ?? [])), fn($z) => isset(ORD_ZONES[$z])));
    $fz = is_array($u['filter'] ?? null) ? (string)($u['filter']['zone'] ?? '') : '';
    if (!$zones && $fz !== '' && isset(ORD_ZONES[$fz])) $zones = [$fz];
    if (!$zones) return $out = $none;
    $all = [];
    foreach ($zones as $zn) foreach (ORD_SHEET_ZONES as $d) if ($d['zone'] === $zn) foreach ($d['ros'] as $ro) $all[$ro] = true;
    $ros = array_keys($all);
    $mine = array_map('strval', (array)($u['ros'] ?? []));
    if ($mine && ($pick = array_values(array_intersect($ros, $mine)))) $ros = $pick;   // the regions they were given; none given = the whole zone
    $sas = [];
    if (($u['level'] ?? '') === 'regional') {
        foreach ((array)($u['sales_areas'] ?? []) as $a) if (trim((string)$a) !== '') $sas[] = misKey((string)$a);
        if (!$sas) return $out = $none;   // a Regional Officer without sales areas sees nothing until they are given some (as on the Orders pages)
    }
    return $out = ['ros' => array_map('misKey', $ros), 'sas' => array_values(array_unique($sas)), 'sap' => ''];
}
/** SAP numbers of the outlets in a Regional Officer's sales areas (the outlet list is current; an old sheet may spell a sales area differently, e.g. RAIPUR-I / RAIPUR-1). */
function misScopeSaps(PDO $pdo, array $sc): array {
    static $cache = [];
    if (!$sc['sas'] || !$sc['ros']) return [];
    $k = implode('|', $sc['ros']) . '#' . implode('|', $sc['sas']);
    if (isset($cache[$k])) return $cache[$k];
    try {
        $st = $pdo->prepare("SELECT sap_code FROM `" . MIS_OUT . "` WHERE " . misKeySql('ro') . " IN (" . implode(',', array_fill(0, count($sc['ros']), '?')) . ") AND "
            . misKeySql('sales_area') . " IN (" . implode(',', array_fill(0, count($sc['sas']), '?')) . ")");
        $st->execute(array_merge($sc['ros'], $sc['sas']));
        return $cache[$k] = array_values(array_unique(array_map('strval', $st->fetchAll(PDO::FETCH_COLUMN))));
    } catch (Throwable $e) { return $cache[$k] = []; }
}
/** [' AND ...', params] limiting a query on MIS rows (alias prefix such as 'm.') - or on orders (alias 'o.', SAP column 'ro_code') - to what this user sees; ['', []] for everybody. */
function misScopeSql(PDO $pdo, string $a = '', string $sapCol = 'sap'): array {
    $sc = misScope();
    if ($sc === null) return ['', []];
    if (!empty($sc['states'])) return [' AND ' . misKeySql($a . 'state') . ' IN (' . implode(',', array_fill(0, count($sc['states']), '?')) . ')', $sc['states']];
    if (!empty($sc['none']) || (($sc['sap'] ?? '') === '' && !$sc['ros'])) return [' AND 1 = 0', []];
    if ($sc['sap'] !== '') return [" AND {$a}{$sapCol} = ?", [$sc['sap']]];
    $sql = ' AND ' . misKeySql($a . 'ro') . ' IN (' . implode(',', array_fill(0, count($sc['ros']), '?')) . ')';
    $p = $sc['ros'];
    if ($sc['sas']) {
        $saps = misScopeSaps($pdo, $sc);
        $sql .= ' AND (' . misKeySql($a . 'sales_area') . ' IN (' . implode(',', array_fill(0, count($sc['sas']), '?')) . ')' . ($saps ? " OR {$a}{$sapCol} IN (" . implode(',', array_fill(0, count($saps), '?')) . ')' : '') . ')';
        $p = array_merge($p, $sc['sas'], $saps);
    }
    return [$sql, $p];
}
/** Is this row (columns ro, sales_area, sap) one the signed-in user may see - and so add / change / delete? */
function misRowInScope(PDO $pdo, array $r): bool {
    $sc = misScope();
    if ($sc === null) return true;
    if (!empty($sc['none'])) return false;
    if (!empty($sc['states'])) return in_array(misKey((string)($r['state'] ?? '')), $sc['states'], true);
    $sap = trim((string)($r['sap'] ?? ''));
    if ($sc['sap'] !== '') return $sap === $sc['sap'];
    if (!in_array(misKey((string)($r['ro'] ?? '')), $sc['ros'], true)) return false;
    if (!$sc['sas']) return true;
    return in_array(misKey((string)($r['sales_area'] ?? '')), $sc['sas'], true) || ($sap !== '' && in_array($sap, misScopeSaps($pdo, $sc), true));
}
const MIS_OUTSIDE = 'This row is outside your zone / regions.';
function misRequireCsrf(array $body): void {
    $sent = (string)($body['csrf'] ?? ''); $have = (string)($_SESSION['csrf_token'] ?? '');
    if ($have === '' || !hash_equals($have, $sent)) misFail(403, 'Invalid security token. Please refresh the page and try again.');
}

// ── schema, starting data ────────────────────────────────────────────────────────────────────────────────────────────
function misEnsureSchema(PDO $pdo): ?string {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . MIS_T . "` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `d` DATE NOT NULL,
        `sale_type` VARCHAR(80) NULL, `outlet` VARCHAR(200) NULL, `sap` VARCHAR(30) NULL, `location` VARCHAR(150) NULL, `district` VARCHAR(120) NULL,
        `state` VARCHAR(60) NULL, `sales_area` VARCHAR(120) NULL, `ro` VARCHAR(80) NULL, `zone` VARCHAR(60) NULL, `item` VARCHAR(100) NULL,
        `ea` DECIMAL(12,2) NULL, `litres` DECIMAL(14,2) NULL,
        `xs` VARCHAR(80) NULL,
        `src` VARCHAR(8) NOT NULL DEFAULT 'sheet',
        `item_id` INT NULL,
        `gone` TINYINT NOT NULL DEFAULT 0,
        `ver` INT NOT NULL DEFAULT 1,
        `updated_by` VARCHAR(100) NOT NULL DEFAULT '',
        `updated_at` DATETIME NOT NULL,
        UNIQUE KEY `uk_item` (`item_id`),
        KEY `idx_d` (`d`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . MIS_META . "` (`k` VARCHAR(30) NOT NULL PRIMARY KEY, `v` VARCHAR(100) NOT NULL DEFAULT '', `by` VARCHAR(100) NOT NULL DEFAULT '', `at` DATETIME NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // the Admin tab's row notes (added later: older tables get the column once)
    if ((int)$pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '" . MIS_T . "' AND COLUMN_NAME = 'notes'")->fetchColumn() === 0)
        $pdo->exec("ALTER TABLE `" . MIS_T . "` ADD `notes` TEXT NULL");
    if (misMeta($pdo, 'seeded') !== null) return null;
    // first use: load the rows of the workbook once (never again, even if every row is deleted later)
    if ((int)$pdo->query("SELECT COUNT(*) FROM `" . MIS_T . "`")->fetchColumn() > 0) { misMetaSet($pdo, 'seeded', '1', 'system'); return null; }
    $f = MIS_DATA_DIR . '/seed.json';
    $seed = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
    if (!is_array($seed)) return 'The starting data (mis-data/seed.json) is missing: upload the mis-data folder.';
    $cols = ['d', 'sale_type', 'outlet', 'sap', 'location', 'district', 'state', 'sales_area', 'ro', 'zone', 'item', 'ea', 'litres', 'xs'];
    $now = date('Y-m-d H:i:s');
    $pdo->beginTransaction();
    foreach (array_chunk($seed, 250) as $chunk) {
        $ph = []; $args = [];
        foreach ($chunk as $a) {
            $ph[] = '(' . implode(',', array_fill(0, 14, '?')) . ",'sheet',1,'workbook',?)";
            foreach ($a as $k => $v) $args[] = $k === 3 && $v !== null ? (string)$v : ($v === '' ? null : $v);
            $args[] = $now;
        }
        $pdo->prepare("INSERT INTO `" . MIS_T . "` (`" . implode('`,`', $cols) . "`, src, ver, updated_by, updated_at) VALUES " . implode(',', $ph))->execute($args);
    }
    misMetaSet($pdo, 'seeded', '1', 'system');
    misBump($pdo, 'system');
    $pdo->commit();
    return null;
}
function misMeta(PDO $pdo, string $k): ?string {
    $st = $pdo->prepare("SELECT v FROM `" . MIS_META . "` WHERE k = ?"); $st->execute([$k]); $v = $st->fetchColumn();
    return $v === false ? null : (string)$v;
}
function misMetaSet(PDO $pdo, string $k, string $v, string $by): void {
    $pdo->prepare("INSERT INTO `" . MIS_META . "` (k, v, `by`, `at`) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE v = VALUES(v), `by` = VALUES(`by`), `at` = VALUES(`at`)")->execute([$k, $v, $by]);
}
/** Every change counts up the revision: open pages poll it and reload when it moved. */
function misBump(PDO $pdo, string $by): void {
    $pdo->prepare("INSERT INTO `" . MIS_META . "` (k, v, `by`, `at`) VALUES ('rev', '1', ?, NOW()) ON DUPLICATE KEY UPDATE v = v + 1, `by` = VALUES(`by`), `at` = VALUES(`at`)")->execute([$by]);
}

// ── rows that follow the orders ──────────────────────────────────────────────────────────────────────────────────────
function misHasOrders(PDO $pdo): bool {
    $st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?)");
    $st->execute([MIS_ORD, MIS_ITEMS]);
    return (int)$st->fetchColumn() === 2;
}
function misNormKey(?string $s): string { return trim(preg_replace('/\s+/u', ' ', str_replace("\xC2\xA0", ' ', mb_strtoupper((string)$s)))); }
/** The spelling the workbook already uses for a value (sales areas / regions are typed in several ways there): same text ignoring case and spacing. */
function misCanonMaps(PDO $pdo): array {
    $maps = [];
    foreach (['sales_area', 'ro', 'zone', 'state', 'district'] as $col) {
        $cnt = [];
        foreach ($pdo->query("SELECT `$col` v, COUNT(*) c FROM `" . MIS_T . "` WHERE `$col` IS NOT NULL AND `$col` <> '' GROUP BY `$col`")->fetchAll() as $r) {
            $k = misNormKey($r['v']); if (!isset($cnt[$k]) || $r['c'] > $cnt[$k][1]) $cnt[$k] = [$r['v'], (int)$r['c']];
        }
        $maps[$col] = $cnt;
    }
    return $maps;
}
function misCanon(array $maps, string $col, ?string $v): ?string {
    if ($v === null || trim($v) === '') return null;
    $k = misNormKey($v);
    if (isset($maps[$col][$k])) return $maps[$col][$k][0];
    if ($col === 'sales_area' || $col === 'ro') {   // the workbook cuts some names short (e.g. "BAREILLY RETAIL REGI"): match on the beginning
        $best = null;
        foreach ($maps[$col] as $kk => $x) if (strlen($kk) >= 15 && (strpos($k, $kk) === 0 || strpos($kk, $k) === 0) && ($best === null || $x[1] > $best[1])) $best = $x;
        if ($best) return $best[0];
    }
    return $v;
}
/** The workbook's item name of an order line: a SKU is mapped by its brand (Inventory page), else by the words in its name. FOC is never looked at - the whole quantity is counted. */
function misItemName(string $n, array $brands = []): string {
    $b = $brands[$n] ?? '';
    if ($b === 'tata' || ($b === '' && stripos($n, 'TATA') !== false)) return MIS_ITEM_TATA;
    if ($b === 'hp' || ($b === '' && stripos($n, 'HP DEF') !== false)) return MIS_ITEM_HP;
    return $n;
}
/** Approved orders (the imported history excluded: the workbook rows already cover it) become MIS rows; orders that are no longer approved lose theirs. */
function misSync(PDO $pdo): void {
    if (!misHasOrders($pdo)) return;
    $changed = 0;
    $changed += (int)$pdo->exec("DELETE r FROM `" . MIS_T . "` r WHERE r.src = 'order' AND NOT EXISTS (
        SELECT 1 FROM `" . MIS_ITEMS . "` i JOIN `" . MIS_ORD . "` o ON o.id = i.order_id WHERE i.id = r.item_id AND o.status = 'approved' AND o.created_by <> 'historical-import')");
    $new = $pdo->query("SELECT i.id iid, o.order_date, o.outlet, o.ro_code, o.district, o.state, o.sales_area, o.ro, o.zone, i.item, i.ea, i.vol
        FROM `" . MIS_ITEMS . "` i JOIN `" . MIS_ORD . "` o ON o.id = i.order_id
        WHERE o.status = 'approved' AND o.created_by <> 'historical-import' AND NOT EXISTS (SELECT 1 FROM `" . MIS_T . "` m WHERE m.item_id = i.id)
        ORDER BY o.order_date, o.id, i.id")->fetchAll();
    if ($new) {
        $maps = misCanonMaps($pdo);
        $brands = [];
        try { $brands = $pdo->query("SELECT name, brand FROM `portal_products` WHERE brand <> ''")->fetchAll(PDO::FETCH_KEY_PAIR); } catch (Throwable $e) { $brands = []; }   // before the brand column existed
        $ins = $pdo->prepare("INSERT IGNORE INTO `" . MIS_T . "` (d, sale_type, outlet, sap, location, district, state, sales_area, ro, zone, item, ea, litres, src, item_id, ver, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'order', ?, 1, 'order', NOW())");
        foreach ($new as $r) {
            $sa = misCanon($maps, 'sales_area', $r['sales_area']);
            $ins->execute([substr((string)$r['order_date'], 0, 10), MIS_SALE_TYPE, $r['outlet'], $r['ro_code'] !== '' ? $r['ro_code'] : null, $sa, misCanon($maps, 'district', $r['district']),
                misCanon($maps, 'state', $r['state']), $sa, misCanon($maps, 'ro', $r['ro']), misCanon($maps, 'zone', $r['zone']), misItemName((string)$r['item'], $brands),
                (float)$r['ea'], (float)$r['vol'], (int)$r['iid']]);
            $changed += $ins->rowCount();
        }
    }
    if ($changed > 0) misBump($pdo, 'orders');
}

// ── reading ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function misN($v) { if ($v === null) return null; $f = (float)$v; return $f == floor($f) ? (int)$f : round($f, 2); }
function misRowOut(array $r): array {
    return ['id' => (int)$r['id'], 'd' => $r['d'], 't' => $r['sale_type'], 'o' => $r['outlet'], 's' => $r['sap'], 'l' => $r['location'], 'di' => $r['district'], 'st' => $r['state'],
        'sa' => $r['sales_area'], 'ro' => $r['ro'], 'z' => $r['zone'], 'i' => $r['item'], 'e' => misN($r['ea']), 'v' => misN($r['litres']), 'src' => $r['src'], 'ver' => (int)$r['ver']];
}
/** All rows in workbook order, in the shape the report builder wants. */
function misAllRows(PDO $pdo): array {
    $out = [];
    [$ssql, $sp] = misScopeSql($pdo);
    $st = $pdo->prepare("SELECT id, d, sale_type, outlet, sap, location, district, state, sales_area, ro, zone, item, ea, litres, xs FROM `" . MIS_T . "` WHERE gone = 0$ssql ORDER BY id");
    $st->execute($sp);
    foreach ($st->fetchAll() as $r) {
        $out[] = ['d' => $r['d'], 't' => $r['sale_type'], 'o' => $r['outlet'], 's' => $r['sap'], 'l' => $r['location'], 'di' => $r['district'], 'st' => $r['state'], 'sa' => $r['sales_area'],
            'ro' => $r['ro'], 'z' => $r['zone'], 'i' => $r['item'], 'e' => $r['ea'] === null ? null : misN($r['ea']), 'v' => $r['litres'] === null ? null : misN($r['litres']), 'x' => $r['xs']];
    }
    return $out;
}
function misPivots(PDO $pdo): array {
    $files = misZipRead(MIS_DATA_DIR . '/template.xlsx', ['xl/pivotCache/pivotCacheDefinition2.xml', 'xl/pivotCache/pivotCacheDefinition3.xml', 'xl/pivotTables/pivotTable3.xml', 'xl/pivotTables/pivotTable4.xml', 'xl/pivotTables/pivotTable5.xml', 'xl/pivotTables/pivotTable6.xml']);
    $c3 = new MisCache($files['xl/pivotCache/pivotCacheDefinition3.xml']); $c2 = new MisCache($files['xl/pivotCache/pivotCacheDefinition2.xml']);
    $defs = [3 => new MisPivotDef($files['xl/pivotTables/pivotTable3.xml']), 4 => new MisPivotDef($files['xl/pivotTables/pivotTable4.xml']),
             5 => new MisPivotDef($files['xl/pivotTables/pivotTable5.xml']), 6 => new MisPivotDef($files['xl/pivotTables/pivotTable6.xml'])];
    $rows = misAllRows($pdo);
    foreach ($rows as $r) foreach (array_keys(MIS_FIELD_KEY) as $f) { $c3->idx($f, misRowVal($r, $f)); $c2->idx($f, misRowVal($r, $f)); }
    $m = misPivotModel($rows, $defs, [3 => $c3, 4 => $c3, 5 => $c2, 6 => $c2]);
    $out = [];
    foreach ($m as $pid => $p) {
        $out[$pid] = ['months' => $p['months'], 'rows' => array_map(fn($o) => ['k' => $o['k'], 'l' => $o['l'], 'c' => $o['c'], 't' => $o['t'] === null ? null : misN($o['t'])], $p['rows'])];
        foreach ($out[$pid]['rows'] as &$o) $o['c'] = array_map('misN', $o['c']);
        unset($o);
    }
    return $out;
}
function misWhere(array $q, array &$args, PDO $pdo): string {
    $w = ['gone = 0'];
    if (!empty($q['month']) && preg_match('/^(\d{4})-(\d{2})$/', $q['month'], $m)) {
        $w[] = 'd >= ? AND d < ?'; $args[] = "$m[1]-$m[2]-01"; $args[] = date('Y-m-d', strtotime("$m[1]-$m[2]-01 +1 month"));
    }
    foreach (['zone' => 'zone', 'state' => 'state'] as $k => $col) if (isset($q[$k]) && $q[$k] !== '') { $w[] = "`$col` = ?"; $args[] = $q[$k]; }
    $s = trim((string)($q['q'] ?? ''));
    if ($s !== '') { $w[] = "LOWER(CONCAT_WS(' ', outlet, sap, location, district, sales_area, ro, item, state, zone)) LIKE ?"; $args[] = '%' . mb_strtolower(str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $s)) . '%'; }
    [$ssql, $sp] = misScopeSql($pdo);   // only the rows of the user's zone / regions
    if ($ssql !== '') { $w[] = substr($ssql, 5); foreach ($sp as $x) $args[] = $x; }
    return implode(' AND ', $w);
}
function misDistinct(PDO $pdo, string $col): array {
    [$ssql, $sp] = misScopeSql($pdo);
    $st = $pdo->prepare("SELECT DISTINCT `$col` FROM `" . MIS_T . "` WHERE gone = 0$ssql AND `$col` IS NOT NULL AND `$col` <> '' ORDER BY `$col` LIMIT 400");
    $st->execute($sp);
    return $st->fetchAll(PDO::FETCH_COLUMN);
}
/** Rows and litres per month, of the rows the user may see. */
function misMonths(PDO $pdo): array {
    [$ssql, $sp] = misScopeSql($pdo);
    $st = $pdo->prepare("SELECT DATE_FORMAT(d,'%Y-%m') m, COUNT(*) n, SUM(litres) lt FROM `" . MIS_T . "` WHERE gone = 0$ssql GROUP BY m ORDER BY m");
    $st->execute($sp);
    return $st->fetchAll();
}
function misMonthTitle(): string { return 'MIS MTD ' . date('F Y'); }

function misGet(PDO $pdo, array $me, array $q, ?string $warn = null): void {
    $args = []; $where = misWhere($q, $args, $pdo);
    $per = max(10, min(MIS_PER_MAX, (int)($q['per'] ?? 100)));
    $tot = $pdo->prepare("SELECT COUNT(*) n, COALESCE(SUM(ea),0) ea, COALESCE(SUM(litres),0) lt FROM `" . MIS_T . "` WHERE $where"); $tot->execute($args); $t = $tot->fetch();
    $pages = max(1, (int)ceil(((int)$t['n']) / $per)); $page = max(1, min($pages, (int)($q['page'] ?? 1)));
    $dir = ($q['sort'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';
    $st = $pdo->prepare("SELECT * FROM `" . MIS_T . "` WHERE $where ORDER BY d $dir, id $dir LIMIT " . $per . " OFFSET " . (($page - 1) * $per)); $st->execute($args);
    $out = [
        'rev' => (int)misMeta($pdo, 'rev'), 'can_edit' => $me['edit'], 'is_admin' => $me['admin'], 'today' => date('Y-m-d'), 'title' => misMonthTitle(),
        'rows' => array_map('misRowOut', $st->fetchAll()), 'total' => (int)$t['n'], 'page' => $page, 'pages' => $pages, 'per' => $per,
        'sum' => ['ea' => misN($t['ea']), 'litres' => misN($t['lt'])],
        'months' => array_map(fn($r) => ['m' => $r['m'], 'n' => (int)$r['n'], 'lt' => misN($r['lt'])], misMonths($pdo)),
        'zones' => misDistinct($pdo, 'zone'), 'states' => misDistinct($pdo, 'state'), 'warn' => $warn,
    ];
    $meta = $pdo->query("SELECT `by`, `at` FROM `" . MIS_META . "` WHERE k = 'rev'")->fetch();
    $out['last'] = $meta ? ['by' => $meta['by'], 'at' => $meta['at']] : null;
    if (!empty($q['lists'])) $out['lists'] = ['t' => misDistinct($pdo, 'sale_type'), 'z' => $out['zones'], 'st' => $out['states'], 'ro' => misDistinct($pdo, 'ro'), 'sa' => misDistinct($pdo, 'sales_area'), 'i' => misDistinct($pdo, 'item')];
    if (!empty($q['pivots'])) $out['pivots'] = misPivots($pdo);
    misOut($out);
}

// ── editing ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function misClean($v): ?string {
    if ($v === null) return null;
    $s = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', (string)$v));
    return $s === '' ? null : $s;
}
/** The two items are written exactly as the workbook writes them (HP DEF with its trailing no-break space), however they were typed. */
function misCanonItem(string $s): string {
    $k = misNormKey($s);
    return $k === misNormKey(MIS_ITEM_HP) ? MIS_ITEM_HP : ($k === misNormKey(MIS_ITEM_TATA) ? MIS_ITEM_TATA : $s);
}
/** Validate the changed fields: returns [column => value] or fails. */
function misCheckFields(array $f, bool $create): array {
    $out = [];
    foreach ($f as $k => $v) {
        if (!isset(MIS_FIELDS[$k])) continue;
        [$col, $kind] = MIS_FIELDS[$k];
        if ($kind === 'date') {
            if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1]) || (int)$m[1] < 2020 || (int)$m[1] > 2100) misFail(422, 'Enter a valid date.');
            $out[$col] = $v;
        } elseif ($kind === 'num') {
            if ($v === null || $v === '') { $out[$col] = null; continue; }
            if (!is_numeric($v) || (float)$v < 0 || (float)$v > 1e9) misFail(422, 'Enter a valid number (0 or more) for ' . ($k === 'e' ? 'Volume in EA' : 'Volume in Litres') . '.');
            $out[$col] = round((float)$v, 2);
        } else {
            $s = misClean($v);
            if ($s !== null && mb_strlen($s) > $kind) misFail(422, 'Text is too long (at most ' . $kind . ' characters).');
            if ($col === 'item' && $s !== null) $s = misCanonItem($s);
            $out[$col] = $s;
        }
    }
    if ($create && !isset($out['d'])) misFail(422, 'The date is required.');
    return $out;
}
// ── change log (who changed what on the MIS page) ───────────────────────────────────────────────────────────────────
const MIS_LBL = ['d' => 'Date', 'sale_type' => 'Sale type', 'outlet' => 'Outlet', 'sap' => 'SAP code', 'location' => 'Location', 'district' => 'District', 'state' => 'State', 'sales_area' => 'Sales area',
                 'ro' => 'Region (RO)', 'zone' => 'Zone', 'item' => 'Item', 'ea' => 'Volume (EA)', 'litres' => 'Volume (Litres)'];
function misLogVal($v): ?string {
    if ($v === null || $v === '') return null;
    return is_numeric($v) && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$v) ? rtrim(rtrim(number_format((float)$v, 2, '.', ''), '0'), '.') : trim((string)$v);
}
/** "10 Nov 2026 - OUTLET - SAP 123456 - item - 106 EA": one MIS row in a line of text. */
function misLogRow(array $r): string {
    $p = [(string)($r['d'] ?? '')];
    foreach (['outlet', 'sap', 'item'] as $c) if (($r[$c] ?? '') !== '' && $r[$c] !== null) $p[] = ($c === 'sap' ? 'SAP ' : '') . trim((string)$r[$c]);
    if (($r['ea'] ?? null) !== null) $p[] = misLogVal($r['ea']) . ' EA';
    return implode(' - ', $p);
}
function misLogTitle(array $r): string {
    return trim(($r['outlet'] ?? '') !== '' && $r['outlet'] !== null ? $r['outlet'] : 'MIS row') . ' - ' . ($r['d'] ?? '') . (($r['sap'] ?? '') !== '' && $r['sap'] !== null ? ' - SAP ' . $r['sap'] : '');
}
/** [[label, from, to]] of the columns whose value really changed. */
function misLogDiff(array $old, array $set): array {
    $out = [];
    foreach ($set as $c => $v) {
        $o = $old[$c] ?? null;
        $same = (in_array($c, ['ea', 'litres'], true) && ($o === null || $o === '') === ($v === null || $v === '')) ? (($v === null || $v === '') || abs((float)$o - (float)$v) < 0.005) : ((string)$o === (string)$v);
        if (!$same) $out[] = [MIS_LBL[$c] ?? $c, misLogVal($o), misLogVal($v)];
    }
    return $out;
}
function misLogFilter(array $q): string {
    $p = [];
    if (!empty($q['month'])) $p[] = 'month ' . $q['month'];
    if (!empty($q['zone'])) $p[] = 'zone ' . $q['zone'];
    if (!empty($q['state'])) $p[] = 'state ' . $q['state'];
    if (trim((string)($q['q'] ?? '')) !== '') $p[] = 'search "' . trim((string)$q['q']) . '"';
    return $p ? implode(', ', $p) : 'no filter (every row)';
}
function misSaveRow(PDO $pdo, array $me, array $body): void {
    if (!$me['edit']) misFail(403, 'Only the Super Admin and Rohan Energy officers can edit the MIS.');
    $f = is_array($body['f'] ?? null) ? $body['f'] : [];
    $id = (int)($body['id'] ?? 0);
    if ($id) {
        $st = $pdo->prepare("SELECT * FROM `" . MIS_T . "` WHERE id = ? AND gone = 0"); $st->execute([$id]); $old = $st->fetch();
        if (!$old) misFail(404, 'This row no longer exists. Reload the page.');
        if (!misRowInScope($pdo, $old)) misFail(403, MIS_OUTSIDE);
        if (isset($body['ver']) && (int)$body['ver'] !== (int)$old['ver']) misFail(409, 'This row was changed by ' . ($old['updated_by'] ?: 'someone else') . ' in the meantime. Reload the page and try again.');
        $set = misCheckFields($f, false);
        if (!misRowInScope($pdo, array_merge($old, $set))) misFail(403, 'The row would move outside your zone / regions. Keep its Region (RO)' . (!empty(misScope()['sas']) ? ' and Sales area' : '') . ' inside what you handle.');
        // litres follow the EA (EA x 20) unless they were typed in differently before
        if (array_key_exists('ea', $set) && !array_key_exists('litres', $set) && $set['ea'] !== null && ($old['litres'] === null || ($old['ea'] !== null && $old['litres'] !== null && abs((float)$old['litres'] - (float)$old['ea'] * 20) < 0.005)))
            $set['litres'] = round($set['ea'] * 20, 2);
        if (!$set) misFail(400, 'Nothing was changed.');
        $logChg = misLogDiff($old, $set);
        $sql = []; $args = [];
        foreach ($set as $c => $v) { $sql[] = "`$c` = ?"; $args[] = $v; }
        $args[] = $me['label']; $args[] = $id;
        $pdo->prepare("UPDATE `" . MIS_T . "` SET " . implode(', ', $sql) . ", ver = ver + 1, updated_by = ?, updated_at = NOW() WHERE id = ?")->execute($args);
        if ($logChg) chgAdd($pdo, 'mis', 'edited', misLogTitle($old), 'MIS row edited', $logChg);
    } else {
        $set = misCheckFields($f, true);
        if (!misRowInScope($pdo, $set)) misFail(403, 'A new row has to belong to your zone / regions: fill in a Region (RO)' . (!empty(misScope()['sas']) ? ' and Sales area' : '') . ' you handle.');
        if (!array_key_exists('litres', $set) || $set['litres'] === null) { if (isset($set['ea'])) $set['litres'] = round($set['ea'] * 20, 2); }
        $cols = array_keys($set); $args = array_values($set); $args[] = $me['label'];
        $pdo->prepare("INSERT INTO `" . MIS_T . "` (`" . implode('`,`', $cols) . "`, src, ver, updated_by, updated_at) VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ", 'sheet', 1, ?, NOW())")->execute($args);
        $id = (int)$pdo->lastInsertId();
        $logChg = [];
        foreach ($set as $c => $v) if ($v !== null && $v !== '') $logChg[] = [MIS_LBL[$c] ?? $c, null, misLogVal($v)];
        chgAdd($pdo, 'mis', 'added', misLogTitle($set), 'MIS row added', $logChg);
    }
    misBump($pdo, $me['label']);
    $st = $pdo->prepare("SELECT * FROM `" . MIS_T . "` WHERE id = ?"); $st->execute([$id]);
    misOut(['row' => misRowOut($st->fetch()), 'rev' => (int)misMeta($pdo, 'rev')]);
}
function misDeleteRow(PDO $pdo, array $me, array $body): void {
    if (!$me['edit']) misFail(403, 'Only the Super Admin and Rohan Energy officers can edit the MIS.');
    $id = (int)($body['id'] ?? 0);
    $st = $pdo->prepare("SELECT * FROM `" . MIS_T . "` WHERE id = ? AND gone = 0"); $st->execute([$id]); $gone = $st->fetch();
    if (!$gone) misFail(404, 'This row no longer exists. Reload the page.');
    if (!misRowInScope($pdo, $gone)) misFail(403, MIS_OUTSIDE);
    $src = $gone['src'];
    // a row that came from an order stays as a hidden mark, otherwise the next sync would bring it back
    if ($src === 'order') $pdo->prepare("UPDATE `" . MIS_T . "` SET gone = 1, ver = ver + 1, updated_by = ?, updated_at = NOW() WHERE id = ?")->execute([$me['label'], $id]);
    else $pdo->prepare("DELETE FROM `" . MIS_T . "` WHERE id = ?")->execute([$id]);
    $logChg = [];
    foreach (MIS_LBL as $c => $l) if (($gone[$c] ?? null) !== null && $gone[$c] !== '') $logChg[] = [$l, misLogVal($gone[$c]), null];
    chgAdd($pdo, 'mis', 'deleted', misLogTitle($gone), 'MIS row deleted', $logChg);
    misBump($pdo, $me['label']);
    misOut(['rev' => (int)misMeta($pdo, 'rev')]);
}
/** Delete several rows at once: the ticked ids, or every row of the current filter ("select all"). Rows that came from an order stay as hidden marks (see misDeleteRow). */
function misDeleteRows(PDO $pdo, array $me, array $body): void {
    if (!$me['edit']) misFail(403, 'Only the Super Admin and Rohan Energy officers can edit the MIS.');
    $pdo->beginTransaction();
    $logLines = []; $logTarget = '';
    if (!empty($body['all'])) {
        $q = is_array($body['filter'] ?? null) ? $body['filter'] : [];
        $args = []; $where = misWhere($q, $args, $pdo);
        $st = $pdo->prepare("SELECT d, outlet, sap, item, ea FROM `" . MIS_T . "` WHERE $where ORDER BY d, id LIMIT 100"); $st->execute($args);
        foreach ($st->fetchAll() as $lr) $logLines[] = misLogRow($lr);
        $logTarget = 'All rows of the current filter: ' . misLogFilter($q);
        $st = $pdo->prepare("UPDATE `" . MIS_T . "` SET gone = 1, ver = ver + 1, updated_by = ?, updated_at = NOW() WHERE $where AND src = 'order'");
        $st->execute(array_merge([$me['label']], $args)); $n = $st->rowCount();
        $st = $pdo->prepare("DELETE FROM `" . MIS_T . "` WHERE $where AND src <> 'order'");
        $st->execute($args); $n += $st->rowCount();
    } else {
        $ids = array_values(array_unique(array_filter(array_map('intval', is_array($body['ids'] ?? null) ? $body['ids'] : []), fn($i) => $i > 0)));
        if (!$ids) { $pdo->rollBack(); misFail(400, 'No rows were selected.'); }
        $n = 0;
        [$ssql, $sp] = misScopeSql($pdo);   // ticked rows outside the user's zone / regions are left alone
        $in0 = implode(',', array_fill(0, min(count($ids), 100), '?'));
        $st = $pdo->prepare("SELECT d, outlet, sap, item, ea FROM `" . MIS_T . "` WHERE gone = 0 AND id IN ($in0)$ssql ORDER BY d, id"); $st->execute(array_merge(array_slice($ids, 0, 100), $sp));
        foreach ($st->fetchAll() as $lr) $logLines[] = misLogRow($lr);
        $logTarget = 'Selected rows';
        foreach (array_chunk($ids, 500) as $chunk) {
            $in = implode(',', array_fill(0, count($chunk), '?'));
            $st = $pdo->prepare("UPDATE `" . MIS_T . "` SET gone = 1, ver = ver + 1, updated_by = ?, updated_at = NOW() WHERE gone = 0 AND src = 'order' AND id IN ($in)$ssql");
            $st->execute(array_merge([$me['label']], $chunk, $sp)); $n += $st->rowCount();
            $st = $pdo->prepare("DELETE FROM `" . MIS_T . "` WHERE gone = 0 AND src <> 'order' AND id IN ($in)$ssql");
            $st->execute(array_merge($chunk, $sp)); $n += $st->rowCount();
        }
    }
    if ($n > 0) misBump($pdo, $me['label']);
    $pdo->commit();
    if ($n > 0) chgAdd($pdo, 'mis', 'deleted', $logTarget, 'Deleted ' . $n . ' MIS row' . ($n === 1 ? '' : 's'), [], $logLines, $n > count($logLines) ? 'The first ' . count($logLines) . ' of ' . $n . ' rows are listed.' : '');   // (after the commit: creating the log table would end the transaction)
    misOut(['deleted' => $n, 'rev' => (int)misMeta($pdo, 'rev')]);
}

/** One uploaded row -> [column => value], or null when it has no usable date (such rows are counted as skipped). Values are cleaned like a typed cell. */
function misImportRow($r): ?array {
    if (!is_array($r)) return null;
    $out = [];
    $d = $r['d'] ?? null;
    if (!is_string($d) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1]) || (int)$m[1] < 2020 || (int)$m[1] > 2100) return null;
    $out['d'] = $d;
    foreach (MIS_FIELDS as $k => [$col, $kind]) {
        if ($k === 'd') continue;
        $v = $r[$k] ?? null;
        if ($kind === 'num') {
            if ($v === null || $v === '') { $out[$col] = null; continue; }
            if (is_string($v)) $v = str_replace(',', '', $v);
            $out[$col] = is_numeric($v) && (float)$v >= 0 && (float)$v <= 1e9 ? round((float)$v, 2) : null;
        } else {
            $s = misClean($v);
            if ($s !== null && mb_strlen($s) > $kind) $s = mb_substr($s, 0, $kind);
            $out[$col] = $s;
        }
    }
    // the workbook writes the HP DEF item with a trailing no-break space; the portal's own rows use the same spelling, so the reports group them together
    if (isset($out['item'])) $out['item'] = misCanonItem($out['item']);
    if ($out['litres'] === null && $out['ea'] !== null) $out['litres'] = round($out['ea'] * 20, 2);
    return $out;
}
/**
 * Excel upload (the file is read in the browser; the rows arrive here). mode 'replace' = the uploaded sheet becomes the MIS: every current row goes
 * (rows that came from approved orders stay as hidden marks so they are not brought back), mode 'append' = the rows are added to the current ones.
 * Orders approved from now on are added to the MIS as before.
 */
function misImport(PDO $pdo, array $me, array $body): void {
    if (!$me['edit']) misFail(403, 'Only the Super Admin and Rohan Energy officers can edit the MIS.');
    $rows = $body['rows'] ?? null; $mode = ($body['mode'] ?? '') === 'append' ? 'append' : 'replace';
    if (!is_array($rows) || !$rows) misFail(400, 'The file has no rows to import.');
    if (count($rows) > 30000) misFail(413, 'Too many rows in one file (at most 30,000).');
    $ok = []; $skipped = 0;
    foreach ($rows as $r) { $x = misImportRow($r); if ($x) $ok[] = $x; else $skipped++; }
    if (!$ok) misFail(422, 'None of the rows has a valid date, so nothing was imported.');
    if (misScope() !== null) {   // somebody who sees a part of the MIS may add rows to that part - never replace the whole MIS or add rows of other regions
        $mode = 'append';
        $keep = [];
        foreach ($ok as $a) { if (misRowInScope($pdo, $a)) $keep[] = $a; else $skipped++; }
        $ok = $keep;
        if (!$ok) misFail(422, 'None of the rows belongs to your zone / regions, so nothing was imported.');
    }
    $cols = ['d', 'sale_type', 'outlet', 'sap', 'location', 'district', 'state', 'sales_area', 'ro', 'zone', 'item', 'ea', 'litres'];
    $pdo->beginTransaction();
    $removed = 0;
    if ($mode === 'replace') {
        $st = $pdo->prepare("UPDATE `" . MIS_T . "` SET gone = 1, ver = ver + 1, updated_by = ?, updated_at = NOW() WHERE gone = 0 AND src = 'order'"); $st->execute([$me['label']]); $removed += $st->rowCount();
        $removed += (int)$pdo->exec("DELETE FROM `" . MIS_T . "` WHERE src <> 'order'");
    }
    $now = date('Y-m-d H:i:s');
    foreach (array_chunk($ok, 250) as $chunk) {
        $ph = []; $args = [];
        foreach ($chunk as $a) { $ph[] = '(' . implode(',', array_fill(0, count($cols), '?')) . ",'sheet',1,?,?)"; foreach ($cols as $c) $args[] = $a[$c]; $args[] = $me['label']; $args[] = $now; }
        $pdo->prepare("INSERT INTO `" . MIS_T . "` (`" . implode('`,`', $cols) . "`, src, ver, updated_by, updated_at) VALUES " . implode(',', $ph))->execute($args);
    }
    $name = mb_substr(preg_replace('/[\x00-\x1F]/', '', (string)($body['name'] ?? '')), 0, 90);
    misMetaSet($pdo, 'seeded', '1', $me['label']);
    misMetaSet($pdo, 'upload', $name, $me['label']);
    misBump($pdo, $me['label']);
    $pdo->commit();
    chgAdd($pdo, 'mis', 'import', $name !== '' ? $name : 'Excel file', $mode === 'replace' ? 'Excel upload - the MIS was replaced by the sheet' : 'Excel upload - rows added to the MIS', [],
           [], count($ok) . ' rows imported' . ($skipped ? ', ' . $skipped . ' skipped (no valid date)' : '') . ($mode === 'replace' ? ', ' . $removed . ' earlier rows removed' : '') . '.');
    misOut(['imported' => count($ok), 'skipped' => $skipped, 'removed' => $removed, 'mode' => $mode, 'rev' => (int)misMeta($pdo, 'rev')]);
}

/** Fill a new row from an outlet of the portal (by SAP code). */
function misOutlet(PDO $pdo, string $sap): void {
    $sap = trim($sap);
    $r = null;
    try {
        $st = $pdo->prepare("SELECT outlet_name, state, ro, district, sales_area, zone FROM `" . MIS_OUT . "` WHERE sap_code = ?"); $st->execute([$sap]); $r = $st->fetch();
    } catch (Exception $e) { $r = null; }
    if (!$r) misOut(['found' => false]);
    $maps = misCanonMaps($pdo); $sa = misCanon($maps, 'sales_area', $r['sales_area']);
    misOut(['found' => true, 'f' => ['o' => $r['outlet_name'], 'l' => $sa, 'di' => misCanon($maps, 'district', $r['district']), 'st' => misCanon($maps, 'state', $r['state']), 'sa' => $sa,
        'ro' => misCanon($maps, 'ro', $r['ro']), 'z' => misCanon($maps, 'zone', $r['zone']), 't' => MIS_SALE_TYPE]]);
}

function misDownload(PDO $pdo): void {
    try { $bin = misBuildXlsx(misAllRows($pdo)); }
    catch (Throwable $e) { error_log('mis.php download: ' . $e->getMessage()); misFail(500, 'The Excel file could not be prepared. Please try again.'); }
    $name = misMonthTitle() . '.xlsx';
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="' . $name . '"; filename*=UTF-8\'\'' . rawurlencode($name));
    header('Content-Length: ' . strlen($bin));
    echo $bin; exit;
}
