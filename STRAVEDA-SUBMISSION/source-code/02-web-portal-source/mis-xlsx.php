<?php
/**
 * mis-xlsx.php — the pivot reports of the MIS and the Excel workbook download (used by mis.php).
 *
 * The MIS workbook ("MIS MTD November 2026.xlsx") has one data sheet and three pivot-table report sheets. The portal keeps the data rows in
 * the database (portal_mis_rows); everything else is computed from them:
 *   - misPivotModel()  the numbers of the three report sheets (the page shows exactly this)
 *   - misBuildXlsx()   the workbook: mis-data/template.xlsx (the original file, untouched) with the data sheet, the three report sheets and the
 *                      pivot caches rewritten from the rows. Styles, column layout, hidden sheets, pivot tables and their formatting stay as they were.
 *                      The pivot cache is flagged "refresh on load", so Excel also recalculates the pivot tables itself when the file is opened.
 * Only PHP's zlib is needed (no ZipArchive / PhpSpreadsheet).
 */

const MIS_DATA_DIR  = __DIR__ . '/mis-data';
const MIS_MONTHS    = [1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr', 5 => 'May', 6 => 'Jun', 7 => 'Jul', 8 => 'Aug', 9 => 'Sep', 10 => 'Oct', 11 => 'Nov', 12 => 'Dec'];
// Shared-string numbers (xl/sharedStrings.xml of the template) of the fixed captions and month names used on the report sheets
const MIS_SST_MONTH = [4 => 789, 5 => 787, 6 => 786, 7 => 788, 8 => 1236, 9 => 1352, 10 => 2242, 11 => 2397];
// Row-field order inside the pivot cache: 6 State, 7 Sales Area, 8 Regional Office, 9 Zone, 10 Item Name
const MIS_FIELD_KEY = [6 => 'st', 7 => 'sa', 8 => 'ro', 9 => 'z', 10 => 'i'];
const MIS_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

// ── zip (store + deflate; reading follows the central directory) ─────────────────────────────────────────────────────
function misZipRead(string $path, ?array $only = null): array {
    $buf = @file_get_contents($path);
    if ($buf === false) throw new RuntimeException('Template workbook not found: ' . basename($path));
    $eocd = strrpos($buf, "PK\x05\x06");
    if ($eocd === false) throw new RuntimeException('Template workbook is not a valid .xlsx file.');
    $n = unpack('v', substr($buf, $eocd + 10, 2))[1];
    $off = unpack('V', substr($buf, $eocd + 16, 4))[1];
    $files = [];
    for ($i = 0; $i < $n; $i++) {
        $h = unpack('vmethod/vtime/vdate/Vcrc/Vcsize/Vsize/vnlen/velen/vclen', substr($buf, $off + 10, 32));
        $lho = unpack('V', substr($buf, $off + 42, 4))[1];
        $name = substr($buf, $off + 46, $h['nlen']);
        $off += 46 + $h['nlen'] + $h['elen'] + $h['clen'];
        if ($only !== null && !in_array($name, $only, true)) continue;
        $ln = unpack('vnlen/velen', substr($buf, $lho + 26, 4));
        $data = substr($buf, $lho + 30 + $ln['nlen'] + $ln['elen'], $h['csize']);
        if ($h['method'] === 8) { $data = gzinflate($data); if ($data === false) throw new RuntimeException('Corrupt template part ' . $name); }
        elseif ($h['method'] !== 0) throw new RuntimeException('Unsupported compression in the template.');
        if (substr($name, -1) !== '/') $files[$name] = $data;
    }
    return $files;
}
function misZipWrite(array $files): string {
    $out = ''; $cd = ''; $n = 0;
    $dt = getdate(); $time = ($dt['hours'] << 11) | ($dt['minutes'] << 5) | (int)($dt['seconds'] / 2); $date = ((max(1980, $dt['year']) - 1980) << 9) | ($dt['mon'] << 5) | $dt['mday'];
    foreach ($files as $name => $data) {
        $crc = crc32($data) & 0xFFFFFFFF; $size = strlen($data);
        $def = gzdeflate($data, 6); $method = 8;
        if ($def === false || strlen($def) >= $size) { $def = $data; $method = 0; }
        $csize = strlen($def);
        $local = pack('VvvvvvVVVvv', 0x04034b50, 20, 0x0800, $method, $time, $date, $crc, $csize, $size, strlen($name), 0) . $name;
        $cd .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, 0x0800, $method, $time, $date, $crc, $csize, $size, strlen($name), 0, 0, 0, 0, 0, strlen($out)) . $name;
        $out .= $local . $def; $n++;
    }
    return $out . $cd . pack('VvvvvVVv', 0x06054b50, 0, 0, $n, $n, strlen($cd), strlen($out), 0);
}

// ── small helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
function misColName(int $i): string { $s = ''; while ($i > 0) { $m = ($i - 1) % 26; $s = chr(65 + $m) . $s; $i = intdiv($i - 1, 26); } return $s; }
function misX(?string $s): string {
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', (string)$s);
    return htmlspecialchars($s, ENT_XML1 | ENT_COMPAT, 'UTF-8');
}
function misNum($v): string {
    if ($v === null) return '';
    $f = (float)$v;
    if ($f == floor($f) && abs($f) < 1e15) return (string)(int)$f;
    return rtrim(rtrim(number_format($f, 6, '.', ''), '0'), '.');
}
function misSerial(string $iso): int { return (int)floor((strtotime($iso . ' 00:00:00 UTC') - strtotime('1899-12-30 00:00:00 UTC')) / 86400); }
/** A worksheet cell. $kind: 'n' number | 'i' inline text | 'sst' shared string number | 'e' empty (style only) | 'f' formula ($v = [formula, cached number]) */
function misCell(string $ref, ?int $s, $v = null, string $kind = 'n'): string {
    $st = $s === null ? '' : ' s="' . $s . '"';
    if ($kind === 'e' || $v === null) return '<c r="' . $ref . '"' . $st . '/>';
    if ($kind === 'n') return '<c r="' . $ref . '"' . $st . '><v>' . misNum($v) . '</v></c>';
    if ($kind === 'sst') return '<c r="' . $ref . '"' . $st . ' t="s"><v>' . (int)$v . '</v></c>';
    if ($kind === 'f') return '<c r="' . $ref . '"' . $st . '><f>' . misX($v[0]) . '</f><v>' . misNum($v[1]) . '</v></c>';
    $t = (string)$v; $sp = ($t !== trim($t) || strpos($t, "\n") !== false) ? ' xml:space="preserve"' : '';
    return '<c r="' . $ref . '"' . $st . ' t="inlineStr"><is><t' . $sp . '>' . misX($t) . '</t></is></c>';
}
function misRow(int $r, array $cells, string $attrs = ''): string { return '<row r="' . $r . '"' . ($attrs !== '' ? ' ' . $attrs : '') . '>' . implode('', $cells) . '</row>'; }

