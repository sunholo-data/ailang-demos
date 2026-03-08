#!/usr/bin/env python3
"""Generate synthetic PDF test files for benchmarking.

Creates small, reproducible PDFs with known content for fair comparison.
Run once: uv run python create_test_pdfs.py
"""

from pathlib import Path

def create_text_heavy_pdf(output_path: Path):
    """Create a text-heavy PDF with headings, paragraphs, and lists."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem
        from reportlab.lib.units import inch

        doc = SimpleDocTemplate(str(output_path), pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph("Annual Technology Report 2025", styles["Title"]))
        story.append(Spacer(1, 0.3 * inch))

        story.append(Paragraph("Executive Summary", styles["Heading1"]))
        story.append(Paragraph(
            "This report examines the key technology trends of 2025, including advances in "
            "artificial intelligence, cloud computing, and cybersecurity. The global technology "
            "market has grown significantly, with AI-driven solutions leading the way in enterprise "
            "adoption across multiple sectors.",
            styles["BodyText"]
        ))
        story.append(Spacer(1, 0.2 * inch))

        story.append(Paragraph("Key Findings", styles["Heading1"]))
        story.append(Paragraph("Cloud Infrastructure", styles["Heading2"]))
        story.append(Paragraph(
            "Cloud computing continues to dominate enterprise IT spending. Multi-cloud strategies "
            "are now standard practice, with organizations leveraging an average of 3.4 cloud "
            "providers. Edge computing has emerged as a critical complement to centralized cloud, "
            "particularly for latency-sensitive applications in manufacturing and healthcare.",
            styles["BodyText"]
        ))

        story.append(Paragraph("Artificial Intelligence", styles["Heading2"]))
        story.append(Paragraph(
            "Large language models have moved beyond experimental phases into production deployments. "
            "Key developments include improved reasoning capabilities, multimodal understanding, "
            "and significant reductions in inference costs. Enterprise AI adoption has increased "
            "by 47% year-over-year.",
            styles["BodyText"]
        ))
        story.append(Spacer(1, 0.2 * inch))

        story.append(Paragraph("Recommendations", styles["Heading1"]))
        items = [
            "Invest in AI governance frameworks before scaling deployments",
            "Adopt a multi-cloud strategy with vendor-agnostic tooling",
            "Prioritize cybersecurity training alongside technology investments",
            "Evaluate edge computing for latency-sensitive workloads",
            "Build internal data platforms to support AI initiatives",
        ]
        for item in items:
            story.append(Paragraph(f"• {item}", styles["BodyText"]))

        story.append(Spacer(1, 0.2 * inch))
        story.append(Paragraph("Conclusion", styles["Heading1"]))
        story.append(Paragraph(
            "The technology landscape in 2025 is characterized by rapid AI advancement and "
            "increasing cloud maturity. Organizations that invest strategically in these areas "
            "while maintaining strong governance will be best positioned for success.",
            styles["BodyText"]
        ))

        doc.build(story)
        print(f"  Created: {output_path}")
    except ImportError:
        print("  SKIP: reportlab not installed (pip install reportlab)")
        return False
    return True


def create_table_pdf(output_path: Path):
    """Create a PDF with multiple tables."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.units import inch
        from reportlab.lib import colors

        doc = SimpleDocTemplate(str(output_path), pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph("Quarterly Financial Summary", styles["Title"]))
        story.append(Spacer(1, 0.3 * inch))

        story.append(Paragraph("Revenue by Region (Q1-Q4, millions USD)", styles["Heading2"]))
        revenue_data = [
            ["Region", "Q1", "Q2", "Q3", "Q4", "Total"],
            ["North America", "245.3", "267.8", "289.1", "312.4", "1114.6"],
            ["Europe", "189.7", "201.3", "215.6", "228.9", "835.5"],
            ["Asia Pacific", "156.2", "178.4", "195.3", "210.7", "740.6"],
            ["Latin America", "45.8", "52.1", "58.3", "63.7", "219.9"],
            ["Middle East & Africa", "23.4", "27.6", "31.2", "35.8", "118.0"],
        ]
        t = Table(revenue_data, colWidths=[1.5 * inch] + [0.8 * inch] * 5)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]))
        story.append(t)
        story.append(Spacer(1, 0.3 * inch))

        story.append(Paragraph("Employee Headcount by Department", styles["Heading2"]))
        emp_data = [
            ["Department", "Full-Time", "Part-Time", "Contractors"],
            ["Engineering", "1,245", "89", "342"],
            ["Sales", "567", "123", "78"],
            ["Marketing", "234", "45", "156"],
            ["Operations", "389", "67", "201"],
            ["HR", "123", "34", "12"],
            ["Finance", "178", "28", "45"],
        ]
        t2 = Table(emp_data, colWidths=[1.5 * inch, 1.2 * inch, 1.2 * inch, 1.2 * inch])
        t2.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.darkblue),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]))
        story.append(t2)

        doc.build(story)
        print(f"  Created: {output_path}")
    except ImportError:
        print("  SKIP: reportlab not installed")
        return False
    return True


