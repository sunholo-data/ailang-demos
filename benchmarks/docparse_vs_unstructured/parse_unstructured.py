"""Unstructured library wrapper for document parsing benchmark."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


def partition_file(filepath: str | Path) -> tuple[list[dict[str, Any]], float]:
    """Partition a document using the appropriate Unstructured partitioner.

    Returns (elements_as_dicts, elapsed_seconds).
    """
    filepath = Path(filepath)
    ext = filepath.suffix.lower()

    partitioner, kwargs = _get_partitioner(ext)

    start = time.perf_counter()
    elements = partitioner(filename=str(filepath), **kwargs)
    elapsed = time.perf_counter() - start

    from unstructured.staging.base import convert_to_dict

    return convert_to_dict(elements), elapsed


def _get_partitioner(ext: str):
    """Return (partition_fn, extra_kwargs) for the given extension."""
    if ext == ".docx":
        from unstructured.partition.docx import partition_docx
        return partition_docx, {}
    elif ext == ".pptx":
        from unstructured.partition.pptx import partition_pptx
        return partition_pptx, {}
    elif ext == ".xlsx":
        from unstructured.partition.xlsx import partition_xlsx
        return partition_xlsx, {}
    elif ext == ".pdf":
        from unstructured.partition.pdf import partition_pdf
        # Use "fast" strategy by default (pdfminer-based).
        # "hi_res" requires model downloads and is much slower.
        # Caller can override via environment or CLI flag.
        return partition_pdf, {"strategy": "fast"}
    else:
        from unstructured.partition.auto import partition
        return partition, {}


def partition_file_raw(filepath: str | Path) -> list[dict[str, Any]]:
    """Partition without timing — convenience for inspection."""
    elements, _ = partition_file(filepath)
    return elements


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: uv run python parse_unstructured.py <file>")
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}")
        sys.exit(1)

    elements, elapsed = partition_file(path)
    print(f"Parsed {path.name} in {elapsed*1000:.1f}ms — {len(elements)} elements")
    print()
    for el in elements:
        text_preview = (el.get("text", ""))[:80]
        print(f"  [{el['type']}] {text_preview}")
    print()
    # Also dump full JSON for inspection
    out = path.with_suffix(".unstructured.json")
    with open(out, "w") as f:
        json.dump(elements, f, indent=2, default=str)
    print(f"Full output: {out}")
