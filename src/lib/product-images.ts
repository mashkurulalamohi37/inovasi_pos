/**
 * Product Image Resolution and Fallback System.
 * Ensures authentic, high-definition product photography across all industry verticals
 * for the PULSE-DEMO store and POS interfaces, with zero misplaced food/burger fallbacks.
 */

// Curated high-resolution authentic product photos for demo products
export const DEMO_PRODUCT_IMAGES: Record<string, string> = {
  // --- Jewelry POS ---
  "JEWL-001": "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&auto=format&fit=crop&q=80",
  "JW-001": "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&auto=format&fit=crop&q=80", // Gold Chain
  "JW-002": "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&auto=format&fit=crop&q=80", // Diamond Ring White Gold
  "JW-003": "https://images.unsplash.com/photo-1611591475155-4284ec28d351?w=500&auto=format&fit=crop&q=80", // Silver Bangles
  "JW-004": "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&auto=format&fit=crop&q=80", // Bridal Har Necklace
  "JW-005": "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=500&auto=format&fit=crop&q=80", // Gold Kulla Bangle Set
  "JW-006": "https://images.unsplash.com/photo-1603561591411-07134e71a2a9?w=500&auto=format&fit=crop&q=80", // Platinum Solitaire Ring
  "JW-007": "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=500&auto=format&fit=crop&q=80", // Gold Earring Tops
  "JW-008": "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=500&auto=format&fit=crop&q=80", // Gold Jhumka Earrings
  "JW-009": "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=500&auto=format&fit=crop&q=80", // Rose Gold Pendant
  "JW-010": "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&auto=format&fit=crop&q=80", // Pearl Drop Necklace
  "JW-011": "https://images.unsplash.com/photo-1611591475155-4284ec28d351?w=500&auto=format&fit=crop&q=80", // Mens Gold Bracelet
  "JW-012": "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=500&auto=format&fit=crop&q=80", // Silver Payal / Anklet
  "JW-013": "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&auto=format&fit=crop&q=80", // Crown Tiara Ring
  "JW-014": "https://images.unsplash.com/photo-1603561591411-07134e71a2a9?w=500&auto=format&fit=crop&q=80", // Emerald Ring
  "JW-015": "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=500&auto=format&fit=crop&q=80", // Mangalsutra Pendant
  "JW-016": "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=500&auto=format&fit=crop&q=80", // Gold Nose Pin
  "JW-017": "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&auto=format&fit=crop&q=80", // Platinum Wedding Band
  "JW-018": "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&auto=format&fit=crop&q=80", // Royal Choker Necklace
  "JW-019": "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=500&auto=format&fit=crop&q=80", // Sapphire Earrings
  "JW-020": "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=500&auto=format&fit=crop&q=80", // Stamped Gold Coin

  // --- Electronics POS ---
  "ELEC-001": "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80",
  "EL-001": "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80", // Galaxy A55 5G
  "EL-002": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&auto=format&fit=crop&q=80", // Redmi Note 13 Pro
  "EL-003": "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500&auto=format&fit=crop&q=80", // USB-C Hub
  "EL-004": "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=500&auto=format&fit=crop&q=80", // 55" 4K Smart TV
  "EL-005": "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=500&auto=format&fit=crop&q=80", // iPhone 15 Pro
  "EL-006": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&auto=format&fit=crop&q=80", // MacBook Air M3
  "EL-007": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=80", // WH-1000XM5 Headphones
  "EL-008": "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=500&auto=format&fit=crop&q=80", // Inverter AC 1.5 Ton
  "EL-009": "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=500&auto=format&fit=crop&q=80", // Refrigerator
  "EL-010": "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=500&auto=format&fit=crop&q=80", // Washing Machine
  "EL-011": "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=80", // Gaming Keyboard
  "EL-012": "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=500&auto=format&fit=crop&q=80", // Wireless Mouse
  "EL-013": "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=80", // 27" 4K Monitor
  "EL-014": "https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=500&auto=format&fit=crop&q=80", // Wi-Fi 6 Router
  "EL-015": "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=500&auto=format&fit=crop&q=80", // Soundbar
  "EL-016": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80", // Smartwatch Series 9
  "EL-017": "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500&auto=format&fit=crop&q=80", // Power Bank
  "EL-018": "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=500&auto=format&fit=crop&q=80", // Bluetooth Speaker
  "EL-019": "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=500&auto=format&fit=crop&q=80", // Mirrorless Camera
  "EL-020": "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=500&auto=format&fit=crop&q=80", // Microwave Oven

  // --- Fashion POS ---
  "FASH-001": "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500&auto=format&fit=crop&q=80", // Cotton Polo Shirt
  "FASH-002": "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=500&auto=format&fit=crop&q=80", // Slim Fit Chino
  "FASH-003": "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=500&auto=format&fit=crop&q=80", // Oversized Hoodie
  "FASH-004": "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=500&auto=format&fit=crop&q=80", // Summer Frock

  // --- Pharmacy POS ---
  "PHRM-001": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80", // Paracetamol 500mg
  "PHRM-002": "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=500&auto=format&fit=crop&q=80", // Amoxicillin 250mg
  "PHRM-003": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80", // Metformin 500mg
  "PHRM-004": "https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=500&auto=format&fit=crop&q=80", // Vitamin C

  // --- Grocery POS ---
  "GROC-001": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=80", // Basmati Rice 5kg
  "GROC-002": "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=80", // Soybean Oil 2L
  "GROC-003": "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=500&auto=format&fit=crop&q=80", // Full Cream Milk 1L
  "GROC-004": "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=500&auto=format&fit=crop&q=80", // Lays Chips 50g

  // --- Beef Shop POS ---
  "BEEF-001": "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=500&auto=format&fit=crop&q=80", // Beef Shoulder
  "BEEF-002": "https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=500&auto=format&fit=crop&q=80", // Beef Brisket Boneless
  "BF-001": "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=500&auto=format&fit=crop&q=80",
  "BF-002": "https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=500&auto=format&fit=crop&q=80",
  "MT-001": "https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80", // Mutton Leg
  "CK-001": "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=500&auto=format&fit=crop&q=80", // Broiler Chicken
  "FS-001": "https://images.unsplash.com/photo-1534043464124-3be32fe000c9?w=500&auto=format&fit=crop&q=80", // Hilsa Fish
  "SG-001": "https://images.unsplash.com/photo-1585325701165-351af916e581?w=500&auto=format&fit=crop&q=80", // Beef Sausage
  "FR-001": "https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=500&auto=format&fit=crop&q=80", // Frozen Beef Mince

  // --- Optical Shop POS ---
  "OP-001": "https://images.unsplash.com/photo-1591076482161-42ce6da69f67?w=500&auto=format&fit=crop&q=80", // Metal Full-Rim Frame
  "OP-002": "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=500&auto=format&fit=crop&q=80", // Rimless Titanium Frame

  // --- Surgical & Medical POS (Siddiky International & Tynor Authentic Catalog) ---
  "SG-SURG-001": "/products/surgical/tynor_a01_abdominal.png",
  "SG-SURG-002": "/products/surgical/tynor_a07_contoured_ls.png",
  "SG-SURG-003": "/products/surgical/tynor_b02_cervical_support.png",
  "TYN-A01-M": "/products/surgical/tynor_a01_abdominal.png", // Abdominal Support 9" (23cm)
  "TYN-A01-L": "/products/surgical/tynor_a01_abdominal.png",
  "TYN-A01-XL": "/products/surgical/tynor_a01_abdominal.png",
  "TYN-A01-XXL": "/products/surgical/tynor_a01_abdominal.png",
  "TYN-A04-M": "/products/surgical/tynor_a04_ls_belt.png",
  "TYN-A04-L": "/products/surgical/tynor_a04_ls_belt.png",
  "TYN-A04-XL": "/products/surgical/tynor_a04_ls_belt.png",
  "TYN-A05-M": "/products/surgical/tynor_a04_ls_belt.png", // Lumbo Sacral Belt
  "TYN-A05-L": "/products/surgical/tynor_a04_ls_belt.png",
  "TYN-A05-XL": "/products/surgical/tynor_a04_ls_belt.png",
  "TYN-A07-M": "/products/surgical/tynor_a07_contoured_ls.png", // Contoured L.S Support
  "TYN-A07-L": "/products/surgical/tynor_a07_contoured_ls.png",
  "TYN-A02-M": "/products/surgical/tynor_a02_chest.png", // Chest Binder
  "TYN-A11-M": "/products/surgical/tynor_a02_chest.png", // Chest Binder
  "TYN-A13-REG": "/products/surgical/tynor_a13_taylor.png", // Taylor's Brace Short/Long
  "TYN-B01-M": "/products/surgical/tynor_b01_cervical_soft.png", // Cervical Collar Soft
  "TYN-B02-L": "/products/surgical/tynor_b02_cervical_support.png", // Cervical Collar Soft with Support
  "TYN-B04-M": "/products/surgical/tynor_b04_philadelphia.png", // Philadelphia E.T. Collar
  "TYN-C01-M": "/products/surgical/tynor_c01_clavicle.png", // Clavicle Brace with Velcro
  "TYN-A23-M": "/products/surgical/tynor_a23_posture.png", // Posture Corrector
  "TYN-A33-M": "/products/surgical/tynor_a23_posture.png", // Posture Corrector
  "TYN-D01-M": "/products/surgical/tynor_d01_knee_support.png", // Knee Support
  "TYN-D02-M": "/products/surgical/tynor_d02_hinged_knee.png", // Hinged Knee Support
  "TYN-D04-M": "/products/surgical/tynor_d04_knee_cap.png", // Knee Cap Pair
  "TYN-D07-M": "/products/surgical/tynor_d07_ankle_binder.png", // Ankle Binder
  "TYN-D17-M": "/products/surgical/tynor_d17_ankler.png", // Ankler Elastic Ankle Support
  "TYN-E01-M": "/products/surgical/tynor_e01_arm_sling.png", // Arm Sling
  "TYN-E02-M": "/products/surgical/tynor_e02_pouch_arm_sling.png", // Pouch Arm Sling
  "TYN-E05-M": "/products/surgical/tynor_e44_wrist_brace.png", // Wrist Brace with Double Lock
  "TYN-E44-M": "/products/surgical/tynor_e44_wrist_brace.png", // Wrist Brace with Double Lock
  "TYN-E10-M": "/products/surgical/tynor_e11_tennis_elbow.png", // Tennis Elbow Support
  "TYN-E11-M": "/products/surgical/tynor_e11_tennis_elbow.png", // Tennis Elbow Support
  "TYN-H01-M": "/products/surgical/tynor_h01_finger_cot.png", // Finger Cot
  "TYN-J01-M": "/products/surgical/tynor_j01_walking_stick.png", // Walking Stick
  "TYN-L01-M": "/products/surgical/tynor_l01_heel_cushion.png", // Silicone Heel Cushion
  "DIAG-DENGUE-NS1": "/products/surgical/dengue_ns1.png", // Dengue NS1 Antigen Rapid Test Kit
  "DIAG-DENGUE-COMBO": "/products/surgical/dengue_combo.png", // Dengue Combo Rapid Test Kit
  "DIAG-PREG-CARD": "/products/surgical/pregnancy_card.png", // Pregnancy Rapid Diagnostic Card
  "GLV-STERILE-PF-7.5": "/products/surgical/sterile_gloves.png", // Surgical Gloves PF 7.5
  "GLV-STERILE-PF-7.0": "/products/surgical/sterile_gloves.png", // Surgical Gloves PF 7.0
  "GLV-STERILE-PWD-7.5": "/products/surgical/sterile_gloves.png", // Surgical Gloves PWD 7.5
  "SG-02-274-18": "/products/surgical/bone_rongeurs.png", // Beyer Bone Rongeurs 18cm
  "SG-02-374-20": "/products/surgical/plate_benders.png", // Jewett Bone Plate Benders 20cm
  "SG-03-188-00": "/products/surgical/balfour_retractor.png", // Balfour Abdominal Retractor 250mm
  "SG-04-011-01": "/products/surgical/laryngoscope_set.png", // McIntosh Laryngoscope Set
  "SG-05-118-145": "/products/surgical/metzenbaum_scissors.png", // Metzenbaum Dissecting Scissors
  "SG-05-839-14": "/products/surgical/needle_holder.png", // Mayo-Hegar Needle Holder 14cm
  "SG-05-1112-125": "/products/surgical/mosquito_forceps.png", // Halstead-Mosquito Forceps 12.5cm
  "SG-05-2334-75": "/products/surgical/cusco_specula.png", // Cusco Vaginal Specula 75x17mm

  // --- Mobile Shop POS ---
  "MOB-001": "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80", // Samsung Galaxy A15
  "MOB-ACC-001": "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500&auto=format&fit=crop&q=80", // Type-C Fast Charger

  // --- Salon & Spa POS ---
  "SALON-HC": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=500&auto=format&fit=crop&q=80", // Haircut Classic
  "SALON-FC": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=500&auto=format&fit=crop&q=80", // Facial Basic
  "SALON-SH": "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=500&auto=format&fit=crop&q=80", // Salon Shampoo 250ml

  // --- Hardware POS ---
  "HW-SCREW": "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=500&auto=format&fit=crop&q=80", // Steel Screw
  "HW-CABLE": "https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=500&auto=format&fit=crop&q=80", // Electrical Cable
  "HW-PAINT": "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500&auto=format&fit=crop&q=80", // Enamel Paint

  // --- Building Materials POS ---
  "BM-CEMENT": "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500&auto=format&fit=crop&q=80", // Portland Cement
  "BM-ROD": "https://images.unsplash.com/photo-1535813547-99c456a41d4a?w=500&auto=format&fit=crop&q=80", // MS Rod 12mm
  "BM-SAND": "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=500&auto=format&fit=crop&q=80", // Construction Sand

  // --- Bookstore POS ---
  "BK-PHY10": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80", // Physics Book
  "BK-MATH12": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80", // Higher Math
  "BK-NOVEL": "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=500&auto=format&fit=crop&q=80", // Novel

  // --- Stationery POS ---
  "ST-PEN": "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=500&auto=format&fit=crop&q=80", // Matador Pen
  "ST-KHATA": "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=500&auto=format&fit=crop&q=80", // Fresh Exercise Book
  "ST-A4": "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=500&auto=format&fit=crop&q=80", // Double A A4 Rim

  // --- Cosmetics POS ---
  "COS-LIP": "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=500&auto=format&fit=crop&q=80", // Lakme Lipstick
  "COS-FOUND": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=500&auto=format&fit=crop&q=80", // Maybelline Foundation
  "COS-CREAM": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&auto=format&fit=crop&q=80", // Pond's Cream

  // --- Tali Co Kitchen Chinese Menu (Restaurant POS) ---
  "TK-APP-01": "https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?w=500&auto=format&fit=crop&q=80", // Fried Wonton (8 Pcs)
  "TK-APP-02": "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=500&auto=format&fit=crop&q=80", // Special Wonton (8 Pcs)
  "TK-APP-03": "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500&auto=format&fit=crop&q=80", // French Fries
  "TK-APP-04": "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop&q=80", // Chicken & Prawn Cashew Nut Salad
  "TK-APP-05": "https://images.unsplash.com/photo-1559742811-822873691df8?w=500&auto=format&fit=crop&q=80", // Fried Prawn (10pcs)

  "TK-SOU-01": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=500&auto=format&fit=crop&q=80", // Special Thai Soup
  "TK-SOU-02": "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500&auto=format&fit=crop&q=80", // Thai Soup
  "TK-SOU-03": "https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?w=500&auto=format&fit=crop&q=80", // Special Corn Soup
  "TK-SOU-04": "https://images.unsplash.com/photo-1547592180-85f173990554?w=500&auto=format&fit=crop&q=80", // Chicken Corn Soup

  "TK-CHW-01": "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500&auto=format&fit=crop&q=80", // Thai Special Chow Mein
  "TK-CHW-02": "https://images.unsplash.com/photo-1612927601601-6638404737ce?w=500&auto=format&fit=crop&q=80", // Tali Co. Special Chow Mein
  "TK-CHW-03": "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=500&auto=format&fit=crop&q=80", // Chicken Chow Mein

  "TK-VEG-01": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop&q=80", // Tali Co. Special Vegetable
  "TK-VEG-02": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80", // Chicken Vegetable
  "TK-VEG-03": "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop&q=80", // Vegetable

  "TK-RIC-01": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500&auto=format&fit=crop&q=80", // Thai Special Fried Rice
  "TK-RIC-02": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=500&auto=format&fit=crop&q=80", // Tali Co. Special Fried Rice
  "TK-RIC-03": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500&auto=format&fit=crop&q=80", // Chicken Fried Rice
  "TK-RIC-04": "https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=500&auto=format&fit=crop&q=80", // Egg Fried Rice

  "TK-CHK-01": "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500&auto=format&fit=crop&q=80", // Thai-Style Fried Bangkok Chicken (8 Pcs)
  "TK-CHK-02": "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=500&auto=format&fit=crop&q=80", // Royal Chicken Masala
  "TK-CHK-03": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=500&auto=format&fit=crop&q=80", // Chicken Chilli Onion
  "TK-CHK-04": "https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80", // Chicken Sizzling Hot Plate

  "TK-BEF-01": "https://images.unsplash.com/photo-1534939561126-855b8675edd7?w=500&auto=format&fit=crop&q=80", // Royal Beef Masala
  "TK-BEF-02": "https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=500&auto=format&fit=crop&q=80", // Beef Green Chilli Onion
  "TK-BEF-03": "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=500&auto=format&fit=crop&q=80", // Beef Sizzling Hot Plate

  "TK-PRW-01": "https://images.unsplash.com/photo-1559742811-822873691df8?w=500&auto=format&fit=crop&q=80", // Prawn Masala
  "TK-PRW-02": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=500&auto=format&fit=crop&q=80", // Sweet & Sour Prawn
  "TK-PRW-03": "https://images.unsplash.com/photo-1559742811-822873691df8?w=500&auto=format&fit=crop&q=80", // Prawn Sizzling

  "TK-SET-01": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80", // SET MENU – 01
  "TK-SET-02": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&auto=format&fit=crop&q=80", // SET MENU – 02
  "TK-SET-03": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80", // SET MENU – 03
  "TK-SET-04": "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500&auto=format&fit=crop&q=80", // SET MENU – 04

  "TK-BEV-01": "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop&q=80", // Mineral Water (500ml)
  "TK-BEV-02": "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop&q=80", // Mineral Water (1500ml)
  "TK-BEV-03": "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=80", // Soft Drinks
  "TK-BEV-04": "https://images.unsplash.com/photo-1587080413959-06b859fb107d?w=500&auto=format&fit=crop&q=80", // Lassi
  "TK-BEV-05": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500&auto=format&fit=crop&q=80", // Cold Coffee
  "TK-BEV-06": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&auto=format&fit=crop&q=80", // Hot Coffee

  // --- Restaurant & Fast Food POS ---
  "EM-APP-01": "/food-images/EM-APP-01.jpg",
  "EM-APP-02": "/food-images/EM-APP-02.jpg",
  "EM-APP-03": "/food-images/EM-APP-03.jpg",
  "EM-APP-04": "/food-images/EM-APP-04.jpg",
  "EM-APP-05": "/food-images/EM-APP-05.jpg",
  "EM-APP-06": "/food-images/EM-APP-06.jpg",
  "EM-APP-07": "/food-images/EM-APP-07.jpg",
  "EM-RICE-01": "/food-images/EM-RICE-01.jpg",
  "EM-RICE-02": "/food-images/EM-RICE-02.jpg",
  "EM-RICE-03": "/food-images/EM-RICE-03.jpg",
  "EM-SW-01": "/food-images/EM-SW-01.jpg",
  "EM-SW-02": "/food-images/EM-SW-02.jpg",
  "EM-SW-03": "/food-images/EM-SW-03.jpg",
  "EM-SW-04": "/food-images/EM-SW-04.jpg",
  "EM-SW-05": "/food-images/EM-SW-05.jpg",
  "EM-BGR-01": "/food-images/EM-BGR-01.jpg",
  "EM-BGR-02": "/food-images/EM-BGR-02.jpg",
  "EM-BGR-03": "/food-images/EM-BGR-03.jpg",
  "EM-BOX-01": "/food-images/EM-BOX-01.jpg",
  "EM-BOX-02": "/food-images/EM-BOX-02.jpg",
  "EM-BOX-03": "/food-images/EM-BOX-03.jpg",
  "EM-PST-01": "/food-images/EM-PST-01.jpg",
  "EM-PST-02": "/food-images/EM-PST-02.jpg",
  "EM-FF-01": "/food-images/EM-FF-01.jpg",
  "EM-FF-02": "/food-images/EM-FF-02.jpg",
  "EM-FC-01": "/food-images/EM-FC-01.jpg",
  "EM-FC-02": "/food-images/EM-FC-02.jpg",
  "EM-FC-03": "/food-images/EM-FC-03.jpg",
  "EM-FC-04": "/food-images/EM-FC-04.jpg",
  "EM-FC-05": "/food-images/EM-FC-05.jpg",
  "EM-FC-06": "/food-images/EM-FC-06.jpg",
  "EM-OTH-01": "/food-images/EM-OTH-01.jpg",
  "EM-OTH-02": "/food-images/EM-OTH-02.jpg",
  "EM-OTH-03": "/food-images/EM-OTH-03.jpg",
  "EM-OTH-04": "/food-images/EM-OTH-04.jpg",
  "EM-OTH-05": "/food-images/EM-OTH-05.jpg",
  "EM-DRK-01": "/food-images/EM-DRK-01.jpg",
  "EM-DRK-02": "/food-images/EM-DRK-02.jpg",
  // Legacy / restored Combo items
  "REST-EM-001": "/food-images/REST-EM-001.jpg",
  "REST-EM-002": "/food-images/REST-EM-002.jpg",
  "REST-EM-003": "/food-images/REST-EM-003.jpg",
  "REST-EM-004": "/food-images/REST-EM-004.jpg",
  "REST-EM-005": "/food-images/REST-EM-005.jpg",
  "REST-EM-006": "/food-images/REST-EM-006.jpg",
  "REST-EM-007": "/food-images/REST-EM-007.jpg",
  "REST-EM-008": "/food-images/REST-EM-008.jpg",
  "REST-EM-009": "/food-images/REST-EM-009.jpg",
  "REST-EM-010": "/food-images/REST-EM-010.jpg",
  "REST-EM-011": "/food-images/REST-EM-011.jpg",
  "REST-EM-012": "/food-images/REST-EM-012.jpg",
  "REST-EM-013": "/food-images/REST-EM-013.jpg",
  "REST-EM-014": "/food-images/REST-EM-014.jpg",
  "REST-EM-015": "/food-images/REST-EM-015.jpg", // Mini Burger Combo
  "REST-EM-016": "/food-images/REST-EM-016.jpg",
  "REST-EM-017": "/food-images/REST-EM-017.jpg",
  "REST-EM-018": "/food-images/REST-EM-018.jpg",
  "REST-EM-019": "/food-images/REST-EM-019.jpg",
  "REST-EM-020": "/food-images/REST-EM-020.jpg",
  "REST-EM-021": "/food-images/REST-EM-021.jpg",
  "REST-EM-022": "/food-images/REST-EM-022.jpg",
  "REST-EM-023": "/food-images/REST-EM-023.jpg", // Student Special Combo
  "REST-EM-024": "/food-images/REST-EM-024.jpg", // Regular Combo
  "REST-EM-025": "/food-images/REST-EM-025.jpg", // Superior Combo
  "REST-EM-026": "/food-images/REST-EM-026.jpg",
  "REST-EM-027": "/food-images/REST-EM-027.jpg",
  "REST-EM-028": "/food-images/REST-EM-028.jpg",
  "REST-EM-029": "/food-images/REST-EM-029.jpg",
  "REST-EM-030": "/food-images/REST-EM-030.jpg",
  "REST-EM-031": "/food-images/REST-EM-031.jpg",
  "REST-EM-032": "/food-images/REST-EM-032.jpg",
  "REST-EM-033": "/food-images/REST-EM-033.jpg",
  "REST-EM-034": "/food-images/REST-EM-034.jpg", // Nati Combo
  "REST-EM-035": "/food-images/REST-EM-035.jpg",
  "REST-EM-036": "/food-images/REST-EM-036.jpg",
  "REST-EM-037": "/food-images/REST-EM-037.jpg",
  "REST-EM-038": "/food-images/REST-EM-038.jpg",
  "REST-EM-039": "/food-images/REST-EM-039.jpg",
  "REST-EM-040": "/food-images/REST-EM-040.jpg",
  "REST-EM-041": "/food-images/REST-EM-041.jpg",
  "REST-EM-042": "/food-images/REST-EM-042.jpg",
  "REST-EM-043": "/food-images/REST-EM-043.jpg",
  "REST-EM-044": "/food-images/REST-EM-044.jpg",
};

