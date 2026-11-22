<?php
/**
 * orders.php — Order creation & HPCL approval workflow
 *
 * Lifecycle:  draft ──submit──▶ pending ──approve──▶ approved
 *                ▲                 └──reject───▶ rejected ──edit + resubmit──▶ pending
 *
 *  - Rohan Energy officers (role 'zone', org 'rohan') create / edit / submit orders for their own zone.
 *  - HPCL officers (role 'zone', org 'hpcl') approve or reject pending orders of their own zone.
 *  - HPCL officers can also place orders (doc_type 'invoice'); these wait in 'pending' for the super admin, who may correct quantities and rates,
 *    then approves (-> Sales Order + Tax Invoice are generated) or rejects.
 *  - Super admin can view every order; edits and decides the orders HPCL placed.
 *  - After approval Rohan and HPCL officers upload the payment receipt, then Rohan uploads the Proof of Delivery.
 *
 * Every permission check is made here on the server; the browser UI only mirrors it.
 * Tables are created automatically on first use (same approach as audit_log / targets in api.php).
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/users-store.php';   // reads users.php fresh every time (never a stale OPcache copy)
require_once __DIR__ . '/regions.php';       // zones / regions / states (shared with auth.php)
require_once __DIR__ . '/outlet-users.php';  // outlet profiles: a login that belongs to one SAP number
require_once __DIR__ . '/change-log.php';    // the change log of the SAP Numbers / MIS / FOC pages

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
session_start();

const ORD_T       = 'portal_orders';
const ORD_T_ITEMS = 'portal_order_items';
const ORD_T_EVENT = 'portal_order_events';
const ORD_T_RET   = 'portal_order_returns';   // return requests of completed (delivered) orders: reason, credit note, who asked, who decided
const ORD_T_FILE  = 'portal_order_files';  // proof-of-delivery documents (the files themselves live in ORD_POD_DIR)
const ORD_POD_DIR = __DIR__ . '/pod-files';
const ORD_POD_MAX = 10 * 1024 * 1024;
const ORD_POD_EXT = ['pdf' => 'application/pdf', 'xls' => 'application/vnd.ms-excel', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     'doc' => 'application/msword', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'csv' => 'text/csv'];
// payment receipts (uploaded by Rohan or HPCL before the Proof of Delivery) accept the same documents plus pictures
const ORD_REC_EXT = ORD_POD_EXT + ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png'];
const ORD_RECEIPT_REQUIRED = true;   // the Proof of Delivery can only be uploaded once the payment receipt is in
const ORD_T_SET   = 'portal_settings';  // key/value settings (minimum order quantity, prices, stock, permissions)
// Super admin permissions (Permissions tab), stored as perm_<key> = '1' / '0'. The defaults are how the portal behaved before the switches existed.
// Fields of an auto-generated Tax Invoice that a Rohan officer may overwrite (stored as JSON in portal_orders.invoice_edits).
// 'date' = YYYY-MM-DD or blank, 'gstin' = 15 letters/digits or blank, a number = maximum length of the text
const ORD_INV_FIELDS = ['inv_date' => 'date', 'order_date' => 'date', 'despatch_doc_date' => 'date', 'ack_date' => 'date',
    'irn' => 100, 'ack_no' => 30, 'challan_no' => 40, 'terms_payment' => 60, 'other_ref' => 60, 'order_no' => 40, 'despatch_doc_no' => 40,
    'despatch_through' => 60, 'destination' => 80, 'bl_no' => 40, 'vehicle_no' => 30, 'terms_delivery' => 120,
    'consignee_name' => 150, 'consignee_addr' => 400, 'consignee_gstin' => 'gstin', 'consignee_state' => 50,
    'buyer_name' => 150, 'buyer_addr' => 400, 'buyer_gstin' => 'gstin', 'buyer_state' => 50];
/** HPCL hierarchy of the FY27 workbook ("Updated - Zone-RO-SA-State-District Mapping FY27"): e-mail => [tier, designation]. Tier: so = Sales Officer (Level 1, one sales area), manager = Regional Manager
    (Level 2, one region), coord = Zonal Coordinator (Level 3, a zone), fulfil = Level 4 officer (all zones; third item = their states, empty = not limited). Used by the "My superiors" page; an HPCL user that is not in the list is placed by what it covers. */
const ORD_HPCL_DESIG = [
    // DEMO hierarchy (the real list of HPCL officers is not part of this kit)
    'demo.so@example.com'      => ['so', 'Sales Officer - Retail, Indore S/A'],
    'demo.manager@example.com' => ['manager', 'Chief Regional Manager - Retail'],
    'demo.coord@example.com'   => ['coord', 'Zonal Coordinator'],
    'demo.level4@example.com'  => ['fulfil', 'Level 4 Officer - Retail', ''],
];

const ORD_PERMS   = ['hpcl_edit_rates' => false,   // HPCL officers may set the product prices / GST %
                     'auto_invoice'    => true,    // approving an HPCL order generates the Tax Invoice (off: the super admin uploads it)
                     'hpcl_receipt'    => true,    // HPCL officers may upload the payment receipt
                     'hpcl_tax_invoice' => true,   // HPCL users (officers, outlets, the HPCL super admin) may see / download the Tax Invoice (off: it is hidden from them)
                     // who may approve / reject a RETURN of a completed order (inside their own zone / regions): organisation x level. Standard: the Rohan Energy super admin only.
                     'ret_rohan_admin' => true, 'ret_rohan_zone' => false, 'ret_rohan_regional' => false,
                     'ret_hpcl_admin'  => false, 'ret_hpcl_zone' => false, 'ret_hpcl_regional'  => false];
const ORD_T_OUT   = 'portal_outlets';   // outlet list from the client's sheet: SAP code -> zone / RO / state / district / sales area
const ORD_T_OUTLOG = 'portal_outlet_log';   // who added / changed which SAP code, and what (shown as "history" on the SAP Numbers page)
const ORD_SAP_PAGE = 50;                    // rows per page of the SAP Numbers list
// Fields of a SAP code that can be edited on the SAP Numbers page: column => [maximum length, format].
// 'req' = required, 'up' = stored in capitals (like the sheet), 'phone' / 'pin' / 'gstin' / 'pan' = checked format (only when the value is changed, so old sheet data never blocks an unrelated edit)
const ORD_SAP_FIELDS = [
    'outlet_name' => [150, 'req'], 'district' => [100, 'req up'], 'sales_area' => [100, 'up'], 'address' => [400, ''],
    'phone' => [20, 'phone'], 'pincode' => [10, 'pin'], 'gstin' => [20, 'gstin'], 'pan' => [12, 'pan'],
    'inv_name' => [150, ''], 'inv_address' => [400, ''], 'inv_state' => [50, ''], 'inv_pincode' => [10, 'pin'], 'inv_pan' => [12, 'pan'], 'inv_gstin' => [20, 'gstin'],
];
const ORD_SAP_IMPORT_MAX = 20000;
const ORD_SAP_IMPORT_LBL = ['outlet_name' => 'Outlet name', 'sheet_zone' => 'Zone', 'zone' => 'Portal zone', 'state' => 'State', 'ro' => 'Region', 'district' => 'District', 'sales_area' => 'Sales area',
                            'address' => 'Address', 'phone' => 'Phone', 'pincode' => 'Pincode', 'gstin' => 'GSTIN', 'pan' => 'PAN'];

const ORD_SAP_COLS = 'sap_code, outlet_name, sheet_zone, zone, state, ro, district, sales_area, address, phone, pincode, gstin, pan, inv_name, inv_address, inv_state, inv_pincode, inv_pan, inv_gstin, updated_by, updated_at';
const ORD_VOUCHER_PREFIX = 'RCSO2';   // Sales Order voucher no. / buyer's ref.: RCSO2/<financial year>/<running number>
const ORD_INV_PREFIX = 'RETI';   // Tax Invoice no. of an order placed by HPCL: RETI/<financial year>/<running number>
const ORD_GST_DEFAULT = 18.0;
const ORD_HIST_USER = 'historical-import';   // pseudo owner of orders imported from the client's old sheet: visible to the super admin only
const ORD_MAX_RATE = 1000000;
const ORD_L_PER_EA = 20;           // both DEF products are 20 L packs
const ORD_MAX_LINES = 20;
const ORD_MAX_EA    = 100000;
const ORD_STOCK_MAX = 100000000;   // upper limit for the available quantity the super admin can enter
const ORD_BULK_MAX  = 500;          // rows accepted in one bulk-order upload

// The zones, regions and states (ORD_ZONES, ORD_STATE_RO, ORD_SHEET_ZONES) live in regions.php - the one list auth.php uses too.
const ORD_T_PROD  = 'portal_products';   // product list, managed by the super admin (Inventory page)
const ORD_ITEMS_SEED = ['HP DEF - 1X20L' => 'hp', 'TATA MOTORS HP GENUINE DEF 20L' => 'tata'];   // SKU => brand, created the first time the table is made
const ORD_MAX_PRODUCTS = 50;
const ORD_T_FOC   = 'portal_foc';        // FOC (free of cost) rules: an order of at least min_qty EA of a product carries foc_qty EA of FOC
const ORD_MAX_FOC_RULES = 100;
// The two brands every product (SKU) belongs to. same_party: the order is sold straight to the outlet, so Invoice to = Dispatch to (HP DEF);
// otherwise Invoice to is the HPCL office the outlet is billed through (TATA MOTORS).
const ORD_BRANDS = [
    'hp'   => ['name' => 'HP DEF',      'same_party' => true],
    'tata' => ['name' => 'TATA MOTORS', 'same_party' => false],
];
const ORD_STATUSES = ['draft', 'pending', 'approved', 'rejected'];

