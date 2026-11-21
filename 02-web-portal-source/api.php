<?php
/**
 * api.php — HPCL DEF Dashboard REST API
 * Handles: GET sales data | POST add / update / delete / import
 * Since UPDATE 19 the sales rows are the MIS rows (portal_mis_rows): Dashboard, Raw Data and MIS always show the same figures, and every
 * change made here (Admin tab, Data Entry approvals, uploads) is a change of the MIS. The old sheet table (DB_TABLE) is no longer read.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/users-store.php';   // reads users.php fresh every time (never a stale OPcache copy)
require_once __DIR__ . '/mis-core.php';       // the MIS rows: the one source of the Dashboard, Raw Data and MIS
require_once __DIR__ . '/regions.php';        // the zones / states / regions the Admin "Add single entry" form offers

header('Content-Type: application/json; charset=utf-8');
// Only allow requests from same origin (same domain)
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && parse_url($origin, PHP_URL_HOST) === $_SERVER['HTTP_HOST']) {
    header('Access-Control-Allow-Origin: ' . $origin);
}

// ── PDO connection ────────────────────────────────────────────────────────────
function getDB(): PDO {
    try {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
        return $pdo;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'DB connection failed: ' . $e->getMessage()]);
        exit;
    }
}

// ── Router ────────────────────────────────────────────────────────────────────
$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $_GET['action'] ?? ($body['action'] ?? '');
$pdo    = getDB();

// Start session for auth checks on pending endpoints
session_start();

// CSRF validation for POST requests (skip GET-based reads)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrf = $body['csrf'] ?? '';
    if (empty($_SESSION['csrf_token']) || $csrf !== $_SESSION['csrf_token']) {
        http_response_code(403);
        echo json_encode(['error' => 'Invalid security token. Please refresh the page and try again.']);
        exit;
    }
}

switch ($action) {
    case 'sales':          getSales($pdo);              break;
    case 'add':            addEntry($pdo, $body);       break;
    case 'update':         updateEntry($pdo, $body);    break;
    case 'delete':         deleteEntry($pdo, $body);    break;
    case 'import':         importData($pdo, $body);     break;
    case 'ro_lookup':      roLookup($pdo);              break;
    case 'ref_lists':      refLists();                  break;
    case 'add_pending':    addPending($pdo, $body);     break;
    case 'list_pending':   listPending($pdo);           break;
    case 'my_pending':     myPending($pdo);             break;
    case 'approve':        approvePending($pdo, $body); break;
    case 'reject':         rejectPending($pdo, $body);  break;
    case 'edit_pending':   editPending($pdo, $body);    break;
    case 'delete_pending': deletePending($pdo, $body);  break;
    case 'audit_log':      getAuditLog($pdo);           break;
    case 'pending_count':  pendingCount($pdo);          break;
    case 'save_note':      saveNote($pdo, $body);       break;
    case 'get_targets':    getTargets($pdo);            break;
    case 'save_target':    saveTarget($pdo, $body);     break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action: ' . htmlspecialchars($action)]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a column name by stripping non-alphanumeric chars for fuzzy matching.
 */
function norm(string $s): string {
    return strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $s));
}

/**
 * Auto-detect actual column names in the table by fuzzy-matching against the
 * config map. Fills in any gaps the config left blank.
 * Returns the resolved column map (same keys as DB_COL_MAP).
 */
function resolveColumns(PDO $pdo): array {
    $table    = DB_TABLE;
    $cfgMap   = DB_COL_MAP;

    // Fetch actual columns from the table
    $stmt     = $pdo->query("SHOW COLUMNS FROM `{$table}`");
    $actual   = $stmt->fetchAll(PDO::FETCH_COLUMN); // just the Field names

    // Index actual columns by their normalised form for fuzzy lookup
    $normIdx  = [];
    foreach ($actual as $col) {
        $normIdx[norm($col)] = $col;
    }

    // Helper: find best match for a search term among actual columns
    $fuzzy = function(array $needles) use ($normIdx): ?string {
        foreach ($needles as $n) {
            if (isset($normIdx[norm($n)])) return $normIdx[norm($n)];
        }
        // partial match
        foreach ($needles as $n) {
            $ln = norm($n);
            foreach ($normIdx as $k => $col) {
                if (strpos($k, $ln) !== false || strpos($ln, $k) !== false) return $col;
            }
        }
        return null;
    };

    $resolved = [];

    // id — look for auto-increment primary key
    $pkStmt   = $pdo->query("SHOW KEYS FROM `{$table}` WHERE Key_name = 'PRIMARY'");
    $pk       = $pkStmt->fetch();
    $resolved['id'] = $pk ? $pk['Column_name'] : null;

    // For each field, prefer config value if it actually exists in the table,
    // otherwise fall back to fuzzy detection.
    $fields = [
        'date'       => ['Date', 'date'],
        'sale_type'  => ['Sale Type', 'SaleType', 'sale_type'],
        'outlet'     => ['Retail Outlet Name', 'Outlet Name', 'Outlet', 'Bazaar Direct Customer'],
        'ro_code'    => ['RO Code', 'ROCode', 'ro_code'],
        'location'   => ['Location', 'Address', 'Location /Address'],
        'district'   => ['District'],
        'state'      => ['State'],
        'sales_area' => ['Sales Area', 'SalesArea'],
        'ro'         => ['Regional Office', 'RegionalOffice'],
        'zone'       => ['Zone'],
        'item'       => ['Item Name', 'Item', 'ItemName'],
        'ea'              => ['Volume in EA', 'VolumeEA', 'Volume EA', 'EA'],
        'vol'             => ['Volume in Litres', 'Volume in Liters', 'VolumeLitres', 'Litres', 'Liters'],
        'order_status'    => ['Status as Per Sales Order Sheet', 'Order Status'],
        'invoice_no'      => ['Invoice No', 'Invoice Number'],
        'invoice_amount'  => ['Invoice Amount', 'Invoice Amt'],
        'submitted_hpcl'  => ['Submitted to HPCL for PO', 'Submitted HPCL'],
        'email_date'      => ['Date of Submission via Email', 'Email Date'],
        'vss_date'        => ['Submission date on VSS', 'VSS Date'],
        'payment_status'  => ['Status', 'Payment Status'],
        'tata_pay_date'   => ['Date of TATA Payment Received', 'TATA Payment Date'],
        'notes'           => ['Notes', 'notes'],
    ];

    foreach ($fields as $key => $aliases) {
        // If the config has a value AND it exists in the table, use it
        $cfgVal = $cfgMap[$key] ?? '';
        if ($cfgVal && in_array($cfgVal, $actual, true)) {
            $resolved[$key] = $cfgVal;
            continue;
        }
        // Otherwise auto-detect
        $resolved[$key] = $fuzzy(array_merge([$cfgVal], $aliases));
    }

    return $resolved;
}