// Default high-quality category hero images per industry pack
export const INDUSTRY_DEFAULT_IMAGES: Record<string, string> = {
  jewelry: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&auto=format&fit=crop&q=80",
  electronics: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80",
  "mobile-shop": "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80",
  fashion: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500&auto=format&fit=crop&q=80",
  pharmacy: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80",
  grocery: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=80",
  restaurant: "/food-images/EM-BOX-02.jpg",
  cosmetics: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=500&auto=format&fit=crop&q=80",
  bookstore: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80",
  stationery: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=500&auto=format&fit=crop&q=80",
  hardware: "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=500&auto=format&fit=crop&q=80",
  "building-materials": "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500&auto=format&fit=crop&q=80",
  "optical-shop": "https://images.unsplash.com/photo-1591076482161-42ce6da69f67?w=500&auto=format&fit=crop&q=80",
  "surgical-shop": "https://images.unsplash.com/photo-1584744982491-665216d95f8b?w=500&auto=format&fit=crop&q=80",
  salon: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=500&auto=format&fit=crop&q=80",
  "beef-shop": "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=500&auto=format&fit=crop&q=80",
  "rice-mill": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=80",
  furniture: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&auto=format&fit=crop&q=80",
  tailoring: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500&auto=format&fit=crop&q=80",
  "cycle-toys": "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=500&auto=format&fit=crop&q=80",
};

