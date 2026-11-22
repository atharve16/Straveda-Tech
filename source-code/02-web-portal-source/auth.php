<?php
/**
 * auth.php — Server-side authentication for HPCL DEF Dashboard
 * Handles login, session check, and logout.
 * Passwords never leave the server.
 */
require_once __DIR__ . '/config.php';   // database login: only used when a username is renamed (orders keep following it)
require_once __DIR__ . '/users-store.php';   // safe reading / writing of users.php (no stale OPcache copy, atomic save, lock)
require_once __DIR__ . '/regions.php';       // zones / regions / states (shared with orders.php)
require_once __DIR__ . '/outlet-users.php';  // outlet profiles: one login per SAP number (own table, not users.php)

/** Every account made by the Excel import gets this password (they change it themselves after the first sign-in). */
const IMPORT_PASSWORD = 'Demo@12345';
/** The pages (tab ids of the portal) that Users & Zones -> Edit -> Page access can switch off for a user. (A const must sit above the action switch: functions are hoisted, consts are not.) */
const PAGE_IDS = ['dashboard', 'rawdata', 'mis', 'entry', 'admin', 'neworder', 'myorders', 'approvals', 'allorders', 'returns', 'inventory', 'foc', 'sap', 'roreport', 'perms', 'zones', 'team', 'outlets'];
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');   // the user list must never come from a cache

// Generate CSRF token if not set
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $_GET['action'] ?? ($body['action'] ?? '');

// Every request that may change users.php holds the lock from here on, so two saves at the same moment queue up instead of one wiping the other.
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && !in_array($action, ['login', 'logout', 'check'], true)) usersLock();

