#!/usr/bin/env python3
"""
Migrate AILANG ++ string concat to ${expr} interpolation (v0.12.1+).

Usage:
    python3 scripts/migrate_concat.py --dry-run path/to/file.ail
    python3 scripts/migrate_concat.py --write path/to/file.ail
    python3 scripts/migrate_concat.py --write path/to/dir/       # recursive
    python3 scripts/migrate_concat.py --write --stats path/

Rules (applied to each `++` chain at same nesting depth):
  "lit" ++ EXPR ++ "lit"          -> "lit${EXPR}lit"
  "lit" ++ show(EXPR) ++ "lit"    -> "lit${EXPR}lit"  (strips redundant show)
  "lit" ++ EXPR                   -> "lit${EXPR}"
  EXPR ++ "lit"                   -> "${EXPR}lit"

Safety:
  - Defers (leaves `++` untouched) any chain where a term contains
    if/then/else/match/let/lambda/nested-++.
  - Never edits inside string literals, comments, or block comments.
  - Refuses any string literal already containing `${`.
  - Preserves original source byte-for-byte outside of rewritten chains.

Exit code:
  0 on success, 1 on IO or tokenization errors.
"""

import argparse
import sys
from pathlib import Path

KIND_STRING = 'STRING'
KIND_LINE_COMMENT = 'LC'
KIND_BLOCK_COMMENT = 'BC'
KIND_IDENT = 'IDENT'
KIND_OP = 'OP'
KIND_PUNCT = 'PUNCT'
KIND_NUMBER = 'NUM'
KIND_WS = 'WS'
KIND_OTHER = 'OTHER'

SKIP_KINDS = (KIND_WS, KIND_LINE_COMMENT, KIND_BLOCK_COMMENT)
COMPLEX_KEYWORDS = {'if', 'then', 'else', 'match', 'let', 'do', 'fn', 'case', 'with'}
# Keywords that end a top-level expression (next decl begins)
DECL_KEYWORDS = {'func', 'export', 'import', 'module', 'type', 'class', 'instance',
                 'pure', 'then', 'else', 'in', 'return', 'tests', 'ensures', 'requires'}


def tokenize(src):
    tokens = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in ' \t\n\r':
            j = i
            while j < n and src[j] in ' \t\n\r':
                j += 1
            tokens.append((KIND_WS, src[i:j], i, j))
            i = j
        elif c == '-' and i + 1 < n and src[i + 1] == '-':
            j = src.find('\n', i)
            if j == -1:
                j = n
            tokens.append((KIND_LINE_COMMENT, src[i:j], i, j))
            i = j
        elif c == '{' and i + 1 < n and src[i + 1] == '-':
            j = i + 2
            depth = 1
            while j < n and depth > 0:
                if j + 1 < n and src[j] == '{' and src[j + 1] == '-':
                    depth += 1
                    j += 2
                elif j + 1 < n and src[j] == '-' and src[j + 1] == '}':
                    depth -= 1
                    j += 2
                else:
                    j += 1
            tokens.append((KIND_BLOCK_COMMENT, src[i:j], i, j))
            i = j
        elif c == '"':
            j = i + 1
            while j < n:
                if src[j] == '\\' and j + 1 < n:
                    j += 2
                elif src[j] == '"':
                    j += 1
                    break
                else:
                    j += 1
            tokens.append((KIND_STRING, src[i:j], i, j))
            i = j
        elif c.isalpha() or c == '_':
            j = i
            while j < n and (src[j].isalnum() or src[j] == '_' or src[j] == "'"):
                j += 1
            tokens.append((KIND_IDENT, src[i:j], i, j))
            i = j
        elif c.isdigit():
            j = i
            while j < n and (src[j].isdigit() or src[j] == '.' or src[j] in 'eE' or
                             (src[j] in '+-' and j > i and src[j - 1] in 'eE')):
                j += 1
            tokens.append((KIND_NUMBER, src[i:j], i, j))
            i = j
        else:
            two = src[i:i + 2]
            if two in ('++', '==', '!=', '<=', '>=', '->', '=>', '::', '&&', '||'):
                tokens.append((KIND_OP, two, i, i + 2))
                i += 2
            elif c in '+-*/<>=!':
                tokens.append((KIND_OP, c, i, i + 1))
                i += 1
            elif c in '()[]{},;:.\\|`':
                tokens.append((KIND_PUNCT, c, i, i + 1))
                i += 1
            else:
                tokens.append((KIND_OTHER, c, i, i + 1))
                i += 1
    return tokens


