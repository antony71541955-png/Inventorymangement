import os
import sqlite3
import bcrypt

_data_dir = "/data" if os.path.isdir("/data") else os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(_data_dir, "inventory.db")
UPLOAD_FOLDER = os.path.join(_data_dir, "uploads")

def clear_all_data(new_superadmin_password=None):
    if not os.path.exists(DB_NAME):
        print(f"Database {DB_NAME} not found.")
        return False

    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    try:
        c.execute("PRAGMA foreign_keys = OFF")

        # Find superadmin
        c.execute("SELECT id, username FROM users WHERE role = 'superadmin' OR username = 'superadmin' LIMIT 1")
        sa = c.fetchone()
        if not sa:
            print("Notice: No superadmin account found. Default superadmin will be created.")
            sa_id = None
        else:
            sa_id = sa["id"]
            print(f"Found superadmin account: '{sa['username']}' (ID: {sa_id}) - Preserving credentials.")

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

        print("Clearing tables...")
        for table in tables_to_clear:
            try:
                c.execute(f"DELETE FROM {table}")
                print(f" - Cleared {table}")
            except Exception as e:
                print(f" - Error clearing {table}: {e}")

        # Preserve superadmin user
        if sa_id:
            c.execute("DELETE FROM users WHERE id != ?", (sa_id,))
            c.execute("DELETE FROM sessions WHERE user_id != ?", (sa_id,))
            print(" - Cleared all non-superadmin users and their sessions")
        else:
            c.execute("DELETE FROM users")
            c.execute("DELETE FROM sessions")
            hashed = bcrypt.hashpw("superadmin123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            c.execute("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
                      ('superadmin', hashed, 'Super Administrator', 'superadmin'))
            sa_id = c.lastrowid
            print(" - Created default superadmin account")

        # Reset sequences
        for table in tables_to_clear:
            try:
                c.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))
            except Exception:
                pass

        # Update superadmin password if requested
        if new_superadmin_password:
            new_hash = bcrypt.hashpw(new_superadmin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            c.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, sa_id))
            print(" - Successfully updated superadmin password!")

        c.execute("PRAGMA foreign_keys = ON")
        conn.commit()
        conn.close()

        # Vacuum database
        try:
            vac = sqlite3.connect(DB_NAME)
            vac.execute("VACUUM")
            vac.close()
            print(" - Reclaimed database storage with VACUUM")
        except Exception as e:
            print(f" - Note on VACUUM: {e}")

        # Clean uploads
        if os.path.exists(UPLOAD_FOLDER):
            deleted_files = 0
            for fname in os.listdir(UPLOAD_FOLDER):
                fpath = os.path.join(UPLOAD_FOLDER, fname)
                if os.path.isfile(fpath):
                    try:
                        os.remove(fpath)
                        deleted_files += 1
                    except Exception:
                        pass
            print(f" - Cleaned {deleted_files} files from uploads directory")

        print("\nAll database data cleared successfully! Superadmin credentials preserved.")
        return True

    except Exception as e:
        conn.rollback()
        conn.close()
        print(f"Error during data clearing: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print(" DATABASE CLEAR UTILITY (PRESERVES SUPERADMIN)")
    print("=" * 60)
    print("This will permanently delete all inventory, balances, logs,")
    print("customers, warehouses, bins, and non-superadmin users.")
    print("=" * 60)
    confirm = input("Type 'CLEAR' to proceed: ")
    if confirm.strip() == "CLEAR":
        pwd = input("Enter new password for superadmin (or press Enter to keep current): ").strip()
        clear_all_data(new_superadmin_password=pwd if pwd else None)
    else:
        print("Operation cancelled.")