switch ($action) {

    case 'login':
        $username = trim($body['username'] ?? '');
        $password = trim($body['password'] ?? '');

        if (!$username || !$password) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Username and password are required.']);
            exit;
        }

        // The "SAP No." tab: the login of ONE outlet (username = its SAP number). These accounts are in the database, not in users.php.
        if (($body['org'] ?? '') === 'sap') {
            try {
                $row = ouFind(ouDb(), $username);
            } catch (Throwable $e) {
                error_log('auth.php outlet login: ' . $e->getMessage());
                http_response_code(500);
                echo json_encode(['ok' => false, 'error' => 'The outlet list could not be read. Please try again in a moment.']);
                exit;
            }
            if (!$row || !password_verify($password, (string)$row['pass'])) {
                http_response_code(401);
                echo json_encode(['ok' => false, 'error' => 'Invalid SAP number or password. Please try again.']);
                exit;
            }
            $sess = ouSession($row);
            if (!$sess) {
                http_response_code(403);
                echo json_encode(['ok' => false, 'error' => 'This SAP number is not linked to a zone and region yet. Please contact your Zone Officer.']);
                exit;
            }
            $_SESSION['hpcl_user'] = $sess;
            session_regenerate_id(true);
            echo json_encode(['ok' => true, 'user' => $_SESSION['hpcl_user'], 'csrf' => $_SESSION['csrf_token']]);
            exit;
        }

        $users = usersLoad();

        // usernames such as district names are easy to type in the wrong case: accept a case-insensitive match when it is unambiguous
        if (!isset($users[$username])) {
            $same = array_values(array_filter(array_keys($users), fn($k) => strcasecmp((string)$k, $username) === 0));
            if (count($same) === 1) $username = (string)$same[0];
        }

        if (!isset($users[$username])) {
            http_response_code(401);
            $hint = '';
            try { if (ouIsProfile(ouDb(), $username)) $hint = ' This is an outlet (SAP number) login: choose the "SAP No." tab to sign in.'; } catch (Throwable $e) {}
            echo json_encode(['ok' => false, 'error' => 'Invalid username or password. Please try again.' . $hint]);
            exit;
        }

        $storedPass = $users[$username]['pass'];
        $isHashed = (substr($storedPass, 0, 4) === '$2y$');

        if ($isHashed) {
            $valid = password_verify($password, $storedPass);
        } else {
            // Plaintext fallback — auto-migrate to hashed on successful login
            $valid = ($storedPass === $password);
            if ($valid) {
                usersLock();
                $fresh = usersLoad();   // start from the file as it is now, not from the copy read before the lock
                if (isset($fresh[$username]) && $fresh[$username]['pass'] === $storedPass) {
                    $fresh[$username]['pass'] = password_hash($password, PASSWORD_BCRYPT);
                    writeUsers(__DIR__ . '/users.php', $fresh);
                    $users = $fresh;
                }
            }
        }

        if (!$valid) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'error' => 'Invalid username or password. Please try again.']);
            exit;
        }

        $u = $users[$username];

        // Login screen has a Rohan Energy / HPCL toggle. An account that belongs to one organisation cannot sign in
        // under the other; accounts without an organisation (admin, dashboard-only users) can use either side.
        $tab = $body['org'] ?? '';
        if (in_array($tab, ['rohan', 'hpcl'], true) && !empty($u['org']) && $u['org'] !== $tab) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'error' => 'This is ' . ($u['org'] === 'hpcl' ? 'an HPCL' : 'a Rohan Energy')
                . ' account. Choose the "' . ($u['org'] === 'hpcl' ? 'HPCL' : 'Rohan Energy') . '" tab to sign in.']);
            exit;
        }

        $_SESSION['hpcl_user'] = [
            'username'    => $username,
            'role'        => $u['role'],
            'label'       => $u['label'],
            'filter'      => $u['filter'],  // null | ['zone'=>...] | ['state'=>...] | ['ro'=>...]
            'hidden_cols' => $u['hidden_cols'] ?? [],
            'hidden_pages' => $u['hidden_pages'] ?? [],   // portal pages (tabs) switched off for this user in Users & Zones -> Edit -> Page access
            'org'         => $u['org'] ?? null,  // null | 'rohan' | 'hpcl' (order workflow)
            'ros'         => $u['ros'] ?? [],    // regional offices inside the zone (empty = whole zone)
            'level'       => userLevel($u),      // 'zone' (Zone Officer) | 'regional' (Regional Officer) | '' (not an order officer)
            'sales_areas' => $u['sales_areas'] ?? [],   // Regional Officer: the sales areas (SA) handled
        ];
        session_regenerate_id(true);

        echo json_encode(['ok' => true, 'user' => $_SESSION['hpcl_user'], 'csrf' => $_SESSION['csrf_token']]);
        break;

    case 'check':
        if (!empty($_SESSION['hpcl_user']) && ouSessionIsOutlet()) {
            // an outlet profile: read it again, so a deleted profile or a changed region takes effect at once
            $sess = null;
            try { $row = ouFind(ouDb(), (string)$_SESSION['hpcl_user']['username']); $sess = $row ? ouSession($row) : null; } catch (Throwable $e) { error_log('auth.php outlet check: ' . $e->getMessage()); }
            if (!$sess) { session_destroy(); echo json_encode(['ok' => false]); break; }
            $_SESSION['hpcl_user'] = $sess;
            echo json_encode(['ok' => true, 'user' => $_SESSION['hpcl_user'], 'csrf' => $_SESSION['csrf_token']]);
            break;
        }
        if (!empty($_SESSION['hpcl_user'])) {
            $users = usersLoad();
            $uname = $_SESSION['hpcl_user']['username'];
            if (!isset($users[$uname])) {
                // account was deleted while signed in
                session_destroy();
                echo json_encode(['ok' => false]);
                break;
            }
            $_SESSION['hpcl_user']['hidden_cols'] = $users[$uname]['hidden_cols'] ?? [];
            $_SESSION['hpcl_user']['hidden_pages'] = $users[$uname]['hidden_pages'] ?? [];
            $_SESSION['hpcl_user']['org']         = $users[$uname]['org'] ?? null;
            $_SESSION['hpcl_user']['ros']         = $users[$uname]['ros'] ?? [];
            $_SESSION['hpcl_user']['level']       = userLevel($users[$uname]);
            $_SESSION['hpcl_user']['sales_areas'] = $users[$uname]['sales_areas'] ?? [];
            echo json_encode(['ok' => true, 'user' => $_SESSION['hpcl_user'], 'csrf' => $_SESSION['csrf_token']]);
        } else {
            echo json_encode(['ok' => false]);
        }
        break;

    case 'logout':
        session_destroy();
        echo json_encode(['ok' => true]);
        break;

    case 'list_users':
        // The super admin sees every account; a Zone Officer sees only the Regional Officers they created.
        $users = usersLoad();
        [$actorName, $actorData, $isSuper] = actor($users, 'any');
        $list = [];
        foreach ($users as $uname => $udata) {
            // super admin (Rohan Energy): everyone. HPCL super admin: only the HPCL Zone / Regional Officers. Zone Officer: their own Regional Officers.
            if (!($isSuper && !isHpclSuper($actorData)) && !canManage($actorName, $isSuper, $udata, $actorData)) continue;
            $see = canViewPassword($actorName, $isSuper, (string)$uname, $udata, $actorData);
            $list[$uname] = [
                'label'       => $udata['label'],
                'role'        => $udata['role'],
                'filter'      => $udata['filter'],
                'hidden_cols' => $udata['hidden_cols'] ?? [],
                'hidden_pages' => $udata['hidden_pages'] ?? [],
                'org'         => $udata['org'] ?? null,
                'ros'         => $udata['ros'] ?? [],
                'sheet_zone'  => $udata['sheet_zone'] ?? '',
                'states'      => ($udata['role'] ?? '') === 'superadmin' ? approvalStates($udata) : [],   // the states a super admin approves (none = all)
                'sheet_zones' => userSheetZones($udata),   // every zone an officer / HPCL super admin covers (an officer made before multi-zone has just the one)
                'zones'       => userZones($udata),
                'level'       => userLevel($udata),
                'created_by'  => $udata['created_by'] ?? '',
                'sales_areas' => $udata['sales_areas'] ?? [],   // Regional Officer: the sales areas (SA) handled
                'email'       => $udata['email'] ?? '',
                'mobile'      => $udata['mobile'] ?? '',
                // The stored hash never leaves the server. The readable copy of a password goes only to the people above the account
                // (super admin: every account except a super admin; Zone Officer: the Regional Officers they made) - never to the owner.
                'can_see_pw'  => $see,
                'password'    => $see ? (passView($udata) ?? '') : '',
                'pass_by'     => $see ? (string)($udata['pass_by'] ?? '') : '',
                'pass_at'     => $see ? (string)($udata['pass_at'] ?? '') : '',
            ];
        }
        echo json_encode(['ok' => true, 'users' => $list]);
        break;

    case 'list_sales_areas':
        // region => its sales areas (SA, from the client's FY27 sheet), for the region -> sales area pickers. Super admin: every region; Zone Officer: their own regions.
        $users = usersLoad();
        [$actorName, $actorData, $isSuper] = actor($users, 'any');
        $regions = [];
        if ($isSuper) {
            $lim = superLimit($actorData);   // an HPCL super admin made for some zones only sees those
            foreach (sheetZones() as $z) foreach ($z['ros'] as $r) if ($lim === null || in_array($r, $lim, true)) $regions[] = $r;
        }
        else $regions = officerRegions($actorData);
        echo json_encode(['ok' => true, 'sales_areas' => regionSalesAreas($regions)]);
        break;

    case 'update_user_access':
        // The super admin edits any account (the HPCL super admin: HPCL Zone Officers only); Regional Officers are edited with update_regional_officer.
        $usersFile = __DIR__ . '/users.php';
        $users = usersLoad();
        [$actorName, $actorData] = actor($users, 'super');
        $targetUser = trim($body['username'] ?? '');
        $newRole    = trim($body['role'] ?? '');
        $newFilter  = $body['filter'] ?? null;
        $newLabel   = trim($body['label'] ?? '');
        // One or several zones (and optionally only some of their regions): the portal zone follows from the first one chosen.
        $cz = null;
        if (isset($body['sheet_zones']) || trim((string)($body['sheet_zone'] ?? '')) !== '') {
            $cz = cleanZones($body, superLimit($actorData));
            if ($cz[3]) { echo json_encode(['ok' => false, 'error' => $cz[3]]); exit; }
            $newFilter = ['zone' => $cz[1][0]];
        }
        $szName = $cz ? $cz[0][0] : '';

        if (!$targetUser || !$newRole) {
            echo json_encode(['ok' => false, 'error' => 'Username and role are required.']);
            exit;
        }

        $validRoles = ['superadmin', 'cluster', 'zone', 'state', 'ro', 'entry'];
        if (!in_array($newRole, $validRoles)) {
            echo json_encode(['ok' => false, 'error' => 'Invalid role.']);
            exit;
        }

        if (!isset($users[$targetUser])) {
            echo json_encode(['ok' => false, 'error' => 'User not found.']);
            exit;
        }
        // The HPCL super admin only edits HPCL Zone / Regional Officers, and cannot move them to another organisation or role.
        if (isHpclSuper($actorData) && (!canManage($actorName, true, $users[$targetUser], $actorData) || $newRole !== 'zone' || (array_key_exists('org', $body) && ($body['org'] ?? '') !== 'hpcl'))) {
            echo json_encode(['ok' => false, 'error' => 'You can only edit HPCL Zone Officers.']);
            exit;
        }

        applyPages($users, $targetUser, $body, $actorName);
        // A super admin that stays a super admin keeps its organisation (an HPCL super admin must not turn into a Rohan Energy one): only name and column visibility change.
        if (($users[$targetUser]['role'] ?? '') === 'superadmin' && $newRole === 'superadmin') {
            if ($newLabel) $users[$targetUser]['label'] = $newLabel;
            if (array_key_exists('hidden_cols', $body)) $users[$targetUser]['hidden_cols'] = is_array($body['hidden_cols']) ? $body['hidden_cols'] : [];
            writeUsers($usersFile, $users);
            echo json_encode(['ok' => true]);
            break;
        }
        // A Regional Officer keeps the org, zone and region they were created with: only the name and column visibility change here.
        if (userLevel($users[$targetUser]) === 'regional') {
            if ($newLabel) $users[$targetUser]['label'] = $newLabel;
            if (array_key_exists('hidden_cols', $body)) $users[$targetUser]['hidden_cols'] = is_array($body['hidden_cols']) ? $body['hidden_cols'] : [];
            writeUsers($usersFile, $users);
            echo json_encode(['ok' => true]);
            break;
        }

        $newOrg = null;
        if (array_key_exists('org', $body)) {
            $newOrg = validateOrg($body['org'], $newRole, $newFilter);
            if ($newOrg === false) {
                echo json_encode(['ok' => false, 'error' => 'Rohan Energy / HPCL officers must have the Zone role and a zone selected.']);
                exit;
            }
        } else {
            $newOrg = $users[$targetUser]['org'] ?? null;
            // an org user moved to a non-zone role loses the org
            if ($newRole !== 'zone') $newOrg = null;
        }

        $newSheetZones = $newPortalZones = [];
        if ($cz) {
            // zones (and regions) chosen in the editor: a Zone Officer covers every region ticked in them
            [$newSheetZones, $newPortalZones, $newRos] = $cz;
        } else {
            // no zone sent (old Admin-tab editor): keep the stored zone only while it still sits in the same portal zone
            $szName = (string)($users[$targetUser]['sheet_zone'] ?? '');
            if ($szName !== '' && (sheetZones()[$szName]['zone'] ?? null) !== ($newFilter['zone'] ?? null)) $szName = '';
            // (Accounts made before levels existed keep the regions they have.)
            $newRos = array_values(array_intersect((array)($users[$targetUser]['ros'] ?? []), zoneRegions((string)($newFilter['zone'] ?? ''))));
            if ($szName !== '') { $newSheetZones = [$szName]; $newPortalZones = [(string)$newFilter['zone']]; }
        }
        if ($newOrg === null) { $newRos = []; $szName = ''; $newSheetZones = $newPortalZones = []; }

        // The Regional Officers made by this Zone Officer stay inside its org and zones: a changed organisation moves them along, and the zones / regions
        // can only change as long as every region one of them handles stays covered.
        $kids = childrenOf($users, $targetUser);
        $oldOrg = $users[$targetUser]['org'] ?? null;
        $cc = cleanContact($body, $users, $targetUser);
        if ($cc['error']) { echo json_encode(['ok' => false, 'error' => $cc['error']]); exit; }
        if ($kids) {
            if ($newOrg === null || $newRole !== 'zone') {
                echo json_encode(['ok' => false, 'error' => 'This Zone Officer has ' . count($kids) . ' Regional Officer(s). Remove or move them before changing the role.']);
                exit;
            }
            $lost = [];
            foreach ($kids as $k) foreach ((array)($users[$k]['ros'] ?? []) as $r) if (!in_array($r, $newRos, true)) $lost[$r] = true;
            if ($lost) {
                echo json_encode(['ok' => false, 'error' => 'Regional Officers work under this officer in ' . implode(', ', array_keys($lost)) . '. Keep ' . (count($lost) === 1 ? 'that region' : 'those regions') . ' ticked, or move / remove those Regional Officers first.']);
                exit;
            }
        }

        // Update role, filter, and hidden_cols — keep password
        $users[$targetUser]['role'] = $newRole;
        $users[$targetUser]['filter'] = ($newRole === 'superadmin' || $newRole === 'cluster' || $newRole === 'entry') ? null : $newFilter;
        $users[$targetUser]['org'] = $newOrg;
        $users[$targetUser]['ros'] = $newRos;
        $users[$targetUser]['sheet_zone'] = $newSheetZones[0] ?? '';
        if (count($newSheetZones) > 1) { $users[$targetUser]['sheet_zones'] = $newSheetZones; $users[$targetUser]['zones'] = $newPortalZones; }
        else unset($users[$targetUser]['sheet_zones'], $users[$targetUser]['zones']);
        if ($newOrg !== null) { $users[$targetUser]['level'] = 'zone'; unset($users[$targetUser]['sales_areas'], $users[$targetUser]['districts'], $users[$targetUser]['all_districts']); }
        else unset($users[$targetUser]['level'], $users[$targetUser]['created_by'], $users[$targetUser]['sales_areas'], $users[$targetUser]['districts'], $users[$targetUser]['all_districts']);
        if ($newLabel) $users[$targetUser]['label'] = $newLabel;
        applyContact($users, $targetUser, $cc);
        if ($kids && $newOrg !== $oldOrg) foreach ($kids as $k) $users[$k]['org'] = $newOrg;   // the team follows its Zone Officer to the other organisation
        if (array_key_exists('hidden_cols', $body)) {
            $users[$targetUser]['hidden_cols'] = is_array($body['hidden_cols']) ? $body['hidden_cols'] : [];
        }
        $rn = renameUser($users, $targetUser, (string)($body['new_username'] ?? ''));
        if ($rn !== null) { echo json_encode(['ok' => false, 'error' => $rn]); exit; }

        writeUsers($usersFile, $users);
        echo json_encode(['ok' => true]);
        break;

    case 'update_user_password':
        // The super admin resets any password; a Zone Officer resets the passwords of their own Regional Officers.
        $usersFile = __DIR__ . '/users.php';
        $users = usersLoad();
        [$actorName, $actorData, $isSuper] = actor($users, 'any');
        $targetUser = trim($body['username'] ?? '');
        $newPass    = trim($body['password'] ?? '');

        if (!$targetUser || !$newPass) {
            echo json_encode(['ok' => false, 'error' => 'Username and password are required.']);
            exit;
        }
        if (!isset($users[$targetUser]) || !canManage($actorName, $isSuper, $users[$targetUser], $actorData)) {
            echo json_encode(['ok' => false, 'error' => 'User not found.']);
            exit;
        }
        if (strlen($newPass) < 8) {
            echo json_encode(['ok' => false, 'error' => 'Password must be at least 8 characters.']);
            exit;
        }

        setPassword($users, $targetUser, $newPass, $actorName);
        writeUsers($usersFile, $users);

        echo json_encode(['ok' => true]);
        break;

    case 'change_password':
        // Everyone changes their OWN password here (current password required). The new one is also kept in a readable form for the
        // people above them: a Regional Officer's for their Zone Officer + the super admin, a Zone Officer's for the super admin.
        $usersFile = __DIR__ . '/users.php';
        if (ouSessionIsOutlet()) {   // an outlet profile changes its own password in the outlet table
            $me = (string)($_SESSION['hpcl_user']['username'] ?? '');
            $cur = (string)($body['current_password'] ?? '');
            $new = trim((string)($body['new_password'] ?? ''));
            $pdo = ouDb(); ouEnsure($pdo);
            $st = $pdo->prepare("SELECT pass FROM `" . OU_T . "` WHERE sap_code = ?");
            $st->execute([$me]);
            $stored = $st->fetchColumn();
            if ($stored === false) denyJson(403, 'Access denied.');
            if (!password_verify($cur, (string)$stored)) { echo json_encode(['ok' => false, 'error' => 'Your current password is not correct.']); exit; }
            if (strlen($new) < 8) { echo json_encode(['ok' => false, 'error' => 'The new password must be at least 8 characters.']); exit; }
            if ($new === $cur) { echo json_encode(['ok' => false, 'error' => 'The new password must be different from the current one.']); exit; }
            $pdo->prepare("UPDATE `" . OU_T . "` SET pass = ?, pass_view = ?, pass_by = ?, pass_at = NOW() WHERE sap_code = ?")
                ->execute([ouHash($new), passSeal($new) ?: null, $me, $me]);
            echo json_encode(['ok' => true]);
            break;
        }
        $users = usersLoad();
        $me = (string)($_SESSION['hpcl_user']['username'] ?? '');
        if ($me === '' || !isset($users[$me])) denyJson(403, 'Access denied.');
        $cur = (string)($body['current_password'] ?? '');
        $new = trim((string)($body['new_password'] ?? ''));
        $stored = (string)($users[$me]['pass'] ?? '');
        $curOk = (substr($stored, 0, 4) === '$2y$') ? password_verify($cur, $stored) : ($cur !== '' && hash_equals($stored, $cur));
        if (!$curOk) { echo json_encode(['ok' => false, 'error' => 'Your current password is not correct.']); exit; }
        if (strlen($new) < 8) { echo json_encode(['ok' => false, 'error' => 'The new password must be at least 8 characters.']); exit; }
        if ($new === $cur) { echo json_encode(['ok' => false, 'error' => 'The new password must be different from the current one.']); exit; }
        setPassword($users, $me, $new, $me);
        writeUsers($usersFile, $users);
        echo json_encode(['ok' => true]);
        break;

    case 'update_contact':
        // Everyone may keep their OWN e-mail and mobile number (shown in the top bar and on the Profile page). An outlet's phone number is kept on the SAP Numbers page.
        if (ouSessionIsOutlet()) denyJson(403, 'The phone number of an outlet is changed on the SAP Numbers page by your Zone Officer.');
        $usersFile = __DIR__ . '/users.php';
        $users = usersLoad();
        $me = (string)($_SESSION['hpcl_user']['username'] ?? '');
        if ($me === '' || !isset($users[$me])) denyJson(403, 'Access denied.');
        $cc = cleanContact($body, $users, $me);
        if ($cc['error'] !== null) { echo json_encode(['ok' => false, 'error' => $cc['error']]); exit; }
        applyContact($users, $me, $cc);
        writeUsers($usersFile, $users);
        echo json_encode(['ok' => true, 'email' => (string)($users[$me]['email'] ?? ''), 'mobile' => (string)($users[$me]['mobile'] ?? '')]);
        break;

    case 'add_user':
        // The super admin adds accounts. A Rohan Energy / HPCL account made here is a Zone Officer: it covers the whole chosen zone.
        $usersFile = __DIR__ . '/users.php';
        $users = usersLoad();
        [$actorName, $actorData] = actor($users, 'super');
        $newUsername = trim($body['username'] ?? '');
        $newPass    = trim($body['password'] ?? '');
        $newRole    = trim($body['role'] ?? '');
        $newLabel   = trim($body['label'] ?? '');
        $newFilter  = $body['filter'] ?? null;
        // One or several zones (and optionally only some of their regions, e.g. a Regional Manager who has just one region); the portal zone follows from the first one.
        $cz = null;
        if (isset($body['sheet_zones']) || trim((string)($body['sheet_zone'] ?? '')) !== '') {
            $cz = cleanZones($body, superLimit($actorData));
            if ($cz[3]) { echo json_encode(['ok' => false, 'error' => $cz[3]]); exit; }
            $newFilter = ['zone' => $cz[1][0]];
        }

        if (!$newUsername || !$newPass || !$newRole || !$newLabel) {
            echo json_encode(['ok' => false, 'error' => 'All fields are required.']);
            exit;
        }
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $newUsername)) {
            echo json_encode(['ok' => false, 'error' => 'Username can only contain letters, numbers, and underscores.']);
            exit;
        }
        $validRoles = ['superadmin', 'cluster', 'zone', 'state', 'ro', 'entry'];
        if (!in_array($newRole, $validRoles)) {
            echo json_encode(['ok' => false, 'error' => 'Invalid role.']);
            exit;
        }
        if (isset($users[$newUsername])) {
            echo json_encode(['ok' => false, 'error' => 'Username already exists.']);
            exit;
        }
        // The HPCL super admin only creates HPCL Zone Officers.
        if (isHpclSuper($actorData) && ($newRole !== 'zone' || ($body['org'] ?? '') !== 'hpcl')) {
            echo json_encode(['ok' => false, 'error' => 'You can only create HPCL Zone Officers.']);
            exit;
        }

        $newOrg = validateOrg($body['org'] ?? null, $newRole, $newFilter);
        if ($newOrg === false) {
            echo json_encode(['ok' => false, 'error' => 'Rohan Energy / HPCL officers must have the Zone role and a zone selected.']);
            exit;
        }
        if (strlen($newPass) < 8) {
            echo json_encode(['ok' => false, 'error' => 'Password must be at least 8 characters.']);
            exit;
        }
        $newRos = [];
        if ($newOrg !== null) {
            if (!$cz) { echo json_encode(['ok' => false, 'error' => 'Choose the zone.']); exit; }
            $newRos = $cz[2];
        }

        $users[$newUsername] = [
            'pass'        => password_hash($newPass, PASSWORD_BCRYPT),
            'role'        => $newRole,
            'label'       => $newLabel,
            'filter'      => ($newRole === 'superadmin' || $newRole === 'cluster' || $newRole === 'entry') ? null : $newFilter,
            'hidden_cols' => is_array($body['hidden_cols'] ?? null) ? $body['hidden_cols'] : [],
            'org'         => $newOrg,
            'ros'         => $newRos,
            'sheet_zone'  => ($newOrg === null || !$cz) ? '' : $cz[0][0],
        ];
        if ($newOrg !== null) {
            $users[$newUsername]['level'] = 'zone'; $users[$newUsername]['created_by'] = $actorName;
            if (count($cz[0]) > 1) { $users[$newUsername]['sheet_zones'] = $cz[0]; $users[$newUsername]['zones'] = $cz[1]; }
        }
        setPassword($users, $newUsername, $newPass, $actorName);

        writeUsers($usersFile, $users);

        echo json_encode(['ok' => true]);
        break;

    case 'add_regional_officer':
        // A Regional Officer has the same organisation and zone as their Zone Officer, ONE region of that zone and one or more of its sales areas (SA).
        // A Zone Officer makes them for themself; the super admin makes them under any Zone Officer (body "parent").
        $usersFile = __DIR__ . '/users.php';
        $users = usersLoad();
        [$actorName, $actorData, $isSuper] = actor($users, 'any');
        if ($isSuper) {
            $parentName = trim($body['parent'] ?? '');
            if ($parentName === '' || !isset($users[$parentName]) || userLevel($users[$parentName]) !== 'zone') {
                echo json_encode(['ok' => false, 'error' => 'Choose the Zone Officer this Regional Officer works under.']);
                exit;
            }
            $parentData = $users[$parentName];
            if (isHpclSuper($actorData) && !canManage($actorName, true, $parentData, $actorData)) {
                echo json_encode(['ok' => false, 'error' => 'Choose one of the HPCL Zone Officers of your zones.']);
                exit;
            }
        } else {
            $parentName = $actorName;
            $parentData = $actorData;
        }
        $newUsername = trim($body['username'] ?? '');
        $newPass     = trim($body['password'] ?? '');
        $newLabel    = trim($body['label'] ?? '');
        if (!$newUsername || !$newPass || !$newLabel) {
            echo json_encode(['ok' => false, 'error' => 'Name, username and password are required.']);
            exit;
        }
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $newUsername)) {
            echo json_encode(['ok' => false, 'error' => 'Username can only contain letters, numbers, and underscores.']);
            exit;
        }
        if (strlen($newPass) < 8) {
            echo json_encode(['ok' => false, 'error' => 'Password must be at least 8 characters.']);
            exit;
        }
        if (isset($users[$newUsername])) {
            echo json_encode(['ok' => false, 'error' => 'Username already exists.']);
            exit;
        }
        [$ro, $sas, $err] = cleanRegional($body, officerRegions($parentData));
        if ($err) { echo json_encode(['ok' => false, 'error' => $err]); exit; }

        $users[$newUsername] = [
            'pass'        => password_hash($newPass, PASSWORD_BCRYPT),
            'role'        => 'zone',
            'label'       => $newLabel,
            'filter'      => ['zone' => regionPortalZone($ro, (string)($parentData['filter']['zone'] ?? ''))],   // the zone of the REGION (a Zone Officer can cover several zones)
            'hidden_cols' => [],
            'org'         => $parentData['org'],
            'ros'         => [$ro],
            'sheet_zone'  => regionSheetZone($ro, (string)($parentData['sheet_zone'] ?? '')),
            'level'       => 'regional',
            'created_by'  => $parentName,
            'sales_areas' => $sas,
        ];
        setPassword($users, $newUsername, $newPass, $actorName);
        writeUsers($usersFile, $users);
        echo json_encode(['ok' => true]);
        break;

    case 'update_regional_officer':
        // Change a Regional Officer's name, e-mail, mobile, region and sales areas - and, for the super admin, the Zone Officer they work under
        // (the officer then takes that Zone Officer's organisation). A Zone Officer edits their own Regional Officers; the super admin any.
        $usersFile = __DIR__ . '/users.php';
        $users = usersLoad();
        [$actorName, $actorData, $isSuper] = actor($users, 'any');
        $targetUser = trim($body['username'] ?? '');
        if (!isset($users[$targetUser]) || userLevel($users[$targetUser]) !== 'regional' || !canManage($actorName, $isSuper, $users[$targetUser], $actorData)) {
            echo json_encode(['ok' => false, 'error' => 'User not found.']);
            exit;
        }
        $t = $users[$targetUser];
        $parentName = (string)($t['created_by'] ?? '');
        $newParent = trim((string)($body['parent'] ?? ''));
        $moved = false;
        if ($isSuper && $newParent !== '' && $newParent !== $parentName) {
            if (!isset($users[$newParent]) || userLevel($users[$newParent]) !== 'zone') { echo json_encode(['ok' => false, 'error' => 'Choose the Zone Officer this Regional Officer works under.']); exit; }
            if (isHpclSuper($actorData) && !canManage($actorName, true, $users[$newParent], $actorData)) { echo json_encode(['ok' => false, 'error' => 'Choose one of the HPCL Zone Officers of your zones.']); exit; }
            $parentName = $newParent;
            $moved = true;
        }
        $parent = $users[$parentName] ?? null;
        if ($isSuper) {   // the regions of the Zone Officer the officer works under (the new one when moved)
            $allowed = officerRegions($parent && userLevel($parent) === 'zone' ? $parent : ['filter' => $t['filter'], 'sheet_zone' => $t['sheet_zone'] ?? '']);
        } else {
            $allowed = officerRegions($actorData);
        }
        [$ro, $sas, $err] = cleanRegional($body, $allowed);
        if ($err) { echo json_encode(['ok' => false, 'error' => $moved ? 'That Zone Officer does not cover the chosen region. Choose one of its regions.' : $err]); exit; }
        $cc = cleanContact($body, $users, $targetUser);
        if ($cc['error']) { echo json_encode(['ok' => false, 'error' => $cc['error']]); exit; }
        $newLabel = trim($body['label'] ?? '');
        if ($newLabel !== '') $users[$targetUser]['label'] = $newLabel;
        applyContact($users, $targetUser, $cc);
        applyPages($users, $targetUser, $body, $actorName);
        if ($moved) { $users[$targetUser]['created_by'] = $parentName; $users[$targetUser]['org'] = $parent['org']; }
        $users[$targetUser]['ros'] = [$ro];
        $users[$targetUser]['filter'] = ['zone' => regionPortalZone($ro, (string)($t['filter']['zone'] ?? ''))];   // moved to a region of another zone: follow it
        $users[$targetUser]['sheet_zone'] = regionSheetZone($ro, (string)($t['sheet_zone'] ?? ''));
        $users[$targetUser]['sales_areas'] = $sas;
        unset($users[$targetUser]['districts'], $users[$targetUser]['all_districts']);   // officers made before sales areas replaced districts
        $rn = renameUser($users, $targetUser, (string)($body['new_username'] ?? ''));
        if ($rn !== null) { echo json_encode(['ok' => false, 'error' => $rn]); exit; }
        writeUsers($usersFile, $users);
        echo json_encode(['ok' => true]);
        break;

    case 'delete_user':
        // The super admin removes any account (a Zone Officer only once their Regional Officers are gone); a Zone Officer removes their own Regional Officers.
        $usersFile = __DIR__ . '/users.php';
        $users = usersLoad();
        [$actorName, $actorData, $isSuper] = actor($users, 'any');
        $targetUser = trim($body['username'] ?? '');
        if (!$targetUser) {
            echo json_encode(['ok' => false, 'error' => 'Username is required.']);
            exit;
        }
        // Prevent deleting yourself
        if ($targetUser === $actorName) {
            echo json_encode(['ok' => false, 'error' => 'Cannot delete your own account.']);
            exit;
        }
        if (!isset($users[$targetUser]) || !canManage($actorName, $isSuper, $users[$targetUser], $actorData)) {
            echo json_encode(['ok' => false, 'error' => 'User not found.']);
            exit;
        }
        $kids = childrenOf($users, $targetUser);
        if ($kids) {
            echo json_encode(['ok' => false, 'error' => 'This Zone Officer still has ' . count($kids) . ' Regional Officer(s). Remove them first.']);
            exit;
        }

        unset($users[$targetUser]);
        writeUsers($usersFile, $users);

        echo json_encode(['ok' => true]);
        break;

    case 'add_super_admin':
        // A (Rohan Energy) super admin creates another super admin: a Rohan Energy one (full rights, like the first) or an HPCL one
        // (no Admin, Inventory or Permissions pages; sees and manages HPCL accounts only).
        $usersFile = __DIR__ . '/users.php';
        $users = usersLoad();
        [$actorName] = actor($users, 'rsuper');
        $newUsername = trim($body['username'] ?? '');
        $newPass     = trim($body['password'] ?? '');
        $newLabel    = trim($body['label'] ?? '');
        $which       = trim($body['org'] ?? '');
        if (!$newUsername || !$newPass || !$newLabel || !in_array($which, ['rohan', 'hpcl'], true)) {
            echo json_encode(['ok' => false, 'error' => 'Name, username, password and the type of Super Admin are required.']);
            exit;
        }
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $newUsername)) {
            echo json_encode(['ok' => false, 'error' => 'Username can only contain letters, numbers, and underscores.']);
            exit;
        }
        if (strlen($newPass) < 8) {
            echo json_encode(['ok' => false, 'error' => 'Password must be at least 8 characters.']);
            exit;
        }
        if (isset($users[$newUsername]) || count(array_filter(array_keys($users), fn($k) => strcasecmp((string)$k, $newUsername) === 0))) {
            echo json_encode(['ok' => false, 'error' => 'Username already exists.']);
            exit;
        }
        $users[$newUsername] = [
            'pass'        => password_hash($newPass, PASSWORD_BCRYPT),
            'role'        => 'superadmin',
            'label'       => $newLabel,
            'filter'      => null,
            'hidden_cols' => [],
        ];
        if ($which === 'hpcl') $users[$newUsername]['org'] = 'hpcl';   // a Rohan Energy super admin has no organisation, exactly like the first one
        // Either kind of super admin sees everything everywhere; the states chosen here only decide WHICH PENDING ORDERS IT APPROVES
        // (Rohan Energy: the orders HPCL placed; HPCL: the orders Rohan Energy placed). No states sent = every state.
        if (isset($body['states'])) {
            $cs = cleanStates($body['states']);
            if ($cs === null) { echo json_encode(['ok' => false, 'error' => 'Choose at least one state.']); exit; }
            if ($cs) $users[$newUsername]['states'] = $cs;
        }
        $users[$newUsername]['created_by'] = $actorName;
        setPassword($users, $newUsername, $newPass, $actorName);
        writeUsers($usersFile, $users);
        echo json_encode(['ok' => true]);
        break;

    case 'update_super_admin':
        // The Rohan Energy super admin changes the name and the approval states of any other super admin (HPCL or Rohan Energy).
        $usersFile = __DIR__ . '/users.php';
        $users = usersLoad();
        [$actorName] = actor($users, 'rsuper');
        $target = trim($body['username'] ?? '');
        if (!isset($users[$target]) || ($users[$target]['role'] ?? '') !== 'superadmin') { echo json_encode(['ok' => false, 'error' => 'Super Admin not found.']); exit; }
        $newLabel = trim($body['label'] ?? '');
        if ($newLabel !== '') $users[$target]['label'] = $newLabel;
        applyPages($users, $target, $body, $actorName);
        if (isset($body['states']) || !empty($body['all_states'])) {
            $cs = !empty($body['all_states']) ? [] : cleanStates($body['states']);
            if ($cs === null) { echo json_encode(['ok' => false, 'error' => 'Choose at least one state.']); exit; }
            unset($users[$target]['states'], $users[$target]['sheet_zone'], $users[$target]['sheet_zones'], $users[$target]['zones'], $users[$target]['ros']);   // (the older zone fields go too)
            if ($cs) $users[$target]['states'] = $cs;
        }
        writeUsers($usersFile, $users);
        echo json_encode(['ok' => true]);
        break;

    case 'import_officers':
        // Bulk-create HPCL (or Rohan Energy) Zone Officers and Regional Officers from a list (the client's Excel, read in the browser). dry_run = only check and report.
        $usersFile = __DIR__ . '/users.php';
        $users = usersLoad();
        [$actorName, $actorData] = actor($users, 'super');
        echo json_encode(importOfficers($users, $usersFile, $actorName, $actorData, $body));
        break;

    case 'convert_to_sales_areas':
        // One-time conversion of Regional Officers made before sales areas replaced districts: each gets the sales areas that follow from what they had
        // (the sales area named in the import sheet, else the sales areas of their districts, else the whole region). Safe to run again: only officers without sales areas change.
        $usersFile = __DIR__ . '/users.php';
        $users = usersLoad();
        [$actorName, $actorData] = actor($users, 'super');
        echo json_encode(convertToSalesAreas($users, $usersFile, $actorName, $actorData));
        break;

    case 'outlet_list':
    case 'outlet_lookup':
    case 'outlet_add':
    case 'outlet_update':
    case 'outlet_delete':
    case 'outlet_import':
        // Outlet profiles (an HPCL login per SAP number): a Super Admin manages all of them, an HPCL Zone Officer those of their regions.
        $users = usersLoad();
        try { outletApi($action, $body, outletActor($users, $body)); }
        catch (PDOException $e) {
            error_log('auth.php ' . $action . ': ' . $e->getMessage());
            denyJson(500, 'The outlet profiles could not be saved (database error). Please try again.');
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Unknown action.']);
}