def compute_depths(tokens):
    depths = []
    d = 0
    for t in tokens:
        depths.append(d)
        if t[0] == KIND_PUNCT and t[1] in '([{':
            d += 1
        elif t[0] == KIND_PUNCT and t[1] in ')]}':
            d = max(0, d - 1)
    return depths


def first_sig(tokens, lo, hi):
    for i in range(lo, hi + 1):
        if tokens[i][0] not in SKIP_KINDS:
            return i
    return None


def last_sig(tokens, lo, hi):
    for i in range(hi, lo - 1, -1):
        if tokens[i][0] not in SKIP_KINDS:
            return i
    return None


def scan_term_right(tokens, depths, start_i, my_depth):
    """Legacy single-term scanner (currently unused; kept for potential debug)."""
    i = start_i
    n = len(tokens)
    while i < n and tokens[i][0] in SKIP_KINDS:
        i += 1
    if i >= n:
        return None
    last_sig_i = None
    while i < n:
        t = tokens[i]
        d = depths[i]
        if t[0] in SKIP_KINDS:
            i += 1
            continue
        if t[0] == KIND_OP and t[1] == '++' and d == my_depth:
            break
        if t[0] == KIND_PUNCT and t[1] in ',;' and d <= my_depth:
            break
        if t[0] == KIND_PUNCT and t[1] in ')]}' and d == my_depth:
            break
        last_sig_i = i
        i += 1
    return last_sig_i


def find_chains(tokens, depths):
    """Group ++ indices into chains. Two ++s are in the same chain iff
    they're at the same depth and nothing between them breaks the expression.
    """
    pluses = [i for i, t in enumerate(tokens) if t[0] == KIND_OP and t[1] == '++']
    if not pluses:
        return []
    chains = []
    current = [pluses[0]]
    for k in range(1, len(pluses)):
        prev, curr = pluses[k - 1], pluses[k]
        if depths[prev] != depths[curr]:
            chains.append(current)
            current = [curr]
            continue
        my_depth = depths[prev]
        connected = True
        for i in range(prev + 1, curr):
            t = tokens[i]
            d = depths[i]
            if t[0] in SKIP_KINDS:
                continue
            if t[0] == KIND_PUNCT and t[1] in ',;' and d <= my_depth:
                connected = False
                break
            if t[0] == KIND_PUNCT and t[1] in ')]}' and d == my_depth:
                connected = False
                break
            if t[0] == KIND_IDENT and t[1] in DECL_KEYWORDS and d <= my_depth:
                connected = False
                break
        if connected:
            current.append(curr)
        else:
            chains.append(current)
            current = [curr]
    chains.append(current)
    return chains