function misDom(string $xml): DOMDocument {
    $d = new DOMDocument('1.0', 'UTF-8'); $d->preserveWhiteSpace = true; $d->formatOutput = false;
    if (!$d->loadXML($xml)) throw new RuntimeException('Template part is not valid XML.');
    return $d;
}
function misDomOut(DOMDocument $d): string {
    $x = $d->saveXML($d->documentElement);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\r\n" . $x;
}
function misXp(DOMDocument $d): DOMXPath { $x = new DOMXPath($d); $x->registerNamespace('m', MIS_NS); return $x; }

// ── the pivot cache (shared item lists of the row fields) ────────────────────────────────────────────────────────
class MisCache {
    public DOMDocument $dom;
    public DOMXPath $xp;
    /** @var array<int, array<int, array{v:?string,u:bool}>> field => shared items in cache order */
    public array $items = [];
    /** @var array<int, array<string,int>> field => value => index (current, not 'unused' items only) */
    private array $map = [];
    private array $blank = [];
    public function __construct(string $xml) {
        $this->dom = misDom($xml); $this->xp = misXp($this->dom);
        foreach (array_keys(MIS_FIELD_KEY) as $f) {
            $si = $this->sharedNode($f); $list = []; $this->map[$f] = []; $this->blank[$f] = null;
            foreach ($si->childNodes as $c) {
                if (!($c instanceof DOMElement)) continue;
                $i = count($list);
                if ($c->localName === 'm') { $list[] = ['v' => null, 'u' => false]; if ($this->blank[$f] === null) $this->blank[$f] = $i; }
                else {
                    $u = $c->getAttribute('u') === '1'; $v = $c->getAttribute('v'); $list[] = ['v' => $v, 'u' => $u];
                    if (!$u && !isset($this->map[$f][$v])) $this->map[$f][$v] = $i;
                }
            }
            $this->items[$f] = $list;
        }
    }
    public function sharedNode(int $f): DOMElement {
        $n = $this->xp->query('/m:pivotCacheDefinition/m:cacheFields/m:cacheField')->item($f);
        return $this->xp->query('m:sharedItems', $n)->item(0);
    }
    /** Index of a value in the field's shared list; a value that is not there yet is appended. */
    public function idx(int $f, ?string $v): int {
        if ($v === null || $v === '') {
            if ($this->blank[$f] === null) { $this->items[$f][] = ['v' => null, 'u' => false]; $this->blank[$f] = count($this->items[$f]) - 1; }
            return $this->blank[$f];
        }
        if (isset($this->map[$f][$v])) return $this->map[$f][$v];
        $this->items[$f][] = ['v' => $v, 'u' => false]; return $this->map[$f][$v] = count($this->items[$f]) - 1;
    }
}

/** One pivot table definition: knows the item list (display order) of its row fields; new shared items are appended at the end. */
class MisPivotDef {
    public DOMDocument $dom; public DOMXPath $xp;
    public function __construct(string $xml) { $this->dom = misDom($xml); $this->xp = misXp($this->dom); }
    private function field(int $k): DOMElement { return $this->xp->query('/m:pivotTableDefinition/m:pivotFields/m:pivotField')->item($k); }
    private function itemsNode(int $k): ?DOMElement { $n = $this->xp->query('m:items', $this->field($k))->item(0); return $n instanceof DOMElement ? $n : null; }
    /** @return array<int,array{x:int,h:bool,m:bool,def:bool}> in position order */
    public function items(int $k): array {
        $out = []; $node = $this->itemsNode($k); if (!$node) return $out;
        foreach ($node->childNodes as $c) {
            if (!($c instanceof DOMElement)) continue;
            $out[] = ['x' => (int)$c->getAttribute('x'), 'h' => $c->getAttribute('h') === '1', 'm' => $c->getAttribute('m') === '1', 'def' => $c->getAttribute('t') === 'default'];
        }
        return $out;
    }
    /** Make every (used) shared item of the field a pivot item; new ones go last (before the "default" subtotal item). */
    public function cover(int $k, MisCache $cache): void {
        $node = $this->itemsNode($k); if (!$node) return;
        $have = []; $def = null;
        foreach ($node->childNodes as $c) { if (!($c instanceof DOMElement)) continue; if ($c->getAttribute('t') === 'default') $def = $c; else $have[(int)$c->getAttribute('x')] = true; }
        foreach ($cache->items[$k] as $i => $it) {
            if ($it['u'] || isset($have[$i])) continue;
            $e = $this->dom->createElementNS(MIS_NS, 'item'); $e->setAttribute('x', (string)$i);
            if ($def) $node->insertBefore($e, $def); else $node->appendChild($e);
        }
        $node->setAttribute('count', (string)$this->xp->query('m:item', $node)->length);
    }
    /** An item flagged "missing" (m="1": no data any more) that data uses again is a normal item. */
    public function unmark(int $k, int $x): void {
        $node = $this->itemsNode($k); if (!$node) return;
        foreach ($node->childNodes as $c) if ($c instanceof DOMElement && $c->getAttribute('x') === (string)$x && $c->getAttribute('m') === '1') $c->removeAttribute('m');
    }
    /** The date column field lists one item per distinct date of the cache (plus the subtotal item). */
    public function setDateItems(int $n): void {
        $node = $this->itemsNode(0); if (!$node) return;
        while ($node->firstChild) $node->removeChild($node->firstChild);
        for ($i = 0; $i < $n; $i++) { $e = $this->dom->createElementNS(MIS_NS, 'item'); $e->setAttribute('x', (string)$i); $node->appendChild($e); }
        $e = $this->dom->createElementNS(MIS_NS, 'item'); $e->setAttribute('t', 'default'); $node->appendChild($e);
        $node->setAttribute('count', (string)($n + 1));
    }
    /** Replace rowItems / colItems and the location of the table. $items = list of ['t'=>null|'grand'|'default', 'r'=>int, 'x'=>[int...]] */
    public function setLayout(string $ref, array $rowItems, array $colItems): void {
        $this->xp->query('/m:pivotTableDefinition/m:location')->item(0)->setAttribute('ref', $ref);
        foreach (['rowItems' => $rowItems, 'colItems' => $colItems] as $tag => $list) {
            $n = $this->xp->query('/m:pivotTableDefinition/m:' . $tag)->item(0);
            while ($n->firstChild) $n->removeChild($n->firstChild);
            foreach ($list as $it) {
                $i = $this->dom->createElementNS(MIS_NS, 'i');
                if (!empty($it['t'])) $i->setAttribute('t', $it['t']);
                if (!empty($it['r'])) $i->setAttribute('r', (string)$it['r']);
                foreach ($it['x'] as $x) { $e = $this->dom->createElementNS(MIS_NS, 'x'); if ($x !== 0) $e->setAttribute('v', (string)$x); $i->appendChild($e); }
                $n->appendChild($i);
            }
            $n->setAttribute('count', (string)count($list));
        }
    }
}