/**
 * Clean up a cell value from the DB (trim, strip replacement chars from bad encoding).
 */
function cleanStr(?string $v): string {
    if ($v === null) return '';
    $v = trim(str_replace("\xC2\xA0", ' ', $v));   // no-break spaces of the workbook count as spaces
    $v = str_replace("\xEF\xBF\xBD", '', $v);
    return $v;
}

function ensureAuditTable(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `audit_log` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `action` VARCHAR(50) NOT NULL,
        `username` VARCHAR(50),
        `details` TEXT,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
}

function logAudit(PDO $pdo, string $action, ?string $details = null): void {
    try {
        ensureAuditTable($pdo);
        $user = $_SESSION['hpcl_user']['username'] ?? 'system';
        $stmt = $pdo->prepare("INSERT INTO `audit_log` (`action`,`username`,`details`,`created_at`) VALUES (?,?,?,NOW())");
        $stmt->execute([$action, $user, $details]);
    } catch (\Exception $e) { /* silent */ }
}

function getAuditLog(PDO $pdo): void {
    if (empty($_SESSION['hpcl_user']) || ($_SESSION['hpcl_user']['role'] !== 'superadmin' || ($_SESSION['hpcl_user']['org'] ?? null) === 'hpcl')) {
        http_response_code(403); echo json_encode(['error' => 'Access denied']); return;
    }
    ensureAuditTable($pdo);
    $limit = (int)($_GET['limit'] ?? 100);
    $rows = $pdo->query("SELECT * FROM `audit_log` ORDER BY `created_at` DESC LIMIT {$limit}")->fetchAll();
    echo json_encode(['ok' => true, 'log' => $rows]);
}

function pendingCount(PDO $pdo): void {
    if (empty($_SESSION['hpcl_user'])) {
        echo json_encode(['count' => 0]); return;
    }
    $table = PENDING_TABLE;
    $count = (int) $pdo->query("SELECT COUNT(*) FROM `{$table}` WHERE `status` = 'pending'")->fetchColumn();
    echo json_encode(['count' => $count]);
}

function saveNote(PDO $pdo, array $body): void {
    if (empty($_SESSION['hpcl_user']) || ($_SESSION['hpcl_user']['role'] !== 'superadmin' || ($_SESSION['hpcl_user']['org'] ?? null) === 'hpcl')) {
        http_response_code(403); echo json_encode(['error' => 'Access denied']); return;
    }
    $id = (int)($body['id'] ?? 0);
    $note = trim($body['note'] ?? '');
    if (!$id) { echo json_encode(['error' => 'No id']); return; }
    misEnsureSchema($pdo);   // makes sure the notes column exists
    $pdo->prepare("UPDATE `" . MIS_T . "` SET `notes` = ? WHERE id = ?")->execute([$note ?: null, $id]);
    misBump($pdo, $_SESSION['hpcl_user']['username'] ?? 'system');
    logAudit($pdo, 'note', 'Note on id=' . $id . ': ' . substr($note, 0, 80));
    echo json_encode(['ok' => true]);
}

// ── Targets ──────────────────────────────────────────────────────────────────
function ensureTargetsTable(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `targets` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `month` VARCHAR(7) NOT NULL,
        `scope_type` VARCHAR(20) NOT NULL,
        `scope_value` VARCHAR(100) NOT NULL,
        `target_vol` INT NOT NULL DEFAULT 0,
        UNIQUE KEY `uk_target` (`month`,`scope_type`,`scope_value`)
    )");
}

function getTargets(PDO $pdo): void {
    ensureTargetsTable($pdo);
    $month = $_GET['month'] ?? '';
    if ($month) {
        $stmt = $pdo->prepare("SELECT * FROM `targets` WHERE `month` = ?");
        $stmt->execute([$month]);
    } else {
        $stmt = $pdo->query("SELECT * FROM `targets` ORDER BY `month` DESC");
    }
    echo json_encode(['ok' => true, 'targets' => $stmt->fetchAll()]);
}

function saveTarget(PDO $pdo, array $body): void {
    if (empty($_SESSION['hpcl_user']) || ($_SESSION['hpcl_user']['role'] !== 'superadmin' || ($_SESSION['hpcl_user']['org'] ?? null) === 'hpcl')) {
        http_response_code(403); echo json_encode(['error' => 'Access denied']); return;
    }
    ensureTargetsTable($pdo);
    $month = trim($body['month'] ?? '');
    $scopeType = trim($body['scope_type'] ?? '');
    $scopeValue = trim($body['scope_value'] ?? '');
    $targetVol = (int)($body['target_vol'] ?? 0);

    if (!$month || !$scopeType || !$scopeValue) {
        echo json_encode(['error' => 'month, scope_type, scope_value required']); return;
    }

    $stmt = $pdo->prepare("INSERT INTO `targets` (`month`,`scope_type`,`scope_value`,`target_vol`) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE `target_vol` = VALUES(`target_vol`)");
    $stmt->execute([$month, $scopeType, $scopeValue, $targetVol]);
    logAudit($pdo, 'target', "Set target {$scopeType}={$scopeValue} month={$month} vol={$targetVol}L");
    echo json_encode(['ok' => true]);
}