// ── Outlet profiles ───────────────────────────────────────────────────────────────────

/** [username, data, isSuper, regions the actor may handle (null = every region), users]. The Super Admins (Rohan Energy / HPCL) and the HPCL Zone Officers. */
function outletActor(array $users, array $body): array {
    [$name, $data, $super] = actor($users, 'any');
    $csrf = (string)($body['csrf'] ?? '');
    if (empty($_SESSION['csrf_token']) || !hash_equals((string)$_SESSION['csrf_token'], $csrf)) denyJson(403, 'Invalid security token. Please refresh the page and try again.');
    // outlet profiles are HPCL logins: the super admins (Rohan Energy or HPCL) manage all of them, an HPCL Zone Officer the outlets of their regions
    if (!$super && ($data['org'] ?? null) !== 'hpcl') denyJson(403, 'Outlet profiles are managed by the Super Admin and the HPCL Zone Officers.');
    return [$name, $data, $super, $super ? null : officerRegions($data), $users];
}

/**
 * The HPCL Zone Officers an outlet goes under: the ones whose regions include the outlet's region (an officer made for a whole zone covers all its regions).
 * It follows the outlet list and the officers as they are right now, so a Zone Officer added later takes over their outlets at once.
 * Returns [region => [[username, label], ...], ...] and [username => [label, regions]].
 */
