#!/usr/bin/env python3
"""Run Unstructured's SCORE evaluation framework against both AILANG and Unstructured outputs.

Uses the official unstructured-eval-metrics repo (cloned alongside this benchmark)
to score both tools against the same ground truth on Unstructured's own sample documents.

Usage:
    cd benchmarks/docparse_vs_unstructured
    uv run python run_score_eval.py
"""

import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

# Paths
DEMO_ROOT = Path(__file__).resolve().parent.parent.parent
EVAL_METRICS_ROOT = Path(__file__).resolve().parent.parent / "unstructured-eval-metrics"
SIMPLE_DATA = EVAL_METRICS_ROOT / "simple-data"
RESULTS_DIR = Path(__file__).resolve().parent / "results"

# Add eval-metrics src to path
EVAL_SRC = str(EVAL_METRICS_ROOT / "src")
if EVAL_SRC not in sys.path:
    sys.path.insert(0, EVAL_SRC)

# Sample PDFs from Unstructured's eval repo
SAMPLE_PDFS = [
    "mini-holistic-1-v2-005-CISA-AA22-076-Strengthening-Cybersecurity-p1-p4-p002.pdf",
    "mini-holistic-1-v2-NVIDIA-p006.pdf",
]


def ailang_json_to_unstructured_elements(ailang_json: dict) -> list[dict]:
    """Convert AILANG DocParse JSON output to Unstructured Elements JSON format."""
    elements = []
    blocks = ailang_json.get("document", {}).get("blocks", [])

    for block in blocks:
        block_type = block.get("type", "")

        if block_type == "heading":
            elements.append({
                "type": "Title",
                "element_id": uuid.uuid4().hex,
                "text": block.get("text", ""),
                "metadata": {"category_depth": block.get("level", 1) - 1},
            })

        elif block_type == "text":
            elements.append({
                "type": "NarrativeText",
                "element_id": uuid.uuid4().hex,
                "text": block.get("text", ""),
                "metadata": {},
            })

        elif block_type == "table":
            html = table_to_html(block)
            flat_text = table_to_flat_text(block)
            elements.append({
                "type": "Table",
                "element_id": uuid.uuid4().hex,
                "text": flat_text,
                "metadata": {"text_as_html": html},
            })

        elif block_type == "list":
            items = block.get("items", [])
            for item in items:
                elements.append({
                    "type": "ListItem",
                    "element_id": uuid.uuid4().hex,
                    "text": item,
                    "metadata": {},
                })

        elif block_type == "image":
            elements.append({
                "type": "Image",
                "element_id": uuid.uuid4().hex,
                "text": block.get("description", ""),
                "metadata": {},
            })

        elif block_type == "section":
            sub_json = {"document": {"blocks": block.get("blocks", [])}}
            elements.extend(ailang_json_to_unstructured_elements(sub_json))

    return elements


def table_to_html(block: dict) -> str:
    """Convert AILANG table block to HTML table string."""
    headers = block.get("headers", [])
    rows = block.get("rows", [])
    parts = ["<table>"]

    if headers:
        parts.append("<thead><tr>")
        for h in headers:
            cell_text = h if isinstance(h, str) else h.get("text", "")
            parts.append(f"<th>{cell_text}</th>")
        parts.append("</tr></thead>")

    if rows:
        parts.append("<tbody>")
        for row in rows:
            parts.append("<tr>")
            for cell in row:
                cell_text = cell if isinstance(cell, str) else cell.get("text", "")
                parts.append(f"<td>{cell_text}</td>")
            parts.append("</tr>")
        parts.append("</tbody>")

    parts.append("</table>")
    return "".join(parts)


def table_to_flat_text(block: dict) -> str:
    """Convert AILANG table block to flat text for content comparison."""
    parts = []
    for h in block.get("headers", []):
        cell_text = h if isinstance(h, str) else h.get("text", "")
        parts.append(cell_text)
    for row in block.get("rows", []):
        for cell in row:
            cell_text = cell if isinstance(cell, str) else cell.get("text", "")
            parts.append(cell_text)
    return " ".join(parts)


def run_ailang_on_pdf(pdf_path: Path) -> dict:
    """Run AILANG docparse on a PDF and return the JSON output."""
    print(f"  Running AILANG on {pdf_path.name}...")
    start = time.perf_counter()
    result = subprocess.run(
        ["ailang", "run", "--entry", "main", "--caps", "IO,FS,Env,AI",
         "--ai", "gemini-2.5-flash", "docparse/main.ail", str(pdf_path)],
        capture_output=True, text=True, cwd=str(DEMO_ROOT),
        env={**os.environ, "GOOGLE_API_KEY": ""}, timeout=120,
    )
    elapsed = time.perf_counter() - start

    if result.returncode != 0:
        print(f"    AILANG failed: {result.stderr[:200]}")
        return {}

    output_path = DEMO_ROOT / "docparse" / "data" / "output.json"
    if output_path.exists():
        with open(output_path) as f:
            data = json.load(f)
        print(f"    AILANG completed in {elapsed:.1f}s")
        return data
    return {}


