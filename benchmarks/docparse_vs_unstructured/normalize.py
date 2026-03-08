"""Normalize AILANG docparse and Unstructured outputs to a common schema.

Common element schema:
    {
        "type": str,        # heading, text, table, list_item, image, header, footer, change, section
        "text": str,        # extracted text content
        "level": int,       # heading level (0 for non-headings)
        "metadata": {
            "source_type": str,
            "section": str | None,
            "table_cells": list | None,
            "has_merge_info": bool,
            "image_mime": str | None,
            "image_data_length": int | None,
            "image_description": str | None,
        }
    }
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class NormalizedElement:
    type: str
    text: str
    level: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# --- AILANG normalizer ---

def normalize_ailang(output_json: dict[str, Any]) -> list[NormalizedElement]:
    """Flatten AILANG Block ADT JSON to normalized elements."""
    doc = output_json.get("document", {})
    blocks = doc.get("blocks", [])
    return _flatten_ailang_blocks(blocks, section=None)


def _flatten_ailang_blocks(
    blocks: list[dict], section: str | None = None
) -> list[NormalizedElement]:
    result = []
    for block in blocks:
        btype = block.get("type", "")

        if btype == "heading":
            result.append(NormalizedElement(
                type="heading",
                text=block.get("text", ""),
                level=block.get("level", 1),
                metadata={"source_type": "HeadingBlock", "section": section},
            ))

        elif btype == "text":
            result.append(NormalizedElement(
                type="text",
                text=block.get("text", ""),
                level=0,
                metadata={
                    "source_type": f"TextBlock({block.get('style', 'Normal')})",
                    "section": section,
                },
            ))

        elif btype == "table":
            all_text = _extract_table_text(block)
            has_merges = _has_merge_info(block)
            result.append(NormalizedElement(
                type="table",
                text=all_text,
                level=0,
                metadata={
                    "source_type": "TableBlock",
                    "section": section,
                    "table_cells": block.get("rows"),
                    "has_merge_info": has_merges,
                    "header_count": len(block.get("headers", [])),
                    "row_count": len(block.get("rows", [])),
                },
            ))

        elif btype == "list":
            items = block.get("items", [])
            for item in items:
                result.append(NormalizedElement(
                    type="list_item",
                    text=item if isinstance(item, str) else str(item),
                    level=0,
                    metadata={
                        "source_type": "ListBlock",
                        "section": section,
                        "is_ordered": block.get("ordered", False),
                    },
                ))

        elif btype == "image":
            result.append(NormalizedElement(
                type="image",
                text=block.get("description", ""),
                level=0,
                metadata={
                    "source_type": "ImageBlock",
                    "section": section,
                    "image_mime": block.get("mime", ""),
                    "image_data_length": block.get("dataLength", 0),
                    "image_description": block.get("description", ""),
                },
            ))

        elif btype == "section":
            kind = block.get("kind", "unknown")
            child_blocks = block.get("blocks", [])
            # Map section kinds to normalized types where appropriate
            if kind in ("header", "footer"):
                children = _flatten_ailang_blocks(child_blocks, section=kind)
                # Wrap each child with the appropriate type
                for child in children:
                    child.type = kind
                    result.append(child)
            else:
                result.extend(_flatten_ailang_blocks(child_blocks, section=kind))

        elif btype == "change":
            result.append(NormalizedElement(
                type="change",
                text=block.get("text", ""),
                level=0,
                metadata={
                    "source_type": "ChangeBlock",
                    "section": section,
                    "change_type": block.get("changeType", ""),
                    "author": block.get("author", ""),
                    "date": block.get("date", ""),
                },
            ))

        elif btype == "audio":
            result.append(NormalizedElement(
                type="audio",
                text=block.get("transcription", ""),
                level=0,
                metadata={
                    "source_type": "AudioBlock",
                    "section": section,
                    "mime": block.get("mime", ""),
                },
            ))

        elif btype == "video":
            result.append(NormalizedElement(
                type="video",
                text=block.get("description", ""),
                level=0,
                metadata={
                    "source_type": "VideoBlock",
                    "section": section,
                    "mime": block.get("mime", ""),
                },
            ))

    return result


def _extract_table_text(block: dict) -> str:
    """Join all cell text from an AILANG table block."""
    parts = []
    for header in block.get("headers", []):
        if isinstance(header, str):
            parts.append(header)
        elif isinstance(header, dict):
            parts.append(header.get("text", ""))
    for row in block.get("rows", []):
        if isinstance(row, list):
            for cell in row:
                if isinstance(cell, str):
                    parts.append(cell)
                elif isinstance(cell, dict):
                    parts.append(cell.get("text", ""))
    return " ".join(p for p in parts if p)


def _has_merge_info(block: dict) -> bool:
    """Check if any cells have merge info (colSpan/rowSpan > 1 or merged=true)."""
    for row in block.get("rows", []):
        if isinstance(row, list):
            for cell in row:
                if isinstance(cell, dict):
                    if cell.get("colSpan", 1) > 1 or cell.get("rowSpan", 1) > 1:
                        return True
                    if cell.get("merged", False):
                        return True
    return False


# --- Unstructured normalizer ---

_UNSTRUCTURED_TYPE_MAP = {
    "Title": "heading",
    "NarrativeText": "text",
    "UncategorizedText": "text",
    "Table": "table",
    "ListItem": "list_item",
    "Header": "header",
    "Footer": "footer",
    "Image": "image",
    "PageBreak": "page_break",
    "Formula": "formula",
    "FigureCaption": "text",
    "CodeSnippet": "code",
    "Address": "text",
    "EmailAddress": "text",
    "PageNumber": "text",
}


def normalize_unstructured(elements: list[dict[str, Any]]) -> list[NormalizedElement]:
    """Normalize Unstructured element dicts to common schema."""
    result = []
    for el in elements:
        src_type = el.get("type", "UncategorizedText")
        norm_type = _UNSTRUCTURED_TYPE_MAP.get(src_type, "text")
        metadata = el.get("metadata", {})

        section = None
        if src_type == "Header":
            section = "header"
        elif src_type == "Footer":
            section = "footer"

        result.append(NormalizedElement(
            type=norm_type,
            text=el.get("text", ""),
            level=1 if src_type == "Title" else 0,
            metadata={
                "source_type": src_type,
                "section": section,
                "page": metadata.get("page_number"),
                "table_html": metadata.get("text_as_html"),
            },
        ))

    return result