// ── rows ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Row field value of a data row ('' / null = blank). */
function misRowVal(array $r, int $f): ?string { $v = $r[MIS_FIELD_KEY[$f]] ?? null; return ($v === null || $v === '') ? null : (string)$v; }

/**
 * The three report sheets, as a pivot table would show them.
 * $defs: [pivot id => MisPivotDef] with 3 (Region Wise), 4 (SA Wise), 5 (item x state), 6 (zone x state); the items of every row field are ranked by the
 * table's own item list, so the order is the one of the workbook (new values come last).
 * Returns [id => ['months' => [m...], 'rows' => [['k' => 'row'|'sub'|'grand', 'l' => [labels], 'c' => [month => number|null], 't' => total, 'pos' => [positions]]...]]]
 */
function misPivotModel(array $rows, array $defs, array $caches): array {
    $spec = [3 => [9, 8], 4 => [7], 5 => [10, 6], 6 => [9, 6]];
    $out = [];
    foreach ($spec as $pid => $fields) {
        $def = $defs[$pid]; $cache = $caches[$pid]; $rank = []; $hidden = []; $pos = []; $mItem = [];
        foreach ($fields as $f) {
            $def->cover($f, $cache);
            $rank[$f] = []; $hidden[$f] = []; $pos[$f] = [];
            foreach ($def->items($f) as $p => $it) {
                if ($it['def']) continue;
                $val = $cache->items[$f][$it['x']]['v'] ?? null; $key = $val === null ? "\0" : $val;
                if (!isset($rank[$f][$key])) { $rank[$f][$key] = $p; $pos[$f][$key] = $p; if ($it['h']) $hidden[$f][$key] = true; if ($it['m']) $mItem[$f][$key] = $it['x']; }
            }
            // the item x state table of the State wise sheet never shows a blank item (the workbook's own table has none)
            if ($pid === 5 && $f === 10) $hidden[$f][" "] = true;
        }
        $groups = []; $months = []; $tuples = [];
        foreach ($rows as $r) {
            $d = $r['d'] ?? null; if (!$d) continue;
            $months[(int)substr($d, 5, 2)] = true;   // every month that has a row is a column, as the column field of the workbook
            $key = []; $vals = []; $skip = false;
            foreach ($fields as $f) {
                $v = misRowVal($r, $f); $k = $v === null ? "\0" : $v;
                if (!isset($rank[$f][$k]) || isset($hidden[$f][$k])) { $skip = true; break; }
                $key[] = $k; $vals[] = $v;
            }
            if ($skip) continue;
            $m = (int)substr($d, 5, 2); $tk = implode("\x1f", $key);
            if (!isset($tuples[$tk])) {
                $tuples[$tk] = ['vals' => $vals, 'rk' => array_map(fn($f, $k) => $rank[$f][$k], $fields, $key), 'c' => []];
                foreach ($fields as $i => $f) if (isset($mItem[$f][$key[$i]])) { $def->unmark($f, $mItem[$f][$key[$i]]); unset($mItem[$f][$key[$i]]); }
            }
            $tuples[$tk]['c'][$m] = ($tuples[$tk]['c'][$m] ?? 0) + (float)($r['v'] ?? 0);
        }
        uasort($tuples, function ($a, $b) { foreach ($a['rk'] as $i => $x) if ($x !== $b['rk'][$i]) return $x <=> $b['rk'][$i]; return 0; });
        $ms = array_keys($months); sort($ms);
        $outRows = []; $grand = array_fill_keys($ms, null); $gt = 0.0;
        $addTo = function (array &$acc, array $c) { foreach ($c as $m => $v) $acc[$m] = ($acc[$m] ?? null) === null ? $v : $acc[$m] + $v; };
        $flushSub = function ($lbl, $subC, $p0) use (&$outRows) {
            $outRows[] = ['k' => 'sub', 'l' => [$lbl, null], 'c' => $subC, 't' => array_sum($subC), 'pos' => [$p0]];
        };
        $cur = null; $subC = []; $subPos = 0; $started = false;
        foreach ($tuples as $t) {
            if ($pid === 5) {
                $v0 = $t['vals'][0];
                if ($started && $v0 !== $cur) { $flushSub(($cur ?? '(blank)') . ' Total', $subC, $subPos); $subC = []; }
                $cur = $v0; $subPos = $t['rk'][0]; $started = true;
            }
            $c = []; foreach ($ms as $m) $c[$m] = array_key_exists($m, $t['c']) ? $t['c'][$m] : null;
            $outRows[] = ['k' => 'row', 'l' => array_map(fn($v) => $v ?? '(blank)', $t['vals']), 'c' => $c, 't' => array_sum($t['c']), 'pos' => $t['rk'], 'first' => null];
            $addTo($grand, $t['c']); $gt += array_sum($t['c']);
            if ($pid === 5) $addTo($subC, $t['c']);
        }
        if ($pid === 5 && $started) $flushSub(($cur ?? '(blank)') . ' Total', $subC, $subPos);
        $outRows[] = ['k' => 'grand', 'l' => ['Grand Total'], 'c' => $grand, 't' => $gt, 'pos' => []];
        // mark where the first label changes (rowItems / outline)
        $prev = null;
        foreach ($outRows as $i => &$o) {
            if ($o['k'] === 'row') { $o['first'] = ($prev !== ($o['pos'][0] ?? null)) && count($o['pos']) > 1; $prev = $o['pos'][0] ?? null; }
            elseif ($o['k'] === 'sub') $prev = null;
        }
        unset($o);
        $out[$pid] = ['months' => $ms, 'rows' => $outRows];
    }
    return $out;
}