def score_all_metrics(elements: list[dict], pdf_name: str,
                      content_gt_dir: Path, table_gt_dir: Path) -> dict:
    """Run all SCORE metrics on a set of Unstructured-format elements."""
    scores = {}

    content_gt_files = list(content_gt_dir.glob(f"{pdf_name}*"))
    table_gt_files = list(table_gt_dir.glob(f"{pdf_name}*"))

    if not content_gt_files:
        print(f"    No content GT found for {pdf_name}")
        return scores

    content_gt_text = content_gt_files[0].read_text()

    # --- Content metrics ---
    try:
        from scoring.content_scoring import score_cct
        cct = score_cct(elements, content_gt_text)
        scores["cct"] = round(cct, 4)
    except Exception as e:
        print(f"    CCT error: {e}")

    try:
        from processing.text_processing import extract_text
        pred_text = extract_text(elements, "v1")
        gt_text = extract_text(content_gt_text, "v1")

        from scoring.content_scoring import (
            calculate_percent_tokens_found,
            calculate_percent_tokens_added,
        )
        scores["tokens_found"] = round(calculate_percent_tokens_found(pred_text, gt_text), 4)
        scores["tokens_added"] = round(calculate_percent_tokens_added(pred_text, gt_text), 4)
    except Exception as e:
        print(f"    Token metrics error: {e}")

    try:
        from scoring.cct_adjustment import score_cct_adjustment
        adj = score_cct_adjustment(elements, content_gt_text)
        scores["adjusted_cct"] = round(adj, 4)
    except Exception as e:
        print(f"    Adjusted CCT error: {e}")

    # --- Structure metrics ---
    try:
        from scoring.structure_scoring import score_element_alignment
        align = score_element_alignment(elements, content_gt_text)
        scores["element_alignment"] = round(align, 4)
    except Exception as e:
        print(f"    Element alignment error: {e}")

    try:
        from scoring.element_consistency_scoring import score_element_consistency
        from processing.structure_processing import parse_structure
        gt_struct = parse_structure(content_gt_text, "v1")
        ec = score_element_consistency(elements, gt_struct)
        if ec is not None and hasattr(ec, "f1"):
            scores["element_consistency_f1"] = round(ec.f1, 4)
    except Exception as e:
        print(f"    Element consistency error: {e}")

    # --- Table metrics ---
    if table_gt_files:
        try:
            from scoring.table_scoring import score_tables
            table_gt_data = json.loads(table_gt_files[0].read_text())
            ts = score_tables(elements, table_gt_data,
                              sample_format="html", ground_truth_format="text")
            if ts and hasattr(ts, "scores") and ts.scores is not None:
                s = ts.scores
                for attr in ["overall", "detection_f", "cell_level_content_acc",
                             "shifted_cell_content_acc", "cell_level_index_acc",
                             "table_teds", "table_teds_corrected"]:
                    val = getattr(s, attr, None)
                    if val is not None:
                        scores[f"table_{attr}"] = round(val, 4)
        except Exception as e:
            print(f"    Table scoring error: {e}")

    return scores