def create_mixed_layout_pdf(output_path: Path):
    """Create a PDF with mixed content: text, table, and a drawn figure."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
        from reportlab.lib.units import inch
        from reportlab.lib import colors
        from reportlab.graphics.shapes import Drawing, Rect, String, Circle
        from reportlab.graphics import renderPDF
        from reportlab.platypus.flowables import Flowable

        class DrawingFlowable(Flowable):
            def __init__(self, width, height):
                super().__init__()
                self.width = width
                self.height = height

            def draw(self):
                self.canv.setFillColor(colors.lightblue)
                self.canv.rect(0, 0, self.width, self.height, fill=1)
                self.canv.setFillColor(colors.darkblue)
                self.canv.setFont("Helvetica-Bold", 14)
                self.canv.drawCentredString(self.width / 2, self.height / 2, "Figure 1: System Architecture")
                # Draw some boxes to simulate a diagram
                self.canv.setFillColor(colors.white)
                self.canv.rect(20, 20, 100, 40, fill=1)
                self.canv.rect(160, 20, 100, 40, fill=1)
                self.canv.rect(300, 20, 100, 40, fill=1)
                self.canv.setFillColor(colors.black)
                self.canv.setFont("Helvetica", 10)
                self.canv.drawCentredString(70, 35, "Frontend")
                self.canv.drawCentredString(210, 35, "API Gateway")
                self.canv.drawCentredString(350, 35, "Database")

        doc = SimpleDocTemplate(str(output_path), pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph("System Design Document", styles["Title"]))
        story.append(Spacer(1, 0.2 * inch))

        story.append(Paragraph("1. Overview", styles["Heading1"]))
        story.append(Paragraph(
            "This document describes the architecture of the data processing system. "
            "The system consists of three main components: a web frontend, an API gateway, "
            "and a distributed database cluster.",
            styles["BodyText"]
        ))
        story.append(Spacer(1, 0.2 * inch))

        story.append(Paragraph("2. Architecture Diagram", styles["Heading1"]))
        story.append(DrawingFlowable(420, 100))
        story.append(Spacer(1, 0.2 * inch))

        story.append(Paragraph("3. Component Specifications", styles["Heading1"]))
        spec_data = [
            ["Component", "Technology", "Version", "SLA"],
            ["Frontend", "React 19", "19.1.0", "99.9%"],
            ["API Gateway", "Kong", "3.8", "99.95%"],
            ["Database", "PostgreSQL", "17.2", "99.99%"],
            ["Cache", "Redis", "8.0", "99.9%"],
            ["Message Queue", "Kafka", "4.0", "99.95%"],
        ]
        t = Table(spec_data, colWidths=[1.3 * inch, 1.3 * inch, 1.0 * inch, 1.0 * inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]))
        story.append(t)
        story.append(Spacer(1, 0.2 * inch))

        story.append(Paragraph("4. Deployment Notes", styles["Heading1"]))
        story.append(Paragraph(
            "The system is deployed on Kubernetes with automatic scaling enabled. "
            "Each component runs in its own namespace with resource quotas enforced. "
            "Blue-green deployments are used for zero-downtime updates.",
            styles["BodyText"]
        ))

        doc.build(story)
        print(f"  Created: {output_path}")
    except ImportError:
        print("  SKIP: reportlab not installed")
        return False
    return True


if __name__ == "__main__":
    out_dir = Path(__file__).parent / "test_files"
    out_dir.mkdir(exist_ok=True)

    print("Generating benchmark PDF test files...")
    results = []
    results.append(("text_heavy.pdf", create_text_heavy_pdf(out_dir / "text_heavy.pdf")))
    results.append(("tables.pdf", create_table_pdf(out_dir / "tables.pdf")))
    results.append(("mixed_layout.pdf", create_mixed_layout_pdf(out_dir / "mixed_layout.pdf")))

    ok = sum(1 for _, r in results if r)
    print(f"\nDone: {ok}/{len(results)} PDFs created in {out_dir}/")
    if ok < len(results):
        print("Install reportlab to create missing PDFs: uv add reportlab")