// ── the workbook ──────────────────────────────────────────────────────────────────────────────────────────────────────
function misMonthHead(int $m, string $col, ?int $s, int $row): string {
    return isset(MIS_SST_MONTH[$m]) ? misCell($col . $row, $s, MIS_SST_MONTH[$m], 'sst') : misCell($col . $row, $s, MIS_MONTHS[$m], 'i');
}
/** Style by month: the template formats Mar-Jul one way, every later month another way. */
function misMS(int $m, int $early, ?int $late): ?int { return ($m >= 3 && $m <= 7) ? $early : $late; }

/** <cols> of a report sheet: the template's, with the month columns wide enough for the numbers and the total column in the right place. */
function misCols(string $colsXml, int $firstMonthCol, int $n, float $monthW, float $totalW): string {
    $cols = [];
    preg_match_all('/<col [^>]*\/>/', $colsXml, $mm);
    foreach ($mm[0] as $c) {
        preg_match('/min="(\d+)"/', $c, $a); preg_match('/max="(\d+)"/', $c, $b);
        for ($i = (int)$a[1]; $i <= min((int)$b[1], 120); $i++) $cols[$i] = preg_replace('/ (min|max)="\d+"/', '', $c);
    }
    $total = $firstMonthCol + $n;
    for ($i = $firstMonthCol; $i <= $total; $i++) {
        $base = $cols[$i] ?? '<col style="0" bestFit="1" customWidth="1"/>';
        $base = preg_replace('/ width="[\d.]+"/', '', $base);
        $w = max($i === $total ? $totalW : $monthW, (float)(preg_match('/width="([\d.]+)"/', $cols[$i] ?? '', $q) ? $q[1] : 0));
        $cols[$i] = preg_replace('/<col /', '<col width="' . $w . '" ', $base, 1);
    }
    ksort($cols);
    $out = '<cols>';
    foreach ($cols as $i => $c) $out .= preg_replace('/<col /', '<col min="' . $i . '" max="' . $i . '" ', $c, 1);
    return $out . '</cols>';
}