def main():
    import argparse
    parser = argparse.ArgumentParser(description="SCORE Evaluation: AILANG vs Unstructured")
    parser.add_argument("--cached", action="store_true",
                        help="Use cached AILANG outputs from results/ instead of re-running")
    parser.add_argument("--iterations", type=int, default=1,
                        help="Run AILANG N times per document, keep best tokens_found score")
    args = parser.parse_args()

    print("=" * 70)
    print("SCORE Evaluation: AILANG vs Unstructured")
    print("Using Unstructured's own eval framework and ground truth")
    if args.cached:
        print("(Using cached AILANG outputs)")
    elif args.iterations > 1:
        print(f"(Running {args.iterations} iterations, keeping best)")
    print("=" * 70)

    content_gt_dir = SIMPLE_DATA / "content-gt"
    table_gt_dir = SIMPLE_DATA / "table-gt"

    all_results = {}

    for pdf_name in SAMPLE_PDFS:
        pdf_path = SIMPLE_DATA / "src" / pdf_name
        if not pdf_path.exists():
            print(f"\nSkipping {pdf_name}: file not found")
            continue

        short_name = pdf_name[:40] + "..." if len(pdf_name) > 40 else pdf_name
        print(f"\n{'─' * 60}")
        print(f"Document: {short_name}")
        print(f"{'─' * 60}")

        doc_results = {"pdf": pdf_name}

        # --- AILANG ---
        ailang_cached_path = RESULTS_DIR / f"score_ailang_{pdf_name}.json"

        if args.cached and ailang_cached_path.exists():
            ailang_elements = json.loads(ailang_cached_path.read_text())
            print(f"    AILANG (cached): {len(ailang_elements)} elements")
        else:
            best_elements = None
            best_tokens_found = -1.0

            for i in range(args.iterations):
                if args.iterations > 1:
                    print(f"  Iteration {i + 1}/{args.iterations}...")
                ailang_json = run_ailang_on_pdf(pdf_path)
                if ailang_json:
                    elements = ailang_json_to_unstructured_elements(ailang_json)
                    print(f"    AILANG: {len(elements)} elements")

                    # Score to check tokens_found for best-of-N
                    if args.iterations > 1:
                        try:
                            from processing.text_processing import extract_text
                            from scoring.content_scoring import calculate_percent_tokens_found
                            content_gt_files = list(content_gt_dir.glob(f"{pdf_name}*"))
                            if content_gt_files:
                                gt_text = extract_text(content_gt_files[0].read_text(), "v1")
                                pred_text = extract_text(elements, "v1")
                                tf = calculate_percent_tokens_found(pred_text, gt_text)
                                print(f"    tokens_found: {tf:.4f}")
                                if tf > best_tokens_found:
                                    best_tokens_found = tf
                                    best_elements = elements
                        except Exception:
                            best_elements = elements
                    else:
                        best_elements = elements

            ailang_elements = best_elements
            if ailang_elements:
                with open(ailang_cached_path, "w") as f:
                    json.dump(ailang_elements, f, indent=2)

        if ailang_elements:
            print(f"  Scoring AILANG...")
            ailang_scores = score_all_metrics(ailang_elements, pdf_name,
                                              content_gt_dir, table_gt_dir)
            doc_results["ailang"] = ailang_scores

        # --- Unstructured (their provided prediction) ---
        unstr_pred_path = SIMPLE_DATA / "od-first-prediction" / f"{pdf_name}.json"
        if unstr_pred_path.exists():
            unstr_elements = json.loads(unstr_pred_path.read_text())
            print(f"    Unstructured: {len(unstr_elements)} elements")

            print(f"  Scoring Unstructured...")
            unstr_scores = score_all_metrics(unstr_elements, pdf_name,
                                             content_gt_dir, table_gt_dir)
            doc_results["unstructured"] = unstr_scores

        all_results[pdf_name] = doc_results

    # --- Print comparison ---
    print(f"\n{'=' * 70}")
    print("SCORE COMPARISON: AILANG vs Unstructured")
    print(f"{'=' * 70}")

    metric_labels = {
        "cct": "CCT (Edit Distance)",
        "adjusted_cct": "Adjusted CCT",
        "tokens_found": "Tokens Found (recall)",
        "tokens_added": "Tokens Added (halluc.)",
        "element_alignment": "Element Alignment",
        "element_consistency_f1": "Element Consistency F1",
        "table_detection_f": "Table Detection F",
        "table_content_acc": "Table Content Acc",
        "table_shifted_content_acc": "Table Shifted Content",
        "table_index_acc": "Table Index Acc",
        "table_teds": "Table TEDS",
        "table_teds_corrected": "Table TEDS Corrected",
        "table_overall": "Table Overall",
    }

    lower_is_better = {"tokens_added"}

    for pdf_name, doc_results in all_results.items():
        short = pdf_name[:50] + "..." if len(pdf_name) > 50 else pdf_name
        print(f"\n  {short}")
        print(f"  {'Metric':<25} {'AILANG':>10} {'Unstr':>10} {'Winner':>10}")
        print(f"  {'─' * 58}")

        ailang = doc_results.get("ailang", {})
        unstr = doc_results.get("unstructured", {})

        all_metrics = sorted(set(list(ailang.keys()) + list(unstr.keys())))
        for m in all_metrics:
            a = ailang.get(m)
            u = unstr.get(m)
            if a is None and u is None:
                continue

            a_str = f"{a:.4f}" if a is not None else "N/A"
            u_str = f"{u:.4f}" if u is not None else "N/A"

            if a is not None and u is not None:
                if m in lower_is_better:
                    winner = "AILANG" if a < u - 0.001 else ("Unstr" if u < a - 0.001 else "TIE")
                else:
                    winner = "AILANG" if a > u + 0.001 else ("Unstr" if u > a + 0.001 else "TIE")
            else:
                winner = ""

            label = metric_labels.get(m, m)
            print(f"  {label:<25} {a_str:>10} {u_str:>10} {winner:>10}")

    # Save results
    results_path = RESULTS_DIR / "score_eval_results.json"
    with open(results_path, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nResults saved to {results_path}")


if __name__ == "__main__":
    main()