function outletZoneOfficers(array $users): array {
    $byRo = []; $officers = [];
    foreach ($users as $n => $u) {
        if (($u['role'] ?? '') !== 'zone' || ($u['org'] ?? null) !== 'hpcl' || userLevel($u) !== 'zone') continue;
        $regs = officerRegions($u);
        $officers[(string)$n] = ['label' => (string)($u['label'] ?? $n), 'regions' => $regs];
        foreach ($regs as $r) $byRo[$r][] = ['username' => (string)$n, 'label' => (string)($u['label'] ?? $n)];
    }
    return [$byRo, $officers];
}

/** ' AND <col> IN (regions)' limiting outlets to the actor's regions (nothing for the Super Admin). */
function outletScopeSql(?array $regions, string $col = 'o.ro'): array {
    if ($regions === null) return ['', []];
    if (!$regions) return [' AND 1 = 0', []];
    return [' AND ' . $col . ' IN (' . implode(',', array_fill(0, count($regions), '?')) . ')', array_values($regions)];
}

/** The regions the actor can pick from (all of them for the Super Admin). */
function outletRegions(?array $regions): array {
    if ($regions !== null) return array_values($regions);
    $out = [];
    foreach (sheetZones() as $z) foreach ($z['ros'] as $r) $out[] = $r;
    return array_values(array_unique($out));
}

function outletLike(string $q): string { return '%' . addcslashes($q, '%_\\') . '%'; }

/** The outlet (from the outlet list) a profile would belong to: ['ok' => outlet row] or ['err' => message]. */
function outletCheckOutlet(PDO $pdo, string $sap, ?array $regions): array {
    if (!preg_match('/^\d{6,12}$/', $sap)) return ['err' => 'Enter a valid SAP number (digits only).'];
    $st = $pdo->prepare("SELECT sap_code, outlet_name, zone, ro, sales_area, state, district FROM portal_outlets WHERE sap_code = ?");
    $st->execute([$sap]);
    $o = $st->fetch();
    if (!$o) return ['err' => 'This SAP number is not in the outlet list. Add it on the SAP Numbers page first.'];
    if ($regions !== null && !in_array($o['ro'], $regions, true)) return ['err' => 'This outlet is in the ' . $o['ro'] . ' region, which is not one of yours.'];
    return ['ok' => $o];
}

