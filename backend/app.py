import os
import io
import uuid
import sqlite3
import pandas as pd
from datetime import datetime
from PIL import Image
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import bcrypt

app = Flask(__name__)

# --- CORS: allow localhost in dev and the deployed frontend in production ---
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
CORS(app, origins=[FRONTEND_URL, "http://localhost:5173", "http://localhost:4173"])

# Configuration
# On Render, use the mounted persistent disk at /data; fallback to local for dev
_data_dir = "/data" if os.path.isdir("/data") else os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(_data_dir, "inventory.db")
UPLOAD_FOLDER = os.path.join(_data_dir, "uploads")
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

# Ensure uploads folder exists
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# --- DATABASE SETUP & HELPER FUNCTIONS ---
def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    
    # 1. Users Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT DEFAULT 'operator'
        )
    ''')
    
    # 2. Sessions Table (Stateful Auth)
    c.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
    # 3. Master Items Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            part_number TEXT UNIQUE NOT NULL,
            item_name TEXT NOT NULL,
            description TEXT,
            category TEXT,
            unit_of_measure TEXT DEFAULT 'pcs',
            image_path TEXT,
            min_stock INTEGER DEFAULT 10,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 4. Stock Location Balances Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS stock_balances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            part_number TEXT NOT NULL,
            warehouse TEXT NOT NULL,
            bin_location TEXT NOT NULL,
            quantity INTEGER DEFAULT 0,
            FOREIGN KEY(part_number) REFERENCES items(part_number) ON DELETE CASCADE,
            UNIQUE(part_number, warehouse, bin_location)
        )
    ''')
    
    # 5. Stock Journal Logs Table (Tracking user action audit trail)
    c.execute('''
        CREATE TABLE IF NOT EXISTS stock_journal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_number TEXT NOT NULL,
            transaction_type TEXT NOT NULL, -- 'ADDITION', 'DELETION', 'DEDUCTION', 'TRANSFER'
            part_number TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            from_warehouse TEXT,
            from_bin TEXT,
            to_warehouse TEXT,
            to_bin TEXT,
            user_name TEXT NOT NULL, -- Records user's full name
            remarks TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 6. Warehouses Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS warehouses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL
        )
    ''')

    # 7. Bins Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS bins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warehouse_id INTEGER NOT NULL,
            code TEXT NOT NULL,
            FOREIGN KEY(warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
            UNIQUE(warehouse_id, code)
        )
    ''')
    
    # Add indices for fast pagination over 25,000+ items
    c.execute("CREATE INDEX IF NOT EXISTS idx_items_part_number ON items(part_number)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_stock_balances_part_number ON stock_balances(part_number)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_stock_balances_location ON stock_balances(warehouse, bin_location)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_stock_journal_part_number ON stock_journal(part_number)")
    
    # Create default user if not exists (username: admin, password: password123)
    c.execute("SELECT id FROM users WHERE username = 'admin'")
    if not c.fetchone():
        hashed = bcrypt.hashpw("password123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        c.execute("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
                  ('admin', hashed, 'System Administrator', 'admin'))

    # Create default superadmin if not exists (username: superadmin, password: superadmin123)
    c.execute("SELECT id FROM users WHERE username = 'superadmin'")
    if not c.fetchone():
        hashed = bcrypt.hashpw("superadmin123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        c.execute("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
                  ('superadmin', hashed, 'Super Administrator', 'superadmin'))

    # Seed warehouses from stock_balances if empty
    c.execute("SELECT COUNT(*) FROM warehouses")
    if c.fetchone()[0] == 0:
        c.execute("SELECT DISTINCT warehouse FROM stock_balances")
        for row in c.fetchall():
            wh_code = row["warehouse"].strip() if row["warehouse"] else ""
            if wh_code:
                c.execute("INSERT OR IGNORE INTO warehouses (code, name) VALUES (?, ?)", (wh_code, f"{wh_code} Warehouse"))

    # Seed bins from stock_balances if empty
    c.execute("SELECT COUNT(*) FROM bins")
    if c.fetchone()[0] == 0:
        c.execute("SELECT DISTINCT warehouse, bin_location FROM stock_balances")
        for row in c.fetchall():
            wh_code = row["warehouse"].strip() if row["warehouse"] else ""
            bin_code = row["bin_location"].strip() if row["bin_location"] else ""
            if wh_code and bin_code:
                # Find warehouse ID
                c.execute("SELECT id FROM warehouses WHERE code = ?", (wh_code,))
                wh_id_row = c.fetchone()
                if wh_id_row:
                    wh_id = wh_id_row["id"]
                    c.execute("INSERT OR IGNORE INTO bins (warehouse_id, code) VALUES (?, ?)", (wh_id, bin_code))
        
    conn.commit()
    conn.close()

init_db()

# --- AUTHENTICATION DECORATOR ---
def get_current_user():
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT users.id, users.username, users.full_name, users.role 
        FROM sessions 
        JOIN users ON sessions.user_id = users.id 
        WHERE sessions.token = ?
    ''', (token,))
    user = c.fetchone()
    conn.close()
    
    if user:
        return {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"]
        }
    return None

def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Unauthorized access. Please login first."}), 401
        request.user = user
        return f(*args, **kwargs)
    return decorated

# Helper to generate unique sequential vouchers
def generate_voucher_number(prefix, transaction_date=None):
    if not transaction_date:
        transaction_date = datetime.now()
    date_str = transaction_date.strftime("%Y%m%d")
    
    conn = get_db_connection()
    c = conn.cursor()
    # Find how many vouchers we have for today
    c.execute("SELECT COUNT(*) FROM stock_journal WHERE voucher_number LIKE ?", (f"{prefix}-{date_str}-%",))
    count = c.fetchone()[0]
    conn.close()
    
    return f"{prefix}-{date_str}-{(count + 1):04d}"