// ── Endpoint: GET sales ───────────────────────────────────────────────────────
/** Rows of the dashboard = rows of the MIS (approved orders are brought in first, exactly as the MIS page does). */
function getSales(PDO $pdo): void {
    if (empty($_SESSION['hpcl_user']['username'])) { http_response_code(401); echo json_encode(['error' => 'Not authenticated. Please sign in again.']); return; }
    try { misEnsureSchema($pdo); misSync($pdo); }
    catch (Exception $e) { error_log('api.php sales: ' . $e->getMessage()); if ($pdo->inTransaction()) $pdo->rollBack(); http_response_code(500); echo json_encode(['error' => 'Could not prepare the MIS rows.']); return; }

    $ord = portalOrdersExist($pdo);
    [$ssql, $sp] = misScopeSql($pdo, 'm.');   // the user's own zone / regions only (the super admins see everything)
    // rows that came from an approved order also tell where the order stands (in transit / delivered, payment receipt)
    $sql = "SELECT m.id, m.d, m.sap, m.outlet, m.district, m.state, m.sales_area, m.ro, m.zone, m.item, m.ea, m.litres, m.src, m.notes"
        . ($ord ? ", o.delivery_stage, o.invoice_no, o.voucher_no, i.rate, i.gst, " . ($ord ? portalPaidSql($pdo) : 'NULL') . " AS paid, EXISTS(SELECT 1 FROM `portal_order_files` f WHERE f.order_id = o.id AND f.kind = 'payment') has_receipt" : "")
        . " FROM `" . MIS_T . "` m"
        . ($ord ? " LEFT JOIN `" . MIS_ITEMS . "` i ON i.id = m.item_id LEFT JOIN `" . MIS_ORD . "` o ON o.id = i.order_id" : "")
        . " WHERE m.gone = 0$ssql ORDER BY m.d, m.id";
    $rows = [];
    $stRows = $pdo->prepare($sql); $stRows->execute($sp);
    foreach ($stRows->fetchAll() as $r) {
        $date = (string)$r['d'];
        $fromOrder = $r['src'] === 'order';
        $amt = ''; $status = ''; $pay = ''; $inv = '';
        if ($fromOrder && $ord) {
            $status = ($r['delivery_stage'] ?? '') === 'delivered' ? 'Delivered' : 'In transit';
            $inv = cleanStr((string)(($r['invoice_no'] ?? '') ?: ($r['voucher_no'] ?? '')));
            if ($r['rate'] !== null) $amt = (string)round((float)($r['paid'] ?? $r['ea']) * (float)$r['rate'] * (1 + (float)($r['gst'] ?? 18) / 100));   // the FOC EA are counted in the quantity, not billed
            $pay = (int)$r['has_receipt'] ? 'Payment receipt uploaded' : 'Awaiting payment receipt';
        }
        $ea = misN($r['ea']) ?? 0; $vol = misN($r['litres']) ?? 0;
        if (trim((string)$r['outlet']) === '' && !$ea && !$vol) continue;   // an empty placeholder row of the workbook is not a sale
        $rows[] = [
            'id' => (int)$r['id'], 'date' => $date, 'month' => substr($date, 0, 7), 'day' => (int)substr($date, 8, 2),
            'outlet' => cleanStr((string)$r['outlet']), 'roCode' => cleanStr((string)$r['sap']), 'district' => cleanStr((string)$r['district']), 'state' => cleanStr((string)$r['state']),
            'salesArea' => cleanStr((string)$r['sales_area']), 'ro' => cleanStr((string)$r['ro']), 'zone' => cleanStr((string)$r['zone']),
            'item' => cleanStr((string)$r['item']), 'ea' => $ea, 'vol' => $vol,
            'orderStatus' => $status, 'invoiceNo' => $inv, 'invoiceAmount' => $amt, 'submittedHpcl' => '', 'emailDate' => '', 'vssDate' => '',
            'paymentStatus' => $pay, 'tataPayDate' => '', 'notes' => (string)($r['notes'] ?? ''),
        ] + ($fromOrder ? ['src' => 'orders'] : []);
    }
    $orderSummary = portalOrderSummary($pdo);

    // Strip hidden columns — re-read from users.php for latest permissions
    $hiddenCols = [];
    if (!empty($_SESSION['hpcl_user']['username'])) {
        $usersFile = usersLoad();
        $uname = $_SESSION['hpcl_user']['username'];
        $hiddenCols = $usersFile[$uname]['hidden_cols'] ?? [];
    }
    if (!empty($hiddenCols)) {
        foreach ($rows as &$r) {
            foreach ($hiddenCols as $hc) {
                unset($r[$hc]);
            }
        }
        unset($r);
    }

    echo json_encode(['data' => $rows, 'count' => count($rows), 'orders' => $orderSummary, 'rev' => (int)misMeta($pdo, 'rev')], JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
}

/**
 * The real date (YYYY-MM-DD) of every sheet row, from the raw text of the Date column ('' = could not be read).
 * The column was created as VARCHAR(9), and the sheet mixes formats, so a plain strtotime() put rows into the wrong months:
 *   - 2026-05-31 was cut to "2026-05-3" (only the tens digit of the day survived; "2026-04-0" even became 31 March);
 *   - 9/5/26 can be 9 May (day/month) or 5 September (month/day) - both are used in the sheet.
 * Rules: a full ISO date is taken as it is; a cut ISO date keeps its (exact) month and its rows are spread over the 10-day block they
 * belong to in sheet order; day/month vs month/day is decided by the value (13+ cannot be a month), a date in the future is impossible,
 * and otherwise by whichever reading lies closest to the neighbouring rows (the sheet is kept in date order).
 * So months are exact; the day of a cut date is an estimate. Widening the column (VARCHAR(12)) and re-importing the dates makes them exact.
 */
function sheetResolveDates(array $raw): array {
    $n = count($raw); $today = date('Y-m-d');
    $res = array_fill(0, $n, ''); $cands = []; $cut = [];
    foreach ($raw as $i => $s) {
        $s = trim($s); $c = [];
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $s, $m)) { if (checkdate((int)$m[2], (int)$m[3], (int)$m[1])) $c = [sprintf('%04d-%02d-%02d', $m[1], $m[2], $m[3])]; }
        elseif (preg_match('/^(\d{4})-(\d{2})-(\d)$/', $s, $m) && (int)$m[2] >= 1 && (int)$m[2] <= 12) { $cut[$m[1] . '-' . $m[2] . '-' . $m[3]][] = $i; continue; }
        elseif (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/', $s, $m)) {
            $a = (int)$m[1]; $b = (int)$m[2]; $y = (int)$m[3]; if ($y < 100) $y += 2000;
            if (checkdate($b, $a, $y)) $c[] = sprintf('%04d-%02d-%02d', $y, $b, $a);                 // day / month / year
            if ($a !== $b && checkdate($a, $b, $y)) $c[] = sprintf('%04d-%02d-%02d', $y, $a, $b);    // month / day / year
            $c = array_values(array_unique($c));
        } elseif ($s !== '' && ($ts = strtotime($s))) $c = [date('Y-m-d', $ts)];
        $past = array_values(array_filter($c, fn($d) => $d <= $today));
        $cands[$i] = $past ?: $c;
        if (count($cands[$i]) === 1) $res[$i] = $cands[$i][0];
    }
    // cut dates: rows of one block (e.g. 2026-05-3) are spread over its days in sheet order
    foreach ($cut as $key => $idx) {
        [$y, $mo, $dec] = explode('-', $key);
        $first = max(1, (int)$dec * 10); $last = (int)$dec === 3 ? (int)date('t', strtotime("$y-$mo-01")) : (int)$dec * 10 + 9;
        $span = $last - $first + 1; $cnt = count($idx);
        foreach ($idx as $rank => $i) $res[$i] = sprintf('%s-%s-%02d', $y, $mo, $first + (int)floor($rank * $span / $cnt));
    }
    // two possible readings: take the one nearest to a neighbouring row whose date is certain
    $near = function (int $i, int $dir) use (&$res, $n, $cands): ?string {
        for ($j = $i + $dir; $j >= 0 && $j < $n; $j += $dir) if ($res[$j] !== '' && count($cands[$j] ?? [1]) === 1) return $res[$j];
        return null;
    };
    foreach ($cands as $i => $c) {
        if (count($c) < 2) continue;
        $p = $near($i, -1); $q = $near($i, 1); $best = $c[0]; $bd = PHP_INT_MAX;
        foreach ($c as $d) {
            $dist = PHP_INT_MAX;
            foreach ([$p, $q] as $nb) if ($nb !== null) $dist = min($dist, abs(strtotime($d) - strtotime($nb)));
            if ($dist < $bd) { $bd = $dist; $best = $d; }
        }
        $res[$i] = $best;
    }
    return $res;
}

