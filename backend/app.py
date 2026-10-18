import os
import io
import uuid
import sqlite3
import pandas as pd
from datetime import datetime
from PIL import Image
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_cors import CORS
import json
import bcrypt
app = Flask(__name__, static_folder='../frontend/dist', static_url_path='/')
# --- CORS: allow localhost, 127.0.0.1, LAN IPs, and deployed domains ---
CORS(app, resources={r"/*": {"origins": "*"}}, allow_headers=["Content-Type", "Authorization", "X-Requested-With"])

@app.after_request
def after_request_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
    return response

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
            role TEXT DEFAULT 'operator',
            warehouse_code TEXT,
            menu_access TEXT
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
            item_type TEXT DEFAULT 'non food',
            batch_no TEXT DEFAULT '',
            expiry TEXT DEFAULT '',
            selling_price REAL DEFAULT 0.0,
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
            batch_no TEXT DEFAULT '',
            expiry TEXT DEFAULT '',
            FOREIGN KEY(part_number) REFERENCES items(part_number) ON DELETE CASCADE,
            UNIQUE(part_number, warehouse, bin_location, batch_no)
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
    
    # 8. Customers Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT UNIQUE NOT NULL,
            cr_cash TEXT NOT NULL,
            location TEXT NOT NULL,
            salesman TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # 9. Picklists Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS picklists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            status TEXT DEFAULT 'Pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
    ''')

    # 10. Picklist Items Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS picklist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            picklist_id INTEGER NOT NULL,
            part_number TEXT NOT NULL,
            warehouse TEXT NOT NULL,
            bin_location TEXT NOT NULL,
            required_quantity INTEGER NOT NULL,
            FOREIGN KEY(picklist_id) REFERENCES picklists(id) ON DELETE CASCADE,
            FOREIGN KEY(part_number) REFERENCES items(part_number) ON DELETE CASCADE
        )
    ''')
    # 11. Notifications Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_role TEXT,
            target_user_id INTEGER,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            related_entity_type TEXT,
            related_entity_id INTEGER,
            is_read BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 12. Dispatch Picklists Table (The new Picklist feature)
    c.execute('''
        CREATE TABLE IF NOT EXISTS dispatch_picklists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            invoice_number TEXT UNIQUE,
            status TEXT DEFAULT 'Created',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            qc_approved_by TEXT,
            qc_approved_at TIMESTAMP,
            FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
    ''')

    # 13. Dispatch Picklist Items Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS dispatch_picklist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dispatch_picklist_id INTEGER NOT NULL,
            part_number TEXT NOT NULL,
            warehouse TEXT NOT NULL,
            bin_location TEXT,
            batch_no TEXT,
            expiry TEXT,
            quantity INTEGER NOT NULL,
            qc_verified BOOLEAN DEFAULT 0,
            FOREIGN KEY(dispatch_picklist_id) REFERENCES dispatch_picklists(id) ON DELETE CASCADE
        )
    ''')

    # 14. Internal Transfer Requests Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS internal_transfer_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tr_number TEXT UNIQUE NOT NULL,
            source_warehouse TEXT NOT NULL,
            status TEXT DEFAULT 'Draft',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 15. Internal Transfer Request Items Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS internal_transfer_request_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            part_number TEXT NOT NULL,
            item_name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            source_bin TEXT NOT NULL,
            FOREIGN KEY(request_id) REFERENCES internal_transfer_requests(id) ON DELETE CASCADE
        )
    ''')
    
    # Add indices for fast pagination over 25,000+ items
    c.execute("CREATE INDEX IF NOT EXISTS idx_items_part_number ON items(part_number)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_stock_balances_part_number ON stock_balances(part_number)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_stock_balances_location ON stock_balances(warehouse, bin_location)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_stock_journal_part_number ON stock_journal(part_number)")
    
    # Ensure columns exist in case the table was created previously without them
    c.execute("PRAGMA table_info(items)")
    columns = [row[1] for row in c.fetchall()]
    if "item_type" not in columns:
        c.execute("ALTER TABLE items ADD COLUMN item_type TEXT DEFAULT 'non food'")
    if "batch_no" not in columns:
        c.execute("ALTER TABLE items ADD COLUMN batch_no TEXT DEFAULT ''")
    if "expiry" not in columns:
        c.execute("ALTER TABLE items ADD COLUMN expiry TEXT DEFAULT ''")
    if "selling_price" not in columns:
        c.execute("ALTER TABLE items ADD COLUMN selling_price REAL DEFAULT 0.0")

    # Ensure columns exist in picklists
    c.execute("PRAGMA table_info(picklists)")
    picklist_columns = [row[1] for row in c.fetchall()]
    if "transfer_status" not in picklist_columns:
        c.execute("ALTER TABLE picklists ADD COLUMN transfer_status TEXT DEFAULT 'Pending Transfer Decision'")
    if "transfer_rejection_reason" not in picklist_columns:
        c.execute("ALTER TABLE picklists ADD COLUMN transfer_rejection_reason TEXT")
    if "invoice_number" not in picklist_columns:
        c.execute("ALTER TABLE picklists ADD COLUMN invoice_number TEXT")
        
    # Ensure columns exist in picklist_items
    c.execute("PRAGMA table_info(picklist_items)")
    pi_columns = [row[1] for row in c.fetchall()]
    if "transfer_status" not in pi_columns:
        c.execute("ALTER TABLE picklist_items ADD COLUMN transfer_status TEXT DEFAULT 'Pending'")
    if "transfer_rejection_reason" not in pi_columns:
        c.execute("ALTER TABLE picklist_items ADD COLUMN transfer_rejection_reason TEXT")
    if "actual_warehouse" not in pi_columns:
        c.execute("ALTER TABLE picklist_items ADD COLUMN actual_warehouse TEXT")
    if "actual_bin_location" not in pi_columns:
        c.execute("ALTER TABLE picklist_items ADD COLUMN actual_bin_location TEXT")

    # Ensure columns exist in dispatch_picklists
    c.execute("PRAGMA table_info(dispatch_picklists)")
    dp_columns = [row[1] for row in c.fetchall()]
    if "invoice_number" not in dp_columns:
        c.execute("ALTER TABLE dispatch_picklists ADD COLUMN invoice_number TEXT")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_picklists_invoice ON dispatch_picklists(invoice_number) WHERE invoice_number IS NOT NULL")
    if "qc_approved_by" not in dp_columns:
        c.execute("ALTER TABLE dispatch_picklists ADD COLUMN qc_approved_by TEXT")
    if "qc_approved_at" not in dp_columns:
        c.execute("ALTER TABLE dispatch_picklists ADD COLUMN qc_approved_at TIMESTAMP")

    # Ensure columns exist in dispatch_picklist_items
    c.execute("PRAGMA table_info(dispatch_picklist_items)")
    dpi_columns = [row[1] for row in c.fetchall()]
    if "qc_verified" not in dpi_columns:
        c.execute("ALTER TABLE dispatch_picklist_items ADD COLUMN qc_verified BOOLEAN DEFAULT 0")

    # Ensure columns exist in users
    c.execute("PRAGMA table_info(users)")
    users_columns = [row[1] for row in c.fetchall()]
    if "menu_access" not in users_columns:
        c.execute("ALTER TABLE users ADD COLUMN menu_access TEXT")

    # Migrate stock_balances to support unique batches per location
    c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_balances'")
    sb_table_row = c.fetchone()
    if sb_table_row:
        table_sql = sb_table_row[0]
        if "UNIQUE(part_number, warehouse, bin_location)" in table_sql.replace(" ", "") or "UNIQUE(part_number,warehouse,bin_location)" in table_sql.replace(" ", ""):
            # Recreate table with UNIQUE(part_number, warehouse, bin_location, batch_no)
            c.execute('''
                CREATE TABLE IF NOT EXISTS stock_balances_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    part_number TEXT NOT NULL,
                    warehouse TEXT NOT NULL,
                    bin_location TEXT NOT NULL,
                    quantity INTEGER DEFAULT 0,
                    batch_no TEXT DEFAULT '',
                    expiry TEXT DEFAULT '',
                    FOREIGN KEY(part_number) REFERENCES items(part_number) ON DELETE CASCADE,
                    UNIQUE(part_number, warehouse, bin_location, batch_no)
                )
            ''')
            # Copy existing data
            c.execute('''
                INSERT INTO stock_balances_new (id, part_number, warehouse, bin_location, quantity, batch_no, expiry)
                SELECT sb.id, sb.part_number, sb.warehouse, sb.bin_location, sb.quantity, 
                       IFNULL(i.batch_no, ''), IFNULL(i.expiry, '')
                FROM stock_balances sb
                LEFT JOIN items i ON sb.part_number = i.part_number
            ''')
            # Drop old table
            c.execute("DROP TABLE stock_balances")
            # Rename new table
            c.execute("ALTER TABLE stock_balances_new RENAME TO stock_balances")
            
    # Always ensure batch_no and expiry columns exist in stock_balances
    c.execute("PRAGMA table_info(stock_balances)")
    sb_cols = [row[1] for row in c.fetchall()]
    if "batch_no" not in sb_cols:
        c.execute("ALTER TABLE stock_balances ADD COLUMN batch_no TEXT DEFAULT ''")
    if "expiry" not in sb_cols:
        c.execute("ALTER TABLE stock_balances ADD COLUMN expiry TEXT DEFAULT ''")

    # Ensure all NULL values are empty strings
    c.execute("UPDATE items SET batch_no = '' WHERE batch_no IS NULL")
    c.execute("UPDATE items SET expiry = '' WHERE expiry IS NULL")
    c.execute("UPDATE stock_balances SET batch_no = '' WHERE batch_no IS NULL")
    c.execute("UPDATE stock_balances SET expiry = '' WHERE expiry IS NULL")

    # Ensure columns exist in internal_transfer_requests
    c.execute("PRAGMA table_info(internal_transfer_requests)")
    itr_cols = [row[1] for row in c.fetchall()]
    if "destination_warehouse" not in itr_cols:
        c.execute("ALTER TABLE internal_transfer_requests ADD COLUMN destination_warehouse TEXT")
    if "created_by" not in itr_cols:
        c.execute("ALTER TABLE internal_transfer_requests ADD COLUMN created_by TEXT")
    if "approved_by" not in itr_cols:
        c.execute("ALTER TABLE internal_transfer_requests ADD COLUMN approved_by TEXT")
    if "approved_at" not in itr_cols:
        c.execute("ALTER TABLE internal_transfer_requests ADD COLUMN approved_at TIMESTAMP")
    if "remarks" not in itr_cols:
        c.execute("ALTER TABLE internal_transfer_requests ADD COLUMN remarks TEXT")

    # Ensure columns exist in internal_transfer_request_items
    c.execute("PRAGMA table_info(internal_transfer_request_items)")
    itri_cols = [row[1] for row in c.fetchall()]
    if "target_bin" not in itri_cols:
        c.execute("ALTER TABLE internal_transfer_request_items ADD COLUMN target_bin TEXT")
    if "accepted_bin" not in itri_cols:
        c.execute("ALTER TABLE internal_transfer_request_items ADD COLUMN accepted_bin TEXT")
    if "batch_no" not in itri_cols:
        c.execute("ALTER TABLE internal_transfer_request_items ADD COLUMN batch_no TEXT DEFAULT ''")
    if "expiry" not in itri_cols:
        c.execute("ALTER TABLE internal_transfer_request_items ADD COLUMN expiry TEXT DEFAULT ''")

    c.execute("PRAGMA table_info(users)")
    user_cols = [row[1] for row in c.fetchall()]
    if "warehouse_code" not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN warehouse_code TEXT")


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
        SELECT users.id, users.username, users.full_name, users.role, users.warehouse_code, users.menu_access 
        FROM sessions 
        JOIN users ON sessions.user_id = users.id 
        WHERE sessions.token = ?
    ''', (token,))
    user = c.fetchone()
    conn.close()
    
    if user:
        import json
        return {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "warehouse_code": user["warehouse_code"],
            "menu_access": json.loads(user["menu_access"]) if user["menu_access"] else None
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
    warehouse_code = data.get("warehouse_code", "").strip() if role == "warehouse_admin" else None
    
    import json
    menu_access = json.dumps(data.get("menu_access")) if data.get("menu_access") else None
    
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    conn = get_db_connection()
    c = conn.cursor()
    try:
        c.execute("BEGIN TRANSACTION")
        c.execute("INSERT INTO users (username, password_hash, full_name, role, warehouse_code, menu_access) VALUES (?, ?, ?, ?, ?, ?)",
                  (username, hashed, full_name, role, warehouse_code, menu_access))
        
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
    
    import json
    return jsonify({
        "token": token,
        "user": {
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "warehouse_code": user["warehouse_code"],
            "menu_access": json.loads(user["menu_access"]) if user["menu_access"] else None
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
    c.execute("SELECT id, username, full_name, role, warehouse_code, menu_access FROM users ORDER BY username")
    rows = c.fetchall()
    conn.close()
    
    import json
    users = []
    for r in rows:
        u = dict(r)
        if u["menu_access"]:
            u["menu_access"] = json.loads(u["menu_access"])
        users.append(u)
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
    
    c.execute("SELECT username, role FROM users WHERE id = ?", (user_id,))
    target_user = c.fetchone()
    if not target_user:
        conn.close()
        return jsonify({"error": "User not found."}), 404
        
    if target_user["username"].lower() == "superadmin":
        conn.close()
        return jsonify({"error": "The root superadmin account cannot be deleted."}), 403
        
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

@app.route('/api/users/<int:user_id>', methods=['PUT'])
@login_required
def update_user(user_id):
    if request.user["role"] != "superadmin":
        return jsonify({"error": "Unauthorized. Only superadmin can edit users."}), 403
    
    data = request.json
    import json
    
    full_name = data.get("full_name", "").strip()
    username = data.get("username", "").strip().lower()
    role = data.get("role", "operator").strip()
    warehouse_code = data.get("warehouse_code", "").strip() if role == "warehouse_admin" else None
    menu_access = json.dumps(data.get("menu_access")) if data.get("menu_access") else None
    password = data.get("password")
    
    if not username or not full_name:
        return jsonify({"error": "Username and full name are required."}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    c.execute("SELECT username FROM users WHERE id = ?", (user_id,))
    target_user = c.fetchone()
    if target_user and target_user["username"].lower() == "superadmin":
        if username.lower() != "superadmin" or role != "superadmin":
            conn.close()
            return jsonify({"error": "The root superadmin account's username and role cannot be changed."}), 403
            
    try:
        if password:
            hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            c.execute('''
                UPDATE users 
                SET full_name = ?, username = ?, role = ?, warehouse_code = ?, menu_access = ?, password_hash = ?
                WHERE id = ?
            ''', (full_name, username, role, warehouse_code, menu_access, hashed, user_id))
        else:
            c.execute('''
                UPDATE users 
                SET full_name = ?, username = ?, role = ?, warehouse_code = ?, menu_access = ?
                WHERE id = ?
            ''', (full_name, username, role, warehouse_code, menu_access, user_id))
            
        # Log user update
        voucher = generate_voucher_number("USR-EDT")
        c.execute('''
            INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, user_name, remarks)
            VALUES (?, 'UPDATE', 'N/A', 0, ?, ?)
        ''', (voucher, request.user["full_name"], f"Updated user '{username}' (ID: {user_id})"))
        
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Username already exists."}), 409
    except Exception as e:
        conn.close()
        return jsonify({"error": f"Failed to update user: {str(e)}"}), 500
        
    conn.close()
    return jsonify({"success": "User updated successfully"}), 200

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
        
    sort_column = sort_by if sort_by == "total_quantity" else f"items.{sort_by}"
    
    if sort_dir.upper() not in ["ASC", "DESC"]:
        sort_dir = "ASC"
        
    join_clause = "LEFT JOIN stock_balances ON items.part_number = stock_balances.part_number" if warehouse or bin_location else ""
    
    # Query to fetch items and aggregate quantities across locations
    # Note: Using subqueries or LEFT JOIN to make sure we fetch total quantity
    query = f'''
        SELECT DISTINCT
            items.id, 
            items.part_number, 
            items.item_name, 
            items.description, 
            items.category, 
            items.unit_of_measure, 
            items.image_path, 
            items.min_stock,
            items.item_type,
            items.batch_no,
            items.expiry,
            items.selling_price,
            IFNULL((SELECT SUM(quantity) FROM stock_balances WHERE stock_balances.part_number = items.part_number), 0) AS total_quantity
        FROM items
        {join_clause}
        {where_clause}
        ORDER BY {sort_column} {sort_dir}
        LIMIT ? OFFSET ?
    '''
    
    # Count Query
    count_query = f'''
        SELECT COUNT(DISTINCT items.id) 
        FROM items
        {join_clause}
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
        c.execute("SELECT warehouse, bin_location, quantity, batch_no, expiry FROM stock_balances WHERE part_number = ?", (r["part_number"],))
        locs = [{
            "warehouse": l["warehouse"], 
            "bin_location": l["bin_location"], 
            "quantity": l["quantity"],
            "batch_no": l["batch_no"] or '',
            "expiry": l["expiry"] or ''
        } for l in c.fetchall()]
        
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
            "locations": locs,
            "item_type": r["item_type"],
            "batch_no": r["batch_no"],
            "expiry": r["expiry"],
            "selling_price": r["selling_price"]
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
    c.execute("SELECT warehouse, bin_location, quantity, batch_no, expiry FROM stock_balances WHERE part_number = ?", (part_number,))
    locs = [{
        "warehouse": l["warehouse"], 
        "bin_location": l["bin_location"], 
        "quantity": l["quantity"],
        "batch_no": l["batch_no"] or '',
        "expiry": l["expiry"] or ''
    } for l in c.fetchall()]
    
    item_details = {
        "id": item["id"],
        "part_number": item["part_number"],
        "item_name": item["item_name"],
        "description": item["description"],
        "category": item["category"],
        "unit_of_measure": item["unit_of_measure"],
        "image_path": item["image_path"],
        "min_stock": item["min_stock"],
        "locations": locs,
        "item_type": item["item_type"],
        "batch_no": item["batch_no"],
        "expiry": item["expiry"],
        "selling_price": item["selling_price"]
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
    
    item_type = request.form.get("item_type", "non food").strip().lower()
    batch_no = request.form.get("batch_no", "").strip()
    expiry = request.form.get("expiry", "").strip()
    
    try:
        selling_price = float(request.form.get("selling_price", "0.0") or 0.0)
    except (ValueError, TypeError):
        selling_price = 0.0
    
    # Warehouse & quantity for initial stock addition (optional)
    warehouse = request.form.get("warehouse", "").strip()
    bin_location = request.form.get("bin_location", "").strip()
    quantity = request.form.get("quantity", "0")
    quantity = int(quantity) if quantity.isdigit() else 0
    
    if not part_number or not item_name:
        return jsonify({"error": "Part Number and Item Name are required fields"}), 400
        
    if item_type == "food":
        if not batch_no:
            return jsonify({"error": "Batch No is required for food items"}), 400
        if not expiry:
            return jsonify({"error": "Expiry date is required for food items"}), 400
            
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
                SET item_name = ?, description = ?, category = ?, unit_of_measure = ?, min_stock = ?, image_path = ?, item_type = ?, batch_no = ?, expiry = ?, selling_price = ?
                WHERE part_number = ?
            ''', (item_name, description, category, unit_of_measure, min_stock, image_path, item_type, 
                  batch_no if item_type == "food" else '', expiry if item_type == "food" else '', selling_price, part_number))
            
            # Log UPDATION in journal
            voucher_upd = generate_voucher_number("STJ-UPD")
            c.execute('''
                INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, user_name, remarks)
                VALUES (?, 'UPDATION', ?, 0, ?, ?)
            ''', (voucher_upd, part_number, request.user["full_name"], "Item master details updated"))
        else:
            # Insert master item
            c.execute('''
                INSERT INTO items (part_number, item_name, description, category, unit_of_measure, min_stock, image_path, item_type, batch_no, expiry, selling_price)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (part_number, item_name, description, category, unit_of_measure, min_stock, image_path, item_type,
                  batch_no if item_type == "food" else '', expiry if item_type == "food" else '', selling_price))
            
            # Log CREATION in journal
            voucher_cre = generate_voucher_number("STJ-CRE")
            c.execute('''
                INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, user_name, remarks)
                VALUES (?, 'CREATION', ?, 0, ?, ?)
            ''', (voucher_cre, part_number, request.user["full_name"], "Item master catalog entry created"))
            
        # 2. Add stock balance if location specified
        if warehouse and bin_location and quantity > 0:
            c.execute('''
                INSERT INTO stock_balances (part_number, warehouse, bin_location, quantity, batch_no, expiry)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(part_number, warehouse, bin_location, batch_no) 
                DO UPDATE SET quantity = quantity + excluded.quantity
            ''', (part_number, warehouse, bin_location, quantity,
                  batch_no if item_type == "food" else '',
                  expiry if item_type == "food" else ''))
            
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
                INSERT INTO stock_balances (part_number, warehouse, bin_location, quantity, batch_no, expiry)
                VALUES (?, ?, ?, ?, '', '')
                ON CONFLICT(part_number, warehouse, bin_location, batch_no) 
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
    batch_no = request.args.get("batch_no", "").strip()
    
    if not warehouse or not bin_location:
        return jsonify({"error": "Warehouse and Bin parameters are required"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    # Check current quantity
    if batch_no:
        c.execute("SELECT quantity FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ? AND batch_no = ?", 
                  (part_number, warehouse, bin_location, batch_no))
    else:
        c.execute("SELECT SUM(quantity) as quantity FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
                  (part_number, warehouse, bin_location))
    row = c.fetchone()
    
    if not row or row["quantity"] is None:
        conn.close()
        return jsonify({"error": "Stock location not found for this part number"}), 404
        
    qty = row["quantity"]
    
    try:
        c.execute("BEGIN TRANSACTION")
        
        # Delete location record
        if batch_no:
            c.execute("DELETE FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ? AND batch_no = ?", 
                      (part_number, warehouse, bin_location, batch_no))
        else:
            c.execute("DELETE FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
                      (part_number, warehouse, bin_location))
        
        # Log DELETION in journal
        voucher = generate_voucher_number("STJ-DEL")
        c.execute('''
            INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, from_warehouse, from_bin, user_name, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (voucher, 'DELETION', part_number, qty, warehouse, bin_location, request.user["full_name"], f"Location stock deleted permanently (batch: {batch_no})"))
        
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

    tr_number = data.get("tr_number")
    conn = get_db_connection()
    c = conn.cursor()
    if tr_number:
        c.execute("SELECT status FROM internal_transfer_requests WHERE tr_number = ?", (tr_number,))
        row = c.fetchone()
        if not row:
            conn.close()
            return jsonify({"error": f"Transfer Request {tr_number} not found."}), 404
        if row['status'] == 'Completed':
            conn.close()
            return jsonify({"error": f"Transfer Request {tr_number} has already been posted."}), 400
    conn.close()
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
        

        if tr_number:
            c.execute("UPDATE internal_transfer_requests SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE tr_number = ?", (tr_number,))
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
        raw_part = row[part_col]
        if pd.notna(raw_part):
            if isinstance(raw_part, (int, float)):
                part = str(int(raw_part)).strip().upper()
            else:
                part = str(raw_part).strip().upper()
                if part.endswith('.0'):
                    part = part[:-2]
        else:
            part = ''
            
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
            c.execute("INSERT INTO stock_balances (part_number, warehouse, bin_location, quantity, batch_no, expiry) VALUES (?, ?, ?, ?, '', '')"
                      "ON CONFLICT(part_number, warehouse, bin_location, batch_no) DO UPDATE SET quantity = quantity + excluded.quantity",
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
    warehouse = request.args.get("warehouse", "").strip()
    
    conn = get_db_connection()
    c = conn.cursor()
    
    where_clause = "WHERE stock_balances.warehouse = ?" if warehouse else ""
    params = (warehouse,) if warehouse else ()
    
    if group_by == 'warehouse':
        c.execute(f'''
            SELECT warehouse, SUM(quantity) as total_quantity, COUNT(DISTINCT part_number) as distinct_skus
            FROM stock_balances
            {where_clause}
            GROUP BY warehouse
            ORDER BY total_quantity DESC
        ''', params)
        report = [dict(r) for r in rows] if (rows := c.fetchall()) else []
    elif group_by == 'bin':
        c.execute(f'''
            SELECT warehouse, bin_location, SUM(quantity) as total_quantity
            FROM stock_balances
            {where_clause}
            GROUP BY warehouse, bin_location
            ORDER BY warehouse, bin_location
        ''', params)
        report = [dict(r) for r in rows] if (rows := c.fetchall()) else []
    else: # item
        c.execute(f'''
            SELECT items.part_number, items.item_name, items.category, 
                   IFNULL(SUM(stock_balances.quantity), 0) as total_quantity
            FROM items
            LEFT JOIN stock_balances ON items.part_number = stock_balances.part_number
            {where_clause}
            GROUP BY items.part_number
            ORDER BY total_quantity DESC
        ''', params)
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
    warehouse = request.args.get("warehouse", "").strip()
    conn = get_db_connection()
    c = conn.cursor()
    
    # Low stock alerts: Total stock quantity < minimum stock configured
    if warehouse:
        c.execute('''
            SELECT items.part_number, items.item_name, items.min_stock,
                   IFNULL(SUM(stock_balances.quantity), 0) as total_quantity
            FROM items
            LEFT JOIN stock_balances ON items.part_number = stock_balances.part_number AND stock_balances.warehouse = ?
            GROUP BY items.part_number
            HAVING total_quantity < items.min_stock
            ORDER BY total_quantity ASC
        ''', (warehouse,))
    else:
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
    if warehouse:
        c.execute('''
            SELECT part_number, warehouse, bin_location, quantity
            FROM stock_balances
            WHERE quantity < 0 AND warehouse = ?
        ''', (warehouse,))
    else:
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

@app.route('/api/inventory/upload', methods=['POST'])
@login_required
def upload_excel_inventory():
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        return jsonify({"error": "Only Excel (.xlsx, .xls) files are supported."}), 400
        
    try:
        # Read the file
        file_bytes = file.read()
        df = pd.read_excel(io.BytesIO(file_bytes))
        
        # Clean column names to be case-insensitive and stripped
        df.columns = [str(c).strip() for c in df.columns]
        
        # Map required columns
        col_mappings = {
            'group': ['group', 'category', 'item group'],
            'part_number': ['part number', 'part_number', 'sku', 'item code', 'code'],
            'item_name': ['item name', 'item_name', 'product name', 'description', 'name'],
            'location': ['location', 'warehouse', 'bin'],
            'location_stock': ['location stock', 'location_stock', 'stock', 'qty', 'quantity', 'balance'],
            'selling_price': ['selling price', 'selling_price', 'price', 'rate']
        }
        
        def find_col(keys):
            for key in keys:
                for col in df.columns:
                    if col.lower() == key.lower():
                        return col
            return None
            
        group_col = find_col(col_mappings['group'])
        part_number_col = find_col(col_mappings['part_number'])
        item_name_col = find_col(col_mappings['item_name'])
        location_col = find_col(col_mappings['location'])
        location_stock_col = find_col(col_mappings['location_stock'])
        selling_price_col = find_col(col_mappings['selling_price'])
        
        if not part_number_col or not item_name_col:
            return jsonify({"error": "The Excel sheet must contain 'Part Number' and 'Item Name' columns."}), 400
            
        conn = get_db_connection()
        c = conn.cursor()
        
        success_count = 0
        errors = []
        
        def parse_location(loc_str):
            loc_str = str(loc_str).strip()
            if not loc_str or loc_str.lower() == 'nan':
                return 'MAIN', 'DEFAULT'
            if '-' in loc_str:
                parts = [p.strip() for p in loc_str.split('-', 1)]
                if len(parts) == 2 and parts[0] and parts[1]:
                    return parts[0], parts[1]
            elif ' ' in loc_str:
                parts = [p.strip() for p in loc_str.split(' ', 1)]
                if len(parts) == 2 and parts[0] and parts[1]:
                    return parts[0], parts[1]
            return loc_str, 'DEFAULT'
            
        def generate():
            conn = get_db_connection()
            c = conn.cursor()
            c.execute("BEGIN TRANSACTION")
            voucher = generate_voucher_number("STJ-BULK-XLS")
            
            success_count = 0
            errors = []
            total_rows = len(df)
            
            try:
                for idx, row in df.iterrows():
                    # Send progress update every max(1, total_rows//50) rows
                    if idx % max(1, total_rows // 50) == 0:
                        progress = int((idx / total_rows) * 100)
                        yield json.dumps({"progress": progress}) + "\n"
                        
                    raw_part = row[part_number_col]
                    if pd.notna(raw_part):
                        if isinstance(raw_part, (int, float)):
                            part_number = str(int(raw_part)).strip().upper()
                        else:
                            part_number = str(raw_part).strip().upper()
                            if part_number.endswith('.0'):
                                part_number = part_number[:-2]
                    else:
                        part_number = ''
                        
                    item_name = str(row[item_name_col]).strip() if pd.notna(row[item_name_col]) else ''
                    
                    if not part_number or part_number.lower() == 'nan' or not item_name or item_name.lower() == 'nan':
                        errors.append(f"Row {idx+2}: Missing Part Number or Item Name.")
                        continue
                        
                    group = str(row[group_col]).strip() if (group_col and pd.notna(row[group_col])) else 'Uncategorized'
                    if group.lower() == 'nan':
                        group = 'Uncategorized'
                        
                    selling_price = 0.0
                    if selling_price_col and pd.notna(row[selling_price_col]):
                        try:
                            selling_price = float(row[selling_price_col])
                        except ValueError:
                            pass
                            
                    location_val = str(row[location_col]).strip() if (location_col and pd.notna(row[location_col])) else 'MAIN'
                    wh_code, bin_code = parse_location(location_val)
                    
                    quantity = 0
                    if location_stock_col and pd.notna(row[location_stock_col]):
                        try:
                            quantity = int(float(row[location_stock_col]))
                        except ValueError:
                            pass
                    
                    # 1. Upsert Item
                    c.execute('''
                        INSERT INTO items (part_number, item_name, category, unit_of_measure, min_stock, item_type, batch_no, expiry, selling_price)
                        VALUES (?, ?, ?, 'pcs', 10, 'non food', '', '', ?)
                        ON CONFLICT(part_number) 
                        DO UPDATE SET item_name = excluded.item_name, category = excluded.category, selling_price = excluded.selling_price
                    ''', (part_number, item_name, group, selling_price))
                    
                    # 2. Upsert stock_balances if quantity specified
                    if quantity > 0:
                        # 2.1 Upsert Warehouse master
                        c.execute("SELECT id FROM warehouses WHERE code = ?", (wh_code,))
                        wh_row = c.fetchone()
                        if not wh_row:
                            c.execute("INSERT INTO warehouses (code, name) VALUES (?, ?)", (wh_code, f"{wh_code} Warehouse"))
                            wh_id = c.lastrowid
                        else:
                            wh_id = wh_row["id"]
                            
                        # 2.2 Upsert Bin master
                        c.execute("SELECT id FROM bins WHERE warehouse_id = ? AND code = ?", (wh_id, bin_code))
                        bin_row = c.fetchone()
                        if not bin_row:
                            c.execute("INSERT INTO bins (warehouse_id, code) VALUES (?, ?)", (wh_id, bin_code))
                        
                        # 2.3 Upsert stock balance record
                        c.execute('''
                            INSERT INTO stock_balances (part_number, warehouse, bin_location, quantity, batch_no, expiry)
                            VALUES (?, ?, ?, ?, '', '')
                            ON CONFLICT(part_number, warehouse, bin_location, batch_no) 
                            DO UPDATE SET quantity = quantity + excluded.quantity
                        ''', (part_number, wh_code, bin_code, quantity))
                        
                        # 2.4 Log addition in journal
                        c.execute('''
                            INSERT INTO stock_journal (voucher_number, transaction_type, part_number, quantity, to_warehouse, to_bin, user_name, remarks)
                            VALUES (?, 'ADDITION', ?, ?, ?, ?, ?, 'Excel Bulk Upload Import')
                        ''', (voucher, part_number, quantity, wh_code, bin_code, request.user["full_name"]))
                        
                    success_count += 1
                    
                c.execute("COMMIT")
                conn.commit()
                yield json.dumps({
                    "progress": 100,
                    "success": f"Successfully processed {success_count} item rows",
                    "errors": errors
                }) + "\n"
                
            except Exception as e:
                c.execute("ROLLBACK")
                yield json.dumps({"error": f"Failed to process Excel file: {str(e)}"}) + "\n"
            finally:
                conn.close()

        return Response(stream_with_context(generate()), mimetype='application/x-ndjson')

    except Exception as e:
        return jsonify({"error": f"Failed to process request: {str(e)}"}), 500

# --- CUSTOMERS API ROUTES ---

@app.route('/api/customers', methods=['GET'])
@login_required
def get_customers():
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM customers ORDER BY created_at DESC")
        customers = [dict(row) for row in c.fetchall()]
        conn.close()
        return jsonify(customers), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/customers', methods=['POST'])
@login_required
def create_customer():
    try:
        data = request.json
        customer_name = data.get('customer_name', '').strip()
        cr_cash = data.get('cr_cash', '').strip()
        location = data.get('location', '').strip()
        salesman = data.get('salesman', '').strip()

        if not customer_name:
            return jsonify({"error": "Customer Name is required"}), 400

        conn = get_db_connection()
        c = conn.cursor()
        c.execute('''
            INSERT INTO customers (customer_name, cr_cash, location, salesman)
            VALUES (?, ?, ?, ?)
        ''', (customer_name, cr_cash, location, salesman))
        conn.commit()
        customer_id = c.lastrowid
        conn.close()
        return jsonify({"success": "Customer created successfully", "id": customer_id}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Customer already exists"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/customers/<int:id>', methods=['PUT'])
@login_required
def update_customer(id):
    try:
        data = request.json
        customer_name = data.get('customer_name', '').strip()
        cr_cash = data.get('cr_cash', '').strip()
        location = data.get('location', '').strip()
        salesman = data.get('salesman', '').strip()

        if not customer_name:
            return jsonify({"error": "Customer Name is required"}), 400

        conn = get_db_connection()
        c = conn.cursor()
        
        c.execute("SELECT id FROM customers WHERE customer_name = ? AND id != ?", (customer_name, id))
        if c.fetchone():
            conn.close()
            return jsonify({"error": "Customer name already exists"}), 400
            
        c.execute('''
            UPDATE customers
            SET customer_name = ?, cr_cash = ?, location = ?, salesman = ?
            WHERE id = ?
        ''', (customer_name, cr_cash, location, salesman, id))
        
        if c.rowcount == 0:
            conn.close()
            return jsonify({"error": "Customer not found"}), 404
            
        conn.commit()
        conn.close()
        
        return jsonify({"success": "Customer updated successfully"}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/customers/bulk', methods=['POST'])
@login_required
def upload_customers_bulk():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
            
        if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls') or file.filename.endswith('.csv')):
            return jsonify({"error": "Only Excel (.xlsx, .xls) or CSV files are allowed"}), 400
            
        filename = f"{uuid.uuid4().hex}_{file.filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
            
        if df.empty:
            return jsonify({"error": "Uploaded file is empty"}), 400
            
        os.remove(filepath)
        
        df.columns = df.columns.str.strip().str.upper()
        
        col_name = next((col for col in df.columns if 'NAME' in col or 'CUSTOMER' in col), None)
        col_cr_cash = next((col for col in df.columns if 'CR/CASH' in col or 'CR' in col or 'CASH' in col), None)
        col_location = next((col for col in df.columns if 'LOCATION' in col), None)
        col_salesman = next((col for col in df.columns if 'SALESMAN' in col), None)
        
        if not col_name:
            return jsonify({"error": "Could not find Customer Name column in file"}), 400
            
        conn = get_db_connection()
        c = conn.cursor()
        
        success_count = 0
        errors = []
        
        for index, row in df.iterrows():
            customer_name = str(row[col_name]).strip() if pd.notna(row[col_name]) else ''
            cr_cash = str(row[col_cr_cash]).strip() if col_cr_cash and pd.notna(row[col_cr_cash]) else 'CR'
            location = str(row[col_location]).strip() if col_location and pd.notna(row[col_location]) else 'DUBAI'
            salesman = str(row[col_salesman]).strip() if col_salesman and pd.notna(row[col_salesman]) else 'ISAMAIL'
            
            if not customer_name or customer_name.lower() == 'nan':
                continue
                
            try:
                c.execute('''
                    INSERT INTO customers (customer_name, cr_cash, location, salesman)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(customer_name) DO UPDATE SET
                        cr_cash=excluded.cr_cash,
                        location=excluded.location,
                        salesman=excluded.salesman
                ''', (customer_name, cr_cash, location, salesman))
                success_count += 1
            except Exception as e:
                errors.append(f"Row {index+2}: {str(e)}")
                
        conn.commit()
        conn.close()
        
        return jsonify({
            "success": f"Successfully processed {success_count} customers",
            "errors": errors
        }), 200
        
    except Exception as e:
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500

# --- PICKLISTS API ROUTES ---

@app.route('/api/picklists', methods=['POST'])
@login_required
def create_picklist():
    data = request.json
    customer_id = data.get('customer_id')
    invoice_number = data.get('invoice_number')
    if invoice_number == '':
        invoice_number = None
    items = data.get('items', [])
    
    if not customer_id:
        return jsonify({"error": "Customer is required"}), 400
    
    if not items or len(items) == 0:
        return jsonify({"error": "At least one item is required in the picklist"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()

    if invoice_number:
        c.execute("SELECT id FROM picklists WHERE invoice_number = ?", (invoice_number,))
        if c.fetchone():
            conn.close()
            return jsonify({"error": f"A Transfer Request for invoice number '{invoice_number}' already exists."}), 400
    
    try:
        # Check if customer exists
        c.execute("SELECT id FROM customers WHERE id = ?", (customer_id,))
        if not c.fetchone():
            conn.close()
            return jsonify({"error": "Invalid customer selected"}), 400
            
        c.execute("BEGIN TRANSACTION")
        
        # 1. Create Picklist Record
        c.execute("INSERT INTO picklists (customer_id, invoice_number, status) VALUES (?, ?, ?)", (customer_id, invoice_number, 'Pending'))
        picklist_id = c.lastrowid
        
        # 2. Process each item and validate stock
        warehouses_involved = set()
        for item in items:
            part_number = item.get('part_number')
            warehouse = item.get('warehouse')
            if warehouse:
                warehouses_involved.add(warehouse)
            bin_location = item.get('bin_location')
            required_quantity = item.get('required_quantity', 0)
            
            try:
                required_quantity = int(required_quantity)
            except ValueError:
                c.execute("ROLLBACK")
                conn.close()
                return jsonify({"error": f"Invalid quantity for {part_number}"}), 400
                
            if required_quantity <= 0:
                c.execute("ROLLBACK")
                conn.close()
                return jsonify({"error": f"Quantity must be greater than 0 for {part_number}"}), 400
                
            # Backend Validation: Check available quantity
            if bin_location is None:
                c.execute("SELECT quantity FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location IS NULL", 
                          (part_number, warehouse))
            else:
                c.execute("SELECT quantity FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
                          (part_number, warehouse, bin_location))
            stock = c.fetchone()
            
            if not stock:
                c.execute("ROLLBACK")
                conn.close()
                return jsonify({"error": f"Stock not found for {part_number} at {warehouse} - {bin_location}"}), 400
                
            available_qty = stock['quantity']
            if required_quantity > available_qty:
                c.execute("ROLLBACK")
                conn.close()
                return jsonify({"error": f"Required quantity ({required_quantity}) exceeds available ({available_qty}) for {part_number} at {warehouse} - {bin_location}"}), 400
                
            item_status = 'Possible' if warehouse == 'DIS' else 'Pending'
            # Insert into picklist_items
            c.execute('''
                INSERT INTO picklist_items (picklist_id, part_number, warehouse, bin_location, required_quantity, transfer_status)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (picklist_id, part_number, warehouse, bin_location, required_quantity, item_status))
            
            # NOTE: If we wanted to deduct stock immediately upon Picklist creation, we would do it here.
            # Currently leaving stock as is, just tracking the picklist.
            
            
        # Create notifications for the Warehouse Admins involved
        for wh in warehouses_involved:
            if wh == 'DIS':
                continue
            c.execute("SELECT id FROM users WHERE role = 'warehouse_admin' AND warehouse_code = ?", (wh,))
            admins = c.fetchall()
            for admin in admins:
                c.execute('''
                    INSERT INTO notifications (target_user_id, title, message, related_entity_type, related_entity_id)
                    VALUES (?, ?, ?, ?, ?)
                ''', (admin['id'], 'New Transfer Request', f'Transfer Request #{picklist_id} requires stock transfer approval for warehouse {wh}.', 'picklist', picklist_id))
        
        # Calculate overall transfer status in case some or all were DIS
        c.execute("SELECT transfer_status FROM picklist_items WHERE picklist_id = ?", (picklist_id,))
        item_statuses = [row['transfer_status'] for row in c.fetchall()]
        if all(s == 'Possible' for s in item_statuses):
            overall_status = 'Transfer Decisions Made'
        else:
            overall_status = 'Pending Transfer Decision'
        c.execute("UPDATE picklists SET transfer_status = ? WHERE id = ?", (overall_status, picklist_id))
            
        c.execute("COMMIT")
        conn.commit()
        conn.close()
        return jsonify({"success": "Picklist created successfully", "picklist_id": picklist_id}), 201
        
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

@app.route('/api/picklists', methods=['GET'])
@login_required
def get_picklists():
    conn = get_db_connection()
    c = conn.cursor()
    
    # Get current user to determine role and warehouse filtering
    auth_header = request.headers.get('Authorization')
    token = auth_header.split(" ")[1] if auth_header else ""
    c.execute("SELECT user_id FROM sessions WHERE token = ?", (token,))
    session = c.fetchone()
    
    if not session:
        conn.close()
        return jsonify({"error": "Invalid session"}), 401
        
    c.execute("SELECT role, warehouse_code FROM users WHERE id = ?", (session['user_id'],))
    user = c.fetchone()
    
    if user and user['role'] == 'warehouse_admin':
        c.execute('''
            SELECT DISTINCT p.id, p.customer_id, p.invoice_number, p.status, p.created_at, p.transfer_status, p.transfer_rejection_reason, c.customer_name 
            FROM picklists p
            JOIN customers c ON p.customer_id = c.id
            JOIN picklist_items pi ON p.id = pi.picklist_id
            WHERE pi.warehouse = ?
            ORDER BY p.created_at DESC
        ''', (user['warehouse_code'],))
    else:
        c.execute('''
            SELECT p.id, p.customer_id, p.invoice_number, p.status, p.created_at, p.transfer_status, p.transfer_rejection_reason, c.customer_name 
            FROM picklists p
            JOIN customers c ON p.customer_id = c.id
            ORDER BY p.created_at DESC
        ''')
        
    picklists = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(picklists), 200

@app.route('/api/picklists/<int:id>', methods=['GET'])
@login_required
def get_picklist(id):
    conn = get_db_connection()
    c = conn.cursor()
    
    # Get picklist and customer details
    c.execute('''
        SELECT p.id, p.customer_id, p.invoice_number, p.status, p.created_at, p.transfer_status, p.transfer_rejection_reason, c.customer_name 
        FROM picklists p
        JOIN customers c ON p.customer_id = c.id
        WHERE p.id = ?
    ''', (id,))
    picklist = c.fetchone()
    
    if not picklist:
        conn.close()
        return jsonify({"error": "Picklist not found"}), 404
        
    # Get current user to determine role and warehouse filtering for items
    auth_header = request.headers.get('Authorization')
    token = auth_header.split(" ")[1] if auth_header else ""
    c.execute("SELECT user_id FROM sessions WHERE token = ?", (token,))
    session = c.fetchone()
    
    user = None
    if session:
        c.execute("SELECT role, warehouse_code FROM users WHERE id = ?", (session['user_id'],))
        user = c.fetchone()
        
    if user and user['role'] == 'warehouse_admin':
        c.execute('''
            SELECT pi.id as item_id, pi.part_number, pi.warehouse, pi.bin_location, pi.required_quantity,
                   pi.transfer_status, pi.transfer_rejection_reason, pi.actual_warehouse, pi.actual_bin_location,
                   i.item_name
            FROM picklist_items pi
            JOIN items i ON pi.part_number = i.part_number
            WHERE pi.picklist_id = ? AND pi.warehouse = ?
        ''', (id, user['warehouse_code']))
    else:
        c.execute('''
            SELECT pi.id as item_id, pi.part_number, pi.warehouse, pi.bin_location, pi.required_quantity,
                   pi.transfer_status, pi.transfer_rejection_reason, pi.actual_warehouse, pi.actual_bin_location,
                   i.item_name
            FROM picklist_items pi
            JOIN items i ON pi.part_number = i.part_number
            WHERE pi.picklist_id = ?
        ''', (id,))
        
    items = [dict(row) for row in c.fetchall()]
    
    conn.close()
    result = dict(picklist)
    result["items"] = items
    return jsonify(result), 200

@app.route('/api/picklists/<int:id>', methods=['PUT'])
@login_required
def update_picklist(id):
    data = request.json
    status = data.get('status', 'Pending')
    invoice_number = data.get('invoice_number')
    if invoice_number == '':
        invoice_number = None
    items = data.get('items', [])
    
    if not items or len(items) == 0:
        return jsonify({"error": "At least one item is required in the picklist"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    try:
        c.execute("SELECT id FROM picklists WHERE id = ?", (id,))
        if not c.fetchone():
            conn.close()
            return jsonify({"error": "Picklist not found"}), 404
            
        c.execute("BEGIN TRANSACTION")
        
        # 1. Update picklist status and invoice_number
        c.execute("UPDATE picklists SET status = ?, invoice_number = ? WHERE id = ?", (status, invoice_number, id))
        
        # 2. Delete existing items
        c.execute("DELETE FROM picklist_items WHERE picklist_id = ?", (id,))
        
        # 3. Insert new items and validate stock
        for item in items:
            part_number = item.get('part_number')
            warehouse = item.get('warehouse')
            bin_location = item.get('bin_location')
            required_quantity = item.get('required_quantity', 0)
            
            try:
                required_quantity = int(required_quantity)
            except ValueError:
                c.execute("ROLLBACK")
                conn.close()
                return jsonify({"error": f"Invalid quantity for {part_number}"}), 400
                
            if required_quantity <= 0:
                c.execute("ROLLBACK")
                conn.close()
                return jsonify({"error": f"Quantity must be greater than 0 for {part_number}"}), 400
                
            # Backend Validation: Check available quantity
            if bin_location is None:
                c.execute("SELECT quantity FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location IS NULL", 
                          (part_number, warehouse))
            else:
                c.execute("SELECT quantity FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
                          (part_number, warehouse, bin_location))
            stock = c.fetchone()
            
            if not stock:
                c.execute("ROLLBACK")
                conn.close()
                return jsonify({"error": f"Stock not found for {part_number} at {warehouse} - {bin_location}"}), 400
                
            available_qty = stock['quantity']
            if required_quantity > available_qty:
                c.execute("ROLLBACK")
                conn.close()
                return jsonify({"error": f"Required quantity ({required_quantity}) exceeds available ({available_qty}) for {part_number} at {warehouse} - {bin_location}"}), 400
                
            item_status = 'Possible' if warehouse == 'DIS' else 'Pending'
            c.execute('''
                INSERT INTO picklist_items (picklist_id, part_number, warehouse, bin_location, required_quantity, transfer_status)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (id, part_number, warehouse, bin_location, required_quantity, item_status))
            
        # Calculate overall transfer status
        c.execute("SELECT transfer_status FROM picklist_items WHERE picklist_id = ?", (id,))
        item_statuses = [row['transfer_status'] for row in c.fetchall()]
        
        overall_transfer_status = 'Pending Transfer Decision'
        if all(s == 'Possible' for s in item_statuses):
            overall_transfer_status = 'Transfer Decisions Made'
        elif any(s == 'Not Possible' for s in item_statuses):
            overall_transfer_status = 'Transfer Not Possible'
            
        c.execute("UPDATE picklists SET transfer_status = ? WHERE id = ?", (overall_transfer_status, id))
            
        c.execute("COMMIT")
        conn.commit()
        conn.close()
        return jsonify({"success": "Picklist updated successfully"}), 200
        
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

@app.route('/api/picklists/<int:id>', methods=['DELETE'])
@login_required
def delete_picklist(id):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM picklists WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Picklist deleted successfully"}), 200

@app.route('/api/picklists/<int:id>/status', methods=['PUT'])
@login_required
def update_picklist_status(id):
    if request.user['role'] != 'superadmin':
        return jsonify({"error": "Only superadmin can update picklist overall status"}), 403
        
    data = request.json
    status = data.get('status')
    if not status:
        return jsonify({"error": "Status is required"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("UPDATE picklists SET status = ? WHERE id = ?", (status, id))
    conn.commit()
    conn.close()
    
    return jsonify({"message": "Picklist status updated successfully", "status": status}), 200

# ==========================================
# Notifications and Decision Flow
# ==========================================

@app.route('/api/notifications', methods=['GET'])
@login_required
def get_notifications():
    conn = get_db_connection()
    c = conn.cursor()
    auth_header = request.headers.get('Authorization')
    token = auth_header.split(" ")[1] if auth_header else ""
    c.execute("SELECT user_id FROM sessions WHERE token = ?", (token,))
    session = c.fetchone()
    
    if not session:
        conn.close()
        return jsonify({"error": "Invalid session"}), 401
        
    c.execute("SELECT role FROM users WHERE id = ?", (session['user_id'],))
    user = c.fetchone()
    
    c.execute('''
        SELECT id, title, message, related_entity_type, related_entity_id, is_read, created_at 
        FROM notifications 
        WHERE target_role = ? OR target_user_id = ?
        ORDER BY created_at DESC
    ''', (user['role'], session['user_id']))
    notifications = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(notifications), 200

@app.route('/api/notifications/<int:id>/read', methods=['POST'])
@login_required
def mark_notification_read(id):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True}), 200

@app.route('/api/picklists/<int:id>/decision', methods=['POST'])
@login_required
def picklist_decision(id):
    data = request.json
    decision = data.get('decision')
    reason = data.get('reason', None)
    
    if decision not in ['possible', 'not_possible']:
        return jsonify({"error": "Invalid decision"}), 400
        
    if decision == 'not_possible' and not reason:
        return jsonify({"error": "Reason is required when transfer is not possible"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    status = 'Transfer Possible' if decision == 'possible' else 'Transfer Not Possible'
    
    c.execute('''
        UPDATE picklists 
        SET transfer_status = ?, transfer_rejection_reason = ? 
        WHERE id = ?
    ''', (status, reason, id))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "status": status}), 200

@app.route('/api/picklists/<int:picklist_id>/items/<int:item_id>/decision', methods=['POST'])
@login_required
def picklist_item_decision(picklist_id, item_id):
    data = request.json
    decision = data.get('decision')
    reason = data.get('reason', None)
    actual_warehouse = data.get('actual_warehouse', None)
    actual_bin_location = data.get('actual_bin_location', None)
    
    if decision not in ['possible', 'not_possible']:
        return jsonify({"error": "Invalid decision"}), 400
        
    if decision == 'not_possible' and not reason:
        return jsonify({"error": "Reason is required when transfer is not possible"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    status = 'Possible' if decision == 'possible' else 'Not Possible'
    
    c.execute('''
        UPDATE picklist_items 
        SET transfer_status = ?, transfer_rejection_reason = ?, actual_warehouse = ?, actual_bin_location = ?
        WHERE id = ? AND picklist_id = ?
    ''', (status, reason, actual_warehouse, actual_bin_location, item_id, picklist_id))
    
    # Update the overall picklist status based on its items
    c.execute("SELECT transfer_status FROM picklist_items WHERE picklist_id = ?", (picklist_id,))
    item_statuses = [row['transfer_status'] for row in c.fetchall()]
    
    pending_count = sum(1 for s in item_statuses if not s or s == 'Pending')
    rejected_count = sum(1 for s in item_statuses if s == 'Not Possible')
    
    if pending_count > 0:
        overall_transfer_status = 'Pending Transfer Decision'
        overall_status = 'Pending'
    else:
        if rejected_count > 0:
            overall_transfer_status = 'Transfer Not Possible'
            overall_status = 'Rejected'
        else:
            overall_transfer_status = 'Transfer Decisions Made'
            overall_status = 'Pending'
            
    c.execute("UPDATE picklists SET transfer_status = ?, status = ? WHERE id = ?", (overall_transfer_status, overall_status, picklist_id))
    
    conn.commit()
    conn.close()
    return jsonify({"success": True, "status": status, "overall_status": overall_transfer_status, "picklist_status": overall_status}), 200

# ==========================================
# Dispatch Picklists (New Picklist Feature)
# ==========================================

@app.route('/api/dispatch_picklists', methods=['GET'])
@login_required
def get_dispatch_picklists():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT dp.id, dp.customer_id, dp.invoice_number, dp.status, dp.created_at, dp.qc_approved_by, dp.qc_approved_at, c.customer_name 
        FROM dispatch_picklists dp
        JOIN customers c ON dp.customer_id = c.id
        ORDER BY dp.created_at DESC
    ''')
    picklists = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(picklists), 200

@app.route('/api/dispatch_picklists', methods=['POST'])
@login_required
def create_dispatch_picklist():
    data = request.json
    customer_id = data.get('customer_id')
    invoice_number = data.get('invoice_number')
    if invoice_number == '':
        invoice_number = None
    items = data.get('items', [])
    
    if not customer_id or not items:
        return jsonify({"error": "Customer and items are required"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()

    if invoice_number:
        c.execute("SELECT id FROM dispatch_picklists WHERE invoice_number = ?", (invoice_number,))
        if c.fetchone():
            conn.close()
            return jsonify({"error": f"Invoice number '{invoice_number}' already exists"}), 400

    try:
        c.execute("INSERT INTO dispatch_picklists (customer_id, invoice_number, status) VALUES (?, ?, 'Created')", (customer_id, invoice_number))
        picklist_id = c.lastrowid
        
        for item in items:
            part_number = item.get('part_number')
            warehouse = item.get('warehouse', 'DIS')
            bin_location = item.get('bin_location', '')
            batch_no = item.get('batch_no', '')
            expiry = item.get('expiry', '')
            qty = item.get('quantity', 0)
            
            # Check for stock
            c.execute("SELECT quantity FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
                      (part_number, warehouse, bin_location))
            stock = c.fetchone()
            
            if not stock or stock['quantity'] < qty:
                conn.rollback()
                conn.close()
                return jsonify({"error": f"Insufficient stock for {part_number} in {warehouse} - {bin_location}"}), 400
                
            # Deduct stock
            c.execute("UPDATE stock_balances SET quantity = quantity - ? WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
                      (qty, part_number, warehouse, bin_location))
            
            c.execute('''
                INSERT INTO dispatch_picklist_items 
                (dispatch_picklist_id, part_number, warehouse, bin_location, batch_no, expiry, quantity)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (picklist_id, part_number, warehouse, bin_location, batch_no, expiry, qty))
            
        transfer_request_id = data.get('transfer_request_id')
        if transfer_request_id:
            c.execute("UPDATE picklists SET status = 'Dispatched' WHERE id = ?", (transfer_request_id,))
            
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 500
        
    conn.close()
    return jsonify({"success": True, "picklist_id": picklist_id}), 201

@app.route('/api/dispatch_picklists/<int:id>/qc_approve', methods=['PUT'])
@login_required
def qc_approve_dispatch_picklist(id):
    data = request.json
    invoice_number = data.get('invoice_number')
    
    if not invoice_number:
        return jsonify({"error": "Invoice Number is required"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    try:
        c.execute("BEGIN TRANSACTION")
        
        c.execute("SELECT id, status FROM dispatch_picklists WHERE id = ?", (id,))
        picklist = c.fetchone()
        if not picklist:
            c.execute("ROLLBACK")
            conn.close()
            return jsonify({"error": "Picklist not found"}), 404
            
        if picklist['status'] == 'QC Approved':
            c.execute("ROLLBACK")
            conn.close()
            return jsonify({"error": "Picklist is already QC Approved"}), 400
            
        # Update picklist status and invoice number
        c.execute('''
            UPDATE dispatch_picklists 
            SET invoice_number = ?, status = 'QC Approved', qc_approved_by = ?, qc_approved_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        ''', (invoice_number, request.user['full_name'], id))
                  
        # Mark all items as qc verified
        c.execute("UPDATE dispatch_picklist_items SET qc_verified = 1 WHERE dispatch_picklist_id = ?", (id,))
        
        c.execute("COMMIT")
        conn.commit()
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": str(e)}), 500
        
    conn.close()
    return jsonify({"success": True}), 200

@app.route('/api/dispatch_picklists/<int:id>', methods=['GET'])
@login_required
def get_dispatch_picklist(id):
    conn = get_db_connection()
    c = conn.cursor()
    
    c.execute('''
        SELECT dp.id, dp.customer_id, dp.invoice_number, dp.status, dp.created_at, dp.qc_approved_by, dp.qc_approved_at, c.customer_name 
        FROM dispatch_picklists dp
        JOIN customers c ON dp.customer_id = c.id
        WHERE dp.id = ?
    ''', (id,))
    picklist = c.fetchone()
    
    if not picklist:
        conn.close()
        return jsonify({"error": "Picklist not found"}), 404
        
    c.execute('''
        SELECT pi.id, pi.part_number, pi.warehouse, pi.bin_location, pi.batch_no, pi.expiry, pi.quantity, pi.qc_verified, i.item_name
        FROM dispatch_picklist_items pi
        JOIN items i ON pi.part_number = i.part_number
        WHERE pi.dispatch_picklist_id = ?
    ''', (id,))
    items = [dict(row) for row in c.fetchall()]
    
    conn.close()
    result = dict(picklist)
    result["items"] = items
    return jsonify(result), 200

@app.route('/api/dispatch_picklists/<int:id>', methods=['DELETE'])
@login_required
def delete_dispatch_picklist(id):
    conn = get_db_connection()
    c = conn.cursor()
    try:
        c.execute("BEGIN TRANSACTION")
        
        c.execute("SELECT status FROM dispatch_picklists WHERE id = ?", (id,))
        picklist = c.fetchone()
        if not picklist:
            conn.close()
            return jsonify({"error": "Picklist not found"}), 404
            
        c.execute("DELETE FROM dispatch_picklists WHERE id = ?", (id,))
        
        c.execute("COMMIT")
        return jsonify({"success": "Picklist deleted successfully"}), 200
    except Exception as e:
        c.execute("ROLLBACK")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# --- SERVE FRONTEND (CATCH-ALL) ---
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    # Do not intercept API requests
    if path.startswith('api/'):
        return jsonify({"error": "Not found"}), 404
        
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        # Fallback to index.html for SPA routing
        if os.path.exists(os.path.join(app.static_folder, 'index.html')):
            return send_from_directory(app.static_folder, 'index.html')
        return "Frontend build not found.", 404


# --- INTERNAL TRANSFER REQUEST & TRANSFER INBOX API ---
@app.route('/api/internal-transfers/next-number', methods=['GET'])
@login_required
def get_next_internal_transfer_number():
    warehouse = request.args.get('warehouse', '')
        
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT tr_number FROM internal_transfer_requests ORDER BY id DESC LIMIT 1")
    row = c.fetchone()
    conn.close()
    
    next_num = 1
    if row:
        parts = row['tr_number'].split('-')
        if len(parts) >= 2 and parts[1].isdigit():
            next_num = int(parts[1]) + 1
            
    if warehouse:
        tr_number = f"TR-{next_num:04d}-{warehouse}"
    else:
        tr_number = f"TR-{next_num:04d}"
        
    return jsonify({"tr_number": tr_number}), 200

@app.route('/api/transfer-inbox', methods=['GET'])
@login_required
def get_transfer_inbox():
    user = request.user
    inbox_type = request.args.get('type', 'incoming')  # 'incoming' or 'outgoing'
    status_filter = request.args.get('status', '')
    
    conn = get_db_connection()
    c = conn.cursor()
    
    query = '''
        SELECT itr.id, itr.tr_number, itr.source_warehouse, itr.destination_warehouse,
               itr.created_by, itr.approved_by, itr.approved_at, itr.remarks, itr.status,
               itr.created_at, itr.updated_at,
               COUNT(itri.id) as total_items,
               COALESCE(SUM(itri.quantity), 0) as total_quantity
        FROM internal_transfer_requests itr
        LEFT JOIN internal_transfer_request_items itri ON itr.id = itri.request_id
    '''
    
    conditions = []
    params = []
    
    if user['role'] == 'warehouse_admin':
        wh = user.get('warehouse_code') or ''
        if inbox_type == 'outgoing':
            conditions.append("itr.source_warehouse = ?")
            params.append(wh)
        else:  # incoming
            conditions.append("itr.destination_warehouse = ?")
            params.append(wh)
    else:  # superadmin / admin
        wh_param = request.args.get('warehouse')
        if wh_param:
            if inbox_type == 'outgoing':
                conditions.append("itr.source_warehouse = ?")
                params.append(wh_param)
            else:
                conditions.append("itr.destination_warehouse = ?")
                params.append(wh_param)
            
    if status_filter:
        conditions.append("itr.status = ?")
        params.append(status_filter)
        
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
    query += " GROUP BY itr.id ORDER BY itr.created_at DESC"
    
    c.execute(query, params)
    rows = c.fetchall()
    transfers = [dict(r) for r in rows]
    
    # Items preview for each request
    for t in transfers:
        c.execute('''
            SELECT id, part_number, item_name, quantity, source_bin, target_bin, accepted_bin
            FROM internal_transfer_request_items
            WHERE request_id = ?
        ''', (t['id'],))
        t['items'] = [dict(i) for i in c.fetchall()]
        
    # Statistical counts
    wh_filter = user.get('warehouse_code') if user['role'] == 'warehouse_admin' else None
    
    if wh_filter:
        c.execute("SELECT COUNT(*) FROM internal_transfer_requests WHERE destination_warehouse = ? AND status = 'Pending Approval'", (wh_filter,))
        pending_incoming = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM internal_transfer_requests WHERE destination_warehouse = ?", (wh_filter,))
        total_incoming = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM internal_transfer_requests WHERE source_warehouse = ?", (wh_filter,))
        total_outgoing = c.fetchone()[0]
    else:
        c.execute("SELECT COUNT(*) FROM internal_transfer_requests WHERE status = 'Pending Approval'")
        pending_incoming = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM internal_transfer_requests")
        total_incoming = c.fetchone()[0]
        total_outgoing = total_incoming

    conn.close()
    return jsonify({
        "transfers": transfers,
        "counts": {
            "pending_incoming": pending_incoming,
            "total_incoming": total_incoming,
            "total_outgoing": total_outgoing
        }
    }), 200

@app.route('/api/transfer-inbox/unread-count', methods=['GET'])
@login_required
def get_transfer_inbox_unread_count():
    user = request.user
    conn = get_db_connection()
    c = conn.cursor()
    
    if user['role'] == 'warehouse_admin' and user.get('warehouse_code'):
        c.execute('''
            SELECT COUNT(*) FROM internal_transfer_requests 
            WHERE destination_warehouse = ? AND status = 'Pending Approval'
        ''', (user['warehouse_code'],))
    else:
        c.execute('''
            SELECT COUNT(*) FROM internal_transfer_requests 
            WHERE status = 'Pending Approval'
        ''')
    count = c.fetchone()[0]
    conn.close()
    return jsonify({"count": count}), 200

@app.route('/api/internal-transfers/<int:id>', methods=['GET'])
@login_required
def get_internal_transfer(id):
    conn = get_db_connection()
    c = conn.cursor()
    
    c.execute('''
        SELECT itr.*, 
               COUNT(itri.id) as total_items,
               COALESCE(SUM(itri.quantity), 0) as total_quantity
        FROM internal_transfer_requests itr
        LEFT JOIN internal_transfer_request_items itri ON itr.id = itri.request_id
        WHERE itr.id = ?
        GROUP BY itr.id
    ''', (id,))
    row = c.fetchone()
    
    if not row:
        conn.close()
        return jsonify({"error": "Transfer request not found"}), 404
        
    transfer = dict(row)
    
    c.execute('''
        SELECT id, request_id, part_number, item_name, quantity, source_bin, target_bin, accepted_bin, batch_no, expiry
        FROM internal_transfer_request_items
        WHERE request_id = ?
        ORDER BY id ASC
    ''', (id,))
    transfer['items'] = [dict(i) for i in c.fetchall()]
    
    # Destination bins: find all bins belonging to destination warehouse
    dest_wh = transfer.get('destination_warehouse') or ''
    available_bins = []
    if dest_wh:
        # Bins from bins table
        c.execute('''
            SELECT b.code 
            FROM bins b
            JOIN warehouses w ON b.warehouse_id = w.id
            WHERE w.code = ?
            ORDER BY b.code
        ''', (dest_wh,))
        bins_from_table = [r['code'] for r in c.fetchall()]
        
        # Bins from stock_balances
        c.execute('''
            SELECT DISTINCT bin_location 
            FROM stock_balances 
            WHERE warehouse = ? AND bin_location IS NOT NULL AND bin_location != ''
            ORDER BY bin_location
        ''', (dest_wh,))
        bins_from_stock = [r['bin_location'] for r in c.fetchall()]
        
        available_bins = sorted(list(set(bins_from_table + bins_from_stock)))
        
    transfer['available_bins'] = available_bins
    
    conn.close()
    return jsonify(transfer), 200

@app.route('/api/internal-transfers/submit', methods=['POST'])
@login_required
def submit_internal_transfer():
    data = request.json or {}
    tr_number = data.get('tr_number')
    source_warehouse = data.get('source_warehouse', '').strip()
    destination_warehouse = data.get('destination_warehouse', '').strip()
    remarks = data.get('remarks', 'Inter-Warehouse Stock Transfer').strip()
    items = data.get('items', [])
    
    if not source_warehouse or not destination_warehouse or not items:
        return jsonify({"error": "Source warehouse, destination warehouse, and items are required"}), 400
        
    if source_warehouse == destination_warehouse:
        return jsonify({"error": "Destination warehouse must be different from source warehouse for inter-warehouse transfer requests."}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    try:
        c.execute("BEGIN TRANSACTION")
        
        # Validate stock availability at source warehouse & bin for all items
        for item in items:
            p_num = item.get('part_number', '').strip().upper()
            s_bin = item.get('source_bin', '').strip()
            qty = int(item.get('quantity', 0))
            
            if not p_num or not s_bin or qty <= 0:
                c.execute("ROLLBACK")
                conn.close()
                return jsonify({"error": f"Invalid item details for {p_num}. Positive quantity and source bin are required."}), 400
                
            c.execute("SELECT quantity FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
                      (p_num, source_warehouse, s_bin))
            stock_row = c.fetchone()
            if not stock_row or stock_row['quantity'] < qty:
                avail = stock_row['quantity'] if stock_row else 0
                c.execute("ROLLBACK")
                conn.close()
                return jsonify({"error": f"Insufficient stock for {p_num} in {source_warehouse} (Bin: {s_bin}). Available: {avail}, Requested: {qty}"}), 400
                
            # Deduct stock immediately from source warehouse and bin (put into in-transit)
            new_qty = stock_row['quantity'] - qty
            if new_qty == 0:
                c.execute("DELETE FROM stock_balances WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
                          (p_num, source_warehouse, s_bin))
            else:
                c.execute("UPDATE stock_balances SET quantity = ? WHERE part_number = ? AND warehouse = ? AND bin_location = ?", 
                          (new_qty, p_num, source_warehouse, s_bin))
                          
        # Generate TR Number if not supplied
        if not tr_number:
            c.execute("SELECT tr_number FROM internal_transfer_requests ORDER BY id DESC LIMIT 1")
            last_row = c.fetchone()
            next_num = 1
            if last_row:
                parts = last_row['tr_number'].split('-')
                if len(parts) >= 2 and parts[1].isdigit():
                    next_num = int(parts[1]) + 1
            tr_number = f"TR-{next_num:04d}-{source_warehouse}"
            
        # Insert into internal_transfer_requests
        c.execute('''
            INSERT INTO internal_transfer_requests 
            (tr_number, source_warehouse, destination_warehouse, created_by, status, remarks)
            VALUES (?, ?, ?, ?, 'Pending Approval', ?)
        ''', (tr_number, source_warehouse, destination_warehouse, request.user['full_name'], remarks))
        request_id = c.lastrowid
        
        # Insert items
        for item in items:
            c.execute('''
                INSERT INTO internal_transfer_request_items 
                (request_id, part_number, item_name, quantity, source_bin, target_bin, batch_no, expiry)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                request_id,
                item.get('part_number', '').strip().upper(),
                item.get('item_name', '').strip(),
                int(item.get('quantity', 0)),
                item.get('source_bin', '').strip(),
                item.get('target_bin', '').strip() if item.get('target_bin') else None,
                item.get('batch_no', ''),
                item.get('expiry', '')
            ))
            
        # Create notifications for Warehouse Admin(s) of destination_warehouse
        c.execute("SELECT id FROM users WHERE role = 'warehouse_admin' AND warehouse_code = ?", (destination_warehouse,))
        dest_admins = c.fetchall()
        for admin in dest_admins:
            c.execute('''
                INSERT INTO notifications (target_user_id, title, message, related_entity_type, related_entity_id)
                VALUES (?, ?, ?, 'transfer_request', ?)
            ''', (
                admin['id'],
                'New Transfer Request',
                f'Transfer Request {tr_number} from {source_warehouse} ({len(items)} items) is awaiting your approval in Transfer Inbox.',
                request_id
            ))
            
        c.execute("COMMIT")
        conn.commit()
        conn.close()
        
        return jsonify({
            "success": True, 
            "id": request_id, 
            "tr_number": tr_number,
            "message": f"Transfer Request {tr_number} sent to {destination_warehouse} for approval."
        }), 201
        
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to submit transfer request: {str(e)}"}), 500

@app.route('/api/internal-transfers/<int:id>/accept', methods=['POST'])
@login_required
def accept_internal_transfer(id):
    data = request.json or {}
    items_allocation = data.get('items', [])  # [{ id: itemId, accepted_bin: 'BIN-1' }, ...]
    acceptance_remarks = data.get('remarks', '').strip()
    
    conn = get_db_connection()
    c = conn.cursor()
    
    try:
        c.execute("SELECT * FROM internal_transfer_requests WHERE id = ?", (id,))
        req_row = c.fetchone()
        if not req_row:
            conn.close()
            return jsonify({"error": "Transfer request not found"}), 404
            
        if req_row['status'] == 'Accepted':
            conn.close()
            return jsonify({"error": "This transfer request has already been accepted."}), 400
            
        if req_row['status'] == 'Rejected':
            conn.close()
            return jsonify({"error": "This transfer request has been rejected."}), 400
            
        dest_wh = req_row['destination_warehouse']
        
        # Authorization check: must be admin of destination_warehouse or superadmin
        if request.user['role'] == 'warehouse_admin' and request.user.get('warehouse_code') != dest_wh:
            conn.close()
            return jsonify({"error": f"Unauthorized. Only warehouse admins for {dest_wh} can approve this transfer."}), 403
            
        # Fetch items
        c.execute("SELECT * FROM internal_transfer_request_items WHERE request_id = ?", (id,))
        items = c.fetchall()
        
        if not items:
            conn.close()
            return jsonify({"error": "No items found for this transfer request"}), 400
            
        # Map item allocations
        alloc_map = {}
        for alloc in items_allocation:
            alloc_map[alloc.get('id')] = (alloc.get('accepted_bin') or '').strip().upper()
            
        # Validate that all items have an accepted_bin
        for item in items:
            accepted_bin = alloc_map.get(item['id']) or (item['target_bin'] or '').strip().upper()
            if not accepted_bin:
                conn.close()
                return jsonify({"error": f"Please select a destination bin for item {item['part_number']} ({item['item_name']})."}), 400
                
        c.execute("BEGIN TRANSACTION")
        
        vouchers = []
        for item in items:
            accepted_bin = alloc_map.get(item['id']) or (item['target_bin'] or '').strip().upper()
            qty = item['quantity']
            part_number = item['part_number']
            batch_no = item['batch_no'] or ''
            expiry = item['expiry'] or ''
            
            # Update accepted_bin in item record
            c.execute("UPDATE internal_transfer_request_items SET accepted_bin = ? WHERE id = ?", (accepted_bin, item['id']))
            
            # Allocate stock into destination warehouse and accepted_bin
            c.execute('''
                SELECT quantity FROM stock_balances 
                WHERE part_number = ? AND warehouse = ? AND bin_location = ? AND batch_no = ?
            ''', (part_number, dest_wh, accepted_bin, batch_no))
            dest_stock = c.fetchone()
            
            if dest_stock:
                c.execute('''
                    UPDATE stock_balances 
                    SET quantity = quantity + ? 
                    WHERE part_number = ? AND warehouse = ? AND bin_location = ? AND batch_no = ?
                ''', (qty, part_number, dest_wh, accepted_bin, batch_no))
            else:
                c.execute('''
                    INSERT INTO stock_balances (part_number, warehouse, bin_location, quantity, batch_no, expiry)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (part_number, dest_wh, accepted_bin, qty, batch_no, expiry))
                
            # Log in stock_journal
            voucher = generate_voucher_number("STJ-TRF")
            vouchers.append(voucher)
            log_remarks = f"Transfer Accepted: {req_row['tr_number']}"
            if acceptance_remarks:
                log_remarks += f" - {acceptance_remarks}"
                
            c.execute('''
                INSERT INTO stock_journal 
                (voucher_number, transaction_type, part_number, quantity, from_warehouse, from_bin, to_warehouse, to_bin, user_name, remarks)
                VALUES (?, 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                voucher,
                part_number,
                qty,
                req_row['source_warehouse'],
                item['source_bin'],
                dest_wh,
                accepted_bin,
                request.user['full_name'],
                log_remarks
            ))
            
        # Update transfer request record
        c.execute('''
            UPDATE internal_transfer_requests 
            SET status = 'Accepted', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (request.user['full_name'], id))
        
        # Notify the creator / source warehouse admin
        creator_name = req_row['created_by']
        c.execute("SELECT id FROM users WHERE full_name = ? OR username = ?", (creator_name, creator_name))
        creator_user = c.fetchone()
        target_uid = creator_user['id'] if creator_user else None
        
        c.execute('''
            INSERT INTO notifications (target_user_id, target_role, title, message, related_entity_type, related_entity_id)
            VALUES (?, 'warehouse_admin', ?, ?, 'transfer_request', ?)
        ''', (
            target_uid,
            'Transfer Accepted',
            f'Transfer {req_row["tr_number"]} has been accepted by {request.user["full_name"]} and allocated into {dest_wh}.',
            id
        ))
        
        # Mark all pending notifications for this transfer as read for current user
        c.execute('''
            UPDATE notifications 
            SET is_read = 1 
            WHERE related_entity_type = 'transfer_request' AND related_entity_id = ?
        ''', (id,))
        
        c.execute("COMMIT")
        conn.commit()
        conn.close()
        
        return jsonify({
            "success": True, 
            "message": f"Transfer {req_row['tr_number']} accepted! Stock successfully allocated to {dest_wh}.",
            "vouchers": vouchers
        }), 200
        
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to accept transfer: {str(e)}"}), 500

@app.route('/api/internal-transfers/<int:id>/reject', methods=['POST'])
@login_required
def reject_internal_transfer(id):
    data = request.json or {}
    reason = data.get('reason', 'Transfer rejected by recipient').strip()
    
    conn = get_db_connection()
    c = conn.cursor()
    
    try:
        c.execute("SELECT * FROM internal_transfer_requests WHERE id = ?", (id,))
        req_row = c.fetchone()
        if not req_row:
            conn.close()
            return jsonify({"error": "Transfer request not found"}), 404
            
        if req_row['status'] != 'Pending Approval':
            conn.close()
            return jsonify({"error": f"Cannot reject transfer with status '{req_row['status']}'"}), 400
            
        dest_wh = req_row['destination_warehouse']
        if request.user['role'] == 'warehouse_admin' and request.user.get('warehouse_code') != dest_wh:
            conn.close()
            return jsonify({"error": f"Unauthorized. Only warehouse admins for {dest_wh} can reject this transfer."}), 403
            
        c.execute("SELECT * FROM internal_transfer_request_items WHERE request_id = ?", (id,))
        items = c.fetchall()
        
        c.execute("BEGIN TRANSACTION")
        
        # Return deducted stock back to source warehouse and source bin
        for item in items:
            p_num = item['part_number']
            qty = item['quantity']
            s_wh = req_row['source_warehouse']
            s_bin = item['source_bin']
            batch_no = item['batch_no'] or ''
            expiry = item['expiry'] or ''
            
            c.execute('''
                SELECT quantity FROM stock_balances 
                WHERE part_number = ? AND warehouse = ? AND bin_location = ? AND batch_no = ?
            ''', (p_num, s_wh, s_bin, batch_no))
            s_stock = c.fetchone()
            
            if s_stock:
                c.execute('''
                    UPDATE stock_balances 
                    SET quantity = quantity + ? 
                    WHERE part_number = ? AND warehouse = ? AND bin_location = ? AND batch_no = ?
                ''', (qty, p_num, s_wh, s_bin, batch_no))
            else:
                c.execute('''
                    INSERT INTO stock_balances (part_number, warehouse, bin_location, quantity, batch_no, expiry)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (p_num, s_wh, s_bin, qty, batch_no, expiry))
                
        c.execute('''
            UPDATE internal_transfer_requests 
            SET status = 'Rejected', remarks = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (f"Rejected: {reason}", request.user['full_name'], id))
        
        # Notify creator
        c.execute('''
            INSERT INTO notifications (target_role, title, message, related_entity_type, related_entity_id)
            VALUES ('warehouse_admin', 'Transfer Rejected', ?, 'transfer_request', ?)
        ''', (f"Transfer {req_row['tr_number']} was rejected by {request.user['full_name']}: {reason}. Stock returned to {req_row['source_warehouse']}.", id))
        
        c.execute("COMMIT")
        conn.commit()
        conn.close()
        
        return jsonify({"success": True, "message": "Transfer rejected and stock returned to source warehouse."}), 200
        
    except Exception as e:
        c.execute("ROLLBACK")
        conn.close()
        return jsonify({"error": f"Failed to reject transfer: {str(e)}"}), 500

@app.route('/api/internal-transfers', methods=['POST'])
@login_required
def create_internal_transfer():
    data = request.json
    tr_number = data.get('tr_number')
    source_warehouse = data.get('source_warehouse')
    destination_warehouse = data.get('destination_warehouse')
    items = data.get('items', [])
    
    if not tr_number or not source_warehouse or not items:
        return jsonify({"error": "Missing required fields"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    try:
        c.execute("BEGIN TRANSACTION")
        c.execute('''
            INSERT INTO internal_transfer_requests (tr_number, source_warehouse, destination_warehouse, status)
            VALUES (?, ?, ?, 'Draft')
        ''', (tr_number, source_warehouse, destination_warehouse))
        
        request_id = c.lastrowid
        
        for item in items:
            c.execute('''
                INSERT INTO internal_transfer_request_items (request_id, part_number, item_name, quantity, source_bin, target_bin)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (request_id, item['part_number'], item['item_name'], item['quantity'], item['source_bin'], item.get('target_bin')))
            
        c.execute("COMMIT")
        conn.close()
        
        return jsonify({"success": True, "id": request_id, "tr_number": tr_number}), 201
        
    except sqlite3.IntegrityError:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Transfer Request number {tr_number} already exists. Please refresh to get a new number."}), 400
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 500

@app.route('/api/internal-transfers/<int:id>', methods=['PUT'])
@login_required
def update_internal_transfer(id):
    data = request.json
    items = data.get('items', [])
    destination_warehouse = data.get('destination_warehouse')
    
    if not items:
        return jsonify({"error": "Missing items"}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    try:
        c.execute("BEGIN TRANSACTION")
        
        c.execute("DELETE FROM internal_transfer_request_items WHERE request_id = ?", (id,))
        
        for item in items:
            c.execute('''
                INSERT INTO internal_transfer_request_items (request_id, part_number, item_name, quantity, source_bin, target_bin)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (id, item['part_number'], item['item_name'], item['quantity'], item['source_bin'], item.get('target_bin')))
            
        if destination_warehouse:
            c.execute("UPDATE internal_transfer_requests SET destination_warehouse = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (destination_warehouse, id))
        else:
            c.execute("UPDATE internal_transfer_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (id,))
        
        c.execute("COMMIT")
        conn.close()
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 500

# --- DATABASE MAINTENANCE & SYSTEM RESET (SUPERADMIN ONLY) ---
@app.route('/api/admin/db-stats', methods=['GET'])
@login_required
def get_db_stats():
    if request.user["role"] != "superadmin":
        return jsonify({"error": "Unauthorized. Only superadmin can access system statistics."}), 403
    
    conn = get_db_connection()
    c = conn.cursor()
    
    def count_table(table_name):
        try:
            c.execute(f"SELECT COUNT(*) FROM {table_name}")
            return c.fetchone()[0]
        except Exception:
            return 0
            
    stats = {
        "items": count_table("items"),
        "stock_balances": count_table("stock_balances"),
        "stock_journal": count_table("stock_journal"),
        "warehouses": count_table("warehouses"),
        "bins": count_table("bins"),
        "customers": count_table("customers"),
        "picklists": count_table("picklists"),
        "picklist_items": count_table("picklist_items"),
        "dispatch_picklists": count_table("dispatch_picklists"),
        "dispatch_picklist_items": count_table("dispatch_picklist_items"),
        "internal_transfer_requests": count_table("internal_transfer_requests"),
        "internal_transfer_request_items": count_table("internal_transfer_request_items"),
        "notifications": count_table("notifications"),
        "users": count_table("users"),
    }
    
    # Check superadmin details
    c.execute("SELECT id, username, full_name, role FROM users WHERE role = 'superadmin' OR username = 'superadmin' LIMIT 1")
    sa = c.fetchone()
    superadmin_info = dict(sa) if sa else None
    
    conn.close()
    
    # DB File Size
    db_size_bytes = os.path.getsize(DB_NAME) if os.path.exists(DB_NAME) else 0
    db_size_mb = round(db_size_bytes / (1024 * 1024), 2)
    
    # Uploaded files count and size
    upload_files_count = 0
    upload_size_bytes = 0
    if os.path.exists(UPLOAD_FOLDER):
        for f in os.listdir(UPLOAD_FOLDER):
            fp = os.path.join(UPLOAD_FOLDER, f)
            if os.path.isfile(fp):
                upload_files_count += 1
                upload_size_bytes += os.path.getsize(fp)
    upload_size_mb = round(upload_size_bytes / (1024 * 1024), 2)
    
    return jsonify({
        "stats": stats,
        "db_size_mb": db_size_mb,
        "upload_files_count": upload_files_count,
        "upload_size_mb": upload_size_mb,
        "superadmin": superadmin_info,
        "db_path": DB_NAME
    }), 200

@app.route('/api/admin/clear-database', methods=['POST'])
def clear_database_endpoint():
    data = request.json or {}
    current_password = data.get("current_password")
    new_password = data.get("new_password")
    
    # Check auth: either via session token or direct credentials
    user = get_current_user()
    if not user:
        # Check credentials in body
        username = data.get("username", "").strip().lower()
        if not username or not current_password:
            return jsonify({"error": "Authentication required. Please provide superadmin credentials."}), 401
        
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE username = ?", (username,))
        u = c.fetchone()
        conn.close()
        
        if not u or u["role"] != "superadmin":
            return jsonify({"error": "Unauthorized. Only superadmin can clear database."}), 403
        if not bcrypt.checkpw(current_password.encode('utf-8'), u["password_hash"].encode('utf-8')):
            return jsonify({"error": "Invalid superadmin password."}), 401
        
        user_id = u["id"]
        user_name = u["username"]
        superadmin_row = u
    else:
        if user["role"] != "superadmin":
            return jsonify({"error": "Unauthorized. Only superadmin can clear database."}), 403
            
        if not current_password:
            return jsonify({"error": "Please provide your current superadmin password to confirm."}), 400
            
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
        superadmin_row = c.fetchone()
        conn.close()
        
        if not superadmin_row or not bcrypt.checkpw(current_password.encode('utf-8'), superadmin_row["password_hash"].encode('utf-8')):
            return jsonify({"error": "Invalid current superadmin password. Operation aborted."}), 401
            
        user_id = superadmin_row["id"]
        user_name = superadmin_row["username"]

    # Validate new password if provided
    if new_password:
        if len(new_password) < 6:
            return jsonify({"error": "New password must be at least 6 characters long."}), 400

    conn = get_db_connection()
    c = conn.cursor()
    
    try:
        # Disable foreign keys temporarily
        c.execute("PRAGMA foreign_keys = OFF")
        
        # Tables to clear
        tables_to_clear = [
            "stock_journal",
            "stock_balances",
            "dispatch_picklist_items",
            "dispatch_picklists",
            "picklist_items",
            "picklists",
            "internal_transfer_request_items",
            "internal_transfer_requests",
            "notifications",
            "items",
            "bins",
            "warehouses",
            "customers"
        ]
        
        cleared_summary = {}
        for table in tables_to_clear:
            try:
                c.execute(f"SELECT COUNT(*) FROM {table}")
                cnt = c.fetchone()[0]
                c.execute(f"DELETE FROM {table}")
                cleared_summary[table] = cnt
            except Exception as e:
                cleared_summary[table] = 0
                
        # Preserve superadmin: delete all non-superadmin users
        c.execute("SELECT COUNT(*) FROM users WHERE id != ?", (user_id,))
        users_deleted = c.fetchone()[0]
        c.execute("DELETE FROM users WHERE id != ?", (user_id,))
        cleared_summary["other_users"] = users_deleted
        
        # Delete sessions of deleted users
        c.execute("DELETE FROM sessions WHERE user_id != ?", (user_id,))
        
        # Reset autoincrement counters in sqlite_sequence
        for table in tables_to_clear:
            try:
                c.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))
            except Exception:
                pass
                
        # Update superadmin password if requested
        password_updated = False
        if new_password:
            new_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            c.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
            password_updated = True
            
        # Re-enable foreign keys
        c.execute("PRAGMA foreign_keys = ON")
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Failed to clear database: {str(e)}"}), 500
        
    conn.close()
    
    # Reclaim disk space with VACUUM
    try:
        vac_conn = sqlite3.connect(DB_NAME)
        vac_conn.execute("VACUUM")
        vac_conn.close()
    except Exception as e:
        print(f"VACUUM note: {e}")
        
    # Clean up uploaded files in UPLOAD_FOLDER
    files_deleted = 0
    if os.path.exists(UPLOAD_FOLDER):
        for fname in os.listdir(UPLOAD_FOLDER):
            fpath = os.path.join(UPLOAD_FOLDER, fname)
            if os.path.isfile(fpath):
                try:
                    os.remove(fpath)
                    files_deleted += 1
                except Exception:
                    pass
    cleared_summary["uploaded_files"] = files_deleted
    
    return jsonify({
        "success": True,
        "message": "All database business data has been successfully cleared. Superadmin credentials preserved.",
        "password_updated": password_updated,
        "cleared_summary": cleared_summary,
        "superadmin_username": user_name
    }), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