function misBuildXlsx(array $rows): string {
    // Excel only accepts the pivot tables when the data has an empty line (the workbook always ends with one): without it the file needs "repair".
    // Rows typed or uploaded by users never have one, so the empty line is added here, dated like the last row.
    $blank = false;
    foreach ($rows as $r) {
        $any = false;
        foreach (['t', 'o', 's', 'l', 'di', 'st', 'sa', 'ro', 'z', 'i', 'e', 'v'] as $k) if (($r[$k] ?? null) !== null && $r[$k] !== '') { $any = true; break; }
        if (!$any) { $blank = true; break; }
    }
    if (!$blank && $rows) {
        $last = ''; foreach ($rows as $r) if ($r['d'] > $last) $last = $r['d'];
        $rows[] = ['d' => $last, 't' => null, 'o' => null, 's' => null, 'l' => null, 'di' => null, 'st' => null, 'sa' => null, 'ro' => null, 'z' => null, 'i' => null, 'e' => null, 'v' => null, 'x' => null];
    }
    $files = misZipRead(MIS_DATA_DIR . '/template.xlsx');
    // the workbook has two pivot caches over the data sheet: #3 feeds Region Wise and SA Wise, #2 feeds the State wise sheet
    $caches = [3 => new MisCache($files['xl/pivotCache/pivotCacheDefinition3.xml']), 2 => new MisCache($files['xl/pivotCache/pivotCacheDefinition2.xml'])];
    $defs = [3 => new MisPivotDef($files['xl/pivotTables/pivotTable3.xml']), 4 => new MisPivotDef($files['xl/pivotTables/pivotTable4.xml']),
             5 => new MisPivotDef($files['xl/pivotTables/pivotTable5.xml']), 6 => new MisPivotDef($files['xl/pivotTables/pivotTable6.xml'])];
    $cacheOf = [3 => $caches[3], 4 => $caches[3], 5 => $caches[2], 6 => $caches[2]];

    // shared-item indexes of every row, in sheet order (this also appends the values the template does not know yet)
    foreach ($rows as $i => $r) foreach ($caches as $cn => $c) foreach (array_keys(MIS_FIELD_KEY) as $f) $rows[$i]['_x'][$cn][$f] = $c->idx($f, misRowVal($r, $f));
    $model = misPivotModel($rows, $defs, $cacheOf);

    // ── data sheet ──
    $head = $files['xl/worksheets/sheet2.xml'];
    $pre = substr($head, 0, strpos($head, '<sheetData>'));
    $hdrRow = preg_match('/<row r="1".*?<\/row>/s', $head, $hm) ? $hm[0] : '';
    $last = count($rows) + 1;
    $pre = preg_replace('/<dimension ref="[^"]*"\/>/', '<dimension ref="A1:M' . $last . '"/>', $pre);
    $defStyle = [24, 25, 26, 26, 25, 25, 25, 25, 25, 25, 26, 26, 25];
    $sd = $hdrRow; $dates = [];
    $textCols = [1 => 't', 2 => 'o', 4 => 'l', 5 => 'di', 6 => 'st', 7 => 'sa', 8 => 'ro', 9 => 'z', 10 => 'i'];
    foreach ($rows as $n => $r) {
        $rn = $n + 2; $xs = $r['x'] ?? ''; $st = $xs === '' || $xs === null ? $defStyle : array_map(fn($x) => $x === '' ? null : (int)$x, explode(',', $xs));
        if (count($st) < 13) $st = $defStyle;
        $c = [];
        $c[] = misCell('A' . $rn, $st[0], misSerial($r['d']));
        foreach ($textCols as $ci => $key) { $v = $r[$key] ?? null; if ($v !== null && $v !== '') $c[] = misCell(misColName($ci + 1) . $rn, $st[$ci], $v, 'i'); }
        $sap = $r['s'] ?? null;
        if ($sap !== null && $sap !== '') $c[] = is_numeric($sap) && !preg_match('/[eE.]/', (string)$sap) ? misCell('D' . $rn, $st[3], $sap) : misCell('D' . $rn, $st[3], (string)$sap, 'i');
        $ea = $r['e'] ?? null; $li = $r['v'] ?? null;
        if ($ea !== null && $ea !== '') $c[] = misCell('L' . $rn, $st[11], $ea);
        if ($li !== null && $li !== '') {
            if ($ea !== null && $ea !== '' && (float)$ea != 0 && abs((float)$li - (float)$ea * 20) < 0.005) $c[] = misCell('M' . $rn, $st[12], ['+L' . $rn . '*20', $li], 'f');
            else $c[] = misCell('M' . $rn, $st[12], $li);
        }
        $sd .= '<row r="' . $rn . '">' . misSortCells($c) . '</row>';
        $dates[$r['d']] = true;
    }
    $files['xl/worksheets/sheet2.xml'] = $pre . '<sheetData>' . $sd . '</sheetData>'
        . '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" r:id="rId1"/></worksheet>';

    // ── report sheets ──
    $dateList = array_keys($dates); sort($dateList);
    $defs[3]->setDateItems(count($dateList)); $defs[4]->setDateItems(count($dateList));
    misBuildReports($files, $model, $defs);

    // ── pivot caches (definition + records) ──
    misBuildCache($files, $caches[3], 3, $rows, $dateList, [13, 14], 'y');
    misBuildCache($files, $caches[2], 2, $rows, $dateList, [0, 13], 'Y');
    foreach ([3, 4, 5, 6] as $pid) $files['xl/pivotTables/pivotTable' . $pid . '.xml'] = misDomOut($defs[$pid]->dom);

    // the hidden filter name of the data sheet follows the data
    $files['xl/workbook.xml'] = str_replace('$M$2152', '$M$' . $last, $files['xl/workbook.xml']);
    // ── package: drop the calculation chain (Excel rebuilds it) ──
    unset($files['xl/calcChain.xml']);
    $files['[Content_Types].xml'] = preg_replace('/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/', '', $files['[Content_Types].xml']);
    $files['xl/_rels/workbook.xml.rels'] = preg_replace('/<Relationship [^>]*calcChain[^>]*\/>/', '', $files['xl/_rels/workbook.xml.rels']);
    return misZipWrite($files);
}

/** Cells of one row must be in column order. */
function misSortCells(array $cells): string {
    $key = function ($c) { preg_match('/r="([A-Z]+)\d+"/', $c, $m); $v = 0; foreach (str_split($m[1]) as $ch) $v = $v * 26 + ord($ch) - 64; return $v; };
    usort($cells, fn($a, $b) => $key($a) <=> $key($b));
    return implode('', $cells);
}

/** A run of empty styled cells (the blank cells of a pivot's header rows). */
function misBlanks(int $row, int $from, int $to, ?int $s): array { $o = []; for ($i = $from; $i <= $to; $i++) $o[] = misCell(misColName($i) . $row, $s, null, 'e'); return $o; }