def find_chain_term_bounds(tokens, depths, chain):
    """Given a chain of ++ indices, return list of (start, end) inclusive
    token indices for each of the K+1 terms. Returns None if bounds
    can't be resolved cleanly.
    """
    my_depth = depths[chain[0]]

    # Left edge: scan back from chain[0]-1 to find term 0 start.
    # The term starts after the last statement separator at depth <= my_depth
    # or opening bracket that establishes my_depth.
    term0_end = last_sig(tokens, 0, chain[0] - 1)
    if term0_end is None:
        return None
    term0_start = term0_end
    for i in range(term0_end - 1, -1, -1):
        t = tokens[i]
        d = depths[i]
        if t[0] in SKIP_KINDS:
            continue
        if t[0] == KIND_PUNCT and t[1] in ',;' and d <= my_depth:
            break
        if t[0] == KIND_PUNCT and t[1] in '([{' and d < my_depth:
            break
        if t[0] == KIND_OP and t[1] == '=' and d <= my_depth:
            break
        if t[0] == KIND_OP and t[1] in ('->', '=>') and d <= my_depth:
            break
        # Keywords that start/separate expressions
        if t[0] == KIND_IDENT and t[1] in DECL_KEYWORDS and d <= my_depth:
            break
        term0_start = i
    bounds = [(term0_start, term0_end)]

    # Middle terms: between consecutive ++s
    for k in range(len(chain) - 1):
        lp, rp = chain[k], chain[k + 1]
        s = first_sig(tokens, lp + 1, rp - 1)
        e = last_sig(tokens, lp + 1, rp - 1)
        if s is None or e is None:
            return None
        bounds.append((s, e))

    # Last term: after chain[-1]
    last_plus = chain[-1]
    i = last_plus + 1
    n = len(tokens)
    # skip ws
    while i < n and tokens[i][0] in SKIP_KINDS:
        i += 1
    if i >= n:
        return None
    last_start = i
    last_end = last_start
    while i < n:
        t = tokens[i]
        d = depths[i]
        if t[0] in SKIP_KINDS:
            i += 1
            continue
        if t[0] == KIND_PUNCT and t[1] in ',;' and d <= my_depth:
            break
        if t[0] == KIND_PUNCT and t[1] in ')]}' and d == my_depth:
            break
        if t[0] == KIND_IDENT and t[1] in DECL_KEYWORDS and d <= my_depth:
            break
        last_end = i
        i += 1
    bounds.append((last_start, last_end))
    return bounds


def classify_term(tokens, src, start, end):
    """Return (kind, payload) where kind in:
      STRING: payload = raw literal text (with quotes)
      SHOW: payload = inner expression raw text
      SIMPLE: payload = raw expression text
      COMPLEX: payload = None
    """
    sig = [t for t in tokens[start:end + 1] if t[0] not in SKIP_KINDS]
    if not sig:
        return ('COMPLEX', None)

    # Single string literal
    if len(sig) == 1 and sig[0][0] == KIND_STRING:
        return ('STRING', sig[0][1])

    # Scan for complex constructs
    paren_depth = 0
    for t in sig:
        if t[0] == KIND_PUNCT and t[1] == '(':
            paren_depth += 1
        elif t[0] == KIND_PUNCT and t[1] == ')':
            paren_depth -= 1
        if t[0] == KIND_IDENT and t[1] in COMPLEX_KEYWORDS:
            return ('COMPLEX', None)
        if t[0] == KIND_PUNCT and t[1] == '\\':
            return ('COMPLEX', None)
        # Nested ++ inside this term (shouldn't happen at same depth, but inside parens it could)
        if t[0] == KIND_OP and t[1] == '++':
            return ('COMPLEX', None)
        # Block braces introduce a statement block
        if t[0] == KIND_PUNCT and t[1] == '{':
            return ('COMPLEX', None)
        # Semicolon inside term = statement sep
        if t[0] == KIND_PUNCT and t[1] == ';':
            return ('COMPLEX', None)
        # Comparison / arithmetic ops complicate interpolation — demand parens
        if t[0] == KIND_OP and t[1] in ('==', '!=', '<', '>', '<=', '>=', '&&', '||'):
            return ('COMPLEX', None)

    # Strings embedded within (other than a single literal) — skip
    if sum(1 for t in sig if t[0] == KIND_STRING) > 0:
        return ('COMPLEX', None)

    # Reconstruct text from source (preserves whitespace between sig tokens within term)
    raw_start = sig[0][2]
    raw_end = sig[-1][3]
    raw = src[raw_start:raw_end]

    # Detect show(X): first sig is IDENT 'show', then '(', then inner, then ')'
    if (len(sig) >= 4
            and sig[0][0] == KIND_IDENT and sig[0][1] == 'show'
            and sig[1][0] == KIND_PUNCT and sig[1][1] == '('
            and sig[-1][0] == KIND_PUNCT and sig[-1][1] == ')'):
        # Verify it's a single balanced call: count parens between sig[1] and sig[-1]
        depth = 0
        balanced = True
        for idx in range(1, len(sig)):
            tt = sig[idx]
            if tt[0] == KIND_PUNCT and tt[1] == '(':
                depth += 1
            elif tt[0] == KIND_PUNCT and tt[1] == ')':
                depth -= 1
                if depth == 0 and idx != len(sig) - 1:
                    balanced = False
                    break
        if balanced:
            # Inner expression: text between the outer '(' and ')'
            inner_start = sig[1][3]  # end of '('
            inner_end = sig[-1][2]   # start of ')'
            inner = src[inner_start:inner_end].strip()
            return ('SHOW', inner)

    # Simple expression: must be a whitespace-compact ident / field / call pattern
    # Sanity: the raw text should not contain comments
    return ('SIMPLE', raw.strip())


