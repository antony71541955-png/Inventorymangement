import sqlite3
import os

DB_NAME = "inventory.db"

def clear_inventory():
    if not os.path.exists(DB_NAME):
        print(f"Database {DB_NAME} not found.")
        return

    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    
    try:
        # Enable foreign keys so cascading deletes work
        c.execute("PRAGMA foreign_keys = ON")
        
        print("Clearing inventory tables...")
        
        # Delete from stock_journal first (no cascading deletes)
        c.execute("DELETE FROM stock_journal")
        print("- Cleared stock_journal")
        
        # Delete from stock_balances (no cascading deletes)
        c.execute("DELETE FROM stock_balances")
        print("- Cleared stock_balances")
        
        # Delete from picklist_items and picklists
        c.execute("DELETE FROM picklist_items")
        c.execute("DELETE FROM picklists")
        print("- Cleared picklists and transfer requests")
        
        # Delete from items (this would cascade delete stock_balances and picklist_items if they weren't already deleted)
        c.execute("DELETE FROM items")
        print("- Cleared items")
        
        conn.commit()
        print("\nSuccessfully cleared all inventory data!")
        
    except Exception as e:
        conn.rollback()
        print(f"\nError clearing database: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    confirm = input("WARNING: This will permanently delete all inventory items, stock balances, and transfer logs. Type 'YES' to continue: ")
    if confirm == "YES":
        clear_inventory()
    else:
        print("Operation cancelled.")