/**
 * Intelligently resolve the most authentic, real product photo for any given product
 * based on its SKU, name, badge/category, metadata, or industry pack.
 */
export function getProductFallbackImage(
  title: string = "",
  badge?: string,
  sku?: string,
  industry?: string
): string {
  // 1. Direct SKU match
  if (sku && DEMO_PRODUCT_IMAGES[sku]) {
    return DEMO_PRODUCT_IMAGES[sku];
  }

  const normalized = `${title} ${badge ?? ""} ${sku ?? ""}`.toLowerCase();

  // 2. Jewelry Category Keywords
  if (
    normalized.includes("gold") ||
    normalized.includes("silver") ||
    normalized.includes("diamond") ||
    normalized.includes("platinum") ||
    normalized.includes("necklace") ||
    normalized.includes("ring") ||
    normalized.includes("chain") ||
    normalized.includes("bangle") ||
    normalized.includes("earring") ||
    normalized.includes("jhumka") ||
    normalized.includes("pendant") ||
    normalized.includes("payal") ||
    normalized.includes("noth") ||
    normalized.includes("mangalsutra") ||
    normalized.includes("choker") ||
    normalized.includes("karat") ||
    normalized.includes("22k") ||
    normalized.includes("21k") ||
    normalized.includes("18k") ||
    industry === "jewelry"
  ) {
    if (normalized.includes("chain")) return DEMO_PRODUCT_IMAGES["JW-001"];
    if (normalized.includes("necklace") || normalized.includes("har") || normalized.includes("choker"))
      return DEMO_PRODUCT_IMAGES["JW-004"];
    if (normalized.includes("ring") || normalized.includes("tiara") || normalized.includes("band"))
      return DEMO_PRODUCT_IMAGES["JW-002"];
    if (normalized.includes("bangle") || normalized.includes("kulla") || normalized.includes("bracelet"))
      return DEMO_PRODUCT_IMAGES["JW-005"];
    if (normalized.includes("earring") || normalized.includes("jhumka") || normalized.includes("top"))
      return DEMO_PRODUCT_IMAGES["JW-008"];
    if (normalized.includes("pendant") || normalized.includes("mangalsutra"))
      return DEMO_PRODUCT_IMAGES["JW-009"];
    if (normalized.includes("coin") || normalized.includes("bullion"))
      return DEMO_PRODUCT_IMAGES["JW-020"];
    if (normalized.includes("silver") || normalized.includes("payal"))
      return DEMO_PRODUCT_IMAGES["JW-003"];
    return INDUSTRY_DEFAULT_IMAGES.jewelry;
  }

  // 3. Electronics & Gadgets Keywords
  if (
    normalized.includes("galaxy") ||
    normalized.includes("iphone") ||
    normalized.includes("phone") ||
    normalized.includes("macbook") ||
    normalized.includes("laptop") ||
    normalized.includes("tv") ||
    normalized.includes("smart tv") ||
    normalized.includes("headphone") ||
    normalized.includes("earbuds") ||
    normalized.includes("watch") ||
    normalized.includes("keyboard") ||
    normalized.includes("mouse") ||
    normalized.includes("monitor") ||
    normalized.includes("router") ||
    normalized.includes("soundbar") ||
    normalized.includes("speaker") ||
    normalized.includes("camera") ||
    normalized.includes("power bank") ||
    normalized.includes("air conditioner") ||
    normalized.includes("ac 1.") ||
    normalized.includes("refrigerator") ||
    normalized.includes("washing machine") ||
    normalized.includes("microwave") ||
    normalized.includes("charger") ||
    industry === "electronics" ||
    industry === "mobile-shop"
  ) {
    if (normalized.includes("iphone")) return DEMO_PRODUCT_IMAGES["EL-005"];
    if (normalized.includes("galaxy") || normalized.includes("phone") || normalized.includes("mobile"))
      return DEMO_PRODUCT_IMAGES["EL-001"];
    if (normalized.includes("macbook") || normalized.includes("laptop"))
      return DEMO_PRODUCT_IMAGES["EL-006"];
    if (normalized.includes("tv")) return DEMO_PRODUCT_IMAGES["EL-004"];
    if (normalized.includes("headphone") || normalized.includes("earbud"))
      return DEMO_PRODUCT_IMAGES["EL-007"];
    if (normalized.includes("watch")) return DEMO_PRODUCT_IMAGES["EL-016"];
    if (normalized.includes("keyboard")) return DEMO_PRODUCT_IMAGES["EL-011"];
    if (normalized.includes("mouse")) return DEMO_PRODUCT_IMAGES["EL-012"];
    if (normalized.includes("monitor")) return DEMO_PRODUCT_IMAGES["EL-013"];
    if (normalized.includes("router") || normalized.includes("wifi"))
      return DEMO_PRODUCT_IMAGES["EL-014"];
    if (normalized.includes("soundbar") || normalized.includes("speaker"))
      return DEMO_PRODUCT_IMAGES["EL-015"];
    if (normalized.includes("camera")) return DEMO_PRODUCT_IMAGES["EL-019"];
    if (normalized.includes("power bank") || normalized.includes("charger") || normalized.includes("hub"))
      return DEMO_PRODUCT_IMAGES["EL-003"];
    if (normalized.includes("ac") || normalized.includes("refrigerator") || normalized.includes("fridge"))
      return DEMO_PRODUCT_IMAGES["EL-008"];
    if (normalized.includes("washing")) return DEMO_PRODUCT_IMAGES["EL-010"];
    if (normalized.includes("microwave") || normalized.includes("oven"))
      return DEMO_PRODUCT_IMAGES["EL-020"];
    return INDUSTRY_DEFAULT_IMAGES.electronics;
  }

  // 4. Fashion & Apparel Keywords
  if (
    normalized.includes("polo") ||
    normalized.includes("shirt") ||
    normalized.includes("kurti") ||
    normalized.includes("chino") ||
    normalized.includes("pant") ||
    normalized.includes("hoodie") ||
    normalized.includes("frock") ||
    normalized.includes("dress") ||
    normalized.includes("saree") ||
    normalized.includes("panjabi") ||
    normalized.includes("jacket") ||
    industry === "fashion" ||
    industry === "tailoring"
  ) {
    if (normalized.includes("polo") || normalized.includes("shirt"))
      return DEMO_PRODUCT_IMAGES["FASH-001"];
    if (normalized.includes("chino") || normalized.includes("pant"))
      return DEMO_PRODUCT_IMAGES["FASH-002"];
    if (normalized.includes("hoodie") || normalized.includes("jacket"))
      return DEMO_PRODUCT_IMAGES["FASH-003"];
    if (normalized.includes("kurti") || normalized.includes("frock") || normalized.includes("dress"))
      return DEMO_PRODUCT_IMAGES["FASH-004"];
    return INDUSTRY_DEFAULT_IMAGES.fashion;
  }

  // 5. Pharmacy & Health Keywords
  if (
    normalized.includes("paracetamol") ||
    normalized.includes("amoxicillin") ||
    normalized.includes("metformin") ||
    normalized.includes("vitamin") ||
    normalized.includes("tablet") ||
    normalized.includes("capsule") ||
    normalized.includes("syrup") ||
    normalized.includes("mg") ||
    industry === "pharmacy"
  ) {
    if (normalized.includes("amoxicillin") || normalized.includes("cap"))
      return DEMO_PRODUCT_IMAGES["PHRM-002"];
    if (normalized.includes("vitamin")) return DEMO_PRODUCT_IMAGES["PHRM-004"];
    return DEMO_PRODUCT_IMAGES["PHRM-001"];
  }

  // 6. Grocery Keywords
  if (
    normalized.includes("soybean") ||
    normalized.includes("oil") ||
    normalized.includes("milk") ||
    normalized.includes("lays") ||
    normalized.includes("chips") ||
    normalized.includes("sugar") ||
    normalized.includes("salt") ||
    normalized.includes("flour") ||
    normalized.includes("atta") ||
    normalized.includes("dal") ||
    normalized.includes("lentil") ||
    industry === "grocery"
  ) {
    if (normalized.includes("oil")) return DEMO_PRODUCT_IMAGES["GROC-002"];
    if (normalized.includes("milk")) return DEMO_PRODUCT_IMAGES["GROC-003"];
    if (normalized.includes("lays") || normalized.includes("chips") || normalized.includes("snack"))
      return DEMO_PRODUCT_IMAGES["GROC-004"];
    if (normalized.includes("rice")) return DEMO_PRODUCT_IMAGES["GROC-001"];
    return INDUSTRY_DEFAULT_IMAGES.grocery;
  }

  // 7. Beef & Meat Shop Keywords
  if (
    normalized.includes("beef") ||
    normalized.includes("mutton") ||
    normalized.includes("chicken whole") ||
    normalized.includes("sirloin") ||
    normalized.includes("brisket") ||
    normalized.includes("sausage") ||
    normalized.includes("hilsa") ||
    normalized.includes("fish") ||
    industry === "beef-shop"
  ) {
    if (normalized.includes("mutton")) return DEMO_PRODUCT_IMAGES["MT-001"];
    if (normalized.includes("chicken")) return DEMO_PRODUCT_IMAGES["CK-001"];
    if (normalized.includes("fish") || normalized.includes("hilsa"))
      return DEMO_PRODUCT_IMAGES["FS-001"];
    if (normalized.includes("sausage")) return DEMO_PRODUCT_IMAGES["SG-001"];
    return DEMO_PRODUCT_IMAGES["BEEF-001"];
  }

  // 8. Cosmetics & Beauty Keywords
  if (
    normalized.includes("lipstick") ||
    normalized.includes("foundation") ||
    normalized.includes("cream") ||
    normalized.includes("serum") ||
    normalized.includes("perfume") ||
    normalized.includes("cosmetic") ||
    industry === "cosmetics"
  ) {
    if (normalized.includes("foundation")) return DEMO_PRODUCT_IMAGES["COS-FOUND"];
    if (normalized.includes("cream") || normalized.includes("lotion"))
      return DEMO_PRODUCT_IMAGES["COS-CREAM"];
    return DEMO_PRODUCT_IMAGES["COS-LIP"];
  }

  // 9. Bookstore & Stationery Keywords
  if (
    normalized.includes("physics") ||
    normalized.includes("math") ||
    normalized.includes("novel") ||
    normalized.includes("book") ||
    normalized.includes("nctb") ||
    normalized.includes("pen") ||
    normalized.includes("khata") ||
    normalized.includes("paper") ||
    normalized.includes("a4") ||
    industry === "bookstore" ||
    industry === "stationery"
  ) {
    if (normalized.includes("pen")) return DEMO_PRODUCT_IMAGES["ST-PEN"];
    if (normalized.includes("khata") || normalized.includes("exercise"))
      return DEMO_PRODUCT_IMAGES["ST-KHATA"];
    if (normalized.includes("paper") || normalized.includes("a4"))
      return DEMO_PRODUCT_IMAGES["ST-A4"];
    if (normalized.includes("novel") || normalized.includes("fiction"))
      return DEMO_PRODUCT_IMAGES["BK-NOVEL"];
    return DEMO_PRODUCT_IMAGES["BK-PHY10"];
  }

  // 10. Hardware & Building Materials Keywords
  if (
    normalized.includes("screw") ||
    normalized.includes("cable") ||
    normalized.includes("paint") ||
    normalized.includes("cement") ||
    normalized.includes("rod") ||
    normalized.includes("sand") ||
    industry === "hardware" ||
    industry === "building-materials"
  ) {
    if (normalized.includes("cable") || normalized.includes("wire"))
      return DEMO_PRODUCT_IMAGES["HW-CABLE"];
    if (normalized.includes("paint")) return DEMO_PRODUCT_IMAGES["HW-PAINT"];
    if (normalized.includes("cement")) return DEMO_PRODUCT_IMAGES["BM-CEMENT"];
    if (normalized.includes("rod") || normalized.includes("steel"))
      return DEMO_PRODUCT_IMAGES["BM-ROD"];
    if (normalized.includes("sand")) return DEMO_PRODUCT_IMAGES["BM-SAND"];
    return DEMO_PRODUCT_IMAGES["HW-SCREW"];
  }

  // 11. Optical & Surgical Keywords
  if (normalized.includes("frame") || normalized.includes("lens") || industry === "optical-shop") {
    if (normalized.includes("titanium") || normalized.includes("rimless"))
      return DEMO_PRODUCT_IMAGES["OP-002"];
    return DEMO_PRODUCT_IMAGES["OP-001"];
  }
  if (
    normalized.includes("glove") ||
    normalized.includes("mask") ||
    normalized.includes("forcep") ||
    normalized.includes("cannula") ||
    industry === "surgical-shop"
  ) {
    if (normalized.includes("mask")) return DEMO_PRODUCT_IMAGES["SG-SURG-002"];
    if (normalized.includes("forcep") || normalized.includes("cannula"))
      return DEMO_PRODUCT_IMAGES["SG-SURG-003"];
    return DEMO_PRODUCT_IMAGES["SG-SURG-001"];
  }

  // 12. Salon Services
  if (normalized.includes("haircut") || normalized.includes("facial") || normalized.includes("shampoo") || industry === "salon") {
    if (normalized.includes("facial")) return DEMO_PRODUCT_IMAGES["SALON-FC"];
    if (normalized.includes("shampoo")) return DEMO_PRODUCT_IMAGES["SALON-SH"];
    return DEMO_PRODUCT_IMAGES["SALON-HC"];
  }

  // 13. Rice Mill
  if (normalized.includes("miniket") || normalized.includes("nazirshail") || normalized.includes("chinigura") || industry === "rice-mill") {
    return DEMO_PRODUCT_IMAGES["GROC-001"];
  }

  // 14. Food & Restaurant (Dishes, Meals, Combos, Beverages)
  const isFoodItem =
    industry === "restaurant" ||
    normalized.includes("combo") ||
    normalized.includes("burger") ||
    normalized.includes("rice") ||
    normalized.includes("biryani") ||
    normalized.includes("khichuri") ||
    normalized.includes("friedrice") ||
    normalized.includes("chicken") ||
    normalized.includes("chaap") ||
    normalized.includes("jhal") ||
    normalized.includes("sandwich") ||
    normalized.includes("pasta") ||
    normalized.includes("chowmein") ||
    normalized.includes("noodle") ||
    normalized.includes("fries") ||
    normalized.includes("french fry") ||
    normalized.includes("luchi") ||
    normalized.includes("chola") ||
    normalized.includes("batora") ||
    normalized.includes("haleem") ||
    normalized.includes("soup") ||
    normalized.includes("meat box") ||
    normalized.includes("steak") ||
    normalized.includes("wings") ||
    normalized.includes("nati") ||
    normalized.includes("appetizer") ||
    normalized.includes("curry") ||
    normalized.includes("platter") ||
    normalized.includes("thali") ||
    normalized.includes("drink") ||
    normalized.includes("soda") ||
    normalized.includes("cola") ||
    normalized.includes("sprite") ||
    normalized.includes("water") ||
    normalized.includes("beverage");

  if (isFoodItem) {
    if (normalized.includes("student special")) return "/food-images/REST-EM-023.jpg";
    if (normalized.includes("regular combo")) return "/food-images/REST-EM-024.jpg";
    if (normalized.includes("superior combo")) return "/food-images/REST-EM-025.jpg";
    if (normalized.includes("nati")) return "/food-images/REST-EM-034.jpg";
    if (normalized.includes("mini burger") || (normalized.includes("burger") && normalized.includes("combo")))
      return "/food-images/REST-EM-015.jpg";
    if (normalized.includes("burger")) return "/food-images/EM-BGR-01.jpg";
    if (normalized.includes("meat box") || normalized.includes("box"))
      return "/food-images/EM-BOX-01.jpg";
    if (normalized.includes("combo")) return "/food-images/EM-BOX-02.jpg";
    if (normalized.includes("rice") || normalized.includes("biryani") || normalized.includes("khichuri") || normalized.includes("friedrice"))
      return "/food-images/EM-RICE-01.jpg";
    if (normalized.includes("chicken") || normalized.includes("chaap") || normalized.includes("fried") || normalized.includes("jhal") || normalized.includes("steak") || normalized.includes("wings"))
      return "/food-images/EM-FC-01.jpg";
    if (normalized.includes("sandwich") || normalized.includes("wrap") || normalized.includes("roll"))
      return "/food-images/EM-SW-01.jpg";
    if (normalized.includes("pasta") || normalized.includes("chowmein") || normalized.includes("noodle"))
      return "/food-images/EM-PST-01.jpg";
    if (normalized.includes("fry") || normalized.includes("fries"))
      return "/food-images/EM-FF-01.jpg";
    if (normalized.includes("drink") || normalized.includes("water") || normalized.includes("soda") || normalized.includes("cola") || normalized.includes("sprite") || normalized.includes("beverage"))
      return "/food-images/EM-DRK-01.jpg";
    if (normalized.includes("luchi") || normalized.includes("chola") || normalized.includes("haleem") || normalized.includes("soup") || normalized.includes("batora") || normalized.includes("appetizer"))
      return "/food-images/EM-APP-01.jpg";
    return "/food-images/EM-BOX-02.jpg";
  }

  // 15. Industry Default or Generic Premium Retail Fallback
  if (industry && INDUSTRY_DEFAULT_IMAGES[industry]) {
    return INDUSTRY_DEFAULT_IMAGES[industry];
  }

  // Clean, high quality generic retail item photo (NOT a burger, NOT for food)
  return "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80";
}
