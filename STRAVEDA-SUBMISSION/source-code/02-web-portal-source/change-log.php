<?php
/**
 * Change log of the SAP Numbers, MIS and FOC pages: who changed what, from what to what, and when.
 * Shared by orders.php (SAP numbers, FOC and the viewer for all three) and mis-core.php (MIS edits).
 * The SAP Numbers page keeps writing its own history table (portal_outlet_log); the viewer reads that table for the 'sap' area.
 * Writing a log line never stops the change itself: a failure is only written to the error log.
 */
const CHG_T = 'portal_change_log';
const CHG_AREAS = ['sap' => 'SAP Numbers', 'mis' => 'MIS', 'foc' => 'FOC'];

function chgEnsure(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . CHG_T . "` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        area VARCHAR(8) NOT NULL,
        action VARCHAR(20) NOT NULL,
        target VARCHAR(255) NOT NULL DEFAULT '',
        summary VARCHAR(255) NOT NULL DEFAULT '',
        details MEDIUMTEXT NULL,
        username VARCHAR(60) NOT NULL DEFAULT '',
        user_label VARCHAR(120) NOT NULL DEFAULT '',
        user_role VARCHAR(60) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL,
        KEY idx_area (area, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $done = true;
}

/** "Rohan Energy Super Admin", "HPCL Zone Officer", "HPCL Regional Officer", "Outlet (SAP No.)" ... read from the signed-in session. */
function chgRole(): string {
    $u = $_SESSION['hpcl_user'] ?? [];
    if (!empty($u['outlet'])) return 'Outlet (SAP No.)';
    $org = ($u['org'] ?? null) === 'hpcl' ? 'HPCL' : 'Rohan Energy';
    if (($u['role'] ?? '') === 'superadmin') return $org . ' Super Admin';
    return $org . (($u['level'] ?? 'zone') === 'regional' ? ' Regional Officer' : ' Zone Officer');
}

/** One line of the log. $changes = [[field label, from, to], ...] (null = empty), $lines = free text lines (e.g. the rows that were deleted). */
function chgAdd(PDO $pdo, string $area, string $action, string $target, string $summary, array $changes = [], array $lines = [], string $note = ''): void {
    try {
        chgEnsure($pdo);
        $u = $_SESSION['hpcl_user'] ?? [];
        $cut = fn($v) => $v === null ? null : mb_substr((string)$v, 0, 300);
        $ch = [];
        foreach (array_slice($changes, 0, 60) as $c) $ch[] = [mb_substr((string)$c[0], 0, 80), $cut($c[1] ?? null), $cut($c[2] ?? null)];
        $det = ['ch' => $ch];
        if ($lines) $det['lines'] = array_map(fn($l) => mb_substr((string)$l, 0, 300), array_slice($lines, 0, 100));
        if ($note !== '') $det['note'] = mb_substr($note, 0, 300);
        $pdo->prepare("INSERT INTO `" . CHG_T . "` (area, action, target, summary, details, username, user_label, user_role, created_at) VALUES (?,?,?,?,?,?,?,?,NOW())")
            ->execute([$area, $action, mb_substr($target, 0, 255), mb_substr($summary, 0, 255), json_encode($det, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
                       mb_substr((string)($u['username'] ?? ''), 0, 60), mb_substr((string)($u['label'] ?? ($u['username'] ?? '')), 0, 120), chgRole()]);
    } catch (Throwable $e) { error_log('change-log: ' . $e->getMessage()); }
}

/** The lines of the MIS / FOC log as the viewer needs them: newest first, 50 a page, optional search over target / summary / user. */
function chgFetch(PDO $pdo, string $area, int $page, string $q): array {
    chgEnsure($pdo);
    $where = 'area = ?'; $args = [$area];
    if ($q !== '') {
        $where .= " AND LOWER(CONCAT_WS(' ', target, summary, user_label, username, details)) LIKE ?";
        $args[] = '%' . mb_strtolower(str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q)) . '%';
    }
    $st = $pdo->prepare("SELECT COUNT(*) FROM `" . CHG_T . "` WHERE $where"); $st->execute($args);
    $total = (int)$st->fetchColumn();
    $per = 50; $pages = max(1, (int)ceil($total / $per)); $page = max(1, min($pages, $page));
    $st = $pdo->prepare("SELECT id, action, target, summary, details, user_label, user_role, created_at FROM `" . CHG_T . "` WHERE $where ORDER BY id DESC LIMIT $per OFFSET " . (($page - 1) * $per));
    $st->execute($args);
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        $d = json_decode((string)$r['details'], true); $d = is_array($d) ? $d : [];
        $rows[] = ['id' => (int)$r['id'], 'at' => $r['created_at'], 'by' => $r['user_label'], 'role' => $r['user_role'], 'action' => $r['action'], 'target' => $r['target'], 'summary' => $r['summary'],
                   'changes' => $d['ch'] ?? [], 'lines' => $d['lines'] ?? [], 'note' => $d['note'] ?? ''];
    }
    return ['rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages];
}
