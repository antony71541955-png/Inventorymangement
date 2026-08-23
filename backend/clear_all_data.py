import os
import sqlite3
from app import init_db

def clear_all_data():
    db_file = 'inventory.db'
    
    # Check if the database file exists
    if os.path.exists(db_file):
        try:
            # Delete the database file
            os.remove(db_file)
            print(f"Successfully deleted {db_file}")
        except Exception as e:
            print(f"Error deleting {db_file}: {e}")
            print("Please make sure the backend server is stopped before running this script if you get a 'file in use' error.")
            return

    # Re-initialize the database using the function from app.py
    try:
        init_db()
        print("Successfully re-initialized the database with empty tables.")
    except Exception as e:
        print(f"Error initializing the database: {e}")

if __name__ == "__main__":
    confirm = input("Are you sure you want to clear all data? This cannot be undone. (y/n): ")
    if confirm.lower() == 'y':
        clear_all_data()
        print("Data clearing complete.")
    else:
        print("Operation cancelled.")
