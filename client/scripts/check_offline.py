"""Flag runtime network references in the Android client source."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SCAN = [ROOT / 'app', ROOT / 'src']
PATTERNS = [r'https?://', r'\bfetch\s*\(', r'\bXMLHttpRequest\b', r'\bWebSocket\b', r'\baxios\b', r'\bFirebase\b', r'\bSupabase\b']
findings = []
for base in SCAN:
    if not base.exists():
        continue
    for path in base.rglob('*'):
        if path.suffix not in ('.ts', '.tsx', '.js', '.jsx'):
            continue
        for no, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if any(re.search(p, line, re.I) for p in PATTERNS):
                findings.append(f'{path.relative_to(ROOT)}:{no}: {line.strip()[:120]}')
if findings:
    print('\n'.join(findings))
    sys.exit(1)
print('No runtime network references found in app/ or src/.')
