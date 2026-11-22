<?php
/**
 * mis.php — the MIS of Rohan Energy Solutions (the "MIS MTD <month>" workbook, kept live in the portal).
 *
 * The workbook has four visible sheets:
 *   1. SECONDARY RO_BZR Wise            the data: one row per delivery (date, outlet, SAP code, sales area, regional office, zone, item, EA, litres)
 *   2. Region Wise / 3. SA Wise. / 4. MOM Secondary Sales State wise.    pivot reports (litres per month) calculated from the data
 * The data rows live in portal_mis_rows. They started as the rows of the workbook (mis-data/seed.json, loaded once) and grow by themselves:
 * every item of an order that has been APPROVED in the portal becomes a row. Super Admin and Rohan Energy officers can change, add and delete
 * rows; the reports (page and Excel) always follow. HPCL officers can only read and download.
 * The Excel download is the original workbook layout (mis-data/template.xlsx) filled with the current rows: see mis-xlsx.php.
 */
require_once __DIR__ . '/mis-core.php';   // config, users, the Excel writer and all the MIS functions

header('Cache-Control: no-store');
session_start();


// ── router ───────────────────────────────────────────────────────────────────────────────────────────────────────────
$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) $body = [];
$action = $_GET['action'] ?? ($body['action'] ?? 'get');
$me = misUser();
$pdo = misDB();
try { $warn = misEnsureSchema($pdo); }
catch (Exception $e) { error_log('mis.php schema: ' . $e->getMessage()); if ($pdo->inTransaction()) $pdo->rollBack(); misFail(500, 'Could not prepare the MIS tables. Check that the database user may create tables.'); }
if ($_SERVER['REQUEST_METHOD'] === 'POST') misRequireCsrf($body);
session_write_close();   // nothing below writes the session: parallel requests of the same user do not queue up
try {
    if (in_array($action, ['get', 'ver', 'download'], true)) misSync($pdo);
    switch ($action) {
        case 'get':
            misGet($pdo, $me, $_GET, $warn); break;
        case 'ver':      misOut(['rev' => (int)misMeta($pdo, 'rev')]); break;
        case 'download': misDownload($pdo); break;
        case 'outlet':   misOutlet($pdo, (string)($_GET['sap'] ?? '')); break;
        case 'save_row': misSaveRow($pdo, $me, $body); break;
        case 'delete_row': misDeleteRow($pdo, $me, $body); break;
        case 'delete_rows': misDeleteRows($pdo, $me, $body); break;
        case 'import':   misImport($pdo, $me, $body); break;
        default:         misFail(400, 'Unknown action.');
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('mis.php ' . $action . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
    misFail(500, 'Something went wrong while preparing the MIS. Please try again.');
}