def unquote(strlit):
    """Return raw content of a "..." string literal (without quotes)."""
    return strlit[1:-1]


def quote(content):
    return '"' + content + '"'


def build_interp(terms, indent=''):
    """Given list of classified terms, build the interpolated string text.
    Returns (new_text, needs_string_concat_import).
    - If the chain is all STRING terms AND total raw length > 120 chars,
      emit `concat([s1, s2, ...])` preserving multi-line layout.
    - Otherwise, merge into a single "${...}" interpolated string.
    """
    if not terms:
        return None, False

    for (kind, payload) in terms:
        if kind == 'STRING' and '${' in payload:
            return None, False

    all_string = all(kind == 'STRING' for (kind, _) in terms)
    total_raw = sum(len(p) for (_, p) in terms if p is not None)

    if all_string and total_raw > 120 and len(terms) >= 3:
        lead = '\n' + indent + '  '
        parts = [p for (_, p) in terms]
        return 'concat([' + lead + (',' + lead).join(parts) + '\n' + indent + '])', True

    pieces = []
    for kind, payload in terms:
        if kind == 'STRING':
            content = unquote(payload)
            if pieces and pieces[-1][0] == 'S':
                pieces[-1] = ('S', pieces[-1][1] + content)
            else:
                pieces.append(('S', content))
        elif kind == 'SHOW':
            pieces.append(('E', payload))
        elif kind == 'SIMPLE':
            pieces.append(('E', payload))
        else:
            return None, False

    buf = ['"']
    for kind, payload in pieces:
        if kind == 'S':
            buf.append(payload)
        else:
            buf.append('${' + payload + '}')
    buf.append('"')
    return ''.join(buf), False


def line_indent(src, pos):
    """Return the whitespace at the start of the line containing pos."""
    line_start = src.rfind('\n', 0, pos) + 1
    j = line_start
    while j < len(src) and src[j] in ' \t':
        j += 1
    return src[line_start:j]