function outletApi(string $action, array $body, array $who): void {
    [$actorName, $actorData, $isSuper, $regions, $users] = $who;
    [$zoByRo, $zoList] = outletZoneOfficers($users);
    $pdo = ouDb();
    ouEnsure($pdo);

    switch ($action) {
        case 'outlet_list': {
            $q = trim((string)($body['q'] ?? ''));
            $ro = trim((string)($body['ro'] ?? ''));
            $per = min(1000, max(10, (int)($body['per'] ?? 50)));
            $page = max(1, (int)($body['page'] ?? 1));
            [$sc, $sp] = outletScopeSql($regions);
            $where = '1 = 1' . $sc; $par = $sp;
            if ($ro !== '') { $where .= ' AND o.ro = ?'; $par[] = $ro; }
            $zo = trim((string)($body['zo'] ?? ''));
            if ($zo === '__none') {   // outlets no HPCL Zone Officer covers
                $cov = array_keys($zoByRo);
                if ($cov) { $where .= ' AND (o.ro IS NULL OR o.ro NOT IN (' . implode(',', array_fill(0, count($cov), '?')) . '))'; $par = array_merge($par, $cov); }
            } elseif ($zo !== '') {
                $zr = $zoList[$zo]['regions'] ?? [];
                if (!$zr) $where .= ' AND 1 = 0';
                else { $where .= ' AND o.ro IN (' . implode(',', array_fill(0, count($zr), '?')) . ')'; $par = array_merge($par, $zr); }
            }
            if ($q !== '') { $where .= " AND (u.sap_code LIKE ? OR u.label LIKE ?)"; $par[] = outletLike($q); $par[] = outletLike($q); }
            $from = "FROM `" . OU_T . "` u LEFT JOIN portal_outlets o ON o.sap_code = u.sap_code WHERE $where";
            $c = $pdo->prepare("SELECT COUNT(*) $from"); $c->execute($par);
            $total = (int)$c->fetchColumn();
            $st = $pdo->prepare("SELECT u.sap_code, u.label, u.pass_view, u.pass_by, u.pass_at, u.created_by, o.zone, o.ro, o.sales_area, o.state $from ORDER BY u.label, u.sap_code LIMIT $per OFFSET " . (($page - 1) * $per));
            $st->execute($par);
            $rows = [];
            foreach ($st->fetchAll() as $r) {
                $rows[] = ['sap_code' => $r['sap_code'], 'label' => $r['label'], 'zone' => (string)$r['zone'], 'ro' => (string)$r['ro'], 'sales_area' => (string)$r['sales_area'], 'state' => (string)$r['state'],
                           'password' => passView(['pass_view' => $r['pass_view']]) ?? '', 'pass_by' => (string)$r['pass_by'], 'pass_at' => (string)$r['pass_at'], 'created_by' => (string)$r['created_by'],
                           'zone_officers' => $zoByRo[(string)$r['ro']] ?? []];
            }
            $o = $pdo->prepare("SELECT COUNT(*) FROM portal_outlets o WHERE 1 = 1" . $sc); $o->execute($sp);
            $m = $pdo->prepare("SELECT COUNT(*) FROM `" . OU_T . "` u JOIN portal_outlets o ON o.sap_code = u.sap_code WHERE 1 = 1" . $sc); $m->execute($sp);
            $cov = array_keys($zoByRo);
            $un = $pdo->prepare("SELECT COUNT(*) FROM `" . OU_T . "` u LEFT JOIN portal_outlets o ON o.sap_code = u.sap_code WHERE 1 = 1" . $sc . ($cov ? ' AND (o.ro IS NULL OR o.ro NOT IN (' . implode(',', array_fill(0, count($cov), '?')) . '))' : ''));
            $un->execute(array_merge($sp, $cov));
            $zoPick = [];
            foreach ($zoList as $n => $z) {
                if ($regions !== null && $n !== $actorName) continue;   // a Zone Officer only has themself to pick
                $zoPick[] = ['username' => $n, 'label' => $z['label']];
            }
            usort($zoPick, fn($a, $b) => strcasecmp($a['label'], $b['label']));
            echo json_encode(['ok' => true, 'total' => $total, 'page' => $page, 'per' => $per, 'rows' => $rows, 'regions' => outletRegions($regions), 'zos' => $zoPick, 'unassigned' => (int)$un->fetchColumn(),
                              'outlets' => (int)$o->fetchColumn(), 'profiles' => (int)$m->fetchColumn(), 'rule' => ['block' => OU_BLOCK, 'suffixes' => OU_SUFFIXES]]);
            return;
        }

        case 'outlet_lookup': {
            $sap = trim((string)($body['sap_code'] ?? ''));
            $chk = outletCheckOutlet($pdo, $sap, $regions);
            if (isset($chk['err'])) { echo json_encode(['ok' => false, 'error' => $chk['err']]); return; }
            $o = $chk['ok'];
            $e = $pdo->prepare("SELECT 1 FROM `" . OU_T . "` WHERE sap_code = ?"); $e->execute([$sap]);
            echo json_encode(['ok' => true, 'outlet' => $o, 'zone_officers' => $zoByRo[(string)$o['ro']] ?? [], 'exists' => (bool)$e->fetchColumn(), 'suggested' => ouRulePassword((string)$o['outlet_name'], 0)]);
            return;
        }

        case 'outlet_add': {
            $sap = trim((string)($body['sap_code'] ?? ''));
            $chk = outletCheckOutlet($pdo, $sap, $regions);
            if (isset($chk['err'])) { echo json_encode(['ok' => false, 'error' => $chk['err']]); return; }
            $o = $chk['ok'];
            $e = $pdo->prepare("SELECT 1 FROM `" . OU_T . "` WHERE sap_code = ?"); $e->execute([$sap]);
            if ($e->fetchColumn()) { echo json_encode(['ok' => false, 'error' => 'This outlet already has a profile.']); return; }
            $label = trim(preg_replace('/\s+/', ' ', (string)($body['label'] ?? '')));
            if ($label === '') $label = (string)$o['outlet_name'];
            $label = mb_substr($label, 0, 150);
            $pass = trim((string)($body['password'] ?? ''));
            if ($pass === '') $pass = ouRulePassword($label, 0);
            elseif (strlen($pass) < 8) { echo json_encode(['ok' => false, 'error' => 'Password must be at least 8 characters.']); return; }
            $pdo->prepare("INSERT INTO `" . OU_T . "` (sap_code, label, pass, pass_view, pass_by, pass_at, created_by, created_at) VALUES (?,?,?,?,?,NOW(),?,NOW())")
                ->execute([$sap, $label, ouHash($pass), passSeal($pass) ?: null, $actorName, $actorName]);
            echo json_encode(['ok' => true]);
            return;
        }

        case 'outlet_update': {
            $sap = trim((string)($body['sap_code'] ?? ''));
            $chk = outletCheckOutlet($pdo, $sap, $regions);
            if (isset($chk['err'])) { echo json_encode(['ok' => false, 'error' => $chk['err']]); return; }
            $e = $pdo->prepare("SELECT label FROM `" . OU_T . "` WHERE sap_code = ?"); $e->execute([$sap]);
            $cur = $e->fetchColumn();
            if ($cur === false) { echo json_encode(['ok' => false, 'error' => 'Profile not found.']); return; }
            $label = mb_substr(trim(preg_replace('/\s+/', ' ', (string)($body['label'] ?? ''))), 0, 150);
            if ($label !== '' && $label !== $cur) $pdo->prepare("UPDATE `" . OU_T . "` SET label = ? WHERE sap_code = ?")->execute([$label, $sap]);
            $pass = trim((string)($body['password'] ?? ''));
            if ($pass !== '') {
                if (strlen($pass) < 8) { echo json_encode(['ok' => false, 'error' => 'Password must be at least 8 characters.']); return; }
                $pdo->prepare("UPDATE `" . OU_T . "` SET pass = ?, pass_view = ?, pass_by = ?, pass_at = NOW() WHERE sap_code = ?")
                    ->execute([ouHash($pass), passSeal($pass) ?: null, $actorName, $sap]);
            }
            echo json_encode(['ok' => true]);
            return;
        }

        case 'outlet_delete': {
            // the ticked profiles, or - with "all" - every profile of the current search / region filter (inside the actor's regions)
            [$sc, $sp] = outletScopeSql($regions);
            if (!empty($body['all'])) {
                $where = '1 = 1' . $sc; $par = $sp;
                $ro = trim((string)($body['ro'] ?? '')); $q = trim((string)($body['q'] ?? ''));
                if ($ro !== '') { $where .= ' AND o.ro = ?'; $par[] = $ro; }
                $zo = trim((string)($body['zo'] ?? ''));
                if ($zo === '__none') {
                    $cov = array_keys($zoByRo);
                    if ($cov) { $where .= ' AND (o.ro IS NULL OR o.ro NOT IN (' . implode(',', array_fill(0, count($cov), '?')) . '))'; $par = array_merge($par, $cov); }
                } elseif ($zo !== '') {
                    $zr = $zoList[$zo]['regions'] ?? [];
                    if (!$zr) $where .= ' AND 1 = 0';
                    else { $where .= ' AND o.ro IN (' . implode(',', array_fill(0, count($zr), '?')) . ')'; $par = array_merge($par, $zr); }
                }
                if ($q !== '') { $where .= ' AND (u.sap_code LIKE ? OR u.label LIKE ?)'; $par[] = outletLike($q); $par[] = outletLike($q); }
                $d =$pdo->prepare("DELETE u FROM `" . OU_T . "` u LEFT JOIN portal_outlets o ON o.sap_code = u.sap_code WHERE $where");
                $d->execute($par);
            } else {
                $list = array_values(array_unique(array_filter(array_map('strval', (array)($body['sap_codes'] ?? [])), fn($x) => preg_match('/^\d{6,12}$/', $x))));
                if (!$list) { echo json_encode(['ok' => false, 'error' => 'Nothing selected.']); return; }
                $d = $pdo->prepare("DELETE u FROM `" . OU_T . "` u LEFT JOIN portal_outlets o ON o.sap_code = u.sap_code WHERE u.sap_code IN (" . implode(',', array_fill(0, count($list), '?')) . ")" . $sc);
                $d->execute(array_merge($list, $sp));
            }
            echo json_encode(['ok' => true, 'deleted' => $d->rowCount()]);
            return;
        }

        case 'outlet_import': {
            // One slice of the Excel sheet (the browser sends it in slices of a few hundred rows). Each row: sap (the username), name (the outlet name),
            // idx (its position in the sheet, 0 = first row: it decides the 3 digits of the password). Existing profiles are left alone unless "reset" is set.
            @set_time_limit(300);
            $rows = is_array($body['rows'] ?? null) ? $body['rows'] : [];
            if (count($rows) > 500) { echo json_encode(['ok' => false, 'error' => 'Too many rows in one request.']); return; }
            $reset = !empty($body['reset']);
            $clean = []; $bad = 0;
            foreach ($rows as $r) {
                $sap = preg_replace('/\s+/', '', (string)($r['sap'] ?? ''));
                if (!preg_match('/^\d{6,12}$/', $sap) || isset($clean[$sap])) { $bad++; continue; }
                $clean[$sap] = ['name' => mb_substr(trim(preg_replace('/\s+/', ' ', (string)($r['name'] ?? ''))), 0, 150), 'idx' => max(0, (int)($r['idx'] ?? 0))];
            }
            $out = ['ok' => true, 'created' => 0, 'updated' => 0, 'kept' => 0, 'missing' => [], 'missing_n' => 0, 'outside' => 0, 'bad' => $bad];
            if ($clean) {
                $codes = array_keys($clean);
                $in = implode(',', array_fill(0, count($codes), '?'));
                $o = $pdo->prepare("SELECT sap_code, outlet_name, ro FROM portal_outlets WHERE sap_code IN ($in)"); $o->execute($codes);
                $outlets = []; foreach ($o->fetchAll() as $r) $outlets[$r['sap_code']] = $r;
                $x = $pdo->prepare("SELECT sap_code FROM `" . OU_T . "` WHERE sap_code IN ($in)"); $x->execute($codes);
                $have = array_flip($x->fetchAll(PDO::FETCH_COLUMN));
                $ins = $pdo->prepare("INSERT INTO `" . OU_T . "` (sap_code, label, pass, pass_view, pass_by, pass_at, created_by, created_at) VALUES (?,?,?,?,?,NOW(),?,NOW())");
                $upd = $pdo->prepare("UPDATE `" . OU_T . "` SET label = ?, pass = ?, pass_view = ?, pass_by = ?, pass_at = NOW() WHERE sap_code = ?");
                $pdo->beginTransaction();
                try {
                    foreach ($clean as $sap => $r) {
                        $sap = (string)$sap;
                        if (!isset($outlets[$sap])) { $out['missing_n']++; if (count($out['missing']) < 50) $out['missing'][] = $sap; continue; }
                        if ($regions !== null && !in_array($outlets[$sap]['ro'], $regions, true)) { $out['outside']++; continue; }
                        $name = $r['name'] !== '' ? $r['name'] : (string)$outlets[$sap]['outlet_name'];
                        $pw = ouRulePassword($name, $r['idx']);
                        if (isset($have[$sap])) {
                            if (!$reset) { $out['kept']++; continue; }
                            $upd->execute([$name, ouHash($pw), passSeal($pw) ?: null, $actorName, $sap]);
                            $out['updated']++;
                            continue;
                        }
                        $ins->execute([$sap, $name, ouHash($pw), passSeal($pw) ?: null, $actorName, $actorName]);
                        $out['created']++;
                    }
                    $pdo->commit();
                } catch (Throwable $e) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
                    throw $e;
                }
            }
            echo json_encode($out);
            return;
        }
    }
}

/**
 * Levels of an order officer. 'zone' = Zone Officer (made by the super admin: covers a whole zone), 'regional' = Regional Officer
 * (made by a Zone Officer: one region, some of its sales areas), '' = not an order officer. Officers made before levels existed count as Zone Officers.
 */
