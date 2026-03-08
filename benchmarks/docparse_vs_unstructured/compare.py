"""Compare normalized outputs from AILANG docparse and Unstructured.

Produces per-file metrics and feature-specific checks.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from normalize import NormalizedElement


def compare_outputs(
    ailang_elements: list[NormalizedElement],
    unstructured_elements: list[NormalizedElement],
    filename: str = "",
) -> dict[str, Any]:
    """Compare two normalized element lists and return metrics."""
    ailang_stats = _element_stats(ailang_elements)
    unstructured_stats = _element_stats(unstructured_elements)

    text_comparison = _compare_text_coverage(ailang_elements, unstructured_elements)
    feature_checks = _check_features(ailang_elements, unstructured_elements, filename)
    image_comparison = _compare_images(ailang_elements, unstructured_elements)

    return {
        "ailang": ailang_stats,
        "unstructured": unstructured_stats,
        "text_comparison": text_comparison,
        "feature_checks": feature_checks,
        "image_comparison": image_comparison,
    }


def _element_stats(elements: list[NormalizedElement]) -> dict[str, Any]:
    """Compute basic stats for a list of elements."""
    type_counts = Counter(el.type for el in elements)
    total_text = sum(len(el.text) for el in elements)

    return {
        "total_elements": len(elements),
        "element_types": dict(type_counts),
        "total_text_chars": total_text,
        "unique_types": len(type_counts),
        "has_headings": type_counts.get("heading", 0) > 0,
        "has_tables": type_counts.get("table", 0) > 0,
        "has_list_items": type_counts.get("list_item", 0) > 0,
        "has_images": type_counts.get("image", 0) > 0,
        "has_headers_footers": (
            type_counts.get("header", 0) + type_counts.get("footer", 0) > 0
        ),
        "has_track_changes": type_counts.get("change", 0) > 0,
    }


def _tokenize(text: str) -> set[str]:
    """Extract lowercase word tokens from text."""
    return set(re.findall(r"\b[a-zA-Z0-9]+\b", text.lower()))


def _compare_text_coverage(
    ailang: list[NormalizedElement], unstructured: list[NormalizedElement]
) -> dict[str, Any]:
    """Compare text coverage between the two tools using word-level Jaccard."""
    ailang_words = set()
    for el in ailang:
        ailang_words |= _tokenize(el.text)

    unstructured_words = set()
    for el in unstructured:
        unstructured_words |= _tokenize(el.text)

    intersection = ailang_words & unstructured_words
    union = ailang_words | unstructured_words

    jaccard = len(intersection) / len(union) if union else 1.0
    ailang_exclusive = ailang_words - unstructured_words
    unstructured_exclusive = unstructured_words - ailang_words

    # Directional recall: what % of the OTHER tool's words does THIS tool also find?
    # ailang_recall = how much of Unstructured's content AILANG also captures
    # unstructured_recall = how much of AILANG's content Unstructured also captures
    ailang_recall = (
        len(intersection) / len(unstructured_words) if unstructured_words else 1.0
    )
    unstructured_recall = (
        len(intersection) / len(ailang_words) if ailang_words else 1.0
    )

    # Find element types exclusive to each tool
    ailang_types = set(el.type for el in ailang)
    unstructured_types = set(el.type for el in unstructured)

    return {
        "text_overlap_ratio": round(jaccard, 4),
        "ailang_recall": round(ailang_recall, 4),
        "unstructured_recall": round(unstructured_recall, 4),
        "ailang_word_count": len(ailang_words),
        "unstructured_word_count": len(unstructured_words),
        "shared_words": len(intersection),
        "ailang_exclusive_words": sorted(list(ailang_exclusive))[:20],  # cap for readability
        "unstructured_exclusive_words": sorted(list(unstructured_exclusive))[:20],
        "ailang_exclusive_word_count": len(ailang_exclusive),
        "unstructured_exclusive_word_count": len(unstructured_exclusive),
        "ailang_only_types": sorted(ailang_types - unstructured_types),
        "unstructured_only_types": sorted(unstructured_types - ailang_types),
    }


def _check_features(
    ailang: list[NormalizedElement],
    unstructured: list[NormalizedElement],
    filename: str,
) -> dict[str, Any]:
    """Run feature-specific checks based on the test file."""
    checks = {}
    fname = filename.lower()

    if "merged_cells" in fname:
        # Check merged cell detection
        ailang_merges = any(
            el.metadata.get("has_merge_info", False)
            for el in ailang
            if el.type == "table"
        )
        unstructured_merges = any(
            "colspan" in (el.metadata.get("table_html") or "").lower()
            or "rowspan" in (el.metadata.get("table_html") or "").lower()
            for el in unstructured
            if el.type == "table"
        )
        checks["merged_cells"] = {
            "ailang": ailang_merges,
            "unstructured": unstructured_merges,
        }

    if "hdrftr" in fname:
        # Check header/footer extraction
        ailang_hf = sum(1 for el in ailang if el.type in ("header", "footer"))
        unstructured_hf = sum(1 for el in unstructured if el.type in ("header", "footer"))
        checks["headers_footers"] = {
            "ailang": ailang_hf,
            "unstructured": unstructured_hf,
        }

    if "shapes" in fname:
        # Check text box content extraction
        ailang_textbox = sum(
            1 for el in ailang if el.metadata.get("section") == "textbox"
        )
        unstructured_any = len(unstructured)
        checks["text_boxes"] = {
            "ailang_textbox_elements": ailang_textbox,
            "unstructured_total_elements": unstructured_any,
        }

    if "track_changes" in fname:
        ailang_changes = sum(1 for el in ailang if el.type == "change")
        unstructured_changes = sum(1 for el in unstructured if el.type == "change")
        checks["track_changes"] = {
            "ailang": ailang_changes,
            "unstructured": unstructured_changes,
            "note": "Unstructured does not extract track changes as structured data",
        }

    if fname == "tables.docx" or (fname.endswith(".docx") and "table" in fname):
        ailang_tables = sum(1 for el in ailang if el.type == "table")
        unstructured_tables = sum(1 for el in unstructured if el.type == "table")
        checks["table_count"] = {
            "ailang": ailang_tables,
            "unstructured": unstructured_tables,
        }

    if "image" in fname or "vml" in fname:
        ailang_images = sum(1 for el in ailang if el.type == "image")
        unstructured_images = sum(1 for el in unstructured if el.type == "image")
        checks["image_extraction"] = {
            "ailang": ailang_images,
            "unstructured": unstructured_images,
        }

    if fname.endswith(".pdf"):
        ailang_has_content = any(len(el.text) > 0 for el in ailang)
        unstructured_has_content = any(len(el.text) > 0 for el in unstructured)
        checks["pdf_text_extraction"] = {
            "ailang": ailang_has_content,
            "unstructured": unstructured_has_content,
        }

    return checks


def _compare_images(
    ailang: list[NormalizedElement], unstructured: list[NormalizedElement]
) -> dict[str, Any]:
    """Compare image extraction between tools."""
    ailang_images = [el for el in ailang if el.type == "image"]
    unstructured_images = [el for el in unstructured if el.type == "image"]

    ailang_described = [
        el for el in ailang_images if el.metadata.get("image_description")
    ]

    return {
        "ailang_image_count": len(ailang_images),
        "unstructured_image_count": len(unstructured_images),
        "ailang_with_descriptions": len(ailang_described),
        "ailang_total_description_chars": sum(
            len(el.metadata.get("image_description", "")) for el in ailang_described
        ),
    }


def aggregate_results(
    per_file: dict[str, dict[str, Any]],
    coldstart_ms: float = 0.0,
) -> dict[str, Any]:
    """Aggregate per-file results into summary metrics."""
    ailang_times = []
    ailang_parse_only_times = []
    unstructured_times = []
    ailang_elements_total = 0
    unstructured_elements_total = 0
    overlap_ratios = []
    ailang_recall_ratios = []
    unstructured_recall_ratios = []
    ailang_more_elements = 0
    unstructured_more_elements = 0
    ailang_more_text = 0
    unstructured_more_text = 0

    for fname, result in per_file.items():
        if "ailang_time_ms" in result:
            ailang_times.append(result["ailang_time_ms"])
        if "ailang_parse_only_ms" in result:
            ailang_parse_only_times.append(result["ailang_parse_only_ms"])
        if "unstructured_time_ms" in result:
            unstructured_times.append(result["unstructured_time_ms"])

        comp = result.get("comparison", {})
        a_stats = comp.get("ailang", {})
        u_stats = comp.get("unstructured", {})

        a_count = a_stats.get("total_elements", 0)
        u_count = u_stats.get("total_elements", 0)
        ailang_elements_total += a_count
        unstructured_elements_total += u_count

        if a_count > u_count:
            ailang_more_elements += 1
        elif u_count > a_count:
            unstructured_more_elements += 1

        a_text = a_stats.get("total_text_chars", 0)
        u_text = u_stats.get("total_text_chars", 0)
        if a_text > u_text:
            ailang_more_text += 1
        elif u_text > a_text:
            unstructured_more_text += 1

        tc = comp.get("text_comparison", {})
        if "text_overlap_ratio" in tc:
            overlap_ratios.append(tc["text_overlap_ratio"])
        if "ailang_recall" in tc:
            ailang_recall_ratios.append(tc["ailang_recall"])
        if "unstructured_recall" in tc:
            unstructured_recall_ratios.append(tc["unstructured_recall"])

    def _median(vals):
        if not vals:
            return 0
        s = sorted(vals)
        n = len(s)
        return s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2

    return {
        "file_count": len(per_file),
        "ailang_coldstart_ms": coldstart_ms,
        "ailang": {
            "median_parse_time_ms": round(_median(ailang_times), 1),
            "median_parse_only_ms": round(_median(ailang_parse_only_times), 1),
            "total_elements": ailang_elements_total,
            "files_with_more_elements": ailang_more_elements,
            "files_with_more_text": ailang_more_text,
        },
        "unstructured": {
            "median_parse_time_ms": round(_median(unstructured_times), 1),
            "total_elements": unstructured_elements_total,
            "files_with_more_elements": unstructured_more_elements,
            "files_with_more_text": unstructured_more_text,
        },
        "mean_text_overlap": round(
            sum(overlap_ratios) / len(overlap_ratios) if overlap_ratios else 0, 4
        ),
        "mean_ailang_recall": round(
            sum(ailang_recall_ratios) / len(ailang_recall_ratios) if ailang_recall_ratios else 0, 4
        ),
        "mean_unstructured_recall": round(
            sum(unstructured_recall_ratios) / len(unstructured_recall_ratios) if unstructured_recall_ratios else 0, 4
        ),
    }
