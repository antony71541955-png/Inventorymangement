import sys
import getpass
import json
import urllib.request
import urllib.error

def clear_render_db():
    print("=" * 65)
    print(" RENDER DATABASE CLEAR & SUPERADMIN PASSWORD UPDATE TOOL")
    print("=" * 65)
    print("This tool connects to your deployed backend on Render")
    print("and wipes all business data while preserving your superadmin account.")
    print("=" * 65)
    
    render_url = input("Enter your Render Backend URL (e.g. https://apex-wms-backend.onrender.com): ").strip()
    if not render_url:
        print("Render URL is required.")
        return
        
    render_url = render_url.rstrip("/")
    if not render_url.startswith("http://") and not render_url.startswith("https://"):
        render_url = "https://" + render_url

    username = input("Superadmin Username [superadmin]: ").strip() or "superadmin"
    current_password = getpass.getpass("Current Superadmin Password: ")
    if not current_password:
        print("Current password is required.")
        return

    update_pwd = input("Do you want to update the Superadmin password? (y/n) [n]: ").strip().lower()
    new_password = None
    if update_pwd == 'y':
        new_password = getpass.getpass("Enter New Superadmin Password (min 6 characters): ")
        confirm_pwd = getpass.getpass("Confirm New Superadmin Password: ")
        if new_password != confirm_pwd:
            print("Passwords do not match. Aborting.")
            return
        if len(new_password) < 6:
            print("New password must be at least 6 characters.")
            return

    print("\nWARNING: This will permanently delete ALL data on Render:")
    print("  - All Items & Inventory balances")
    print("  - All Stock Journal & Audit logs")
    print("  - All Picklists & Transfer requests")
    print("  - All Warehouses, Bins & Customers")
    print("  - All non-superadmin users")
    print("  - Only superadmin credentials will be kept.")
    
    confirm = input("\nType 'CLEAR' to confirm and execute: ").strip()
    if confirm != "CLEAR":
        print("Aborted.")
        return

    payload = {
        "username": username,
        "current_password": current_password
    }
    if new_password:
        payload["new_password"] = new_password

    endpoint = f"{render_url}/api/admin/clear-database"
    print(f"\nSending clear request to {endpoint}...")
    
    try:
        data_bytes = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            endpoint, 
            data=data_bytes, 
            headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp_body = resp.read().decode('utf-8')
            res = json.loads(resp_body)
            print("\nSUCCESS!")
            print(res.get("message", "Database cleared successfully."))
            if res.get("password_updated"):
                print(">>> Superadmin password has been updated! Use your new password to log in.")
            print("\nCleared Data Breakdown:")
            for k, v in res.get("cleared_summary", {}).items():
                print(f"  - {k}: {v} records removed")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        try:
            err_json = json.loads(err_msg)
            print(f"\nError ({e.code}): {err_json.get('error', err_msg)}")
        except Exception:
            print(f"\nError ({e.code}): {err_msg}")
    except Exception as e:
        print(f"\nConnection failed: {e}")
        print("Please ensure your Render service is deployed with the updated code and is online.")

if __name__ == "__main__":
    clear_render_db()