function userLevel(array $u): string {
    if (($u['role'] ?? '') !== 'zone' || !in_array($u['org'] ?? null, ['rohan', 'hpcl'], true)) return '';
    return ($u['level'] ?? '') === 'regional' ? 'regional' : 'zone';
}

function denyJson(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

/**
 * The signed-in user as stored in users.php right now (so a changed role takes effect at once): [username, data, isSuperAdmin].
 * $who: 'super' = super admin only, 'zone' = Zone Officers only, 'any' = either. Anyone else ends the request with 403.
 */
function actor(array $users, string $who): array {
    $name = (string)($_SESSION['hpcl_user']['username'] ?? '');
    if ($name === '' || !isset($users[$name])) denyJson(403, 'Access denied.');
    $u = $users[$name];
    $super = ($u['role'] ?? '') === 'superadmin';
    $zoneOfficer = userLevel($u) === 'zone';
    // 'rsuper' = the Rohan Energy super admin only (not the HPCL super admin)
    $ok = $who === 'super' ? $super : ($who === 'rsuper' ? ($super && !isHpclSuper($u)) : ($who === 'zone' ? $zoneOfficer : ($super || $zoneOfficer)));
    if (!$ok) denyJson(403, 'Access denied.');
    return [$name, $u, $super];
}

/**
 * E-mail and mobile sent with an edit (only the keys present are changed): ['email' => string|null, 'mobile' => string|null, 'error' => string|null].
 * An empty value clears the field; an e-mail must be valid and not belong to another account.
 */
function cleanContact(array $body, array $users, string $target): array {
    $out = ['email' => null, 'mobile' => null, 'error' => null];
    if (array_key_exists('email', $body)) {
        $e = strtolower(trim((string)$body['email']));
        if ($e !== '') {
            if (!filter_var($e, FILTER_VALIDATE_EMAIL)) { $out['error'] = 'Enter a valid e-mail address (or leave it empty).'; return $out; }
            foreach ($users as $n => $u) {
                if ((string)$n !== $target && strtolower((string)($u['email'] ?? '')) === $e) { $out['error'] = 'The e-mail ' . $e . ' already belongs to ' . ($u['label'] ?? $n) . '.'; return $out; }
            }
        }
        $out['email'] = $e;
    }
    if (array_key_exists('mobile', $body)) {
        $m = preg_replace('/\D+/', '', (string)$body['mobile']);
        if (strlen($m) === 12 && substr($m, 0, 2) === '91') $m = substr($m, 2);
        if ($m !== '' && (strlen($m) < 8 || strlen($m) > 13)) { $out['error'] = 'Enter a valid mobile number (or leave it empty).'; return $out; }
        $out['mobile'] = $m;
    }
    return $out;
}
/** Page access (Users & Zones -> Edit -> Page access): the pages (tab ids of the portal) switched OFF for a user. Only sent keys change; nobody changes their own. */
function applyPages(array &$users, string $target, array $body, string $actorName): void {
    if (!array_key_exists('hidden_pages', $body) || $target === $actorName || !isset($users[$target])) return;
    $h = is_array($body['hidden_pages']) ? array_values(array_unique(array_filter(array_map('strval', $body['hidden_pages']), fn($p) => in_array($p, PAGE_IDS, true)))) : [];
    if ($h) $users[$target]['hidden_pages'] = $h; else unset($users[$target]['hidden_pages']);
}
function applyContact(array &$users, string $target, array $cc): void {
    foreach (['email', 'mobile'] as $k) {
        if ($cc[$k] === null) continue;
        if ($cc[$k] === '') unset($users[$target][$k]); else $users[$target][$k] = $cc[$k];
    }
}

/**
 * Give an account a new username: the order tables that remember who placed / decided / uploaded something, the key in $users, and the places in users.php
 * that point at it (the Regional Officers' created_by, pass_by). Nothing is changed when the new username is not allowed or the database cannot be updated.
 * Returns an error message, or null (also when the username stays the same).
 */
function renameUser(array &$users, string $old, string $new): ?string {
    $new = trim($new);
    if ($new === '' || $new === $old) return null;
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $new) || strlen($new) > 40) return 'The username can only contain letters, numbers and underscores (up to 40).';
    if (in_array(strtolower($new), ['system', 'historical-import', 'superadmin'], true)) return 'That username is reserved.';
    foreach ($users as $n => $u) if ((string)$n !== $old && strtolower((string)$n) === strtolower($new)) return 'The username ' . $new . ' already exists.';
    try {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $pdo->beginTransaction();
        // every column of this database that remembers a username (orders, events, files, outlet log, audit log, the entry sheets' submitted_by / reviewed_by)
        $cols = $pdo->query("SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('created_by','decided_by','username','uploaded_by','submitted_by','reviewed_by')")->fetchAll();
        foreach ($cols as $tc) {
            $pdo->prepare("UPDATE `{$tc['t']}` SET `{$tc['c']}` = ? WHERE `{$tc['c']}` = ?")->execute([$new, $old]);
        }
        $pdo->commit();
    } catch (Exception $e) {
        if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
        error_log('auth.php rename: ' . $e->getMessage());
        return 'The orders linked to this username could not be updated, so nothing was changed. Please try again.';
    }
    $re = [];
    foreach ($users as $n => $u) {
        if (($u['created_by'] ?? null) === $old) $u['created_by'] = $new;
        if (($u['pass_by'] ?? null) === $old) $u['pass_by'] = $new;
        $re[(string)$n === $old ? $new : (string)$n] = $u;   // same place in the list
    }
    $users = $re;
    return null;
}

/** Usernames of the Regional Officers a Zone Officer created. */
function childrenOf(array $users, string $parent): array {
    $out = [];
    foreach ($users as $n => $u) if (userLevel($u) === 'regional' && ($u['created_by'] ?? '') === $parent) $out[] = (string)$n;
    return $out;
}

/** An HPCL super admin: a super admin account that belongs to HPCL. (The Rohan Energy super admins have no organisation.) */
function isHpclSuper(?array $u): bool {
    return $u !== null && ($u['role'] ?? '') === 'superadmin' && ($u['org'] ?? null) === 'hpcl';
}

/** May the actor edit / reset the password of / remove this account? The super admin any; the HPCL super admin only HPCL Zone / Regional Officers; a Zone Officer only the Regional Officers they created. */
function canManage(string $actorName, bool $super, array $target, ?array $actor = null): bool {
    if ($super) {
        if (isHpclSuper($actor)) {
            if (($target['role'] ?? '') !== 'zone' || ($target['org'] ?? null) !== 'hpcl') return false;
            $lim = superLimit($actor);   // made for some zones only: only the officers working in those
            return $lim === null || (bool)array_intersect(officerRegions($target), $lim);
        }
        return true;
    }
    return userLevel($target) === 'regional' && ($target['created_by'] ?? '') === $actorName;
}

/** The regions a Zone Officer can hand to a Regional Officer: their own (the whole zone when none are stored). */
function officerRegions(array $u): array {
    $ros = array_values(array_map('strval', (array)($u['ros'] ?? [])));
    if ($ros) return $ros;
    $out = [];
    foreach (userSheetZones($u) as $sz) if (isset(sheetZones()[$sz])) foreach (sheetZones()[$sz]['ros'] as $r) $out[] = $r;
    if ($out) return array_values(array_unique($out));
    foreach (userZones($u) as $z) foreach (zoneRegions($z) as $r) $out[] = $r;
    return array_values(array_unique($out));
}

/** region => its sales areas (SA), from the client's FY27 sheet (ORD_RO_SA in regions.php). Unknown regions get an empty list. */
function regionSalesAreas(array $ros): array {
    $out = [];
    foreach ($ros as $r) $out[$r] = array_values(ORD_RO_SA[$r] ?? []);
    return $out;
}

/** Comparable form of a sales-area name for matching: upper case, runs of spaces made one ("MUZAFFARPUR  RETAIL" = "MUZAFFARPUR RETAIL"). */
function saKey(string $s): string {
    return strtoupper(trim(preg_replace('/\s+/', ' ', $s)));
}

/** The region and sales areas sent for a Regional Officer: [region, sales areas, null] or [null, null, error message]. */
function cleanRegional(array $body, array $allowedRegions): array {
    $ro = trim((string)($body['ro'] ?? ''));
    if ($ro === '' || !in_array($ro, $allowedRegions, true)) return [null, null, 'Choose one of the regions of the zone.'];
    $want = is_array($body['sales_areas'] ?? null) ? array_values(array_unique(array_map(fn($x) => saKey((string)$x), $body['sales_areas']))) : [];
    $have = regionSalesAreas([$ro])[$ro] ?? [];
    if (!$have) return [null, null, 'No sales areas are listed for this region.'];
    if (!$want) return [null, null, 'Tick at least one sales area.'];
    $keys = array_map('saKey', $have);
    if (array_diff($want, $keys)) return [null, null, 'A ticked sales area does not belong to this region.'];
    return [$ro, array_values(array_filter($have, fn($a) => in_array(saKey($a), $want, true))), null];   // stored as written in the sheet
}

/** Key for the readable copy of passwords: derived from the database login in config.php, so it exists only on this server (never inside users.php). */
function passKey(): string {
    return hash('sha256', 'portal-pass-view|' . (defined('DB_PASS') ? DB_PASS : '') . '|' . (defined('DB_USER') ? DB_USER : '') . '|' . (defined('DB_NAME') ? DB_NAME : ''), true);
}

/** Encrypt a password for the readable copy (AES-256-GCM). Returns '' when OpenSSL is not available. */
function passSeal(string $plain): string {
    if (!function_exists('openssl_encrypt')) return '';
    $iv = random_bytes(12);
    $tag = '';
    $ct = openssl_encrypt($plain, 'aes-256-gcm', passKey(), OPENSSL_RAW_DATA, $iv, $tag);
    return $ct === false ? '' : base64_encode($iv . $tag . $ct);
}

/** The readable copy of an account's password, or null when there is none (the password was not set through the portal yet). */
function passView(array $u): ?string {
    $raw = base64_decode((string)($u['pass_view'] ?? ''), true);
    if ($raw === false || strlen($raw) < 29 || !function_exists('openssl_decrypt')) return null;
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', passKey(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $plain === false ? null : $plain;
}

/**
 * Set an account's password: the bcrypt hash the login checks, the readable copy the people above the account can see
 * (not kept for a super admin), and who set it and when.
 */
function setPassword(array &$users, string $target, string $plain, string $by): void {
    $users[$target]['pass'] = password_hash($plain, PASSWORD_BCRYPT);
    unset($users[$target]['pass_view']);
    if (($users[$target]['role'] ?? '') !== 'superadmin') {
        $sealed = passSeal($plain);
        if ($sealed !== '') $users[$target]['pass_view'] = $sealed;
    }
    $users[$target]['pass_by'] = $by;
    $users[$target]['pass_at'] = date('Y-m-d H:i:s');
}

/** May the actor read this account's password? Super admin: any account that is not a super admin; a Zone Officer: the Regional Officers they made. */
function canViewPassword(string $actorName, bool $super, string $targetName, array $target, ?array $actor = null): bool {
    if ($targetName === $actorName) return false;
    if ($super) return ($target['role'] ?? '') !== 'superadmin' && canManage($actorName, true, $target, $actor);
    return canManage($actorName, false, $target);
}

function writeUsers(string $file, array $users): void {
    usersWrite($users);   // atomic, verified; stops with an error message when it cannot save
}