/** Do the order-workflow tables exist (they are created the first time orders.php runs)? */
/** SQL for the billed quantity of an order line (paid EA; the free EA of the FOC list are not billed). Before the first order request after the FOC list update the column does not exist yet. */
function portalPaidSql(PDO $pdo): string {
    $n = $pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'portal_order_items' AND COLUMN_NAME = 'paid'")->fetchColumn();
    return (int)$n ? 'i.paid' : 'NULL';
}
function portalOrdersExist(PDO $pdo): bool {
    $n = $pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('portal_orders','portal_order_items','portal_order_files')")->fetchColumn();
    return (int)$n === 3;
}

/** Portal orders on the dashboard: the same limit as its rows - the user's own zone / regions (a Regional Officer's sales areas, an outlet's SAP number); the super admins see everything. */
function portalOrderScope(PDO $pdo): array {
    return misScopeSql($pdo, 'o.', 'ro_code');
}

/**
 * Approved portal orders as dashboard rows (one per order line), newest after the sheet rows. Orders imported from the old sheet
 * (created_by 'historical-import') are left out: the sheet rows already cover them.
 * orderStatus = In transit / Delivered (Proof of Delivery uploaded), paymentStatus = whether the payment receipt is in.
 */
function portalOrderRows(PDO $pdo): array {
    try {
        if (!portalOrdersExist($pdo)) return [];
        [$scope, $sp] = portalOrderScope($pdo);
        $st = $pdo->prepare("SELECT o.id oid, o.order_date, o.outlet, o.ro_code, o.district, o.state, o.sales_area, o.ro, o.zone, o.delivery_stage, o.invoice_no, o.voucher_no,
                i.item, i.ea, i.vol, i.rate, i.gst, " . portalPaidSql($pdo) . " AS paid,
                EXISTS(SELECT 1 FROM `portal_order_files` f WHERE f.order_id = o.id AND f.kind = 'payment') has_receipt
            FROM `portal_orders` o JOIN `portal_order_items` i ON i.order_id = o.id
            WHERE o.status = 'approved' AND o.created_by <> 'historical-import'" . $scope . " ORDER BY o.order_date, o.id, i.id");
        $st->execute($sp);
        $out = [];
        foreach ($st->fetchAll() as $r) {
            $date = substr((string)$r['order_date'], 0, 10);
            $amt = $r['rate'] !== null ? (string)round((float)($r['paid'] ?? $r['ea']) * (float)$r['rate'] * (1 + (float)($r['gst'] ?? 18) / 100)) : '';
            $out[] = [
                'id' => null, 'src' => 'orders', 'date' => $date, 'month' => substr($date, 0, 7), 'day' => (int)substr($date, 8, 2),
                'outlet' => cleanStr($r['outlet']), 'roCode' => cleanStr($r['ro_code']), 'district' => cleanStr($r['district']), 'state' => cleanStr($r['state']),
                'salesArea' => cleanStr((string)$r['sales_area']), 'ro' => cleanStr($r['ro']), 'zone' => cleanStr($r['zone']), 'item' => cleanStr($r['item']),
                'ea' => (int)$r['ea'], 'vol' => (int)$r['vol'],
                'orderStatus' => $r['delivery_stage'] === 'delivered' ? 'Delivered' : 'In transit',
                'invoiceNo' => cleanStr((string)($r['invoice_no'] ?: $r['voucher_no'])), 'invoiceAmount' => $amt,
                'submittedHpcl' => '', 'emailDate' => '', 'vssDate' => '',
                'paymentStatus' => (int)$r['has_receipt'] ? 'Payment receipt uploaded' : 'Awaiting payment receipt', 'tataPayDate' => '', 'notes' => '',
            ];
        }
        return $out;
    } catch (Exception $e) {
        error_log('api.php portalOrderRows: ' . $e->getMessage());
        return [];
    }
}

/** Live order pipeline for the dashboard tiles: waiting for approval / in transit / delivered (orders placed through the portal, not the imported history). */
function portalOrderSummary(PDO $pdo): array {
    $empty = ['pending' => ['c' => 0, 'vol' => 0], 'transit' => ['c' => 0, 'vol' => 0], 'delivered' => ['c' => 0, 'vol' => 0], 'last' => null];
    try {
        if (!portalOrdersExist($pdo)) return $empty;
        [$scope, $sp] = portalOrderScope($pdo);
        $st = $pdo->prepare("SELECT o.status, o.delivery_stage, COUNT(*) c, COALESCE(SUM(o.total_vol),0) vol, MAX(o.updated_at) last FROM `portal_orders` o
            WHERE o.status IN ('pending','approved') AND o.created_by <> 'historical-import'" . $scope . " GROUP BY o.status, o.delivery_stage");
        $st->execute($sp);
        foreach ($st->fetchAll() as $r) {
            $k = $r['status'] === 'pending' ? 'pending' : ($r['delivery_stage'] === 'delivered' ? 'delivered' : 'transit');
            $empty[$k]['c'] += (int)$r['c']; $empty[$k]['vol'] += (int)$r['vol'];
            if ($r['last'] && ($empty['last'] === null || $r['last'] > $empty['last'])) $empty['last'] = $r['last'];
        }
    } catch (Exception $e) { error_log('api.php portalOrderSummary: ' . $e->getMessage()); }
    return $empty;
}

// ── Endpoints that change data: they change the MIS rows ─────────────────────
/** Who may change the figures: the Super Admin and Rohan Energy officers (the same people who may edit the MIS page). */
function apiEditor(): array {
    $me = misUser();
    if (!$me['edit']) { http_response_code(403); echo json_encode(['error' => 'Access denied']); exit; }
    return $me;
}
/** Dashboard field names -> MIS field keys */
function apiMisKeys(): array { return ['date' => 'd', 'outlet' => 'o', 'roCode' => 's', 'district' => 'di', 'state' => 'st', 'salesArea' => 'sa', 'ro' => 'ro', 'zone' => 'z', 'item' => 'i', 'ea' => 'e', 'vol' => 'v']; }   // (a function: a const declared below the router would not exist yet when the router runs)
function apiMisFields(array $body): array {
    $f = [];
    foreach (apiMisKeys() as $k => $mk) if (array_key_exists($k, $body)) $f[$mk] = $body[$k];
    return $f;
}

function addEntry(PDO $pdo, array $body): void {
    $me = apiEditor(); misEnsureSchema($pdo);
    if (!$me['admin']) unset($body['date']);   // a single entry is dated today (below); only the Rohan Energy Super Admin may pick another date
    if (empty($body['date'])) $body['date'] = (new DateTime('now', new DateTimeZone('Asia/Kolkata')))->format('Y-m-d');
    $set = misCheckFields(apiMisFields($body), true);
    $set['sale_type'] = MIS_SALE_TYPE;
    if (!isset($set['location']) && !empty($set['sales_area'])) $set['location'] = $set['sales_area'];
    if (!misRowInScope($pdo, $set)) { http_response_code(403); echo json_encode(['error' => 'A new entry has to belong to your zone / regions: fill in a Region (RO) you handle.']); return; }
    if (!array_key_exists('litres', $set) || $set['litres'] === null) { if (isset($set['ea'])) $set['litres'] = round($set['ea'] * 20, 2); }
    $cols = array_keys($set); $args = array_values($set); $args[] = $me['label'];
    $pdo->prepare("INSERT INTO `" . MIS_T . "` (`" . implode('`,`', $cols) . "`, src, ver, updated_by, updated_at) VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ", 'sheet', 1, ?, NOW())")->execute($args);
    $id = (int)$pdo->lastInsertId();
    misBump($pdo, $me['label']);
    logAudit($pdo, 'add', 'Added MIS row id=' . $id . ' outlet=' . ($body['outlet'] ?? ''));
    echo json_encode(['id' => $id]);
}

function updateEntry(PDO $pdo, array $body): void {
    $me = apiEditor();
    $id = (int)($body['id'] ?? 0);
    $st = $pdo->prepare("SELECT * FROM `" . MIS_T . "` WHERE id = ? AND gone = 0"); $st->execute([$id]);
    $old = $st->fetch();
    if (!$old) { echo json_encode(['error' => 'This row no longer exists. Reload the page.']); return; }
    if (!misRowInScope($pdo, $old)) { http_response_code(403); echo json_encode(['error' => MIS_OUTSIDE]); return; }
    $set = misCheckFields(apiMisFields($body), false);
    if (!$set) { echo json_encode(['ok' => true]); return; }
    if (!misRowInScope($pdo, array_merge($old, $set))) { http_response_code(403); echo json_encode(['error' => 'The row would move outside your zone / regions.']); return; }
    $sql = []; $args = [];
    foreach ($set as $c => $v) { $sql[] = "`$c` = ?"; $args[] = $v; }
    $args[] = $me['label']; $args[] = $id;
    $pdo->prepare("UPDATE `" . MIS_T . "` SET " . implode(', ', $sql) . ", ver = ver + 1, updated_by = ?, updated_at = NOW() WHERE id = ?")->execute($args);
    misBump($pdo, $me['label']);
    logAudit($pdo, 'edit', 'Edited MIS row id=' . $id . ' outlet=' . ($body['outlet'] ?? ''));
    echo json_encode(['ok' => true]);
}

function deleteEntry(PDO $pdo, array $body): void {
    $me = apiEditor();
    $id = (int)($body['id'] ?? 0);
    $st = $pdo->prepare("SELECT src, ro, sales_area, sap FROM `" . MIS_T . "` WHERE id = ? AND gone = 0"); $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) { echo json_encode(['ok' => true]); return; }
    if (!misRowInScope($pdo, $row)) { http_response_code(403); echo json_encode(['error' => MIS_OUTSIDE]); return; }
    $src = $row['src'];
    if ($src === 'order') $pdo->prepare("UPDATE `" . MIS_T . "` SET gone = 1, ver = ver + 1, updated_by = ?, updated_at = NOW() WHERE id = ?")->execute([$me['label'], $id]);   // stays as a hidden mark: the next sync must not bring it back
    else $pdo->prepare("DELETE FROM `" . MIS_T . "` WHERE id = ?")->execute([$id]);
    misBump($pdo, $me['label']);
    logAudit($pdo, 'delete', 'Deleted MIS row id=' . $id);
    echo json_encode(['ok' => true]);
}

function importData(PDO $pdo, array $body): void {
    $me = apiEditor(); misEnsureSchema($pdo);
    $rows  = $body['data']  ?? [];
    $mode  = $body['mode']  ?? 'append';
    $month = $body['month'] ?? '';
    if (!is_array($rows)) { echo json_encode(['error' => 'data must be an array']); return; }
    $pdo->beginTransaction();
    try {
        // Replace mode: delete the existing rows of that month (rows that came from orders stay)
        if ($mode === 'replace' && preg_match('/^\d{4}-\d{2}$/', (string)$month)) {
            [$ssql, $sp] = misScopeSql($pdo);   // somebody who sees a part of the MIS only replaces that part of the month
            $pdo->prepare("DELETE FROM `" . MIS_T . "` WHERE src <> 'order' AND DATE_FORMAT(d, '%Y-%m') = ?$ssql")->execute(array_merge([$month], $sp));
        }
        $ins = null; $count = 0; $outside = 0;
        foreach ($rows as $r) {
            if (!is_array($r)) continue;
            $f = apiMisFields($r);
            if (isset($f['d']) && is_string($f['d']) && preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $f['d'], $m)) $f['d'] = "$m[1]-$m[2]-$m[3]";
            $x = misImportRow($f);
            if (!$x) continue;
            if (!misRowInScope($pdo, $x)) { $outside++; continue; }   // a row of another zone / region is left out
            $x['sale_type'] = MIS_SALE_TYPE; if (empty($x['location']) && !empty($x['sales_area'])) $x['location'] = $x['sales_area'];
            $cols = array_keys($x);
            $pdo->prepare("INSERT INTO `" . MIS_T . "` (`" . implode('`,`', $cols) . "`, src, ver, updated_by, updated_at) VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ", 'sheet', 1, ?, NOW())")
                ->execute(array_merge(array_values($x), [$me['label']]));
            $count++;
        }
        misBump($pdo, $me['label']);
        $pdo->commit();
        logAudit($pdo, 'import', "Imported {$count} rows into the MIS (" . $mode . ($month ? ' ' . $month : '') . ')');
        echo json_encode(['ok' => true, 'count' => $count, 'outside' => $outside]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// ── Endpoint: GET ref_lists ───────────────────────────────────────────────────
/** Every zone with its states, and every state with its regional offices (regions.php): what the Admin forms offer, also for zones that have no sales yet. */
function refLists(): void {
    if (empty($_SESSION['hpcl_user'])) { http_response_code(401); echo json_encode(['error' => 'Not authenticated']); return; }
    echo json_encode(['zones' => ORD_ZONES, 'state_ro' => ORD_STATE_RO]);
}

// ── Endpoint: GET ro_lookup ───────────────────────────────────────────────────
function roLookup(PDO $pdo): void {
    $code    = trim($_GET['code'] ?? '');
    // The SAP numbers of the order portal (every zone) are looked up first; the old reference sheet (three zones) is the fallback.
    if ($code !== '') {
        try {
            $st = $pdo->prepare("SELECT outlet_name, zone, ro, sales_area, state, district FROM `portal_outlets` WHERE sap_code = ? LIMIT 1");
            $st->execute([$code]);
            if ($o = $st->fetch()) {
                echo json_encode(['found' => true, 'outlet' => cleanStr($o['outlet_name']), 'zone' => cleanStr($o['zone']), 'ro' => cleanStr($o['ro']),
                                  'salesArea' => cleanStr($o['sales_area']), 'state' => cleanStr($o['state']), 'district' => cleanStr($o['district'])]);
                return;
            }
        } catch (Exception $e) { /* the outlet table does not exist yet: use the reference sheet */ }
    }
    $roDb    = RO_REF_DB;
    $table   = RO_REF_TABLE;
    $fullRef = "`{$roDb}`.`{$table}`"; // cross-database reference

    if (!$code) { echo json_encode(['found' => false, 'error' => 'No code provided']); return; }

    // Verify the table exists in the RO reference database
    try {
        $exists = $pdo->query("SHOW TABLES FROM `{$roDb}` LIKE '{$table}'")->fetch();
    } catch (Exception $e) {
        echo json_encode(['found' => false, 'error' => 'Cannot access RO reference database: ' . $e->getMessage()]);
        return;
    }
    if (!$exists) { echo json_encode(['found' => false, 'error' => "Table {$table} not found in database {$roDb}"]); return; }

    // Get actual column names from the table
    $actualCols = $pdo->query("SHOW COLUMNS FROM `{$roDb}`.`{$table}`")->fetchAll(PDO::FETCH_COLUMN);

    // Check if columns are generic (COL 1, COL 2...) — means headers are in the first data row
    $isGeneric = !empty($actualCols) && preg_match('/^COL\s*\d+$/i', $actualCols[0]);

    $map = [];

    if ($isGeneric) {
        // Read the first data row to discover real header names
        $headerRow = $pdo->query("SELECT * FROM `{$roDb}`.`{$table}` LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if ($headerRow) {
            foreach ($headerRow as $colName => $headerVal) {
                $n = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', (string)$headerVal));
                if ($n === 'rocode' || $n === 'ro_code')                                         $map['ro_code']    = $colName;
                elseif (!isset($map['outlet']) && $n === 'name')                                 $map['outlet']     = $colName;
                elseif (strpos($n, 'zone') !== false)                                            $map['zone']       = $colName;
                elseif (strpos($n, 'regional') !== false || $n === 'regionalofficename')         $map['ro']         = $colName;
                elseif (strpos($n, 'salesarea') !== false)                                       $map['sales_area'] = $colName;
                elseif (strpos($n, 'state') !== false)                                           $map['state']      = $colName;
                elseif (strpos($n, 'district') !== false)                                        $map['district']   = $colName;
            }
        }
    } else {
        // Columns have real names — match directly
        foreach ($actualCols as $col) {
            $n = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $col));
            if ($n === 'rocode' || $n === 'ro_code')                                             $map['ro_code']    = $col;
            elseif (!isset($map['outlet']) && $n === 'name')                                     $map['outlet']     = $col;
            elseif (strpos($n, 'zone') !== false)                                                $map['zone']       = $col;
            elseif (strpos($n, 'regional') !== false || $n === 'regionalofficename')             $map['ro']         = $col;
            elseif (strpos($n, 'salesarea') !== false)                                           $map['sales_area'] = $col;
            elseif (strpos($n, 'state') !== false)                                               $map['state']      = $col;
            elseif (strpos($n, 'district') !== false)                                            $map['district']   = $col;
        }
    }

    if (empty($map['ro_code'])) {
        echo json_encode(['found' => false, 'error' => 'Could not find RO_CODE column in ro_reference_sheet']);
        return;
    }

    // Skip the header row (WHERE clause excludes the text "RO_CODE" / "NAME" row)
    $stmt = $pdo->prepare(
        "SELECT * FROM `{$roDb}`.`{$table}`
         WHERE `{$map['ro_code']}` = ?
           AND `{$map['ro_code']}` NOT IN ('RO_CODE','RO CODE')
         LIMIT 1"
    );
    $stmt->execute([$code]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) { echo json_encode(['found' => false]); return; }

    echo json_encode([
        'found'     => true,
        'outlet'    => cleanStr($row[$map['outlet']    ?? ''] ?? ''),
        'zone'      => cleanStr($row[$map['zone']      ?? ''] ?? ''),
        'ro'        => cleanStr($row[$map['ro']        ?? ''] ?? ''),
        'salesArea' => cleanStr($row[$map['sales_area']?? ''] ?? ''),
        'state'     => cleanStr($row[$map['state']     ?? ''] ?? ''),
        'district'  => cleanStr($row[$map['district']  ?? ''] ?? ''),
    ]);
}

// ── Pending Entry Endpoints ──────────────────────────────────────────────────

function requireSession(): array {
    if (empty($_SESSION['hpcl_user'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Not authenticated']);
        exit;
    }
    return $_SESSION['hpcl_user'];
}

function addPending(PDO $pdo, array $body): void {
    $user = requireSession();
    $table = PENDING_TABLE;

    $fields = ['date','outlet','ro_code','district','state','sales_area','ro','zone','item','ea','vol','order_status','invoice_no','invoice_amount','submitted_hpcl','email_date','vss_date','payment_status','tata_pay_date'];
    $bodyKeys = ['date','outlet','roCode','district','state','salesArea','ro','zone','item','ea','vol','orderStatus','invoiceNo','invoiceAmount','submittedHpcl','emailDate','vssDate','paymentStatus','tataPayDate'];

    $setCols = ['`status`', '`submitted_by`', '`submitted_at`'];
    $vals    = ['pending', $user['username'], date('Y-m-d H:i:s')];

    foreach ($fields as $i => $f) {
        $setCols[] = "`{$f}`";
        $vals[]    = $body[$bodyKeys[$i]] ?? null;
    }

    $placeholders = implode(',', array_fill(0, count($setCols), '?'));
    $sql = "INSERT INTO `{$table}` (" . implode(',', $setCols) . ") VALUES ($placeholders)";
    $pdo->prepare($sql)->execute($vals);
    logAudit($pdo, 'submit', 'Submitted entry outlet=' . ($body['outlet'] ?? ''));
    echo json_encode(['ok' => true, 'id' => (int) $pdo->lastInsertId()]);
}

function myPending(PDO $pdo): void {
    $user = requireSession();
    $table = PENDING_TABLE;

    $stmt = $pdo->prepare(
        "SELECT * FROM `{$table}` WHERE `submitted_by` = ? ORDER BY `submitted_at` DESC"
    );
    $stmt->execute([$user['username']]);
    $rows = $stmt->fetchAll();

    // Normalise output
    foreach ($rows as &$r) {
        $r['ea']  = (int)($r['ea'] ?? 0);
        $r['vol'] = (int)($r['vol'] ?? 0);
        $r['id']  = (int)$r['id'];
    }
    unset($r);

    echo json_encode(['data' => $rows]);
}

function listPending(PDO $pdo): void {
    $user = requireSession();
    if ($user['role'] !== 'superadmin' || ($user['org'] ?? null) === 'hpcl') {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied']);
        return;
    }
    $table = PENDING_TABLE;

    $rows = $pdo->query(
        "SELECT * FROM `{$table}` WHERE `status` = 'pending' ORDER BY `submitted_at` DESC"
    )->fetchAll();

    foreach ($rows as &$r) {
        $r['ea']  = (int)($r['ea'] ?? 0);
        $r['vol'] = (int)($r['vol'] ?? 0);
        $r['id']  = (int)$r['id'];
    }
    unset($r);

    echo json_encode(['data' => $rows]);
}

function approvePending(PDO $pdo, array $body): void {
    $user = requireSession();
    if ($user['role'] !== 'superadmin' || ($user['org'] ?? null) === 'hpcl') {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied']);
        return;
    }

    $id = (int)($body['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => 'No id provided']); return; }

    $table   = PENDING_TABLE;

    // Fetch the pending row
    $stmt = $pdo->prepare("SELECT * FROM `{$table}` WHERE `id` = ? AND `status` = 'pending'");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) { echo json_encode(['error' => 'Pending entry not found']); return; }

    misEnsureSchema($pdo);
    try { $pdo->exec("ALTER TABLE `{$table}` ADD `review_comment` TEXT DEFAULT NULL"); } catch (\Exception $e) { /* already there */ }   // before the transaction (it changes the table)
    $pdo->beginTransaction();
    try {
        // The approved entry becomes a row of the MIS (and with it of the Dashboard and Raw Data)
        $f = [];
        foreach (['date' => 'date', 'outlet' => 'outlet', 'roCode' => 'ro_code', 'district' => 'district', 'state' => 'state', 'salesArea' => 'sales_area', 'ro' => 'ro', 'zone' => 'zone', 'item' => 'item', 'ea' => 'ea', 'vol' => 'vol'] as $k => $col) $f[$k] = $row[$col] ?? null;
        if (isset($f['date']) && preg_match('/^(\d{4})-(\d{2})-(\d{2})/', (string)$f['date'], $m)) $f['date'] = "$m[1]-$m[2]-$m[3]";
        $x = misImportRow(apiMisFields($f));
        if (!$x) throw new Exception('The entry has no valid date.');
        $x['sale_type'] = MIS_SALE_TYPE; if (empty($x['location']) && !empty($x['sales_area'])) $x['location'] = $x['sales_area'];
        $cols = array_keys($x);
        $pdo->prepare("INSERT INTO `" . MIS_T . "` (`" . implode('`,`', $cols) . "`, src, ver, updated_by, updated_at) VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ", 'sheet', 1, ?, NOW())")
            ->execute(array_merge(array_values($x), [$user['username']]));
        misBump($pdo, $user['username']);

        // Mark as approved
        $pdo->prepare(
            "UPDATE `{$table}` SET `status` = 'approved', `reviewed_by` = ?, `reviewed_at` = NOW(), `review_comment` = ? WHERE `id` = ?"
        )->execute([$user['username'], $body['comment'] ?? null, $id]);

        $pdo->commit();
        logAudit($pdo, 'approve', 'Approved pending id=' . $id . ' by=' . ($row['submitted_by'] ?? '') . ($body['comment'] ? ' comment=' . $body['comment'] : ''));
        echo json_encode(['ok' => true]);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function rejectPending(PDO $pdo, array $body): void {
    $user = requireSession();
    if ($user['role'] !== 'superadmin' || ($user['org'] ?? null) === 'hpcl') {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied']);
        return;
    }

    $id = (int)($body['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => 'No id provided']); return; }

    $reason = trim($body['reason'] ?? '');
    $table  = PENDING_TABLE;
    $pdo->prepare(
        "UPDATE `{$table}` SET `status` = 'rejected', `reviewed_by` = ?, `reviewed_at` = NOW(), `rejection_reason` = ? WHERE `id` = ? AND `status` = 'pending'"
    )->execute([$user['username'], $reason ?: null, $id]);
    logAudit($pdo, 'reject', 'Rejected pending id=' . $id . ($reason ? ' reason=' . $reason : ''));
    echo json_encode(['ok' => true]);
}

function editPending(PDO $pdo, array $body): void {
    $user = requireSession();
    $id   = (int)($body['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => 'No id provided']); return; }

    $table = PENDING_TABLE;

    // Verify ownership and status
    $stmt = $pdo->prepare("SELECT `submitted_by`, `status` FROM `{$table}` WHERE `id` = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) { echo json_encode(['error' => 'Entry not found']); return; }
    if ($row['submitted_by'] !== $user['username']) { echo json_encode(['error' => 'Not your entry']); return; }
    if ($row['status'] === 'approved') { echo json_encode(['error' => 'Cannot edit — already approved']); return; }

    $fields   = ['date','outlet','ro_code','district','state','sales_area','ro','zone','item','ea','vol','order_status','invoice_no','invoice_amount','submitted_hpcl','email_date','vss_date','payment_status','tata_pay_date'];
    $bodyKeys = ['date','outlet','roCode','district','state','salesArea','ro','zone','item','ea','vol','orderStatus','invoiceNo','invoiceAmount','submittedHpcl','emailDate','vssDate','paymentStatus','tataPayDate'];

    $setParts = ['`status` = ?', '`rejection_reason` = NULL', '`reviewed_by` = NULL', '`reviewed_at` = NULL'];
    $vals     = ['pending'];
    foreach ($fields as $i => $f) {
        $setParts[] = "`{$f}` = ?";
        $vals[]     = $body[$bodyKeys[$i]] ?? null;
    }
    $vals[] = $id;

    $sql = "UPDATE `{$table}` SET " . implode(', ', $setParts) . " WHERE `id` = ?";
    $pdo->prepare($sql)->execute($vals);
    echo json_encode(['ok' => true]);
}

function deletePending(PDO $pdo, array $body): void {
    $user = requireSession();
    $id   = (int)($body['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => 'No id provided']); return; }

    $table = PENDING_TABLE;

    // Verify ownership and status
    $stmt = $pdo->prepare("SELECT `submitted_by`, `status` FROM `{$table}` WHERE `id` = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) { echo json_encode(['error' => 'Entry not found']); return; }
    if ($row['submitted_by'] !== $user['username']) { echo json_encode(['error' => 'Not your entry']); return; }
    if ($row['status'] === 'approved') { echo json_encode(['error' => 'Cannot delete — already approved']); return; }

    $pdo->prepare("DELETE FROM `{$table}` WHERE `id` = ?")->execute([$id]);
    echo json_encode(['ok' => true]);
}
