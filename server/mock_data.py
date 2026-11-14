from models import ExtractedItem, ParsedReceipt

# Every preset satisfies: sum(items) == subtotal and
# subtotal + tax + service_charge + tip - discount == grand_total (verified in test_split_engine.py).
MOCK_RECEIPTS = {
    "cafe": ParsedReceipt(
        merchant="Blue Tokai Coffee Roasters",
        date="2026-11-14",
        currency="₹",
        items=[
            ExtractedItem(id="item_1", name="Iced Americano", price=220.0, quantity=1),
            ExtractedItem(id="item_2", name="Sea Salt Mocha", price=280.0, quantity=1),
            ExtractedItem(id="item_3", name="Avocado Toast", price=360.0, quantity=1),
            ExtractedItem(id="item_4", name="Almond Croissant", price=190.0, quantity=1),
        ],
        subtotal=1050.0,
        tax=52.50,
        service_charge=105.00,
        tip=50.00,
        discount=100.00,
        grand_total=1157.50,
    ),
    "dinner": ParsedReceipt(
        merchant="Trattoria Bella Napoli",
        date="2026-11-14",
        currency="$",
        items=[
            ExtractedItem(id="item_1", name="Burrata Caprese", price=18.00, quantity=1),
            ExtractedItem(id="item_2", name="Woodfired Tartufo Pizza", price=26.50, quantity=1),
            ExtractedItem(id="item_3", name="Pappardelle Bolognese", price=24.00, quantity=1),
            ExtractedItem(id="item_4", name="House Red Wine (Bottle)", price=42.00, quantity=1),
            ExtractedItem(id="item_5", name="Tiramisu", price=11.00, quantity=1),
        ],
        subtotal=121.50,
        tax=10.94,
        service_charge=12.15,
        tip=20.00,
        discount=0.00,
        grand_total=164.59,
    ),
    "grocery": ParsedReceipt(
        merchant="Whole Foods Market",
        date="2026-11-14",
        currency="$",
        items=[
            ExtractedItem(id="item_1", name="Organic Eggs 12pk", price=5.49, quantity=1),
            ExtractedItem(id="item_2", name="Almond Milk 64oz", price=4.29, quantity=1),
            ExtractedItem(id="item_3", name="Sourdough Loaf", price=6.00, quantity=1),
            ExtractedItem(id="item_4", name="Fair-Trade Coffee Beans", price=14.99, quantity=1),
            ExtractedItem(id="item_5", name="Greek Yogurt 32oz", price=5.99, quantity=1),
        ],
        subtotal=36.76,
        tax=2.94,
        service_charge=0.00,
        tip=0.00,
        discount=5.00,
        grand_total=34.70,
    ),
}