# --- STATIC FILES ROUTE ---
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# --- AUTH ROUTES ---
@app.route('/api/auth/register', methods=['POST'])
@login_required
def register():
    if request.user["role"] != "superadmin":
        return jsonify({"error": "Unauthorized. Only superadmin can register new users."}), 403

    data = request.json
    if not data or not data.get("username") or not data.get("password") or not data.get("full_name"):
        return jsonify({"error": "Missing mandatory fields (username, password, full_name)"}), 400
    
    username = data["username"].strip().lower()
    password = data["password"]
    full_name = data["full_name"].strip()
    role = data.get("role", "operator").strip()
    
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    conn = get_db_connection()
    c = conn.cursor()
    try:
        c.execute("BEGIN TRANSACTION")
        c.execute("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
                  (username, hashed, full_name, role))
        
        # Log user creation in audit log (stock_journal)
        voucher = generate_voucher_number("USR-ADD")
        c.execute('''
            INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, user_name, remarks)
            VALUES (?, 'CREATION', 'N/A', 0, ?, ?)
        ''', (voucher, request.user["full_name"], f"Created user '{username}' with role '{role}'"))
        
        c.execute("COMMIT")
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Username already exists"}), 409
    except Exception as e:
        conn.close()
        return jsonify({"error": f"Failed to register user: {str(e)}"}), 500
    
    conn.close()
    return jsonify({"success": "Registration successful", "username": username}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    if not data or not data.get("username") or not data.get("password"):
        return jsonify({"error": "Missing username or password"}), 400
    
    username = data["username"].strip().lower()
    password = data["password"]
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = c.fetchone()
    
    if not user or not bcrypt.checkpw(password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        conn.close()
        return jsonify({"error": "Invalid username or password"}), 401
    
    # Generate Stateful Token
    token = str(uuid.uuid4())
    c.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user["id"]))
    conn.commit()
    conn.close()
    
    return jsonify({
        "token": token,
        "user": {
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"]
        }
    }), 200

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    auth_header = request.headers.get("Authorization")
    token = auth_header.split(" ")[1]
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()
    
    return jsonify({"success": "Logged out successfully"}), 200

@app.route('/api/auth/me', methods=['GET'])
@login_required
def get_me():
    return jsonify({"user": request.user}), 200