def inject_concat_import(src):
    """Ensure `concat` is imported from std/string. Modify src if needed."""
    # Look for existing `import std/string (...)` line
    import re
    m = re.search(r'^import\s+std/string\s*\(([^)]*)\)', src, re.MULTILINE)
    if m:
        names = [n.strip() for n in m.group(1).split(',') if n.strip()]
        # Check: `concat` itself or `concat as X`
        has = any(n == 'concat' or n.startswith('concat ') or n.startswith('concat as ')
                  for n in names)
        if has:
            return src
        new_names = names + ['concat']
        new_import = f'import std/string ({", ".join(new_names)})'
        return src[:m.start()] + new_import + src[m.end():]
    # No existing import — add one after `module` line
    m2 = re.search(r'^module\s+\S+\s*\n', src, re.MULTILINE)
    if m2:
        insertion = 'import std/string (concat)\n'
        # If there's a blank line after module, insert after it; otherwise add one
        after = m2.end()
        if after < len(src) and src[after] == '\n':
            return src[:after + 1] + insertion + src[after + 1:]
        return src[:after] + '\n' + insertion + src[after:]
    # No module line — prepend
    return 'import std/string (concat)\n' + src


def process_source(src):
    tokens = tokenize(src)
    depths = compute_depths(tokens)
    chains = find_chains(tokens, depths)

    replacements = []
    n_migrated = 0
    n_skipped = 0
    n_concat_removed = 0
    needs_concat_import = False

    for chain in chains:
        bounds = find_chain_term_bounds(tokens, depths, chain)
        if bounds is None:
            n_skipped += 1
            continue
        terms = [classify_term(tokens, src, s, e) for (s, e) in bounds]
        if any(t[0] == 'COMPLEX' for t in terms):
            n_skipped += 1
            continue
        chain_start = tokens[bounds[0][0]][2]
        chain_end = tokens[bounds[-1][1]][3]
        indent = line_indent(src, chain_start)
        new_text, needs_import = build_interp(terms, indent=indent)
        if new_text is None:
            n_skipped += 1
            continue
        replacements.append((chain_start, chain_end, new_text))
        n_migrated += 1
        n_concat_removed += len(chain)
        if needs_import:
            needs_concat_import = True

    if not replacements:
        return src, 0, len(chains), 0

    replacements.sort(key=lambda r: r[0], reverse=True)
    out = src
    for (s, e, text) in replacements:
        out = out[:s] + text + out[e:]

    if needs_concat_import:
        out = inject_concat_import(out)

    return out, n_migrated, n_skipped, n_concat_removed


def walk_files(root):
    p = Path(root)
    if p.is_file():
        if p.suffix == '.ail':
            yield p
        return
    for f in sorted(p.rglob('*.ail')):
        # Skip archived/generated trees
        parts = set(f.parts)
        if '_archive' in parts or 'node_modules' in parts or '.git' in parts:
            continue
        yield f


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--dry-run', action='store_true', help='Print diff-like output, do not write')
    g.add_argument('--write', action='store_true', help='Write changes to files')
    ap.add_argument('--stats', action='store_true', help='Print per-file migration counts')
    ap.add_argument('paths', nargs='+', help='File or directory paths')
    args = ap.parse_args()

    total_mig = 0
    total_skip = 0
    total_concat = 0
    files_changed = 0

    for path_arg in args.paths:
        for f in walk_files(path_arg):
            try:
                src = f.read_text()
            except Exception as exc:
                print(f"ERROR reading {f}: {exc}", file=sys.stderr)
                return 1
            new_src, n_mig, n_skip, n_concat = process_source(src)
            total_mig += n_mig
            total_skip += n_skip
            total_concat += n_concat
            if new_src != src:
                files_changed += 1
                if args.dry_run:
                    print(f"--- {f} (would migrate {n_mig} chains, skip {n_skip}, remove {n_concat} ++)")
                elif args.write:
                    f.write_text(new_src)
                    if args.stats:
                        print(f"WROTE {f}: migrated {n_mig} chains, skipped {n_skip}, removed {n_concat} ++")
            elif args.stats and (n_mig or n_skip):
                print(f"{f}: migrated {n_mig}, skipped {n_skip}")

    print(f"\nTotal: {files_changed} files changed, {total_mig} chains migrated, "
          f"{total_skip} chains skipped, {total_concat} ++ removed")
    return 0


if __name__ == '__main__':
    sys.exit(main())