// ── helpers ──────────────────────────────────────────────────────────────────
function ordFail(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

function ordOut(array $data): void {
    echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function ordDB(): PDO {
    try {
        return new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
    } catch (Exception $e) {
        error_log('orders.php DB connect failed: ' . $e->getMessage());
        ordFail(500, 'Database connection failed.');
    }
}

function ordEnsureSchema(PDO $pdo): void {
    ouEnsure($pdo);   // the outlet profile table (the order lists use it to tell an outlet's orders from an officer's)
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . ORD_T_SET . "` (
        `skey` VARCHAR(40) NOT NULL PRIMARY KEY,
        `svalue` VARCHAR(255) NOT NULL,
        `updated_by` VARCHAR(100) NOT NULL DEFAULT '',
        `updated_at` DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // pid is the number the price / GST / stock settings are keyed by (rate_<pid>, gst_<pid>, stock_<pid>); the first two products keep 0 and 1
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . ORD_T_PROD . "` (
        `pid` INT NOT NULL PRIMARY KEY,
        `name` VARCHAR(80) NOT NULL UNIQUE,
        `brand` VARCHAR(10) NOT NULL DEFAULT '',
        `created_by` VARCHAR(100) NOT NULL DEFAULT '',
        `created_at` DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    ordAddColumns($pdo, ORD_T_PROD, ['brand' => "VARCHAR(10) NOT NULL DEFAULT ''"]);   // tables made before the SKU / brand concept
    if (!(int)$pdo->query("SELECT COUNT(*) FROM `" . ORD_T_PROD . "`")->fetchColumn()) {
        $pid = 0;
        foreach (ORD_ITEMS_SEED as $n => $b) $pdo->prepare("INSERT INTO `" . ORD_T_PROD . "` (pid, name, brand, created_by, created_at) VALUES (?, ?, ?, 'system', NOW())")->execute([$pid++, $n, $b]);
    }
    $pdo->exec("UPDATE `" . ORD_T_PROD . "` SET brand = IF(UPPER(name) LIKE '%TATA%', 'tata', 'hp') WHERE brand = ''");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . ORD_T_FOC . "` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `pid` INT NOT NULL,
        `min_qty` INT NOT NULL,
        `foc_qty` INT NOT NULL,
        `created_by` VARCHAR(100) NOT NULL DEFAULT '',
        `created_at` DATETIME NOT NULL,
        UNIQUE KEY `uk_foc_rule` (`pid`,`min_qty`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . ORD_T . "` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `order_ref` VARCHAR(20) NULL UNIQUE,
        `status` VARCHAR(12) NOT NULL DEFAULT 'draft',
        `order_date` DATE NOT NULL,
        `zone` VARCHAR(50) NOT NULL,
        `state` VARCHAR(50) NOT NULL,
        `ro` VARCHAR(60) NOT NULL,
        `ro_code` VARCHAR(20) NOT NULL,
        `outlet` VARCHAR(150) NOT NULL,
        `district` VARCHAR(100) NOT NULL,
        `sales_area` VARCHAR(100) NULL,
        `outlet_address` VARCHAR(400) NOT NULL DEFAULT '',
        `outlet_phone` VARCHAR(20) NOT NULL DEFAULT '',
        `outlet_pincode` VARCHAR(10) NOT NULL DEFAULT '',
        `outlet_gstin` VARCHAR(20) NOT NULL DEFAULT '',
        `outlet_pan` VARCHAR(12) NOT NULL DEFAULT '',
        `invoice_name` VARCHAR(150) NOT NULL DEFAULT '',
        `invoice_address` VARCHAR(400) NOT NULL DEFAULT '',
        `invoice_state` VARCHAR(50) NOT NULL DEFAULT '',
        `invoice_pan` VARCHAR(12) NOT NULL DEFAULT '',
        `invoice_gstin` VARCHAR(20) NOT NULL DEFAULT '',
        `remarks` TEXT NULL,
        `total_ea` INT NOT NULL DEFAULT 0,
        `total_vol` INT NOT NULL DEFAULT 0,
        `created_by` VARCHAR(50) NOT NULL,
        `created_by_name` VARCHAR(100) NOT NULL,
        `created_at` DATETIME NOT NULL,
        `updated_at` DATETIME NOT NULL,
        `submitted_at` DATETIME NULL,
        `decided_by` VARCHAR(50) NULL,
        `decided_by_name` VARCHAR(100) NULL,
        `decided_at` DATETIME NULL,
        `review_comment` TEXT NULL,
        KEY `idx_zone_status` (`zone`,`status`),
        KEY `idx_creator` (`created_by`,`status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . ORD_T_ITEMS . "` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `order_id` INT NOT NULL,
        `item` VARCHAR(80) NOT NULL,
        `ea` INT NOT NULL,
        `vol` INT NOT NULL,
        UNIQUE KEY `uk_order_item` (`order_id`,`item`),
        CONSTRAINT `fk_poi_order` FOREIGN KEY (`order_id`) REFERENCES `" . ORD_T . "`(`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . ORD_T_EVENT . "` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `order_id` INT NOT NULL,
        `action` VARCHAR(20) NOT NULL,
        `from_status` VARCHAR(12) NULL,
        `to_status` VARCHAR(12) NOT NULL,
        `username` VARCHAR(50) NOT NULL,
        `user_label` VARCHAR(100) NOT NULL,
        `org` VARCHAR(10) NULL,
        `comment` TEXT NULL,
        `created_at` DATETIME NOT NULL,
        KEY `idx_order` (`order_id`),
        CONSTRAINT `fk_poe_order` FOREIGN KEY (`order_id`) REFERENCES `" . ORD_T . "`(`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . ORD_T_RET . "` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `order_id` INT NOT NULL,
        `status` VARCHAR(10) NOT NULL DEFAULT 'pending',
        `reason` VARCHAR(500) NOT NULL,
        `credit_note` VARCHAR(200) NOT NULL,
        `requested_by` VARCHAR(100) NOT NULL,
        `requested_by_name` VARCHAR(150) NOT NULL,
        `requested_org` VARCHAR(10) NOT NULL DEFAULT '',
        `requested_at` DATETIME NOT NULL,
        `decided_by` VARCHAR(100) NULL,
        `decided_by_name` VARCHAR(150) NULL,
        `decided_org` VARCHAR(10) NULL,
        `decided_at` DATETIME NULL,
        `decision_comment` VARCHAR(500) NULL,
        KEY `idx_order` (`order_id`),
        KEY `idx_status` (`status`),
        CONSTRAINT `fk_por_order` FOREIGN KEY (`order_id`) REFERENCES `" . ORD_T . "`(`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // same definition as outlet-data/outlets-import.sql, which fills it
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . ORD_T_OUT . "` (
        `sap_code` VARCHAR(12) NOT NULL PRIMARY KEY,
        `outlet_name` VARCHAR(150) NOT NULL,
        `sheet_zone` VARCHAR(60) NOT NULL,
        `zone` VARCHAR(50) NOT NULL,
        `state` VARCHAR(50) NOT NULL,
        `ro` VARCHAR(60) NOT NULL,
        `district` VARCHAR(100) NOT NULL,
        `sales_area` VARCHAR(100) NOT NULL DEFAULT '',
        `address` VARCHAR(400) NOT NULL DEFAULT '',
        `phone` VARCHAR(20) NOT NULL DEFAULT '',
        `pincode` VARCHAR(10) NOT NULL DEFAULT '',
        `gstin` VARCHAR(20) NOT NULL DEFAULT '',
        `pan` VARCHAR(12) NOT NULL DEFAULT '',
        `inv_name` VARCHAR(150) NOT NULL DEFAULT '',
        `inv_address` VARCHAR(400) NOT NULL DEFAULT '',
        `inv_state` VARCHAR(50) NOT NULL DEFAULT '',
        `inv_pincode` VARCHAR(10) NOT NULL DEFAULT '',
        `inv_pan` VARCHAR(12) NOT NULL DEFAULT '',
        `inv_gstin` VARCHAR(20) NOT NULL DEFAULT '',
        KEY `idx_zone` (`zone`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // tables made by an earlier version of this file: add the outlet detail columns
    ordAddColumns($pdo, ORD_T, ['outlet_address' => "VARCHAR(400) NOT NULL DEFAULT ''", 'outlet_phone' => "VARCHAR(20) NOT NULL DEFAULT ''",
        'outlet_pincode' => "VARCHAR(10) NOT NULL DEFAULT ''", 'outlet_gstin' => "VARCHAR(20) NOT NULL DEFAULT ''", 'outlet_pan' => "VARCHAR(12) NOT NULL DEFAULT ''"]);
    // invoice-to (the HPCL office the Sales Order is billed to) copied from the outlet at save time
    ordAddColumns($pdo, ORD_T, ['invoice_name' => "VARCHAR(150) NOT NULL DEFAULT ''", 'invoice_address' => "VARCHAR(400) NOT NULL DEFAULT ''",
        'invoice_state' => "VARCHAR(50) NOT NULL DEFAULT ''", 'invoice_pan' => "VARCHAR(12) NOT NULL DEFAULT ''", 'invoice_gstin' => "VARCHAR(20) NOT NULL DEFAULT ''"]);
    // delivery stage of an approved order: '' (not approved yet / older orders, treated as transit) | 'transit' | 'delivered'
    ordAddColumns($pdo, ORD_T, ['delivery_stage' => "VARCHAR(12) NOT NULL DEFAULT ''"]);
    // Sales Order voucher no. (also the buyer's ref.), given when the order is approved; unique
    ordAddColumns($pdo, ORD_T, ['voucher_no' => "VARCHAR(30) NULL"]);
    // 'so' = placed by a Rohan officer and approved by the HPCL officer of the zone | 'invoice' = placed by an HPCL officer and approved by the super admin
    // (approval of either one generates the Sales Order; an 'invoice' order also gets a Tax Invoice)
    ordAddColumns($pdo, ORD_T, ['doc_type' => "VARCHAR(8) NOT NULL DEFAULT 'so'"]);
    // Tax Invoice no. (RETI/26-27/1) of an order placed by HPCL; voucher_no is always the Sales Order no. (RCSO2/...)
    ordAddColumns($pdo, ORD_T, ['invoice_no' => "VARCHAR(30) NULL"]);
    // how the Tax Invoice of an order placed by HPCL was made, fixed when it is approved: 'auto' (generated by the portal) | 'manual' (uploaded by the super admin)
    ordAddColumns($pdo, ORD_T, ['invoice_mode' => "VARCHAR(8) NOT NULL DEFAULT 'auto'"]);
    // 1 = this order (placed by a Rohan officer, doc_type 'so') also has a Tax Invoice: set when the HPCL officer approves it. Orders placed by HPCL always have one (doc_type 'invoice').
    // Orders approved before this existed (and the historical import) stay 0, so no invoice number is ever given to them.
    ordAddColumns($pdo, ORD_T, ['inv_flag' => "TINYINT NOT NULL DEFAULT 0"]);
    // corrections a Rohan officer made to the content of an auto-generated Tax Invoice (JSON, see ORD_INV_FIELDS); NULL = exactly as generated
    ordAddColumns($pdo, ORD_T, ['invoice_edits' => "TEXT NULL"]);
    // orders placed by HPCL before the Sales Order was generated for them kept the invoice number in voucher_no: move it, a Sales Order no. is given on next open
    $pdo->exec("UPDATE `" . ORD_T . "` SET invoice_no = voucher_no, voucher_no = NULL WHERE doc_type = 'invoice' AND invoice_no IS NULL AND voucher_no LIKE '" . ORD_INV_PREFIX . "/%'");
    // random link token of a Tax Invoice: the QR code on the PDF opens invoice.html?t=<token> (no login), so it must be unguessable
    ordAddColumns($pdo, ORD_T, ['doc_token' => "VARCHAR(32) NULL"]);
    foreach ($pdo->query("SELECT id FROM `" . ORD_T . "` WHERE doc_type = 'invoice' AND (doc_token IS NULL OR doc_token = '')")->fetchAll(PDO::FETCH_COLUMN) as $oid)
        $pdo->prepare("UPDATE `" . ORD_T . "` SET doc_token = ? WHERE id = ?")->execute([bin2hex(random_bytes(16)), $oid]);   // invoices placed before the QR code existed
    // who placed the order (rohan_admin | rohan_zone | rohan_regional | hpcl_admin | hpcl_zone | hpcl_regional | hpcl_outlet): decides WHO MAY APPROVE it (ordAwaitCond)
    ordAddColumns($pdo, ORD_T, ['placed_role' => "VARCHAR(16) NULL"]);
    ordBackfillPlacedRole($pdo);
    $ix = $pdo->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'uk_voucher_no'");
    $ix->execute([ORD_T]);
    if (!(int)$ix->fetchColumn()) $pdo->exec("ALTER TABLE `" . ORD_T . "` ADD UNIQUE KEY `uk_voucher_no` (`voucher_no`)");
    $ix = $pdo->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'uk_invoice_no'");
    $ix->execute([ORD_T]);
    if (!(int)$ix->fetchColumn()) $pdo->exec("ALTER TABLE `" . ORD_T . "` ADD UNIQUE KEY `uk_invoice_no` (`invoice_no`)");
    // rate (per EA, before GST) and GST % of each line, fixed on the order when it is approved
    ordAddColumns($pdo, ORD_T_ITEMS, ['rate' => "DECIMAL(12,2) NULL", 'gst' => "DECIMAL(5,2) NULL"]);
    // FOC (free of cost) EA inside the line's quantity (ea = paid + foc). paid = the quantity the officer ordered and is billed for; NULL = an older line
    // (FOC inside the quantity, billed whole on the Tax Invoice). From the FOC page on, every new line has paid + foc.
    ordAddColumns($pdo, ORD_T_ITEMS, ['foc' => "INT NULL", 'paid' => "INT NULL"]);
    ordFocMigrate($pdo);
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . ORD_T_FILE . "` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `order_id` INT NOT NULL,
        `kind` VARCHAR(12) NOT NULL DEFAULT 'pod',
        `orig_name` VARCHAR(200) NOT NULL,
        `stored_name` VARCHAR(80) NOT NULL,
        `mime` VARCHAR(100) NOT NULL,
        `size` INT NOT NULL,
        `uploaded_by` VARCHAR(50) NOT NULL,
        `uploaded_by_name` VARCHAR(100) NOT NULL,
        `created_at` DATETIME NOT NULL,
        UNIQUE KEY `uk_order_kind` (`order_id`,`kind`),
        CONSTRAINT `fk_pof_order` FOREIGN KEY (`order_id`) REFERENCES `" . ORD_T . "`(`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    ordAddColumns($pdo, ORD_T_OUT, ['address' => "VARCHAR(400) NOT NULL DEFAULT ''", 'phone' => "VARCHAR(20) NOT NULL DEFAULT ''",
        'pincode' => "VARCHAR(10) NOT NULL DEFAULT ''", 'gstin' => "VARCHAR(20) NOT NULL DEFAULT ''", 'pan' => "VARCHAR(12) NOT NULL DEFAULT ''",
        'inv_name' => "VARCHAR(150) NOT NULL DEFAULT ''", 'inv_address' => "VARCHAR(400) NOT NULL DEFAULT ''", 'inv_state' => "VARCHAR(50) NOT NULL DEFAULT ''",
        'inv_pincode' => "VARCHAR(10) NOT NULL DEFAULT ''", 'inv_pan' => "VARCHAR(12) NOT NULL DEFAULT ''", 'inv_gstin' => "VARCHAR(20) NOT NULL DEFAULT ''"]);
    // SAP Numbers page: who changed a SAP code last, and the log of every change
    ordAddColumns($pdo, ORD_T_OUT, ['updated_by' => "VARCHAR(100) NOT NULL DEFAULT ''", 'updated_at' => "DATETIME NULL"]);
    $pdo->exec("CREATE TABLE IF NOT EXISTS `" . ORD_T_OUTLOG . "` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `sap_code` VARCHAR(12) NOT NULL,
        `action` VARCHAR(10) NOT NULL,
        `changes` MEDIUMTEXT NULL,
        `username` VARCHAR(50) NOT NULL,
        `user_label` VARCHAR(100) NOT NULL,
        `created_at` DATETIME NOT NULL,
        KEY `idx_sap` (`sap_code`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function ordAddColumns(PDO $pdo, string $table, array $cols): void {
    $st = $pdo->prepare("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?");
    $st->execute([$table]);
    $have = array_flip($st->fetchAll(PDO::FETCH_COLUMN));
    foreach ($cols as $c => $def) if (!isset($have[$c])) $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$c` $def");
}

/** One outlet from the imported sheet, or null. */
function ordOutlet(PDO $pdo, string $code): ?array {
    $st = $pdo->prepare("SELECT sap_code, outlet_name, zone, state, ro, district, sales_area, address, phone, pincode, gstin, pan, inv_name, inv_address, inv_state, inv_pan, inv_gstin FROM `" . ORD_T_OUT . "` WHERE sap_code = ?");
    $st->execute([$code]);
    $r = $st->fetch();
    return $r ?: null;
}
/** The products orders can be placed for: pid => name. */
function ordItems(PDO $pdo): array {
    return array_column($pdo->query("SELECT pid, name FROM `" . ORD_T_PROD . "` ORDER BY pid")->fetchAll(), 'name', 'pid');
}
/** The SKUs with their brand: pid => ['pid','name','brand','brand_name','same_party']. */
function ordProducts(PDO $pdo): array {
    $out = [];
    foreach ($pdo->query("SELECT pid, name, brand FROM `" . ORD_T_PROD . "` ORDER BY pid")->fetchAll() as $r) {
        $b = isset(ORD_BRANDS[$r['brand']]) ? $r['brand'] : 'hp';
        $out[(int)$r['pid']] = ['pid' => (int)$r['pid'], 'name' => $r['name'], 'brand' => $b, 'brand_name' => ORD_BRANDS[$b]['name'], 'same_party' => ORD_BRANDS[$b]['same_party']];
    }
    return $out;
}
/** Names of the SKUs whose orders are sold straight to the outlet (Invoice to = Dispatch to). */
function ordDirectNames(PDO $pdo): array {
    return array_values(array_map(fn($p) => $p['name'], array_filter(ordProducts($pdo), fn($p) => $p['same_party'])));
}
/** The FOC rules, product by product: [['id','pid','item','min_qty','foc_qty','by','at']] (lowest order quantity first). */
function ordFocRules(PDO $pdo): array {
    $names = ordItems($pdo);
    $out = [];
    foreach ($pdo->query("SELECT id, pid, min_qty, foc_qty, created_by, created_at FROM `" . ORD_T_FOC . "` ORDER BY pid, min_qty")->fetchAll() as $r) {
        if (!isset($names[(int)$r['pid']])) continue;
        $out[] = ['id' => (int)$r['id'], 'pid' => (int)$r['pid'], 'item' => $names[(int)$r['pid']], 'min_qty' => (int)$r['min_qty'], 'foc_qty' => (int)$r['foc_qty'],
                  'by' => $r['created_by'], 'at' => $r['created_at']];
    }
    return $out;
}
/** Free EA an order of $paid EA (the quantity the officer orders and pays for) of $item gets: the foc_qty of the highest row of that product's FOC list whose
 *  Purchase Qty the order reaches (0 = none). The free EA come on top: the order then has $paid + FOC EA. */
function ordFocFor(array $rules, string $item, int $paid): int {
    $foc = 0; $at = 0;
    foreach ($rules as $r) if ($r['item'] === $item && $r['min_qty'] <= $paid && $r['min_qty'] >= $at) { $at = $r['min_qty']; $foc = $r['foc_qty']; }
    return max(0, $foc);
}
const ORD_FOC_SEED = [[20, 0], [33, 1], [43, 2], [54, 3], [100, 6], [200, 14], [300, 22], [500, 45], [700, 82], [830, 102], [1000, 132], [1200, 170]];   // HP DEF 20 L, scheme of 1 - 30 Nov 2026
/** The FOC list of a SKU as a page: MRP / Non-MRP, the MRP (a reference column of the chart) and the DLP (the rows themselves are in portal_foc).
 *  The DLP (incl. GST) IS the price orders use: it is the SKU's rate of "Set prices & GST %" plus its GST %, so it is read from there.
 *  pid => ['mrp' => float|null, 'mrp_type' => 'MRP'|'Non-MRP', 'dlp' => float|null] */
function ordFocInfo(PDO $pdo): array {
    $out = [];
    foreach (ordItems($pdo) as $pid => $name) $out[(int)$pid] = ['mrp' => null, 'mrp_type' => 'MRP', 'dlp' => null];
    foreach ($pdo->query("SELECT skey, svalue FROM `" . ORD_T_SET . "` WHERE skey LIKE 'foc\\_mrp\\_%' OR skey LIKE 'foc\\_mt\\_%'")->fetchAll() as $r) {
        if (!preg_match('/^foc_(mrp|mt)_(\d+)$/', $r['skey'], $m) || !isset($out[(int)$m[2]])) continue;
        if ($m[1] === 'mrp') $out[(int)$m[2]]['mrp'] = $r['svalue'] === '' ? null : (float)$r['svalue'];
        else $out[(int)$m[2]]['mrp_type'] = $r['svalue'] === 'Non-MRP' ? 'Non-MRP' : 'MRP';
    }
    foreach (ordPrices($pdo) as $p) if ($p['rate']) $out[(int)$p['pid']]['dlp'] = round((float)$p['rate'] * (1 + (float)$p['gst'] / 100), 2);
    return $out;
}
/** Once: the FOC rules of before meant "an order of N EA in total carries F EA of FOC inside it"; the FOC list now says "buy P EA, get F EA free", so an old rule becomes
 *  P = N - F. HP DEF 20 L gets the list of the Nov 2026 scheme (MRP 1,790). Old order lines keep their meaning (paid = NULL). */
function ordFocMigrate(PDO $pdo): void {
    $done = $pdo->query("SELECT 1 FROM `" . ORD_T_SET . "` WHERE skey = 'foc_list_v1'")->fetchColumn();
    if ($done) return;
    try {
        $old = $pdo->query("SELECT pid, min_qty, foc_qty, created_by FROM `" . ORD_T_FOC . "` ORDER BY pid, min_qty")->fetchAll();
        $pdo->exec("DELETE FROM `" . ORD_T_FOC . "`");
        $ins = $pdo->prepare("INSERT INTO `" . ORD_T_FOC . "` (pid, min_qty, foc_qty, created_by, created_at) VALUES (?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE foc_qty = VALUES(foc_qty)");
        foreach ($old as $r) $ins->execute([(int)$r['pid'], max(1, (int)$r['min_qty'] - (int)$r['foc_qty']), (int)$r['foc_qty'], $r['created_by']]);
        $hp = $pdo->prepare("SELECT pid FROM `" . ORD_T_PROD . "` WHERE name = 'HP DEF - 1X20L'");
        $hp->execute();
        $pid = $hp->fetchColumn();   // (a pid can be 0)
        if ($pid !== false) {
            $pid = (int)$pid;
            $pdo->prepare("DELETE FROM `" . ORD_T_FOC . "` WHERE pid = ?")->execute([$pid]);
            foreach (ORD_FOC_SEED as [$p, $f]) $ins->execute([$pid, $p, $f, 'FOC list (Nov 2026 scheme)']);
            $up = "INSERT INTO `" . ORD_T_SET . "` (skey, svalue, updated_by, updated_at) VALUES (?, ?, 'FOC list (Nov 2026 scheme)', NOW()) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)";
            $pdo->prepare($up)->execute(["foc_mrp_$pid", '1790']);
            $pdo->prepare($up)->execute(["foc_mt_$pid", 'MRP']);
            // DLP 1,652 incl. 18% GST = rate 1,400 - only set when the SKU has no price yet
            $pdo->prepare("INSERT IGNORE INTO `" . ORD_T_SET . "` (skey, svalue, updated_by, updated_at) VALUES (?, '1400.00', 'FOC list (Nov 2026 scheme)', NOW())")->execute(["rate_$pid"]);
            $pdo->prepare("INSERT IGNORE INTO `" . ORD_T_SET . "` (skey, svalue, updated_by, updated_at) VALUES (?, '18', 'FOC list (Nov 2026 scheme)', NOW())")->execute(["gst_$pid"]);
        }
        $pdo->exec("INSERT INTO `" . ORD_T_SET . "` (skey, svalue, updated_by, updated_at) VALUES ('foc_list_v1', '1', 'system', NOW()) ON DUPLICATE KEY UPDATE svalue = '1'");
    } catch (Throwable $e) { error_log('orders.php FOC migration: ' . $e->getMessage()); }
}
/** Minimum total quantity (EA) an order must have to be submitted. Set by the super admin; 0 = no minimum. */
function ordMinOrder(PDO $pdo): array {
    $st = $pdo->prepare("SELECT svalue, updated_by, updated_at FROM `" . ORD_T_SET . "` WHERE skey = 'min_order_ea'");
    $st->execute();
    $r = $st->fetch();
    return ['ea' => $r ? max(0, (int)$r['svalue']) : 0, 'by' => $r ? $r['updated_by'] : '', 'at' => $r ? $r['updated_at'] : null];
}
/** The super admin's permission switches (see ORD_PERMS) plus who changed them last and when. */
function ordPerms(PDO $pdo): array {
    $rows = $pdo->query("SELECT skey, svalue, updated_by, updated_at FROM `" . ORD_T_SET . "` WHERE skey LIKE 'perm\\_%'")->fetchAll();
    $out = ORD_PERMS + ['by' => '', 'at' => null];
    foreach ($rows as $r) {
        $k = substr($r['skey'], 5);
        if (array_key_exists($k, ORD_PERMS)) $out[$k] = $r['svalue'] === '1';
        if ($r['updated_at'] !== null && ($out['at'] === null || $r['updated_at'] >= $out['at'])) { $out['at'] = $r['updated_at']; $out['by'] = $r['updated_by']; }
    }
    return $out;
}
/** Must the Tax Invoice be hidden from this user? HPCL users (officers, outlet logins, the HPCL super admin) see it only while the Rohan Energy super admin allows it (Permissions). */
function ordHpclInvHidden(PDO $pdo, array $me): bool {
    return ($me['kind'] === 'hpcl' || !empty($me['hsuper'])) && !ordPerms($pdo)['hpcl_tax_invoice'];
}
/** An order as an HPCL user sees it when the Tax Invoice is hidden from them: no Tax Invoice, no number, no uploaded file, no corrections. */
function ordHideInv(array &$o): void {
    $o['tax_inv'] = false; $o['has_invoice_file'] = false; $o['invoice_no'] = null; $o['invoice_edits'] = null; $o['inv_hidden'] = true;
}
/** Selling price (per EA, before GST) and GST % of each product. Set by the Rohan officers (and by HPCL officers when the super admin allows it); GST defaults to 18%. */
function ordPrices(PDO $pdo): array {
    $rows = $pdo->query("SELECT skey, svalue, updated_by, updated_at FROM `" . ORD_T_SET . "` WHERE skey LIKE 'rate%' OR skey LIKE 'gst%'")->fetchAll();
    $m = [];
    foreach ($rows as $r) $m[$r['skey']] = $r;
    $out = [];
    foreach (ordItems($pdo) as $i => $name) {
        $rate = $m["rate_$i"] ?? null; $gst = $m["gst_$i"] ?? null;
        $out[] = ['pid' => $i, 'item' => $name, 'rate' => $rate ? (float)$rate['svalue'] : null, 'gst' => $gst ? (float)$gst['svalue'] : ORD_GST_DEFAULT, 'gst_set' => (bool)$gst,
                  'by' => $rate['updated_by'] ?? '', 'at' => $rate['updated_at'] ?? null];
    }
    return $out;
}
/** Names of the given products whose price or GST % has not been set yet (both are mandatory before an order can go to HPCL). */
function ordMissingPrices(PDO $pdo, array $names): array {
    $miss = [];
    foreach (ordPrices($pdo) as $p) if (in_array($p['item'], $names, true) && (!$p['rate'] || !$p['gst_set'])) $miss[] = $p['item'];
    return $miss;
}
function ordMissingPricesMsg(array $miss, bool $byHpcl = false): string {
    if ($byHpcl) return 'The price and GST % of ' . implode(', ', $miss) . ' have not been set by Rohan Energy yet, so this order cannot be placed. Please contact Rohan Energy.';
    return 'Set the price and GST % of ' . implode(', ', $miss) . ' (₹ Set prices & GST %) before submitting.';
}
/**
 * Available quantity (EA) of each product. The super admin enters the quantity in stock; every order APPROVED after that uses it up. Orders that are still draft / pending
 * (or rejected) do not reduce it - the quantity is taken at the moment of approval (and ordDecide refuses an approval that the stock cannot cover).
 * ea = quantity still available (null = not set, no limit), total = what the admin entered, used = EA approved since.
 * $excludeId leaves one order out, so an order being edited does not compete with its own quantity.
 */
/**
 * Is the stock concept switched on (Inventory page check box)? Off = no available quantity is shown, checked or deducted anywhere.
 * Never saved yet: on when a stock quantity was already entered (the site worked that way before the switch existed), otherwise off.
 */
function ordStockEnabled(PDO $pdo): bool {
    $v = $pdo->query("SELECT svalue FROM `" . ORD_T_SET . "` WHERE skey = 'cfg_stock_enabled'")->fetchColumn();
    if ($v !== false) return $v === '1';
    return (int)$pdo->query("SELECT COUNT(*) FROM `" . ORD_T_SET . "` WHERE skey REGEXP '^stock_[0-9]+$'")->fetchColumn() > 0;
}
function ordStock(PDO $pdo, int $excludeId = 0): array {
    if (!ordStockEnabled($pdo)) {   // switched off: every product is without limit and nothing is counted
        $out = [];
        foreach (ordItems($pdo) as $i => $name) $out[] = ['pid' => $i, 'item' => $name, 'ea' => null, 'total' => null, 'used' => 0, 'by' => '', 'at' => null];
        return $out;
    }
    $rows = $pdo->query("SELECT skey, svalue, updated_by, updated_at FROM `" . ORD_T_SET . "` WHERE skey LIKE 'stock\_%'")->fetchAll();
    $m = [];
    foreach ($rows as $r) $m[$r['skey']] = $r;
    $usedSql = $pdo->prepare("SELECT COALESCE(SUM(i.ea), 0) FROM `" . ORD_T_ITEMS . "` i JOIN `" . ORD_T . "` o ON o.id = i.order_id
                              WHERE i.item = ? AND o.status = 'approved' AND o.decided_at IS NOT NULL AND o.decided_at >= ? AND o.id <> ?");
    $out = [];
    foreach (ordItems($pdo) as $i => $name) {
        $r = $m["stock_$i"] ?? null;
        $total = $r ? max(0, (int)$r['svalue']) : null;
        $used = 0;
        if ($r) { $usedSql->execute([$name, $r['updated_at'], $excludeId]); $used = (int)$usedSql->fetchColumn(); }
        $out[] = ['pid' => $i, 'item' => $name, 'ea' => $total === null ? null : max(0, $total - $used), 'total' => $total, 'used' => $used,
                  'by' => $r['updated_by'] ?? '', 'at' => $r['updated_at'] ?? null];
    }
    return $out;
}
function ordMinOrderMsg(int $min, int $have): string {
    return 'The minimum order is ' . number_format($min) . ' EA (' . number_format($min * ORD_L_PER_EA) . ' L). This order has ' . number_format($have) . ' EA.';
}
function ordOutletCount(PDO $pdo): int {
    return (int)$pdo->query("SELECT COUNT(*) FROM `" . ORD_T_OUT . "`")->fetchColumn();
}

/**
 * Resolve the logged-in user from the session AND the current users.php, so a deleted
 * user or a changed role/zone takes effect immediately.
 * kind: 'rohan' | 'hpcl' | 'admin'
 */
function ordUser(): array {
    $uname = $_SESSION['hpcl_user']['username'] ?? '';
    if ($uname === '') ordFail(401, 'Not authenticated. Please sign in again.');

    // An outlet profile (the "SAP No." login): one outlet, read from the outlet table every time. It places and follows the orders of that outlet only.
    if (ouSessionIsOutlet()) {
        $row = ouFind(ordDB(), (string)$uname);
        if (!$row) { session_destroy(); ordFail(401, 'This account no longer exists.'); }
        $sess = ouSession($row);
        if (!$sess || !isset(ORD_ZONES[$sess['filter']['zone']])) ordFail(403, 'This SAP number is not linked to a zone and region yet. Please contact your Zone Officer.');
        return ['username' => $uname, 'label' => (string)$row['label'], 'kind' => 'hpcl', 'zone' => $sess['filter']['zone'], 'zones' => [$sess['filter']['zone']], 'ros' => $sess['ros'],
                'level' => 'regional', 'outlet' => true, 'sales_areas' => $sess['sales_areas'], 'sap_code' => (string)$row['sap_code'], 'team' => [$uname], 'hsuper' => false, 'ast' => []];
    }

    $users = usersLoad();
    if (!isset($users[$uname])) {
        session_destroy();
        ordFail(401, 'This account no longer exists.');
    }
    $u    = $users[$uname];
    $role = $u['role'] ?? '';
    $org  = $u['org'] ?? null;
    $zone = $u['filter']['zone'] ?? null;
    // A Zone Officer / HPCL super admin can cover several zones ('zones'); everyone else has the one zone of the filter. $zone stays the first of them.
    $zones = array_values(array_filter(array_map('strval', (array)($u['zones'] ?? [])), fn($z) => isset(ORD_ZONES[$z])));
    if (!$zones && $zone && isset(ORD_ZONES[$zone])) $zones = [$zone];
    if ($zones && !in_array($zone, $zones, true)) $zone = $zones[0];
    // Regions (regional offices) the user was given inside the zones. Empty = the whole zone (accounts made before regions existed).
    $ros = [];
    foreach ($zones as $zn) foreach (ordZoneRos($zn) as $r) $ros[] = $r;
    $ros = array_values(array_intersect($ros, array_map('strval', (array)($u['ros'] ?? []))));

    if ($role === 'superadmin')                     $kind = 'admin';
    elseif ($role === 'zone' && $org === 'rohan')   $kind = 'rohan';
    elseif ($role === 'zone' && $org === 'hpcl')    $kind = 'hpcl';
    else ordFail(403, 'Your account does not have access to orders.');

    if ($kind !== 'admin' && (!$zone || !isset(ORD_ZONES[$zone]))) {
        ordFail(403, 'Your account is not mapped to a zone. Please contact the administrator.');
    }
    // Zone Officer (covers the zone / regions given) or Regional Officer (one region, some sales areas; made by a Zone Officer). Officers made before levels existed are Zone Officers.
    $level = ($kind !== 'admin' && ($u['level'] ?? '') === 'regional') ? 'regional' : 'zone';
    $salesAreas = [];
    if ($level === 'regional') {
        $salesAreas = array_values(array_filter(array_map('strval', (array)($u['sales_areas'] ?? [])), fn($d) => trim($d) !== ''));
        // a Regional Officer without sales areas would see the whole region: that is a mistake, so they see nothing until they are given some
        if (!$salesAreas) ordFail(403, 'Your account has no sales areas (SA) assigned. Please contact your Zone Officer.');
    }
    // A Zone Officer also sees the orders their Regional Officers placed (the officer + their team).
    $team = [$uname];
    if ($kind !== 'admin' && $level === 'zone') foreach ($users as $n => $tu) if (($tu['level'] ?? '') === 'regional' && ($tu['created_by'] ?? '') === $uname) $team[] = (string)$n;
    // An HPCL super admin is a super admin of the HPCL organisation: it sees every order (not drafts) and decides the orders Rohan Energy placed, but changes nothing else
    // (no stock / prices / permissions / invoices / uploads - see the allow-list at the bottom of the action switch).
    $hsuper = $kind === 'admin' && $org === 'hpcl';
    // A super admin (Rohan Energy or HPCL) sees everything on every page; the states it was created with only decide WHICH PENDING ORDERS IT APPROVES
    // (ast = those states; none = approves every state).
    $ast = $kind === 'admin' ? approvalStates($u) : [];
    return ['username' => $uname, 'label' => $u['label'] ?? $uname, 'kind' => $kind, 'zone' => $zone, 'zones' => $kind === 'admin' ? [] : $zones, 'ros' => $kind === 'admin' ? [] : $ros,
            'level' => $level, 'sales_areas' => $salesAreas, 'team' => $team, 'hsuper' => $hsuper, 'ast' => $ast];
}

function ordRequireCsrf(array $body): void {
    $sent = (string)($body['csrf'] ?? '');
    $have = (string)($_SESSION['csrf_token'] ?? '');
    if ($have === '' || !hash_equals($have, $sent)) {
        ordFail(403, 'Invalid security token. Please refresh the page and try again.');
    }
}

/** SQL fragment + params limiting which orders this user may see at all. */
function ordScope(array $me): array {
    [$roSql, $roP] = ordRoSql($me['ros'] ?? []);
    [$dSql, $dP]   = ordSaSql($me['sales_areas'] ?? []);   // a Regional Officer only sees the sales areas they handle
    $others = array_values(array_diff($me['team'] ?? [], [$me['username']]));   // a Zone Officer's Regional Officers
    $inOthers = $others ? ' IN (' . implode(',', array_fill(0, count($others), '?')) . ')' : '';
    $zs = $me['zones'] ?? ($me['zone'] ? [$me['zone']] : []);
    $inZones = ' IN (' . implode(',', array_fill(0, max(1, count($zs)), '?')) . ')';
    if (!$zs) $zs = [''];
    // An outlet profile (an HPCL Retail Outlet login) only ever sees the orders of its own SAP number (stored in ro_code).
    // The HPCL officers of its region / sales area see what the outlets under them placed - while it is still pending too, like their own team's orders
    // (the Rohan Energy super admin decides it; the officer only follows it).
    $sapSql = !empty($me['sap_code']) ? ' AND o.ro_code = ?' : '';
    $sapP   = !empty($me['sap_code']) ? [$me['sap_code']] : [];
    $outletOrders = (empty($me['sap_code']) && $me['kind'] === 'hpcl') ? " OR o.created_by IN (SELECT sap_code FROM `" . OU_T . "`)" : '';
    switch ($me['kind']) {
        // a Rohan officer sees their own orders plus the orders HPCL placed once the super admin has approved them, for the zone / regions, so they can deliver them and upload the receipt and Proof of Delivery;
        // a Zone Officer also sees the (submitted) orders of their Regional Officers
        // (a Rohan Zone Officer also sees - and decides - the orders the Rohan super admin placed in his zone / regions)
        case 'rohan': return ["(o.created_by = ?" . ($others ? " OR (o.created_by$inOthers AND o.status <> 'draft')" : '') . (($me['level'] ?? 'zone') === 'zone' ? " OR (o.placed_role = 'rohan_admin' AND o.status <> 'draft')" : '') . " OR (o.doc_type = 'invoice' AND o.status = 'approved')) AND o.zone$inZones" . $roSql . $dSql, array_merge([$me['username']], $others, $zs, $roP, $dP)];
        // an HPCL officer sees the Rohan orders of the zone, their own orders, and the other HPCL orders only once approved (while pending / rejected they are the super admin's business)
        // an HPCL officer's own drafts are theirs alone; a Zone Officer also sees the orders the HPCL super admin placed in the zone (the SAP number comes under them)
        case 'hpcl':  $hAdmin = (($me['level'] ?? 'zone') === 'zone' && empty($me['sap_code'])) ? " OR o.placed_role = 'hpcl_admin'" : '';
            return ["o.zone$inZones AND (o.status <> 'draft' OR o.created_by = ?) AND o.created_by <> '" . ORD_HIST_USER . "' AND (o.doc_type = 'so' OR o.created_by = ?" . ($others ? " OR o.created_by$inOthers" : '') . " OR o.status = 'approved'$outletOrders$hAdmin)" . $roSql . $dSql . $sapSql, array_merge($zs, [$me['username'], $me['username']], $others, $roP, $dP, $sapP)];
        default:
            // a super admin made for some states only sees the orders of those states (and always the orders he placed himself)
            $ast = array_values($me['ast'] ?? []);
            $stSql = $ast ? ' AND (o.state IN (' . implode(',', array_fill(0, count($ast), '?')) . ') OR o.created_by = ?)' : '';
            $stP = $ast ? array_merge($ast, [$me['username']]) : [];
            if (empty($me['hsuper'])) return ['1=1' . $stSql, $stP];
            // an HPCL super admin made for some zones only sees the orders of those zones / regions
            $hz = $me['zones'] ?? [];
            return ["(o.status <> 'draft' OR o.created_by = ?) AND o.created_by <> '" . ORD_HIST_USER . "'" . ($hz ? ' AND o.zone' . $inZones : '') . $roSql . $stSql, array_merge([$me['username']], $hz, $roP, $stP)];
    }
}

/** Regional offices (regions) of a portal zone: every region of the Master Sheet zones that belong to it. */
function ordZoneRos(string $zone): array {
    $out = [];
    foreach (ORD_SHEET_ZONES as $d) if ($d['zone'] === $zone) foreach ($d['ros'] as $ro) $out[] = $ro;
    return $out;
}
/** The client's zone name (Master Sheet zone, e.g. "Noida (UP-West) Zone") of a region; the outlet's portal zone when the region is unknown. */
function ordSheetZoneOfRo(string $ro, string $fallback = ''): string {
    foreach (ORD_SHEET_ZONES as $n => $d) if (in_array($ro, $d['ros'], true)) return $n;
    return $fallback;
}
/** ' AND o.ro IN (...)' limiting orders to a user's regions; nothing when the user has the whole zone. */
function ordRoSql(array $ros, string $col = 'o.ro'): array {
    if (!$ros) return ['', []];
    return [' AND ' . $col . ' IN (' . implode(',', array_fill(0, count($ros), '?')) . ')', array_values($ros)];
}
/** A sales-area name made comparable: upper case, runs of spaces made one ("MUZAFFARPUR  RETAIL" = "MUZAFFARPUR RETAIL"). */
function ordSaKey(string $s): string {
    return strtoupper(trim(preg_replace('/\s+/', ' ', $s)));
}
/** ' AND <sales area column> IN (...)' limiting orders to a Regional Officer's sales areas (SA); nothing for everyone else. Spacing and case do not matter. */
function ordSaSql(array $salesAreas, string $col = 'o.sales_area'): array {
    if (!$salesAreas) return ['', []];
    $c = "UPPER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE($col, ''), '  ', ' '), '  ', ' '), '  ', ' ')))";
    return [' AND ' . $c . ' IN (' . implode(',', array_fill(0, count($salesAreas), '?')) . ')', array_map('ordSaKey', array_values($salesAreas))];
}
/** Does the user's region list cover this regional office? An empty list means the whole zone. */
function ordCoversRo(array $me, string $ro): bool {
    return !$me['ros'] || in_array($ro, $me['ros'], true);
}
/** Does a Regional Officer's sales-area list cover this sales area? No list (everyone else) means all. */
function ordCoversSa(array $me, string $salesArea): bool {
    $sa = $me['sales_areas'] ?? [];
    if (!$sa) return true;
    return in_array(ordSaKey($salesArea), array_map('ordSaKey', $sa), true);
}
/** Region and sales area of an order / outlet are both inside what this user handles. */
function ordCoversOrder(array $me, string $ro, string $salesArea): bool {
    return ordCoversRo($me, $ro) && ordCoversSa($me, $salesArea);
}
/** Was the order placed by this user - or, for a Zone Officer, by one of their Regional Officers? */
function ordOwns(array $me, string $createdBy): bool {
    return in_array($createdBy, $me['team'] ?? [$me['username']], true);
}

/** Is this order (its state) one of the states a super admin approves? A super admin made without states approves everything. */
function ordApprCovers(array $me, string $state): bool {
    $ast = $me['ast'] ?? [];
    return !$ast || in_array($state, $ast, true);
}
/** ' AND ...' limiting orders to the states a super admin approves (nothing for everyone else and for "all states"). */
function ordApprSql(array $me, string $sc = 'o.state'): array {
    $ast = $me['ast'] ?? [];
    if (!$ast) return ['', []];
    return [' AND ' . $sc . ' IN (' . implode(',', array_fill(0, count($ast), '?')) . ')', array_values($ast)];
}
/** The states of some zones / regions (the regions' own states when regions are given, else all the states of the zones). */
function ordStatesOfScope(array $zs, ?array $ros): array {
    $out = [];
    if ($ros) { foreach (ORD_STATE_RO as $st => $rs) if (array_intersect($rs, $ros)) $out[$st] = true; }
    else foreach ($zs as $z) foreach (ORD_ZONES[$z] ?? [] as $st) $out[$st] = true;
    return array_keys($out);
}
/** Super admins that approve the orders of these states: Rohan Energy super admins ($hpcl = false: they decide what HPCL placed) or HPCL super admins ($hpcl = true: they decide what Rohan Energy placed). */
function ordSuperApprovers($states, bool $hpcl): array {
    $st = array_values(array_filter((array)$states, fn($x) => $x !== null && $x !== ''));
    $out = [];
    foreach (usersLoad() as $uname => $u) {
        if (($u['role'] ?? '') !== 'superadmin' || (($u['org'] ?? null) === 'hpcl') !== $hpcl) continue;
        $theirs = approvalStates($u);
        if ($theirs && !array_intersect($theirs, $st)) continue;
        $out[] = ['username' => $uname, 'label' => ($u['label'] ?? $uname) . ($hpcl ? ' (Super Admin)' : '')];
    }
    return $out;
}
/** The HPCL super admin places orders like an HPCL officer, for every zone: this is the user the order is checked against. */
function ordHpclAs(array $me): array { return ['kind' => 'hpcl'] + ordAllZones($me); }

/** The Rohan Energy super admin may place orders too, for any zone (like a Rohan Energy officer; HPCL then approves). The HPCL super admin may not. */
function ordAdminPlaces(array $me): bool { return $me['kind'] === 'admin' && empty($me['hsuper']); }
/** The user with every portal zone (the zone of an order then follows from its outlet's SAP code). */
function ordAllZones(array $me): array { $z = array_keys(ORD_ZONES); return ['zone' => $z[0], 'zones' => $z, 'ros' => []] + $me; }

/** Portal zones an account covers: its 'zones' list, else the one zone of its filter. */
function ordUserZones(array $u): array {
    $z = array_values(array_unique(array_filter(array_map('strval', (array)($u['zones'] ?? [])), fn($x) => $x !== '')));
    if ($z) return $z;
    $f = is_array($u['filter'] ?? null) ? (string)($u['filter']['zone'] ?? '') : '';
    return $f !== '' ? [$f] : [];
}
/** Is this zone one of the zones the (Zone / Regional) officer covers? */
function ordInZones(array $me, ?string $zone): bool {
    $zs = $me['zones'] ?? ($me['zone'] ? [$me['zone']] : []);
    return $zone !== null && $zone !== '' && in_array($zone, $zs, true);
}

/** HPCL officers mapped to a zone - or to any of several zones (names only). */
function ordApprovers($zone, ?array $ros = null, ?array $salesAreas = null): array {
    $zs = array_values(array_filter((array)$zone, fn($z) => $z !== null && $z !== ''));
    if (!$zs) return [];
    $users = usersLoad();
    $out = [];
    foreach ($users as $uname => $u) {
        if (($u['role'] ?? '') === 'zone' && ($u['org'] ?? null) === 'hpcl' && array_intersect(ordUserZones($u), $zs)) {
            // an approver with regions only covers those regions; one without covers the whole zone
            $theirs = array_map('strval', (array)($u['ros'] ?? []));
            if ($ros && $theirs && !array_intersect($ros, $theirs)) continue;
            // a Regional Officer only approves the sales areas they handle; a Zone Officer approves the whole zone / regions
            if (($u['level'] ?? '') === 'regional') {
                $norm = fn($a) => array_map('ordSaKey', array_map('strval', (array)$a));
                $theirS = $norm($u['sales_areas'] ?? []);
                if (!$theirS || ($salesAreas !== null && !array_intersect($norm($salesAreas), $theirS))) continue;
            }
            $out[] = ['username' => $uname, 'label' => $u['label'] ?? $uname];
        }
    }
    // the HPCL super admins whose approval states include it decide the order too
    foreach (ordSuperApprovers(ordStatesOfScope($zs, $ros), true) as $a) $out[] = $a;
    return $out;
}

/** Who placed the order, as stored on it: rohan|hpcl x admin|zone|regional, or hpcl_outlet (a "SAP No." login). */
function ordPlacerRole(array $me): string {
    if (!empty($me['outlet'])) return 'hpcl_outlet';
    if ($me['kind'] === 'admin') return !empty($me['hsuper']) ? 'hpcl_admin' : 'rohan_admin';
    return ($me['kind'] === 'hpcl' ? 'hpcl' : 'rohan') . '_' . (($me['level'] ?? 'zone') === 'regional' ? 'regional' : 'zone');
}
/** Who may approve an order, in words (by the role of the person who placed it): see ordAwaitCond for the exact rule. */
function ordApproverText(?string $role, string $docType = 'so'): string {
    switch ($role) {
        case 'rohan_admin':    return 'Rohan Super Admin, Rohan Zone Officer, HPCL Super Admin, HPCL Zone Officer or HPCL Regional Officer';
        case 'rohan_zone':     return 'the Rohan Zone Officer who placed it, Rohan Super Admin, HPCL Super Admin or HPCL Zone Officer';
        case 'rohan_regional': return 'Rohan Super Admin, Rohan Zone Officer, HPCL Super Admin or HPCL Zone Officer';
        case 'hpcl_regional':  return 'HPCL Zone Officer, HPCL Super Admin or Rohan Super Admin';
        case 'hpcl_zone':      return 'the HPCL Zone Officer who placed it, HPCL Super Admin or Rohan Super Admin';
        case 'hpcl_admin':     return 'the HPCL Super Admin who placed it, the HPCL Zone Officer of the SAP number or Rohan Super Admin';
        case 'hpcl_outlet':    return 'HPCL Regional Officer, HPCL Zone Officer, HPCL Super Admin or Rohan Super Admin';
    }
    return $docType === 'invoice' ? 'Rohan Super Admin' : 'HPCL officer of the zone or Rohan Energy';
}
/**
 * The orders that WAIT FOR THIS USER'S DECISION (once they are pending): [SQL condition, params] on the order alias $a. Any ONE of the people named for an order decides it (first to act wins):
 *   placed by          -> approved by
 *   Rohan Super Admin  -> Rohan Super Admin, Rohan Zone Officer, HPCL Super Admin, HPCL Zone Officer, HPCL Regional Officer
 *   Rohan Zone Officer -> himself, Rohan Super Admin, HPCL Super Admin, HPCL Zone Officer
 *   Rohan Regional Off.-> Rohan Super Admin, his Rohan Zone Officer, HPCL Super Admin, HPCL Zone Officer
 *   HPCL Super Admin   -> himself, the HPCL Zone Officer of the SAP number, Rohan Super Admin
 *   HPCL Zone Officer  -> himself, HPCL Super Admin, Rohan Super Admin
 *   HPCL Regional Off. -> his HPCL Zone Officer, HPCL Super Admin, Rohan Super Admin
 *   HPCL outlet        -> HPCL Regional Officer, HPCL Zone Officer, HPCL Super Admin, Rohan Super Admin
 * (zone / region / sales area / state limits come from ordScope and the super admin's approval states). An outlet login decides nothing.
 */
function ordAwaitCond(array $me, string $a = 'o.'): array {
    $R = $a . 'placed_role'; $C = $a . 'created_by';
    if ($me['kind'] === 'admin') {
        [$ap, $app] = ordApprSql($me, $a . 'state');
        $ap = $ap !== '' ? substr($ap, 5) : '1 = 1';
        // a super admin always decides the order he placed himself, whatever states he was limited to; every other order only inside those states
        if (empty($me['hsuper'])) return ["$C = ? OR ($ap)", array_merge([$me['username']], $app)];   // the Rohan super admin decides every order (of the states he approves)
        return ["(($R IN ('rohan_admin','rohan_zone','rohan_regional','hpcl_regional','hpcl_zone','hpcl_outlet')) AND $ap) OR ($R = 'hpcl_admin' AND $C = ?)", array_merge($app, [$me['username']])];
    }
    $others = array_values(array_diff($me['team'] ?? [], [$me['username']]));
    $in = $others ? ' IN (' . implode(',', array_fill(0, count($others), '?')) . ')' : '';
    $zone = ($me['level'] ?? 'zone') === 'zone';
    if ($me['kind'] === 'rohan') {
        if (!$zone) return ['1 = 0', []];
        return ["($R = 'rohan_admin' OR ($R = 'rohan_zone' AND $C = ?)" . ($others ? " OR ($R = 'rohan_regional' AND $C$in)" : '') . ')', array_merge([$me['username']], $others)];   // a Zone Officer may also approve the order he placed himself
    }
    if ($me['kind'] === 'hpcl') {
        if (!empty($me['sap_code'])) return ['1 = 0', []];   // an outlet login only places and follows its orders
        if (!$zone) return ["$R IN ('rohan_admin','hpcl_outlet')", []];
        return ["($R IN ('rohan_admin','rohan_zone','rohan_regional','hpcl_admin','hpcl_outlet') OR ($R = 'hpcl_zone' AND $C = ?)" . ($others ? " OR ($R = 'hpcl_regional' AND $C$in)" : '') . ')', array_merge([$me['username']], $others)];
    }
    return ['1 = 0', []];
}
/** Put "can_decide" on every order: is it pending and waiting for THIS user? */
function ordMarkDecidable(PDO $pdo, array $me, array &$orders): void {
    $ids = [];
    foreach ($orders as $o) if (($o['status'] ?? '') === 'pending') $ids[] = (int)$o['id'];
    $ok = [];
    if ($ids) {
        [$wc, $wp] = ordAwaitCond($me);
        $st = $pdo->prepare("SELECT o.id FROM `" . ORD_T . "` o WHERE o.id IN (" . implode(',', array_fill(0, count($ids), '?')) . ") AND o.status = 'pending' AND ($wc)");
        $st->execute(array_merge($ids, $wp));
        $ok = array_flip(array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN)));
    }
    foreach ($orders as &$o) $o['can_decide'] = isset($ok[(int)$o['id']]);
    unset($o);
}
/** Once: the role of whoever placed each older order (from the account that placed it), so the approval rules apply to them too. */
function ordBackfillPlacedRole(PDO $pdo): void {
    $rows = $pdo->query("SELECT DISTINCT created_by, doc_type FROM `" . ORD_T . "` WHERE placed_role IS NULL AND created_by <> '" . ORD_HIST_USER . "'")->fetchAll();
    if (!$rows) return;
    $users = usersLoad();
    $outlets = [];
    try { $outlets = array_flip($pdo->query("SELECT sap_code FROM `" . OU_T . "`")->fetchAll(PDO::FETCH_COLUMN)); } catch (Throwable $e) {}
    $upd = $pdo->prepare("UPDATE `" . ORD_T . "` SET placed_role = ? WHERE created_by = ? AND doc_type = ? AND placed_role IS NULL");
    foreach ($rows as $r) {
        $n = (string)$r['created_by']; $u = $users[$n] ?? null;
        if (is_array($u) && ($u['role'] ?? '') === 'superadmin') $role = ($u['org'] ?? null) === 'hpcl' ? 'hpcl_admin' : 'rohan_admin';
        elseif (is_array($u) && ($u['role'] ?? '') === 'zone') $role = (($u['org'] ?? null) === 'hpcl' ? 'hpcl' : 'rohan') . '_' . (($u['level'] ?? '') === 'regional' ? 'regional' : 'zone');
        elseif (isset($outlets[$n])) $role = 'hpcl_outlet';
        else $role = $r['doc_type'] === 'invoice' ? 'hpcl_zone' : 'rohan_zone';   // the account is gone: the side it placed for is all that is known
        $upd->execute([$role, $n, $r['doc_type']]);
    }
}

/** Can a Rohan Energy order of this place be approved by anybody? An HPCL officer of the place, or - always - the Rohan Energy super admin (and the Rohan officers of the area). */
function ordHasApprover($zone, ?array $ros = null, ?array $salesAreas = null): bool {
    if (ordApprovers($zone, $ros, $salesAreas)) return true;
    foreach (usersLoad() as $u) if (($u['role'] ?? '') === 'superadmin' && ($u['org'] ?? null) !== 'hpcl') return true;
    return false;
}

function ordFormat(array $r, array $items = []): array {
    $r['id']        = (int)$r['id'];
    $r['ref']       = $r['order_ref'] ?: sprintf('RE-ORD-%06d', $r['id']);
    $r['sap_code']  = $r['ro_code'];   // the outlet's SAP code (stored in the ro_code column)
    $r['doc_type']  = ($r['doc_type'] ?? 'so') === 'invoice' ? 'invoice' : 'so';
    $r['approvers_label'] = ordApproverText($r['placed_role'] ?? null, $r['doc_type']);   // who may approve it, in words
    $r['tax_inv']   = $r['doc_type'] === 'invoice' || !empty($r['inv_flag']);   // does this order have a Tax Invoice (generated, or uploaded by the super admin)?
    unset($r['inv_flag']);
    $r['decided_org'] = in_array($r['status'], ['approved', 'rejected'], true) ? ((string)($r['decided_org'] ?? '') ?: 'admin') : '';   // who decided: hpcl, rohan (an officer) or admin (the Rohan Energy super admin)
    $r['has_receipt'] = !empty($r['has_receipt']);
    $r['has_invoice_file'] = !empty($r['has_invoice_file']);
    $r['invoice_mode'] = ($r['invoice_mode'] ?? 'auto') === 'manual' ? 'manual' : 'auto';
    $ie = isset($r['invoice_edits']) && $r['invoice_edits'] !== '' ? json_decode((string)$r['invoice_edits'], true) : null;
    $r['invoice_edits'] = is_array($ie) && $ie ? $ie : null;   // corrections made to the generated Tax Invoice, or null
    $r['total_ea'] = (int)$r['total_ea'];
    $r['total_vol'] = (int)$r['total_vol'];
    $r['delivery_stage'] = $r['status'] === 'approved' ? ($r['delivery_stage'] === 'delivered' ? 'delivered' : 'transit') : '';
    // ea = every EA delivered (paid + foc: the quantity, stock and MIS); paid = the EA billed (amount, Tax Invoice); foc = the free EA, listed on the Sales Order and Tax Invoice.
    // paid = null: a line from before the FOC list - its FOC (if any) is inside ea, billed whole on the Tax Invoice.
    $r['items']     = array_map(fn($i) => ['item' => $i['item'], 'ea' => (int)$i['ea'], 'vol' => (int)$i['vol'],
                                           'rate' => isset($i['rate']) ? (float)$i['rate'] : null, 'gst' => isset($i['gst']) ? (float)$i['gst'] : null,
                                           'foc' => (int)($i['foc_eff'] ?? 0), 'paid' => isset($i['paid']) ? (int)$i['paid'] : null], $items);
    $r['direct']    = (bool)array_filter($items, fn($i) => !empty($i['direct']));   // sold straight to the outlet: Invoice to = Dispatch to
    unset($r['order_ref']);
    return $r;
}

function ordItemsFor(PDO $pdo, array $ids): array {
    if (!$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("SELECT i.order_id, i.item, i.ea, i.vol, i.rate, i.gst, i.foc, i.paid, o.status FROM `" . ORD_T_ITEMS . "` i JOIN `" . ORD_T . "` o ON o.id = i.order_id WHERE i.order_id IN ($ph) ORDER BY i.id");
    $st->execute($ids);
    $direct = array_flip(ordDirectNames($pdo));
    $map = [];
    foreach ($st->fetchAll() as $row) {
        // fixed on the line when the order was saved (paid + foc = ea); a line from before the FOC list (paid NULL) keeps the FOC it was given, if any
        $row['foc_eff'] = $row['paid'] !== null ? max(0, (int)$row['foc']) : ($row['foc'] !== null ? min((int)$row['foc'], max(0, (int)$row['ea'] - 1)) : 0);
        $row['direct'] = isset($direct[$row['item']]);
        $map[(int)$row['order_id']][] = $row;
    }
    return $map;
}

/** Columns of an order row for the lists / order page: everything plus whether a payment receipt has been uploaded. */
function ordSelect(): string {
    return "o.*, EXISTS(SELECT 1 FROM `" . ORD_T_FILE . "` f WHERE f.order_id = o.id AND f.kind = 'payment') AS has_receipt,
            EXISTS(SELECT 1 FROM `" . ORD_T_FILE . "` f WHERE f.order_id = o.id AND f.kind = 'invoice') AS has_invoice_file,
            (SELECT e.org FROM `" . ORD_T_EVENT . "` e WHERE e.order_id = o.id AND e.action IN ('approved','rejected') ORDER BY e.id DESC LIMIT 1) AS decided_org";
}

/** One order the user is allowed to see, or null. */
function ordLoad(PDO $pdo, array $me, int $id): ?array {
    [$scope, $sp] = ordScope($me);
    $st = $pdo->prepare("SELECT " . ordSelect() . " FROM `" . ORD_T . "` o WHERE o.id = ? AND $scope");
    $st->execute(array_merge([$id], $sp));
    $row = $st->fetch();
    if (!$row) return null;
    $items = ordItemsFor($pdo, [$id])[$id] ?? [];
    $o = [ordFormat($row, $items)];
    ordRetAttach($pdo, $o);
    ordMarkDecidable($pdo, $me, $o);
    if (ordHpclInvHidden($pdo, $me)) ordHideInv($o[0]);
    return $o[0];
}

function ordEvents(PDO $pdo, int $id): array {
    $st = $pdo->prepare("SELECT action, from_status, to_status, username, user_label, org, `comment`, created_at FROM `" . ORD_T_EVENT . "` WHERE order_id = ? AND action <> 'invoice_edited' ORDER BY id ASC");
    $st->execute([$id]);
    return $st->fetchAll();
}

function ordLogEvent(PDO $pdo, int $orderId, string $action, ?string $from, string $to, array $me, ?string $comment = null): void {
    $org = $me['kind'] === 'admin' ? (!empty($me['hsuper']) ? 'hpcl' : null) : $me['kind'];
    $pdo->prepare("INSERT INTO `" . ORD_T_EVENT . "` (order_id, action, from_status, to_status, username, user_label, org, `comment`, created_at) VALUES (?,?,?,?,?,?,?,?,NOW())")
        ->execute([$orderId, $action, $from, $to, $me['username'], $me['label'], $org, $comment]);
}

// ── validation ───────────────────────────────────────────────────────────────
/** Today's date (YYYY-MM-DD) in India: the order date of every order placed on the form (the server decides, the browser cannot change it). */
function ordToday(): string {
    return (new DateTime('now', new DateTimeZone('Asia/Kolkata')))->format('Y-m-d');
}
function ordStr($v, int $max): string {
    $v = trim((string)($v ?? ''));
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $v) ?? '';
    return mb_substr($v, 0, $max);
}

/**
 * Validate the order payload for a Rohan officer's zone. Returns cleaned data, or ends the request with 422.
 * $forSubmit adds the checks that a draft is allowed to skip.
 */
function ordValidate(PDO $pdo, array $body, array $me, bool $forSubmit): array {
    [$data, $errors] = ordCheck($pdo, $body, $me, $forSubmit);
    if ($errors) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Please fix the highlighted fields.', 'fields' => $errors]);
        exit;
    }
    return $data;
}

/** The checks behind ordValidate: returns [cleaned data, []] or [null, field errors]. The bulk upload reports these per order. */
function ordCheck(PDO $pdo, array $body, array $me, bool $forSubmit, array $focFixed = []): array {   // $focFixed (bulk upload only): item => FOC EA the sheet itself gives
    $zone = $me['zone'];
    $errors = [];

    $date = ordStr($body['date'] ?? '', 10);
    $d = DateTime::createFromFormat('Y-m-d', $date);
    if (!$d || $d->format('Y-m-d') !== $date) $errors['date'] = 'Enter a valid order date.';
    elseif ($date > ordToday()) $errors['date'] = 'Order date cannot be in the future.';

    // The SAP code decides zone / state / regional office / outlet / district / sales area; values sent by the browser are ignored.
    $sap = ordStr($body['sap_code'] ?? '', 12);
    $state = $ro = $outlet = $district = '';
    $salesArea = '';
    $detail = ['outlet_address' => '', 'outlet_phone' => '', 'outlet_pincode' => '', 'outlet_gstin' => '', 'outlet_pan' => '',
               'invoice_name' => '', 'invoice_address' => '', 'invoice_state' => '', 'invoice_pan' => '', 'invoice_gstin' => ''];
    if (!preg_match('/^\d{6,12}$/', $sap)) {
        $errors['sap_code'] = 'Enter a valid SAP code (digits only).';
    } else {
        $o = ordOutlet($pdo, $sap);   // address / phone / pincode / GSTIN / PAN are copied onto the order too (for the Sales Order PDF)
        if (!$o)                          $errors['sap_code'] = 'SAP code not found in the outlet list.';
        elseif (!empty($me['sapStates']) && !in_array((string)$o['state'], $me['sapStates'], true)) $errors['sap_code'] = 'This outlet is in ' . ($o['state'] !== '' ? $o['state'] : 'a state') . ', which is not one of the states you handle (' . implode(', ', $me['sapStates']) . ').';
        elseif (!ordInZones($me, $o['zone'])) $errors['sap_code'] = 'This outlet belongs to ' . ordSheetZoneOfRo((string)$o['ro'], (string)$o['zone']) . ', not your zone (' . implode(' / ', $me['zones'] ?? [$zone]) . ').';
        elseif (!ordCoversRo($me, $o['ro'])) $errors['sap_code'] = 'This outlet belongs to ' . ordSheetZoneOfRo((string)$o['ro'], (string)$o['zone']) . ' (' . ucwords(strtolower(preg_replace('/\s+RET(AIL)?(\s+(RO|REG\w*))?$/i', '', (string)$o['ro']))) . ' region).';
        elseif (!ordCoversSa($me, (string)$o['sales_area'])) $errors['sap_code'] = 'This outlet is in the ' . ($o['sales_area'] !== '' ? $o['sales_area'] : '(no sales area)') . ' sales area, which is not one of your sales areas.';
        elseif (!empty($me['sap_code']) && (string)$o['sap_code'] !== (string)$me['sap_code']) $errors['sap_code'] = 'You can only place orders for your own outlet (SAP ' . $me['sap_code'] . ').';
        else {
            $zone = $o['zone'];   // an officer of several zones: the order belongs to the zone of its outlet
            if ($forSubmit && ($me['kind'] === 'hpcl' || !empty($me['byHpcl'])) && !ordSuperApprovers((string)$o['state'], false)) {
                $errors['sap_code'] = 'No Rohan Energy super admin is set to approve the orders of ' . ($o['state'] !== '' ? $o['state'] : 'this outlet') . ', so this order cannot be placed. Please contact the administrator.';
            }
            $state = $o['state']; $ro = $o['ro']; $outlet = $o['outlet_name'];
            $district = $o['district']; $salesArea = (string)$o['sales_area'];
            $detail = ['outlet_address' => (string)$o['address'], 'outlet_phone' => (string)$o['phone'], 'outlet_pincode' => (string)$o['pincode'],
                       'outlet_gstin' => (string)$o['gstin'], 'outlet_pan' => (string)$o['pan'],
                       'invoice_name' => (string)$o['inv_name'], 'invoice_address' => (string)$o['inv_address'], 'invoice_state' => (string)$o['inv_state'],
                       'invoice_pan' => (string)$o['inv_pan'], 'invoice_gstin' => (string)$o['inv_gstin']];
        }
    }

    $remarks   = ordStr($body['remarks'] ?? '', 500);

    $items = [];
    $seen  = [];
    $stock = array_column(ordStock($pdo, (int)($body['id'] ?? 0)), 'ea', 'item');
    $rawItems = $body['items'] ?? [];
    if (!is_array($rawItems)) $rawItems = [];
    if (count($rawItems) > ORD_MAX_LINES) $errors['items'] = 'An order can have at most ' . ORD_MAX_LINES . ' items.';
    $focRules = ordFocRules($pdo);
    foreach ($rawItems as $i => $it) {
        $name = ordStr($it['item'] ?? '', 80);
        $paid = $it['ea'] ?? null;   // the quantity the officer orders (and is billed for); the FOC list adds the free EA on top
        if (!is_numeric($paid) || (int)$paid != $paid || (int)$paid < 1 || (int)$paid > ORD_MAX_EA) { $errors["item_$i"] = 'Quantity must be a whole number between 1 and ' . ORD_MAX_EA . '.'; continue; }
        if (!in_array($name, ordItems($pdo), true)) { $errors["item_$i"] = 'Select a valid item.'; continue; }
        if (isset($seen[$name])) { $errors["item_$i"] = 'This item is already in the order.'; continue; }
        $seen[$name] = true;
        $paid = (int)$paid;
        $foc  = isset($focFixed[$name]) && (int)$focFixed[$name] > 0 ? (int)$focFixed[$name] : ordFocFor($focRules, $name, $paid);
        // the Rohan super admin editing an order sets the FOC of each line himself (this order only; the FOC list is not touched)
        if (!empty($me['focEdit']) && !isset($focFixed[$name])) {
            $fv = $it['foc'] ?? null;
            if (is_string($fv)) $fv = trim($fv);
            if ($fv === null || $fv === '' || !is_numeric($fv) || (int)$fv != $fv || (int)$fv < 0 || (int)$fv > ORD_MAX_EA) { $errors["foc_$i"] = 'FOC must be a whole number, 0 or more.'; continue; }
            $foc = (int)$fv;
        }
        $ea   = $paid + $foc;   // everything that is delivered and counted in stock and the MIS
        if ($ea > ORD_MAX_EA) { $errors["item_$i"] = 'Quantity with FOC is too large (at most ' . number_format(ORD_MAX_EA) . ' EA).'; continue; }
        $avail = $stock[$name] ?? null;
        if ($avail !== null && $ea > $avail) { $errors["item_$i"] = 'Only ' . number_format($avail) . ' EA of this product is available' . ($foc > 0 ? ' (' . number_format($paid) . ' ordered + ' . number_format($foc) . ' FOC).' : '.'); continue; }
        // the super admin, correcting an order placed by HPCL, also sets the rate (per EA, before GST) and GST % of every line
        $rate = $gst = null;
        if (!empty($me['rates'])) {
            $r = $it['rate'] ?? null; $g = $it['gst'] ?? null;
            if (!is_numeric($r) || (float)$r <= 0 || (float)$r > ORD_MAX_RATE) { $errors["rate_$i"] = 'Enter a rate between 0.01 and ' . number_format(ORD_MAX_RATE) . '.'; continue; }
            if (!is_numeric($g) || (float)$g < 0 || (float)$g > 100) { $errors["gst_$i"] = 'Enter a GST % between 0 and 100.'; continue; }
            $rate = round((float)$r, 2); $gst = round((float)$g, 2);
        }
        $items[] = ['item' => $name, 'ea' => $ea, 'paid' => $paid, 'foc' => $foc, 'vol' => $ea * ORD_L_PER_EA, 'rate' => $rate, 'gst' => $gst];
    }
    if ($forSubmit && !$items && !isset($errors['items'])) $errors['items'] = 'Add at least one item before submitting.';
    if ($forSubmit && $items && !isset($errors['items'])) {
        $byHpcl = $me['kind'] === 'hpcl' || !empty($me['byHpcl']);
        // the minimum order quantity applies to Rohan Energy AND HPCL officers; only the super admin correcting an order HPCL already placed is exempt
        $min = !empty($me['byHpcl']) ? 0 : ordMinOrder($pdo)['ea'];
        $have = array_sum(array_column($items, 'ea'));
        if ($min > 0 && $have < $min) $errors['items'] = ordMinOrderMsg($min, $have);
        // when the super admin gives the rates on the form the list prices are not needed
        if (!isset($errors['items']) && empty($me['rates']) && ($miss = ordMissingPrices($pdo, array_column($items, 'item')))) $errors['items'] = ordMissingPricesMsg($miss, $byHpcl);
    }

    if ($errors) return [null, $errors];

    return [[
        'order_date' => $date, 'zone' => $zone, 'state' => $state, 'ro' => $ro, 'ro_code' => $sap,
        'outlet' => $outlet, 'district' => $district, 'sales_area' => $salesArea ?: null,
        'remarks' => $remarks ?: null, 'items' => $items, 'detail' => $detail,
        'total_ea'  => array_sum(array_column($items, 'ea')),
        'total_vol' => array_sum(array_column($items, 'vol')),
    ], []];
}

// ── router ───────────────────────────────────────────────────────────────────
$body   = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) $body = [];
if ($_POST) $body = $_POST + $body;   // multipart upload (proof of delivery): the fields arrive in $_POST
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? ($body['action'] ?? '');

// The QR code on a Tax Invoice opens this without a sign-in: the order is found by its random token and only invoice fields are returned.
if ($action === 'public_invoice') {
    $pdo = ordDB();
    try { ordEnsureSchema($pdo); } catch (Exception $e) { error_log('orders.php schema: ' . $e->getMessage()); ordFail(500, 'Service unavailable.'); }
    $t = (string)($_GET['t'] ?? '');
    if (!preg_match('/^[0-9a-f]{32}$/', $t)) ordFail(404, 'Invoice not found.');
    $st = $pdo->prepare("SELECT * FROM `" . ORD_T . "` WHERE doc_token = ? AND (doc_type = 'invoice' OR inv_flag = 1) AND status = 'approved' AND invoice_no IS NOT NULL");   // an uploaded (manual) invoice has no generated page
    $st->execute([$t]);
    $row = $st->fetch();
    if (!$row) ordFail(404, 'Invoice not found.');
    $o = ordFormat($row, ordItemsFor($pdo, [(int)$row['id']])[(int)$row['id']] ?? []);
    foreach (['remarks', 'created_by', 'created_by_name', 'decided_by', 'decided_by_name', 'decided_org', 'sales_area', 'doc_token'] as $k) unset($o[$k]);
    $o['items'] = array_map(fn($i) => $i['paid'] === null ? array_diff_key($i, ['foc' => 1]) : $i, $o['items']);   // an older line has no FOC on its Tax Invoice; the others list it
    ordOut(['order' => $o]);
}

$me  = ordUser();
$pdo = ordDB();
try { ordEnsureSchema($pdo); }
catch (Exception $e) { error_log('orders.php schema: ' . $e->getMessage()); ordFail(500, 'Could not prepare the orders tables. Check that the database user may create tables.'); }

// A multipart body bigger than post_max_size arrives empty (no fields, no file): say so instead of reporting a bad token.
if ($method === 'POST' && !$_POST && !$_FILES && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0 && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/') === 0) ordFail(413, ordPodLimitMsg());
if ($method === 'POST') ordRequireCsrf($body);

// The HPCL super admin reads everything, places orders like an HPCL officer, decides Rohan Energy's orders and maintains the SAP numbers - nothing else.
if (!empty($me['hsuper']) && !in_array($action, ['meta', 'outlet', 'save', 'sap_list', 'sap_save', 'sap_import', 'sap_history', 'ro_report', 'list', 'get', 'history', 'submit', 'delete', 'approve', 'reject', 'pod_download', 'file_download', 'return_request', 'return_list', 'return_decide', 'change_log', 'outlet_officers', 'profile', 'superiors'], true)) {
    ordFail(403, 'This action is not available to an HPCL super admin.');
}

// An outlet profile (HPCL Retail Outlet) is an HPCL Regional Officer whose region / sales area is narrowed to ONE SAP number: it can do everything a Regional Officer
// can (approve Rohan Energy's orders, place orders, receipt, prices when allowed, bulk, SAP list...) but only for its own outlet - ordScope / ordCheck / ordDecide /
// ordSapScope all add "ro_code = its SAP number".

try {
    switch ($action) {
        case 'meta':    ordMeta($pdo, $me);                  break;
        case 'outlet':  ordOutletLookup($pdo, $me);          break;
        case 'sap_list':    ordSapList($pdo, $me);               break;
        case 'sap_save':    ordSapSave($pdo, $me, $body);        break;
        case 'sap_history': ordSapHistory($pdo, $me);            break;
        case 'sap_import':  ordSapImport($pdo, $me, $body);      break;
        case 'ro_report':   ordRoReport($pdo, $me);              break;
        case 'list':    ordList($pdo, $me);                  break;
        case 'get':     ordGet($pdo, $me);                   break;
        case 'history': ordHistory($pdo, $me);               break;
        case 'save':    ordSave($pdo, $me, $body);           break;
        case 'submit':  ordSubmit($pdo, $me, $body);         break;
        case 'delete':  ordDelete($pdo, $me, $body);         break;
        case 'bulk':    ordBulk($pdo, $me, $body);           break;
        case 'set_min_order': ordSetMinOrder($pdo, $me, $body); break;
        case 'set_perms':     ordSetPerms($pdo, $me, $body);    break;
        case 'set_prices':    ordSetPrices($pdo, $me, $body);   break;
        case 'set_stock':     ordSetStock($pdo, $me, $body);    break;
        case 'add_product':   ordAddProduct($pdo, $me, $body);  break;
        case 'delete_product': ordDeleteProduct($pdo, $me, $body); break;
        case 'save_foc_list': ordSaveFocList($pdo, $me, $body); break;
        case 'upload_pod':   ordUploadFile($pdo, $me, $body, 'pod');      break;
        case 'upload_receipt': ordUploadFile($pdo, $me, $body, 'payment'); break;
        case 'upload_invoice': ordUploadFile($pdo, $me, $body, 'invoice'); break;
        case 'edit_invoice':   ordEditInvoice($pdo, $me, $body);   break;
        case 'pod_download': ordFileDownload($pdo, $me, 'pod');           break;
        case 'file_download': ordFileDownload($pdo, $me, in_array($_GET['kind'] ?? '', ['payment', 'invoice'], true) ? $_GET['kind'] : 'pod'); break;
        case 'return_request': ordRetRequest($pdo, $me, $body); break;
        case 'return_list':    ordRetList($pdo, $me);           break;
        case 'return_decide':  ordRetDecide($pdo, $me, $body);  break;
        case 'change_log':     ordChangeLog($pdo, $me);         break;
        case 'outlet_officers': ordOutletOfficers($pdo, $me);   break;
        case 'profile':        ordProfile($pdo, $me);           break;
        case 'superiors':      ordSuperiors($pdo, $me);         break;
        case 'approve': ordDecide($pdo, $me, $body, true);   break;
        case 'reject':  ordDecide($pdo, $me, $body, false);  break;
        default:        ordFail(400, 'Unknown action.');
    }
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('orders.php ' . $action . ': ' . $e->getMessage());
    ordFail(500, 'Something went wrong while processing the order. Please try again.');
}

// ── endpoints ────────────────────────────────────────────────────────────────
function ordMeta(PDO $pdo, array $me): void {
    [$scope, $sp] = ordScope($me);
    $st = $pdo->prepare("SELECT o.status, COUNT(*) c, COALESCE(SUM(o.total_vol),0) v, COALESCE(SUM(o.total_ea),0) e FROM `" . ORD_T . "` o WHERE $scope GROUP BY o.status");
    $st->execute($sp);
    $counts = array_fill_keys(ORD_STATUSES, ['count' => 0, 'vol' => 0, 'ea' => 0]);
    foreach ($st->fetchAll() as $r) $counts[$r['status']] = ['count' => (int)$r['c'], 'vol' => (int)$r['v'], 'ea' => (int)$r['e']];

    $st = $pdo->prepare("SELECT o.status, COUNT(*) c, COALESCE(SUM(o.total_vol),0) v FROM `" . ORD_T . "` o WHERE $scope AND o.status IN ('approved','rejected') AND DATE_FORMAT(o.decided_at,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m') GROUP BY o.status");
    $st->execute($sp);
    $month = ['approved' => ['count' => 0, 'vol' => 0], 'rejected' => ['count' => 0, 'vol' => 0]];
    foreach ($st->fetchAll() as $r) $month[$r['status']] = ['count' => (int)$r['c'], 'vol' => (int)$r['v']];

    // orders waiting for THIS user's decision: the HPCL officer decides Rohan's orders, the super admin decides the orders HPCL placed
    [$awaitSql, $awP] = ordAwaitCond($me);   // the people named for each order decide it (ordAwaitCond); a super admin only waits for the orders of the states it approves
    $st = $pdo->prepare("SELECT COUNT(*) c, COALESCE(SUM(o.total_vol),0) v, COALESCE(SUM(o.total_ea),0) e FROM `" . ORD_T . "` o WHERE $scope AND o.status = 'pending' AND ($awaitSql)");
    $st->execute(array_merge($sp, $awP));
    $aw = $st->fetch();
    $awaiting = ['count' => (int)$aw['c'], 'vol' => (int)$aw['v'], 'ea' => (int)$aw['e']];

    ordOut([
        'me'        => ordMeInfo($pdo, $me) + ['username' => $me['username'], 'label' => $me['label'], 'kind' => $me['kind'], 'zone' => $me['zone'], 'zones' => $me['zones'] ?? [], 'ros' => $me['ros'], 'level' => $me['level'] ?? 'zone', 'sap_code' => $me['sap_code'] ?? '', 'sales_areas' => $me['sales_areas'] ?? [], 'hsuper' => !empty($me['hsuper']), 'ast' => $me['ast'] ?? []],
        'outlet'    => !empty($me['outlet']) ? ordOutletProfile($pdo, (string)$me['sap_code']) : null,   // an outlet login: its details for the page header
        'zones'     => ORD_ZONES,
        'zone_ros'  => array_combine(array_keys(ORD_ZONES), array_map('ordZoneRos', array_keys(ORD_ZONES))),
        'sheet_zones' => ORD_SHEET_ZONES,
        'state_ro'  => ORD_STATE_RO,
        'state_zones' => ORD_SHEET_STATES,   // the client's zone -> state listing (the super admin approval picker)
        'items'     => array_values(ordItems($pdo)),
        'products'  => array_values(ordProducts($pdo)),
        'brands'    => ORD_BRANDS,
        'foc'       => ordFocRules($pdo),
        'foc_info'  => ordFocInfo($pdo),
        'litres_per_ea' => ORD_L_PER_EA,
        'min_order'     => ordMinOrder($pdo) + ['max' => ORD_MAX_EA],
        'prices'        => ordPrices($pdo),
        'perms'         => ordPerms($pdo),
        'stock'         => ordStock($pdo, (int)($_GET['exclude'] ?? 0)),   // exclude = the order open in the edit form
        'stock_enabled' => ordStockEnabled($pdo),                          // the Inventory check box: off = no stock limits at all
        'pod'          => ['max_bytes' => ordPodMaxBytes(), 'types' => array_keys(ORD_POD_EXT)],
        'receipt'       => ['max_bytes' => ordPodMaxBytes(), 'types' => array_keys(ORD_REC_EXT), 'required' => ORD_RECEIPT_REQUIRED],
        'outlets_loaded' => ordOutletCount($pdo),
        'approvers' => $me['kind'] === 'rohan' ? ordApprovers($me['zones'], $me['ros'], ($me['sales_areas'] ?? []) ?: null) : [],
        'counts'    => $counts,
        'awaiting'  => $awaiting,
        'month'     => $month,
        'ret'       => ordRetMeta($pdo, $me),   // returns: may this user decide them, and how many wait for them
    ]);
}

/** Rohan officers - and HPCL officers when the super admin has allowed it: set the price (per EA, before GST) and GST % of each product. A blank price clears it. */
function ordSetPrices(PDO $pdo, array $me, array $body): void {
    if ($me['kind'] === 'hpcl') {
        if (!ordPerms($pdo)['hpcl_edit_rates']) ordFail(403, 'The Super Admin has not allowed HPCL officers to change the product rates.');
    } elseif ($me['kind'] !== 'rohan' && !ordAdminPlaces($me)) ordFail(403, 'Only Rohan Energy officers can set the prices.');
    $in = is_array($body['prices'] ?? null) ? $body['prices'] : [];
    $by = [];
    foreach ($in as $p) if (is_array($p) && isset($p['item'])) $by[(string)$p['item']] = $p;
    $errors = []; $save = [];
    foreach (ordItems($pdo) as $i => $name) {
        $p = $by[$name] ?? null;
        if (!$p) { $errors["rate_$i"] = 'Price is required.'; $errors["gst_$i"] = 'GST % is required.'; continue; }
        $rate = trim((string)($p['rate'] ?? '')); $gst = trim((string)($p['gst'] ?? ''));
        if ($rate === '') $errors["rate_$i"] = 'Price is required.';
        elseif (!is_numeric($rate) || (float)$rate <= 0 || (float)$rate > ORD_MAX_RATE) $errors["rate_$i"] = 'Enter a price between 0.01 and ' . number_format(ORD_MAX_RATE) . '.';
        if ($gst === '') $errors["gst_$i"] = 'GST % is required.';
        elseif (!is_numeric($gst) || (float)$gst < 0 || (float)$gst > 100) $errors["gst_$i"] = 'Enter a GST % between 0 and 100.';
        $save[$i] = [$rate, $gst];
    }
    if ($errors) { http_response_code(422); echo json_encode(['ok' => false, 'error' => 'Please correct the highlighted prices.', 'fields' => $errors]); exit; }
    $up = "INSERT INTO `" . ORD_T_SET . "` (skey, svalue, updated_by, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)";
    foreach ($save as $i => [$rate, $gst]) {
        $pdo->prepare($up)->execute(["rate_$i", number_format((float)$rate, 2, '.', ''), $me['label']]);
        $pdo->prepare($up)->execute(["gst_$i", rtrim(rtrim(number_format((float)$gst, 2, '.', ''), '0'), '.'), $me['label']]);
    }
    ordOut(['prices' => ordPrices($pdo)]);
}

/** Super admin only: set the available quantity (EA) of each product. A blank value clears it (no limit). */
function ordSetStock(PDO $pdo, array $me, array $body): void {
    if ($me['kind'] !== 'admin' || !empty($me['hsuper'])) ordFail(403, 'Only the super admin can change the available quantity.');
    $in = is_array($body['stock'] ?? null) ? $body['stock'] : [];
    $by = [];
    foreach ($in as $p) if (is_array($p) && isset($p['item'])) $by[(string)$p['item']] = $p;
    // the check box: stock on / off (the quantities stay stored while it is off)
    if (array_key_exists('enabled', $body)) {
        if (!is_bool($body['enabled'])) ordFail(422, 'Invalid setting. Please reload the page and try again.');
        $pdo->prepare("INSERT INTO `" . ORD_T_SET . "` (skey, svalue, updated_by, updated_at) VALUES ('cfg_stock_enabled', ?, ?, NOW()) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)")
            ->execute([$body['enabled'] ? '1' : '0', $me['label']]);
        if (!$body['enabled']) ordOut(['stock' => ordStock($pdo), 'stock_enabled' => false]);
    }
    $errors = []; $save = [];
    foreach (ordItems($pdo) as $i => $name) {
        if (!isset($by[$name])) continue;
        $v = trim((string)($by[$name]['ea'] ?? ''));
        if ($v !== '' && (!ctype_digit($v) || (int)$v > ORD_STOCK_MAX)) { $errors["stock_$i"] = 'Enter a whole number between 0 and ' . number_format(ORD_STOCK_MAX) . ', or leave blank for no limit.'; continue; }
        $save[$i] = $v;
    }
    if ($errors) { http_response_code(422); echo json_encode(['ok' => false, 'error' => 'Please correct the highlighted quantities.', 'fields' => $errors]); exit; }
    // the boxes show what is still available; a value left as shown is not a change (it must not restart the count of orders already deducted)
    foreach (ordStock($pdo) as $cur) {
        if (isset($save[$cur['pid']]) && $save[$cur['pid']] === ($cur['ea'] === null ? '' : (string)$cur['ea'])) unset($save[$cur['pid']]);
    }
    $up = "INSERT INTO `" . ORD_T_SET . "` (skey, svalue, updated_by, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)";
    foreach ($save as $i => $v) {
        if ($v === '') $pdo->prepare("DELETE FROM `" . ORD_T_SET . "` WHERE skey = ?")->execute(["stock_$i"]);
        else $pdo->prepare($up)->execute(["stock_$i", (string)(int)$v, $me['label']]);
    }
    ordOut(['stock' => ordStock($pdo), 'stock_enabled' => ordStockEnabled($pdo)]);
}

/** Super admin only: add a product that orders can be placed for. Its price / GST % must still be set by a Rohan officer before an order with it can be submitted. */
function ordAddProduct(PDO $pdo, array $me, array $body): void {
    if ($me['kind'] !== 'admin' || !empty($me['hsuper'])) ordFail(403, 'Only the super admin can add products.');
    $name = ordStr($body['name'] ?? '', 80);
    $brand = (string)($body['brand'] ?? '');
    $items = ordItems($pdo);
    $err = null;
    if ($name === '') $err = 'Enter the SKU name.';
    elseif (!isset(ORD_BRANDS[$brand])) $err = 'Choose the brand of this SKU.';
    elseif (count($items) >= ORD_MAX_PRODUCTS) $err = 'You can have at most ' . ORD_MAX_PRODUCTS . ' SKUs.';
    else foreach ($items as $n) if (mb_strtolower($n) === mb_strtolower($name)) $err = 'This SKU already exists.';
    if ($err) { http_response_code(422); echo json_encode(['ok' => false, 'error' => $err, 'fields' => ['name' => $err]]); exit; }
    $pid = $items ? max(array_keys($items)) + 1 : 0;
    $pdo->prepare("INSERT INTO `" . ORD_T_PROD . "` (pid, name, brand, created_by, created_at) VALUES (?, ?, ?, ?, NOW())")->execute([$pid, $name, $brand, $me['label']]);
    ordOut(['items' => array_values(ordItems($pdo)), 'products' => array_values(ordProducts($pdo)), 'stock' => ordStock($pdo), 'prices' => ordPrices($pdo), 'foc' => ordFocRules($pdo)]);
}

/** Super admin only: remove a product, with its price, GST % and available quantity. Orders that already contain it are not changed. */
function ordDeleteProduct(PDO $pdo, array $me, array $body): void {
    if ($me['kind'] !== 'admin' || !empty($me['hsuper'])) ordFail(403, 'Only the super admin can delete products.');
    $pid = $body['pid'] ?? null;
    $items = ordItems($pdo);
    if (!is_numeric($pid) || !isset($items[(int)$pid])) ordFail(404, 'This product no longer exists.');
    if (count($items) <= 1) ordFail(422, 'At least one product must remain.');
    $pid = (int)$pid;
    $pdo->prepare("DELETE FROM `" . ORD_T_PROD . "` WHERE pid = ?")->execute([$pid]);
    $pdo->prepare("DELETE FROM `" . ORD_T_SET . "` WHERE skey IN (?, ?, ?)")->execute(["rate_$pid", "gst_$pid", "stock_$pid"]);
    $pdo->prepare("DELETE FROM `" . ORD_T_SET . "` WHERE skey IN (?, ?)")->execute(["foc_mrp_$pid", "foc_mt_$pid"]);
    $pdo->prepare("DELETE FROM `" . ORD_T_FOC . "` WHERE pid = ?")->execute([$pid]);
    ordOut(['items' => array_values(ordItems($pdo)), 'products' => array_values(ordProducts($pdo)), 'stock' => ordStock($pdo), 'prices' => ordPrices($pdo), 'foc' => ordFocRules($pdo)]);
}

/** Super admin only: save the FOC list of one SKU (the FOC page): the MRP / Non-MRP and MRP of the scheme, the SKU's rate and GST % (shared with Set prices) plus every row "Purchase Qty -> Free Qty". The rows sent
 *  replace the SKU's old rows (the Excel upload fills the same list). Orders already placed keep the FOC fixed on their lines. */
function ordSaveFocList(PDO $pdo, array $me, array $body): void {
    if ($me['kind'] !== 'admin' || !empty($me['hsuper'])) ordFail(403, 'Only the super admin can change the FOC list.');
    $items = ordItems($pdo);
    $pid = $body['pid'] ?? null;
    $errors = [];
    if (!is_numeric($pid) || !isset($items[(int)$pid])) ordFail(404, 'This SKU no longer exists.');
    $pid = (int)$pid;
    $mt = ($body['mrp_type'] ?? 'MRP') === 'Non-MRP' ? 'Non-MRP' : 'MRP';
    // the MRP: a reference column of the chart only
    $mrp = trim((string)($body['mrp'] ?? ''));
    if ($mrp !== '' && (!is_numeric($mrp) || (float)$mrp <= 0 || (float)$mrp > ORD_MAX_RATE)) $errors['mrp'] = 'Enter an MRP between 0.01 and ' . number_format(ORD_MAX_RATE) . ' (or leave it empty).';
    // the DLP (incl. GST) IS the price orders use: rate (per EA, before GST) = DLP / (1 + GST %), the very same price as "₹ Set prices & GST %"; left empty = the price stays as it is
    $dlp = trim((string)($body['dlp'] ?? '')); $gst = trim((string)($body['gst'] ?? ''));
    if ($dlp !== '' || $gst !== '') {
        if ($dlp === '' || !is_numeric($dlp) || (float)$dlp <= 0 || (float)$dlp > ORD_MAX_RATE) $errors['dlp'] = 'Enter a DLP between 0.01 and ' . number_format(ORD_MAX_RATE) . '.';
        if ($gst === '' || !is_numeric($gst) || (float)$gst < 0 || (float)$gst > 100) $errors['gst'] = 'Enter a GST % between 0 and 100.';
    }
    $rows = $body['rows'] ?? [];
    if (!is_array($rows)) $rows = [];
    if (count($rows) > ORD_MAX_FOC_RULES) $errors['rows'] = 'A FOC list can have at most ' . ORD_MAX_FOC_RULES . ' rows.';
    $clean = []; $seen = [];
    foreach ($rows as $i => $r) {
        $p = $r['purchase'] ?? null; $f = $r['free'] ?? null;
        if (!is_numeric($p) || (int)$p != $p || (int)$p < 1 || (int)$p > ORD_MAX_EA) { $errors["purchase_$i"] = 'Whole number, 1 or more.'; continue; }
        if (!is_numeric($f) || (int)$f != $f || (int)$f < 0 || (int)$f > ORD_MAX_EA) { $errors["free_$i"] = 'Whole number, 0 or more.'; continue; }
        if (isset($seen[(int)$p])) { $errors["purchase_$i"] = 'This Purchase Qty is already in the list.'; continue; }
        $seen[(int)$p] = true;
        $clean[] = [(int)$p, (int)$f];
    }
    if ($errors) { http_response_code(422); echo json_encode(['ok' => false, 'error' => 'Please fix the highlighted cells.', 'fields' => $errors]); exit; }
    // what the list looked like before (for the change log)
    $oldInfo = ordFocInfo($pdo)[$pid] ?? ['mrp' => null, 'mrp_type' => 'MRP', 'dlp' => null];
    $oldGst = null; foreach (ordPrices($pdo) as $pp) if ((int)$pp['pid'] === $pid) $oldGst = $pp['gst_set'] ? $pp['gst'] : null;
    $oldRows = []; foreach (ordFocRules($pdo) as $rr) if ($rr['pid'] === $pid) $oldRows[$rr['min_qty']] = $rr['foc_qty'];
    $pdo->beginTransaction();
    $pdo->prepare("DELETE FROM `" . ORD_T_FOC . "` WHERE pid = ?")->execute([$pid]);
    $ins = $pdo->prepare("INSERT INTO `" . ORD_T_FOC . "` (pid, min_qty, foc_qty, created_by, created_at) VALUES (?, ?, ?, ?, NOW())");
    foreach ($clean as [$p, $f]) $ins->execute([$pid, $p, $f, $me['label']]);
    $up = "INSERT INTO `" . ORD_T_SET . "` (skey, svalue, updated_by, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)";
    $pdo->prepare($up)->execute(["foc_mrp_$pid", $mrp === '' ? '' : number_format((float)$mrp, 2, '.', ''), $me['label']]);
    $pdo->prepare($up)->execute(["foc_mt_$pid", $mt, $me['label']]);
    if ($dlp !== '') {   // orders read the price from these two keys (the rate is fixed on an order line when it is approved)
        $pdo->prepare($up)->execute(["rate_$pid", number_format((float)$dlp / (1 + (float)$gst / 100), 2, '.', ''), $me['label']]);
        $pdo->prepare($up)->execute(["gst_$pid", rtrim(rtrim(number_format((float)$gst, 2, '.', ''), '0'), '.'), $me['label']]);
    }
    $pdo->commit();
    $num = fn($v) => $v === null ? null : rtrim(rtrim(number_format((float)$v, 2, '.', ''), '0'), '.');
    $chg = [];
    if ($oldInfo['mrp_type'] !== $mt) $chg[] = ['MRP / Non-MRP', $oldInfo['mrp_type'], $mt];
    $newMrp = $mrp === '' ? null : (float)$mrp;
    if (($oldInfo['mrp'] === null) !== ($newMrp === null) || ($newMrp !== null && abs((float)$oldInfo['mrp'] - $newMrp) > 0.004)) $chg[] = ['MRP (Rs/EA)', $num($oldInfo['mrp']), $num($newMrp)];
    if ($dlp !== '') {
        if ($oldInfo['dlp'] === null || abs((float)$oldInfo['dlp'] - (float)$dlp) > 0.004) $chg[] = ['DLP incl. GST (Rs/EA) - the order price', $num($oldInfo['dlp']), $num((float)$dlp)];
        if ($oldGst === null || abs((float)$oldGst - (float)$gst) > 0.004) $chg[] = ['GST %', $num($oldGst), $num((float)$gst)];
    }
    $newRows = []; foreach ($clean as [$p, $f]) $newRows[$p] = $f;
    ksort($newRows); ksort($oldRows);
    foreach ($newRows as $p => $f) {
        if (!isset($oldRows[$p])) $chg[] = ["Row added: buy $p EA", null, "$f EA free"];
        elseif ($oldRows[$p] !== $f) $chg[] = ["Buy $p EA", $oldRows[$p] . ' EA free', $f . ' EA free'];
    }
    foreach ($oldRows as $p => $f) if (!isset($newRows[$p])) $chg[] = ["Row removed: buy $p EA", "$f EA free", null];
    if ($chg) chgAdd($pdo, 'foc', 'edited', $items[$pid], 'FOC list updated', $chg);
    ordOut(['foc' => ordFocRules($pdo), 'foc_info' => ordFocInfo($pdo), 'prices' => ordPrices($pdo)]);
}

/** Super admin only: set the minimum total quantity (EA) of an order. 0 removes the minimum. */
function ordSetMinOrder(PDO $pdo, array $me, array $body): void {
    if ($me['kind'] !== 'admin' || !empty($me['hsuper'])) ordFail(403, 'Only the super admin can change the minimum order quantity.');
    $v = $body['min_ea'] ?? null;
    if (is_string($v)) $v = trim($v);
    if ($v === '' || $v === null) $v = 0;
    if (!is_numeric($v) || (int)$v != $v || (int)$v < 0 || (int)$v > ORD_MAX_EA) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Enter a whole number between 0 and ' . number_format(ORD_MAX_EA) . ' (0 means no minimum).', 'fields' => ['min_ea' => 'Enter a whole number between 0 and ' . number_format(ORD_MAX_EA) . '.']]);
        exit;
    }
    $pdo->prepare("INSERT INTO `" . ORD_T_SET . "` (skey, svalue, updated_by, updated_at) VALUES ('min_order_ea', ?, ?, NOW())
                   ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)")
        ->execute([(string)(int)$v, $me['label']]);
    ordOut(['min_order' => ordMinOrder($pdo) + ['max' => ORD_MAX_EA]]);
}

/** Super admin only: save the permission switches (all of ORD_PERMS are sent together, each true / false). */
function ordSetPerms(PDO $pdo, array $me, array $body): void {
    if ($me['kind'] !== 'admin' || !empty($me['hsuper'])) ordFail(403, 'Only the super admin can change the permissions.');
    $in = is_array($body['perms'] ?? null) ? $body['perms'] : [];
    $new = [];
    foreach (ORD_PERMS as $k => $_) {
        if (!array_key_exists($k, $in) || !is_bool($in[$k])) ordFail(422, 'Invalid permission settings. Please reload the page and try again.');
        $new[$k] = $in[$k];
    }
    $up = "INSERT INTO `" . ORD_T_SET . "` (skey, svalue, updated_by, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)";
    foreach ($new as $k => $v) $pdo->prepare($up)->execute(['perm_' . $k, $v ? '1' : '0', $me['label']]);
    ordOut(['perms' => ordPerms($pdo)]);
}

// ── delivery tracking: approved -> Sales Order Generated -> Transit -> Proof of Delivery (Rohan upload) -> Delivery Confirmed ──
/** Right after approval the next two steps happen on their own. */
function ordAutoSteps(PDO $pdo, int $id): void {
    $sys = ['username' => 'system', 'label' => 'System', 'kind' => 'admin'];
    ordLogEvent($pdo, $id, 'so_generated', 'approved', 'approved', $sys);
    ordLogEvent($pdo, $id, 'transit',      'approved', 'approved', $sys);
    ordFinalizeSO($pdo, $id, true);
}
/** Sales Order details fixed on an approved order: the unique voucher no. (RCSO2/26-27/1) and, per line, the rate and GST % in force
 *  (a line approved before any price was set takes the first price that is set afterwards). Safe to call repeatedly. */
function ordFinalizeSO(PDO $pdo, int $id, bool $fixFoc = false): void {
    $st = $pdo->prepare("SELECT voucher_no, invoice_no, order_date, doc_type, invoice_mode, inv_flag FROM `" . ORD_T . "` WHERE id = ?");
    $st->execute([$id]);
    $o = $st->fetch();
    if (!$o) return;
    if (!$o['voucher_no']) ordGiveNumber($pdo, $id, 'voucher_no', ORD_VOUCHER_PREFIX, $o['order_date']);
    if (($o['doc_type'] === 'invoice' || (int)$o['inv_flag'] === 1) && !$o['invoice_no'] && $o['invoice_mode'] !== 'manual') ordGiveNumber($pdo, $id, 'invoice_no', ORD_INV_PREFIX, $o['order_date']);   // the Tax Invoice (every order that has one)
    $prices = [];
    foreach (ordPrices($pdo) as $p) $prices[$p['item']] = $p;
    $its = $pdo->prepare("SELECT id, item FROM `" . ORD_T_ITEMS . "` WHERE order_id = ? AND rate IS NULL");
    $its->execute([$id]);
    foreach ($its->fetchAll() as $it) {
        $p = $prices[$it['item']] ?? null;
        if ($p && $p['rate'] > 0) $pdo->prepare("UPDATE `" . ORD_T_ITEMS . "` SET rate = ?, gst = ? WHERE id = ?")->execute([$p['rate'], $p['gst'], $it['id']]);
    }
    // (the FOC of a line is fixed when the order is saved - paid + foc = ea - so approval no longer decides it; $fixFoc is kept for the callers)
}
/** Next unique number "<prefix>/<financial year>/<n>" for the voucher_no (Sales Order) or invoice_no (Tax Invoice) column of an order that has none yet. */
function ordGiveNumber(PDO $pdo, int $id, string $col, string $prefix, string $orderDate): void {
    if (!in_array($col, ['voucher_no', 'invoice_no'], true)) return;
    $y = (int)substr($orderDate, 0, 4); $m = (int)substr($orderDate, 5, 2);
    $a = $m >= 4 ? $y : $y - 1;
    $pre = $prefix . '/' . sprintf('%02d-%02d', $a % 100, ($a + 1) % 100) . '/';
    for ($try = 0; $try < 5; $try++) {
        $q = $pdo->prepare("SELECT COALESCE(MAX(CAST(SUBSTRING(`$col`, ?) AS UNSIGNED)), 0) FROM `" . ORD_T . "` WHERE `$col` LIKE ?");
        $q->execute([strlen($pre) + 1, $pre . '%']);
        $next = (int)$q->fetchColumn() + 1;
        try {
            $pdo->prepare("UPDATE `" . ORD_T . "` SET `$col` = ? WHERE id = ? AND `$col` IS NULL")->execute([$pre . $next, $id]);
            return;
        } catch (PDOException $e) {
            if ($e->getCode() !== '23000') throw $e;   // somebody else took that number a moment ago: try the next one
        }
    }
}
/** Orders approved before delivery tracking existed get the two automatic steps (dated at the approval) the first time they are opened. */
function ordHealStages(PDO $pdo, int $id): void {
    $has = $pdo->prepare("SELECT COUNT(*) FROM `" . ORD_T_EVENT . "` WHERE order_id = ? AND action = 'so_generated'");
    $has->execute([$id]);
    if ((int)$has->fetchColumn() > 0) return;
    $own = !$pdo->inTransaction();   // also called from inside the upload transaction
    if ($own) $pdo->beginTransaction();
    foreach (['so_generated', 'transit'] as $a) {
        $pdo->prepare("INSERT INTO `" . ORD_T_EVENT . "` (order_id, action, from_status, to_status, username, user_label, org, `comment`, created_at)
                       SELECT ?, ?, 'approved', 'approved', 'system', 'System', NULL, NULL, COALESCE(decided_at, NOW()) FROM `" . ORD_T . "` WHERE id = ?")
            ->execute([$id, $a, $id]);
    }
    $pdo->prepare("UPDATE `" . ORD_T . "` SET delivery_stage = 'transit' WHERE id = ? AND delivery_stage = ''")->execute([$id]);
    if ($own) $pdo->commit();
}
function ordIniBytes(string $v): int {
    $v = trim($v); if ($v === '') return PHP_INT_MAX;
    $n = (float)$v; $u = strtolower(substr($v, -1));
    if ($u === 'g') $n *= 1073741824; elseif ($u === 'm') $n *= 1048576; elseif ($u === 'k') $n *= 1024;
    return $n > 0 ? (int)$n : PHP_INT_MAX;
}
/** The largest proof-of-delivery file we accept: our own limit, capped by what this server's PHP allows. */
function ordPodMaxBytes(): int {
    $post = ordIniBytes((string)ini_get('post_max_size'));
    return min(ORD_POD_MAX, ordIniBytes((string)ini_get('upload_max_filesize')), $post === PHP_INT_MAX ? PHP_INT_MAX : $post - 65536);
}
/** The uploaded file of an order: kind 'pod' (Proof of Delivery) or 'payment' (payment receipt), or null. */
function ordFileInfo(PDO $pdo, int $id, string $kind): ?array {
    $st = $pdo->prepare("SELECT orig_name AS name, size, mime, uploaded_by_name, created_at FROM `" . ORD_T_FILE . "` WHERE order_id = ? AND kind = ?");
    $st->execute([$id, $kind]);
    $r = $st->fetch();
    if (!$r) return null;
    $r['size'] = (int)$r['size'];
    return $r;
}
/** Does the content look like what the extension claims? (Stops e.g. an .exe renamed to .pdf.) */
function ordPodContentOk(string $path, string $ext): bool {
    $f = fopen($path, 'rb'); if (!$f) return false;
    $head = fread($f, 4096); fclose($f);
    switch ($ext) {
        case 'pdf':               return strncmp($head, '%PDF', 4) === 0;
        case 'xlsx': case 'docx': return strncmp($head, "PK\x03\x04", 4) === 0;
        case 'xls': case 'doc':   return strncmp($head, "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1", 8) === 0;
        case 'csv':               return $head !== '' && strpos($head, "\0") === false;
        case 'jpg': case 'jpeg':  return strncmp($head, "\xFF\xD8\xFF", 3) === 0;
        case 'png':               return strncmp($head, "\x89PNG\r\n\x1A\n", 8) === 0;
    }
    return false;
}
function ordPodDir(): string {
    if (!is_dir(ORD_POD_DIR) && !@mkdir(ORD_POD_DIR, 0755, true) && !is_dir(ORD_POD_DIR)) ordFail(500, 'Could not create the folder for the uploaded files. Please contact the administrator.');
    // never served directly: files are only handed out by orders.php after the permission check
    if (!is_file(ORD_POD_DIR . '/.htaccess')) @file_put_contents(ORD_POD_DIR . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
    if (!is_file(ORD_POD_DIR . '/index.html')) @file_put_contents(ORD_POD_DIR . '/index.html', '');
    return ORD_POD_DIR;
}
function ordPodLimitMsg(): string {
    return 'The file is too large. The limit is ' . round(ordPodMaxBytes() / 1048576, 1) . ' MB.';
}
/** Upload of the documents of an approved order:
 *   'payment' - payment receipt, by a Rohan Energy officer or an HPCL officer (if the super admin allows it) who can see the order (can be replaced until delivery is confirmed)
 *   'pod'     - Proof of Delivery, by the Rohan Energy officer -> the order becomes Delivery Confirmed (needs the payment receipt first)
 *   'invoice' - Tax Invoice, only when it is not auto-generated (can be replaced), for orders placed by HPCL and by Rohan Energy alike: by the super admin,
 *               or by a Rohan Energy officer who can see the order (the officer who placed it; for an HPCL order, the Rohan officers of its zone / regions) */
function ordUploadFile(PDO $pdo, array $me, array $body, string $kind): void {
    $isPod = $kind === 'pod';
    $isInv = $kind === 'invoice';
    $label = $isPod ? 'Proof of Delivery' : ($isInv ? 'Tax Invoice' : 'payment receipt');
    $types = $isPod ? ORD_POD_EXT : ORD_REC_EXT;
    if ($isPod && $me['kind'] !== 'rohan' && $me['kind'] !== 'admin') ordFail(403, 'Only the Super Admin or a Rohan Energy officer (Zone / Regional Officer) can upload the Proof of Delivery.');
    if ($isInv && $me['kind'] !== 'admin' && $me['kind'] !== 'rohan') ordFail(403, 'Only the Super Admin or a Rohan Energy officer can upload the Tax Invoice.');
    if ($kind === 'payment') {
        if ($me['kind'] !== 'rohan' && $me['kind'] !== 'hpcl' && $me['kind'] !== 'admin') ordFail(403, 'Only the Super Admin, Rohan Energy and HPCL officers can upload the payment receipt.');
        if ($me['kind'] === 'hpcl' && !ordPerms($pdo)['hpcl_receipt']) ordFail(403, 'The Super Admin has not allowed HPCL officers to upload the payment receipt.');
    }
    $id = (int)($body['id'] ?? 0);
    $f  = $_FILES['file'] ?? null;
    if (!$f && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0 && !$_POST) ordFail(413, ordPodLimitMsg());   // body larger than post_max_size: PHP drops everything
    if (!$f || !is_array($f) || is_array($f['name'])) ordFail(422, "Choose the $label file to upload.");
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) ordFail(413, ordPodLimitMsg());
    if ($f['error'] === UPLOAD_ERR_NO_FILE) ordFail(422, "Choose the $label file to upload.");
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) ordFail(500, 'The upload did not complete. Please try again.');
    $size = (int)$f['size'];
    if ($size < 1) ordFail(422, 'The file is empty.');
    if ($size > ordPodMaxBytes()) ordFail(413, ordPodLimitMsg());
    $orig = ordStr(basename(str_replace('\\', '/', (string)$f['name'])), 200);
    $ext  = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    if (!isset($types[$ext])) ordFail(422, $isPod ? 'Only PDF, Excel (xls, xlsx), Word (doc, docx) or CSV files can be uploaded.'
                                                  : 'Only PDF, Excel (xls, xlsx), Word (doc, docx), CSV or image (jpg, jpeg, png) files can be uploaded.');
    if (!ordPodContentOk($f['tmp_name'], $ext)) ordFail(422, 'This file does not look like a real .' . $ext . ' file.');

    $dir = ordPodDir();
    $pdo->beginTransaction();
    $st = $pdo->prepare("SELECT * FROM `" . ORD_T . "` WHERE id = ? FOR UPDATE");
    $st->execute([$id]);
    $cur = $st->fetch();
    if ($isInv) {   // any order that has a Tax Invoice not generated by the portal: the super admin, or a Rohan officer who can see the order
                    // (an order placed by HPCL: the Rohan officers of its zone / regions; an order placed by Rohan: the officer who placed it). Never an HPCL officer.
        $hasInv = $cur && ($cur['doc_type'] === 'invoice' || (int)$cur['inv_flag'] === 1);
        $mine = $hasInv && ($me['kind'] === 'admin'
            || ($cur['doc_type'] === 'invoice' ? ordCoversOrder($me, $cur['ro'], (string)$cur['sales_area']) : ordOwns($me, $cur['created_by'])));
    } elseif ($me['kind'] === 'admin') {   // the Super Admin sees every order
        $mine = (bool)$cur;
    } elseif ($isPod || $me['kind'] === 'rohan') {
        // the creating officer (a Zone Officer: also their Regional Officers' orders), or - for an order HPCL placed - any Rohan officer of that zone / region
        $mine = $cur && (ordOwns($me, $cur['created_by']) || ($cur['doc_type'] === 'invoice' && ordCoversOrder($me, $cur['ro'], (string)$cur['sales_area'])));
    } else {   // an HPCL officer of the order's zone / regions
        $mine = $cur && $cur['created_by'] !== ORD_HIST_USER && ordCoversOrder($me, $cur['ro'], (string)$cur['sales_area'])
            && (empty($me['sap_code']) || (string)$cur['ro_code'] === (string)$me['sap_code']);   // an outlet login: its own outlet's orders only
    }
    if (!$mine || ($me['kind'] !== 'admin' && (!$isInv || $me['kind'] === 'rohan') && !ordInZones($me, $cur['zone']))) { $pdo->rollBack(); ordFail(404, 'Order not found.'); }
    if ($cur['status'] !== 'approved') { $pdo->rollBack(); ordFail(409, "The $label can only be uploaded after the order is approved."); }
    if ($isInv && $cur['invoice_mode'] !== 'manual') { $pdo->rollBack(); ordFail(409, 'The Tax Invoice of this order was generated by the portal, so it cannot be uploaded.'); }
    if (!$isInv && $cur['delivery_stage'] === 'delivered') { $pdo->rollBack(); ordFail(409, $isPod ? 'The Proof of Delivery has already been uploaded for this order.' : 'Delivery has already been confirmed, so the payment receipt can no longer be changed.'); }
    $old = null;
    $q = $pdo->prepare("SELECT stored_name FROM `" . ORD_T_FILE . "` WHERE order_id = ? AND kind = 'payment'");
    $q->execute([$id]);
    $have = $q->fetchColumn();
    if ($isPod && ORD_RECEIPT_REQUIRED && $have === false) { $pdo->rollBack(); ordFail(409, 'Upload the payment receipt first - the Proof of Delivery comes after it.'); }
    if ($isInv) {   // a new invoice replaces the earlier one
        $q = $pdo->prepare("SELECT stored_name FROM `" . ORD_T_FILE . "` WHERE order_id = ? AND kind = 'invoice'");
        $q->execute([$id]);
        $have = $q->fetchColumn();
        // a completed (delivered) order keeps its Tax Invoice as it is: the first invoice can still be added if there is none, but an uploaded one is no longer replaced
        if ($have !== false && $cur['delivery_stage'] === 'delivered') { $pdo->rollBack(); ordFail(409, 'This order is completed (delivery confirmed), so its Tax Invoice can no longer be changed.'); }
    }
    if (!$isPod && $have !== false) $old = (string)$have;   // a new receipt / invoice replaces the earlier one
    $stored = bin2hex(random_bytes(16)) . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $stored)) { $pdo->rollBack(); ordFail(500, 'Could not save the file on the server. Please contact the administrator.'); }
    try {
        if ($old !== null) $pdo->prepare("DELETE FROM `" . ORD_T_FILE . "` WHERE order_id = ? AND kind = ?")->execute([$id, $kind]);
        $pdo->prepare("INSERT INTO `" . ORD_T_FILE . "` (order_id, kind, orig_name, stored_name, mime, size, uploaded_by, uploaded_by_name, created_at) VALUES (?,?,?,?,?,?,?,?,NOW())")
            ->execute([$id, $kind, $orig, $stored, $types[$ext], $size, $me['username'], $me['label']]);
        if ($isPod) $pdo->prepare("UPDATE `" . ORD_T . "` SET delivery_stage='delivered', updated_at=NOW() WHERE id=?")->execute([$id]);
        else        $pdo->prepare("UPDATE `" . ORD_T . "` SET updated_at=NOW() WHERE id=?")->execute([$id]);
        ordHealStages($pdo, $id);
        ordLogEvent($pdo, $id, $isPod ? 'pod_uploaded' : ($isInv ? 'invoice_uploaded' : 'receipt_uploaded'), 'approved', 'approved', $me, $orig);
        if ($isPod) ordLogEvent($pdo, $id, 'delivered', 'approved', 'approved', ['username' => 'system', 'label' => 'System', 'kind' => 'admin']);
        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        @unlink($dir . '/' . $stored);
        throw $e;
    }
    if ($old !== null) @unlink($dir . '/' . basename($old));
    $o = ordLoad($pdo, $me, $id);
    $o['pod'] = ordFileInfo($pdo, $id, 'pod');
    $o['receipt'] = ordFileInfo($pdo, $id, 'payment');
    $o['invoice_file'] = ordFileInfo($pdo, $id, 'invoice');
    ordOut(['order' => $o]);
}
/** Rohan officers: correct the content of the auto-generated Tax Invoice of an approved order placed by HPCL.
 *  Not recorded in the status history. The whole set of corrections is sent each time (only the fields that differ from the generated invoice); an empty set puts the invoice back as generated.
 *  Texts and dates go to ORD_INV_FIELDS, per line 'items' => [item name => ['rate' => , 'gst' => ]]. Quantity, invoice number and the order itself are never changed. */
function ordEditInvoice(PDO $pdo, array $me, array $body): void {
    if ($me['kind'] !== 'rohan' && $me['kind'] !== 'admin') ordFail(403, 'Only the Super Admin or a Rohan Energy officer can edit the Tax Invoice.');
    $id = (int)($body['id'] ?? 0);
    $o = $id ? ordLoad($pdo, $me, $id) : null;   // only the orders this user may see (the Super Admin: all; an officer: their zone / regions)
    if (!$o || !$o['tax_inv']) ordFail(404, 'Order not found.');
    if ($o['status'] !== 'approved') ordFail(409, 'The Tax Invoice exists only after the order is approved.');
    if ($o['delivery_stage'] === 'delivered') ordFail(409, 'This order is completed (delivery confirmed), so its Tax Invoice can no longer be edited.');
    if ($o['invoice_mode'] !== 'auto') ordFail(409, 'The Tax Invoice of this order was uploaded by the Super Admin, so it cannot be edited here.');
    $in = is_array($body['edits'] ?? null) ? $body['edits'] : [];
    $new = []; $err = [];
    foreach ($in as $k => $v) {
        if ($k === 'items') continue;
        if (!isset(ORD_INV_FIELDS[$k])) { $err[$k] = 'Unknown field.'; continue; }
        if (!is_string($v) && !is_numeric($v)) { $err[$k] = 'Enter text.'; continue; }
        $rule = ORD_INV_FIELDS[$k];
        if ($rule === 'date') {
            $v = trim((string)$v);
            if ($v !== '' && !(preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1]))) { $err[$k] = 'Enter a valid date.'; continue; }
        } elseif ($rule === 'gstin') {
            $v = strtoupper(ordStr($v, 20));
            if ($v !== '' && !preg_match('/^[0-9A-Z]{15}$/', $v)) { $err[$k] = 'A GSTIN has 15 letters / digits.'; continue; }
        } else {
            $v = ordStr($v, $rule);
        }
        $new[$k] = $v;
    }
    $names = array_column($o['items'], 'item');
    $its = is_array($in['items'] ?? null) ? $in['items'] : [];
    foreach ($its as $name => $l) {
        if (!in_array((string)$name, $names, true) || !is_array($l)) { $err['items'] = 'Unknown item "' . $name . '".'; continue; }
        $row = [];
        if (isset($l['rate'])) {
            if (!is_numeric($l['rate']) || (float)$l['rate'] <= 0 || (float)$l['rate'] > ORD_MAX_RATE) $err["rate:$name"] = 'Enter a rate between 0.01 and ' . number_format(ORD_MAX_RATE) . '.';
            else $row['rate'] = round((float)$l['rate'], 2);
        }
        if (isset($l['gst'])) {
            if (!is_numeric($l['gst']) || (float)$l['gst'] < 0 || (float)$l['gst'] > 100) $err["gst:$name"] = 'Enter a GST % between 0 and 100.';
            else $row['gst'] = round((float)$l['gst'], 2);
        }
        if ($row) $new['items'][(string)$name] = $row;
    }
    if ($err) { http_response_code(422); echo json_encode(['ok' => false, 'error' => 'Please correct the highlighted fields.', 'fields' => $err]); exit; }

    if (($o['invoice_edits'] ?? []) == $new) ordOut(['order' => $o]);   // nothing changed (12 and 12.0 count as equal)
    // the corrections are kept on the order only; they are deliberately not written to the status history
    $pdo->prepare("UPDATE `" . ORD_T . "` SET invoice_edits = ?, updated_at = NOW() WHERE id = ? AND status = 'approved'")
        ->execute([$new ? json_encode($new, JSON_UNESCAPED_UNICODE) : null, $id]);
    ordOut(['order' => ordLoad($pdo, $me, $id)]);
}
/** Whoever can see the order may download its Proof of Delivery / payment receipt / uploaded Tax Invoice (Rohan officer, HPCL officer of the zone, super admin). */
function ordFileDownload(PDO $pdo, array $me, string $kind): void {
    $id = (int)($_GET['id'] ?? 0);
    $o = $id ? ordLoad($pdo, $me, $id) : null;
    if (!$o) ordFail(404, 'Order not found.');
    if ($kind === 'invoice' && !empty($o['inv_hidden'])) ordFail(403, 'The Super Admin has not allowed HPCL users to see the Tax Invoice.');
    $st = $pdo->prepare("SELECT orig_name, stored_name, mime, size FROM `" . ORD_T_FILE . "` WHERE order_id = ? AND kind = ?");
    $st->execute([$id, $kind]);
    $f = $st->fetch();
    $path = $f ? ORD_POD_DIR . '/' . basename($f['stored_name']) : '';
    if (!$f || !is_file($path)) ordFail(404, $kind === 'pod' ? 'No Proof of Delivery has been uploaded for this order.' : ($kind === 'invoice' ? 'No Tax Invoice has been uploaded for this order.' : 'No payment receipt has been uploaded for this order.'));
    $inline = ($_GET['inline'] ?? '') === '1' && in_array($f['mime'], ['application/pdf', 'image/jpeg', 'image/png'], true);
    $name = preg_replace('/[^A-Za-z0-9._ -]+/', '_', $f['orig_name']);
    header_remove('Content-Type');
    header('Content-Type: ' . $f['mime']);
    header('Content-Length: ' . (int)$f['size']);
    header('X-Content-Type-Options: nosniff');
    header('Content-Security-Policy: sandbox');
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $name . '"');
    header('Cache-Control: private, no-store');
    readfile($path);
    exit;
}

/** SAP code -> outlet details for the New Order form. Another zone's outlet is reported by zone name only. */
function ordOutletLookup(PDO $pdo, array $me): void {
    if ($me['kind'] === 'admin') {   // the super admin edits inside the zone of the order being edited; for a new order any zone is allowed
        $z = (string)($_GET['zone'] ?? '');
        if ($z === '') { $me['zones'] = array_keys(ORD_ZONES); $me['zone'] = $me['zones'][0]; $me['ros'] = []; }
        else {
            if (!isset(ORD_ZONES[$z])) ordFail(400, 'Unknown zone.');
            $me['zone'] = $z; $me['zones'] = [$z]; $me['ros'] = [];
        }
    } elseif ($me['kind'] !== 'rohan' && $me['kind'] !== 'hpcl') ordFail(403, 'Only Rohan Energy and HPCL officers can look up outlets.');
    $code = trim((string)($_GET['code'] ?? ''));
    if (!preg_match('/^\d{6,12}$/', $code)) ordFail(400, 'Enter a valid SAP code (digits only).');
    if (ordOutletCount($pdo) === 0) ordOut(['found' => false, 'loaded' => false]);
    $o = ordOutlet($pdo, $code);
    if (!$o) ordOut(['found' => false, 'loaded' => true]);
    if ($me['kind'] === 'admin' && !empty($me['ast']) && !in_array((string)$o['state'], $me['ast'], true)) ordOut(['found' => true, 'allowed' => false, 'state_limit' => true, 'state' => (string)$o['state'], 'zone' => $o['zone']]);   // a super admin made for some states only uses the SAP numbers of those states
    if (!ordInZones($me, $o['zone'])) ordOut(['found' => true, 'allowed' => false, 'zone' => $o['zone'], 'sheet_zone' => ordSheetZoneOfRo((string)$o['ro'], (string)$o['zone'])]);
    if (!ordCoversRo($me, $o['ro'])) ordOut(['found' => true, 'allowed' => false, 'zone' => $o['zone'], 'ro' => $o['ro'], 'sheet_zone' => ordSheetZoneOfRo((string)$o['ro'], (string)$o['zone'])]);
    if (!ordCoversSa($me, (string)$o['sales_area'])) ordOut(['found' => true, 'allowed' => false, 'zone' => $o['zone'], 'ro' => $o['ro'], 'sales_area' => (string)$o['sales_area']]);
    if (!empty($me['sap_code']) && (string)$o['sap_code'] !== (string)$me['sap_code']) ordOut(['found' => true, 'allowed' => false, 'zone' => $o['zone'], 'ro' => $o['ro'], 'own_only' => $me['sap_code']]);
    ordOut(['found' => true, 'allowed' => true, 'outlet' => [
        'sap_code' => $o['sap_code'], 'zone' => $o['zone'], 'state' => $o['state'], 'ro' => $o['ro'],
        'outlet' => $o['outlet_name'], 'district' => $o['district'], 'sales_area' => (string)$o['sales_area'],
        'address' => (string)$o['address'], 'phone' => (string)$o['phone'], 'pincode' => (string)$o['pincode'],
        'gstin' => (string)$o['gstin'], 'pan' => (string)$o['pan'],
    ]]);
}

// ── SAP Numbers page (Rohan Energy side) ─────────────────────────────────────
// The list of SAP codes IS the outlet list orders are placed from (portal_outlets): ordCheck() and the New Order lookup read it on every use,
// so whatever is saved here applies to the very next order. Orders that already exist keep the outlet details they were created with.

/**
 * Who may use the SAP Numbers page. Super Admins (Rohan Energy or HPCL) see every zone, a Zone Officer (Rohan Energy or HPCL) the regions of their zone,
 * a Regional Officer the region they handle. Super Admins and Zone Officers may add or change a SAP code; Regional Officers only view.
 * Returns ['edit' => may add / change, 'regions' => the regions this user may list and put an outlet in].
 */
function ordSapAccess(array $me): array {
    // Super admins (Rohan Energy or HPCL) and Zone Officers (Rohan Energy or HPCL) add and edit; Regional Officers only view.
    if ($me['kind'] === 'admin') {
        $all = $me['ros'] ?: array_merge(...array_values(ORD_STATE_RO));
        if (!empty($me['ast'])) { $own = []; foreach ($me['ast'] as $stt) foreach (ORD_STATE_RO[$stt] ?? [] as $r) $own[] = $r; $all = array_values(array_intersect($all, $own)); }   // only the regions of the states he approves
        return ['edit' => true, 'regions' => $all];
    }   // an HPCL super admin made for some zones: those regions
    $regional = ($me['level'] ?? 'zone') === 'regional';
    if ($regional && !$me['ros']) ordFail(403, 'Your account has no region assigned. Please contact your Zone Officer.');
    $zr = [];
    foreach (($me['zones'] ?? [$me['zone']]) as $zn) foreach (ordZoneRos($zn) as $r) $zr[] = $r;
    return ['edit' => !$regional, 'regions' => $me['ros'] ?: $zr];
}
/** SQL fragment + params for the SAP codes this user may see (the same zone / regions the user can place orders for). */
function ordSapScope(array $me): array {
    [$roSql, $roP] = ordRoSql($me['ros'] ?? [], 'ro');
    if ($me['kind'] === 'admin') {   // an HPCL super admin made for some zones only sees their regions; a super admin made for some states only sees the SAP numbers of those states
        $ast = array_values($me['ast'] ?? []);
        $stSql = $ast ? ' AND state IN (' . implode(',', array_fill(0, count($ast), '?')) . ')' : '';
        return ['1=1' . $roSql . $stSql, array_merge($roP, $ast)];
    }
    $zs = $me['zones'] ?? [$me['zone']];
    $sapSql = !empty($me['sap_code']) ? ' AND sap_code = ?' : '';   // an outlet login sees its own SAP number only
    [$saSql, $saP] = ordSaSql($me['sales_areas'] ?? [], 'sales_area');   // a Regional Officer only sees the SAP numbers of the sales areas they handle
    return ['zone IN (' . implode(',', array_fill(0, count($zs), '?')) . ')' . $roSql . $saSql . $sapSql, array_merge($zs, $roP, $saP, !empty($me['sap_code']) ? [$me['sap_code']] : [])];
}
/** Portal zone, state and Master Sheet zone that follow from a region: the user only picks the region. Null for an unknown region. */
function ordRegionInfo(string $ro): ?array {
    $state = null;
    foreach (ORD_STATE_RO as $s => $ros) if (in_array($ro, $ros, true)) $state = $s;
    $zone = null; $sz = '';
    foreach (ORD_SHEET_ZONES as $n => $d) if (in_array($ro, $d['ros'], true)) { $sz = $n; $zone = $d['zone']; }
    return ($state === null || $zone === null || $sz === '') ? null : ['ro' => $ro, 'state' => $state, 'zone' => $zone, 'sheet_zone' => $sz];
}

/** The SAP list: filters q / sheet_zone / state / ro / district, 50 rows a page, plus the figures and dropdown values for the page's filters. */
function ordSapList(PDO $pdo, array $me): void {
    $acc = ordSapAccess($me);
    [$scope, $sp] = ordSapScope($me);
    $where = [$scope]; $params = $sp;
    $sz = trim((string)($_GET['sheet_zone'] ?? ''));
    if ($sz !== '') { if (!isset(ORD_SHEET_ZONES[$sz])) ordFail(400, 'Unknown zone.'); $where[] = 'sheet_zone = ?'; $params[] = $sz; }
    $stt = trim((string)($_GET['state'] ?? ''));
    if ($stt !== '') { $where[] = 'state = ?'; $params[] = $stt; }
    $ro = trim((string)($_GET['ro'] ?? ''));
    if ($ro !== '') { $where[] = 'ro = ?'; $params[] = $ro; }
    $dist = trim((string)($_GET['district'] ?? ''));
    if ($dist !== '') { $where[] = 'district = ?'; $params[] = $dist; }
    $q = trim((string)($_GET['q'] ?? ''));
    if ($q !== '') {
        $like = '%' . addcslashes(mb_substr($q, 0, 60), '%_\\') . '%';
        $where[] = '(sap_code LIKE ? OR outlet_name LIKE ? OR district LIKE ? OR sales_area LIKE ? OR address LIKE ? OR gstin LIKE ? OR phone LIKE ?)';
        for ($i = 0; $i < 7; $i++) $params[] = $like;
    }
    $w = implode(' AND ', $where);
    $st = $pdo->prepare("SELECT COUNT(*) FROM `" . ORD_T_OUT . "` WHERE $w");
    $st->execute($params);
    $total = (int)$st->fetchColumn();
    $pages = max(1, (int)ceil($total / ORD_SAP_PAGE));
    $page = min(max(1, (int)($_GET['page'] ?? 1)), $pages);
    $st = $pdo->prepare("SELECT " . ORD_SAP_COLS . " FROM `" . ORD_T_OUT . "` WHERE $w ORDER BY sap_code LIMIT " . ORD_SAP_PAGE . " OFFSET " . (($page - 1) * ORD_SAP_PAGE));
    $st->execute($params);
    $rows = $st->fetchAll();
    if (($_GET['pick'] ?? '') === '1') ordOut(['rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages, 'per' => ORD_SAP_PAGE]);   // the picker at the bottom of New Order needs the rows only

    // everything this user can see (not narrowed by the filters): the regions with their outlet counts, and the districts of each region
    $st = $pdo->prepare("SELECT ro, sheet_zone, zone, state, COUNT(*) c FROM `" . ORD_T_OUT . "` WHERE $scope GROUP BY ro, sheet_zone, zone, state ORDER BY sheet_zone, ro");
    $st->execute($sp);
    $regions = []; $all = 0;
    foreach ($st->fetchAll() as $r) { $regions[] = ['ro' => $r['ro'], 'sheet_zone' => $r['sheet_zone'], 'zone' => $r['zone'], 'state' => $r['state'], 'count' => (int)$r['c']]; $all += (int)$r['c']; }
    // every region of the client's zone list that this user covers is offered in the Zone / Region filters, also while it has no SAP numbers yet (count 0)
    if (empty($me['sap_code'])) {
        $have = []; foreach ($regions as $r) $have[$r['ro']] = 1;
        foreach ($acc['regions'] as $ro) {
            if (isset($have[$ro]) || !($inf = ordRegionInfo($ro))) continue;
            $regions[] = ['ro' => $ro, 'sheet_zone' => $inf['sheet_zone'], 'zone' => $inf['zone'], 'state' => $inf['state'], 'count' => 0];
        }
        usort($regions, fn($x, $y) => strcmp($x['sheet_zone'] . '|' . $x['ro'], $y['sheet_zone'] . '|' . $y['ro']));
    }
    $st = $pdo->prepare("SELECT DISTINCT ro, district FROM `" . ORD_T_OUT . "` WHERE $scope AND district NOT IN ('', '(Empty)') ORDER BY ro, district");
    $st->execute($sp);
    $districts = []; $names = [];
    foreach ($st->fetchAll() as $r) { $districts[$r['ro']][] = $r['district']; $names[strtolower($r['district'])] = 1; }

    ordOut([
        'rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages, 'per' => ORD_SAP_PAGE,
        'can_edit' => $acc['edit'],
        'scope' => ['total' => $all, 'regions' => $regions, 'districts' => (object)$districts, 'districts_n' => count($names)],
        'edit_regions' => $acc['edit'] ? array_values(array_filter(array_map('ordRegionInfo', $acc['regions']))) : [],
    ]);
}

/**
 * Add a SAP code (orig empty) or change one (orig = its current code). Super Admin and Zone Officers only; a Zone Officer works inside their own zone / regions.
 * The zone, state and Master Sheet zone follow from the region. Format checks (phone, pincode, GSTIN, PAN) apply to the values that are changed, so old
 * sheet data never blocks an edit of something else. Every change is logged with who made it.
 */
function ordSapSave(PDO $pdo, array $me, array $body): void {
    $acc = ordSapAccess($me);
    if (!$acc['edit']) ordFail(403, 'Only the Super Admin and Zone Officers can add or change SAP numbers.');
    $cols = ORD_SAP_COLS;
    $cur = null;
    $orig = ordStr($body['orig'] ?? '', 12);
    if ($orig !== '') {
        [$scope, $sp] = ordSapScope($me);
        $st = $pdo->prepare("SELECT $cols FROM `" . ORD_T_OUT . "` WHERE sap_code = ? AND $scope");
        $st->execute(array_merge([$orig], $sp));
        $cur = $st->fetch() ?: null;
        if (!$cur) ordFail(404, 'This SAP number was not found in your area. Please reload the page.');
    }
    $errors = [];

    $sap = ordStr($body['sap_code'] ?? '', 12);
    if (!preg_match('/^\d{6,12}$/', $sap)) $errors['sap_code'] = 'Enter a valid SAP code (6 to 12 digits).';
    elseif (!$cur || $sap !== $cur['sap_code']) {
        $st = $pdo->prepare("SELECT 1 FROM `" . ORD_T_OUT . "` WHERE sap_code = ?");
        $st->execute([$sap]);
        if ($st->fetchColumn()) $errors['sap_code'] = 'This SAP code already exists.';
    }

    $ro = ordStr($body['ro'] ?? '', 60);
    $info = null;
    if ($ro === '') $errors['ro'] = 'Choose the region.';
    elseif (($i = ordRegionInfo($ro)) && in_array($ro, $acc['regions'], true)) $info = $i;
    elseif ($cur && $cur['ro'] === $ro) $info = ['ro' => $ro, 'state' => $cur['state'], 'zone' => $cur['zone'], 'sheet_zone' => $cur['sheet_zone']];   // region left as it was
    else $errors['ro'] = $me['kind'] === 'admin' ? 'Choose a valid region.' : 'Choose one of your regions.';

    $row = ['sap_code' => $sap, 'sheet_zone' => $info['sheet_zone'] ?? '', 'zone' => $info['zone'] ?? '', 'state' => $info['state'] ?? '', 'ro' => $ro];
    $labels = ['outlet_name' => 'Outlet name', 'district' => 'District'];
    foreach (ORD_SAP_FIELDS as $k => [$max, $fmt]) {
        $raw = ordStr($body[$k] ?? '', $max);
        if ($cur && $raw === (string)$cur[$k]) { $row[$k] = $raw; continue; }   // not touched: keep exactly as it is
        $v = preg_replace('/\s+/u', ' ', $raw) ?? $raw;
        if (strpos($fmt, 'up') !== false || in_array($fmt, ['gstin', 'pan'], true)) $v = mb_strtoupper($v);
        $row[$k] = $v;
        if (strpos($fmt, 'req') !== false && $v === '') { $errors[$k] = ($labels[$k] ?? 'This field') . ' is required.'; continue; }
        if ($v === '') continue;
        if ($fmt === 'phone' && !preg_match('/^[0-9+()\-\s,\/]{1,20}$/', $v))           $errors[$k] = 'Enter a valid phone number.';
        elseif ($fmt === 'pin' && !preg_match('/^\d{6}$/', $v))                          $errors[$k] = 'Pincode must be 6 digits.';
        elseif ($fmt === 'gstin' && !preg_match('/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/', $v)) $errors[$k] = 'Enter a valid 15-character GSTIN.';
        elseif ($fmt === 'pan' && !preg_match('/^[A-Z]{5}\d{4}[A-Z]$/', $v))             $errors[$k] = 'Enter a valid 10-character PAN.';
    }
    if ($errors) { http_response_code(422); echo json_encode(['ok' => false, 'error' => 'Please fix the highlighted fields.', 'fields' => $errors]); exit; }

    $changes = [];
    foreach ($row as $k => $v) {
        $old = $cur ? (string)$cur[$k] : '';
        if ($v !== $old) $changes[$k] = [$cur ? $old : null, $v];
    }
    if ($cur && !$changes) ordOut(['outlet' => $cur, 'changed' => [], 'created' => false]);

    $by = $me['label'];
    try {
        $pdo->beginTransaction();
        if ($cur) {
            $set = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($row)));
            $pdo->prepare("UPDATE `" . ORD_T_OUT . "` SET $set, updated_by = ?, updated_at = NOW() WHERE sap_code = ?")->execute(array_merge(array_values($row), [$by, $cur['sap_code']]));
            if ($sap !== $cur['sap_code']) $pdo->prepare("UPDATE `" . ORD_T_OUTLOG . "` SET sap_code = ? WHERE sap_code = ?")->execute([$sap, $cur['sap_code']]);   // the history follows the new number
        } else {
            $pdo->prepare("INSERT INTO `" . ORD_T_OUT . "` (`" . implode('`,`', array_keys($row)) . "`, updated_by, updated_at) VALUES (" . implode(',', array_fill(0, count($row), '?')) . ", ?, NOW())")
                ->execute(array_merge(array_values($row), [$by]));
        }
        $pdo->prepare("INSERT INTO `" . ORD_T_OUTLOG . "` (sap_code, action, changes, username, user_label, created_at) VALUES (?,?,?,?,?,NOW())")
            ->execute([$sap, $cur ? 'edited' : 'added', json_encode($changes, JSON_UNESCAPED_UNICODE), $me['username'], $by]);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ((string)$e->getCode() === '23000') { http_response_code(422); echo json_encode(['ok' => false, 'error' => 'This SAP code already exists.', 'fields' => ['sap_code' => 'This SAP code already exists.']]); exit; }
        throw $e;
    }
    $st = $pdo->prepare("SELECT $cols FROM `" . ORD_T_OUT . "` WHERE sap_code = ?");
    $st->execute([$sap]);
    ordOut(['outlet' => $st->fetch(), 'changed' => array_keys($changes), 'created' => !$cur]);
}

/** SAP Numbers - Excel upload. The sheet is the client's outlet sheet ("Cluster 2 ...": SAP_CODE, NAME, REGIONAL_OFFICE_NAME, SALES_AREA_NAME, STATE_NAME, DISTRICT_NM, ADD_LN_1..5, TELE_NUM, PINCODE,
 *  GST_NUMBER, PAN_NUM), read in the browser and sent here as rows. mode 'preview' compares it with the SAP list and returns the differences WITHOUT changing anything; mode 'apply' makes them (new outlets
 *  added, changed outlets updated, each change logged like an edit on the page). Nothing is ever deleted; the invoice-to details are not in the sheet and stay as they are.
 *  Super Admin and Zone Officers only, inside their own regions. */
function ordSapImportClean($v): string {
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', (string)($v ?? '')) ?? '';
    $v = trim(preg_replace('/\s+/u', ' ', $v) ?? $v);
    return preg_match('/^#(NAME\?|N\/A|REF!|VALUE!|DIV\/0!|NULL!|NUM!)$/i', $v) ? '' : $v;   // an Excel error cell (#NAME? ...) is an empty cell, not a value
}
function ordSapImportNum($v): string { return preg_replace('/\.0+$/', '', ordSapImportClean($v)); }
/** "NA", "N/A", "NIL", "-" ... in the sheet mean the value is not there. */
function ordSapImportBlank(string $v): string { return preg_match('/^(NA|N\/A|N\.A\.?|NIL|NONE|NULL|NOT AVAILABLE|\.|-+|0)$/i', $v) ? '' : $v; }

/** Compare the sheet rows with the SAP list: returns the new outlets, the changed ones (field by field), the problem rows and the figures. */
function ordSapImportPlan(PDO $pdo, array $me, array $rows): array {
    $acc = ordSapAccess($me);
    if (!$acc['edit']) ordFail(403, 'Only the Super Admin and Zone Officers can upload SAP numbers.');
    [$scope, $sp] = ordSapScope($me);
    $st = $pdo->prepare("SELECT " . ORD_SAP_COLS . " FROM `" . ORD_T_OUT . "` WHERE $scope");
    $st->execute($sp);
    $mine = [];
    foreach ($st->fetchAll() as $r) $mine[(string)$r['sap_code']] = $r;
    $all = [];
    foreach ($pdo->query("SELECT sap_code FROM `" . ORD_T_OUT . "`")->fetchAll(PDO::FETCH_COLUMN) as $c) $all[(string)$c] = 1;
    $stateFix = ['CHATTISGARH' => 'Chhattisgarh'];
    $seen = []; $added = []; $changed = []; $problems = []; $unchanged = 0; $outside = 0; $warnN = 0;
    foreach ($rows as $x) {
        if (!is_array($x)) continue;
        $line = (int)($x['r'] ?? 0);
        $code = ordSapImportNum($x['sap'] ?? '');
        $name = ordSapImportClean($x['name'] ?? '');
        $bad = function (string $msg) use (&$problems, $line, $code, $name) { $problems[] = ['row' => $line, 'sap' => $code, 'name' => $name, 'error' => $msg]; };
        if (!preg_match('/^\d{6,12}$/', $code)) { $bad('Not a valid SAP code (6 to 12 digits).'); continue; }
        if (isset($seen[$code])) { $bad('Repeated SAP code (first seen on row ' . $seen[$code] . ') - the first row is used.'); continue; }
        $seen[$code] = $line;
        $cur = $mine[$code] ?? null;
        if (isset($all[$code]) && !$cur) { $outside++; continue; }   // an outlet that exists but is not in this user's area
        $ro = ordSapImportClean($x['ro'] ?? '');
        if ($ro === '') { $bad('The regional office is blank.'); continue; }
        if ($name === '') { $bad('The outlet name is blank.'); continue; }
        $info = ordRegionInfo($ro);
        if ($cur && $cur['ro'] === $ro) $info = ['ro' => $ro, 'state' => $cur['state'], 'zone' => $cur['zone'], 'sheet_zone' => $cur['sheet_zone']];   // region left as it was
        if (!$info) { $bad('Unknown regional office "' . $ro . '".'); continue; }
        if (!$cur && !in_array($ro, $acc['regions'], true)) { $outside++; continue; }   // a new outlet of a region that is not this user's
        if ($cur && $cur['ro'] !== $ro && !in_array($ro, $acc['regions'], true)) { $bad('The new region "' . $ro . '" is not one of your regions - not changed.'); continue; }
        $stt = ordSapImportClean($x['state'] ?? '');
        $stt = $stateFix[strtoupper($stt)] ?? $stt;
        $addr = [];
        foreach ((array)($x['a'] ?? []) as $l) { $l = ordSapImportClean($l); if ($l !== '') $addr[] = $l; }
        $new = ['outlet_name' => mb_substr($name, 0, 150), 'sheet_zone' => $info['sheet_zone'], 'zone' => $info['zone'], 'state' => mb_substr($stt !== '' ? $stt : $info['state'], 0, 50), 'ro' => $ro,
                'district' => mb_substr(mb_strtoupper(ordSapImportClean($x['district'] ?? '')), 0, 100), 'sales_area' => mb_substr(mb_strtoupper(ordSapImportClean($x['sa'] ?? '')), 0, 100),
                'address' => mb_substr(implode(', ', $addr), 0, 400), 'phone' => mb_substr(ordSapImportBlank(ordSapImportNum($x['phone'] ?? '')), 0, 20), 'pincode' => mb_substr(ordSapImportBlank(ordSapImportNum($x['pin'] ?? '')), 0, 10),
                'gstin' => mb_substr(mb_strtoupper(ordSapImportBlank(ordSapImportClean($x['gstin'] ?? ''))), 0, 20), 'pan' => mb_substr(mb_strtoupper(ordSapImportBlank(ordSapImportClean($x['pan'] ?? ''))), 0, 12)];
        $fmt = ['phone' => '/^[0-9+()\-\s,\/]{1,20}$/', 'pincode' => '/^\d{6}$/', 'gstin' => '/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/', 'pan' => '/^[A-Z]{5}\d{4}[A-Z]$/'];
        $warn = [];
        $diff = [];
        foreach ($new as $k => $v) {
            $old = $cur ? (string)$cur[$k] : '';
            if ($v === $old) continue;
            if ($v !== '' && isset($fmt[$k]) && !preg_match($fmt[$k], $v)) {   // a changed value in a wrong format is not taken over: the old value stays
                $warn[] = ORD_SAP_IMPORT_LBL[$k] . ' "' . $v . '" is not valid - ' . ($cur ? 'left as it is' : 'left blank');
                $new[$k] = $old; continue;
            }
            $diff[$k] = [$cur ? $old : null, $v];
        }
        if ($warn) $warnN++;
        if (!$cur) { $added[] = ['sap' => $code, 'name' => $new['outlet_name'], 'ro' => $ro, 'sales_area' => $new['sales_area'], 'district' => $new['district'], 'warn' => $warn, 'row' => $line, 'values' => $new]; continue; }
        if (!$diff) { $unchanged++; if ($warn) $problems[] = ['row' => $line, 'sap' => $code, 'name' => $name, 'error' => implode('; ', $warn)]; continue; }
        $changed[] = ['sap' => $code, 'name' => $cur['outlet_name'], 'ro' => $cur['ro'], 'warn' => $warn, 'row' => $line, 'diff' => $diff, 'values' => $new];
    }
    $missing = [];
    foreach ($mine as $c => $r) if (!isset($seen[(string)$c])) $missing[] = ['sap' => (string)$c, 'name' => $r['outlet_name'], 'ro' => $r['ro'], 'sales_area' => $r['sales_area'], 'old' => $r];
    return ['added' => $added, 'changed' => $changed, 'problems' => $problems, 'unchanged' => $unchanged, 'outside' => $outside, 'missing' => $missing, 'warn_rows' => $warnN, 'read' => count($seen)];
}

function ordSapImport(PDO $pdo, array $me, array $body): void {
    $rows = $body['rows'] ?? null;
    if (!is_array($rows) || !$rows) ordFail(400, 'The sheet has no rows.');
    if (count($rows) > ORD_SAP_IMPORT_MAX) ordFail(400, 'The sheet has more than ' . ORD_SAP_IMPORT_MAX . ' rows. Please split it.');
    $plan = ordSapImportPlan($pdo, $me, $rows);
    if (($body['mode'] ?? 'preview') !== 'apply') {
        $fieldN = []; foreach ($plan['changed'] as $c) foreach ($c['diff'] as $k => $_) $fieldN[$k] = ($fieldN[$k] ?? 0) + 1;
        ordOut(['mode' => 'preview',
            'summary' => ['read' => $plan['read'], 'new' => count($plan['added']), 'changed' => count($plan['changed']), 'unchanged' => $plan['unchanged'], 'missing' => count($plan['missing']),
                          'outside' => $plan['outside'], 'problems' => count($plan['problems']), 'warn_rows' => $plan['warn_rows']],
            'fields' => $fieldN, 'labels' => ORD_SAP_IMPORT_LBL,
            'added' => array_map(fn($a) => array_diff_key($a, ['values' => 1]), $plan['added']),
            'changed' => array_map(fn($c) => ['sap' => $c['sap'], 'name' => $c['name'], 'ro' => $c['ro'], 'row' => $c['row'], 'warn' => $c['warn'],
                                              'diff' => array_map(fn($k, $d) => [$k, $d[0], $d[1]], array_keys($c['diff']), array_values($c['diff']))], $plan['changed']),
            'problems' => array_slice($plan['problems'], 0, 500), 'problems_n' => count($plan['problems']),
            'missing' => array_map(fn($m) => array_diff_key($m, ['old' => 1]), array_slice($plan['missing'], 0, 300)), 'missing_n' => count($plan['missing'])]);
    }
    $doAdd = !empty($body['add']); $doUpd = !empty($body['update']);
    $doRem = !empty($body['remove']);   // "replace the list": the outlets that are not in the sheet are removed (Super Admin only; the sheet must be sent whole)
    if ($doRem) {
        if ($me['kind'] !== 'admin') ordFail(403, 'Only the Super Admin can remove outlets with an upload.');
        if ((int)($body['remove_n'] ?? -1) !== count($plan['missing'])) ordFail(409, 'The list is not the same as when you reviewed the sheet (' . count($plan['missing']) . ' outlets would be removed now). Please choose the file again.');
    }
    $by = $me['label'];
    $nAdd = 0; $nUpd = 0; $nRem = 0;
    $log = $pdo->prepare("INSERT INTO `" . ORD_T_OUTLOG . "` (sap_code, action, changes, username, user_label, created_at) VALUES (?,?,?,?,?,NOW())");
    try {
        $pdo->beginTransaction();
        if ($doAdd) foreach ($plan['added'] as $a) {
            $row = ['sap_code' => $a['sap']] + $a['values'];
            $pdo->prepare("INSERT INTO `" . ORD_T_OUT . "` (`" . implode('`,`', array_keys($row)) . "`, updated_by, updated_at) VALUES (" . implode(',', array_fill(0, count($row), '?')) . ", ?, NOW())")
                ->execute(array_merge(array_values($row), [$by]));
            $ch = []; foreach ($a['values'] as $k => $v) if ($v !== '') $ch[$k] = [null, $v];
            $log->execute([$a['sap'], 'added', json_encode($ch, JSON_UNESCAPED_UNICODE), $me['username'], $by]);
            $nAdd++;
        }
        if ($doUpd) foreach ($plan['changed'] as $c) {
            $set = []; $args = [];
            foreach ($c['diff'] as $k => $d) { $set[] = "`$k` = ?"; $args[] = $d[1]; }
            $pdo->prepare("UPDATE `" . ORD_T_OUT . "` SET " . implode(', ', $set) . ", updated_by = ?, updated_at = NOW() WHERE sap_code = ?")->execute(array_merge($args, [$by, $c['sap']]));
            $log->execute([$c['sap'], 'edited', json_encode($c['diff'], JSON_UNESCAPED_UNICODE), $me['username'], $by]);
            $nUpd++;
        }
        if ($doRem && $plan['missing']) {
            $hasOu = (bool)$pdo->query("SHOW TABLES LIKE 'portal_outlet_users'")->fetchColumn();   // the outlet logins of a removed outlet go with it
            foreach (array_chunk(array_column($plan['missing'], 'sap'), 500) as $chunk) {
                $ph = implode(',', array_fill(0, count($chunk), '?'));
                foreach (array_slice($plan['missing'], $nRem, count($chunk)) as $m) {
                    $c = $m['sap']; $old = []; foreach ($m['old'] as $k => $v) if ((string)$v !== '' && !in_array($k, ['updated_by', 'updated_at'], true)) $old[$k] = [(string)$v, null];
                    $log->execute([$c, 'removed', json_encode($old, JSON_UNESCAPED_UNICODE), $me['username'], $by]);
                }
                $pdo->prepare("DELETE FROM `" . ORD_T_OUT . "` WHERE sap_code IN ($ph)")->execute($chunk);
                if ($hasOu) $pdo->prepare("DELETE FROM `portal_outlet_users` WHERE sap_code IN ($ph)")->execute($chunk);
                $nRem += count($chunk);
            }
        }
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        ordFail(500, 'The upload could not be saved, nothing was changed (' . $e->getMessage() . ').');
    }
    ordOut(['mode' => 'apply', 'added' => $nAdd, 'updated' => $nUpd, 'removed' => $nRem]);
}

/** The change log of one page: area = sap | mis | foc, page, q (search). Anyone who may open the page may read its log; the SAP log shows the SAP numbers the user may see. */
function ordChangeLog(PDO $pdo, array $me): void {
    $area = (string)($_GET['area'] ?? '');
    if (!isset(CHG_AREAS[$area])) ordFail(400, 'Unknown page.');
    $page = max(1, (int)($_GET['page'] ?? 1)); $q = trim((string)($_GET['q'] ?? ''));
    if ($area === 'foc' && $me['kind'] !== 'admin') ordFail(403, 'The FOC page is only for the super admin.');
    if ($area !== 'sap') ordOut(['area' => $area] + chgFetch($pdo, $area, $page, mb_substr($q, 0, 80)));

    // SAP Numbers: the history table of the page, limited to the SAP numbers this user can see
    ordSapAccess($me);
    [$scope, $sp] = ordSapScope($me);
    $lbl = ['sap_code' => 'SAP code', 'outlet_name' => 'Outlet name', 'sheet_zone' => 'Zone', 'zone' => 'Portal zone', 'state' => 'State', 'ro' => 'Region', 'district' => 'District', 'sales_area' => 'Sales area',
            'address' => 'Address', 'phone' => 'Phone', 'pincode' => 'Pincode', 'gstin' => 'GSTIN', 'pan' => 'PAN', 'inv_name' => 'Invoice-to name', 'inv_address' => 'Invoice-to address',
            'inv_state' => 'Invoice-to state', 'inv_pincode' => 'Invoice-to pincode', 'inv_pan' => 'Invoice-to PAN', 'inv_gstin' => 'Invoice-to GSTIN'];
    $name = "(SELECT o.outlet_name FROM `" . ORD_T_OUT . "` o WHERE o.sap_code = l.sap_code)";
    $where = "(l.sap_code IN (SELECT sap_code FROM `" . ORD_T_OUT . "` WHERE $scope)" . ($me['kind'] === 'admin' && empty($me['ros']) ? " OR l.action = 'removed'" : "") . ")"; $args = $sp;
    if ($q !== '') {
        $where .= " AND LOWER(CONCAT_WS(' ', l.sap_code, $name, l.user_label, l.username, l.changes)) LIKE ?";
        $args[] = '%' . mb_strtolower(str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_substr($q, 0, 80))) . '%';
    }
    $st = $pdo->prepare("SELECT COUNT(*) FROM `" . ORD_T_OUTLOG . "` l WHERE $where"); $st->execute($args);
    $total = (int)$st->fetchColumn();
    $per = 50; $pages = max(1, (int)ceil($total / $per)); $page = min($page, $pages);
    $st = $pdo->prepare("SELECT l.id, l.sap_code, $name AS outlet, l.action, l.changes, l.user_label, l.created_at FROM `" . ORD_T_OUTLOG . "` l WHERE $where ORDER BY l.id DESC LIMIT $per OFFSET " . (($page - 1) * $per));
    $st->execute($args);
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        $c = json_decode((string)$r['changes'], true); $c = is_array($c) ? $c : [];
        $ch = [];
        foreach ($c as $k => $v) $ch[] = [$lbl[$k] ?? $k, is_array($v) ? ($v[0] ?? null) : null, is_array($v) ? ($v[1] ?? null) : null];
        $rows[] = ['id' => (int)$r['id'], 'at' => $r['created_at'], 'by' => $r['user_label'], 'role' => '', 'action' => $r['action'],
                   'target' => $r['sap_code'] . (($r['outlet'] ?: ($c['outlet_name'][0] ?? '')) ? ' - ' . ($r['outlet'] ?: $c['outlet_name'][0]) : ''), 'summary' => $r['action'] === 'added' ? 'SAP number added' : ($r['action'] === 'removed' ? 'SAP number removed (not in the uploaded sheet)' : 'SAP number edited'),
                   'changes' => $r['action'] === 'added' ? array_values(array_filter($ch, fn($x) => $x[2] !== null && $x[2] !== '' && !in_array($x[0], ['SAP code', 'Zone', 'Portal zone', 'State'], true))) : $ch, 'lines' => [], 'note' => ''];
    }
    ordOut(['area' => 'sap', 'rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages]);
}

/** Name, role, organisation and contact of the signed-in user (top bar of every page). An outlet login has the outlet's phone number only. */
function ordMeInfo(PDO $pdo, array $me): array {
    $org = !empty($me['outlet']) || $me['kind'] === 'hpcl' ? 'hpcl' : ($me['kind'] === 'rohan' ? 'rohan' : (!empty($me['hsuper']) ? 'hpcl' : 'rohan'));
    $lvl = !empty($me['outlet']) ? 'Retail Outlet' : ($me['kind'] === 'admin' ? 'Super Admin' : (($me['level'] ?? 'zone') === 'regional' ? 'Regional Officer (RO)' : 'Zone Officer'));
    if (!empty($me['outlet'])) {
        $p = ordOutletProfile($pdo, (string)$me['sap_code']);
        return ['email' => '', 'mobile' => (string)($p['phone'] ?? ''), 'org' => $org, 'org_name' => 'HPCL', 'role_name' => $lvl];
    }
    $u = usersLoad()[$me['username']] ?? [];
    return ['email' => (string)($u['email'] ?? ''), 'mobile' => (string)($u['mobile'] ?? ''), 'org' => $org, 'org_name' => $org === 'hpcl' ? 'HPCL' : 'Rohan Energy', 'role_name' => $lvl];
}

/** The profile page: everything the portal knows about the signed-in user (never the password). */
function ordProfile(PDO $pdo, array $me): void {
    $info = ordMeInfo($pdo, $me);
    $p = ['name' => (string)$me['label'], 'username' => (string)$me['username'], 'org_name' => $info['org_name'], 'role_name' => $info['role_name'],
          'email' => $info['email'], 'mobile' => $info['mobile']];
    if (!empty($me['outlet'])) {
        $p['outlet'] = ordOutletProfile($pdo, (string)$me['sap_code']);
        $p['officers'] = $p['outlet'] ? ordOfficersOf(['zone' => $me['zone'], 'ro' => (string)$p['outlet']['ro'], 'sales_area' => (string)$p['outlet']['sales_area']]) : [];
        $p['sap_count'] = 1;
        ordOut(['profile' => $p]);
    }
    $users = usersLoad();
    $u = $users[$me['username']] ?? [];
    $p['created_by'] = ($u['created_by'] ?? '') !== '' ? (string)(($users[$u['created_by']]['label'] ?? '') ?: $u['created_by']) : '';
    $p['password_changed'] = ['at' => (string)($u['pass_at'] ?? ''), 'by' => (string)($u['pass_by'] ?? '')];
    $zones = []; foreach (ordUserZones($u) as $zn) foreach (ORD_SHEET_ZONES as $n => $d) if ($d['zone'] === $zn && (!$me['ros'] || array_intersect($d['ros'], $me['ros']))) $zones[] = $n;
    if ($me['kind'] === 'admin') {
        $ast = $me['ast'] ?? [];
        $p['zones'] = !empty($me['hsuper']) ? array_values(array_unique($zones)) : [];
        $p['regions'] = !empty($me['hsuper']) ? array_values($me['ros']) : [];
        $p['states'] = $ast;   // the states whose pending orders this super admin approves (none = all)
        $p['scope_note'] = !empty($me['hsuper']) ? ($zones ? 'The zones listed' : 'Every zone') : 'Every zone and region';
    } else {
        $p['zones'] = array_values(array_unique($zones));
        $p['regions'] = array_values($me['ros']);
        $p['sales_areas'] = array_values($me['sales_areas'] ?? []);
    }
    [$scope, $sp] = ordSapScope($me);
    $st = $pdo->prepare("SELECT COUNT(*) FROM `" . ORD_T_OUT . "` WHERE $scope");
    $st->execute($sp);
    $p['sap_count'] = (int)$st->fetchColumn();
    if ($me['kind'] !== 'admin' && ($me['level'] ?? 'zone') === 'zone') {
        $mine = [];
        foreach ($users as $n => $tu) if (($tu['level'] ?? '') === 'regional' && ($tu['created_by'] ?? '') === $me['username']) $mine[] = ['name' => (string)($tu['label'] ?? $n), 'area' => implode(', ', array_map('strval', (array)($tu['sales_areas'] ?? []))), 'email' => (string)($tu['email'] ?? ''), 'mobile' => (string)($tu['mobile'] ?? '')];
        usort($mine, fn($a, $b) => strcmp($a['name'], $b['name']));
        $p['regional_officers'] = $mine;
    }
    ordOut(['profile' => $p]);
}

/** Tier of an HPCL officer in the hierarchy of the FY27 workbook, by its e-mail (ORD_HPCL_DESIG); an officer that is not in the workbook is placed by what it covers:
 *  a Regional Officer (sales areas) = Sales Officer, a Zone Officer with exactly one region = Regional Manager, any other Zone Officer = Zonal Coordinator. Returns [tier, designation]. */
function ordHpclTier(string $email, bool $regional, int $nRos, int $nZones = 1): array {
    $em = strtolower(trim($email));
    if ($em !== '' && isset(ORD_HPCL_DESIG[$em])) return ORD_HPCL_DESIG[$em];
    if ($regional) return ['so', 'Sales Officer'];
    if ($nZones > 1) return ['fulfil', 'Fulfilment Officer'];
    return $nRos === 1 ? ['manager', 'Regional Manager'] : ['coord', 'Zonal Coordinator'];
}

/** The "My superiors" page: a hierarchy of the people above the signed-in user, top first (contact details only - no user names, no passwords).
 *  HPCL:         Super Admin  >  Zonal Coordinator (zone)  >  Regional Manager (region)  >  Sales Officer (sales area)  >  Retail Outlet (SAP number)
 *  Rohan Energy: Super Admin  >  Zone Officer (zone)       >  Regional Officer (region / sales areas)                  >  Retail Outlet
 *  A user sees only what is above their own place; a Retail Outlet sees both chains, the Super Admins are at the top. The one who created the account is marked. */
function ordSuperiors(PDO $pdo, array $me): void {
    $users = usersLoad();
    $isOutlet = !empty($me['outlet']);
    $zone = (string)($me['zone'] ?? '');
    $info = ordMeInfo($pdo, $me);
    $myOrg = $info['org'];
    $creator = $isOutlet ? '' : (string)($users[$me['username']]['created_by'] ?? '');
    $rank = ['hpcl' => ['sa' => 0, 'fulfil' => 1, 'coord' => 2, 'manager' => 3, 'so' => 4, 'outlet' => 5], 'rohan' => ['sa' => 0, 'zone' => 1, 'regional' => 2, 'outlet' => 3]];
    $titles = ['sa' => 'Super Admin', 'fulfil' => 'Level 4 Officer', 'coord' => 'Zonal Coordinator (Level 3)', 'manager' => 'Regional Manager (Level 2)', 'so' => 'Sales Officer (Level 1)', 'zone' => 'Zone Officer', 'regional' => 'Regional Officer'];
    $profile = $isOutlet ? ordOutletProfile($pdo, (string)$me['sap_code']) : null;
    $areas = $isOutlet ? [(string)($profile['sales_area'] ?? "")] : array_values(array_map('strval', $me['sales_areas'] ?? []));
    $ros = $isOutlet ? [(string)($profile['ro'] ?? "")] : array_values(array_map('strval', $me['ros'] ?? []));
    $myEmail = $isOutlet ? "" : (string)($users[$me['username']]['email'] ?? "");
    // where the signed-in user stands
    $myDesig = '';
    if ($isOutlet) $myTier = 'outlet';
    elseif ($me['kind'] === 'admin') $myTier = 'sa';
    elseif ($myOrg === 'hpcl') [$myTier, $myDesig] = ordHpclTier($myEmail, ($me['level'] ?? 'zone') === 'regional', count($ros), count((array)($users[$me['username']]['sheet_zones'] ?? [])));
    else $myTier = ($me['level'] ?? 'zone') === 'regional' ? 'regional' : 'zone';
    $orgs = $isOutlet ? ['hpcl', 'rohan'] : [$myOrg];
    $mk = fn(array $x, string $orgKey, string $desig, string $area, bool $cr) => ['name' => $x['name'], 'org' => $orgKey, 'org_name' => $orgKey === 'hpcl' ? 'HPCL' : 'Rohan Energy',
        'designation' => $desig, 'area' => $area, 'email' => $x['email'], 'mobile' => $x['mobile'], 'creator' => $cr];
    // the officers (Zone and Regional) that cover this place
    $buckets = [];
    $seen = [];
    foreach ($ros ?: [""] as $r) {
        foreach (ordOfficersOf(['zone' => $zone, 'ro' => $r, 'sales_area' => $areas[0] ?? ""], true) as $x) {
            if (isset($seen[$x['_u']])) continue;
            $seen[$x['_u']] = 1;
            $org = $x['org']; $regional = $x['level'] === 'regional';
            if ($org === 'hpcl') { [$t, $d] = ordHpclTier($x['_e'], $regional, (int)$x['_n'], count($x['_z'])); }
            else { $t = $regional ? 'regional' : 'zone'; $d = $titles[$t]; }
            $area = (string)$x['area'];
            if ($org === 'hpcl' && $t === 'fulfil') {   // a Fulfilment Officer looks after whole zones: show the zones (and the states of the workbook)
                $st = ORD_HPCL_DESIG[strtolower(trim($x['_e']))][2] ?? '';
                $area = (count($x['_z']) >= count(ORD_SHEET_ZONES) ? 'All zones' : implode(', ', $x['_z'])) . ($st !== '' ? ' · States: ' . $st : '');
            }
            $buckets[$org][$t][] = $mk($x, $org, $d, $area, $creator !== "" && $x['_u'] === $creator);
        }
    }
    // the Super Admins (an HPCL Super Admin made for some zones only shows for those zones)
    foreach ($users as $n => $u) {
        if (($u['role'] ?? '') !== 'superadmin') continue;
        $org = ($u['org'] ?? null) === 'hpcl' ? 'hpcl' : 'rohan';
        $zs = ordUserZones($u);
        if ($zs && $zone !== "" && !in_array($zone, $zs, true)) continue;
        $zn = [];
        foreach ($zs as $z) foreach (ORD_SHEET_ZONES as $sn => $d) if ($d['zone'] === $z) $zn[] = $sn;
        $buckets[$org]['sa'][] = $mk(['name' => (string)($u['label'] ?? $n), 'email' => (string)($u['email'] ?? ""), 'mobile' => (string)($u['mobile'] ?? "")], $org, 'Super Admin',
            $zn ? implode(', ', array_values(array_unique($zn))) : 'All zones', $creator !== "" && (string)$n === $creator);
    }
    $chains = [];
    foreach ($orgs as $org) {
        $tiers = [];
        foreach ($rank[$org] as $t => $ix) {
            if ($t === 'outlet' || $ix >= ($rank[$org][$myTier] ?? 99)) continue;   // only what is above the user
            $ppl = $buckets[$org][$t] ?? [];
            if (!$ppl) continue;
            usort($ppl, fn($a, $b) => strcasecmp($a['name'], $b['name']));
            $tiers[] = ['key' => $t, 'title' => $titles[$t], 'people' => $ppl];
        }
        if ($tiers) $chains[] = ['org' => $org, 'org_name' => $org === 'hpcl' ? 'HPCL' : 'Rohan Energy', 'tiers' => $tiers];
    }
    if ($isOutlet) $meNode = ['name' => (string)($profile['name'] ?? $me['label']), 'designation' => 'Retail Outlet', 'org' => 'hpcl', 'org_name' => 'HPCL',
        'area' => 'SAP ' . $me['sap_code'] . ($areas[0] !== "" ? ' · ' . $areas[0] : ""), 'email' => "", 'mobile' => (string)($profile['phone'] ?? "")];
    else $meNode = ['name' => (string)$me['label'], 'designation' => $myDesig !== '' ? $myDesig : $info['role_name'], 'org' => $myOrg, 'org_name' => $info['org_name'],
        'area' => $myTier === 'sa' ? 'All zones' : ($myTier === 'fulfil' ? (count((array)($users[$me['username']]['sheet_zones'] ?? [])) >= count(ORD_SHEET_ZONES) ? 'All zones' : implode(', ', array_map('strval', (array)($users[$me['username']]['sheet_zones'] ?? [])))) : implode(', ', $areas ?: $ros)), 'email' => $info['email'], 'mobile' => $info['mobile']];
    ordOut(['me' => $meNode, 'chains' => $chains, 'top' => $myTier === 'sa']);
}

/** One outlet for the page header of an outlet login: name, the complete address, contact and its place in the zone / region / sales area. */
function ordOutletProfile(PDO $pdo, string $sap): ?array {
    $st = $pdo->prepare("SELECT sap_code, outlet_name, address, district, state, pincode, phone, gstin, zone, sheet_zone, ro, sales_area FROM `" . ORD_T_OUT . "` WHERE sap_code = ?");
    $st->execute([$sap]);
    $o = $st->fetch();
    if (!$o) return null;
    $ad = trim((string)$o['address']); $di = trim((string)$o['district']);
    if ($di !== '' && $ad !== '' && preg_match('/(^|[\s,])' . preg_quote($di, '/') . '[\s,.]*$/i', $ad)) $di = '';   // the address already ends with the district
    $parts = array_values(array_filter([$ad, $di, trim((string)$o['state'])], fn($x) => $x !== ''));
    $addr = implode(', ', $parts) . (trim((string)$o['pincode']) !== '' ? ' - ' . trim((string)$o['pincode']) : '');
    return ['sap' => $o['sap_code'], 'name' => $o['outlet_name'], 'address' => $addr, 'phone' => (string)$o['phone'], 'gstin' => (string)$o['gstin'],
            'zone' => $o['sheet_zone'], 'ro' => $o['ro'], 'sales_area' => $o['sales_area']];
}

/** The Zone Officers and Regional Officers (Rohan Energy and HPCL) who have access to an outlet with this zone / ro / sales_area. Names and contact only. */
function ordOfficersOf(array $o, bool $withUser = false): array {
    $out = [];
    foreach (usersLoad() as $n => $u) {
        if (($u['role'] ?? '') !== 'zone' || !in_array($u['org'] ?? null, ['rohan', 'hpcl'], true)) continue;
        $zones = ordUserZones($u);
        if (!in_array($o['zone'], $zones, true)) continue;
        $zr = []; foreach ($zones as $zn) foreach (ordZoneRos($zn) as $r) $zr[] = $r;
        $eff = array_values(array_intersect($zr, array_map('strval', (array)($u['ros'] ?? []))));
        if ($eff && !in_array($o['ro'], $eff, true)) continue;
        $regional = ($u['level'] ?? '') === 'regional';
        if ($regional) {
            $sas = array_map('ordSaKey', array_map('strval', (array)($u['sales_areas'] ?? [])));
            if (!$sas || !in_array(ordSaKey((string)$o['sales_area']), $sas, true)) continue;
        }
        $out[] = ['name' => (string)($u['label'] ?? $n), 'org' => $u['org'], 'org_name' => $u['org'] === 'hpcl' ? 'HPCL' : 'Rohan Energy', 'level' => $regional ? 'regional' : 'zone',
                  'level_name' => $regional ? 'Regional Officer (RO)' : 'Zone Officer', 'area' => $regional ? implode(', ', array_map('strval', (array)($u['sales_areas'] ?? []))) : ($eff ? implode(', ', $eff) : 'Whole zone'),
                  'email' => (string)($u['email'] ?? ''), 'mobile' => (string)($u['mobile'] ?? '')] + ($withUser ? ['_u' => (string)$n, '_n' => count($eff), '_e' => (string)($u['email'] ?? ""), '_z' => array_values(array_map('strval', (array)($u['sheet_zones'] ?? []))) ?: ($u['sheet_zone'] ?? '' ? [(string)$u['sheet_zone']] : [])] : []);
    }
    usort($out, fn($a, $b) => [$a['org'] === 'hpcl' ? 0 : 1, $a['level'] === 'zone' ? 0 : 1, $a['name']] <=> [$b['org'] === 'hpcl' ? 0 : 1, $b['level'] === 'zone' ? 0 : 1, $b['name']]);
    return $out;
}

/** The Zone Officers and Regional Officers (Rohan Energy and HPCL) who have access to one SAP number: the zone and region are theirs and, for a Regional Officer, the sales area too.
 *  An outlet login asks for its own number; everybody else for a SAP number they may see. Names and contact only - no user names, no passwords. */
function ordOutletOfficers(PDO $pdo, array $me): void {
    if (!empty($me['outlet'])) $code = (string)$me['sap_code'];
    else {
        $code = trim((string)($_GET['code'] ?? ''));
        if (!preg_match('/^\d{6,12}$/', $code)) ordFail(400, 'Enter a valid SAP code.');
        ordSapAccess($me);
        [$scope, $sp] = ordSapScope($me);
        $st = $pdo->prepare("SELECT 1 FROM `" . ORD_T_OUT . "` WHERE sap_code = ? AND $scope");
        $st->execute(array_merge([$code], $sp));
        if (!$st->fetchColumn()) ordFail(404, 'This SAP number was not found in your area.');
    }
    $st = $pdo->prepare("SELECT zone, ro, sales_area FROM `" . ORD_T_OUT . "` WHERE sap_code = ?");
    $st->execute([$code]);
    $o = $st->fetch();
    if (!$o) ordFail(404, 'This SAP number was not found.');
    $out = ordOfficersOf($o);
    ordOut(['sap' => $code, 'officers' => $out]);
}

/** The latest changes made to one SAP code (who, when, which fields from / to). Anyone who can see the code can read this. */
function ordSapHistory(PDO $pdo, array $me): void {
    ordSapAccess($me);
    $code = trim((string)($_GET['code'] ?? ''));
    if (!preg_match('/^\d{6,12}$/', $code)) ordFail(400, 'Enter a valid SAP code.');
    [$scope, $sp] = ordSapScope($me);
    $st = $pdo->prepare("SELECT 1 FROM `" . ORD_T_OUT . "` WHERE sap_code = ? AND $scope");
    $st->execute(array_merge([$code], $sp));
    if (!$st->fetchColumn()) ordFail(404, 'This SAP number was not found in your area.');
    $st = $pdo->prepare("SELECT action, changes, user_label, created_at FROM `" . ORD_T_OUTLOG . "` WHERE sap_code = ? ORDER BY id DESC LIMIT 20");
    $st->execute([$code]);
    $rows = $st->fetchAll();
    foreach ($rows as &$r) { $c = json_decode((string)$r['changes'], true); $r['changes'] = is_array($c) ? $c : []; }
    ordOut(['history' => $rows]);
}

/** Every detail of the given orders for the Regional Officer report: id => outlet / place, who placed and decided it and when, the lines with rate, GST and amount,
 *  totals, Sales Order / Tax Invoice numbers, and the dates from payment receipt to dispatch (in transit), Proof of Delivery and delivery.
 *  Rates are the ones fixed on the order; a line without one (a pending order) uses the current list price and is flagged as an estimate. */
function ordRoReportOrders(PDO $pdo, array $ids, bool $hideInv = false): array {
    $out = [];
    if (!$ids) return $out;
    $prices = [];
    foreach (ordPrices($pdo) as $p) $prices[$p['item']] = $p;
    $d10 = fn($v) => $v ? substr((string)$v, 0, 10) : '';
    foreach (array_chunk(array_values($ids), 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        $st = $pdo->prepare("SELECT id, order_ref, status, delivery_stage, doc_type, order_date, zone, state, ro, ro_code, outlet, district, sales_area, outlet_address, outlet_gstin,
                                    total_ea, total_vol, created_by_name, created_at, submitted_at, decided_by_name, decided_at, review_comment, remarks, voucher_no, invoice_no, invoice_mode, inv_flag, invoice_edits
                             FROM `" . ORD_T . "` WHERE id IN ($ph)");
        $st->execute($chunk);
        $rows = $st->fetchAll();
        $items = ordItemsFor($pdo, $chunk);
        $files = []; $events = [];
        $st = $pdo->prepare("SELECT order_id, kind, created_at FROM `" . ORD_T_FILE . "` WHERE order_id IN ($ph)");
        $st->execute($chunk);
        foreach ($st->fetchAll() as $f) $files[(int)$f['order_id']][$f['kind']] = (string)$f['created_at'];
        $st = $pdo->prepare("SELECT order_id, action, MIN(created_at) AS at FROM `" . ORD_T_EVENT . "` WHERE order_id IN ($ph) AND action IN ('transit','delivered') GROUP BY order_id, action");
        $st->execute($chunk);
        foreach ($st->fetchAll() as $e) $events[(int)$e['order_id']][$e['action']] = (string)$e['at'];

        foreach ($rows as $r) {
            $id = (int)$r['id'];
            $isInv = $r['doc_type'] === 'invoice';
            $taxInv = ($isInv || !empty($r['inv_flag'])) && !$hideInv;   // hidden from HPCL users while the super admin has not allowed them the Tax Invoice
            $ie = ($r['invoice_edits'] ?? '') !== '' ? json_decode((string)$r['invoice_edits'], true) : null;
            $ie = is_array($ie) ? $ie : [];
            $stage = $r['status'] === 'pending' ? 'pending' : ($r['status'] === 'rejected' ? 'rejected' : ($r['delivery_stage'] === 'delivered' ? 'completed' : 'transit'));
            $lines = []; $taxable = 0.0; $gstAmt = 0.0; $est = false; $missing = false;
            foreach ($items[$id] ?? [] as $i) {
                $rate = isset($i['rate']) ? (float)$i['rate'] : null; $gst = isset($i['gst']) ? (float)$i['gst'] : null; $lineEst = false;
                $ed = $ie['items'][$i['item']] ?? null;
                if (is_array($ed) && isset($ed['rate']) && is_numeric($ed['rate'])) $rate = (float)$ed['rate'];
                if (is_array($ed) && isset($ed['gst']) && is_numeric($ed['gst'])) $gst = (float)$ed['gst'];
                if ($rate === null) {   // not fixed yet: the current list price
                    $p = $prices[$i['item']] ?? null;
                    if ($p && $p['rate'] > 0) { $rate = (float)$p['rate']; $gst = (float)$p['gst']; $lineEst = true; }
                }
                if ($rate !== null && $gst === null) $gst = ORD_GST_DEFAULT;
                $amt = $rate !== null ? round($rate * (isset($i['paid']) ? (int)$i['paid'] : (int)$i['ea']), 2) : null;   // the FOC EA are not billed
                $gAmt = $amt !== null ? round($amt * $gst / 100, 2) : null;
                if ($amt === null) $missing = true; else { $taxable += $amt; $gstAmt += $gAmt; }
                if ($lineEst) $est = true;
                $lines[] = ['item' => (string)$i['item'], 'ea' => (int)$i['ea'], 'vol' => (int)$i['vol'], 'foc' => (int)($i['foc_eff'] ?? 0), 'paid' => isset($i['paid']) ? (int)$i['paid'] : null, 'rate' => $rate, 'gst' => $gst, 'amount' => $amt, 'gst_amount' => $gAmt, 'est' => $lineEst];
            }
            $manual = $r['invoice_mode'] === 'manual';
            $invDate = '';
            if ($taxInv) $invDate = $manual ? $d10($files[$id]['invoice'] ?? '') : (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($ie['inv_date'] ?? '')) ? (string)$ie['inv_date'] : (string)$r['order_date']);
            $out[$id] = [
                'id' => $id, 'ref' => $r['order_ref'] ?: sprintf('RE-ORD-%06d', $id), 'date' => (string)$r['order_date'],
                'type' => $isInv ? 'HPCL order' : 'Rohan Energy order', 'status' => (string)$r['status'], 'stage' => $stage,
                'outlet' => (string)$r['outlet'], 'sap' => (string)$r['ro_code'], 'ro' => (string)$r['ro'], 'district' => (string)$r['district'], 'state' => (string)$r['state'],
                'sales_area' => (string)$r['sales_area'], 'zone' => (string)$r['zone'], 'address' => (string)$r['outlet_address'], 'gstin' => (string)$r['outlet_gstin'],
                'placed_by' => (string)$r['created_by_name'], 'placed_at' => (string)$r['created_at'], 'submitted_at' => (string)($r['submitted_at'] ?? ''),
                'decided_by' => (string)($r['decided_by_name'] ?? ''), 'decided_at' => (string)($r['decided_at'] ?? ''), 'comment' => (string)($r['review_comment'] ?? ''), 'remarks' => (string)($r['remarks'] ?? ''),
                'items' => $lines, 'ea' => (int)$r['total_ea'], 'litres' => (int)$r['total_vol'],
                'taxable' => $missing && !$lines ? 0.0 : round($taxable, 2), 'gst_amount' => round($gstAmt, 2), 'total' => round($taxable + $gstAmt, 2),
                'est' => $est, 'unpriced' => $missing,
                'so_no' => (string)($r['voucher_no'] ?? ''), 'inv_no' => $hideInv ? '' : (string)($r['invoice_no'] ?? ''), 'tax_inv' => $taxInv, 'inv_mode' => $taxInv ? ($manual ? 'Uploaded' : 'Generated') : '', 'inv_date' => $invDate,
                'receipt_at' => (string)($files[$id]['payment'] ?? ''), 'dispatch_at' => (string)($events[$id]['transit'] ?? ''),
                'pod_at' => (string)($files[$id]['pod'] ?? ''), 'delivered_at' => (string)($events[$id]['delivered'] ?? ($r['status'] === 'approved' && $r['delivery_stage'] === 'delivered' ? ($files[$id]['pod'] ?? '') : '')),
            ];
        }
    }
    return $out;
}

/** Regional Officer report. A Zone Officer (Rohan Energy or HPCL) gets one group - themselves and the Regional Officers they made; the Super Admin gets one group per Zone Officer.
 *  Per Regional Officer: orders handled (submitted ones - drafts are private; placed by them, decided by them, or - HPCL - Rohan orders in their region + sales areas), split into pending / approved (on the way) / completed (Proof of Delivery uploaded) / rejected,
 *  with the litres, the region and sales areas they handle, and the same split per sales area (SA). Optional ?from= & ?to= (order dates, YYYY-MM-DD). */
function ordRoReport(PDO $pdo, array $me): void {
    if ($me['kind'] !== 'admin' && $me['level'] !== 'zone') ordFail(403, 'The Regional Officer report is for Zone Officers and the Super Admin.');
    $users = usersLoad();
    $date = function (string $k): string {
        $v = (string)($_GET[$k] ?? '');
        return preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $v : '';
    };
    $from = $date('from'); $to = $date('to');

    $zoUsers = [];   // Zone Officers (username => data) that have a group in this report
    foreach ($users as $n => $u) {
        if (($u['role'] ?? '') !== 'zone' || !in_array($u['org'] ?? '', ['rohan', 'hpcl'], true) || ($u['level'] ?? '') === 'regional') continue;
        if ($me['kind'] === 'admin' && !empty($me['hsuper']) && !empty($me['ros'])) {   // an HPCL super admin made for some zones: the officers working in them
            $theirs = array_map('strval', (array)($u['ros'] ?? []));
            if (!$theirs) foreach (ordUserZones($u) as $zn) foreach (ordZoneRos($zn) as $r) $theirs[] = $r;
            if (!array_intersect($theirs, $me['ros'])) continue;
        }
        if (($me['kind'] === 'admin' && (empty($me['hsuper']) || ($u['org'] ?? '') === 'hpcl')) || (string)$n === $me['username']) $zoUsers[(string)$n] = $u;
    }
    $roUsers = [];   // Regional Officers (username => data) under those Zone Officers
    foreach ($users as $n => $u) {
        if (($u['level'] ?? '') === 'regional' && isset($zoUsers[(string)($u['created_by'] ?? '')])) $roUsers[(string)$n] = $u;
    }
    $names = array_merge(array_keys($zoUsers), array_keys($roUsers));

    // What an officer "handles":
    //  - a Zone Officer (the group head): only the orders they placed themselves;
    //  - a Regional Officer: the orders they placed, the orders they approved / rejected, and - for an HPCL Regional Officer - every Rohan order in their region + sales areas
    //    (so pending, approved and rejected ones all show under their name, whoever of the team acted on it).
    $isRo = array_fill_keys(array_keys($roUsers), true);
    $terr = [];   // HPCL Regional Officers: username => [zone, regions (upper), sales areas (comparable form)]
    foreach ($roUsers as $rn => $ru) {
        $zu = $zoUsers[(string)($ru['created_by'] ?? '')] ?? null;
        if (!$zu || ($zu['org'] ?? '') !== 'hpcl') continue;
        $up = fn($a) => array_values(array_filter(array_map(fn($x) => mb_strtoupper(trim((string)$x)), (array)$a), fn($x) => $x !== ''));
        $terr[(string)$rn] = ['zone' => (string)($ru['filter']['zone'] ?? $zu['filter']['zone'] ?? ''), 'ros' => $up($ru['ros'] ?? []), 'sas' => array_map('ordSaKey', (array)($ru['sales_areas'] ?? []))];
    }
    $agg = [];   // username => sales area (comparable form) => [region, bucket => n, vol, ...]
    $idsBy = []; // Regional Officer username => [order id => bucket]
    if ($names) {
        $ph = implode(',', array_fill(0, count($names), '?'));
        $sql = "SELECT id, created_by, decided_by, zone, ro, sales_area, doc_type, status, delivery_stage, total_vol, order_date, submitted_at
                FROM `" . ORD_T . "` WHERE status <> 'draft' AND created_by <> ? AND (created_by IN ($ph) OR decided_by IN ($ph)";
        $p = array_merge([ORD_HIST_USER], $names, $names);
        if ($terr) {
            $zs = array_values(array_unique(array_column($terr, 'zone')));
            $sql .= " OR (doc_type = 'so' AND zone IN (" . implode(',', array_fill(0, count($zs), '?')) . '))';
            $p = array_merge($p, $zs);
        }
        $sql .= ')';
        if ($from !== '') { $sql .= ' AND order_date >= ?'; $p[] = $from; }
        if ($to !== '')   { $sql .= ' AND order_date <= ?'; $p[] = $to; }
        $st = $pdo->prepare($sql);
        $st->execute($p);
        foreach ($st->fetchAll() as $r) {
            $b = $r['status'] === 'pending' ? 'pending' : ($r['status'] === 'rejected' ? 'rejected' : ($r['delivery_stage'] === 'delivered' ? 'completed' : 'transit'));
            $dk = ordSaKey((string)$r['sales_area']);
            $rk = mb_strtoupper(trim((string)$r['ro']));
            $owners = [];
            if (in_array((string)$r['created_by'], $names, true)) $owners[(string)$r['created_by']] = true;
            if (isset($isRo[(string)$r['decided_by']])) $owners[(string)$r['decided_by']] = true;
            if ($r['doc_type'] === 'so') foreach ($terr as $rn => $t) {
                if ($t['zone'] === (string)$r['zone'] && (!$t['ros'] || in_array($rk, $t['ros'], true)) && in_array($dk, $t['sas'], true)) $owners[(string)$rn] = true;
            }
            foreach (array_keys($owners) as $who) {
                if (isset($roUsers[$who])) $idsBy[$who][(int)$r['id']] = $b;   // the full detail of every order is listed under each Regional Officer
                $row = &$agg[$who][$dk];
                if (!isset($row)) $row = ['sales_area' => (string)$r['sales_area'], 'ro' => (string)$r['ro'], 'pending' => 0, 'transit' => 0, 'completed' => 0, 'rejected' => 0, 'litres' => 0, 'completed_litres' => 0, 'last' => '', 'oldest' => ''];
                $row[$b]++;
                $row['litres'] += (int)$r['total_vol'];
                if ($b === 'completed') $row['completed_litres'] += (int)$r['total_vol'];
                if ($r['order_date'] && $r['order_date'] > $row['last']) $row['last'] = (string)$r['order_date'];
                if ($b === 'pending' && $r['submitted_at'] && ($row['oldest'] === '' || $r['submitted_at'] < $row['oldest'])) $row['oldest'] = (string)$r['submitted_at'];
                unset($row);
            }
        }
    }
    $detail = ordRoReportOrders($pdo, array_keys(array_reduce($idsBy, fn($c, $m) => $c + $m, [])), ordHpclInvHidden($pdo, $me));   // order id => every detail of the order
    $sum = function (array $rows): array {
        $t = ['total' => 0, 'pending' => 0, 'transit' => 0, 'completed' => 0, 'rejected' => 0, 'litres' => 0, 'completed_litres' => 0, 'last' => '', 'oldest' => ''];
        foreach ($rows as $r) {
            foreach (['pending', 'transit', 'completed', 'rejected', 'litres', 'completed_litres'] as $k) $t[$k] += $r[$k];
            if ($r['last'] > $t['last']) $t['last'] = $r['last'];
            if ($r['oldest'] !== '' && ($t['oldest'] === '' || $r['oldest'] < $t['oldest'])) $t['oldest'] = $r['oldest'];
        }
        $t['total'] = $t['pending'] + $t['transit'] + $t['completed'] + $t['rejected'];
        return $t;
    };
    $saRows = function (string $uname, array $assigned) use ($agg, $sum): array {   // the sales areas they handle (even with no orders) plus any other sales area they ordered in
        $rows = $agg[$uname] ?? [];
        foreach ($assigned as $d) {
            $dk = ordSaKey((string)$d);
            if (!isset($rows[$dk])) $rows[$dk] = ['sales_area' => (string)$d, 'ro' => '', 'pending' => 0, 'transit' => 0, 'completed' => 0, 'rejected' => 0, 'litres' => 0, 'completed_litres' => 0, 'last' => '', 'oldest' => ''];
        }
        $out = [];
        foreach ($rows as $r) $out[] = ['sales_area' => $r['sales_area'], 'ro' => $r['ro']] + $sum([$r]);
        usort($out, fn($a, $b) => $b['total'] <=> $a['total'] ?: strcasecmp($a['sales_area'], $b['sales_area']));
        return $out;
    };

    $groups = [];
    foreach ($zoUsers as $zn => $zu) {
        $officers = [];
        foreach ($roUsers as $rn => $ru) {
            if (($ru['created_by'] ?? '') !== $zn) continue;
            $assigned = array_values(array_filter(array_map('strval', (array)($ru['sales_areas'] ?? [])), fn($d) => trim($d) !== ''));
            $dist = $saRows($rn, $assigned);
            $region = (string)(((array)($ru['ros'] ?? []))[0] ?? '');
            if ($region === '') foreach ($dist as $d) if ($d['ro'] !== '') { $region = $d['ro']; break; }
            $orders = [];
            foreach (array_keys($idsBy[$rn] ?? []) as $oid) if (isset($detail[$oid])) $orders[] = $detail[$oid];
            usort($orders, fn($a, $b) => strcmp($b['date'], $a['date']) ?: $b['id'] <=> $a['id']);
            $totals = $sum($agg[$rn] ?? []);
            $totals['amount'] = round(array_sum(array_column($orders, 'total')), 2);        // incl. GST
            $totals['taxable'] = round(array_sum(array_column($orders, 'taxable')), 2);     // before GST
            $officers[] = ['username' => $rn, 'label' => (string)($ru['label'] ?? $rn), 'region' => $region, 'sales_areas' => $assigned,
                           'totals' => $totals, 'by_sales_area' => $dist, 'orders' => $orders];
        }
        usort($officers, fn($a, $b) => $b['totals']['total'] <=> $a['totals']['total'] ?: strcasecmp($a['label'], $b['label']));
        $own = $sum($agg[$zn] ?? []);
        $all = $sum(array_map(fn($o) => $o['totals'], $officers));
        $sheetZs = array_values(array_filter(array_map('strval', (array)($zu['sheet_zones'] ?? [])), fn($x) => $x !== '')) ?: ((string)($zu['sheet_zone'] ?? '') !== '' ? [(string)$zu['sheet_zone']] : []);
        $groups[] = ['username' => $zn, 'label' => (string)($zu['label'] ?? $zn), 'org' => (string)$zu['org'], 'zone' => (string)(ordUserZones($zu)[0] ?? ''), 'zones' => ordUserZones($zu),
                     'sheet_zone' => implode(' + ', $sheetZs), 'sheet_zones' => $sheetZs, 'own' => $own, 'officers_total' => $all, 'officers' => $officers];
    }
    usort($groups, fn($a, $b) => strcmp($a['org'], $b['org']) ?: strcasecmp($a['zone'] . $a['label'], $b['zone'] . $b['label']));
    ordOut(['groups' => $groups, 'from' => $from, 'to' => $to]);
}

function ordList(PDO $pdo, array $me): void {
    [$scope, $sp] = ordScope($me);
    $where = [$scope];
    $params = $sp;

    $status = $_GET['status'] ?? '';
    if ($status !== '') {
        if (!in_array($status, ORD_STATUSES, true)) ordFail(400, 'Unknown status.');
        $where[] = 'o.status = ?'; $params[] = $status;
    }
    $zone = $_GET['zone'] ?? '';
    if ($zone !== '' && $me['kind'] === 'admin') {
        if (!isset(ORD_ZONES[$zone])) ordFail(400, 'Unknown zone.');
        $where[] = 'o.zone = ?'; $params[] = $zone;
    }
    // only the orders waiting for this user's decision (the "Pending Approvals" tab): Rohan's orders for HPCL and for the Rohan officers of the area / the Rohan super admin, HPCL's orders for the Rohan super admin
    if (!empty($_GET['awaiting'])) {
        [$wc, $wp] = ordAwaitCond($me);   // the people named for each order (see ordAwaitCond)
        $where[] = "($wc)"; foreach ($wp as $x) $params[] = $x;
    }
    $month = $_GET['month'] ?? '';
    if ($month !== '') {
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) ordFail(400, 'Invalid month.');
        $where[] = "DATE_FORMAT(o.order_date,'%Y-%m') = ?"; $params[] = $month;
    }
    foreach (['date_from' => '>=', 'date_to' => '<='] as $k => $op) {
        $d = $_GET[$k] ?? '';
        if ($d === '') continue;
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) ordFail(400, 'Invalid date.');
        $where[] = "o.order_date $op ?"; $params[] = $d;
    }
    $q = trim((string)($_GET['q'] ?? ''));
    if ($q !== '') {
        $like = '%' . addcslashes(mb_substr($q, 0, 60), '%_\\') . '%';
        $where[] = '(o.order_ref LIKE ? OR o.outlet LIKE ? OR o.ro_code LIKE ?)';
        array_push($params, $like, $like, $like);
    }
    // the newest first, for everybody (pending approvals included): a new order is on top, not at the bottom
    $order = $status === 'pending' ? 'o.submitted_at DESC, o.id DESC' : 'o.updated_at DESC, o.id DESC';

    $st = $pdo->prepare("SELECT " . ordSelect() . " FROM `" . ORD_T . "` o WHERE " . implode(' AND ', $where) . " ORDER BY $order LIMIT " . ($me['kind'] === 'admin' ? 3000 : 500));
    $st->execute($params);
    $rows = $st->fetchAll();
    $itemMap = ordItemsFor($pdo, array_map(fn($r) => (int)$r['id'], $rows));
    $out = array_map(fn($r) => ordFormat($r, $itemMap[(int)$r['id']] ?? []), $rows);
    ordRetAttach($pdo, $out);
    ordMarkDecidable($pdo, $me, $out);
    if (ordHpclInvHidden($pdo, $me)) foreach ($out as &$oo) ordHideInv($oo);
    unset($oo);
    ordOut(['orders' => $out]);
}

/** Latest activity (created / edited / submitted / approved / rejected) shown in the "Order history" section of the lists.
 *  Each employee sees only their own history: a Rohan officer the history of their own orders, an HPCL officer only what
 *  they did themselves (officers of the same zone never see each other's activity). The super admin sees everything. */
function ordHistory(PDO $pdo, array $me): void {
    [$scope, $sp] = ordScope($me);
    $own = '';
    if ($me['kind'] === 'hpcl') {
        $team = $me['team'] ?? [$me['username']];
        $own = ' AND e.username IN (' . implode(',', array_fill(0, count($team), '?')) . ')';
        foreach ($team as $t) $sp[] = $t;
    }
    $st = $pdo->prepare("SELECT e.order_id, o.order_ref, o.outlet, e.action, e.from_status, e.to_status, e.user_label, e.org, e.`comment`, e.created_at
        FROM `" . ORD_T_EVENT . "` e JOIN `" . ORD_T . "` o ON o.id = e.order_id
        WHERE $scope$own AND e.action IN ('created','edited','submitted','approved','rejected') ORDER BY e.created_at DESC, e.id DESC LIMIT " . ($me['kind'] === 'admin' ? 300 : 100));
    $st->execute($sp);
    $rows = $st->fetchAll();
    foreach ($rows as &$r) { $r['order_id'] = (int)$r['order_id']; $r['ref'] = $r['order_ref'] ?: sprintf('RE-ORD-%06d', $r['order_id']); unset($r['order_ref']); }
    ordOut(['events' => $rows]);
}

function ordGet(PDO $pdo, array $me): void {
    $id = (int)($_GET['id'] ?? 0);
    $o = $id ? ordLoad($pdo, $me, $id) : null;
    if (!$o) ordFail(404, 'Order not found.');
    if ($o['status'] === 'approved' && $o['created_by'] !== ORD_HIST_USER) {   // imported historical orders are left exactly as imported
        ordHealStages($pdo, $id);   // orders approved before delivery tracking existed
        ordFinalizeSO($pdo, $id);
        $o = ordLoad($pdo, $me, $id);
    }
    $o['events']    = ordEvents($pdo, $id);
    $o['pod']       = ordFileInfo($pdo, $id, 'pod');
    $o['receipt']   = ordFileInfo($pdo, $id, 'payment');
    $o['invoice_file'] = empty($o['inv_hidden']) ? ordFileInfo($pdo, $id, 'invoice') : null;
    $o['approvers'] = $o['doc_type'] === 'invoice' ? [] : ordApprovers($o['zone'], [$o['ro']], [(string)($o['sales_area'] ?? '')]);   // an order placed by HPCL is decided by the super admin
    ordOut(['order' => $o]);
}

/** Create or update an order (draft/rejected, or pending until HPCL decides — Rohan owner or super admin). With submit=true it is sent for approval in the same step. */
function ordSave(PDO $pdo, array $me, array $body): void {
    $id     = (int)($body['id'] ?? 0);
    // HPCL users (officers, outlets, the HPCL super admin) now also keep a DRAFT and submit it when it is ready (an order placed by HPCL has doc_type 'invoice').
    // A submitted HPCL order is final from their side (no later edit); a rejected one can be corrected and resubmitted.
    $isHp   = $me['kind'] === 'hpcl' || !empty($me['hsuper']);
    // The super admin may only correct an existing order that is still waiting (a Rohan Energy super admin may also place one of his own).
    if ($me['kind'] === 'admin') {
        if (!$id && !$isHp && !ordAdminPlaces($me)) ordFail(403, 'Only Rohan Energy or HPCL officers can create orders.');
    } elseif (!in_array($me['kind'], ['rohan', 'hpcl'], true)) ordFail(403, 'Only Rohan Energy or HPCL officers can create orders.');

    // Validation runs against the order owner's zone; the admin has none of their own, so use the order's.
    // The Rohan super admin's OWN orders (new, or his drafts / rejected / pending ones) behave like a Rohan officer's, for every zone.
    $vme = $me; $adminOwn = false;
    if ($isHp) {
        if (!empty($me['hsuper'])) $vme = ordHpclAs($me);   // the HPCL super admin: checked as an HPCL officer of every zone
    } elseif ($me['kind'] === 'admin') {
        if (!$id) { $adminOwn = true; $vme = ordAllZones($me); }
        else {
            $z = $pdo->prepare("SELECT zone, created_by, doc_type FROM `" . ORD_T . "` WHERE id = ?");
            $z->execute([$id]);
            $zr = $z->fetch();
            if (!$zr) ordFail(404, 'Order not found.');
            $adminOwn = ordAdminPlaces($me) && $zr['created_by'] === $me['username'] && $zr['doc_type'] !== 'invoice';
            if ($adminOwn) $vme = ordAllZones($me);
            else { $vme['zone'] = $zr['zone']; $vme['zones'] = [$zr['zone']]; $vme['ros'] = []; }
        }
    }
    // a super admin made for some states places orders only for the SAP numbers of those states (his own orders; he still corrects other people's pending orders wherever they are)
    if (!empty($me['ast']) && ($adminOwn || ($isHp && !empty($me['hsuper'])))) $vme['sapStates'] = array_values($me['ast']);
    $submit = !empty($body['submit']) && ($me['kind'] === 'rohan' || $adminOwn || $isHp);

    $pdo->beginTransaction();
    $now = date('Y-m-d H:i:s');
    $data = null;

    if ($id) {
        $st = $pdo->prepare("SELECT * FROM `" . ORD_T . "` WHERE id = ? FOR UPDATE");
        $st->execute([$id]);
        $cur = $st->fetch();
        $ownerOnly = $me['kind'] === 'rohan' || $isHp;   // an officer edits only what they placed themselves
        if (!$cur || ($ownerOnly && ($cur['created_by'] !== $me['username'] || ($me['kind'] !== 'admin' && !ordInZones($me, $cur['zone']))))) { $pdo->rollBack(); ordFail(404, 'Order not found.'); }
        if ($me['kind'] === 'admin' && !$isHp && !$adminOwn && $cur['doc_type'] === 'invoice' && !ordApprCovers($me, (string)$cur['state'])) { $pdo->rollBack(); ordFail(403, 'This order is outside the states you approve (' . implode(', ', $me['ast']) . ').'); }
        $editable = $isHp ? ['draft', 'rejected'] : (($me['kind'] === 'admin' && !$adminOwn) ? ['pending'] : ['draft', 'rejected', 'pending']);
        if (!in_array($cur['status'], $editable, true)) { $pdo->rollBack(); ordFail(409, 'This order can no longer be edited because it is ' . $cur['status'] . '.'); }
        $from = $cur['status'];
        $byHpclOrder = $cur['doc_type'] === 'invoice';
        // An order placed by HPCL has no minimum quantity, and the super admin who corrects it also sets the rate and GST % of each line.
        if ($me['kind'] === 'admin' && !$isHp && $byHpclOrder) { $vme['byHpcl'] = true; $vme['rates'] = true; }
        if ($me['kind'] === 'admin' && !$isHp) $vme['focEdit'] = true;   // the Edit form of the Rohan super admin has a FOC column
        // A pending order stays pending after an edit, so it is checked as strictly as a submission.
        // (ordValidate ends the request on errors; the open transaction is then rolled back by PDO.)
        // The order date is today's date when the order is created. Only the Rohan super admin, on an order of his own, may set another date; for everybody else it is never edited.
        if (!$adminOwn || ordStr($body['date'] ?? '', 10) === '') $body['date'] = substr((string)$cur['order_date'], 0, 10);
        $data = ordValidate($pdo, $body, $vme, $submit || $from === 'pending');
        $pdo->prepare("UPDATE `" . ORD_T . "` SET order_date=?, state=?, ro=?, ro_code=?, outlet=?, district=?, sales_area=?, outlet_address=?, outlet_phone=?, outlet_pincode=?, outlet_gstin=?, outlet_pan=?, invoice_name=?, invoice_address=?, invoice_state=?, invoice_pan=?, invoice_gstin=?, remarks=?, total_ea=?, total_vol=?, updated_at=? WHERE id=?")
            ->execute([$data['order_date'], $data['state'], $data['ro'], $data['ro_code'], $data['outlet'], $data['district'], $data['sales_area'], ...array_values($data['detail']), $data['remarks'], $data['total_ea'], $data['total_vol'], $now, $id]);
        // What changed, kept as lines of "Label: old → new" for the order's history section.
        $oldItems = [];
        $fmtRate = fn($r, $g) => $r === null ? '' : ' @ ₹' . number_format((float)$r, 2, '.', '') . ' + ' . rtrim(rtrim(number_format((float)$g, 2, '.', ''), '0'), '.') . '% GST';
        foreach (ordItemsFor($pdo, [$id])[$id] ?? [] as $i) {
            $ofoc = (int)($i['foc_eff'] ?? 0); $opaid = isset($i['paid']) ? (int)$i['paid'] : (int)$i['ea'] - $ofoc;
            $oldItems[] = $i['item'] . ' × ' . $opaid . ' EA' . ($ofoc > 0 ? ' + ' . $ofoc . ' FOC' : '') . $fmtRate($i['rate'] ?? null, $i['gst'] ?? null);
        }
        $newItems = array_map(fn($i) => $i['item'] . ' × ' . $i['paid'] . ' EA' . ((int)$i['foc'] > 0 ? ' + ' . (int)$i['foc'] . ' FOC' : '') . $fmtRate($i['rate'], $i['gst']), $data['items']);
        $chg = [];
        $pairs = ['Order date' => [$cur['order_date'], $data['order_date']], 'SAP code' => [$cur['ro_code'], $data['ro_code']],
                  'Outlet' => [$cur['outlet'], $data['outlet']], 'Remarks' => [(string)$cur['remarks'], (string)$data['remarks']],
                  'Items' => [implode('; ', $oldItems), implode('; ', $newItems)]];
        foreach ($pairs as $label => [$a, $b]) if ((string)$a !== (string)$b) $chg[] = $label . ': ' . ((string)$a === '' ? '—' : $a) . ' → ' . ((string)$b === '' ? '—' : $b);
        $pdo->prepare("DELETE FROM `" . ORD_T_ITEMS . "` WHERE order_id = ?")->execute([$id]);
        if ($from === 'pending' && !$byHpclOrder && !ordHasApprover($cur['zone'], [$data['ro']], [(string)$data['sales_area']])) {
            $pdo->rollBack();
            ordFail(409, 'No HPCL officer is mapped to the ' . $data['ro'] . ' region (' . $cur['zone'] . '), so this order cannot be moved there.');
        }
        ordLogEvent($pdo, $id, 'edited', $from, $from, $me, implode("\n", $chg) ?: 'Saved without changes');
    } else {
        $from = null;
        if (!$adminOwn || ordStr($body['date'] ?? '', 10) === '') $body['date'] = ordToday();   // a new order carries today's date whatever the browser sent - only the Rohan super admin may choose the date
        $data = ordValidate($pdo, $body, $vme, $submit);
        $id = ordInsertDraft($pdo, $me, $data, $now);
    }

    ordInsertItems($pdo, $id, $data['items']);

    if ($submit && $from !== 'pending') ordMoveToPending($pdo, $id, $from ?? 'draft', $me);
    $pdo->commit();

    ordOut(['order' => ordLoad($pdo, $me, $id), 'submitted' => $submit]);
}

/** Writes an HPCL officer's validated order straight to pending for the super admin; returns its id. The caller owns the transaction (also used by the bulk upload). */
function ordPlaceInsert(PDO $pdo, array $me, array $data, string $comment): int {
    $id = ordInsertDraft($pdo, $me, $data, date('Y-m-d H:i:s'), $comment);
    ordInsertItems($pdo, $id, $data['items']);
    $pdo->prepare("UPDATE `" . ORD_T . "` SET doc_token=?, doc_type='invoice', status='pending', submitted_at=NOW(), updated_at=NOW() WHERE id=?")
        ->execute([bin2hex(random_bytes(16)), $id]);
    ordLogEvent($pdo, $id, 'submitted', 'draft', 'pending', $me);
    return $id;
}

/** New draft order (header + 'created' event); returns its id. The caller adds the items and owns the transaction. */
function ordInsertDraft(PDO $pdo, array $me, array $data, string $now, ?string $comment = null): int {
    $pdo->prepare("INSERT INTO `" . ORD_T . "` (status, order_date, zone, state, ro, ro_code, outlet, district, sales_area, outlet_address, outlet_phone, outlet_pincode, outlet_gstin, outlet_pan, invoice_name, invoice_address, invoice_state, invoice_pan, invoice_gstin, remarks, total_ea, total_vol, created_by, created_by_name, created_at, updated_at) VALUES ('draft',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        ->execute([$data['order_date'], $data['zone'], $data['state'], $data['ro'], $data['ro_code'], $data['outlet'], $data['district'], $data['sales_area'], ...array_values($data['detail']), $data['remarks'], $data['total_ea'], $data['total_vol'], $me['username'], $me['label'], $now, $now]);
    $id = (int)$pdo->lastInsertId();
    $pdo->prepare("UPDATE `" . ORD_T . "` SET order_ref = ?, placed_role = ?, doc_type = ? WHERE id = ?")
        ->execute([sprintf('RE-ORD-%06d', $id), ordPlacerRole($me), ($me['kind'] === 'hpcl' || !empty($me['hsuper'])) ? 'invoice' : 'so', $id]);   // an order placed by HPCL is an 'invoice' order (Sales Order + Tax Invoice)
    ordLogEvent($pdo, $id, 'created', null, 'draft', $me, $comment);
    return $id;
}
function ordInsertItems(PDO $pdo, int $id, array $items): void {
    $ins = $pdo->prepare("INSERT INTO `" . ORD_T_ITEMS . "` (order_id, item, ea, vol, rate, gst, foc, paid) VALUES (?,?,?,?,?,?,?,?)");
    // ea = paid + foc (the FOC is fixed on the line when it is saved); rate / GST % only when the super admin set them on an order placed by HPCL
    foreach ($items as $it) $ins->execute([$id, $it['item'], $it['ea'], $it['vol'], $it['rate'] ?? null, $it['gst'] ?? null, (int)($it['foc'] ?? 0), $it['paid'] ?? $it['ea']]);
}

function ordMoveToPending(PDO $pdo, int $id, string $from, array $me): void {
    $r = $pdo->prepare("SELECT ro, sales_area, zone FROM `" . ORD_T . "` WHERE id = ?");
    $r->execute([$id]);
    $rd = $r->fetch();
    $ro = (string)($rd['ro'] ?? '');
    if (!ordHasApprover((string)($rd['zone'] ?? $me['zone']), [$ro], [(string)($rd['sales_area'] ?? '')])) {
        $pdo->rollBack();
        ordFail(409, 'No HPCL officer is mapped to the ' . $ro . ' region (' . ($rd['zone'] ?? $me['zone']) . ')' . (!empty($rd['sales_area']) ? ', ' . $rd['sales_area'] . ' sales area,' : '') . ' yet, so this order cannot be submitted. Please contact the administrator.');
    }
    $u =$pdo->prepare("UPDATE `" . ORD_T . "` SET status='pending', submitted_at=NOW(), updated_at=NOW(), decided_by=NULL, decided_by_name=NULL, decided_at=NULL, doc_token = IF(doc_type = 'invoice' AND (doc_token IS NULL OR doc_token = ''), ?, doc_token) WHERE id=? AND status IN ('draft','rejected')");
    $u->execute([bin2hex(random_bytes(16)), $id]);
    if ($u->rowCount() !== 1) { $pdo->rollBack(); ordFail(409, 'This order has already been submitted.'); }
    ordLogEvent($pdo, $id, 'submitted', $from, 'pending', $me);
}

function ordSubmit(PDO $pdo, array $me, array $body): void {
    $isHp = $me['kind'] === 'hpcl' || !empty($me['hsuper']);
    if ($me['kind'] !== 'rohan' && !$isHp && !ordAdminPlaces($me)) ordFail(403, 'Only Rohan Energy or HPCL officers can submit orders.');
    $id = (int)($body['id'] ?? 0);
    $pdo->beginTransaction();
    $st = $pdo->prepare("SELECT * FROM `" . ORD_T . "` WHERE id = ? FOR UPDATE");
    $st->execute([$id]);
    $cur = $st->fetch();
    if (!$cur || $cur['created_by'] !== $me['username'] || (($me['kind'] === 'rohan' || $isHp) && $me['kind'] !== 'admin' && !ordInZones($me, $cur['zone']))) { $pdo->rollBack(); ordFail(404, 'Order not found.'); }
    if (!in_array($cur['status'], ['draft', 'rejected'], true)) { $pdo->rollBack(); ordFail(409, 'This order has already been submitted.'); }
    $n = $pdo->prepare("SELECT COUNT(*) FROM `" . ORD_T_ITEMS . "` WHERE order_id = ?");
    $n->execute([$id]);
    if ((int)$n->fetchColumn() < 1) { $pdo->rollBack(); ordFail(422, 'Add at least one item before submitting.'); }
    $min = ordMinOrder($pdo)['ea'];
    if ($min > 0 && (int)$cur['total_ea'] < $min) { $pdo->rollBack(); ordFail(422, ordMinOrderMsg($min, (int)$cur['total_ea'])); }
    $nm = $pdo->prepare("SELECT item, ea FROM `" . ORD_T_ITEMS . "` WHERE order_id = ?");
    $nm->execute([$id]);
    $lines = $nm->fetchAll();
    // the available quantity may have been lowered since the draft was saved
    $stock = array_column(ordStock($pdo), 'ea', 'item');
    foreach ($lines as $l) {
        $avail = $stock[$l['item']] ?? null;
        if ($avail !== null && (int)$l['ea'] > $avail) { $pdo->rollBack(); ordFail(422, 'Only ' . number_format($avail) . ' EA of ' . $l['item'] . ' is available now. Edit the order and reduce the quantity.'); }
    }
    if ($miss = ordMissingPrices($pdo, array_column($lines, 'item'))) { $pdo->rollBack(); ordFail(422, ordMissingPricesMsg($miss, $isHp)); }
    if ($isHp && !ordSuperApprovers((string)$cur['state'], false)) { $pdo->rollBack(); ordFail(422, 'No Rohan Energy super admin is set to approve the orders of ' . ($cur['state'] !== '' ? $cur['state'] : 'this outlet') . ', so this order cannot be submitted. Please contact the administrator.'); }
    ordMoveToPending($pdo, $id, $cur['status'], $me);
    $pdo->commit();
    ordOut(['order' => ordLoad($pdo, $me, $id)]);
}

/* ── bulk orders (Excel upload) ───────────────────────────────────────────────
 * The browser reads the sheet and sends its rows; everything is checked again here, exactly like a typed order: the SAP code
 * decides outlet / zone / address (the sheet's other columns are ignored), the brand decides the item, ORDER Qty + FOC Qty is
 * the quantity (20 L each). One order is made per outlet and date; rows for the same outlet and date become items of that order.
 * mode: preview (check only) | draft (create drafts) | submit (create and send for approval).
 * A Rohan order below the minimum quantity is still created, as a draft, and reported.
 * HPCL officers can upload too (mode: preview | submit only). An HPCL order has no draft stage - it goes straight to the super admin - so there the
 * minimum quantity and the prices are enforced per order: an order that does not meet them is not created and its rows are reported. */
function ordBulkBrand(string $b): ?string {
    $k = trim(preg_replace('/[^A-Z0-9]+/', ' ', strtoupper($b)));
    if (in_array($k, ['TATA', 'TATA HP', 'TATA MOTORS HP', 'TATA MOTORS HP GENUINE DEF 20L'], true)) return 'TATA MOTORS HP GENUINE DEF 20L';
    if (in_array($k, ['HP DEF', 'HPDEF', 'HP DEF 1X20L', 'HP DEF 20L'], true)) return 'HP DEF - 1X20L';
    return null;
}
function ordBulkInt($v, int $min, int $max): ?int {
    if (is_string($v)) $v = trim($v);
    if (!is_numeric($v) || (float)$v != floor((float)$v) || (float)$v < $min || (float)$v > $max) return null;
    return (int)$v;
}
function ordBulkName(string $s): string { return preg_replace('/^(MS|M S)/', '', preg_replace('/[^A-Z0-9]+/', '', strtoupper($s))); }

function ordBulk(PDO $pdo, array $me, array $body): void {
    if ($me['kind'] !== 'rohan' && $me['kind'] !== 'hpcl') ordFail(403, 'Only Rohan Energy or HPCL officers can create orders.');
    $byH = $me['kind'] === 'hpcl';
    $mode = (string)($body['mode'] ?? 'preview');
    if (!in_array($mode, $byH ? ['preview', 'submit'] : ['preview', 'draft', 'submit'], true)) ordFail(400, 'Unknown mode.');
    $rows = $body['rows'] ?? null;
    if (!is_array($rows) || !$rows) ordFail(422, 'The sheet has no order rows.');
    if (count($rows) > ORD_BULK_MAX) ordFail(422, 'A bulk upload can have at most ' . ORD_BULK_MAX . ' rows; this sheet has ' . count($rows) . '. Please split it.');
    if (ordOutletCount($pdo) === 0) ordFail(409, 'The outlet list has not been loaded yet. Please contact the administrator.');
    $min = ordMinOrder($pdo)['ea'];
    $today = date('Y-m-d');

    $bad = [];      // row errors: ['row','sap_code','name','error']
    $badKeys = [];  // outlet+date combinations that have a row with a problem (their other rows are held back too)
    $groups = [];   // key => ['sap','date','name','rows','items'=>[item=>ea],'foc'=>[item=>foc]]
    $seen = [];
    foreach (array_values($rows) as $i => $r) {
        if (!is_array($r)) continue;
        $n    = ordBulkInt($r['row'] ?? null, 1, 1000000) ?? ($i + 2);
        $sap  = preg_replace('/\.0+$/', '', ordStr($r['sap_code'] ?? '', 14));
        $date = ordStr($r['date'] ?? '', 10);
        $name = ordStr($r['name'] ?? '', 150);
        $brandRaw = ordStr($r['brand'] ?? '', 80);
        $why = [];

        if (!preg_match('/^\d{6,12}$/', $sap)) { $why[] = 'SAP code is missing or not valid.'; $sap = ''; }
        $d = DateTime::createFromFormat('Y-m-d', $date);
        if (!$d || $d->format('Y-m-d') !== $date) { $why[] = 'PO date is missing or not a valid date.'; $date = ''; }
        elseif ($date > $today) $why[] = 'PO date cannot be in the future.';
        $item = ordBulkBrand($brandRaw);
        if (!$item) $why[] = $brandRaw === '' ? 'Brand is missing (TATA HP or HP DEF).' : "Brand \"$brandRaw\" is not recognised (use TATA HP or HP DEF).";
        $pack = $r['pack'] ?? null;
        if ($pack !== null && trim((string)$pack) !== '' && ordBulkInt($pack, ORD_L_PER_EA, ORD_L_PER_EA) === null) $why[] = 'Pack size must be ' . ORD_L_PER_EA . ' litres.';
        $qty = ordBulkInt($r['qty'] ?? null, 1, ORD_MAX_EA);
        if ($qty === null) $why[] = 'ORDER Qty must be a whole number of at least 1.';
        $focRaw = $r['foc'] ?? null;
        $foc = ($focRaw === null || trim((string)$focRaw) === '') ? 0 : ordBulkInt($focRaw, 0, ORD_MAX_EA);
        if ($foc === null) $why[] = 'FOC Qty must be a whole number (0 or more).';
        if ($qty !== null && $foc !== null && $qty + $foc > ORD_MAX_EA) $why[] = 'Quantity is too large.';
        if ($sap && $date && $item) {
            $k = "$sap|$date|$item";
            if (isset($seen[$k])) $why[] = 'Duplicate of row ' . $seen[$k] . ' (same outlet, date and brand).';
            else $seen[$k] = $n;
        }

        if ($why) {
            $bad[] = ['row' => $n, 'sap_code' => $sap, 'name' => $name, 'error' => implode(' ', $why)];
            if ($sap && $date) $badKeys["$sap|$date"] = true;
            continue;
        }
        $key = "$sap|$date";
        if (!isset($groups[$key])) $groups[$key] = ['sap' => $sap, 'date' => $date, 'name' => $name, 'rows' => [], 'items' => [], 'foc' => []];
        $groups[$key]['rows'][] = $n;
        $groups[$key]['items'][$item] = $qty;   // the quantity ordered (billed); the FOC - the sheet's FOC Qty, else what the FOC list gives - comes on top
        $groups[$key]['foc'][$item] = $foc;
    }

    // one order per outlet + date
    $cands = [];
    foreach ($groups as $key => $g) {
        if (isset($badKeys[$key])) {
            foreach ($g['rows'] as $n) $bad[] = ['row' => $n, 'sap_code' => $g['sap'], 'name' => $g['name'], 'error' => 'Not created: another row for this outlet and date has a problem.'];
            continue;
        }
        $items = [];
        foreach ($g['items'] as $it => $ea) $items[] = ['item' => $it, 'ea' => $ea];
        [$data, $errors] = ordCheck($pdo, ['date' => $g['date'], 'sap_code' => $g['sap'], 'remarks' => 'Bulk upload.', 'items' => $items], $me, $byH, $g['foc']);   // HPCL: no drafts, so the minimum quantity and prices are checked now
        if ($errors) {
            foreach ($g['rows'] as $n) $bad[] = ['row' => $n, 'sap_code' => $g['sap'], 'name' => $g['name'], 'error' => implode(' ', array_values($errors))];
            continue;
        }
        $focTotal = array_sum(array_column($data['items'], 'foc'));
        $ex = $pdo->prepare("SELECT order_ref, id FROM `" . ORD_T . "` WHERE created_by = ? AND ro_code = ? AND order_date = ? ORDER BY id DESC LIMIT 1");
        $ex->execute([$me['username'], $g['sap'], $g['date']]);
        $old = $ex->fetch();
        $ns = ordBulkName($g['name']); $no = ordBulkName($data['outlet']);
        $differs = $ns !== '' && $no !== '' && strpos($ns, $no) === false && strpos($no, $ns) === false;
        if ($differs) { similar_text($ns, $no, $pct); $differs = $pct < 60; }
        $cands[] = [
            'rows' => $g['rows'], 'sap_code' => $g['sap'], 'sheet_name' => $g['name'], 'outlet' => $data['outlet'], 'date' => $g['date'],
            'items' => $data['items'], 'foc' => $focTotal, 'total_ea' => $data['total_ea'], 'total_vol' => $data['total_vol'],
            'below_min' => $min > 0 && $data['total_ea'] < $min, 'name_differs' => $differs,
            'existing_ref' => $old ? ($old['order_ref'] ?: sprintf('RE-ORD-%06d', $old['id'])) : null,
            '_data' => $data,
        ];
    }

    $created = $submitted = 0;
    if ($mode !== 'preview' && $cands) {
        if (!$byH && $mode === 'submit' && ($miss = ordMissingPrices($pdo, array_values(ordItems($pdo))))) ordFail(422, ordMissingPricesMsg($miss));
        if (!$byH && $mode === 'submit' && !ordHasApprover($me['zones'], $me['ros'], ($me['sales_areas'] ?? []) ?: null)) ordFail(409, 'No HPCL officer is mapped to ' . implode(' / ', $me['zones']) . ' yet, so orders cannot be submitted. Please contact the administrator.');
        foreach ($cands as &$c) {
            try {
                if ($byH) {   // placed at once for the super admin; an order whose stock earlier orders of this upload used up is not placed
                    $left = array_column(ordStock($pdo), 'ea', 'item');
                    $short = '';
                    foreach ($c['_data']['items'] as $l) { $av = $left[$l['item']] ?? null; if ($av !== null && $l['ea'] > $av) { $short = 'Not placed: only ' . number_format($av) . ' EA of ' . $l['item'] . ' is available now.'; break; } }
                    if ($short !== '') {
                        $c['status'] = 'failed';
                        foreach ($c['rows'] as $n) $bad[] = ['row' => $n, 'sap_code' => $c['sap_code'], 'name' => $c['sheet_name'], 'error' => $short];
                        continue;
                    }
                    $pdo->beginTransaction();
                    $id = ordPlaceInsert($pdo, $me, $c['_data'], 'Order placed by HPCL (bulk upload)');
                    $pdo->commit();
                    $c['id'] = $id; $c['ref'] = sprintf('RE-ORD-%06d', $id); $c['status'] = 'pending';
                    $created++; $submitted++;
                    continue;
                }
                $pdo->beginTransaction();
                $id = ordInsertDraft($pdo, $me, $c['_data'], date('Y-m-d H:i:s'), 'Bulk upload');
                ordInsertItems($pdo, $id, $c['_data']['items']);
                $final = 'draft';
                $short = '';   // earlier orders of this same upload may have used the stock up: such an order stays a draft
                if ($mode === 'submit' && !$c['below_min']) {
                    $left = array_column(ordStock($pdo), 'ea', 'item');
                    foreach ($c['_data']['items'] as $l) { $av = $left[$l['item']] ?? null; if ($av !== null && $l['ea'] > $av) { $short = 'Only ' . number_format($av) . ' EA of ' . $l['item'] . ' is available now, so this order was kept as a draft.'; break; } }
                    // no HPCL officer covers this order's region / sales area: keep it as a draft (and say so) instead of stopping the whole upload
                    if ($short === '' && !ordHasApprover($c['_data']['zone'], [$c['_data']['ro']], [(string)$c['_data']['sales_area']])) $short = 'No HPCL officer covers the ' . $c['_data']['ro'] . ' region, ' . ($c['_data']['sales_area'] ?: 'no') . ' sales area, so this order was kept as a draft.';
                    if ($short === '') { ordMoveToPending($pdo, $id, 'draft', $me); $final = 'pending'; }
                }
                $pdo->commit();
                if ($short !== '') foreach ($c['rows'] as $n) $bad[] = ['row' => $n, 'sap_code' => $c['sap_code'], 'name' => $c['sheet_name'], 'error' => $short];
                $c['id'] = $id; $c['ref'] = sprintf('RE-ORD-%06d', $id); $c['status'] = $final;
                $created++; if ($final === 'pending') $submitted++;
            } catch (Exception $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                error_log('orders.php bulk: ' . $e->getMessage());
                $c['status'] = 'failed';
                foreach ($c['rows'] as $n) $bad[] = ['row' => $n, 'sap_code' => $c['sap_code'], 'name' => $c['sheet_name'], 'error' => 'Could not be created (server error). Please try again.'];
            }
        }
        unset($c);
    }
    foreach ($cands as &$c) unset($c['_data']);
    unset($c);
    usort($bad, fn($a, $b) => $a['row'] <=> $b['row']);
    ordOut(['mode' => $mode, 'orders' => $cands, 'errors' => $bad, 'min' => $min, 'created' => $created, 'submitted' => $submitted]);
}

function ordDelete(PDO $pdo, array $me, array $body): void {
    if ($me['kind'] !== 'rohan' && $me['kind'] !== 'hpcl' && empty($me['hsuper']) && !ordAdminPlaces($me)) ordFail(403, 'Only the officer who created a draft can delete it.');
    $id = (int)($body['id'] ?? 0);
    $zs = $me['kind'] === 'admin' ? array_keys(ORD_ZONES) : ($me['zones'] ?? [$me['zone']]);
    $d = $pdo->prepare("DELETE FROM `" . ORD_T . "` WHERE id = ? AND created_by = ? AND zone IN (" . implode(',', array_fill(0, count($zs), '?')) . ") AND status = 'draft'");
    $d->execute(array_merge([$id, $me['username']], $zs));
    if ($d->rowCount() !== 1) ordFail(409, 'Only your own draft orders can be deleted.');
    ordOut([]);
}

// ── returns of completed orders ──────────────────────────────────────────────
// Anyone who can see a completed order (Super Admin, Zone Officer, Regional Officer / outlet - Rohan Energy or HPCL) asks for its return with a reason and a credit note.
// The request waits for the people the Super Admin picked on the Permissions page (organisation x level; standard: the Rohan Energy super admin), who decide it
// for the orders of their own zone / regions. An approved return is recorded on the order; it does not change the stock, the MIS or the invoice figures.
/** [organisation, level] of this user as used by the return-approval permissions: rohan|hpcl x admin|zone|regional. */
function ordRetWho(array $me): array {
    $org = $me['kind'] === 'admin' ? (!empty($me['hsuper']) ? 'hpcl' : 'rohan') : $me['kind'];
    $level = $me['kind'] === 'admin' ? 'admin' : (($me['level'] ?? 'zone') === 'regional' ? 'regional' : 'zone');
    return [$org, $level];
}
function ordRetMayDecide(PDO $pdo, array $me): bool {
    [$org, $level] = ordRetWho($me);
    return !empty(ordPerms($pdo)["ret_{$org}_{$level}"]);
}
/** Put the latest return request of each order on it ('ret' = null when there is none). */
function ordRetAttach(PDO $pdo, array &$orders): void {
    $ids = array_map(fn($o) => (int)$o['id'], $orders);
    $map = [];
    if ($ids) {
        $st = $pdo->prepare("SELECT * FROM `" . ORD_T_RET . "` WHERE order_id IN (" . implode(',', array_fill(0, count($ids), '?')) . ") ORDER BY id ASC");
        $st->execute($ids);
        foreach ($st->fetchAll() as $r) $map[(int)$r['order_id']] = ordRetRow($r);   // the newest one wins
    }
    foreach ($orders as &$o) $o['ret'] = $map[(int)$o['id']] ?? null;
}
function ordRetRow(array $r): array {
    return ['id' => (int)$r['id'], 'order_id' => (int)$r['order_id'], 'status' => (string)$r['status'], 'reason' => (string)$r['reason'], 'credit_note' => (string)$r['credit_note'],
            'requested_by' => (string)$r['requested_by'], 'requested_by_name' => (string)$r['requested_by_name'], 'requested_org' => (string)$r['requested_org'], 'requested_at' => $r['requested_at'],
            'decided_by_name' => $r['decided_by_name'], 'decided_org' => $r['decided_org'], 'decided_at' => $r['decided_at'], 'decision_comment' => $r['decision_comment']];
}
/** Which pending returns may this user decide? SQL fragment (alias o = the order, r = the return) + params; never their own request unless they are a super admin. */
function ordRetDecidable(array $me): array {
    $sql = " AND r.status = 'pending'";
    $p = [];
    if ($me['kind'] !== 'admin') { $sql .= ' AND r.requested_by <> ?'; $p[] = $me['username']; }
    else { [$apSql, $apP] = ordApprSql($me); if ($apSql !== '') { $sql .= $apSql; $p = array_merge($p, $apP); } }   // a super admin made for some states decides those states only
    return [$sql, $p];
}
function ordRetMeta(PDO $pdo, array $me): array {
    $may = ordRetMayDecide($pdo, $me);
    $n = 0;
    if ($may) {
        [$scope, $sp] = ordScope($me);
        [$dSql, $dP] = ordRetDecidable($me);
        $st = $pdo->prepare("SELECT COUNT(*) FROM `" . ORD_T_RET . "` r JOIN `" . ORD_T . "` o ON o.id = r.order_id WHERE $scope$dSql");
        $st->execute(array_merge($sp, $dP));
        $n = (int)$st->fetchColumn();
    }
    return ['can_decide' => $may, 'awaiting' => $n];
}
/** A completed order's return request: any user who sees the order. Reason and credit note are required. */
function ordRetRequest(PDO $pdo, array $me, array $body): void {
    $id = (int)($body['id'] ?? 0);
    $reason = ordStr($body['reason'] ?? '', 500);
    $cn = ordStr($body['credit_note'] ?? '', 200);
    $fields = [];
    if (mb_strlen($reason) < 3) $fields['reason'] = 'Enter the reason for the return.';
    if ($cn === '') $fields['credit_note'] = 'Enter the credit note (number or details).';
    if ($fields) { http_response_code(422); echo json_encode(['ok' => false, 'error' => 'Please fix the highlighted fields.', 'fields' => $fields]); exit; }
    $o = $id ? ordLoad($pdo, $me, $id) : null;
    if (!$o) ordFail(404, 'Order not found.');
    if ($o['status'] !== 'approved' || $o['delivery_stage'] !== 'delivered') ordFail(409, 'A return can be requested only for a completed order (delivery confirmed).');
    $pdo->beginTransaction();
    $st = $pdo->prepare("SELECT status FROM `" . ORD_T_RET . "` WHERE order_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE");
    $st->execute([$id]);
    $last = $st->fetchColumn();
    if ($last === 'pending')  { $pdo->rollBack(); ordFail(409, 'A return request for this order is already waiting for approval.'); }
    if ($last === 'approved') { $pdo->rollBack(); ordFail(409, 'This order has already been returned.'); }
    [$org] = ordRetWho($me);
    $pdo->prepare("INSERT INTO `" . ORD_T_RET . "` (order_id, status, reason, credit_note, requested_by, requested_by_name, requested_org, requested_at) VALUES (?, 'pending', ?, ?, ?, ?, ?, NOW())")
        ->execute([$id, $reason, $cn, $me['username'], $me['label'], $org]);
    ordLogEvent($pdo, $id, 'return_requested', 'approved', 'approved', $me, $reason . "\nCredit note: " . $cn);
    $pdo->commit();
    $list = [$o]; ordRetAttach($pdo, $list);
    ordOut(['order' => $list[0], 'ret' => $list[0]['ret']]);
}
/** The Returns page: return requests of the orders this user sees (newest first, pending ones on top), with whether they may decide each. */
function ordRetList(PDO $pdo, array $me): void {
    [$scope, $sp] = ordScope($me);
    $where = [$scope]; $params = $sp;
    $status = (string)($_GET['status'] ?? '');
    if ($status !== '') {
        if (!in_array($status, ['pending', 'approved', 'rejected'], true)) ordFail(400, 'Unknown status.');
        $where[] = 'r.status = ?'; $params[] = $status;
    }
    $q = trim((string)($_GET['q'] ?? ''));
    if ($q !== '') {
        $like = '%' . addcslashes(mb_substr($q, 0, 60), '%_\\') . '%';
        $where[] = '(o.order_ref LIKE ? OR o.outlet LIKE ? OR o.ro_code LIKE ? OR r.credit_note LIKE ?)';
        array_push($params, $like, $like, $like, $like);
    }
    $may = ordRetMayDecide($pdo, $me);
    $st = $pdo->prepare("SELECT r.*, o.order_ref, o.outlet, o.ro_code, o.zone, o.ro, o.state, o.sales_area, o.total_ea, o.total_vol, o.order_date
        FROM `" . ORD_T_RET . "` r JOIN `" . ORD_T . "` o ON o.id = r.order_id WHERE " . implode(' AND ', $where) . "
        ORDER BY (r.status = 'pending') DESC, r.requested_at DESC, r.id DESC LIMIT 500");
    $st->execute($params);
    $out = [];
    foreach ($st->fetchAll() as $r) {
        $row = ordRetRow($r);
        $row['ref'] = $r['order_ref'] ?: sprintf('RE-ORD-%06d', (int)$r['order_id']);
        foreach (['outlet', 'ro_code', 'zone', 'ro', 'state', 'sales_area', 'order_date'] as $k) $row[$k] = $r[$k];
        $row['total_ea'] = (int)$r['total_ea']; $row['total_vol'] = (int)$r['total_vol'];
        $row['can_decide'] = $may && $r['status'] === 'pending' && ($me['kind'] === 'admin' ? ordApprCovers($me, (string)$r['state']) : $r['requested_by'] !== $me['username']);
        $out[] = $row;
    }
    ordOut(['returns' => $out, 'can_decide' => $may]);
}
/** Approve or reject a return request (the people allowed on the Permissions page, for the orders of their own zone / regions). A rejection needs a reason. */
function ordRetDecide(PDO $pdo, array $me, array $body): void {
    $rid = (int)($body['rid'] ?? 0);
    $approve = !empty($body['approve']);
    $comment = ordStr($body['comment'] ?? '', 500);
    if (!ordRetMayDecide($pdo, $me)) ordFail(403, 'You are not allowed to approve returns. The Super Admin sets who can on the Permissions page.');
    if (!$approve && $comment === '') ordFail(422, 'Please enter a reason for rejecting this return.');
    $pdo->beginTransaction();
    $st = $pdo->prepare("SELECT * FROM `" . ORD_T_RET . "` WHERE id = ? FOR UPDATE");
    $st->execute([$rid]);
    $r = $st->fetch();
    $o = $r ? ordLoad($pdo, $me, (int)$r['order_id']) : null;   // only a return of an order this user may see
    if (!$r || !$o) { $pdo->rollBack(); ordFail(404, 'Return request not found.'); }
    if ($r['status'] !== 'pending') { $pdo->rollBack(); ordFail(409, 'This return has already been ' . $r['status'] . '.'); }
    if ($me['kind'] !== 'admin' && $r['requested_by'] === $me['username']) { $pdo->rollBack(); ordFail(403, 'Your own return request is decided by somebody else.'); }
    if ($me['kind'] === 'admin' && !ordApprCovers($me, (string)$o['state'])) { $pdo->rollBack(); ordFail(403, 'This order is outside the states you approve (' . implode(', ', $me['ast']) . ').'); }
    [$org] = ordRetWho($me);
    $to = $approve ? 'approved' : 'rejected';
    $pdo->prepare("UPDATE `" . ORD_T_RET . "` SET status = ?, decided_by = ?, decided_by_name = ?, decided_org = ?, decided_at = NOW(), decision_comment = ? WHERE id = ? AND status = 'pending'")
        ->execute([$to, $me['username'], $me['label'], $org, $comment !== '' ? $comment : null, $rid]);
    ordLogEvent($pdo, (int)$r['order_id'], $approve ? 'return_approved' : 'return_rejected', 'approved', 'approved', $me, $comment !== '' ? $comment : null);
    $pdo->commit();
    $st = $pdo->prepare("SELECT * FROM `" . ORD_T_RET . "` WHERE id = ?");
    $st->execute([$rid]);
    ordOut(['ret' => ordRetRow($st->fetch())]);
}

function ordDecide(PDO $pdo, array $me, array $body, bool $approve): void {
    // Who decides which order depends on who placed it (ordAwaitCond): any one of the people named for it, the first to act.
    if (!in_array($me['kind'], ['hpcl', 'rohan', 'admin'], true)) ordFail(403, 'Only the officers of the zone or the super admin can approve or reject orders.');
    $id      = (int)($body['id'] ?? 0);
    $comment = ordStr($body['comment'] ?? '', 500);
    if (!$approve && $comment === '') ordFail(422, 'Please enter a reason for rejecting this order.');

    $pdo->beginTransaction();
    // the orders this user may see (zone / regions / sales areas / SAP number) ...
    [$rsc, $rsp] = ordScope($me);
    $st = $pdo->prepare("SELECT o.* FROM `" . ORD_T . "` o WHERE o.id = ? AND ($rsc) FOR UPDATE");
    $st->execute(array_merge([$id], $rsp));
    $cur = $st->fetch();
    if (!$cur) { $pdo->rollBack(); ordFail(404, 'Order not found.'); }
    if ($cur['status'] !== 'pending') { $pdo->rollBack(); ordFail(409, 'This order is no longer pending (it is ' . $cur['status'] . ').'); }
    // ... and, of those, the ones the people named for the order decide (ordAwaitCond)
    [$wc, $wp] = ordAwaitCond($me);
    $ck = $pdo->prepare("SELECT 1 FROM `" . ORD_T . "` o WHERE o.id = ? AND ($wc)");
    $ck->execute(array_merge([$id], $wp));
    if (!$ck->fetchColumn()) {
        $pdo->rollBack();
        if ($me['kind'] === 'admin' && !ordApprCovers($me, (string)$cur['state'])) ordFail(403, 'This order is outside the states you approve (' . implode(', ', $me['ast']) . ').');
        ordFail(403, 'This order is not waiting for your approval. It is decided by: ' . ordApproverText($cur['placed_role'], (string)$cur['doc_type']) . '.');
    }

    // The order may have been edited while this officer had it open: make them look at the new version first.
    $seen = (string)($body['seen_updated_at'] ?? '');
    if ($seen !== '' && $seen !== (string)$cur['updated_at']) { $pdo->rollBack(); ordFail(409, 'This order was edited after you opened it. Please review the updated order and try again.'); }

    // Stock is used up when an order is APPROVED (not when it is submitted), so this is where it must still be there for the quantity.
    // The stock rows are locked first so two approvals at the same moment cannot both take the last quantity.
    if ($approve) {
        $pdo->query("SELECT skey FROM `" . ORD_T_SET . "` WHERE skey LIKE 'stock\\_%' FOR UPDATE")->fetchAll();
        $left = array_column(ordStock($pdo, $id), 'ea', 'item');
        foreach (ordItemsFor($pdo, [$id])[$id] ?? [] as $l) {
            $av = $left[$l['item']] ?? null;
            if ($av !== null && (int)$l['ea'] > $av) { $pdo->rollBack(); ordFail(409, 'Cannot approve: only ' . number_format($av) . ' EA of ' . $l['item'] . ' is available, but this order has ' . number_format((int)$l['ea']) . ' EA. Ask the Super Admin to update the available quantity, or reject / reduce the order.'); }
        }
    }

    $to = $approve ? 'approved' : 'rejected';
    $pdo->prepare("UPDATE `" . ORD_T . "` SET status=?, delivery_stage=?, decided_by=?, decided_by_name=?, decided_at=NOW(), review_comment=?, updated_at=NOW() WHERE id=? AND status='pending'")
        ->execute([$to, $approve ? 'transit' : '', $me['username'], $me['label'], $comment ?: null, $id]);
    ordLogEvent($pdo, $id, $to, 'pending', $to, $me, $comment ?: null);
    if ($approve) {
        // the Super Admin's switch decides now, and is fixed on the order: generate the Tax Invoice, or wait for the Super Admin to upload it
        $mode = ordPerms($pdo)['auto_invoice'] ? 'auto' : 'manual';
        if ($cur['doc_type'] === 'invoice') $pdo->prepare("UPDATE `" . ORD_T . "` SET invoice_mode = ? WHERE id = ?")->execute([$mode, $id]);
        // an order placed by a Rohan officer gets a Tax Invoice too (same switch): flag it, and give it the random token the invoice's QR code opens
        else $pdo->prepare("UPDATE `" . ORD_T . "` SET invoice_mode = ?, inv_flag = 1, doc_token = ? WHERE id = ?")->execute([$mode, bin2hex(random_bytes(16)), $id]);
        ordAutoSteps($pdo, $id);
    }
    $pdo->commit();
    ordOut(['order' => ordLoad($pdo, $me, $id)]);
}