/**
 * Validate the organization of a user for the order workflow.
 * '' / null → no organization. 'rohan' | 'hpcl' are only valid for the Zone role with a known zone.
 * Returns null, 'rohan', 'hpcl', or false when invalid.
 */
function validateOrg($org, string $role, $filter) {
    $org = is_string($org) ? trim($org) : '';
    if ($org === '') return null;
    if (!in_array($org, ['rohan', 'hpcl'], true)) return false;
    $zones = array_keys(ORD_ZONES);
    if ($role !== 'zone' || !is_array($filter) || !in_array($filter['zone'] ?? '', $zones, true)) return false;
    return $org;
}

/** The zones of the client's Master Sheet, each with its regions (regional offices) and the portal zone it belongs to - the list lives in regions.php. */
function sheetZones(): array {
    return ORD_SHEET_ZONES;
}

/** Regional offices (regions) of a portal zone: every region of the Master Sheet zones that belong to it. */
function zoneRegions(string $zone): array {
    $out = [];
    foreach (ORD_SHEET_ZONES as $d) if ($d['zone'] === $zone) foreach ($d['ros'] as $r) $out[] = $r;
    return $out;
}

/**
 * Validate the regions chosen for an order user: they must all belong to the user's zone, and at least one is required.
 * Returns the clean list ([] for users without an organisation), or false when invalid.
 */
function validateRos($org, $filter, $ros, string $sheetZone = '') {
    if ($org === null) return [];
    $valid = $sheetZone !== '' ? (sheetZones()[$sheetZone]['ros'] ?? []) : zoneRegions(is_array($filter) ? (string)($filter['zone'] ?? '') : '');
    $ros = is_array($ros) ? array_values(array_unique(array_map('strval', $ros))) : [];
    if (!$ros || array_diff($ros, $valid)) return false;
    return array_values(array_intersect($valid, $ros));
}

/** Portal zones an account covers: its 'zones' list, else the one zone of its filter. */
function userZones(array $u): array {
    $z = array_values(array_unique(array_filter(array_map('strval', (array)($u['zones'] ?? [])), fn($x) => $x !== '')));
    if ($z) return $z;
    $f = is_array($u['filter'] ?? null) ? (string)($u['filter']['zone'] ?? '') : '';
    return $f !== '' ? [$f] : [];
}

/** Master Sheet zones (Bhopal Zone, ...) an account covers: its 'sheet_zones' list, else its one 'sheet_zone'. */
function userSheetZones(array $u): array {
    $s = array_values(array_unique(array_filter(array_map('strval', (array)($u['sheet_zones'] ?? [])), fn($x) => $x !== '')));
    if ($s) return $s;
    $one = (string)($u['sheet_zone'] ?? '');
    return $one !== '' ? [$one] : [];
}

/** The Master Sheet zone / portal zone a region belongs to ($fallback when the region is unknown). */
function regionSheetZone(string $ro, string $fallback = ''): string {
    foreach (sheetZones() as $n => $z) if (in_array($ro, $z['ros'], true)) return $n;
    return $fallback;
}
function regionPortalZone(string $ro, string $fallback = ''): string {
    $n = regionSheetZone($ro);
    return $n !== '' ? sheetZones()[$n]['zone'] : $fallback;
}

/**
 * The zones picked for an officer / HPCL super admin: body "sheet_zones" (a list; the old single "sheet_zone" still works) and optionally "ros" =
 * the regions ticked inside them (none sent = every region of the zones). A zone with no region ticked is dropped.
 * $limitRos = the regions the person choosing may hand out (an HPCL super admin made for some zones only), or null.
 * Returns [Master Sheet zones, portal zones, regions, error message|null].
 */
function cleanZones(array $body, ?array $limitRos = null): array {
    $all = sheetZones();
    $sz = $body['sheet_zones'] ?? null;
    if (!is_array($sz)) $sz = trim((string)($body['sheet_zone'] ?? '')) !== '' ? [$body['sheet_zone']] : [];
    $sz = array_values(array_unique(array_filter(array_map(fn($x) => trim((string)$x), $sz), fn($x) => $x !== '')));
    if (!$sz) return [null, null, null, 'Choose at least one zone.'];
    $valid = [];
    foreach ($sz as $n) {
        if (!isset($all[$n])) return [null, null, null, 'Unknown zone.'];
        foreach ($all[$n]['ros'] as $r) $valid[] = $r;
    }
    if (isset($body['ros']) && is_array($body['ros'])) {
        $ros = array_values(array_unique(array_map('strval', $body['ros'])));
        if (!$ros || array_diff($ros, $valid)) return [null, null, null, 'Tick at least one region, and only regions of the chosen zones.'];
        $ros = array_values(array_intersect($valid, $ros));
    } else {
        $ros = $valid;
    }
    $sz = array_values(array_filter($sz, fn($n) => array_intersect($all[$n]['ros'], $ros)));
    if ($limitRos !== null && array_diff($ros, $limitRos)) return [null, null, null, 'You can only use the zones and regions you cover.'];
    $zones = [];
    foreach ($sz as $n) $zones[] = $all[$n]['zone'];
    return [$sz, array_values(array_unique($zones)), $ros, null];
}

/** What an HPCL super admin made for some zones stores (see cleanZones). */
function superScopeFields(array $cz): array {
    return ['sheet_zone' => $cz[0][0], 'sheet_zones' => $cz[0], 'zones' => $cz[1], 'ros' => $cz[2]];
}

/** The states picked for a super admin: the known ones only. [] = every state (all of them picked); null = nothing valid picked. */
function cleanStates($in): ?array {
    $all = approvalStateList();
    $s = array_values(array_intersect($all, array_map('strval', (array)$in)));
    if (!$s) return null;
    return count($s) === count($all) ? [] : $s;
}
/** The regions a super admin may manage: null = every region. A super admin's zones now only decide which pending orders it approves, so it is never limited here. */
function superLimit(?array $u): ?array {
    return null;
}

function genPassword(int $len = 10): string {
    $up = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; $lo = 'abcdefghijkmnpqrstuvwxyz'; $di = '23456789'; $all = $up . $lo . $di;
    $p = [$up[random_int(0, strlen($up) - 1)], $lo[random_int(0, strlen($lo) - 1)], $di[random_int(0, strlen($di) - 1)]];
    while (count($p) < $len) $p[] = $all[random_int(0, strlen($all) - 1)];
    for ($i = count($p) - 1; $i > 0; $i--) { $j = random_int(0, $i); [$p[$i], $p[$j]] = [$p[$j], $p[$i]]; }
    return implode('', $p);
}

/** A free username from the e-mail address (jane.doe@example.com -> jane_doe), else the name. $taken = lower-case usernames in use; the chosen one is added. */
function genUsername(string $email, string $name, array &$taken): string {
    $base = $email !== '' && strpos($email, '@') !== false ? substr($email, 0, strpos($email, '@')) : $name;
    $base = trim(strtolower(preg_replace('/[^a-z0-9]+/i', '_', $base)), '_');
    $base = substr($base !== '' ? $base : 'officer', 0, 30);
    $u = $base; $i = 2;
    while (isset($taken[$u])) $u = $base . $i++;
    $taken[$u] = true;
    return $u;
}

/** Comparable form of a sales-area name: "GWALIOR-II RETAIL  SA" and "GWALIOR-II RETAIL SA" -> ['GWALIOR','2']; RETAIL / SA / S/A are dropped. */
function saTokens(string $s): array {
    $s = strtoupper(str_replace(['-', '/', '.', ','], ' ', $s));
    $out = [];
    foreach (preg_split('/\s+/', trim($s)) ?: [] as $t) {
        if ($t === '' || in_array($t, ['RETAIL', 'SA', 'S', 'A'], true)) continue;
        $out[] = ['I' => '1', 'II' => '2', 'III' => '3'][$t] ?? $t;
    }
    return $out;
}

/** The sales areas a person handles, from the sales area named in the officer sheet (e.g. "Etah S/A"), matched to the region's list: [sales areas, how]. */
function salesAreasFor(string $ro, string $salesArea): array {
    $all = regionSalesAreas([$ro])[$ro] ?? [];
    $want = saTokens($salesArea);
    if ($want && $all) {
        $key = implode('', $want);
        $hit = array_values(array_filter($all, fn($a) => implode('', saTokens($a)) === $key));
        if ($hit) return [$hit, 'sales area'];
        $hit = array_values(array_filter($all, fn($a) => (saTokens($a)[0] ?? '') === $want[0]));   // INDORE EAST -> the INDORE-1 / INDORE-2 areas
        if ($hit) return [$hit, 'sales areas of ' . $want[0]];
        $best = null; $bestD = 3; $tie = false;   // a spelling slip (SHAHJAHANPUR / SHAHAJAHANPUR, RAIBAREILLY / RAIBARELI): the one area within 2 letters (doubled letters count once)
        $dbl = fn($x) => preg_replace('/(.)\1+/', '$1', $x);
        foreach ($all as $a) {
            $d = levenshtein($dbl($key), $dbl(implode('', saTokens($a))));
            if ($d < $bestD) { $best = $a; $bestD = $d; $tie = false; } elseif ($d === $bestD) $tie = true;
        }
        if ($best !== null && !$tie) return [[$best], 'sales area (spelling matched)'];
    }
    return [$all, $want ? 'whole region (the sales area "' . $salesArea . '" is not in this region)' : 'whole region (no sales area in the sheet)'];
}

/** The sales areas a Regional Officer made before sales areas existed should get: [sales areas, how]. */
function legacySalesAreas(array $u): array {
    static $pdo = null;
    $ro = (string)(((array)($u['ros'] ?? []))[0] ?? '');
    $all = regionSalesAreas([$ro])[$ro] ?? [];
    if (!$all) return [[], 'no sales areas are listed for the region'];
    $text = trim((string)($u['sales_area'] ?? ''));
    if ($text !== '') {
        [$hit] = salesAreasFor($ro, $text);
        if ($hit && count($hit) < count($all)) return [$hit, 'from the sales area in the import sheet'];
    }
    $dist = array_values(array_filter(array_map('strval', (array)($u['districts'] ?? [])), fn($d) => $d !== ''));
    if ($dist && empty($u['all_districts'])) {
        try {
            if ($pdo === null) $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
            $st = $pdo->prepare("SELECT DISTINCT sales_area FROM `portal_outlets` WHERE ro = ? AND district IN (" . implode(',', array_fill(0, count($dist), '?')) . ")");
            $st->execute(array_merge([$ro], $dist));
            $have = array_map('saKey', array_map('strval', $st->fetchAll(PDO::FETCH_COLUMN)));
            $hit = array_values(array_filter($all, fn($a) => in_array(saKey($a), $have, true)));
            if ($hit) return [$hit, 'from the sales areas of its districts'];
        } catch (Exception $e) {
            error_log('auth.php convert sales areas: ' . $e->getMessage());
        }
    }
    // an officer who had only some districts and whose districts match nothing is NOT widened to the whole region: they are left for the super admin to set by hand
    if ($dist && empty($u['all_districts'])) return [[], 'their districts match no sales area'];
    return [$all, 'the whole region (they had the whole region before)'];
}

