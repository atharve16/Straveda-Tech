<?php
/**
 * config.example.php - DEMO configuration. Copy it to config.php next to the other PHP files and set your own LOCAL database.
 * (The real config.php of the live website is NOT part of this kit.)
 *
 * Quick local run:  create an empty MySQL database (e.g. rohan_demo), load ../03-demo-data/schema.sql and demo-data.sql into it,
 * copy ../03-demo-data/users.demo.php to users.php (same folder as these files), then start PHP:   php -S 127.0.0.1:8100
 * and open http://127.0.0.1:8100/index.html   (see ../01-README-START-HERE.md)
 */
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'rohan_demo');
define('DB_USER', 'root');
define('DB_PASS', '');

// Left over from the first (Dashboard-only) version of the portal. Not used by the demo data; keep the names defined.
define('DB_TABLE', 'unused');
define('RO_REF_DB', 'rohan_demo');
define('RO_REF_TABLE', 'ro_reference_sheet');
define('PENDING_TABLE', 'pending_entries');
define('DB_COL_MAP', ['id' => 'id']);
