from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:8080")
            page.wait_for_load_state("networkidle")
            page.wait_for_selector(".nav-title")

            # Navigate to Step Editor (requires creating/navigating project)
            # 1. Create Sample
            page.get_by_text("Create Sample").click()
            page.wait_for_selector("text=Sample Mobility")

            # 2. Click on the first Set
            page.get_by_text("Mobility Flow").click()
            page.wait_for_selector("text=Edit Set")

            # 3. Click on the first Step
            page.get_by_text("Cat/Cow").click()
            page.wait_for_selector("text=Edit Step")

            # Screenshot Step Editor
            page.screenshot(path="verification_step_editor.png")
            print("Step Editor screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
