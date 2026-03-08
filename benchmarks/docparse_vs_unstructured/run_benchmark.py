#!/usr/bin/env python3
"""DocParse Benchmark: AILANG DocParse vs Python Unstructured.

Usage:
    uv run python run_benchmark.py                          # All files, 3 iterations
    uv run python run_benchmark.py --format docx             # DOCX only
    uv run python run_benchmark.py --format pdf              # PDF only
    uv run python run_benchmark.py --iterations 5            # 5 timed iterations
    uv run python run_benchmark.py --describe                # With AI image descriptions
    uv run python run_benchmark.py --files sample.docx       # Single file
    uv run python run_benchmark.py --pdf-strategy hi_res     # Unstructured hi_res for PDF
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from compare import aggregate_results, compare_outputs
from normalize import normalize_ailang, normalize_unstructured
from parse_unstructured import partition_file


# Paths relative to this script
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_DIR = SCRIPT_DIR.parent.parent  # demos/
OFFICE_TEST_DIR = PROJECT_DIR / "docparse" / "data" / "test_files"
PDF_TEST_DIR = SCRIPT_DIR / "test_files"
AILANG_OUTPUT = PROJECT_DIR / "docparse" / "data" / "output.json"
RESULTS_DIR = SCRIPT_DIR / "results"

OFFICE_EXTS = {".docx", ".pptx", ".xlsx"}
PDF_EXTS = {".pdf"}
ALL_EXTS = OFFICE_EXTS | PDF_EXTS

# Measured cold-start overhead (set during warmup)
_ailang_coldstart_ms: float = 0.0


def discover_files(
    fmt_filter: str | None = None,
    file_filter: str | None = None,
) -> list[Path]:
    """Find test files to benchmark."""
    files = []

    # Office files from docparse test corpus
    if OFFICE_TEST_DIR.exists():
        for f in sorted(OFFICE_TEST_DIR.iterdir()):
            if f.suffix.lower() in OFFICE_EXTS:
                files.append(f)

    # PDF files from benchmark test_files
    if PDF_TEST_DIR.exists():
        for f in sorted(PDF_TEST_DIR.iterdir()):
            if f.suffix.lower() in PDF_EXTS:
                files.append(f)

    # Apply filters
    if file_filter:
        files = [f for f in files if file_filter in f.name]

    if fmt_filter:
        ext = f".{fmt_filter}" if not fmt_filter.startswith(".") else fmt_filter
        files = [f for f in files if f.suffix.lower() == ext]

    return files


def run_ailang(
    filepath: Path, describe: bool = False
) -> tuple[dict[str, Any] | None, float]:
    """Run AILANG docparse on a file via subprocess.

    Returns (parsed_json, elapsed_seconds).
    """
    ext = filepath.suffix.lower()
    needs_ai = ext in PDF_EXTS or describe

    caps = "IO,FS,Env"
    if needs_ai:
        caps += ",AI"

    cmd = ["ailang", "run", "--entry", "main", "--no-budgets", "--caps", caps]
    if needs_ai:
        cmd += ["--ai", "gemini-3-flash-preview"]

    # Must use relative path — AILANG resolves module paths from cwd
    cmd.append("docparse/main.ail")
    cmd.append(str(filepath.resolve()))

    if describe:
        cmd.append("describe")

    env = os.environ.copy()
    if needs_ai:
        env["GOOGLE_API_KEY"] = ""  # Force ADC

    # Record pre-run mtime to detect stale output.json (parallel run protection)
    pre_mtime = AILANG_OUTPUT.stat().st_mtime if AILANG_OUTPUT.exists() else 0

    start = time.perf_counter()
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(PROJECT_DIR),
            env=env,
        )
    except subprocess.TimeoutExpired:
        elapsed = time.perf_counter() - start
        print(f"    AILANG TIMEOUT after {elapsed:.1f}s")
        return None, elapsed
    except FileNotFoundError:
        print("    AILANG ERROR: 'ailang' not found in PATH")
        return None, 0.0

    elapsed = time.perf_counter() - start

    if result.returncode != 0:
        stderr = result.stderr or ""
        # Budget exhaustion is not fatal — output is written before the budget check
        if "budget exhausted" not in stderr:
            stderr_preview = stderr[:200]
            print(f"    AILANG ERROR (exit {result.returncode}): {stderr_preview}")
            return None, elapsed

    # Read output JSON — verify it was written by THIS run (not stale from parallel runs)
    if AILANG_OUTPUT.exists():
        post_mtime = AILANG_OUTPUT.stat().st_mtime
        if post_mtime <= pre_mtime:
            print(f"    AILANG WARNING: output.json not updated (stale from previous run)")
            return None, elapsed
        with open(AILANG_OUTPUT) as f:
            try:
                return json.load(f), elapsed
            except json.JSONDecodeError as e:
                print(f"    AILANG JSON ERROR: {e}")
                return None, elapsed
    else:
        print(f"    AILANG: no output.json found at {AILANG_OUTPUT}")
        return None, elapsed


def run_unstructured(
    filepath: Path, pdf_strategy: str = "fast"
) -> tuple[list[dict[str, Any]] | None, float]:
    """Run Unstructured on a file.

    Returns (elements_dicts, elapsed_seconds).
    """
    try:
        # Override PDF strategy if needed
        if filepath.suffix.lower() == ".pdf" and pdf_strategy != "fast":
            from unstructured.partition.pdf import partition_pdf
            from unstructured.staging.base import convert_to_dict

            start = time.perf_counter()
            elements = partition_pdf(filename=str(filepath), strategy=pdf_strategy)
            elapsed = time.perf_counter() - start
            return convert_to_dict(elements), elapsed
        else:
            return partition_file(filepath)
    except Exception as e:
        print(f"    UNSTRUCTURED ERROR: {e}")
        return None, 0.0


def benchmark_file(
    filepath: Path,
    iterations: int = 3,
    describe: bool = False,
    pdf_strategy: str = "fast",
) -> dict[str, Any]:
    """Benchmark a single file with both tools."""
    fname = filepath.name
    file_size = filepath.stat().st_size

    ailang_times = []
    unstructured_times = []
    ailang_output = None
    unstructured_output = None

    for i in range(iterations):
        # Run AILANG
        a_result, a_time = run_ailang(filepath, describe=describe)
        if a_result is not None:
            ailang_output = a_result
            ailang_times.append(a_time * 1000)  # ms

        # Run Unstructured
        u_result, u_time = run_unstructured(filepath, pdf_strategy=pdf_strategy)
        if u_result is not None:
            unstructured_output = u_result
            unstructured_times.append(u_time * 1000)  # ms

    result: dict[str, Any] = {
        "filename": fname,
        "format": filepath.suffix.lstrip(".").lower(),
        "file_size_bytes": file_size,
    }

    if ailang_times:
        result["ailang_time_ms"] = round(statistics.median(ailang_times), 1)
        # Estimate parse-only time by subtracting cold-start overhead
        parse_only = max(0, result["ailang_time_ms"] - _ailang_coldstart_ms)
        result["ailang_parse_only_ms"] = round(parse_only, 1)
        if len(ailang_times) > 1:
            result["ailang_time_std_ms"] = round(statistics.stdev(ailang_times), 1)
        result["ailang_throughput_kb_s"] = round(
            (file_size / 1024) / (result["ailang_time_ms"] / 1000), 1
        )
    else:
        result["ailang_error"] = True

    if unstructured_times:
        result["unstructured_time_ms"] = round(statistics.median(unstructured_times), 1)
        if len(unstructured_times) > 1:
            result["unstructured_time_std_ms"] = round(
                statistics.stdev(unstructured_times), 1
            )
        result["unstructured_throughput_kb_s"] = round(
            (file_size / 1024) / (result["unstructured_time_ms"] / 1000), 1
        )
    else:
        result["unstructured_error"] = True

    # Normalize and compare
    if ailang_output is not None and unstructured_output is not None:
        ailang_normalized = normalize_ailang(ailang_output)
        unstructured_normalized = normalize_unstructured(unstructured_output)
        comparison = compare_outputs(ailang_normalized, unstructured_normalized, fname)
        result["comparison"] = comparison
    elif ailang_output is not None:
        ailang_normalized = normalize_ailang(ailang_output)
        result["comparison"] = {
            "ailang": {
                "total_elements": len(ailang_normalized),
                "element_types": {},
                "total_text_chars": sum(len(el.text) for el in ailang_normalized),
            },
            "unstructured": {"error": True},
            "note": "Unstructured failed to parse this file",
        }
    elif unstructured_output is not None:
        unstructured_normalized = normalize_unstructured(unstructured_output)
        result["comparison"] = {
            "ailang": {"error": True},
            "unstructured": {
                "total_elements": len(unstructured_normalized),
                "element_types": {},
                "total_text_chars": sum(len(el.text) for el in unstructured_normalized),
            },
            "note": "AILANG failed to parse this file",
        }

    return result


def generate_markdown_report(
    per_file: dict[str, dict], aggregate: dict, info: dict
) -> str:
    """Generate human-readable markdown report."""
    lines = []
    lines.append("# DocParse Benchmark: AILANG vs Unstructured\n")
    lines.append(f"**Date:** {info['timestamp']}")
    lines.append(f"**AILANG version:** {info.get('ailang_version', 'unknown')}")
    lines.append(f"**Unstructured version:** {info.get('unstructured_version', 'unknown')}")
    lines.append(f"**Files:** {info['test_files_count']}")
    lines.append(f"**Iterations:** {info['iterations']}")
    lines.append(f"**Host:** {info['host']}\n")

    # Summary table
    a = aggregate.get("ailang", {})
    u = aggregate.get("unstructured", {})
    coldstart = aggregate.get("ailang_coldstart_ms", 0)
    lines.append("## Summary\n")
    lines.append("| Metric | AILANG DocParse | Unstructured |")
    lines.append("|--------|----------------|--------------|")
    lines.append(f"| Median total time | {a.get('median_parse_time_ms', 'N/A')}ms | {u.get('median_parse_time_ms', 'N/A')}ms |")
    if coldstart:
        lines.append(f"| AILANG cold-start overhead | ~{coldstart}ms | — |")
        lines.append(f"| Median parse-only (est.) | {a.get('median_parse_only_ms', 'N/A')}ms | {u.get('median_parse_time_ms', 'N/A')}ms |")
    lines.append(f"| Total elements | {a.get('total_elements', 0)} | {u.get('total_elements', 0)} |")
    lines.append(f"| Files with more elements | {a.get('files_with_more_elements', 0)} | {u.get('files_with_more_elements', 0)} |")
    lines.append(f"| Files with more text | {a.get('files_with_more_text', 0)} | {u.get('files_with_more_text', 0)} |")
    lines.append(f"| Mean text overlap (Jaccard) | {aggregate.get('mean_text_overlap', 'N/A')} |")
    a_recall = aggregate.get("mean_ailang_recall", "N/A")
    u_recall = aggregate.get("mean_unstructured_recall", "N/A")
    lines.append(f"| AILANG captures Unstructured's words | {a_recall} |")
    lines.append(f"| Unstructured captures AILANG's words | {u_recall} |")
    lines.append("")

    # Per-file table
    lines.append("## Per-File Results\n")
    lines.append("| File | Format | Size | AILANG ms | Unstr ms | AILANG el | Unstr el | AILANG recall | Unstr recall | Overlap |")
    lines.append("|------|--------|------|-----------|----------|-----------|----------|---------------|--------------|---------|")

    for fname, result in sorted(per_file.items()):
        fmt = result.get("format", "?")
        size = result.get("file_size_bytes", 0)
        size_str = f"{size/1024:.1f}KB" if size > 0 else "?"
        a_time = result.get("ailang_time_ms", "ERR")
        a_parse = result.get("ailang_parse_only_ms", "—")
        u_time = result.get("unstructured_time_ms", "ERR")
        comp = result.get("comparison", {})
        a_els = comp.get("ailang", {}).get("total_elements", "?")
        u_els = comp.get("unstructured", {}).get("total_elements", "?")
        tc = comp.get("text_comparison", {})
        overlap = tc.get("text_overlap_ratio", "?")
        a_rec = tc.get("ailang_recall", "?")
        u_rec = tc.get("unstructured_recall", "?")
        lines.append(f"| {fname} | {fmt} | {size_str} | {a_time} | {u_time} | {a_els} | {u_els} | {a_rec} | {u_rec} | {overlap} |")

    lines.append("")

    # Feature checks
    lines.append("## Feature Checks\n")
    for fname, result in sorted(per_file.items()):
        checks = result.get("comparison", {}).get("feature_checks", {})
        if checks:
            lines.append(f"### {fname}\n")
            for check_name, check_result in checks.items():
                lines.append(f"- **{check_name}**: {json.dumps(check_result)}")
            lines.append("")

    # Image comparison
    lines.append("## Image Extraction\n")
    lines.append("| File | AILANG images | Unstr images | AILANG descriptions |")
    lines.append("|------|---------------|--------------|---------------------|")
    for fname, result in sorted(per_file.items()):
        img = result.get("comparison", {}).get("image_comparison", {})
        if img and (img.get("ailang_image_count", 0) > 0 or img.get("unstructured_image_count", 0) > 0):
            lines.append(
                f"| {fname} | {img.get('ailang_image_count', 0)} "
                f"| {img.get('unstructured_image_count', 0)} "
                f"| {img.get('ailang_with_descriptions', 0)} |"
            )
    lines.append("")

    # Gap analysis
    lines.append("## Gap Analysis\n")
    lines.append("### Where AILANG excels\n")
    for fname, result in sorted(per_file.items()):
        comp = result.get("comparison", {})
        a_stats = comp.get("ailang", {})
        u_stats = comp.get("unstructured", {})
        a_count = a_stats.get("total_elements", 0)
        u_count = u_stats.get("total_elements", 0)
        a_text = a_stats.get("total_text_chars", 0)
        u_text = u_stats.get("total_text_chars", 0)
        if a_count > u_count and a_count > 0:
            tc = comp.get("text_comparison", {})
            excl = tc.get("ailang_only_types", [])
            excl_words = tc.get("ailang_exclusive_word_count", 0)
            notes = []
            if excl:
                notes.append(f"exclusive types: {', '.join(excl)}")
            if excl_words:
                notes.append(f"+{excl_words} exclusive words")
            note_str = f" ({'; '.join(notes)})" if notes else ""
            lines.append(f"- **{fname}**: {a_count} vs {u_count} elements{note_str}")
    lines.append("")

    lines.append("### Where Unstructured excels\n")
    for fname, result in sorted(per_file.items()):
        comp = result.get("comparison", {})
        a_stats = comp.get("ailang", {})
        u_stats = comp.get("unstructured", {})
        a_count = a_stats.get("total_elements", 0)
        u_count = u_stats.get("total_elements", 0)
        if u_count > a_count and u_count > 0:
            tc = comp.get("text_comparison", {})
            excl_words = tc.get("unstructured_exclusive_word_count", 0)
            note = f" (+{excl_words} exclusive words)" if excl_words else ""
            lines.append(f"- **{fname}**: {u_count} vs {a_count} elements{note}")
    lines.append("")

    lines.append("### Low overlap files (< 0.7)\n")
    for fname, result in sorted(per_file.items()):
        comp = result.get("comparison", {})
        tc = comp.get("text_comparison", {})
        overlap = tc.get("text_overlap_ratio", 1.0)
        if overlap < 0.7:
            a_excl = tc.get("ailang_exclusive_words", [])[:10]
            u_excl = tc.get("unstructured_exclusive_words", [])[:10]
            lines.append(f"- **{fname}** (overlap: {overlap})")
            if u_excl:
                lines.append(f"  - Unstructured finds: {', '.join(u_excl)}")
            if a_excl:
                lines.append(f"  - AILANG finds: {', '.join(a_excl)}")
    lines.append("")

    # Known issues
    lines.append("### Known issues\n")
    lines.append("- **Table cell text extraction**: AILANG detects tables correctly (right count)")
    lines.append("  but cell content may be empty due to a regression in `std/xml.findAll` or")
    lines.append("  `std/xml.getText`. Tables show 0 rows/cols despite valid XML content.")
    lines.append("- **AILANG timing**: Includes ~{0}ms subprocess cold-start (process spawn +".format(
        int(aggregate.get("ailang_coldstart_ms", 0))
    ))
    lines.append("  type-checking). Parse-only column estimates actual parsing time.")
    lines.append("- **Track changes**: AILANG extracts structured change data (insert/delete/move)")
    lines.append("  that Unstructured does not support — this is an AILANG advantage.")
    lines.append("")

    lines.append("---\n")
    lines.append("*Generated by docparse-benchmark*\n")

    return "\n".join(lines)


def get_version_info(iterations: int, file_count: int) -> dict[str, str]:
    """Gather environment version info."""
    info: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "iterations": iterations,
        "test_files_count": file_count,
        "host": f"{platform.system()} {platform.release()}",
        "python_version": platform.python_version(),
    }

    # AILANG version
    try:
        result = subprocess.run(
            ["ailang", "version"], capture_output=True, text=True, timeout=10
        )
        # Extract just the version line (first line)
        version_output = (result.stdout or "").strip().split("\n")[0]
        info["ailang_version"] = version_output or "unknown"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        info["ailang_version"] = "not found"

    # Unstructured version
    try:
        from importlib.metadata import version as pkg_version

        info["unstructured_version"] = pkg_version("unstructured")
    except Exception:
        info["unstructured_version"] = "unknown"

    return info


def main():
    parser = argparse.ArgumentParser(
        description="Benchmark AILANG DocParse vs Python Unstructured"
    )
    parser.add_argument(
        "--iterations", type=int, default=3, help="Number of timed iterations (default: 3)"
    )
    parser.add_argument(
        "--warmup", type=int, default=1, help="Warmup iterations (default: 1)"
    )
    parser.add_argument(
        "--format",
        choices=["docx", "pptx", "xlsx", "pdf"],
        help="Only benchmark this format",
    )
    parser.add_argument("--files", help="Filter to files containing this string")
    parser.add_argument(
        "--describe",
        action="store_true",
        help="Enable AI image descriptions (needs Gemini API)",
    )
    parser.add_argument(
        "--pdf-strategy",
        default="fast",
        choices=["fast", "hi_res", "ocr_only"],
        help="Unstructured PDF strategy (default: fast)",
    )
    parser.add_argument(
        "--ailang-only",
        action="store_true",
        help="Only run AILANG (skip Unstructured)",
    )
    parser.add_argument(
        "--unstructured-only",
        action="store_true",
        help="Only run Unstructured (skip AILANG)",
    )

    args = parser.parse_args()

    # Discover files
    files = discover_files(fmt_filter=args.format, file_filter=args.files)
    if not files:
        print("No test files found. Check paths:")
        print(f"  Office: {OFFICE_TEST_DIR}")
        print(f"  PDF:    {PDF_TEST_DIR}")
        sys.exit(1)

    print(f"DocParse Benchmark: {len(files)} files, {args.iterations} iterations")
    print(f"  Office test dir: {OFFICE_TEST_DIR}")
    print(f"  PDF test dir:    {PDF_TEST_DIR}")
    if args.describe:
        print("  AI image descriptions: ENABLED")
    print()

    # Warmup + measure AILANG cold-start overhead
    global _ailang_coldstart_ms
    if args.warmup > 0:
        warmup_file = OFFICE_TEST_DIR / "sample.docx"
        if warmup_file.exists():
            print(f"Warmup ({args.warmup} iteration(s)) on {warmup_file.name}...")
            for _ in range(args.warmup):
                if not args.unstructured_only:
                    run_ailang(warmup_file)
                if not args.ailang_only:
                    run_unstructured(warmup_file)

            # Measure cold-start: run AILANG on smallest possible file (nested_sdt = 0 elements)
            if not args.unstructured_only:
                coldstart_file = OFFICE_TEST_DIR / "nested_sdt.docx"
                if coldstart_file.exists():
                    _, cs_time = run_ailang(coldstart_file)
                    _ailang_coldstart_ms = round(cs_time * 1000, 1)
                    print(f"  AILANG cold-start overhead: ~{_ailang_coldstart_ms}ms")
            print()

    # Benchmark each file
    per_file: dict[str, dict] = {}
    for i, filepath in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {filepath.name} ({filepath.suffix})")

        if args.ailang_only or args.unstructured_only:
            # Partial run mode
            result: dict[str, Any] = {
                "filename": filepath.name,
                "format": filepath.suffix.lstrip(".").lower(),
                "file_size_bytes": filepath.stat().st_size,
            }
            for iteration in range(args.iterations):
                if not args.unstructured_only:
                    a_out, a_time = run_ailang(filepath, describe=args.describe)
                    if a_out is not None:
                        result["ailang_time_ms"] = round(a_time * 1000, 1)
                        a_norm = normalize_ailang(a_out)
                        result["comparison"] = {
                            "ailang": {
                                "total_elements": len(a_norm),
                                "total_text_chars": sum(len(e.text) for e in a_norm),
                            }
                        }
                if not args.ailang_only:
                    u_out, u_time = run_unstructured(filepath, pdf_strategy=args.pdf_strategy)
                    if u_out is not None:
                        result["unstructured_time_ms"] = round(u_time * 1000, 1)
                        u_norm = normalize_unstructured(u_out)
                        result["comparison"] = {
                            "unstructured": {
                                "total_elements": len(u_norm),
                                "total_text_chars": sum(len(e.text) for e in u_norm),
                            }
                        }
            per_file[filepath.name] = result
            a_ms = result.get("ailang_time_ms", "—")
            u_ms = result.get("unstructured_time_ms", "—")
            print(f"  AILANG: {a_ms}ms | Unstructured: {u_ms}ms")
        else:
            result = benchmark_file(
                filepath,
                iterations=args.iterations,
                describe=args.describe,
                pdf_strategy=args.pdf_strategy,
            )
            per_file[filepath.name] = result

            a_ms = result.get("ailang_time_ms", "ERR")
            a_parse = result.get("ailang_parse_only_ms", "")
            u_ms = result.get("unstructured_time_ms", "ERR")
            comp = result.get("comparison", {})
            a_els = comp.get("ailang", {}).get("total_elements", "?")
            u_els = comp.get("unstructured", {}).get("total_elements", "?")
            overlap = comp.get("text_comparison", {}).get("text_overlap_ratio", "?")
            parse_note = f" (parse: {a_parse}ms)" if a_parse else ""
            print(f"  AILANG: {a_ms}ms{parse_note} ({a_els} el) | Unstructured: {u_ms}ms ({u_els} el) | Overlap: {overlap}")

    print()

    # Aggregate
    agg = aggregate_results(per_file, coldstart_ms=_ailang_coldstart_ms)
    info = get_version_info(args.iterations, len(files))

    # Write JSON report
    RESULTS_DIR.mkdir(exist_ok=True)
    report = {
        "benchmark_info": info,
        "per_file_results": per_file,
        "aggregate": agg,
    }

    json_path = RESULTS_DIR / "benchmark_report.json"
    with open(json_path, "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"JSON report: {json_path}")

    # Write markdown report
    md = generate_markdown_report(per_file, agg, info)
    md_path = RESULTS_DIR / "benchmark_report.md"
    with open(md_path, "w") as f:
        f.write(md)
    print(f"Markdown report: {md_path}")

    # Print summary
    print()
    print("=== SUMMARY ===")
    a = agg.get("ailang", {})
    u = agg.get("unstructured", {})
    coldstart = agg.get("ailang_coldstart_ms", 0)
    print(f"  Files benchmarked: {agg['file_count']}")
    print(f"  AILANG cold-start: ~{coldstart}ms (subprocess + type-check)")
    print(f"  AILANG:        {a.get('median_parse_time_ms', '?')}ms total, ~{a.get('median_parse_only_ms', '?')}ms parse-only, {a.get('total_elements', 0)} total elements")
    print(f"  Unstructured:  {u.get('median_parse_time_ms', '?')}ms, {u.get('total_elements', 0)} total elements")
    print(f"  Mean text overlap: {agg.get('mean_text_overlap', '?')}")
    a_rec = agg.get("mean_ailang_recall", "?")
    u_rec = agg.get("mean_unstructured_recall", "?")
    print(f"  AILANG captures {a_rec} of Unstructured's words")
    print(f"  Unstructured captures {u_rec} of AILANG's words")


if __name__ == "__main__":
    main()
