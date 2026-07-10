#!/usr/bin/env python3
"""Generate Skywin Bill user manual PDF."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
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
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Skywin-Bill-User-Manual.pdf"


def build_styles():
    base = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=26,
            leading=32,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0f5132"),
            spaceAfter=12,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=13,
            leading=18,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#334155"),
            spaceAfter=8,
        ),
        "cover_meta": ParagraphStyle(
            "CoverMeta",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=16,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#64748b"),
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=24,
            textColor=colors.HexColor("#0f5132"),
            spaceBefore=10,
            spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            textColor=colors.HexColor("#14532d"),
            spaceBefore=8,
            spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#166534"),
            spaceBefore=6,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=15,
            alignment=TA_JUSTIFY,
            spaceAfter=6,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=14,
            leftIndent=14,
            bulletIndent=0,
            spaceAfter=3,
        ),
        "toc": ParagraphStyle(
            "TOC",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=16,
            leftIndent=8,
            spaceAfter=4,
        ),
        "example_title": ParagraphStyle(
            "ExampleTitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#92400e"),
            spaceAfter=4,
        ),
        "example_body": ParagraphStyle(
            "ExampleBody",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#78350f"),
            spaceAfter=2,
        ),
        "footer": ParagraphStyle(
            "Footer",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=colors.HexColor("#94a3b8"),
            alignment=TA_CENTER,
        ),
    }
    return styles


def example_box(styles, title: str, body: str):
    data = [
        [Paragraph(f"<b>Real-life example:</b> {title}", styles["example_title"])],
        [Paragraph(body, styles["example_body"])],
    ]
    t = Table(data, colWidths=[16.5 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fffbeb")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#f59e0b")),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return t


def bullets(styles, items):
    return [Paragraph(f"- {item}", styles["bullet"]) for item in items]


def steps(styles, items):
    return [Paragraph(f"{i}. {item}", styles["bullet"]) for i, item in enumerate(items, 1)]


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#e2e8f0"))
    canvas.setLineWidth(0.5)
    canvas.line(2 * cm, 2 * cm, A4[0] - 2 * cm, 2 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#94a3b8"))
    canvas.drawString(2 * cm, 1.4 * cm, "Skywin Bill - User Manual")
    canvas.drawRightString(A4[0] - 2 * cm, 1.4 * cm, f"Page {doc.page}")
    canvas.restoreState()


def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#0f5132"))
    canvas.rect(0, A4[1] - 4.5 * cm, A4[0], 4.5 * cm, fill=1, stroke=0)
    canvas.restoreState()


def build_story(styles):
    story = []

    # Cover
    story.append(Spacer(1, 5.5 * cm))
    story.append(Paragraph("Skywin Bill", styles["title"]))
    story.append(Paragraph("Complete User Manual", styles["subtitle"]))
    story.append(Spacer(1, 0.4 * cm))
    story.append(
        Paragraph(
            "POS Billing Software for SKYWIN BIOTECH - AGRI SUPER MARKET",
            styles["subtitle"],
        )
    )
    story.append(Spacer(1, 1.2 * cm))
    story.append(
        Paragraph(
            "Kumbakonam, Tamil Nadu<br/>GST Billing | Inventory | Accounts | Reports",
            styles["cover_meta"],
        )
    )
    story.append(Spacer(1, 2 * cm))
    story.append(
        Paragraph(
            f"Document version 1.0<br/>Generated {date.today().strftime('%d %B %Y')}",
            styles["cover_meta"],
        )
    )
    story.append(PageBreak())

    # TOC
    story.append(Paragraph("Table of Contents", styles["h1"]))
    toc_items = [
        "1. Introduction",
        "2. Logging In and User Roles",
        "3. Dashboard",
        "4. POS Billing (Counter Sales)",
        "5. Sale Book and Invoices",
        "6. Sales Returns (Credit Notes)",
        "7. Customers",
        "8. Purchase Book and Purchase Entry",
        "9. Suppliers",
        "10. Products",
        "11. Stock Management",
        "12. Accounts - Receipts, Payments, Outstanding",
        "13. Reports and Tally Export",
        "14. Settings",
        "15. User Management",
        "16. Quick Tips and Common Questions",
    ]
    story.extend(Paragraph(item, styles["toc"]) for item in toc_items)
    story.append(PageBreak())

    # 1 Introduction
    story.append(Paragraph("1. Introduction", styles["h1"]))
    story.append(
        Paragraph(
            "Skywin Bill is a billing and shop management software built for an agricultural "
            "supermarket. It helps your counter staff bill customers quickly, maintain correct "
            "stock, track credit sales, record purchases from suppliers, and generate GST invoices "
            "and business reports.",
            styles["body"],
        )
    )
    story.append(Paragraph("What this software can do for your shop", styles["h2"]))
    story.extend(
        bullets(
            styles,
            [
                "Bill retail and wholesale customers at the counter with GST invoice.",
                "Track stock automatically when you sell, purchase, return, or adjust inventory.",
                "Maintain customer and supplier outstanding (who owes you / whom you owe).",
                "Record receipts from customers and payments to suppliers.",
                "View daily sales, profit, low stock alerts, and export data for Tally.",
            ],
        )
    )
    story.append(Spacer(1, 0.2 * cm))
    story.append(
        example_box(
            styles,
            "A typical day at Skywin Agri Super Market",
            "Morning: Purchase entry is done for new pesticide stock received from UPL supplier. "
            "Afternoon: A farmer buys 2 bags of DAP fertilizer and 1 bottle of herbicide on cash. "
            "Counter staff scans barcodes at POS and prints the GST bill. Evening: A wholesale "
            "dealer takes seeds on credit. The bill is saved, stock reduces, and his outstanding "
            "balance increases. At closing, the owner checks Dashboard for today's total sales and "
            "opens Outstanding to see who has pending payments.",
        )
    )
    story.append(PageBreak())

    # 2 Login
    story.append(Paragraph("2. Logging In and User Roles", styles["h1"]))
    story.append(Paragraph("How to log in", styles["h2"]))
    story.extend(
        steps(
            styles,
            [
                "Open the software in your browser (the link given by your administrator).",
                "Enter your registered 10-digit mobile number.",
                "Click <b>Send OTP via WhatsApp</b>.",
                "Check WhatsApp for the 6-digit OTP code.",
                "Enter the OTP and click <b>Verify and Access Workspace</b>.",
            ],
        )
    )
    story.append(Spacer(1, 0.15 * cm))
    story.append(
        Paragraph(
            "<b>Important:</b> Only phone numbers added by the Admin in User Management can log in. "
            "If your number is not registered, contact your shop administrator.",
            styles["body"],
        )
    )
    story.append(
        example_box(
            styles,
            "Counter staff login",
            "Ravi works at the billing counter. His phone number 9876543210 is registered as "
            "Sales Officer by the Admin. Every morning he opens the software, enters his number, "
            "receives OTP on WhatsApp, and starts billing customers from the POS screen.",
        )
    )
    story.append(Paragraph("User roles explained", styles["h2"]))
    role_data = [
        ["Role", "Who uses it", "What they can do"],
        [
            "Admin",
            "Shop owner / manager",
            "Full access: billing, stock, purchases, accounts, reports, users, settings",
        ],
        [
            "Regional Manager",
            "Area manager",
            "Almost full access except User Management and Settings",
        ],
        [
            "Sales Officer",
            "Field sales / counter staff",
            "Billing, customers (mapped dealers only), stock, receipts, reports. No purchases",
        ],
        [
            "Dealer",
            "External dealer / agent",
            "Limited view: Dashboard, POS, own invoices, and own outstanding only",
        ],
    ]
    role_table = Table(role_data, colWidths=[3.2 * cm, 4.3 * cm, 9 * cm], repeatRows=1)
    role_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dcfce7")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(role_table)
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("Logging out", styles["h2"]))
    story.append(
        Paragraph(
            "Click your name at the bottom of the left sidebar and press <b>Logout</b>. "
            "Always log out if you are leaving the counter unattended.",
            styles["body"],
        )
    )
    story.append(PageBreak())

    # 3 Dashboard
    story.append(Paragraph("3. Dashboard", styles["h1"]))
    story.append(
        Paragraph(
            "The Dashboard is your home screen. It gives a quick picture of how the shop is "
            "performing today and this month.",
            styles["body"],
        )
    )
    story.append(Paragraph("What you see on the Dashboard", styles["h2"]))
    story.extend(
        bullets(
            styles,
            [
                "<b>Today's Sales</b> - total amount billed today, number of bills, retail vs wholesale split.",
                "<b>Gross Profit (MTD)</b> - estimated profit for the current month and margin percentage.",
                "<b>Stock Value</b> - total value of inventory at sale rates.",
                "<b>Receivable / Payable</b> - money customers owe you and money you owe suppliers.",
                "<b>Products / Low Stock</b> - total products and how many are below reorder level.",
                "<b>Recent Invoices</b> - last few bills created.",
                "<b>Low Stock Alerts</b> - products running low.",
                "<b>Top Selling Products</b> - best sellers recently.",
            ],
        )
    )
    story.append(Spacer(1, 0.15 * cm))
    story.append(
        example_box(
            styles,
            "Owner checks shop performance at 7 PM",
            "Mr. Murugan opens the Dashboard before closing. He sees Today's Sales as Rs. 48,500 "
            "from 32 bills. Gross Profit MTD shows Rs. 2,10,000 at 18% margin. Low Stock shows 5 "
            "products - he clicks it and sees Urea 46% is below reorder level, so he plans to "
            "purchase more tomorrow.",
        )
    )
    story.append(PageBreak())

    # 4 POS
    story.append(Paragraph("4. POS Billing (Counter Sales)", styles["h1"]))
    story.append(
        Paragraph(
            "POS Billing is the main screen used at the shop counter. This is where you create "
            "sales bills for walk-in farmers, retail buyers, and wholesale dealers.",
            styles["body"],
        )
    )
    story.append(Paragraph("Step-by-step: How to bill a customer", styles["h2"]))
    story.extend(
        steps(
            styles,
            [
                "Go to <b>POS Billing</b> from the sidebar.",
                "Choose <b>Retail</b> or <b>Wholesale</b> at the top. Wholesale uses wholesale rates where set.",
                "Add products by scanning barcode, searching by name, or using Manual Entry.",
                "Adjust quantity using + and - buttons. You can also give line discount (% or Rs).",
                "Select customer (optional for cash walk-in) or enter walk-in name and phone.",
                "Choose payment mode: Cash, UPI, Card, Cheque, or Credit.",
                "Enter operator name (counter person name) if needed.",
                "Apply bill-level discount if required.",
                "Click <b>Complete Retail Sale</b> or <b>Complete Wholesale Sale</b>.",
                "Invoice opens automatically for printing or WhatsApp sharing.",
            ],
        )
    )
    story.append(Paragraph("Retail vs Wholesale", styles["h2"]))
    story.append(
        Paragraph(
            "<b>Retail</b> is for normal counter customers. The software uses the product's sale rate. "
            "<b>Wholesale</b> is for bulk buyers and dealers. It uses the wholesale rate if available, "
            "otherwise the sale rate. Wholesale invoices use a separate number series (WHL).",
            styles["body"],
        )
    )
    story.append(
        example_box(
            styles,
            "Farmer buys fertilizer on cash",
            "A farmer walks in and buys 3 bags of IFFCO DAP and 1 sprayer nozzle. Staff selects "
            "Retail, scans each barcode, confirms quantities, keeps customer as Walk-in, selects "
            "Cash payment, and completes the sale. Stock reduces automatically and a GST invoice "
            "prints with CGST and SGST.",
        )
    )
    story.append(Spacer(1, 0.1 * cm))
    story.append(
        example_box(
            styles,
            "Wholesale dealer buys seeds on credit",
            "Dealer Kumar from Thanjavur buys 20 packets of hybrid paddy seeds on credit. Staff "
            "selects Wholesale, adds products, chooses customer Kumar Agro Traders, selects Credit "
            "payment. The software shows his current outstanding and checks credit limit before "
            "allowing the bill.",
        )
    )
    story.append(Paragraph("Payment modes", styles["h2"]))
    story.extend(
        bullets(
            styles,
            [
                "<b>Cash / UPI / Card / Cheque</b> - bill is treated as fully paid.",
                "<b>Credit</b> - only for registered customers. Amount is added to their outstanding.",
            ],
        )
    )
    story.append(Paragraph("Barcode scanning", styles["h2"]))
    story.append(
        Paragraph(
            "Use a USB barcode scanner (it works like typing) or click the scan icon to use the "
            "camera for QR/barcode. The product is added to the cart when found.",
            styles["body"],
        )
    )
    story.append(
        Paragraph(
            "<b>Note:</b> Every product must have an HSN code before it can be sold. If HSN is "
            "missing, update the product in the Products screen first.",
            styles["body"],
        )
    )
    story.append(PageBreak())

    # 5 Invoices
    story.append(Paragraph("5. Sale Book and Invoices", styles["h1"]))
    story.append(
        Paragraph(
            "The Sale Book lists all sales invoices. Click any invoice to view, print, or share it.",
            styles["body"],
        )
    )
    story.append(Paragraph("Sale Book", styles["h2"]))
    story.extend(
        bullets(
            styles,
            [
                "Shows invoice number, date, customer, payment mode, and amount.",
                "Click <b>New Sale</b> to go directly to POS Billing.",
                "Click <b>View</b> on any row to open the full invoice.",
            ],
        )
    )
    story.append(Paragraph("Invoice details", styles["h2"]))
    story.extend(
        bullets(
            styles,
            [
                "Business name, address, phone, email, and GSTIN at the top.",
                "Invoice number, date, time, bill type (retail/wholesale), operator name.",
                "Customer name, phone, GSTIN (if available), payment mode.",
                "Line items with HSN, quantity, rate, discount, GST%, and amount.",
                "Subtotal, discounts, CGST, SGST, and grand total.",
                "<b>Print Invoice</b> - send to printer.",
                "<b>WhatsApp</b> - share invoice summary with customer.",
            ],
        )
    )
    story.append(
        example_box(
            styles,
            "Reprinting a bill for a customer",
            "A farmer returns in the evening saying he lost his morning bill. Staff opens Sale Book, "
            "searches today's invoices, opens the correct invoice, and clicks Print Invoice to "
            "give him a duplicate copy.",
        )
    )
    story.append(PageBreak())

    # 6 Returns
    story.append(Paragraph("6. Sales Returns (Credit Notes)", styles["h1"]))
    story.append(
        Paragraph(
            "Use Returns when a customer brings back goods or when you return goods to a supplier. "
            "There are two tabs: Credit Notes (sales returns) and Debit Notes (purchase returns).",
            styles["body"],
        )
    )
    story.append(Paragraph("Credit Note - Customer sales return", styles["h2"]))
    story.extend(
        steps(
            styles,
            [
                "Open <b>Sales Return</b> and stay on the Credit Notes tab.",
                "Click <b>New Credit Note</b>.",
                "Select the customer.",
                "Enter a reason (e.g., damaged bag, wrong product).",
                "Search and add returned products with quantity and rate.",
                "Click <b>Save Return</b>.",
            ],
        )
    )
    story.append(
        Paragraph(
            "When you save a credit note: stock increases back, customer outstanding reduces, "
            "and a return number (RET-...) is generated.",
            styles["body"],
        )
    )
    story.append(
        example_box(
            styles,
            "Customer returns expired pesticide",
            "Farmer Selvam returns 1 bottle of herbicide because the seal was broken. Staff creates "
            "a Credit Note for Selvam, adds the product with quantity 1, reason 'Damaged seal'. "
            "Stock of that pesticide increases by 1 and Selvam's outstanding (if any) is reduced.",
        )
    )
    story.append(Paragraph("Debit Note - Purchase return to supplier", styles["h2"]))
    story.extend(
        steps(
            styles,
            [
                "Switch to the <b>Debit Notes</b> tab.",
                "Click <b>New Debit Note</b>.",
                "Select supplier, enter reason, add products.",
                "Save the return.",
            ],
        )
    )
    story.append(
        example_box(
            styles,
            "Returning damaged stock to supplier",
            "5 bags of fertilizer received from Coromandel were found damaged. Staff creates a "
            "Debit Note against Coromandel, adds the 5 bags, and saves. Stock reduces and supplier "
            "payable is adjusted.",
        )
    )
    story.append(PageBreak())

    # 7 Customers
    story.append(Paragraph("7. Customers", styles["h1"]))
    story.append(
        Paragraph(
            "Customers are parties you sell to - farmers, retail buyers, and wholesale dealers. "
            "Registered customers are required for credit billing and outstanding tracking.",
            styles["body"],
        )
    )
    story.append(Paragraph("Adding a new customer", styles["h2"]))
    story.extend(
        steps(
            styles,
            [
                "Go to <b>Customers</b>.",
                "Fill the Add Customer form: Name (required), Phone, GSTIN, Address.",
                "Select type: Retail, Wholesale, or Farmer.",
                "Set Credit Limit if you allow credit (e.g., Rs. 50,000).",
                "Save the customer.",
            ],
        )
    )
    story.append(Paragraph("Customer types", styles["h2"]))
    story.extend(
        bullets(
            styles,
            [
                "<b>Retail</b> - regular shop buyers.",
                "<b>Wholesale</b> - bulk buyers and dealers.",
                "<b>Farmer</b> - agricultural customers (for reporting and classification).",
            ],
        )
    )
    story.append(Paragraph("Customer detail page", styles["h2"]))
    story.append(
        Paragraph(
            "Click any customer name to see their outstanding balance, credit limit, total bills, "
            "and full sales history with links to invoices.",
            styles["body"],
        )
    )
    story.append(
        example_box(
            styles,
            "Setting credit limit for a wholesale buyer",
            "New dealer Sri Agro Store is added as Wholesale customer with credit limit Rs. 1,00,000. "
            "When billing on credit at POS, the software blocks the sale if his outstanding plus "
            "new bill would cross this limit.",
        )
    )
    story.append(PageBreak())

    # 8 Purchases
    story.append(Paragraph("8. Purchase Book and Purchase Entry", styles["h1"]))
    story.append(
        Paragraph(
            "Purchases record stock coming into your shop from suppliers. Every purchase increases "
            "product stock and updates purchase rates.",
            styles["body"],
        )
    )
    story.append(Paragraph("Purchase Book", styles["h2"]))
    story.append(
        Paragraph(
            "Lists past purchases with date, supplier, invoice number, payment type, and amount. "
            "Click <b>New Purchase</b> to record new inward stock.",
            styles["body"],
        )
    )
    story.append(Paragraph("Purchase Entry - step by step", styles["h2"]))
    story.extend(
        steps(
            styles,
            [
                "Go to <b>Purchase Entry</b>.",
                "Select the supplier.",
                "Enter supplier invoice number (optional but recommended).",
                "Choose Payment Type: Credit or Cash (cash is auto-marked paid).",
                "Add products by scan, search, manual entry, or Excel import.",
                "Enter quantity and purchase rate for each line.",
                "Add handling/transport charges if applicable.",
                "For credit purchases, enter amount paid now (if partial payment made).",
                "Click <b>Save Purchase</b>.",
            ],
        )
    )
    story.append(
        example_box(
            styles,
            "Recording pesticide stock inward",
            "UPL supplier delivers 50 bottles of insecticide with invoice UPL/2026/4521. Staff "
            "opens Purchase Entry, selects UPL, enters invoice number, chooses Credit, scans each "
            "product, enters qty 50 and rate, adds Rs. 500 handling charges, and saves. All 50 "
            "bottles are added to stock and supplier payable increases.",
        )
    )
    story.append(Paragraph("Excel import on purchase", styles["h2"]))
    story.append(
        Paragraph(
            "You can import purchase lines from an Excel file (Marg ERP format is supported). "
            "This is useful when you receive a long supplier bill and want to avoid manual entry.",
            styles["body"],
        )
    )
    story.append(PageBreak())

    # 9 Suppliers
    story.append(Paragraph("9. Suppliers", styles["h1"]))
    story.append(
        Paragraph(
            "Suppliers are companies you purchase stock from. Supplier records are created when "
            "you do purchase entry or during initial data setup.",
            styles["body"],
        )
    )
    story.append(Paragraph("Supplier list", styles["h2"]))
    story.extend(
        bullets(
            styles,
            [
                "Shows supplier name and total purchased value.",
                "Click <b>View</b> to see purchase history for that supplier.",
            ],
        )
    )
    story.append(
        example_box(
            styles,
            "Checking how much you bought from a company",
            "The owner wants to know total business done with Coromandel International this year. "
            "He opens Suppliers, finds Coromandel, clicks View, and reviews all purchase bills "
            "with dates and amounts.",
        )
    )
    story.append(PageBreak())

    # 10 Products
    story.append(Paragraph("10. Products", styles["h1"]))
    story.append(
        Paragraph(
            "Products are all items you sell - seeds, fertilizers, pesticides, tools, irrigation "
            "parts, etc. Each product has rates, GST, HSN, and stock quantity.",
            styles["body"],
        )
    )
    story.append(Paragraph("Product list", styles["h2"]))
    story.extend(
        bullets(
            styles,
            [
                "Search products by name or barcode.",
                "Edit sale rate, GST%, and HSN directly in the table (click Edit, then Save).",
                "Products with missing HSN are highlighted - fix before selling.",
                "Low stock items are highlighted.",
                "Use pagination for large product lists.",
            ],
        )
    )
    story.append(Paragraph("Adding a new product", styles["h2"]))
    story.extend(
        steps(
            styles,
            [
                "Click <b>Add Product</b> or go to Products > New.",
                "Enter Name, Barcode (optional), HSN (required), Purchase Rate, Sale Rate.",
                "Enter Wholesale Rate (optional), MRP, GST% (0/5/12/18/28).",
                "Set Opening Stock and Reorder Level (default 10).",
                "Click <b>Create Product</b>.",
            ],
        )
    )
    story.append(
        example_box(
            styles,
            "Adding a new seed variety",
            "A new hybrid tomato seed packet arrives. Staff adds product: Name 'VNR Tomato F1 10g', "
            "HSN 12099100, Purchase Rate Rs. 85, Sale Rate Rs. 120, Wholesale Rate Rs. 110, "
            "GST 5%, Opening Stock 100 packets, Reorder Level 20.",
        )
    )
    story.append(
        Paragraph(
            "<b>Supervisor PIN:</b> If enabled in Settings, editing product rates may ask for a "
            "supervisor PIN for security.",
            styles["body"],
        )
    )
    story.append(PageBreak())

    # 11 Stock
    story.append(Paragraph("11. Stock Management", styles["h1"]))
    story.append(Paragraph("Stock Status", styles["h2"]))
    story.append(
        Paragraph(
            "Shows live inventory for all products: current quantity, reorder level, purchase rate, "
            "and sale rate. Summary cards show total products, total quantity, purchase value, and "
            "sale value.",
            styles["body"],
        )
    )
    story.append(
        example_box(
            styles,
            "Checking stock before a customer order",
            "A customer wants 50 kg Urea. Before promising delivery, staff opens Stock Status, "
            "searches Urea, and sees only 30 kg available. They inform the customer and plan a "
            "purchase order.",
        )
    )
    story.append(Paragraph("Stock Adjustment", styles["h2"]))
    story.append(
        Paragraph(
            "Use when stock count does not match the system - due to damage, theft, counting "
            "error, or free samples. This changes stock without creating a fake sale or purchase.",
            styles["body"],
        )
    )
    story.extend(
        steps(
            styles,
            [
                "Go to Stock Status and click <b>Adjust Stock</b>.",
                "Search and select the product.",
                "Enter Qty Change: positive to add, negative to reduce (e.g., -3).",
                "Enter a clear reason.",
                "Click <b>Apply Adjustment</b>.",
            ],
        )
    )
    story.append(
        example_box(
            styles,
            "Recording damaged stock",
            "During stock check, 2 bags of fertilizer are found torn and unusable. Staff opens "
            "Stock Adjustment, selects the product, enters -2 as quantity change, reason "
            "'Damaged bags found during inspection', and applies.",
        )
    )
    story.append(Paragraph("Stock Import (Excel)", styles["h2"]))
    story.append(
        Paragraph(
            "Bulk add stock when new inventory arrives. Download the template, fill Barcode and "
            "Quantity columns, upload the file, preview, and import.",
            styles["body"],
        )
    )
    story.append(
        example_box(
            styles,
            "Quick stock update after delivery",
            "A delivery van brings 30 different products. Instead of entering 30 purchase lines, "
            "staff uses Stock Import Excel with barcodes and quantities scanned from cartons.",
        )
    )
    story.append(Paragraph("Near Expiry", styles["h2"]))
    story.append(
        Paragraph(
            "Lists products expiring within the next 90 days. Use this to plan discounts or "
            "returns to suppliers before products expire. Products need an expiry date set to "
            "appear here.",
            styles["body"],
        )
    )
    story.append(
        example_box(
            styles,
            "Avoiding expiry losses",
            "Near Expiry shows 8 pesticide bottles expiring in 45 days. The manager creates a "
            "promotion at the counter and also contacts the supplier for possible exchange.",
        )
    )
    story.append(PageBreak())

    # 12 Accounts
    story.append(Paragraph("12. Accounts - Receipts, Payments, Outstanding", styles["h1"]))
    story.append(Paragraph("Receipts (money received from customers)", styles["h2"]))
    story.extend(
        steps(
            styles,
            [
                "Go to <b>Receipts</b>.",
                "Select customer.",
                "Enter amount received.",
                "Choose payment mode: Cash, UPI, Card, or Cheque.",
                "Add reference number and notes if needed.",
                "Click <b>Record Receipt</b>.",
            ],
        )
    )
    story.append(
        Paragraph(
            "Receipts reduce the customer's outstanding balance. They do not create a new sale - "
            "they are payments against old credit bills.",
            styles["body"],
        )
    )
    story.append(
        example_box(
            styles,
            "Customer pays pending amount",
            "Dealer Kumar owes Rs. 25,000 from last week's credit bills. Today he pays Rs. 15,000 "
            "by UPI. Staff records a Receipt for Kumar, amount 15000, mode UPI, reference UPI "
            "txn ID. His outstanding drops to Rs. 10,000.",
        )
    )
    story.append(Paragraph("Payments (money paid to suppliers)", styles["h2"]))
    story.extend(
        steps(
            styles,
            [
                "Go to <b>Payments</b>.",
                "Select supplier.",
                "Enter amount paid.",
                "Choose mode: Cash, UPI, or Cheque.",
                "Add reference and notes.",
                "Click <b>Record Payment</b>.",
            ],
        )
    )
    story.append(
        example_box(
            styles,
            "Paying supplier for credit purchase",
            "Skywin owes Coromandel Rs. 40,000 for last month's fertilizer purchase. The owner "
            "sends a bank transfer and records Payment for Rs. 40,000 with cheque/transfer reference.",
        )
    )
    story.append(Paragraph("Outstanding report", styles["h2"]))
    story.append(
        Paragraph(
            "Shows two sections: <b>Receivables</b> (customers who owe you) and <b>Payables</b> "
            "(suppliers you owe). Use this daily for collection follow-up and payment planning.",
            styles["body"],
        )
    )
    story.append(
        example_box(
            styles,
            "Monthly collection follow-up",
            "On the 1st of every month, the admin opens Outstanding, sorts receivables, and calls "
            "dealers with high pending amounts. Receipts are recorded as payments come in.",
        )
    )
    story.append(PageBreak())

    # 13 Reports
    story.append(Paragraph("13. Reports and Tally Export", styles["h1"]))
    story.append(
        Paragraph(
            "The Reports page gives business analysis for the current month and recent days.",
            styles["body"],
        )
    )
    story.append(Paragraph("Available reports", styles["h2"]))
    story.extend(
        bullets(
            styles,
            [
                "<b>MTD Summary</b> - Revenue, estimated cost, gross profit, margin %.",
                "<b>Daily Summary</b> - last 15 days: bills, sales, purchases, gross profit.",
                "<b>Product-wise Sales</b> - top 20 products by sales.",
                "<b>Party-wise Sales</b> - sales grouped by customer.",
                "<b>Sale Book</b> - recent 30 invoices.",
                "<b>Purchase Book</b> - recent purchases.",
            ],
        )
    )
    story.append(Paragraph("Tally Integration Export", styles["h2"]))
    story.extend(
        steps(
            styles,
            [
                "Click <b>Tally Integration Export</b>.",
                "Select date range (from and to).",
                "Download the Excel file.",
                "Import sheets into Tally or share with your accountant.",
            ],
        )
    )
    story.append(
        Paragraph(
            "Export includes: Sales, Purchase, Credit Notes, Debit Notes, Receipts, and Payments.",
            styles["body"],
        )
    )
    story.append(
        example_box(
            styles,
            "Month-end accounts for CA",
            "At month end, the accountant needs all transactions for March. Admin opens Reports, "
            "exports Tally file from 01-Mar to 31-Mar, and emails the Excel to the CA office.",
        )
    )
    story.append(PageBreak())

    # 14 Settings
    story.append(Paragraph("14. Settings", styles["h1"]))
    story.append(
        Paragraph(
            "<b>Admin only.</b> Settings control how invoices look and default billing behavior.",
            styles["body"],
        )
    )
    story.append(Paragraph("What you can configure", styles["h2"]))
    story.extend(
        bullets(
            styles,
            [
                "Business Name, Tagline, Address, Phone, Email, GSTIN.",
                "Default Operator name (appears on new POS bills).",
                "Invoice Prefix for retail bills (default INV).",
                "Require Supervisor PIN for inventory changes (product edit, stock adjust).",
                "Supervisor PIN - set or change (current PIN required to change).",
            ],
        )
    )
    story.append(
        example_box(
            styles,
            "Updating shop phone number on bills",
            "Skywin gets a new shop landline. Admin opens Settings, updates Phone field, clicks "
            "Save Settings. All new invoices print with the updated number.",
        )
    )
    story.append(PageBreak())

    # 15 Users
    story.append(Paragraph("15. User Management", styles["h1"]))
    story.append(
        Paragraph(
            "<b>Admin only.</b> Control who can log in and what data they can see.",
            styles["body"],
        )
    )
    story.append(Paragraph("Users tab", styles["h2"]))
    story.extend(
        steps(
            styles,
            [
                "Enter staff Name and Phone number.",
                "Select Role: Admin, Regional Manager, Sales Officer, or Dealer.",
                "For Dealer role, link to a Customer Record.",
                "Click <b>Create User Profile</b>.",
            ],
        )
    )
    story.append(
        example_box(
            styles,
            "Adding a new counter employee",
            "A new employee Priya joins the billing counter. Admin adds user Priya with phone "
            "9123456789 and role Sales Officer. Priya can now log in with WhatsApp OTP and bill "
            "customers at POS.",
        )
    )
    story.append(Paragraph("Reporting Lines tab", styles["h2"]))
    story.append(
        Paragraph(
            "Map each Sales Officer to a Regional Manager. This builds the management hierarchy "
            "for data access.",
            styles["body"],
        )
    )
    story.append(Paragraph("Dealer Mappings tab", styles["h2"]))
    story.append(
        Paragraph(
            "Assign dealers (customers) to Sales Officers. A Sales Officer will only see invoices "
            "and outstanding for their mapped dealers.",
            styles["body"],
        )
    )
    story.append(
        example_box(
            styles,
            "Field officer sees only his dealers",
            "Sales Officer Anbu handles 5 village dealers. Admin maps those 5 customer accounts "
            "to Anbu in Dealer Mappings. When Anbu logs in, he sees only those dealers' bills "
            "and outstanding - not the entire shop data.",
        )
    )
    story.append(PageBreak())

    # 16 FAQ
    story.append(Paragraph("16. Quick Tips and Common Questions", styles["h1"]))
    story.append(Paragraph("Quick tips for faster billing", styles["h2"]))
    story.extend(
        bullets(
            styles,
            [
                "Keep barcode labels on all products for fast POS scanning.",
                "Set reorder levels on fast-moving items to get low stock alerts early.",
                "Always select the correct Retail/Wholesale mode before adding items.",
                "Record receipts the same day customers pay - keeps outstanding accurate.",
                "Do purchase entry the same day goods arrive - keeps stock accurate.",
            ],
        )
    )
    story.append(Paragraph("Common questions", styles["h2"]))
    faq = [
        ("I cannot log in. What should I do?", "Check that your phone number is registered in User Management. Ensure you have internet for WhatsApp OTP. Contact Admin."),
        ("Product cannot be added to cart.", "The product may be out of stock or missing HSN code. Check Products screen and update HSN."),
        ("Credit sale is blocked.", "Customer may have crossed credit limit or is not a registered customer. Check customer outstanding and credit limit."),
        ("Stock is wrong.", "Use Stock Adjustment with a reason. Also verify all purchases and sales were entered correctly."),
        ("Invoice GST looks wrong.", "Check product GST% and HSN. Discounts affect taxable value and GST calculation."),
        ("Dealer cannot see purchases.", "This is by design. Dealer role has limited access to invoices and outstanding only."),
    ]
    for q, a in faq:
        story.append(Paragraph(f"<b>Q: {q}</b>", styles["body"]))
        story.append(Paragraph(f"A: {a}", styles["body"]))
        story.append(Spacer(1, 0.1 * cm))

    story.append(Spacer(1, 0.4 * cm))
    story.append(
        Paragraph(
            "<b>End of Manual</b><br/>For technical support or training, contact your software "
            "administrator.",
            styles["body"],
        )
    )

    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = build_styles()

    doc = BaseDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2.2 * cm,
        title="Skywin Bill User Manual",
        author="Skywin BIOTECH",
    )

    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    cover_frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="cover")

    doc.addPageTemplates(
        [
            PageTemplate(id="Cover", frames=[cover_frame], onPage=on_cover),
            PageTemplate(id="Content", frames=[frame], onPage=on_page),
        ]
    )

    story = build_story(styles)
    story.insert(0, NextPageTemplate("Content"))
    doc.build(story)
    print(f"Generated: {OUTPUT}")
    print(f"Size: {OUTPUT.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