function misBuildReports(array &$files, array $model, array $defs): void {
    // Region Wise (sheet6): zone / regional office x month. Columns: A zone, B regional office, months from C, grand total last.
    {
        $m = $model[3]; $ms = $m['months']; $n = count($ms); $x = $files['xl/worksheets/sheet6.xml']; $tc = 3 + $n; $L = misColName($tc);
        $rows = [misRow(2, array_merge([misCell('A2', 60, 2398, 'sst')], misBlanks(2, 2, $tc, 60)), 'ht="15"'),
                 misRow(3, array_merge([misCell('A3', 55, 62, 'sst'), misCell('B3', 2, null, 'e'), misCell('C3', 55, 790, 'sst')], misBlanks(3, 4, $tc, 2)))];
        $h = [misCell('A4', 2, null, 'e'), misCell('B4', 2, null, 'e')];
        foreach ($ms as $i => $mo) $h[] = misMonthHead($mo, misColName(3 + $i), 2, 4);
        $h[] = misCell($L . '4', 2, 61, 'sst');
        $rows[] = misRow(4, $h);
        $rows[] = misRow(5, misBlanks(5, 1, $tc, 2));
        $rows[] = misRow(6, array_merge([misCell('A6', 55, 60, 'sst'), misCell('B6', 55, 49, 'sst')], misBlanks(6, 3, $tc, 2)));
        $r = 7; $rowItems = [];
        foreach ($m['rows'] as $o) {
            $c = $o['k'] === 'grand' ? [misCell('A' . $r, 48, 61, 'sst'), misCell('B' . $r, 2, null, 'e')] : [misCell('A' . $r, 48, $o['l'][0], 'i'), misCell('B' . $r, 48, $o['l'][1], 'i')];
            foreach ($ms as $i => $mo) $c[] = misCell(misColName(3 + $i) . $r, 56, $o['c'][$mo] ?? null);
            $c[] = misCell($L . $r, 56, $o['t']);
            $rows[] = misRow($r, $c);
            if ($o['k'] === 'grand') $rowItems[] = ['t' => 'grand', 'x' => [0]];
            elseif ($o['first']) $rowItems[] = ['x' => [$o['pos'][0], $o['pos'][1]]];
            else $rowItems[] = ['r' => 1, 'x' => [$o['pos'][1]]];
            $r++;
        }
        $defs[3]->setLayout('A3:' . $L . ($r - 1), $rowItems, misColItems($ms));
        $x = preg_replace('/<mergeCell ref="[^"]*"\/>/', '<mergeCell ref="A2:' . $L . '2"/>', $x, 1);
        $files['xl/worksheets/sheet6.xml'] = misSheet($x, 'A2:' . $L . ($r - 1), implode('', $rows), misCols(misColsOf($x), 3, $n, 9.5, 12.5));
    }
    // SA Wise. (sheet7): sales area x month. Columns: A sales area, months from B, grand total last.
    {
        $m = $model[4]; $ms = $m['months']; $n = count($ms); $x = $files['xl/worksheets/sheet7.xml']; $tc = 2 + $n; $L = misColName($tc);
        $top = [misCell('A2', 57, 2398, 'sst')]; for ($i = 2; $i <= $tc; $i++) $top[] = misCell(misColName($i) . '2', $i === $tc ? 59 : 58, null, 'e');
        $rows = [misRow(2, $top, 'ht="15"'),
                 misRow(3, array_merge([misCell('A3', 55, 62, 'sst'), misCell('B3', 55, 790, 'sst')], misBlanks(3, 3, $tc, 2)), 'ht="25.5" customHeight="1"')];
        $h = [misCell('A4', 2, null, 'e')];
        foreach ($ms as $i => $mo) $h[] = misMonthHead($mo, misColName(2 + $i), 2, 4);
        $h[] = misCell($L . '4', 2, 61, 'sst');
        $rows[] = misRow(4, $h);
        $rows[] = misRow(5, misBlanks(5, 1, $tc, 2));
        $rows[] = misRow(6, array_merge([misCell('A6', 55, 60, 'sst')], misBlanks(6, 2, $tc, 2)));
        $r = 7; $rowItems = [];
        foreach ($m['rows'] as $o) {
            $c = [misCell('A' . $r, 48, $o['k'] === 'grand' ? 61 : $o['l'][0], $o['k'] === 'grand' ? 'sst' : 'i')];
            foreach ($ms as $i => $mo) $c[] = misCell(misColName(2 + $i) . $r, 56, $o['c'][$mo] ?? null);
            $c[] = misCell($L . $r, 56, $o['t']);
            $rows[] = misRow($r, $c);
            $rowItems[] = $o['k'] === 'grand' ? ['t' => 'grand', 'x' => [0]] : ['x' => [$o['pos'][0]]];
            $r++;
        }
        $defs[4]->setLayout('A3:' . $L . ($r - 1), $rowItems, misColItems($ms));
        $x = preg_replace('/<mergeCell ref="[^"]*"\/>/', '<mergeCell ref="A2:' . $L . '2"/>', $x, 1);
        $files['xl/worksheets/sheet7.xml'] = misSheet($x, 'A2:' . $L . ($r - 1), implode('', $rows), misCols(misColsOf($x), 2, $n, 9.5, 12.5));
    }
    // MOM Secondary Sales State wise. (sheet8): zone x state, then item x state
    {
        $m6 = $model[6]; $m5 = $model[5]; $x = $files['xl/worksheets/sheet8.xml'];
        $ms6 = $m6['months']; $n6 = count($ms6); $ms5 = $m5['months']; $n5 = count($ms5); $tc6 = 3 + $n6; $tc5 = 3 + $n5;
        $rows = [];
        $rows[] = misRow(2, array_merge([misCell('A2', 9, 792, 'sst'), misCell('C2', 17, 791, 'sst')], misBlanks(2, 8, $tc6, 18)), 'ht="31.5" customHeight="1"');
        $h = []; foreach ($ms6 as $i => $mo) $h[] = misMonthHead($mo, misColName(3 + $i), misMS($mo, 18, null), 3);
        $h[] = misCell(misColName($tc6) . '3', null, 61, 'sst');
        $rows[] = misRow(3, $h, 'ht="21" customHeight="1"');
        $rows[] = misRow(4, [misCell('A4', 9, 11, 'sst'), misCell('B4', 9, 47, 'sst')], 'ht="24.75" customHeight="1"');
        $r = 5; $rowItems = [];
        foreach ($m6['rows'] as $o) {
            if ($o['k'] === 'grand') {
                $c = [misCell('A' . $r, null, 61, 'sst')];
                foreach ($ms6 as $i => $mo) $c[] = misCell(misColName(3 + $i) . $r, misMS($mo, 28, 20), $o['c'][$mo] ?? null);
                $c[] = misCell(misColName($tc6) . $r, 20, $o['t']);
                $rows[] = misRow($r, $c, 'ht="19.5" customHeight="1"');
                $rowItems[] = ['t' => 'grand', 'x' => [0]];
            } else {
                $c = [misCell('A' . $r, null, $o['l'][0], 'i'), misCell('B' . $r, null, $o['l'][1], 'i')];
                foreach ($ms6 as $i => $mo) $c[] = misCell(misColName(3 + $i) . $r, misMS($mo, 19, 20), $o['c'][$mo] ?? null);
                $c[] = misCell(misColName($tc6) . $r, 20, $o['t']);
                $rows[] = misRow($r, $c);
                $rowItems[] = $o['first'] ? ['x' => [$o['pos'][0], $o['pos'][1]]] : ['r' => 1, 'x' => [$o['pos'][1]]];
            }
            $r++;
        }
        $end6 = $r - 1;
        $defs[6]->setLayout('A2:' . misColName($tc6) . $end6, $rowItems, misColItems($ms6));
        // second table (item x state) two empty rows below the first
        $r0 = $end6 + 3; $ra = 's="18" customFormat="1" ht="21" customHeight="1"';
        $rows[] = misRow($r0, array_merge([misCell('A' . $r0, 42, 62, 'sst'), misCell('B' . $r0, 43, null, 'e'), misCell('C' . $r0, 42, 790, 'sst')], misBlanks($r0, 4, $tc5, 43)), $ra);
        $h = [misCell('A' . ($r0 + 1), 43, null, 'e'), misCell('B' . ($r0 + 1), 43, null, 'e')];
        foreach ($ms5 as $i => $mo) $h[] = misMonthHead($mo, misColName(3 + $i), 43, $r0 + 1);
        $h[] = misCell(misColName($tc5) . ($r0 + 1), 43, 61, 'sst');
        $rows[] = misRow($r0 + 1, $h, $ra);
        $rows[] = misRow($r0 + 2, array_merge([misCell('A' . ($r0 + 2), 42, 60, 'sst'), misCell('B' . ($r0 + 2), 42, 47, 'sst')], misBlanks($r0 + 2, 3, $tc5, 43)), $ra);
        $r = $r0 + 3; $rowItems = [];
        foreach ($m5['rows'] as $o) {
            if ($o['k'] === 'grand') {
                $c = [misCell('A' . $r, 43, 61, 'sst'), misCell('B' . $r, 43, null, 'e')];
                $rowItems[] = ['t' => 'grand', 'x' => [0]];
            } elseif ($o['k'] === 'sub') {
                $c = [misCell('A' . $r, null, $o['l'][0], 'i')];
                $rowItems[] = ['t' => 'default', 'x' => [$o['pos'][0]]];
            } else {
                $c = [misCell('A' . $r, null, $o['l'][0], 'i'), misCell('B' . $r, null, $o['l'][1], 'i')];
                $rowItems[] = $o['first'] ? ['x' => [$o['pos'][0], $o['pos'][1]]] : ['r' => 1, 'x' => [$o['pos'][1]]];
            }
            foreach ($ms5 as $i => $mo) $c[] = misCell(misColName(3 + $i) . $r, 19, $o['c'][$mo] ?? null);
            $c[] = misCell(misColName($tc5) . $r, 19, $o['t']);
            $rows[] = misRow($r, $c, $ra);
            $r++;
        }
        $defs[5]->setLayout('A' . $r0 . ':' . misColName($tc5) . ($r - 1), $rowItems, misColItems($ms5));
        $files['xl/worksheets/sheet8.xml'] = misSheet($x, 'A2:' . misColName(max($tc5, $tc6)) . ($r - 1), implode('', $rows), misCols(misColsOf($x), 3, max($n5, $n6), 11.5, 13.3));
    }
}
function misColsOf(string $sheetXml): string { return preg_match('/<cols>.*?<\/cols>/s', $sheetXml, $m) ? $m[0] : '<cols></cols>'; }
/** colItems of a pivot: every month column (positions = month numbers), then the grand total. */
function misColItems(array $months): array {
    $o = [];
    foreach ($months as $m) $o[] = ['x' => [$m]];
    $o[] = ['t' => 'grand', 'x' => [0]];
    return $o;
}
/** A report sheet: its XML with the dimension, the columns and the cells replaced. Views, margins and page setup stay as in the template. */
function misSheet(string $x, string $dim, string $sheetData, string $cols): string {
    $x = preg_replace('/<dimension ref="[^"]*"\/>/', '<dimension ref="' . $dim . '"/>', $x, 1);
    $x = preg_replace_callback('/<cols>.*?<\/cols>/s', fn() => $cols, $x, 1);
    return preg_replace_callback('/<sheetData>.*<\/sheetData>/s', fn() => '<sheetData>' . $sheetData . '</sheetData>', $x, 1);
}

