"""Seed comprehensive demo products, images, stock, and vertical settings for a specific POS account (tenant).

Safe and isolated: ONLY modifies the specified company.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from app.cache import invalidate_company_config
from app.database import engine
from app.models.config_engine import IndustryPack
from app.models.core import Company, Store, UserAccount
from app.models.industry import JewelryCertificate, JewelryGoldRate, JewelryProductProfile
from app.models.inventory import StockBalance
from app.models.product import Product, Unit

# All 19 POS shop verticals
ALL_INDUSTRY_PACKS = [
    "beef-shop",
    "fashion",
    "pharmacy",
    "grocery",
    "restaurant",
    "jewelry",
    "electronics",
    "bookstore",
    "salon",
    "hardware",
    "stationery",
    "cosmetics",
    "building-materials",
    "mobile-shop",
    "tailoring",
    "rice-mill",
    "furniture",
    "optical-shop",
    "surgical-shop",
    "super-shop",
]

# Comprehensive product catalog for all 19 verticals with real Unsplash images
SPECIFIC_ACCOUNT_CATALOG = [
    # ── 1. Beef Shop ──────────────────────────────────────────────────────────
    {
        "sku": "BEEF-001",
        "barcode": "BEEF-001",
        "name": "Premium Beef Shoulder",
        "pack": "beef-shop",
        "price": 850.0,
        "wholesale": 800.0,
        "image": "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=500&auto=format&fit=crop&q=80",
        "meta": {"cut_type": "Shoulder", "storage": "Cold Storage A", "halal_certified": True, "rate_per_kg": 850, "unit": "kg"},
    },
    {
        "sku": "BEEF-002",
        "barcode": "BEEF-002",
        "name": "Beef Boneless Cubes",
        "pack": "beef-shop",
        "price": 920.0,
        "wholesale": 880.0,
        "image": "https://images.unsplash.com/photo-1558030006-450675393462?w=500&auto=format&fit=crop&q=80",
        "meta": {"cut_type": "Boneless", "storage": "Cold Storage A", "halal_certified": True, "rate_per_kg": 920, "unit": "kg"},
    },
    {
        "sku": "BEEF-003",
        "barcode": "BEEF-003",
        "name": "Fresh Mutton Leg Cut",
        "pack": "beef-shop",
        "price": 1150.0,
        "wholesale": 1100.0,
        "image": "https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80",
        "meta": {"cut_type": "Leg", "storage": "Cold Storage B", "halal_certified": True, "rate_per_kg": 1150, "unit": "kg"},
    },
    {
        "sku": "BEEF-004",
        "barcode": "BEEF-004",
        "name": "Broiler Chicken · Whole Cut",
        "pack": "beef-shop",
        "price": 240.0,
        "wholesale": 220.0,
        "image": "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=500&auto=format&fit=crop&q=80",
        "meta": {"cut_type": "Whole", "storage": "Chilled", "halal_certified": True, "rate_per_kg": 240, "unit": "kg"},
    },

    # ── 2. Fashion ────────────────────────────────────────────────────────────
    {
        "sku": "FASH-001",
        "barcode": "FASH-001",
        "name": "Cotton Polo Shirt · Navy Blue",
        "pack": "fashion",
        "price": 1290.0,
        "wholesale": 950.0,
        "image": "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500&auto=format&fit=crop&q=80",
        "meta": {"category": "Menswear", "color": "Navy", "size": "L", "fabric": "100% Pique Cotton", "brand": "Club Formal"},
    },
    {
        "sku": "FASH-002",
        "barcode": "FASH-002",
        "name": "Slim Fit Stretch Chino · Khaki",
        "pack": "fashion",
        "price": 1890.0,
        "wholesale": 1400.0,
        "image": "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=500&auto=format&fit=crop&q=80",
        "meta": {"category": "Pants", "color": "Khaki", "size": "32", "fabric": "Cotton Twill Stretch", "brand": "Urban Fit"},
    },
    {
        "sku": "FASH-003",
        "barcode": "FASH-003",
        "name": "Oversized Fleece Hoodie · Charcoal",
        "pack": "fashion",
        "price": 2490.0,
        "wholesale": 1850.0,
        "image": "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=500&auto=format&fit=crop&q=80",
        "meta": {"category": "Winterwear", "color": "Charcoal", "size": "XL", "fabric": "Brushed Fleece", "brand": "StreetVibe"},
    },
    {
        "sku": "FASH-004",
        "barcode": "FASH-004",
        "name": "Linen Casual Long Sleeve Shirt · White",
        "pack": "fashion",
        "price": 1750.0,
        "wholesale": 1300.0,
        "image": "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&auto=format&fit=crop&q=80",
        "meta": {"category": "Shirts", "color": "White", "size": "M", "fabric": "Pure Linen", "brand": "Breeze"},
    },
    {
        "sku": "FASH-005",
        "barcode": "FASH-005",
        "name": "Vintage Denim Trucker Jacket",
        "pack": "fashion",
        "price": 3490.0,
        "wholesale": 2700.0,
        "image": "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=500&auto=format&fit=crop&q=80",
        "meta": {"category": "Jackets", "color": "Indigo", "size": "L", "fabric": "Denim", "brand": "RoughRider"},
    },

    # ── 3. Pharmacy ───────────────────────────────────────────────────────────
    {
        "sku": "PHRM-001",
        "barcode": "PHRM-001",
        "name": "Paracetamol 500mg (Box of 100)",
        "pack": "pharmacy",
        "price": 120.0,
        "wholesale": 105.0,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80",
        "meta": {"generic": "Paracetamol", "manufacturer": "Square Pharma", "dosage_form": "Tablet", "strength": "500mg", "batch": "SQ-2026-08"},
    },
    {
        "sku": "PHRM-002",
        "barcode": "PHRM-002",
        "name": "Amoxicillin Trihydrate 250mg Suspension",
        "pack": "pharmacy",
        "price": 75.0,
        "wholesale": 65.0,
        "image": "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=500&auto=format&fit=crop&q=80",
        "meta": {"generic": "Amoxicillin", "manufacturer": "Beximco Pharma", "dosage_form": "Suspension", "strength": "250mg/5ml", "batch": "BX-2026-11"},
    },
    {
        "sku": "PHRM-003",
        "barcode": "PHRM-003",
        "name": "Omeprazole 20mg Capsules (Strip 10)",
        "pack": "pharmacy",
        "price": 60.0,
        "wholesale": 52.0,
        "image": "https://images.unsplash.com/photo-1585435557343-3b092031a831?w=500&auto=format&fit=crop&q=80",
        "meta": {"generic": "Omeprazole", "manufacturer": "Incepta Pharma", "dosage_form": "Capsule", "strength": "20mg", "batch": "IN-2026-04"},
    },
    {
        "sku": "PHRM-004",
        "barcode": "PHRM-004",
        "name": "Vitamin C 500mg Chewable (Strip 10)",
        "pack": "pharmacy",
        "price": 40.0,
        "wholesale": 34.0,
        "image": "https://images.unsplash.com/photo-1550572017-ed200f5e6343?w=500&auto=format&fit=crop&q=80",
        "meta": {"generic": "Ascorbic Acid", "manufacturer": "Renata Ltd", "dosage_form": "Chewable Tablet", "strength": "500mg", "batch": "RN-2026-02"},
    },

    # ── 4. Grocery ────────────────────────────────────────────────────────────
    {
        "sku": "GROC-001",
        "barcode": "GROC-001",
        "name": "Premium Basmati Rice · 5kg Bag",
        "pack": "grocery",
        "price": 650.0,
        "wholesale": 580.0,
        "image": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=80",
        "meta": {"category": "Grains & Rice", "unit": "bag", "brand": "Royal Harvest", "weight": "5kg"},
    },
    {
        "sku": "GROC-002",
        "barcode": "GROC-002",
        "name": "Pure Refined Sunflower Oil · 5L Can",
        "pack": "grocery",
        "price": 890.0,
        "wholesale": 830.0,
        "image": "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=80",
        "meta": {"category": "Edible Oil", "unit": "can", "brand": "SunPure", "volume": "5L"},
    },
    {
        "sku": "GROC-003",
        "barcode": "GROC-003",
        "name": "Pasteurized Full Cream Milk · 1 Litre",
        "pack": "grocery",
        "price": 95.0,
        "wholesale": 88.0,
        "image": "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&auto=format&fit=crop&q=80",
        "meta": {"category": "Dairy", "unit": "packet", "brand": "DairyFresh", "volume": "1L"},
    },
    {
        "sku": "GROC-004",
        "barcode": "GROC-004",
        "name": "Premium Ceylon Black Tea · 500g",
        "pack": "grocery",
        "price": 380.0,
        "wholesale": 340.0,
        "image": "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=500&auto=format&fit=crop&q=80",
        "meta": {"category": "Beverages", "unit": "box", "brand": "Highland Tea", "weight": "500g"},
    },
    {
        "sku": "GROC-005",
        "barcode": "GROC-005",
        "name": "Whole Wheat Atta (Flour) · 2kg",
        "pack": "grocery",
        "price": 130.0,
        "wholesale": 118.0,
        "image": "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80",
        "meta": {"category": "Flour & Atta", "unit": "bag", "brand": "Fresh Mills", "weight": "2kg"},
    },

    # ── 5. Restaurant ─────────────────────────────────────────────────────────
    {
        "sku": "REST-001",
        "barcode": "REST-001",
        "name": "Chicken Dum Biryani Feast",
        "pack": "restaurant",
        "price": 350.0,
        "wholesale": 300.0,
        "image": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=80",
        "meta": {"kitchen_station": "Main Kitchen", "category": "Biryani", "portion": "Single Platter"},
    },
    {
        "sku": "REST-002",
        "barcode": "REST-002",
        "name": "Special Mutton Kacchi Biryani with Borhani",
        "pack": "restaurant",
        "price": 520.0,
        "wholesale": 450.0,
        "image": "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=500&auto=format&fit=crop&q=80",
        "meta": {"kitchen_station": "Main Kitchen", "category": "Biryani", "portion": "Full Meal"},
    },
    {
        "sku": "REST-003",
        "barcode": "REST-003",
        "name": "Flame-Grilled Quarter Chicken & Butter Naan",
        "pack": "restaurant",
        "price": 290.0,
        "wholesale": 240.0,
        "image": "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=500&auto=format&fit=crop&q=80",
        "meta": {"kitchen_station": "Grill Station", "category": "Grill & Naan", "portion": "Combo"},
    },
    {
        "sku": "REST-004",
        "barcode": "REST-004",
        "name": "Crispy Buffalo Wings (8 Pcs)",
        "pack": "restaurant",
        "price": 320.0,
        "wholesale": 260.0,
        "image": "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500&auto=format&fit=crop&q=80",
        "meta": {"kitchen_station": "Fryer", "category": "Appetizers", "portion": "8 Pcs"},
    },
    {
        "sku": "REST-005",
        "barcode": "REST-005",
        "name": "Classic Mango Lassi · Chilled",
        "pack": "restaurant",
        "price": 140.0,
        "wholesale": 110.0,
        "image": "https://images.unsplash.com/photo-1546173159-315724a31696?w=500&auto=format&fit=crop&q=80",
        "meta": {"kitchen_station": "Beverage Bar", "category": "Drinks", "portion": "350ml"},
    },

    # ── 6. Jewelry ────────────────────────────────────────────────────────────
    {
        "sku": "JW-001",
        "barcode": "JW-001",
        "name": "22K Solid Gold Royal Chain",
        "pack": "jewelry",
        "price": 115000.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&auto=format&fit=crop&q=80",
        "meta": {"metal": "Gold", "karat": 22, "grossWeight": 12.4, "netWeight": 11.8, "stoneWeight": 0.6, "makingChargePerGram": 850, "cert": "CERT-JW-001"},
    },
    {
        "sku": "JW-002",
        "barcode": "JW-002",
        "name": "Diamond Solitaire Ring · 18K White Gold",
        "pack": "jewelry",
        "price": 48000.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&auto=format&fit=crop&q=80",
        "meta": {"metal": "Gold", "karat": 18, "grossWeight": 5.2, "netWeight": 4.6, "stoneWeight": 0.6, "makingChargePerGram": 1200, "cert": "CERT-JW-002"},
    },
    {
        "sku": "JW-003",
        "barcode": "JW-003",
        "name": "Sterling Silver Bangle Pair · 925",
        "pack": "jewelry",
        "price": 3500.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1611591475155-4284ec28d351?w=500&auto=format&fit=crop&q=80",
        "meta": {"metal": "Silver", "karat": 925, "grossWeight": 28.0, "netWeight": 27.5, "stoneWeight": 0.5, "makingChargePerGram": 120, "cert": "CERT-JW-003"},
    },
    {
        "sku": "JW-004",
        "barcode": "JW-004",
        "name": "22K Bridal Heritage Har Necklace",
        "pack": "jewelry",
        "price": 380000.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&auto=format&fit=crop&q=80",
        "meta": {"metal": "Gold", "karat": 22, "grossWeight": 42.5, "netWeight": 39.0, "stoneWeight": 3.5, "makingChargePerGram": 950, "cert": "CERT-JW-004"},
    },
    {
        "sku": "JW-005",
        "barcode": "JW-005",
        "name": "22K Traditional Kulla Bangle Set (4 Pcs)",
        "pack": "jewelry",
        "price": 290000.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=500&auto=format&fit=crop&q=80",
        "meta": {"metal": "Gold", "karat": 22, "grossWeight": 36.0, "netWeight": 36.0, "stoneWeight": 0.0, "makingChargePerGram": 800, "cert": "CERT-JW-005"},
    },
    {
        "sku": "JW-006",
        "barcode": "JW-006",
        "name": "Platinum Solitaire Engagement Ring · 950",
        "pack": "jewelry",
        "price": 75000.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1603561591411-07134e71a2a9?w=500&auto=format&fit=crop&q=80",
        "meta": {"metal": "Platinum", "karat": 950, "grossWeight": 6.8, "netWeight": 6.1, "stoneWeight": 0.7, "makingChargePerGram": 1800, "cert": "CERT-JW-006"},
    },
    {
        "sku": "JW-007",
        "barcode": "JW-007",
        "name": "21K Classic Gold Earring Tops",
        "pack": "jewelry",
        "price": 36000.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=500&auto=format&fit=crop&q=80",
        "meta": {"metal": "Gold", "karat": 21, "grossWeight": 4.5, "netWeight": 4.2, "stoneWeight": 0.3, "makingChargePerGram": 750, "cert": "CERT-JW-007"},
    },
    {
        "sku": "JW-008",
        "barcode": "JW-008",
        "name": "22K Stamped Gold Coin (5 Gram)",
        "pack": "jewelry",
        "price": 49250.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=500&auto=format&fit=crop&q=80",
        "meta": {"metal": "Gold", "karat": 22, "grossWeight": 5.0, "netWeight": 5.0, "stoneWeight": 0.0, "makingChargePerGram": 300, "cert": "CERT-JW-008"},
    },

    # ── 7. Electronics ────────────────────────────────────────────────────────
    {
        "sku": "EL-001",
        "barcode": "EL-001",
        "name": "Samsung Galaxy S24 Ultra · 12/256GB",
        "pack": "electronics",
        "price": 142990.0,
        "wholesale": 135000.0,
        "image": "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Samsung", "model": "Galaxy S24 Ultra", "warrantyMonths": 12, "hasSerial": True, "serial_imei_required": True},
    },
    {
        "sku": "EL-002",
        "barcode": "EL-002",
        "name": "Apple iPhone 15 Pro 128GB · Natural Titanium",
        "pack": "electronics",
        "price": 139900.0,
        "wholesale": 132000.0,
        "image": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Apple", "model": "iPhone 15 Pro", "warrantyMonths": 12, "hasSerial": True, "serial_imei_required": True},
    },
    {
        "sku": "EL-003",
        "barcode": "EL-003",
        "name": "Sony WH-1000XM5 Wireless Noise-Cancelling Headphones",
        "pack": "electronics",
        "price": 36500.0,
        "wholesale": 32000.0,
        "image": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Sony", "model": "WH-1000XM5", "warrantyMonths": 12, "hasSerial": False},
    },
    {
        "sku": "EL-004",
        "barcode": "EL-004",
        "name": "Apple MacBook Air M3 15-inch (16GB / 512GB)",
        "pack": "electronics",
        "price": 178000.0,
        "wholesale": 168000.0,
        "image": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Apple", "model": "MacBook Air M3", "warrantyMonths": 12, "hasSerial": True, "serial_imei_required": True},
    },
    {
        "sku": "EL-005",
        "barcode": "EL-005",
        "name": "LG C3 55-inch OLED 4K Smart Cinema TV",
        "pack": "electronics",
        "price": 149000.0,
        "wholesale": 138000.0,
        "image": "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "LG", "model": "OLED55C3", "warrantyMonths": 24, "hasSerial": True},
    },
    {
        "sku": "EL-006",
        "barcode": "EL-006",
        "name": "Gree 1.5 Ton Dual Inverter Air Conditioner",
        "pack": "electronics",
        "price": 64500.0,
        "wholesale": 59000.0,
        "image": "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Gree", "model": "GS-18XPUV32", "warrantyMonths": 36, "hasSerial": True},
    },

    # ── 8. Bookstore ──────────────────────────────────────────────────────────
    {
        "sku": "BK-PHY10",
        "barcode": "BK-PHY10",
        "name": "Physics for Secondary School · Class 10",
        "pack": "bookstore",
        "price": 280.0,
        "wholesale": 240.0,
        "image": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80",
        "meta": {"author": "NCTB Board", "publisher": "National Curriculum", "class_level": "Class 10", "isbn": "978-984-0101-22-1"},
    },
    {
        "sku": "BK-MATH12",
        "barcode": "BK-MATH12",
        "name": "Higher Mathematics 1st Paper · Class 11-12",
        "pack": "bookstore",
        "price": 320.0,
        "wholesale": 270.0,
        "image": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80",
        "meta": {"author": "Prof. S. U. Ahmed", "publisher": "Aksharpatra", "class_level": "HSC", "isbn": "978-984-0202-33-4"},
    },
    {
        "sku": "BK-NOVEL",
        "barcode": "BK-NOVEL",
        "name": "Contemporary Bestseller Bengali Novel",
        "pack": "bookstore",
        "price": 450.0,
        "wholesale": 360.0,
        "image": "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=500&auto=format&fit=crop&q=80",
        "meta": {"author": "Humayun Ahmed", "publisher": "Ananya Publications", "genre": "Fiction", "isbn": "978-984-0303-44-5"},
    },

    # ── 9. Salon & Spa ────────────────────────────────────────────────────────
    {
        "sku": "SALON-HC",
        "barcode": "SALON-HC",
        "name": "Gentlemen's Classic Haircut & Styling",
        "pack": "salon",
        "price": 350.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=500&auto=format&fit=crop&q=80",
        "meta": {"service_type": "Hair Service", "duration_minutes": 30, "gender": "Male", "item_type": "service"},
    },
    {
        "sku": "SALON-FC",
        "barcode": "SALON-FC",
        "name": "Organic Herbal Glow Facial (45 Mins)",
        "pack": "salon",
        "price": 850.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=500&auto=format&fit=crop&q=80",
        "meta": {"service_type": "Skin Care", "duration_minutes": 45, "gender": "Unisex", "item_type": "service"},
    },
    {
        "sku": "SALON-SH",
        "barcode": "SALON-SH",
        "name": "Salon Professional Moroccan Argan Shampoo 250ml",
        "pack": "salon",
        "price": 650.0,
        "wholesale": 480.0,
        "image": "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=500&auto=format&fit=crop&q=80",
        "meta": {"service_type": "Retail Product", "item_type": "retail", "brand": "L'Oreal Pro"},
    },

    # ── 10. Hardware ──────────────────────────────────────────────────────────
    {
        "sku": "HW-SCREW",
        "barcode": "HW-SCREW",
        "name": "Galvanized Steel Screws · 1.5 Inch (Box 100)",
        "pack": "hardware",
        "price": 250.0,
        "wholesale": 200.0,
        "image": "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "BuildPro", "unit": "box", "warranty_months": 0},
    },
    {
        "sku": "HW-CABLE",
        "barcode": "HW-CABLE",
        "name": "BRB 2.5mm Single Core Copper Cable (Coil 100m)",
        "pack": "hardware",
        "price": 4200.0,
        "wholesale": 3850.0,
        "image": "https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "BRB Cables", "unit": "coil", "warranty_months": 60},
    },
    {
        "sku": "HW-PAINT",
        "barcode": "HW-PAINT",
        "name": "Berger Luxury Silk Synthetic Enamel Paint 1 Gallon",
        "pack": "hardware",
        "price": 1450.0,
        "wholesale": 1280.0,
        "image": "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Berger Paints", "unit": "gallon", "color": "Snow White"},
    },

    # ── 11. Stationery ────────────────────────────────────────────────────────
    {
        "sku": "ST-PEN",
        "barcode": "ST-PEN",
        "name": "Matador Hi-School Ballpoint Pens (Box of 20)",
        "pack": "stationery",
        "price": 160.0,
        "wholesale": 135.0,
        "image": "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Matador", "unit": "box", "color": "Blue"},
    },
    {
        "sku": "ST-KHATA",
        "barcode": "ST-KHATA",
        "name": "Ruled Exercise Notebook 120 Pages",
        "pack": "stationery",
        "price": 55.0,
        "wholesale": 44.0,
        "image": "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Fresh Paper", "unit": "piece", "pages": 120},
    },
    {
        "sku": "ST-A4",
        "barcode": "ST-A4",
        "name": "Double A 80GSM White A4 Paper Ream (500 Sheets)",
        "pack": "stationery",
        "price": 460.0,
        "wholesale": 415.0,
        "image": "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Double A", "unit": "ream", "gsm": 80},
    },

    # ── 12. Cosmetics ─────────────────────────────────────────────────────────
    {
        "sku": "COS-LIP",
        "barcode": "COS-LIP",
        "name": "Lakme 9to5 Velvet Matte Liquid Lipstick",
        "pack": "cosmetics",
        "price": 850.0,
        "wholesale": 720.0,
        "image": "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Lakme", "shade": "Red Velvet", "batch": "LK-2026-09"},
    },
    {
        "sku": "COS-FOUND",
        "barcode": "COS-FOUND",
        "name": "Maybelline Fit Me Matte+Poreless Foundation SPF 22",
        "pack": "cosmetics",
        "price": 1250.0,
        "wholesale": 1050.0,
        "image": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Maybelline", "shade": "Natural Beige 220", "volume": "30ml"},
    },
    {
        "sku": "COS-CREAM",
        "barcode": "COS-CREAM",
        "name": "Pond's Age Miracle Youth Glow Day Cream 50g",
        "pack": "cosmetics",
        "price": 750.0,
        "wholesale": 640.0,
        "image": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Pond's", "weight": "50g", "expiry": "2027-12-31"},
    },

    # ── 13. Building Materials ────────────────────────────────────────────────
    {
        "sku": "BM-CEMENT",
        "barcode": "BM-CEMENT",
        "name": "Shah Cement Special Portland Composite 50kg Bag",
        "pack": "building-materials",
        "price": 530.0,
        "wholesale": 505.0,
        "image": "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Shah Cement", "unit": "bag", "weight_kg": 50, "delivery_available": True},
    },
    {
        "sku": "BM-ROD",
        "barcode": "BM-ROD",
        "name": "BSRM 500W TMT High-Yield Deformed Steel Rod 12mm (Ton)",
        "pack": "building-materials",
        "price": 94000.0,
        "wholesale": 91500.0,
        "image": "https://images.unsplash.com/photo-1535813547-99c456a41d4a?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "BSRM", "unit": "ton", "diameter_mm": 12, "grade": "500W"},
    },
    {
        "sku": "BM-SAND",
        "barcode": "BM-SAND",
        "name": "Sylhet River Sand · Coarse Concrete Grade (per CFT)",
        "pack": "building-materials",
        "price": 65.0,
        "wholesale": 58.0,
        "image": "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=500&auto=format&fit=crop&q=80",
        "meta": {"origin": "Sylhet", "unit": "CFT", "fm_rating": "2.5 FM"},
    },

    # ── 14. Mobile Shop ───────────────────────────────────────────────────────
    {
        "sku": "MOB-001",
        "barcode": "MOB-001",
        "name": "Samsung Galaxy A15 8GB / 256GB Smartphone",
        "pack": "mobile-shop",
        "price": 24990.0,
        "wholesale": 23500.0,
        "image": "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Samsung", "imei_required": True, "warranty_months": 12, "storage": "256GB"},
    },
    {
        "sku": "MOB-ACC-001",
        "barcode": "MOB-ACC-001",
        "name": "Anker 25W Type-C Super Fast Power Delivery Wall Charger",
        "pack": "mobile-shop",
        "price": 1250.0,
        "wholesale": 950.0,
        "image": "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Anker", "wattage": "25W", "warranty_months": 18, "is_accessory": True},
    },
    {
        "sku": "MOB-ACC-002",
        "barcode": "MOB-ACC-002",
        "name": "Baseus 20000mAh 22.5W Fast Charging Power Bank",
        "pack": "mobile-shop",
        "price": 2800.0,
        "wholesale": 2300.0,
        "image": "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Baseus", "capacity": "20000mAh", "is_accessory": True},
    },

    # ── 15. Tailoring ─────────────────────────────────────────────────────────
    {
        "sku": "TAILOR-001",
        "barcode": "TAILOR-001",
        "name": "Executive 2-Piece Safari Suit Custom Tailoring",
        "pack": "tailoring",
        "price": 4500.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=80",
        "meta": {"garment_type": "Safari Suit", "lead_time_days": 5, "fittings_included": 2},
    },
    {
        "sku": "TAILOR-002",
        "barcode": "TAILOR-002",
        "name": "Custom Fit Formal Dress Shirt Stitching",
        "pack": "tailoring",
        "price": 650.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=500&auto=format&fit=crop&q=80",
        "meta": {"garment_type": "Formal Shirt", "lead_time_days": 3, "collar_options": "Cutaway, Regular"},
    },
    {
        "sku": "TAILOR-003",
        "barcode": "TAILOR-003",
        "name": "Festive Embroidered Panjabi Bespoke Stitching",
        "pack": "tailoring",
        "price": 1200.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=500&auto=format&fit=crop&q=80",
        "meta": {"garment_type": "Panjabi", "lead_time_days": 4},
    },
    {
        "sku": "TAILOR-004",
        "barcode": "TAILOR-004",
        "name": "Trouser Hemming & Waist Alteration Service",
        "pack": "tailoring",
        "price": 150.0,
        "wholesale": None,
        "image": "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=500&auto=format&fit=crop&q=80",
        "meta": {"service_type": "Alteration", "turnaround_hours": 24},
    },

    # ── 16. Rice Mill ─────────────────────────────────────────────────────────
    {
        "sku": "RICE-MINIKET",
        "barcode": "RICE-MINIKET",
        "name": "Miniket Premium Auto-Milled Rice · 50kg Sack",
        "pack": "rice-mill",
        "price": 3850.0,
        "wholesale": 3650.0,
        "image": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=80",
        "meta": {"variety": "Miniket", "bag_weight_kg": 50, "moisture": "12%", "polish": "Double Polish"},
    },
    {
        "sku": "RICE-NAJIRSHAIL",
        "barcode": "RICE-NAJIRSHAIL",
        "name": "Najirshail Super Fine Rice · 50kg Sack",
        "pack": "rice-mill",
        "price": 4200.0,
        "wholesale": 4000.0,
        "image": "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=500&auto=format&fit=crop&q=80",
        "meta": {"variety": "Najirshail", "bag_weight_kg": 50, "moisture": "11.5%"},
    },
    {
        "sku": "RICE-CHINIGURA",
        "barcode": "RICE-CHINIGURA",
        "name": "Chinigura Aromatic Polao Rice · 25kg Sack",
        "pack": "rice-mill",
        "price": 3250.0,
        "wholesale": 3050.0,
        "image": "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&auto=format&fit=crop&q=80",
        "meta": {"variety": "Chinigura", "bag_weight_kg": 25, "aroma": "High"},
    },

    # ── 17. Furniture ─────────────────────────────────────────────────────────
    {
        "sku": "FURN-001",
        "barcode": "FURN-001",
        "name": "Solid Chittagong Teak 6-Seater Dining Table Set",
        "pack": "furniture",
        "price": 68000.0,
        "wholesale": 62000.0,
        "image": "https://images.unsplash.com/photo-1617806118233-18e1de247200?w=500&auto=format&fit=crop&q=80",
        "meta": {"wood": "Chittagong Teak", "seating": 6, "finish": "Natural Teak Polish", "assembly": "Included"},
    },
    {
        "sku": "FURN-002",
        "barcode": "FURN-002",
        "name": "High-Back Ergonomic Executive Office Swivel Chair",
        "pack": "furniture",
        "price": 14500.0,
        "wholesale": 12500.0,
        "image": "https://images.unsplash.com/photo-1580481077195-77983196eb38?w=500&auto=format&fit=crop&q=80",
        "meta": {"material": "Mesh & Nylon", "lumbar_support": True, "warranty_months": 24},
    },
    {
        "sku": "FURN-003",
        "barcode": "FURN-003",
        "name": "Scandinavian 3-Seater Fabric Sofa · Slate Grey",
        "pack": "furniture",
        "price": 36000.0,
        "wholesale": 31500.0,
        "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&auto=format&fit=crop&q=80",
        "meta": {"material": "Linen Fabric & Solid Pine Frame", "color": "Slate Grey", "seats": 3},
    },

    # ── 18. Optical Shop ──────────────────────────────────────────────────────
    {
        "sku": "OP-001",
        "barcode": "OP-001",
        "name": "Matte Black Ultralight Titanium Eyeglass Frame",
        "pack": "optical-shop",
        "price": 2800.0,
        "wholesale": 2100.0,
        "image": "https://images.unsplash.com/photo-1591076482161-42ce6da69f67?w=500&auto=format&fit=crop&q=80",
        "meta": {"frame_type": "Full-Rim", "material": "Titanium", "size": "52-18-140"},
    },
    {
        "sku": "OP-002",
        "barcode": "OP-002",
        "name": "1.61 High-Index Blue-Cut Anti-Glare Optical Lens (Pair)",
        "pack": "optical-shop",
        "price": 1600.0,
        "wholesale": 1150.0,
        "image": "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=500&auto=format&fit=crop&q=80",
        "meta": {"lens_type": "Single Vision", "coating": "Blue-Block HMC", "index": 1.61},
    },
    {
        "sku": "OP-003",
        "barcode": "OP-003",
        "name": "Polarized Aviator Sunglasses · UV400 Protection",
        "pack": "optical-shop",
        "price": 3200.0,
        "wholesale": 2400.0,
        "image": "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500&auto=format&fit=crop&q=80",
        "meta": {"lens": "Polarized Glass", "frame": "Gold Alloy", "uv": "UV400"},
    },

    # ── 19. Surgical Shop ─────────────────────────────────────────────────────
    {
        "sku": "SG-001",
        "barcode": "SG-001",
        "name": "Sterile Powder-Free Latex Surgical Gloves (Box 100)",
        "pack": "surgical-shop",
        "price": 380.0,
        "wholesale": 320.0,
        "image": "https://images.unsplash.com/photo-1584744982491-665216d95f8b?w=500&auto=format&fit=crop&q=80",
        "meta": {"sterile": True, "size": "Medium", "standard": "CE ISO 13485", "grade": "Medical"},
    },
    {
        "sku": "SG-002",
        "barcode": "SG-002",
        "name": "German Grade Stainless Steel Surgical Forceps (Set of 3)",
        "pack": "surgical-shop",
        "price": 1850.0,
        "wholesale": 1500.0,
        "image": "https://images.unsplash.com/photo-1586942593568-29361efcd571?w=500&auto=format&fit=crop&q=80",
        "meta": {"material": "German Stainless Steel", "autoclavable": True, "warranty": "Lifetime"},
    },
    {
        "sku": "SG-003",
        "barcode": "SG-003",
        "name": "Omron Upper Arm Digital Blood Pressure Monitor",
        "pack": "surgical-shop",
        "price": 4200.0,
        "wholesale": 3600.0,
        "image": "https://images.unsplash.com/photo-1583912267670-6575ad472688?w=500&auto=format&fit=crop&q=80",
        "meta": {"brand": "Omron", "model": "HEM-7120", "warranty_months": 36},
    },

    # ── 20. Super Shop (Multi-Department Hypermarket) ─────────────────────────
    {
        "sku": "BF-SIRLOIN",
        "barcode": "204011000000",
        "name": "Fresh Beef · Sirloin Cut",
        "pack": "super-shop",
        "price": 850.0,
        "wholesale": 800.0,
        "image": "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "FRESH", "isWeighable": True, "ratePerKg": 850, "pluCode": "4011", "tareWeightGrams": 20},
    },
    {
        "sku": "CK-WHOLE",
        "barcode": "204012000000",
        "name": "Broiler Chicken · Skinless Whole",
        "pack": "super-shop",
        "price": 220.0,
        "wholesale": 200.0,
        "image": "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "FRESH", "isWeighable": True, "ratePerKg": 220, "pluCode": "4012", "tareWeightGrams": 15},
    },
    {
        "sku": "AP-FUJI",
        "barcode": "204013000000",
        "name": "Fuji Apples · Import Grade A",
        "pack": "super-shop",
        "price": 280.0,
        "wholesale": 250.0,
        "image": "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "FRESH", "isWeighable": True, "ratePerKg": 280, "pluCode": "4013", "tareWeightGrams": 10},
    },
    {
        "sku": "TM-ROMA",
        "barcode": "204014000000",
        "name": "Red Tomatoes · Fresh Local",
        "pack": "super-shop",
        "price": 65.0,
        "wholesale": 55.0,
        "image": "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "FRESH", "isWeighable": True, "ratePerKg": 65, "pluCode": "4014", "tareWeightGrams": 10},
    },
    {
        "sku": "PRAN-MJ-1L",
        "barcode": "894110022331",
        "name": "Pran Mango Fruit Juice 1L",
        "pack": "super-shop",
        "price": 220.0,
        "wholesale": 195.0,
        "image": "https://images.unsplash.com/photo-1546173159-315724a31696?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "GROC", "mrp": 240, "shelfLocation": "Aisle 02 · Shelf B"},
    },
    {
        "sku": "RC-MINIKET-5K",
        "barcode": "894110033442",
        "name": "Premium Miniket Rice 5kg Pack",
        "pack": "super-shop",
        "price": 410.0,
        "wholesale": 380.0,
        "image": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "GROC", "mrp": 440, "shelfLocation": "Aisle 01 · Shelf A"},
    },
    {
        "sku": "SAVLON-LIQ-500",
        "barcode": "894110055663",
        "name": "Savlon Antiseptic Liquid 500ml",
        "pack": "super-shop",
        "price": 180.0,
        "wholesale": 160.0,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "GROC", "mrp": 195, "shelfLocation": "Aisle 04 · Shelf D"},
    },
    {
        "sku": "MED-NAPA-EX",
        "barcode": "894220011001",
        "name": "Napa Extra 500mg (10 Tabs)",
        "pack": "super-shop",
        "price": 30.0,
        "wholesale": 26.0,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "PHARM", "genericName": "Paracetamol + Caffeine", "batchNo": "BT-2026-09A", "expiryDate": "2027-12-31", "rxRequired": False},
    },
    {
        "sku": "MED-AMOX-500",
        "barcode": "894220022002",
        "name": "Moxacil 500mg Capsule (10 Caps)",
        "pack": "super-shop",
        "price": 75.0,
        "wholesale": 65.0,
        "image": "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "PHARM", "genericName": "Amoxicillin Trihydrate", "batchNo": "BT-2026-04C", "expiryDate": "2027-06-30", "rxRequired": True},
    },
    {
        "sku": "POLO-COTTON",
        "barcode": "894330011011",
        "name": "Men's Pique Cotton Polo Shirt",
        "pack": "super-shop",
        "price": 850.0,
        "wholesale": 700.0,
        "image": "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "APPAREL", "styleCode": "POLO-01", "shelfLocation": "Apparel Rack A1", "variants": [
            {"id": "v1", "size": "M", "color": "Navy", "sku": "POLO-01-M-NV", "barcode": "894330011011", "price": 850, "stock": 18},
            {"id": "v2", "size": "L", "color": "Navy", "sku": "POLO-01-L-NV", "barcode": "894330011012", "price": 850, "stock": 22},
            {"id": "v3", "size": "XL", "color": "Black", "sku": "POLO-01-XL-BK", "barcode": "894330011013", "price": 850, "stock": 15},
        ]},
    },
    {
        "sku": "WALTON-LED-12W",
        "barcode": "894440011001",
        "name": "Walton LED Bulb 12W Day Light",
        "pack": "super-shop",
        "price": 350.0,
        "wholesale": 290.0,
        "image": "https://images.unsplash.com/photo-1550985543-f47f38aeee65?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "TECH", "serialRequired": True, "warrantyMonths": 12, "shelfLocation": "Tech Aisle 06 · B"},
    },
    {
        "sku": "A4-PAPER-500",
        "barcode": "894660011001",
        "name": "Double A Paper 80GSM 500 Sheets",
        "pack": "super-shop",
        "price": 520.0,
        "wholesale": 470.0,
        "image": "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=500&auto=format&fit=crop&q=80",
        "meta": {"departmentCode": "STAT", "shelfLocation": "Stationery Rack S1"},
    },
]


def resolve_target_company(
    session: Session,
    company_code: Optional[str] = None,
    user_email: Optional[str] = None,
    company_id: Optional[str] = None,
) -> Company:
    """Find the target company cleanly by code, email, or id."""
    if company_id:
        c = session.exec(select(Company).where(Company.id == company_id.strip())).first()
        if c:
            return c
    if company_code:
        c = session.exec(select(Company).where(Company.id == company_code.strip())).first()
        if c:
            return c
        c = session.exec(select(Company).where(Company.code == company_code.strip().upper())).first()
        if c:
            return c
        c = session.exec(select(Company).where(Company.code == company_code.strip())).first()
        if c:
            return c
    if user_email:
        user = session.exec(select(UserAccount).where(UserAccount.email == user_email.strip().lower())).first()
        if not user:
            user = session.exec(select(UserAccount).where(UserAccount.username == user_email.strip())).first()
        if user and user.company_id:
            c = session.exec(select(Company).where(Company.id == user.company_id)).first()
            if c:
                return c

    # If an explicit UUID was provided (e.g. b4fc81a0-7288-432b-915c-6b3faf63f424), provision company cleanly
    target_id = company_id or (company_code if company_code and "-" in company_code and len(company_code) >= 30 else None)
    if target_id:
        c = Company(
            id=target_id.strip(),
            code="DEMO82",
            name="Mashkurul Alam",
            email="demo82@pulse.pos",
            approval_status="approved",
            approved_at=datetime.now(timezone.utc),
        )
        session.add(c)
        session.flush()
        return c

    raise ValueError(
        f"Company not found matching code='{company_code}', email='{user_email}', id='{company_id}'."
    )


def seed_pos_account(
    session: Session,
    company_identifier: Optional[str] = None,
    user_email: Optional[str] = None,
    company_id: Optional[str] = None,
    store_code: Optional[str] = None,
    default_stock: int = 100,
) -> dict:
    """Seed comprehensive demo products, images, stock, and vertical settings for ONE company only."""
    company = resolve_target_company(session, company_code=company_identifier, user_email=user_email, company_id=company_id)
    cid = company.id

    # 1. Resolve or create store for this company
    store = None
    if store_code:
        store = session.exec(
            select(Store).where(Store.company_id == cid, Store.code == store_code.strip())
        ).first()
    if not store:
        store = session.exec(select(Store).where(Store.company_id == cid)).first()
    if not store:
        store = Store(
            company_id=cid,
            code=f"{company.code}-MAIN",
            name=f"{company.name} Main Branch",
            address=company.address or "Main Outlet",
        )
        session.add(store)
        session.flush()

    sid = store.id

    # 2. Ensure standard Units for this company
    unit_codes = [
        ("pcs", "Pieces"),
        ("kg", "Kilogram"),
        ("gram", "Gram"),
        ("box", "Box"),
        ("can", "Can"),
        ("bag", "Bag"),
        ("ton", "Metric Ton"),
        ("cft", "Cubic Feet"),
        ("packet", "Packet"),
        ("set", "Set"),
        ("pair", "Pair"),
        ("ream", "Ream"),
    ]
    for u_code, u_name in unit_codes:
        if not session.exec(
            select(Unit).where(Unit.company_id == cid, Unit.code == u_code)
        ).first():
            session.add(Unit(company_id=cid, code=u_code, name=u_name))
    session.flush()

    # 3. Enable all 19 Industry Packs for this company
    packs_enabled = 0
    for pack_code in ALL_INDUSTRY_PACKS:
        pack_row = session.exec(
            select(IndustryPack).where(
                IndustryPack.company_id == cid, IndustryPack.industry_code == pack_code
            )
        ).first()
        if not pack_row:
            session.add(
                IndustryPack(
                    company_id=cid,
                    industry_code=pack_code,
                    enabled_company=True,
                    enabled_store=True,
                    enabled_counter=True,
                    updated_by="seed-pos-account",
                )
            )
            packs_enabled += 1
        else:
            pack_row.enabled_company = True
            pack_row.enabled_store = True
            pack_row.enabled_counter = True
            session.add(pack_row)
            packs_enabled += 1

    session.flush()

    # 4. Upsert Products with rich metadata and image URLs
    products_created = 0
    products_updated = 0
    stock_balances_synced = 0

    for item in SPECIFIC_ACCOUNT_CATALOG:
        sku = item["sku"]
        name = item["name"]
        pack = item["pack"]
        price = item["price"]
        wholesale = item.get("wholesale")
        image_url = item.get("image", "")

        meta = dict(item.get("meta", {}))
        meta["image_url"] = image_url
        meta["image"] = image_url

        prod = session.exec(
            select(Product).where(Product.company_id == cid, Product.sku == sku)
        ).first()

        if not prod:
            prod = Product(
                company_id=cid,
                sku=sku,
                barcode=item.get("barcode", sku),
                name=name,
                industry_pack=pack,
                base_price=price,
                wholesale_price=wholesale,
                meta_json=json.dumps(meta),
                is_active=True,
            )
            session.add(prod)
            session.flush()
            products_created += 1
        else:
            prod.name = name
            prod.industry_pack = pack
            prod.base_price = price
            prod.wholesale_price = wholesale
            prod.meta_json = json.dumps(meta)
            prod.is_active = True
            session.add(prod)
            session.flush()
            products_updated += 1

        # Sync StockBalance for the store
        bal = session.exec(
            select(StockBalance).where(
                StockBalance.company_id == cid,
                StockBalance.product_id == prod.id,
                StockBalance.store_id == sid,
            )
        ).first()
        if not bal:
            session.add(
                StockBalance(
                    company_id=cid,
                    product_id=prod.id,
                    store_id=sid,
                    qty_on_hand=default_stock,
                    qty_reserved=0,
                )
            )
            stock_balances_synced += 1
        else:
            if bal.qty_on_hand < 10:
                bal.qty_on_hand = default_stock
                session.add(bal)
            stock_balances_synced += 1

        # Jewelry specific profile & certificate
        if pack == "jewelry":
            j_prof = session.exec(
                select(JewelryProductProfile).where(
                    JewelryProductProfile.company_id == cid,
                    JewelryProductProfile.product_id == prod.id,
                )
            ).first()
            karat_val = f"{meta.get('karat', 22)}K"
            metal_val = meta.get("metal", "Gold")
            gross_wt = meta.get("grossWeight", 5.0)
            net_wt = meta.get("netWeight", 4.8)
            stone_wt = meta.get("stoneWeight", 0.2)
            making_charge = meta.get("makingChargePerGram", 850)
            cert_no = meta.get("cert", f"CERT-{sku}")

            if not j_prof:
                session.add(
                    JewelryProductProfile(
                        company_id=cid,
                        product_id=prod.id,
                        metal_type=metal_val,
                        purity=karat_val,
                        karat=karat_val,
                        gross_weight=gross_wt,
                        stone_weight=stone_wt,
                        net_metal_weight=net_wt,
                        making_charge_type="per_gram",
                        making_charge_rate=making_charge,
                        wastage_percentage=2,
                        default_stone_value=int(stone_wt * 5000),
                        certificate_required=True,
                        tag_no=f"TAG-{sku}",
                        barcode=sku,
                    )
                )
            else:
                j_prof.gross_weight = gross_wt
                j_prof.net_metal_weight = net_wt
                j_prof.stone_weight = stone_wt
                j_prof.making_charge_rate = making_charge
                session.add(j_prof)

            cert = session.exec(
                select(JewelryCertificate).where(
                    JewelryCertificate.company_id == cid,
                    JewelryCertificate.cert_no == cert_no,
                )
            ).first()
            if not cert:
                session.add(
                    JewelryCertificate(
                        company_id=cid,
                        product_id=prod.id,
                        cert_no=cert_no,
                        certificate_no=cert_no,
                        tag_no=f"TAG-{sku}",
                        barcode=sku,
                        metal_type=metal_val,
                        purity=karat_val,
                        weight_gram=net_wt,
                        gross_weight=gross_wt,
                        stone_weight=stone_wt,
                        net_metal_weight=net_wt,
                        issue_date=datetime.now(timezone.utc),
                        status="active",
                    )
                )

    # 5. Seed Jewelry Gold Rates for dynamic rate calculation
    gold_rates = [
        ("Gold", "24K", 10745, 9885),
        ("Gold", "22K", 9850, 9062),
        ("Gold", "21K", 9400, 8650),
        ("Gold", "18K", 8060, 7415),
        ("Silver", "925", 145, 125),
        ("Platinum", "950", 4200, 3850),
    ]
    rates_seeded = 0
    for m_type, k_type, sell_r, buy_r in gold_rates:
        rate_row = session.exec(
            select(JewelryGoldRate).where(
                JewelryGoldRate.company_id == cid,
                JewelryGoldRate.metal_type == m_type,
                JewelryGoldRate.karat == k_type,
            )
        ).first()
        if not rate_row:
            session.add(
                JewelryGoldRate(
                    company_id=cid,
                    metal_type=m_type,
                    karat=k_type,
                    purity=k_type,
                    rate_per_gram=sell_r,
                    selling_rate=sell_r,
                    buying_rate=buy_r,
                    currency="BDT",
                    unit_basis="gram",
                    status="active",
                    effective_date=datetime.now(timezone.utc),
                )
            )
            rates_seeded += 1

    session.flush()

    # 6. Invalidate config cache so client immediately sees new active packs
    try:
        invalidate_company_config(cid)
    except Exception as e:
        print(f"Notice: Cache invalidation: {e}")

    session.commit()

    return {
        "company_id": cid,
        "company_code": company.code,
        "company_name": company.name,
        "store_id": sid,
        "store_code": store.code,
        "store_name": store.name,
        "packs_enabled": packs_enabled,
        "products_created": products_created,
        "products_updated": products_updated,
        "total_products": products_created + products_updated,
        "stock_balances_synced": stock_balances_synced,
        "gold_rates_seeded": rates_seeded,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Seed comprehensive demo products and images across all POS shops for a specific client account."
    )
    parser.add_argument("--company", help="Company code (e.g. OUTFIT)")
    parser.add_argument("--email", help="Client user email (e.g. outfit@pos.com)")
    parser.add_argument("--store", help="Optional store code (defaults to main store)")
    parser.add_argument("--stock", type=int, default=100, help="Default initial on-hand stock per product (default 100)")

    args = parser.parse_args()

    if not args.company and not args.email:
        print("Error: You must provide either --company <CODE> or --email <EMAIL>.")
        sys.exit(1)

    print(f"Connecting to database...")
    with Session(engine) as session:
        result = seed_pos_account(
            session,
            company_identifier=args.company,
            user_email=args.email,
            store_code=args.store,
            default_stock=args.stock,
        )

        print("\n" + "=" * 60)
        print(f"SUCCESS: Seeded Demo POS Data for Account")
        print("=" * 60)
        print(f"Company: {result['company_name']} ({result['company_code']})")
        print(f"Store:   {result['store_name']} ({result['store_code']})")
        print(f"Packs Enabled: {result['packs_enabled']} / {len(ALL_INDUSTRY_PACKS)} industry packs")
        print(f"Products: {result['total_products']} ({result['products_created']} new, {result['products_updated']} updated)")
        print(f"Stock Balances: {result['stock_balances_synced']} items in stock")
        print(f"Gold Rates: {result['gold_rates_seeded']} active metal rates")
        print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