/** Give every Regional Officer without sales areas (made before they replaced districts) the sales areas that follow from their old districts. */
function convertToSalesAreas(array $users, string $file, string $actorName, array $actor): array {
    $done = 0; $how = [];
    foreach ($users as $n => $u) {
        if (userLevel($u) !== 'regional' || !empty($u['sales_areas'])) continue;
        if (isHpclSuper($actor) && !canManage($actorName, true, $u, $actor)) continue;
        [$sas, $why] = legacySalesAreas($u);
        if (!$sas) continue;
        $users[$n]['sales_areas'] = array_values($sas);
        unset($users[$n]['districts'], $users[$n]['all_districts'], $users[$n]['sales_area']);
        $how[$why] = ($how[$why] ?? 0) + 1;
        $done++;
    }
    if ($done) writeUsers($file, $users);
    $left = 0;
    foreach ($users as $u) if (userLevel($u) === 'regional' && empty($u['sales_areas'])) $left++;
    return ['ok' => true, 'converted' => $done, 'how' => $how, 'left' => $left];
}

/**
 * Create the Zone Officers and Regional Officers in $body['rows'] (each: name, email, mobile, level 'zone'|'regional', ro, sales_area, zones).
 * Zone Officers first: one region each (the Regional Manager of that region, row has "ro") or whole zones (zonal coordinators, fulfilment managers: row has
 * "zones", a list of Master Sheet zone names). Then the Regional Officers under the Zone Officer who covers their region.
 * Usernames come from the e-mail address; every account gets IMPORT_PASSWORD (the super admin and the Zone Officer can read it in the user tables).
 * A person whose e-mail already belongs to an account is left alone, so the same sheet can be imported again. dry_run = report only, change nothing.
 * A Regional Officer gets the sales area (SA) named in the sheet, matched to the region's list; when none matches (or the sheet names none) the whole region.
 */
function importOfficers(array $users, string $file, string $actorName, array $actor, array $body): array {
    @set_time_limit(300);
    $dry  = !empty($body['dry_run']);
    $rows = is_array($body['rows'] ?? null) ? array_values($body['rows']) : [];
    if (!$rows) return ['ok' => false, 'error' => 'There is nobody to import.'];
    if (count($rows) > 600) return ['ok' => false, 'error' => 'Import at most 600 people at a time.'];
    $org = isHpclSuper($actor) ? 'hpcl' : (($body['org'] ?? 'hpcl') === 'rohan' ? 'rohan' : 'hpcl');
    $byRegion = ($body['areas_by'] ?? 'sales_area') === 'region';
    $lim = superLimit($actor);
    $sheet = sheetZones();
    $regionOk = [];
    foreach ($sheet as $z) foreach ($z['ros'] as $r) if ($lim === null || in_array($r, $lim, true)) $regionOk[$r] = true;

    $taken = [];
    $emails = [];
    foreach ($users as $n => $u) {
        $taken[strtolower((string)$n)] = true;
        if (!empty($u['email'])) $emails[strtolower((string)$u['email'])] = (string)$n;
    }
    $res = [];
    $clean = [];
    foreach ($rows as $i => $r) {
        $r = is_array($r) ? $r : [];
        $email = strtolower(trim((string)($r['email'] ?? '')));
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $email = '';
        $mobile = preg_replace('/\D+/', '', (string)($r['mobile'] ?? ''));
        if (strlen($mobile) === 12 && substr($mobile, 0, 2) === '91') $mobile = substr($mobile, 2);
        $zn = array_values(array_unique(array_filter(array_map(fn($x) => trim((string)$x), is_array($r['zones'] ?? null) ? $r['zones'] : []), fn($x) => $x !== '')));
        $clean[$i] = ['name' => mb_substr(trim(preg_replace('/\s+/', ' ', (string)($r['name'] ?? ''))), 0, 60), 'email' => $email, 'mobile' => strlen($mobile) >= 8 && strlen($mobile) <= 13 ? $mobile : '',
                      'level' => ($r['level'] ?? '') === 'zone' ? 'zone' : 'regional', 'ro' => trim((string)($r['ro'] ?? '')), 'sales_area' => trim((string)($r['sales_area'] ?? '')), 'zones' => $zn,
                      'states' => array_values(array_unique(array_filter(array_map(fn($x) => trim((string)$x), is_array($r['states'] ?? null) ? $r['states'] : []), fn($x) => $x !== '')))];
        $c = $clean[$i];
        $res[$i] = ['row' => $i, 'name' => $c['name'], 'email' => $c['email'], 'level' => $c['level'], 'ro' => $c['ro'], 'zones' => $c['zones'], 'sales_area' => $c['sales_area'],
                    'status' => 'error', 'username' => '', 'password' => '', 'parent' => '', 'sales_areas' => [], 'note' => ''];
    }
    $pw = IMPORT_PASSWORD;
    $hash = $dry ? '' : password_hash($pw, PASSWORD_BCRYPT);   // one hash for everybody: hashing hundreds of passwords one by one would be slow
    $sealed = passSeal($pw);
    $batchZo = [];   // Zone Officers created by this import
    foreach (['zone', 'regional'] as $level) {
        foreach ($clean as $i => $c) {
            if ($c['level'] !== $level) continue;
            $x = &$res[$i];
            if ($c['name'] === '') { $x['note'] = 'No name.'; unset($x); continue; }
            $wholeZones = $level === 'zone' && $c['zones'];   // a zonal coordinator / fulfilment manager: whole zones, not one region
            $cz = null;
            if ($wholeZones) {
                $cb = ['sheet_zones' => $c['zones']];
                if ($c['states']) {   // only the regions of these states inside the zones (e.g. "UP Head": Uttar Pradesh only, without the Uttarakhand region of the same zone)
                    $want = [];
                    foreach ($c['states'] as $stn) {
                        $k = strtolower(preg_replace('/\s+/', ' ', $stn)); $k = ['up' => 'uttar pradesh', 'uttar pardesh' => 'uttar pradesh', 'bihar full' => 'bihar'][$k] ?? $k;
                        $hit = false;
                        foreach (ORD_STATE_RO as $sn => $rs) if (strtolower($sn) === $k) { $hit = true; foreach ($rs as $r0) $want[] = $r0; }
                        if (!$hit) { $x['note'] = 'Unknown state "' . $stn . '".'; unset($x); continue 2; }
                    }
                    $in = [];
                    foreach ($c['zones'] as $zn0) foreach (($sheet[$zn0]['ros'] ?? []) as $r0) $in[] = $r0;
                    $cb['ros'] = array_values(array_intersect($in, $want));
                    if (!$cb['ros']) { $x['note'] = 'None of the regions of these zones is in the given state(s).'; unset($x); continue; }
                }
                $cz = cleanZones($cb, $lim);
                if ($cz[3]) { $x['note'] = $cz[3]; unset($x); continue; }
            } elseif (!isset($regionOk[$c['ro']])) { $x['note'] = $c['ro'] === '' ? 'No region.' : 'The region is not one of the portal regions' . ($lim !== null ? ' you cover' : '') . '.'; unset($x); continue; }
            if ($c['email'] !== '' && isset($emails[$c['email']])) { $x['status'] = 'exists'; $x['username'] = $emails[$c['email']]; $x['note'] = 'Already has an account (same e-mail).'; unset($x); continue; }
            $rec = ['role' => 'zone', 'label' => $c['name'], 'hidden_cols' => [], 'org' => $org, 'level' => $level, 'created_by' => $actorName];
            if ($wholeZones) {
                $rec['ros'] = $cz[2];
                $rec['filter'] = ['zone' => $cz[1][0]];
                $rec['sheet_zone'] = $cz[0][0];
                if (count($cz[0]) > 1) { $rec['sheet_zones'] = $cz[0]; $rec['zones'] = $cz[1]; }
                $x['zones'] = $cz[0];
                $x['parent'] = '';
                $x['sales_areas'] = [];
            } elseif ($level === 'zone') {
                $rec['ros'] = [$c['ro']];
                $rec['filter'] = ['zone' => regionPortalZone($c['ro'])];
                $rec['sheet_zone'] = regionSheetZone($c['ro']);
                $x['parent'] = '';
                $x['sales_areas'] = [];
            } else {
                // the Zone Officer who covers this region (the most specific one: a Regional Manager with just this region)
                $pn = null; $best = 9999;
                foreach ($users as $n => $u) {
                    if (userLevel($u) !== 'zone' || ($u['org'] ?? null) !== $org) continue;
                    $reg = officerRegions($u);
                    $score = count($reg) * 2 + (isset($batchZo[(string)$n]) ? 0 : 1);   // fewest regions first; the manager from this same sheet wins a tie
                    if (in_array($c['ro'], $reg, true) && $score < $best && ($lim === null || canManage($actorName, true, $u, $actor))) { $pn = (string)$n; $best = $score; }
                }
                if ($pn === null) { $x['note'] = 'No Zone Officer covers this region yet.'; unset($x); continue; }
                [$sas, $how] = $byRegion ? [regionSalesAreas([$c['ro']])[$c['ro']] ?? [], 'whole region'] : salesAreasFor($c['ro'], $c['sales_area']);
                if (!$sas) { $x['note'] = 'No sales areas are listed for this region.'; unset($x); continue; }
                $rec['filter'] = ['zone' => regionPortalZone($c['ro'], (string)($users[$pn]['filter']['zone'] ?? ''))];
                $rec['sheet_zone'] = regionSheetZone($c['ro'], (string)($users[$pn]['sheet_zone'] ?? ''));
                $rec['ros'] = [$c['ro']];
                $rec['created_by'] = $pn;
                $rec['sales_areas'] = array_values($sas);
                $x['parent'] = (string)($users[$pn]['label'] ?? $pn);
                $x['sales_areas'] = array_values($sas);
                $x['note'] = 'Sales areas: ' . $how . '.';
            }
            if ($c['email'] !== '') $rec['email'] = $c['email'];
            if ($c['mobile'] !== '') $rec['mobile'] = $c['mobile'];
            $un = genUsername($c['email'], $c['name'], $taken);
            $users[$un] = $rec;
            if ($c['email'] !== '') $emails[$c['email']] = $un;
            $x['status'] = 'created';
            $x['username'] = $un;
            if ($level === 'zone') $batchZo[$un] = true;
            if (!$dry) {
                $users[$un]['pass'] = $hash;
                if ($sealed !== '') $users[$un]['pass_view'] = $sealed;   // the readable copy the people above the account can see
                $users[$un]['pass_by'] = $actorName;
                $users[$un]['pass_at'] = date('Y-m-d H:i:s');
                $x['password'] = $pw;
            }
            unset($x);
        }
    }
    $counts = ['created' => 0, 'exists' => 0, 'error' => 0];
    foreach ($res as $x) $counts[$x['status']]++;
    if (!$dry && $counts['created']) writeUsers($file, $users);
    return ['ok' => true, 'dry_run' => $dry, 'org' => $org, 'counts' => $counts, 'results' => array_values($res)];
}

/**
 * Export array as clean PHP code (not var_export's ugly format).
 */
function var_export_short(array $arr): string {
    $lines = ["["];
    foreach ($arr as $key => $val) {
        $k = var_export($key, true);
        $inner = [];
        foreach ($val as $vk => $vv) {
            if ($vv === null) {
                $inner[] = var_export($vk, true) . '=>null';
            } elseif (is_array($vv)) {
                $parts = [];
                $isIndexed = array_keys($vv) === range(0, count($vv) - 1);
                foreach ($vv as $ak => $av) {
                    $parts[] = $isIndexed ? var_export($av, true) : (var_export($ak, true) . '=>' . var_export($av, true));
                }
                $inner[] = var_export($vk, true) . '=>[' . implode(',', $parts) . ']';
            } else {
                $inner[] = var_export($vk, true) . '=>' . var_export($vv, true);
            }
        }
        $lines[] = "    {$k} => [" . implode(', ', $inner) . "],";
    }
    $lines[] = "]";
    return implode("\n", $lines);
}