/**
 * One pivot cache: definition (dates, shared lists of the row fields, value kinds) and records (one per data row).
 * $cn = 3 or 2 (file number), $groupFields = the cache fields that group the dates (days / months), $yf = year format of their end labels ('y' 26, 'Y' 2026).
 */
function misBuildCache(array &$files, MisCache $cache, int $cn, array $rows, array $dates, array $groupFields, string $yf): void {
    $dom = $cache->dom; $xp = $cache->xp;
    $root = $dom->documentElement;
    $root->setAttribute('recordCount', (string)count($rows));
    $fields = $xp->query('/m:pivotCacheDefinition/m:cacheFields/m:cacheField');
    // dates: sorted, one shared item each
    $si = $xp->query('m:sharedItems', $fields->item(0))->item(0);
    // Excel refuses a day-grouped date field whose list lost its trailing blank item, so keep it exactly when the template has it
    $hadBlank = $si->getAttribute('containsBlank') === '1';
    while ($si->firstChild) $si->removeChild($si->firstChild);
    $first = $dates[0] ?? date('Y-m-d'); $lastD = end($dates) ?: $first; $end = date('Y-m-d', strtotime($lastD . ' +1 day'));
    foreach ($dates as $d) { $e = $dom->createElementNS(MIS_NS, 'd'); $e->setAttribute('v', $d . 'T00:00:00'); $si->appendChild($e); }
    if ($hadBlank) $si->appendChild($dom->createElementNS(MIS_NS, 'm'));
    else $si->removeAttribute('containsBlank');
    $si->setAttribute('minDate', $first . 'T00:00:00'); $si->setAttribute('maxDate', $end . 'T00:00:00'); $si->setAttribute('count', (string)(count($dates) + ($hadBlank ? 1 : 0)));
    $dateIdx = array_flip($dates);
    $lbl = fn($d) => date($yf === 'y' ? 'd-m-y' : 'd-m-Y', strtotime($d));
    foreach ($groupFields as $gf) {
        $rp = $xp->query('m:fieldGroup/m:rangePr', $fields->item($gf))->item(0);
        if (!$rp) continue;
        $rp->setAttribute('startDate', $first . 'T00:00:00'); $rp->setAttribute('endDate', $end . 'T00:00:00');
        $gi = $xp->query('m:fieldGroup/m:groupItems/m:s', $fields->item($gf));
        if ($gi->length) {
            if (strpos($gi->item(0)->getAttribute('v'), '<') === 0) $gi->item(0)->setAttribute('v', '<' . $lbl($first));
            if (strpos($gi->item($gi->length - 1)->getAttribute('v'), '>') === 0) $gi->item($gi->length - 1)->setAttribute('v', '>' . $lbl($end));
        }
    }
    // shared lists of the row fields (State .. Item Name): append what is new
    foreach (array_keys(MIS_FIELD_KEY) as $f) {
        $node = $cache->sharedNode($f); $have = 0;
        foreach ($node->childNodes as $c) if ($c instanceof DOMElement) $have++;
        for ($i = $have; $i < count($cache->items[$f]); $i++) {
            $it = $cache->items[$f][$i];
            if ($it['v'] === null) $e = $dom->createElementNS(MIS_NS, 'm');
            else { $e = $dom->createElementNS(MIS_NS, 's'); $e->setAttribute('v', $it['v']); }
            $node->appendChild($e);
        }
        $node->setAttribute('count', (string)count($cache->items[$f]));
        if ($cache->items[$f] && array_filter($cache->items[$f], fn($x) => $x['v'] === null)) $node->setAttribute('containsBlank', '1');
    }
    // text fields without a list, numeric fields: which kinds of value occur
    $kinds = function (string $key) use ($rows) {
        $b = false; $s = false; $n = false; $int = true; $min = null; $max = null;
        foreach ($rows as $r) {
            $v = $r[$key] ?? null;
            if ($v === null || $v === '') { $b = true; continue; }
            if (is_numeric($v) && !preg_match('/[eE]/', (string)$v) && ($key === 's' ? !preg_match('/[A-Za-z]/', (string)$v) : true)) { $n = true; $f = (float)$v; if ($f != floor($f)) $int = false; $min = $min === null ? $f : min($min, $f); $max = $max === null ? $f : max($max, $f); }
            else $s = true;
        }
        return compact('b', 's', 'n', 'int', 'min', 'max');
    };
    $setKinds = function (int $f, string $key) use ($xp, $fields, $kinds) {
        $si = $xp->query('m:sharedItems', $fields->item($f))->item(0); $k = $kinds($key);
        foreach (['containsBlank', 'containsString', 'containsMixedTypes', 'containsNumber', 'containsInteger', 'containsSemiMixedTypes', 'minValue', 'maxValue'] as $a) $si->removeAttribute($a);
        if (!$k['s']) $si->setAttribute('containsString', '0');
        if ($k['s'] && $k['n']) $si->setAttribute('containsMixedTypes', '1');
        if (!$k['s'] && $k['n'] && !$k['b']) $si->setAttribute('containsSemiMixedTypes', '0');
        if ($k['b']) $si->setAttribute('containsBlank', '1');
        if ($k['n']) { $si->setAttribute('containsNumber', '1'); if ($k['int']) $si->setAttribute('containsInteger', '1'); $si->setAttribute('minValue', misNum($k['min'])); $si->setAttribute('maxValue', misNum($k['max'])); }
    };
    foreach ([1 => 't', 2 => 'o', 4 => 'l', 5 => 'di'] as $f => $key) { $si = $xp->query('m:sharedItems', $fields->item($f))->item(0); $k = $kinds($key); if ($k['b']) $si->setAttribute('containsBlank', '1'); else $si->removeAttribute('containsBlank'); }
    $setKinds(3, 's'); $setKinds(11, 'e'); $setKinds(12, 'v');
    $files['xl/pivotCache/pivotCacheDefinition' . $cn . '.xml'] = misDomOut($dom);

    // records
    $rec = '';
    foreach ($rows as $r) {
        $o = '<r><x v="' . $dateIdx[$r['d']] . '"/>';
        foreach ([1 => 't', 2 => 'o'] as $f => $key) $o .= misRecText($r[$key] ?? null);
        $sap = $r['s'] ?? null;
        $o .= ($sap === null || $sap === '') ? '<m/>' : ((is_numeric($sap) && !preg_match('/[A-Za-z.]/', (string)$sap)) ? '<n v="' . misNum($sap) . '"/>' : '<s v="' . misX((string)$sap) . '"/>');
        $o .= misRecText($r['l'] ?? null) . misRecText($r['di'] ?? null);
        foreach ([6, 7, 8, 9, 10] as $f) $o .= '<x v="' . $r['_x'][$cn][$f] . '"/>';
        foreach (['e', 'v'] as $key) { $v = $r[$key] ?? null; $o .= ($v === null || $v === '') ? '<m/>' : '<n v="' . misNum($v) . '"/>'; }
        $rec .= $o . '</r>';
    }
    $name = 'xl/pivotCache/pivotCacheRecords' . $cn . '.xml';
    $old = $files[$name];
    $head = substr($old, 0, strpos($old, '<r>'));
    $head = preg_replace('/ count="\d+"/', ' count="' . count($rows) . '"', $head);
    $files[$name] = $head . $rec . '</pivotCacheRecords>';
}
function misRecText(?string $v): string { return ($v === null || $v === '') ? '<m/>' : '<s v="' . misX($v) . '"/>'; }
