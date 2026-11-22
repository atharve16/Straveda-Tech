-- Rohan Energy Order & MIS Portal: database schema (MySQL 5.7 / utf8mb4).
-- This is the final shape of every table, merged from the CREATE TABLE / ALTER statements in the PHP files
-- (orders.php -> ordEnsureSchema(), mis-core.php, outlet-users.php). The live portal creates these tables by itself.
-- For the Android app, use it as the SPECIFICATION of the local database (SQLite / Room): same tables, same columns.
-- Load demo-data.sql afterwards (or the files in json/).

SET NAMES utf8mb4;

CREATE TABLE `portal_settings` (                 -- key/value: prices, GST, stock, minimum order, permissions
  `skey` VARCHAR(40) NOT NULL PRIMARY KEY,
  `svalue` VARCHAR(255) NOT NULL,
  `updated_by` VARCHAR(100) NOT NULL DEFAULT '',
  `updated_at` DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- keys: rate_<pid> (price per EA before GST), gst_<pid>, stock_<pid>, cfg_stock_enabled, min_order_ea,
--       foc_mrp_<pid>, foc_mt_<pid>, perm_<name> (the permission switches), foc_list_v1

CREATE TABLE `portal_products` (                 -- the SKUs; pid is what the settings keys refer to
  `pid` INT NOT NULL PRIMARY KEY,
  `name` VARCHAR(80) NOT NULL UNIQUE,
  `brand` VARCHAR(10) NOT NULL DEFAULT '',       -- 'hp' (sold straight to the outlet) | 'tata' (invoiced through the HPCL office)
  `created_by` VARCHAR(100) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `portal_foc` (                      -- FOC (free of cost) scheme: ordering >= min_qty EA adds foc_qty EA free
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `pid` INT NOT NULL,
  `min_qty` INT NOT NULL,
  `foc_qty` INT NOT NULL,
  `created_by` VARCHAR(100) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL,
  UNIQUE KEY `uk_foc_rule` (`pid`,`min_qty`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `portal_outlets` (                  -- the SAP numbers (outlets): who they belong to and their billing details
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
  `updated_by` VARCHAR(100) NOT NULL DEFAULT '',
  `updated_at` DATETIME NULL,
  KEY `idx_zone` (`zone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `portal_outlet_log` (               -- history of changes to SAP numbers
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sap_code` VARCHAR(12) NOT NULL,
  `action` VARCHAR(10) NOT NULL,
  `changes` MEDIUMTEXT NULL,
  `username` VARCHAR(50) NOT NULL,
  `user_label` VARCHAR(100) NOT NULL,
  `created_at` DATETIME NOT NULL,
  KEY `idx_sap` (`sap_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `portal_outlet_users` (             -- one login per SAP number (the "Outlet" sign-in tab); `pass` is a bcrypt hash
  `sap_code` VARCHAR(12) NOT NULL PRIMARY KEY,
  `label` VARCHAR(150) NOT NULL,
  `pass` VARCHAR(100) NOT NULL,
  `pass_view` VARCHAR(400) NULL,
  `pass_by` VARCHAR(100) NOT NULL DEFAULT '',
  `pass_at` DATETIME NULL,
  `created_by` VARCHAR(100) NOT NULL DEFAULT '',
  `created_at` DATETIME NULL,
  KEY `idx_label` (`label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `portal_orders` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `order_ref` VARCHAR(20) NULL UNIQUE,
  `status` VARCHAR(12) NOT NULL DEFAULT 'draft',           -- draft | pending | approved | rejected
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
  `delivery_stage` VARCHAR(12) NOT NULL DEFAULT '',        -- '' | transit | delivered (approved orders only)
  `voucher_no` VARCHAR(30) NULL,                           -- Sales Order no., given on approval
  `doc_type` VARCHAR(8) NOT NULL DEFAULT 'so',             -- 'so' placed by Rohan | 'invoice' placed by HPCL / an outlet
  `invoice_no` VARCHAR(30) NULL,                           -- Tax Invoice no. (RETI/26-27/n)
  `invoice_mode` VARCHAR(8) NOT NULL DEFAULT 'auto',       -- auto | manual
  `inv_flag` TINYINT NOT NULL DEFAULT 0,
  `invoice_edits` TEXT NULL,                               -- JSON of corrections to the auto-generated Tax Invoice
  `doc_token` VARCHAR(32) NULL,                            -- unguessable token in the invoice QR link
  `placed_role` VARCHAR(16) NULL,                          -- rohan_admin|rohan_zone|rohan_regional|hpcl_admin|hpcl_zone|hpcl_regional|hpcl_outlet
  KEY `idx_zone_status` (`zone`,`status`),
  KEY `idx_creator` (`created_by`,`status`),
  UNIQUE KEY `uk_voucher_no` (`voucher_no`),
  UNIQUE KEY `uk_invoice_no` (`invoice_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `portal_order_items` (              -- ea = paid + foc ; rate / gst are fixed when the order is approved
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `item` VARCHAR(80) NOT NULL,
  `ea` INT NOT NULL,
  `vol` INT NOT NULL,                            -- litres (20 L per EA)
  `rate` DECIMAL(12,2) NULL,
  `gst` DECIMAL(5,2) NULL,
  `foc` INT NULL,
  `paid` INT NULL,
  UNIQUE KEY `uk_order_item` (`order_id`,`item`),
  CONSTRAINT `fk_poi_order` FOREIGN KEY (`order_id`) REFERENCES `portal_orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `portal_order_events` (             -- the status history of an order
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
  CONSTRAINT `fk_poe_order` FOREIGN KEY (`order_id`) REFERENCES `portal_orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `portal_order_returns` (            -- return requests of delivered orders
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
  CONSTRAINT `fk_por_order` FOREIGN KEY (`order_id`) REFERENCES `portal_orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `portal_order_files` (              -- proof of delivery / payment receipt: the file itself is stored on disk
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
  CONSTRAINT `fk_pof_order` FOREIGN KEY (`order_id`) REFERENCES `portal_orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `portal_mis_rows` (                 -- the MIS: the one source of the Dashboard, Raw Data and the MIS sheets
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
  `notes` TEXT NULL,
  UNIQUE KEY `uk_item` (`item_id`),
  KEY `idx_d` (`d`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `portal_mis_meta` (
  `k` VARCHAR(30) NOT NULL PRIMARY KEY,
  `v` VARCHAR(100) NOT NULL DEFAULT '',
  `by` VARCHAR(100) NOT NULL DEFAULT '',
  `at` DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- NOT in the database: the portal accounts (Super Admin, Zone / Regional Officers, HPCL officers) live in users.php,
-- an array keyed by username. See users.demo.php and json/users.json for the demo accounts.
-- api.php also creates `audit_log` and `targets` on demand (change log of the Admin tab, sales targets): see ensureAuditTable() / ensureTargetsTable().
