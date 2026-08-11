#!/usr/bin/env python3
"""Generate a professional PDF guide for Skywin POS QwicksApp API Integration."""

from __future__ import annotations

import os
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT_PDF = OUTPUT_DIR / "Skywin-QwicksApp-API-Guide.pdf"

# Also save to artifact directory if available
ARTIFACT_DIR = Path("/Users/jai/.gemini/antigravity/brain/1b3814ec-6d51-4a2a-800e-970fa755ccf8")
ARTIFACT_PDF = ARTIFACT_DIR / "Skywin-QwicksApp-API-Guide.pdf"


class NumberedCanvas(canvas.Canvas):
    """Canvas that computes total pages dynamically and draws header/footer."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))

        # Skip running header on first page cover
        if self._pageNumber > 1:
            self.drawString(2 * cm, 28.5 * cm, "Skywin POS — QwicksApp API Integration Guide")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(2 * cm, 28.3 * cm, 19 * cm, 28.3 * cm)

        # Running Footer
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(19 * cm, 1.2 * cm, page_str)
        self.drawString(2 * cm, 1.2 * cm, "CONFIDENTIAL — SKYWIN BIOTECH / AGRI SUPER MARKET")
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(2 * cm, 1.6 * cm, 19 * cm, 1.6 * cm)

        self.restoreState()


def build_styles():
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=30,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#065f46"),
        spaceAfter=6,
    )

    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#047857"),
        spaceAfter=15,
    )

    h1_style = ParagraphStyle(
        "SectionH1",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#065f46"),
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        "SectionH2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        "BodyDark",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6,
    )

    code_style = ParagraphStyle(
        "CodeBlock",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0f172a"),
        backColor=colors.HexColor("#f1f5f9"),
        borderColor=colors.HexColor("#cbd5e1"),
        borderWidth=0.5,
        borderPadding=6,
        spaceBefore=4,
        spaceAfter=8,
    )

    table_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#1e293b"),
    )

    table_cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#0f172a"),
    )

    return {
        "title": title_style,
        "subtitle": subtitle_style,
        "h1": h1_style,
        "h2": h2_style,
        "body": body_style,
        "code": code_style,
        "cell": table_cell_style,
        "cell_bold": table_cell_bold,
    }


def generate_pdf():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if ARTIFACT_DIR.exists():
        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    doc = BaseDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        id="normal",
        topPadding=10,
        bottomPadding=10,
    )
    template = PageTemplate(id="main", frames=frame)
    doc.addPageTemplates([template])

    st = build_styles()
    story = []

    # Header Banner
    story.append(Paragraph("SKYWIN BIOTECH — AGRI SUPER MARKET", st["subtitle"]))
    story.append(Paragraph("QwicksApp API Integration Guide", st["title"]))
    story.append(
        HRFlowable(
            width="100%",
            thickness=1.5,
            color=colors.HexColor("#059669"),
            spaceBefore=4,
            spaceAfter=12,
        )
    )

    # 1. Executive Summary
    story.append(Paragraph("1. Simple Overview & Purpose", st["h1"]))
    story.append(
        Paragraph(
            "This document explains how the <b>QwicksApp Mobile Application</b> communicates with "
            "<b>Skywin POS</b>. The integration acts as a real-time bridge between physical store inventory "
            "and online customer orders.",
            st["body"],
        )
    )

    summary_data = [
        [
            Paragraph("<b>Feature</b>", st["cell_bold"]),
            Paragraph("<b>How it Works</b>", st["cell_bold"]),
        ],
        [
            Paragraph("<b>1. Live Inventory Sync</b>", st["cell_bold"]),
            Paragraph(
                "QwicksApp pulls live product data, pricing, stock levels, HSN codes, and GST rates.",
                st["cell"],
            ),
        ],
        [
            Paragraph("<b>2. Checkout Stock Check</b>", st["cell_bold"]),
            Paragraph(
                "Before a customer pays, QwicksApp checks live database stock to verify item availability.",
                st["cell"],
            ),
        ],
        [
            Paragraph("<b>3. Order Webhook Ingestion</b>", st["cell_bold"]),
            Paragraph(
                "Completed QwicksApp orders automatically create retail bills and deduct stock in POS.",
                st["cell"],
            ),
        ],
    ]
    t_summary = Table(summary_data, colWidths=[5 * cm, 12 * cm])
    t_summary.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ecfdf5")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#a7f3d0")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(t_summary)
    story.append(Spacer(1, 10))

    # 2. Authentication & Keys
    story.append(Paragraph("2. API Key & Endpoint Credentials", st["h1"]))
    story.append(
        Paragraph(
            "All incoming API requests from QwicksApp must include the secret API key in the HTTP header <b>x-api-key</b>.",
            st["body"],
        )
    )

    cred_data = [
        [Paragraph("<b>Parameter</b>", st["cell_bold"]), Paragraph("<b>Value</b>", st["cell_bold"])],
        [Paragraph("Header Name", st["cell"]), Paragraph("<code>x-api-key</code>", st["cell"])],
        [Paragraph("Default API Key", st["cell"]), Paragraph("<code>skywin_qwicks_api_key_7596</code>", st["cell"])],
        [Paragraph("Merchant ID", st["cell"]), Paragraph("<code>skywin</code>", st["cell"])],
        [Paragraph("Live Domain Endpoint", st["cell"]), Paragraph("<code>https://skywin.qwicksapp.com</code>", st["cell"])],
        [Paragraph("Live Server Direct IP", st["cell"]), Paragraph("<code>http://187.127.216.26</code>", st["cell"])],
    ]
    t_cred = Table(cred_data, colWidths=[5 * cm, 12 * cm])
    t_cred.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(t_cred)
    story.append(Spacer(1, 10))

    # 3. Endpoint 1: Inventory Pull
    story.append(Paragraph("3. Endpoint 1: Live Inventory Pull", st["h1"]))
    story.append(
        Paragraph(
            "<b>URL:</b> <code>https://skywin.qwicksapp.com/api/qwicks/inventory</code> (Method: GET)<br/>"
            "Returns all active products formatted to QwicksApp specifications.",
            st["body"],
        )
    )
    story.append(
        Paragraph(
            "<b>Terminal Test Command (cURL):</b><br/>"
            "curl -H \"x-api-key: skywin_qwicks_api_key_7596\" https://skywin.qwicksapp.com/api/qwicks/inventory",
            st["code"],
        )
    )
    story.append(
        Paragraph(
            "<b>Sample Response JSON:</b><br/>"
            "{\n"
            '  "merchantId": "SkywinKmu",\n'
            '  "totalProducts": 1015,\n'
            '  "replaceExistingImages": false,\n'
            '  "products": [\n'
            "    {\n"
            '      "productCode": "10001081",\n'
            '      "fullName": "WAR 250 GM",\n'
            '      "shortName": "WAR 250 GM",\n'
            '      "salePrice": 336.46,\n'
            '      "mrp": 1110,\n'
            '      "stock": 720,\n'
            '      "categoryName": "RATNAKAR",\n'
            '      "barCode": "10001081",\n'
            '      "hsn": "38089910",\n'
            '      "taxPercentage": 18,\n'
            '      "isActive": true\n'
            "    }\n"
            "  ]\n"
            "}",
            st["code"],
        )
    )

    story.append(Spacer(1, 10))

    # 4. Endpoint 2: Real-time Stock Check
    story.append(Paragraph("4. Endpoint 2: Checkout Stock Validation (stockCheck)", st["h1"]))
    story.append(
        Paragraph(
            "<b>URL:</b> <code>https://skywin.qwicksapp.com/api/qwicks/stock-check</code> (Method: POST)<br/>"
            "Called by QwicksApp when a customer proceeds to checkout.",
            st["body"],
        )
    )
    story.append(
        Paragraph(
            "<b>Terminal Test Command (cURL - 1 Line Copy & Paste):</b><br/>"
            "curl -X POST https://skywin.qwicksapp.com/api/qwicks/stock-check -H \"Content-Type: application/json\" -H \"x-api-key: skywin_qwicks_api_key_7596\" -d '{\"merchantId\":\"skywin\",\"requestId\":\"stk_101\",\"items\":[{\"productCode\":\"10001081\",\"requestedQty\":2}]}'",
            st["code"],
        )
    )
    story.append(
        Paragraph(
            "<b>Response JSON:</b><br/>"
            "{\n"
            '  "success": true,\n'
            '  "merchantId": "SkywinKmu",\n'
            '  "requestId": "stk_101",\n'
            '  "canPlaceOrder": true,\n'
            '  "results": [\n'
            '    { "productCode": "10001081", "availableQty": 720, "isAvailable": true }\n'
            "  ]\n"
            "}",
            st["code"],
        )
    )

    story.append(Spacer(1, 10))

    # 5. Endpoint 3: Order Webhook
    story.append(Paragraph("5. Endpoint 3: Order Ingestion Webhook (orderPush)", st["h1"]))
    story.append(
        Paragraph(
            "<b>URL:</b> <code>https://skywin.qwicksapp.com/api/qwicks/order-placed</code> (Method: POST)<br/>"
            "Posts customer order details to automatically generate a retail bill and deduct stock in POS.",
            st["body"],
        )
    )
    story.append(
        Paragraph(
            "<b>Terminal Test Command (cURL - 1 Line Copy & Paste):</b><br/>"
            "curl -X POST https://skywin.qwicksapp.com/api/qwicks/order-placed -H \"Content-Type: application/json\" -H \"x-api-key: skywin_qwicks_api_key_7596\" -d '{\"eventType\":\"order_placed\",\"orderId\":\"DEL-01\",\"customer\":{\"name\":\"Ramesh\",\"phone\":\"9942499929\"},\"items\":[{\"productCode\":\"10001081\",\"qty\":1,\"unitPrice\":336.46}]}'",
            st["code"],
        )
    )
    story.append(
        Paragraph(
            "<b>Response JSON:</b><br/>"
            "{\n"
            '  "success": true,\n'
            '  "orderId": "DEL-01",\n'
            '  "saleId": 145,\n'
            '  "message": "Order successfully ingested into Skywin POS"\n'
            "}",
            st["code"],
        )
    )

    doc.build(story, canvasmaker=NumberedCanvas)

    # Copy to artifact path as well
    if ARTIFACT_DIR.exists():
        import shutil
        shutil.copy(OUTPUT_PDF, ARTIFACT_PDF)

    print(f"Successfully generated PDF: {OUTPUT_PDF}")


if __name__ == "__main__":
    generate_pdf()