@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    if request.user["role"] != "superadmin":
        return jsonify({"error": "Unauthorized. Only superadmin can list users."}), 403
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, username, full_name, role FROM users ORDER BY username")
    rows = c.fetchall()
    conn.close()
    
    users = [dict(r) for r in rows]
    return jsonify(users), 200

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    if request.user["role"] != "superadmin":
        return jsonify({"error": "Unauthorized. Only superadmin can delete users."}), 403
    
    if request.user["id"] == user_id:
        return jsonify({"error": "You cannot delete your own superadmin account."}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    # Get user to delete
    c.execute("SELECT username, role FROM users WHERE id = ?", (user_id,))
    target_user = c.fetchone()
    if not target_user:
        conn.close()
        return jsonify({"error": "User not found."}), 404
        
    try:
        c.execute("BEGIN TRANSACTION")
        c.execute("DELETE FROM users WHERE id = ?", (user_id,))
        
        # Log user deletion in audit log (stock_journal)
        voucher = generate_voucher_number("USR-DEL")
        c.execute('''
            INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, user_name, remarks)
            VALUES (?, 'DELETION', 'N/A', 0, ?, ?)
        ''', (voucher, request.user["full_name"], f"Deleted user '{target_user['username']}' with role '{target_user['role']}'"))
        
        c.execute("COMMIT")
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({"error": f"Failed to delete user: {str(e)}"}), 500
        
    conn.close()
    return jsonify({"success": "User deleted successfully"}), 200

# --- INVENTORY CRUD ROUTES ---
@app.route('/api/inventory', methods=['GET'])
@login_required
def get_inventory():
    # Supports server-side pagination, sorting, filtering to handle 25,000+ items
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 10))
    search = request.args.get("search", "").strip()
    warehouse = request.args.get("warehouse", "").strip()
    bin_location = request.args.get("bin_location", "").strip()
    category = request.args.get("category", "").strip()
    sort_by = request.args.get("sort_by", "part_number")
    sort_dir = request.args.get("sort_dir", "ASC")
    
    offset = (page - 1) * limit
    
    conn = get_db_connection()
    c = conn.cursor()
    
    # Build query filter conditions
    conditions = []
    params = []
    
    if search:
        conditions.append("(items.part_number LIKE ? OR items.item_name LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if warehouse:
        conditions.append("stock_balances.warehouse = ?")
        params.append(warehouse)
    if bin_location:
        conditions.append("stock_balances.bin_location = ?")
        params.append(bin_location)
    if category:
        conditions.append("items.category = ?")
        params.append(category)
        
    where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
    
    # Sort Whitelist
    allowed_sorts = ["part_number", "item_name", "category", "total_quantity"]
    if sort_by not in allowed_sorts:
        sort_by = "part_number"
    if sort_dir.upper() not in ["ASC", "DESC"]:
        sort_dir = "ASC"
        
    # Query to fetch items and aggregate quantities across locations
    # Note: Using subqueries or LEFT JOIN to make sure we fetch total quantity
    query = f'''
        SELECT 
            items.id, 
            items.part_number, 
            items.item_name, 
            items.description, 
            items.category, 
            items.unit_of_measure, 
            items.image_path, 
            items.min_stock,
            IFNULL((SELECT SUM(quantity) FROM stock_balances WHERE stock_balances.part_number = items.part_number), 0) AS total_quantity
        FROM items
        {where_clause}
        ORDER BY {sort_by} {sort_dir}
        LIMIT ? OFFSET ?
    '''
    
    # Count Query
    count_query = f'''
        SELECT COUNT(DISTINCT items.id) 
        FROM items
        {"LEFT JOIN stock_balances ON items.part_number = stock_balances.part_number" if warehouse or bin_location else ""}
        {where_clause}
    '''
    
    c.execute(count_query, params)
    total_items = c.fetchone()[0]
    
    c.execute(query, params + [limit, offset])
    rows = c.fetchall()
    
    # Format rows
    items_list = []
    for r in rows:
        # Fetch locations breakdown for this item
        c.execute("SELECT warehouse, bin_location, quantity FROM stock_balances WHERE part_number = ?", (r["part_number"],))
        locs = [{"warehouse": l["warehouse"], "bin_location": l["bin_location"], "quantity": l["quantity"]} for l in c.fetchall()]
        
        items_list.append({
            "id": r["id"],
            "part_number": r["part_number"],
            "item_name": r["item_name"],
            "description": r["description"],
            "category": r["category"],
            "unit_of_measure": r["unit_of_measure"],
            "image_path": r["image_path"],
            "min_stock": r["min_stock"],
            "total_quantity": r["total_quantity"],
            "locations": locs
        })
        
    conn.close()
    
    return jsonify({
        "items": items_list,
        "total": total_items,
        "page": page,
        "limit": limit,
        "pages": (total_items + limit - 1) // limit
    }), 200

@app.route('/api/inventory/<part_number>', methods=['GET'])
@login_required
def get_item_by_part_number(part_number):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM items WHERE part_number = ?", (part_number,))
    item = c.fetchone()
    
    if not item:
        conn.close()
        return jsonify({"error": "Item not found"}), 404
        
    # Get Locations
    c.execute("SELECT warehouse, bin_location, quantity FROM stock_balances WHERE part_number = ?", (part_number,))
    locs = [{"warehouse": l["warehouse"], "bin_location": l["bin_location"], "quantity": l["quantity"]} for l in c.fetchall()]
    
    item_details = {
        "id": item["id"],
        "part_number": item["part_number"],
        "item_name": item["item_name"],
        "description": item["description"],
        "category": item["category"],
        "unit_of_measure": item["unit_of_measure"],
        "image_path": item["image_path"],
        "min_stock": item["min_stock"],
        "locations": locs
    }
    
    conn.close()
    return jsonify(item_details), 200

@app.route('/api/inventory', methods=['POST'])
@login_required
def add_inventory_item():
    # Handles multipart/form-data for image upload and details
    part_number = request.form.get("part_number", "").strip().upper()
    item_name = request.form.get("item_name", "").strip()
    description = request.form.get("description", "").strip()
    category = request.form.get("category", "").strip()
    unit_of_measure = request.form.get("unit_of_measure", "pcs").strip()
    min_stock = int(request.form.get("min_stock", 10))
    
    # Warehouse & quantity for initial stock addition (optional)
    warehouse = request.form.get("warehouse", "").strip()
    bin_location = request.form.get("bin_location", "").strip()
    quantity = request.form.get("quantity", "0")
    quantity = int(quantity) if quantity.isdigit() else 0
    
    if not part_number or not item_name:
        return jsonify({"error": "Part Number and Item Name are required fields"}), 400
        
    # Handle Image Upload
    image_file = request.files.get("image")
    image_path = None
    if image_file:
        file_ext = os.path.splitext(image_file.filename)[1].lower()
        if file_ext in ['.png', '.jpg', '.jpeg', '.webp']:
            unique_filename = f"{part_number}_{uuid.uuid4().hex}{file_ext}"
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            image_file.save(save_path)
            image_path = f"uploads/{unique_filename}"
            
    conn = get_db_connection()
    c = conn.cursor()
    
    try:
        c.execute("BEGIN TRANSACTION")
        
        # 1. Check if master item exists
        c.execute("SELECT image_path FROM items WHERE part_number = ?", (part_number,))
        existing_item = c.fetchone()
        
        if existing_item:
            # If item already exists, use existing picture if new one is not uploaded
            if not image_path:
                image_path = existing_item["image_path"]
            # Update master details
            c.execute('''
                UPDATE items 
                SET item_name = ?, description = ?, category = ?, unit_of_measure = ?, min_stock = ?, image_path = ?
                WHERE part_number = ?
            ''', (item_name, description, category, unit_of_measure, min_stock, image_path, part_number))
            
            # Log UPDATION in journal
            voucher_upd = generate_voucher_number("STJ-UPD")
            c.execute('''
                INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, user_name, remarks)
                VALUES (?, 'UPDATION', ?, 0, ?, ?)
            ''', (voucher_upd, part_number, request.user["full_name"], "Item master details updated"))
        else:
            # Insert master item
            c.execute('''
                INSERT INTO items (part_number, item_name, description, category, unit_of_measure, min_stock, image_path)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (part_number, item_name, description, category, unit_of_measure, min_stock, image_path))
            
            # Log CREATION in journal
            voucher_cre = generate_voucher_number("STJ-CRE")
            c.execute('''
                INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, user_name, remarks)
                VALUES (?, 'CREATION', ?, 0, ?, ?)
            ''', (voucher_cre, part_number, request.user["full_name"], "Item master catalog entry created"))
            
        # 2. Add stock balance if location specified
        if warehouse and bin_location and quantity > 0:
            c.execute('''
                INSERT INTO stock_balances (part_number, warehouse, bin_location, quantity)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(part_number, warehouse, bin_location) 
                DO UPDATE SET quantity = quantity + excluded.quantity
            ''', (part_number, warehouse, bin_location, quantity))
            
            # Log in Stock Journal (tagging logged-in user name)
            voucher = generate_voucher_number("STJ-ADD")
            c.execute('''
                INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, to_warehouse, to_bin, user_name, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (voucher, 'ADDITION', part_number, quantity, warehouse, bin_location, request.user["full_name"], "Initial stock addition"))
            
        c.execute("COMMIT")
        conn.commit()
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": f"Database write failed: {str(e)}"}), 500
        
    conn.close()
    return jsonify({"success": f"Stock item {part_number} saved successfully"}), 201

