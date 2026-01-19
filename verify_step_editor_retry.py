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
            # Check if "Create Sample" button is present, if not create new project
            create_sample_btn = page.get_by_role("button", name="Create Sample")
            if create_sample_btn.count() > 0 and create_sample_btn.is_visible():
                create_sample_btn.click()
            else:
                # Assuming "Create New Project" or "+"
                page.get_by_text("+").click()
                # If new project, we need to add set and step
                page.get_by_text("Add Exercise Set").click()
                page.get_by_text("Add Step").click()
                # Now navigate back? Or we are in list.
                # Actually Add Set -> Edit Project -> Add Step -> Edit Set.
                # Let's rely on Sample if possible, or force create flow.

            # Wait for project list update
            # If sample created, we see "Sample Mobility"
            # If new project created, we are likely in Project Editor.

            # Let's handle the "New Project" case if Sample fails
            # But "Create Sample" is reliable on fresh load.

            # Wait for text "Mobility Flow" or navigate
            # Assuming Sample Created:
            # Click project
            page.get_by_text("Sample Mobility").click()

            # Click Set
            page.get_by_text("Mobility Flow").click()

            # Click Step
            page.get_by_text("Cat/Cow").click()

            page.wait_for_selector("text=Edit Step")

            # Screenshot Step Editor
            page.screenshot(path="verification_step_editor_retry.png")
            print("Step Editor screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="debug_error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