@app.route('/api/inventory/bulk', methods=['POST'])
@login_required
def bulk_addition():
    data = request.json
    if not data or not isinstance(data, list):
        return jsonify({"error": "Invalid payload format. Expected list of items."}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    success_count = 0
    errors = []
    
    try:
        c.execute("BEGIN TRANSACTION")
        voucher = generate_voucher_number("STJ-BULK")
        
        for idx, entry in enumerate(data):
            part_number = entry.get("part_number", "").strip().upper()
            item_name = entry.get("item_name", "").strip()
            warehouse = entry.get("warehouse", "").strip()
            bin_location = entry.get("bin_location", "").strip()
            quantity = int(entry.get("quantity", 0))
            category = entry.get("category", "Uncategorized").strip()
            unit_of_measure = entry.get("unit_of_measure", "pcs").strip()
            
            if not part_number or not item_name or not warehouse or not bin_location:
                errors.append(f"Row {idx+1}: Missing required fields.")
                continue
                
            # Insert master item metadata if not exists
            c.execute('''
                INSERT INTO items (part_number, item_name, category, unit_of_measure, min_stock)
                VALUES (?, ?, ?, ?, 10)
                ON CONFLICT(part_number) DO UPDATE SET item_name = excluded.item_name
            ''', (part_number, item_name, category, unit_of_measure))
            
            # Upsert stock balance
            c.execute('''
                INSERT INTO stock_balances (part_number, warehouse, bin_location, quantity)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(part_number, warehouse, bin_location) 
                DO UPDATE SET quantity = quantity + excluded.quantity
            ''', (part_number, warehouse, bin_location, quantity))
            
            # Log in Journal
            c.execute('''
                INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, to_warehouse, to_bin, user_name, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (voucher, 'ADDITION', part_number, quantity, warehouse, bin_location, request.user["full_name"], "Bulk additions import"))
            
            success_count += 1
            
        c.execute("COMMIT")
        conn.commit()
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": f"Bulk import failed: {str(e)}"}), 500
        
    conn.close()
    return jsonify({
        "success": f"Successfully imported {success_count} item locations",
        "errors": errors
    }), 200

@app.route('/api/inventory/<part_number>/location', methods=['DELETE'])
@login_required
def delete_location_stock(part_number):
    warehouse = request.args.get("warehouse", "").strip()
    bin_location = request.args.get("bin_location", "").strip()
    
    if not warehouse or not bin_location:
        return jsonify({"error": "Warehouse and Bin parameters are required"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    # Check current quantity
    c.execute("SELECT quantity FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
              (part_number, warehouse, bin_location))
    row = c.fetchone()
    
    if not row:
        conn.close()
        return jsonify({"error": "Stock location not found for this part number"}), 404
        
    qty = row["quantity"]
    
    try:
        c.execute("BEGIN TRANSACTION")
        
        # Delete location record
        c.execute("DELETE FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
                  (part_number, warehouse, bin_location))
        
        # Log DELETION in journal
        voucher = generate_voucher_number("STJ-DEL")
        c.execute('''
            INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, from_warehouse, from_bin, user_name, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (voucher, 'DELETION', part_number, qty, warehouse, bin_location, request.user["full_name"], "Location stock deleted permanently"))
        
        c.execute("COMMIT")
        conn.commit()
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": str(e)}), 500
        
    conn.close()
    return jsonify({"success": f"Location stock for item {part_number} deleted successfully"}), 200

# --- LOCATIONS API ---
@app.route('/api/locations', methods=['GET'])
@login_required
def get_locations():
    conn = get_db_connection()
    c = conn.cursor()
    
    # Query all warehouses and bins from master tables
    c.execute('''
        SELECT warehouses.code as warehouse, bins.code as bin_location 
        FROM warehouses 
        LEFT JOIN bins ON warehouses.id = bins.warehouse_id 
        ORDER BY warehouses.code, bins.code
    ''')
    rows = c.fetchall()
    
    locations = {}
    for r in rows:
        wh = r["warehouse"]
        bin_ = r["bin_location"]
        if wh not in locations:
            locations[wh] = []
        if bin_:
            locations[wh].append(bin_)
            
    conn.close()
    return jsonify(locations), 200

@app.route('/api/warehouses', methods=['GET'])
@login_required
def get_warehouses_list():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM warehouses ORDER BY code")
    rows = c.fetchall()
    result = [dict(r) for r in rows]
    conn.close()
    return jsonify(result), 200

@app.route('/api/warehouses', methods=['POST'])
@login_required
def create_warehouse():
    data = request.json
    if not data or not data.get("code") or not data.get("name"):
        return jsonify({"error": "Missing mandatory fields (code, name)"}), 400
    
    code = data["code"].strip().upper()
    name = data["name"].strip()
    
    conn = get_db_connection()
    c = conn.cursor()
    try:
        c.execute("BEGIN TRANSACTION")
        c.execute("INSERT INTO warehouses (code, name) VALUES (?, ?)", (code, name))
        
        # Log CREATION in audit log
        voucher = generate_voucher_number("WH-ADD")
        c.execute('''
            INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, user_name, remarks)
            VALUES (?, 'CREATION', 'N/A', 0, ?, ?)
        ''', (voucher, request.user["full_name"], f"Created Warehouse: {code} ({name})"))
        
        c.execute("COMMIT")
        conn.commit()
    except sqlite3.IntegrityError:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": f"Warehouse code '{code}' already exists"}), 409
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": f"Failed to create warehouse: {str(e)}"}), 500
    
    conn.close()
    return jsonify({"success": "Warehouse created successfully", "code": code}), 201

@app.route('/api/bins', methods=['GET'])
@login_required
def get_bins_list():
    warehouse_id = request.args.get("warehouse_id")
    conn = get_db_connection()
    c = conn.cursor()
    if warehouse_id:
        c.execute('''
            SELECT bins.*, warehouses.code as warehouse_code 
            FROM bins 
            JOIN warehouses ON bins.warehouse_id = warehouses.id 
            WHERE bins.warehouse_id = ? 
            ORDER BY bins.code
        ''', (warehouse_id,))
    else:
        c.execute('''
            SELECT bins.*, warehouses.code as warehouse_code 
            FROM bins 
            JOIN warehouses ON bins.warehouse_id = warehouses.id 
            ORDER BY warehouses.code, bins.code
        ''')
    rows = c.fetchall()
    result = [dict(r) for r in rows]
    conn.close()
    return jsonify(result), 200

@app.route('/api/bins', methods=['POST'])
@login_required
def create_bin():
    data = request.json
    if not data or not data.get("warehouse_id") or not data.get("code"):
        return jsonify({"error": "Missing mandatory fields (warehouse_id, code)"}), 400
    
    warehouse_id = int(data["warehouse_id"])
    code = data["code"].strip().upper()
    
    conn = get_db_connection()
    c = conn.cursor()
    
    # Check if warehouse exists
    c.execute("SELECT code FROM warehouses WHERE id = ?", (warehouse_id,))
    wh_row = c.fetchone()
    if not wh_row:
        conn.close()
        return jsonify({"error": "Warehouse does not exist"}), 404
        
    wh_code = wh_row["code"]
        
    try:
        c.execute("BEGIN TRANSACTION")
        c.execute("INSERT INTO bins (warehouse_id, code) VALUES (?, ?)", (warehouse_id, code))
        
        # Log CREATION in audit log
        voucher = generate_voucher_number("BIN-ADD")
        c.execute('''
            INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, user_name, remarks)
            VALUES (?, 'CREATION', 'N/A', 0, ?, ?)
        ''', (voucher, request.user["full_name"], f"Created Bin: {code} in Warehouse {wh_code}"))
        
        c.execute("COMMIT")
        conn.commit()
    except sqlite3.IntegrityError:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": f"Bin '{code}' already exists in this warehouse"}), 409
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": f"Failed to create bin: {str(e)}"}), 500
    
    conn.close()
    return jsonify({"success": "Bin created successfully", "code": code}), 201

# --- STOCK TRANSFER JOURNAL API ---
@app.route('/api/transfers', methods=['POST'])
@login_required
def post_transfer():
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    part_number = data.get("part_number", "").strip().upper()
    from_warehouse = data.get("from_warehouse", "").strip()
    from_bin = data.get("from_bin", "").strip()
    to_warehouse = data.get("to_warehouse", "").strip()
    to_bin = data.get("to_bin", "").strip()
    quantity = int(data.get("quantity", 0))
    remarks = data.get("remarks", "Stock Transfer").strip()
    
    if not part_number or not from_warehouse or not from_bin or not to_warehouse or not to_bin or quantity <= 0:
        return jsonify({"error": "Missing or invalid transfer fields. All fields are required."}), 400
        
    if from_warehouse == to_warehouse and from_bin == to_bin:
        return jsonify({"error": "Destination location cannot be the same as the source location"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    # Validate stock availability at source
    c.execute("SELECT quantity FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?",
              (part_number, from_warehouse, from_bin))
    source_row = c.fetchone()
    
    if not source_row or source_row["quantity"] < quantity:
        conn.close()
        return jsonify({"error": f"Insufficient quantity available at {from_warehouse} ({from_bin}). Available: {source_row['quantity'] if source_row else 0}"}), 400
        
    try:
        c.execute("BEGIN TRANSACTION")
        
        # 1. Update/Delete Source Stock
        new_source_qty = source_row["quantity"] - quantity
        if new_source_qty == 0:
            c.execute("DELETE FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
                      (part_number, from_warehouse, from_bin))
        else:
            c.execute("UPDATE stock_balances SET quantity = ? WHERE part_number = ? AND warehouse = ? AND bin_location = ?",
                      (new_source_qty, part_number, from_warehouse, from_bin))
                      
        # 2. Update/Insert Destination Stock
        c.execute("SELECT quantity FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?",
                  (part_number, to_warehouse, to_bin))
        dest_row = c.fetchone()
        
        if dest_row:
            c.execute("UPDATE stock_balances SET quantity = ? WHERE part_number = ? AND warehouse = ? AND bin_location = ?",
                      (dest_row["quantity"] + quantity, part_number, to_warehouse, to_bin))
        else:
            c.execute("INSERT INTO stock_balances (part_number, warehouse, bin_location, quantity) VALUES (?, ?, ?, ?)",
                      (part_number, to_warehouse, to_bin, quantity))
                      
        # 3. Write Stock Journal (Voucher)
        voucher = generate_voucher_number("STJ-TRF")
        c.execute('''
            INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, from_warehouse, from_bin, to_warehouse, to_bin, user_name, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (voucher, 'TRANSFER', part_number, quantity, from_warehouse, from_bin, to_warehouse, to_bin, request.user["full_name"], remarks))
        
        c.execute("COMMIT")
        conn.commit()
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": f"Transfer failed: {str(e)}"}), 500
        
    conn.close()
    return jsonify({"success": f"Stock transferred successfully. Voucher: {voucher}", "voucher": voucher}), 200

@app.route('/api/transfers', methods=['GET'])
@login_required
def get_transfer_history():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT stock_journal.*, items.item_name 
        FROM stock_journal 
        LEFT JOIN items ON stock_journal.part_number = items.part_number
        WHERE transaction_type = 'TRANSFER' 
        ORDER BY timestamp DESC
    ''')
    rows = c.fetchall()
    
    transfers = [dict(r) for r in rows]
    conn.close()
    return jsonify(transfers), 200

# --- DAILY EXCEL DEDUCTION API ---
@app.route('/api/deductions/excel', methods=['POST'])
@login_required
def upload_deduction_excel():
    excel_file = request.files.get("file")
    if not excel_file:
        return jsonify({"error": "No file uploaded"}), 400
        
    file_ext = os.path.splitext(excel_file.filename)[1].lower()
    if file_ext not in ['.xlsx', '.xls', '.csv']:
        return jsonify({"error": "Unsupported file format. Please upload Excel (.xlsx/.xls) or CSV"}), 400
        
    try:
        if file_ext == '.csv':
            df = pd.read_csv(excel_file)
        else:
            df = pd.read_excel(excel_file)
    except Exception as e:
        return jsonify({"error": f"Failed to parse file: {str(e)}"}), 400
        
    # Clean Column headers
    df.columns = [col.strip().lower() for col in df.columns]
    
    # Column mapping (support both 'part number', 'part_number', 'sku' and 'qty', 'quantity')
    part_col = None
    qty_col = None
    
    for col in df.columns:
        if 'part' in col or 'sku' in col:
            part_col = col
            break
    for col in df.columns:
        if 'qty' in col or 'quantity' in col:
            qty_col = col
            break
            
    if not part_col or not qty_col:
        return jsonify({"error": "Invalid spreadsheet schema. Must contain columns mapping to 'Part Number' and 'Quantity'"}), 400
        
    # Perform all-or-nothing check (Pass 1: Validation)
    errors = []
    deductions_to_process = []
    
    conn = get_db_connection()
    c = conn.cursor()
    
    for idx, row in df.iterrows():
        part = str(row[part_col]).strip().upper()
        raw_qty = row[qty_col]
        
        # Check blank rows
        if not part or part == "NAN":
            continue
            
        try:
            qty = int(raw_qty)
        except (ValueError, TypeError):
            errors.append(f"Row {idx+2}: Invalid quantity format '{raw_qty}' for item {part}")
            continue
            
        if qty <= 0:
            errors.append(f"Row {idx+2}: Quantity for item {part} must be greater than 0")
            continue
            
        # Verify master item exists
        c.execute("SELECT item_name FROM items WHERE part_number = ?", (part,))
        item_row = c.fetchone()
        if not item_row:
            errors.append(f"Row {idx+2}: Part number '{part}' does not exist in master catalog")
            continue
            
        # Verify sufficient quantity across all warehouses
        c.execute("SELECT SUM(quantity) FROM stock_balances WHERE part_number = ?", (part,))
        avail_qty_sum = c.fetchone()[0] or 0
        
        if avail_qty_sum < qty:
            errors.append(f"Row {idx+2}: Insufficient inventory for part '{part}'. Required: {qty}, Available: {avail_qty_sum}")
            continue
            
        deductions_to_process.append({"part_number": part, "quantity": qty, "item_name": item_row["item_name"]})
        
    if errors:
        conn.close()
        # Return HTTP 422 to show validation errors on UI
        return jsonify({"validation_errors": errors}), 422
        
    # All rows validated! Pass 2: Execute deductions
    success_deductions = []
    try:
        c.execute("BEGIN TRANSACTION")
        voucher = generate_voucher_number("STJ-DED")
        
        for item in deductions_to_process:
            part = item["part_number"]
            deduct_qty = item["quantity"]
            item_name = item["item_name"]
            
            # Fetch all stock bins for this item ordered by quantity descending
            c.execute("SELECT id, warehouse, bin_location, quantity FROM stock_balances WHERE part_number = ? ORDER BY quantity DESC", (part,))
            bins = c.fetchall()
            
            remaining_to_deduct = deduct_qty
            for bin_row in bins:
                bin_id = bin_row["id"]
                wh = bin_row["warehouse"]
                bin_loc = bin_row["bin_location"]
                avail_qty = bin_row["quantity"]
                
                if remaining_to_deduct <= 0:
                    break
                    
                if avail_qty >= remaining_to_deduct:
                    # Deduct full remaining from this bin
                    new_qty = avail_qty - remaining_to_deduct
                    if new_qty == 0:
                        c.execute("DELETE FROM stock_balances WHERE id = ?", (bin_id,))
                    else:
                        c.execute("UPDATE stock_balances SET quantity = ? WHERE id = ?", (new_qty, bin_id))
                    
                    # Log deduction in journal
                    c.execute('''
                        INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, from_warehouse, from_bin, user_name, remarks)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (voucher, 'DEDUCTION', part, remaining_to_deduct, wh, bin_loc, request.user["full_name"], "Daily Excel upload deduction"))
                    
                    remaining_to_deduct = 0
                else:
                    # Deduct whatever is available and clear the bin
                    c.execute("DELETE FROM stock_balances WHERE id = ?", (bin_id,))
                    
                    c.execute('''
                        INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, from_warehouse, from_bin, user_name, remarks)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (voucher, 'DEDUCTION', part, avail_qty, wh, bin_loc, request.user["full_name"], "Daily Excel upload deduction"))
                    
                    remaining_to_deduct -= avail_qty
                    
            success_deductions.append({"part_number": part, "quantity": deduct_qty, "item_name": item_name})
            
        c.execute("COMMIT")
        conn.commit()
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": f"Excel stock deduction transaction failed: {str(e)}"}), 500
        
    conn.close()
    return jsonify({
        "success": f"Deduction completed successfully. Voucher: {voucher}",
        "voucher": voucher,
        "deducted_items": success_deductions
    }), 200

# --- RECONCILIATION UPLOAD HELPER & API ---
def clean_warehouse(text):
    """Extract warehouse code and name from strings like:
    - 'WH05-Warehouse 05- DIS-5'  -> code='WH05', name='Warehouse 05- DIS-5'
    - 'WH02-Warehouse 02'         -> code='WH02', name='Warehouse 02'
    - '[] Primary' or '□ Primary' -> code='PRIMARY', name='Primary Warehouse'
    - 'Show Room'                 -> code='SHOWROOM', name='Show Room'
    """
    import re
    text = text.strip()
    if not text:
        return 'UNKNOWN', 'Unknown Warehouse'
    # Strip leading non-ASCII / checkbox symbols (□, ☐, ■, etc.) and []
    text = re.sub(r'^[\[\]□☐■\s]+', '', text).strip()
    if not text:
        return 'UNKNOWN', 'Unknown Warehouse'
    # Handle special [] prefix notation that remained
    if text.startswith("[]"):
        text = text.replace("[]", "").strip()
    # If it has a dash, the first segment is the warehouse code
    if "-" in text:
        parts = text.split("-", 1)
        code = parts[0].strip().upper()
        name = parts[1].strip()
        return code, f"{code} - {name}"
    # Otherwise use the whole string as code (replace spaces)
    code = text.replace(" ", "").upper()
    return code, text

@app.route('/api/inventory/reconciliation', methods=['POST'])
@login_required
def upload_reconciliation_excel():
    excel_file = request.files.get("file")
    if not excel_file:
        return jsonify({"error": "No file uploaded"}), 400
        
    file_ext = os.path.splitext(excel_file.filename)[1].lower()
    if file_ext not in ['.xlsx', '.xls', '.csv']:
        return jsonify({"error": "Unsupported file format. Please upload Excel (.xlsx/.xls) or CSV"}), 400
        
    try:
        if file_ext == '.csv':
            df = pd.read_csv(excel_file, header=None)
        else:
            df = pd.read_excel(excel_file, header=None)
    except Exception as e:
        return jsonify({"error": f"Failed to parse file: {str(e)}"}), 400
        
    errors = []
    reconciliations_to_process = []
    last_part_number = None
    last_item_name = None
    
    for idx, row in df.iterrows():
        if len(row) < 6:
            continue
            
        val_A = str(row[0]).strip() if pd.notna(row[0]) else ""
        val_B = str(row[1]).strip() if pd.notna(row[1]) else ""
        val_D = str(row[3]).strip() if pd.notna(row[3]) else ""
        val_E = str(row[4]).strip() if pd.notna(row[4]) else ""
        val_F = str(row[5]).strip() if pd.notna(row[5]) else ""
        
        # A detail row must have D (bin), E (warehouse) and F (quantity) non-empty
        if not val_D or not val_E or not val_F:
            continue
            
        # Ignore headers/summaries
        if "particulars" in val_A.lower() or "closing balance" in val_D.lower() or "grand total" in val_A.lower():
            continue
            
        # Ignore summary parent rows (they have '(' in Col A summary lines)
        if '(' in val_A:
            continue
        
        # Determine Part Number - use carry-forward for merged/empty cells
        if val_A and val_A.lower() not in ('nan', ''):
            # Extract just the numeric/alphanumeric part number (first token)
            candidate = val_A.split()[0].upper()
            # Only update if it looks like a real part number (not a header text)
            if candidate and not any(kw in candidate.lower() for kw in ['total', 'balance', 'particular', 'summary']):
                last_part_number = candidate
                if val_B and val_B.lower() != 'nan':
                    last_item_name = val_B
        
        if not last_part_number:
            continue  # Skip if we never got a valid part number
            
        part_number = last_part_number
        item_name = val_B if (val_B and val_B.lower() != 'nan') else (last_item_name or part_number)
        bin_code = val_D.upper()
        
        # Clean Warehouse
        wh_code, wh_name = clean_warehouse(val_E)
        
        # Parse Quantity
        qty_parts = val_F.split()
        if not qty_parts:
            errors.append(f"Row {idx+1}: Missing quantity value.")
            continue
            
        try:
            qty_val = float(qty_parts[0])
            qty = int(qty_val)
        except (ValueError, TypeError):
            errors.append(f"Row {idx+1}: Invalid quantity format '{qty_parts[0]}' for item {part_number}")
            continue
            
        if qty < 0:
            errors.append(f"Row {idx+1}: Quantity for item {part_number} cannot be negative.")
            continue
            
        unit_of_measure = qty_parts[1].strip() if len(qty_parts) > 1 else "pcs"
        
        reconciliations_to_process.append({
            "part_number": part_number,
            "item_name": item_name,
            "bin_code": bin_code,
            "wh_code": wh_code,
            "wh_name": wh_name,
            "quantity": qty,
            "unit_of_measure": unit_of_measure,
            "row_num": idx + 1
        })
        
    if not reconciliations_to_process:
        if not errors:
            return jsonify({"error": "No valid stock detail rows were identified in the spreadsheet. Please verify that the sheet matches the required format."}), 400
            
    if errors:
        return jsonify({"validation_errors": errors}), 422
        
    # Transactional update
    conn = get_db_connection()
    c = conn.cursor()
    
    success_count = 0
    created_warehouses = []
    created_bins = []
    
    try:
        c.execute("BEGIN TRANSACTION")
        
        # Clear existing stock balances for full reconciliation
        c.execute("DELETE FROM stock_balances")
        
        voucher = generate_voucher_number("STJ-RCN")
        
        for entry in reconciliations_to_process:
            part_number = entry["part_number"]
            item_name = entry["item_name"]
            bin_code = entry["bin_code"]
            wh_code = entry["wh_code"]
            wh_name = entry["wh_name"]
            quantity = entry["quantity"]
            unit_of_measure = entry["unit_of_measure"]
            
            # 1. Upsert Warehouse
            c.execute("SELECT id FROM warehouses WHERE code = ?", (wh_code,))
            wh_row = c.fetchone()
            if not wh_row:
                c.execute("INSERT INTO warehouses (code, name) VALUES (?, ?)", (wh_code, wh_name))
                wh_id = c.lastrowid
                created_warehouses.append(wh_code)
                
                # Log Warehouse Creation in Journal
                c.execute('''
                    INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, user_name, remarks)
                    VALUES (?, 'CREATION', 'N/A', 0, ?, ?)
                ''', (voucher, request.user["full_name"], f"Auto-created Warehouse '{wh_code}' ({wh_name}) during Excel reconciliation"))
            else:
                wh_id = wh_row["id"]
                
            # 2. Upsert Bin
            c.execute("SELECT id FROM bins WHERE warehouse_id = ? AND code = ?", (wh_id, bin_code))
            bin_row = c.fetchone()
            if not bin_row:
                c.execute("INSERT INTO bins (warehouse_id, code) VALUES (?, ?)", (wh_id, bin_code))
                created_bins.append(f"{wh_code}-{bin_code}")
                
                # Log Bin Creation in Journal
                c.execute('''
                    INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, user_name, remarks)
                    VALUES (?, 'CREATION', 'N/A', 0, ?, ?)
                ''', (voucher, request.user["full_name"], f"Auto-created Bin '{bin_code}' in Warehouse '{wh_code}' during Excel reconciliation"))
                
            # 3. Upsert Item catalog details
            c.execute("INSERT INTO items (part_number, item_name, unit_of_measure, min_stock) VALUES (?, ?, ?, 10) "
                      "ON CONFLICT(part_number) DO UPDATE SET item_name = excluded.item_name, unit_of_measure = excluded.unit_of_measure",
                      (part_number, item_name, unit_of_measure))
            
            # 4. Insert stock balance
            c.execute("INSERT INTO stock_balances (part_number, warehouse, bin_location, quantity) VALUES (?, ?, ?, ?)"
                      "ON CONFLICT(part_number, warehouse, bin_location) DO UPDATE SET quantity = quantity + excluded.quantity",
                      (part_number, wh_code, bin_code, quantity))
                      
            # 5. Log in Stock Journal (as ADDITION)
            c.execute('''
                INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, to_warehouse, to_bin, user_name, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (voucher, 'ADDITION', part_number, quantity, wh_code, bin_code, request.user["full_name"], "Inventory reconciliation upload"))
            
            success_count += 1
            
        c.execute("COMMIT")
        conn.commit()
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": f"Database transaction failed during reconciliation: {str(e)}"}), 500
        
    conn.close()
    return jsonify({
        "success": f"Inventory reconciliation completed successfully. Loaded {success_count} item locations.",
        "voucher": voucher,
        "item_count": success_count,
        "created_warehouses": list(set(created_warehouses)),
        "created_bins": list(set(created_bins))
    }), 200

# --- REPORTS & ALERTS API ---
@app.route('/api/reports/stock', methods=['GET'])
@login_required
def get_stock_report():
    group_by = request.args.get("group_by", "item").strip() # 'item', 'warehouse', 'bin'
    
    conn = get_db_connection()
    c = conn.cursor()
    
    if group_by == 'warehouse':
        c.execute('''
            SELECT warehouse, SUM(quantity) as total_quantity, COUNT(DISTINCT part_number) as distinct_skus
            FROM stock_balances
            GROUP BY warehouse
            ORDER BY total_quantity DESC
        ''')
        report = [dict(r) for r in rows] if (rows := c.fetchall()) else []
    elif group_by == 'bin':
        c.execute('''
            SELECT warehouse, bin_location, SUM(quantity) as total_quantity
            FROM stock_balances
            GROUP BY warehouse, bin_location
            ORDER BY warehouse, bin_location
        ''')
        report = [dict(r) for r in rows] if (rows := c.fetchall()) else []
    else: # item
        c.execute('''
            SELECT items.part_number, items.item_name, items.category, 
                   IFNULL(SUM(stock_balances.quantity), 0) as total_quantity
            FROM items
            LEFT JOIN stock_balances ON items.part_number = stock_balances.part_number
            GROUP BY items.part_number
            ORDER BY total_quantity DESC
        ''')
        report = [dict(r) for r in rows] if (rows := c.fetchall()) else []
        
    conn.close()
    return jsonify(report), 200

@app.route('/api/reports/dead-stock', methods=['GET'])
@login_required
def get_dead_stock():
    # Dead stock defined as items with 0 stock level, or items with no transfer/deduction logs in past 30 days.
    conn = get_db_connection()
    c = conn.cursor()
    
    # 1. Fetch items with total stock = 0
    c.execute('''
        SELECT items.part_number, items.item_name, items.category, 0 as total_quantity,
               'Zero Quantity' as reason
        FROM items
        WHERE NOT EXISTS (
            SELECT 1 FROM stock_balances WHERE stock_balances.part_number = items.part_number AND stock_balances.quantity > 0
        )
    ''')
    zero_stock_items = [dict(r) for r in c.fetchall()]
    
    # 2. Fetch items that have stock but have NO movements in stock_journal in last 30 days
    thirty_days_ago = datetime.now()
    # Format for sqlite date check
    c.execute('''
        SELECT items.part_number, items.item_name, items.category, 
               (SELECT SUM(quantity) FROM stock_balances WHERE stock_balances.part_number = items.part_number) as total_quantity,
               'No Movement in 30 Days' as reason
        FROM items
        WHERE EXISTS (
            SELECT 1 FROM stock_balances WHERE stock_balances.part_number = items.part_number AND stock_balances.quantity > 0
        )
        AND NOT EXISTS (
            SELECT 1 FROM stock_journal 
            WHERE stock_journal.part_number = items.part_number 
            AND datetime(stock_journal.timestamp) >= datetime('now', '-30 days')
        )
    ''')
    no_movement_items = [dict(r) for r in c.fetchall()]
    
    dead_stock = zero_stock_items + no_movement_items
    conn.close()
    
    return jsonify(dead_stock), 200

@app.route('/api/reports/alerts', methods=['GET'])
@login_required
def get_stock_alerts():
    conn = get_db_connection()
    c = conn.cursor()
    
    # Low stock alerts: Total stock quantity < minimum stock configured
    c.execute('''
        SELECT items.part_number, items.item_name, items.min_stock,
               IFNULL(SUM(stock_balances.quantity), 0) as total_quantity
        FROM items
        LEFT JOIN stock_balances ON items.part_number = stock_balances.part_number
        GROUP BY items.part_number
        HAVING total_quantity < items.min_stock
        ORDER BY total_quantity ASC
    ''')
    low_stock = [dict(r) for r in c.fetchall()]
    
    # Negative stock: Stock levels < 0 (should not happen normally but alert if any)
    c.execute('''
        SELECT part_number, warehouse, bin_location, quantity
        FROM stock_balances
        WHERE quantity < 0
    ''')
    negative_stock = [dict(r) for r in c.fetchall()]
    
    conn.close()
    return jsonify({
        "low_stock": low_stock,
        "negative_stock": negative_stock
    }), 200

@app.route('/api/reports/movement', methods=['GET'])
@login_required
def get_movement_history():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT stock_journal.*, items.item_name 
        FROM stock_journal
        LEFT JOIN items ON stock_journal.part_number = items.part_number
        ORDER BY timestamp DESC
        LIMIT 100
    ''')
    rows = c.fetchall()
    history = [dict(r) for r in rows]
    conn.close()
    return jsonify(history), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
